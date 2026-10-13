// Offline converter tests. Run: node --test scripts/issue-build/to-bundle.test.js
// Fixtures live in memory: no temporary files, credentials or network access.
'use strict';
const assert=require('node:assert/strict'), path=require('node:path'), crypto=require('node:crypto');
const {test}=require('node:test'), {spawnSync}=require('node:child_process');
const d=require('./to-bundle.js'), producer=require('./issueBuild.js');
const LABELS=['For Families','For Couples','For Golden Age Readers'];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const encode=x=>JSON.stringify(x,null,2)+'\n';

function fixture(){
  const candidates=LABELS.flatMap((section,s)=>Array.from({length:12},(_,i)=>({
    record_id:'rec'+s+'_'+i,
    snapshot_fields:{'Event Title':'Event '+s+' '+i,'Start Date':'2026-10-17',
      UniqueEventID:'event '+s+' '+i+'|2026-10-17',LocationName:'Venue '+s+' '+i,
      City:'Vaughan',DescriptionRaw:'Source description '+s+' '+i,Source:'Library',
      URL:'https://example.com/events/'+s+'/'+i}
  })));
  const offer=c=>({id:c.record_id,reason:'Ranking reason.',warnings:[],replaceable_slots:[1,2,3,4,5]});
  const ranked={sections:LABELS.map((section,s)=>({section,ordered:candidates.slice(s*12,s*12+12).map(offer)}))};
  const allocation={picks:LABELS.flatMap((Section,s)=>candidates.slice(s*12,s*12+5).map((c,i)=>({
    IssueDate:'2026-10-15',ItemID:c.record_id,Section,Slot:i+1}))),
    alternatives:Object.fromEntries(LABELS.map((section,s)=>[section,candidates.slice(s*12+5,s*12+12).map(offer)]))};
  // The first alternative cannot replace any pick, so it was not rendered.
  allocation.alternatives[LABELS[0]][0].replaceable_slots=[];
  const packet={candidates};
  // Built by the producer's own function, so the two files cannot drift apart unnoticed.
  const displayed=producer.displayedEvents('2026-10-15',packet,allocation,allocation.alternatives);
  const manifest={schema_version:'issue-build-run/1',issue_date:'2026-10-15',version:'v6b',build_version:2,
    finished_at:'2026-10-11T15:38:57.819Z',git:{sha:'a'.repeat(40)},
    render_code_sha256:'b'.repeat(64),prompt_template_sha256:'c'.repeat(64),
    allocation_sha256:hash(encode(allocation)),ranked_pool_sha256:hash(encode(ranked)),displayed_events_sha256:hash(encode(displayed))};
  const request={packet_sha256:hash(encode(packet))};
  const preparation={issue_date:manifest.issue_date,evidence_inputs_sha256:'d'.repeat(64),
    inputs:{candidates:{path:'data/tracking/snapshots/candidates_2026-10-11_1129.json',sha256:'e'.repeat(64)}}};
  const week={issue:manifest.issue_date,version:manifest.version,snapshot:'2026-10-11_1129'};
  return {manifest,week,preparation,request,packet,ranked,allocation,displayed};
}

const FILENAMES={manifest:'run_manifest.json',week:'week.json',preparation:'preparation_manifest.json',
  request:'request_manifest.json',packet:'ranking_packet.json',ranked:'ranked_pool.json',allocation:'allocation.json',displayed:'displayed_events.json'};
const shown=(x,id)=>x.displayed.events.find(e=>e.id===id);
function memoryRun(input=fixture()){
  const dir=path.resolve(__dirname,'fixture-run'),files=new Map();
  for(const [key,name] of Object.entries(FILENAMES))files.set(path.join(dir,name),encode(input[key]));
  const io={
    readFileSync(file,encoding){assert.ok(files.has(file),'Missing fixture file '+file);const bytes=Buffer.from(files.get(file));return encoding?bytes.toString(encoding):bytes;},
    existsSync(file){return files.has(file);},
    writeFileSync(file,bytes,options){assert.equal(options.flag,'wx');assert.ok(!files.has(file));files.set(file,String(bytes));}
  };
  return {dir,files,io,input};
}

test('valid run writes the IssueBuild shape, slot order, shown alternatives and a full assessment matrix',()=>{
  const run=memoryRun();run.input.allocation.picks.reverse();
  // Pure conversion accepts any pick-array order; disk integrity checks still match the original files.
  const pure=d.buildBundle(run.input);
  const out=d.convertRun(run.dir,run.io),bundle=JSON.parse(run.files.get(out));
  assert.deepEqual(bundle,pure);
  assert.deepEqual(bundle.sections.map(s=>s.id),['families','couples','golden-age']);
  for(const [s,section] of bundle.sections.entries()){
    assert.deepEqual(section.selected.map(c=>c.id),Array.from({length:5},(_,i)=>'rec'+s+'_'+i));
    assert.equal(section.alternatives.length,5);
    assert.deepEqual(section.alternatives.map(a=>a.orderingPosition),[1,2,3,4,5]);
    // Every pair of the ten displayed events is assessed, so the console never meets a missing verdict.
    assert.equal(Object.keys(section.replacementAssessments).length,10);
    for(const row of Object.values(section.replacementAssessments))assert.equal(Object.keys(row).length,9);
  }
  assert.deepEqual(bundle.sections[0].alternatives.map(a=>a.candidate.id),['rec0_6','rec0_7','rec0_8','rec0_9','rec0_10']);
  assert.equal(bundle.sections[0].selected[0].description,'Source description 0 0');
  assert.equal(bundle.sections[0].selected[0].occurrenceId,'event 0 0|2026-10-17');
  assert.match(bundle.id,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(bundle.ordering.rankerVersion,/git:a{40}/);
  assert.match(bundle.ordering.evidenceVersion,/snapshot:2026-10-11_1129/);
  assert.equal(bundle.ordering.generatedAt,run.input.manifest.finished_at);
});

test('replacement verdicts follow replaceable_slots; no pair is unavailable',()=>{
  const input=fixture();
  // rec0_6 can replace picks 1 and 3 only.
  input.allocation.alternatives[LABELS[0]][1].replaceable_slots=[1,3];
  const matrix=d.buildBundle(input).sections[0].replacementAssessments;
  assert.deepEqual(matrix.rec0_0.rec0_6,{status:'clean',reason:'Fits this slot.'});
  assert.equal(matrix.rec0_2.rec0_6.status,'clean');
  assert.deepEqual(matrix.rec0_1.rec0_6,{status:'override',reason:'This swap may repeat a venue or event already in this section.'});
  // Pairs the producer never assessed: pick for pick, alternative for alternative, and a swap back.
  for(const [out,incoming] of [['rec0_0','rec0_1'],['rec0_6','rec0_7'],['rec0_6','rec0_0']]){
    assert.equal(matrix[out][incoming].status,'override');
    assert.match(matrix[out][incoming].reason,/^Not checked against your earlier swaps/);
  }
  assert.ok(Object.values(matrix).every(row=>Object.values(row).every(a=>a.status!=='unavailable'&&a.reason)));
  assert.equal(matrix.rec0_0.rec0_0,undefined);
});

test('second conversion is byte-identical and bundleHash excludes only its own field',()=>{
  const run=memoryRun(),out=d.convertRun(run.dir,run.io),first=run.files.get(out);
  assert.equal(d.convertRun(run.dir,run.io),out);
  assert.equal(run.files.get(out),first);
  const {bundleHash,...body}=JSON.parse(first);
  assert.equal(bundleHash,hash(d.canonicalJSON(body)));
  const reordered=fixture();reordered.packet.candidates.reverse();reordered.allocation.picks.reverse();
  assert.deepEqual(d.buildBundle(reordered),JSON.parse(first));
});

test('date-only values stay date-only and source timestamps stay unchanged',()=>{
  const input=fixture();input.packet.candidates[1].snapshot_fields['Start Date']='2026-10-17T11:30:00-04:00';
  const selected=d.buildBundle(input).sections[0].selected;
  assert.equal(selected[0].startsAt,'2026-10-17');
  assert.equal(selected[1].startsAt,'2026-10-17T11:30:00-04:00');
});

const refusalCases=[
  ['missing section',x=>x.ranked.sections.pop(),/Missing section: For Golden Age Readers/],
  ['missing alternative section',x=>delete x.allocation.alternatives[LABELS[1]],/Missing section: For Couples/],
  ['too few picks',x=>x.allocation.picks.pop(),/For Golden Age Readers: 4 of 5 picks/],
  ['unclassified item',x=>shown(x,'rec0_0').classification='unclassified',/unclassified/],
  ['unclassified undisplayed item',x=>x.packet.candidates.at(-1).classification='unclassified',/unclassified/],
  ['missing required field',x=>delete x.packet.candidates[0].snapshot_fields.URL,/sourceUrl.*rec0_0/],
  ['missing recurring-series identity',x=>delete shown(x,'rec0_0').series_id,/seriesId.*rec0_0/],
  ['blank recurring-series identity',x=>shown(x,'rec0_0').series_id=' ',/seriesId.*rec0_0/],
  ['missing classification',x=>delete shown(x,'rec0_0').classification,/classification.*rec0_0/],
  ['missing displayed description',x=>x.displayed.events=x.displayed.events.filter(e=>e.id!=='rec0_0'),/description.*rec0_0/],
  ['empty displayed description',x=>shown(x,'rec0_0').description=' ',/description.*rec0_0/],
  ['unmarked description',x=>delete shown(x,'rec0_0').description_source,/description_source.*rec0_0/],
  ['source description that is not the snapshot text',x=>shown(x,'rec0_0').description='Other copy',/description.*rec0_0.*DescriptionRaw/],
  ['fallback marked on an event that has a source description',x=>shown(x,'rec0_6').description_source='fallback',/description_source.*rec0_6/],
  ['missing numeric build version',x=>delete x.manifest.build_version,/buildVersion.*build_version/],
  ['missing manifest git SHA',x=>delete x.manifest.git.sha,/rankerVersion.*git.sha/],
  ['missing snapshot identity',x=>delete x.week.snapshot,/evidenceVersion.*snapshot/],
  ['duplicate slot',x=>x.allocation.picks[1].Slot=1,/For Families.*slots 1 through 5/],
  ['wrong issue date',x=>x.allocation.picks[0].IssueDate='2026-10-22',/IssueDate.*2026-10-15/],
  ['unknown candidate ID',x=>x.allocation.picks[0].ItemID='unknown',/unknown/],
  ['missing displayed alternative fields',x=>delete x.packet.candidates[6].snapshot_fields['Event Title'],/title.*rec0_6/]
];
for(const [name,mutate,pattern] of refusalCases)test('refuses '+name+' with a named error and non-zero CLI exit',()=>{
  const input=fixture();mutate(input);assert.throws(()=>d.buildBundle(input),pattern);
  // main() uses exactly the same catch/exit handling here as the guarded file entry point.
  const source="const d=require('./scripts/issue-build/to-bundle.js'),path=require('node:path'),fs=require('node:fs');"+
    "const files=JSON.parse(fs.readFileSync(0,'utf8'));const io={readFileSync(p,e){const b=Buffer.from(files[path.basename(p)]);return e?b.toString(e):b;},existsSync(p){return path.basename(p) in files;},writeFileSync(){throw Error('Unexpected write');}};d.main(['fixture-run'],io);";
  // Refresh byte hashes: these are malformed fixture inputs, not tampering tests.
  input.manifest.allocation_sha256=hash(encode(input.allocation));input.manifest.ranked_pool_sha256=hash(encode(input.ranked));
  input.request.packet_sha256=hash(encode(input.packet));input.manifest.displayed_events_sha256=hash(encode(input.displayed));
  const files=Object.fromEntries(Object.entries(FILENAMES).map(([key,name])=>[name,encode(input[key])]));
  const cli=spawnSync(process.execPath,['-e',source],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',input:JSON.stringify(files)});
  assert.equal(cli.error,undefined);assert.equal(cli.status,1);assert.match(cli.stderr,pattern);
});

test('reports all unavailable fields together rather than manufacturing placeholders',()=>{
  const input=fixture();delete input.manifest.build_version;
  input.displayed.events=[];
  assert.throws(()=>d.buildBundle(input),e=>{
    for(const field of ['buildVersion','seriesId','classification','description'])assert.match(e.message,new RegExp(field));
    assert.match(e.message,/rec2_9/);return true;
  });
});

// Ship-plan item 10a: the producer supplies build_version and, for every displayed event, a description,
// a series_id and a classification. A run finalized before the last two existed is refused for them only.
test('a run finalized before series_id and classification existed is refused for those two only',()=>{
  const input=fixture();
  for(const e of input.displayed.events){delete e.series_id;delete e.classification;}
  assert.throws(()=>d.buildBundle(input),e=>{
    const lines=e.message.split('\n- ').slice(1);
    assert.equal(lines.length,60); // 15 picks + 15 shown alternatives, two fields each
    assert.equal(lines.filter(l=>l.startsWith('seriesId not available')).length,30);
    assert.equal(lines.filter(l=>l.startsWith('classification not available')).length,30);
    assert.doesNotMatch(e.message,/buildVersion|build_version|description/);return true;
  });
});

// The series rule: same title is one series, whatever the venue or time. Every displayed event is classified.
test('one title at two venues and dates is one series; different titles are different series',()=>{
  const input=fixture(),[a,b,c]=input.packet.candidates;
  a.snapshot_fields['Event Title']='Little Explorers Storytime';
  Object.assign(b.snapshot_fields,{'Event Title':'  little explorers   STORYTIME ','Start Date':'2026-10-18',LocationName:'Maple Library'});
  input.displayed=producer.displayedEvents('2026-10-15',input.packet,input.allocation,input.allocation.alternatives);
  const shownEvents=d.buildBundle(input).sections.flatMap(s=>[...s.selected,...s.alternatives.map(x=>x.candidate)]);
  const series=id=>shownEvents.find(e=>e.id===id).seriesId;
  assert.equal(series(a.record_id),'little explorers storytime');
  assert.equal(series(b.record_id),series(a.record_id));
  assert.notEqual(series(c.record_id),series(a.record_id));
  assert.equal(new Set(shownEvents.map(e=>e.seriesId)).size,29); // 30 displayed events, two share a series
  assert.ok(shownEvents.every(e=>e.classification==='classified'));
  // The model's input carries neither field.
  assert.ok(input.packet.candidates.every(x=>!('seriesId' in x)&&!('series_id' in x)&&!('classification' in x)));
});

test('a fallback description converts, and a run folder without displayed_events.json is refused',()=>{
  const input=fixture(),fields=input.packet.candidates[0].snapshot_fields;fields.DescriptionRaw=null;
  input.displayed=producer.displayedEvents('2026-10-15',input.packet,input.allocation,input.allocation.alternatives);
  assert.equal(shown(input,'rec0_0').description_source,'fallback');
  assert.equal(d.buildBundle(input).sections[0].selected[0].description,producer.fallbackDescription(fields));
  assert.throws(()=>d.buildBundle({...fixture(),displayed:undefined}),/description not available: displayed_events\.json/);
  const run=memoryRun();run.files.delete(path.join(run.dir,'displayed_events.json'));
  assert.throws(()=>d.convertRun(run.dir,run.io),/description not available: displayed_events\.json/);
  assert.ok(!run.files.has(path.join(run.dir,d.BUNDLE_FILE)));
});

test('refuses stale artifacts, altered inputs and overwriting a different bundle',()=>{
  for(const name of ['allocation.json','ranked_pool.json','ranking_packet.json','displayed_events.json']){
    const run=memoryRun();run.files.set(path.join(run.dir,name),run.files.get(path.join(run.dir,name))+' ');
    assert.throws(()=>d.convertRun(run.dir,run.io),new RegExp(name+'.*hash mismatch'));
    assert.ok(!run.files.has(path.join(run.dir,d.BUNDLE_FILE)));
  }
  const run=memoryRun();run.files.set(path.join(run.dir,d.BUNDLE_FILE),'existing bundle\n');
  assert.throws(()=>d.convertRun(run.dir,run.io),/different bundle/);
  assert.equal(run.files.get(path.join(run.dir,d.BUNDLE_FILE)),'existing bundle\n');
});

test('require() is silent and performs no file writes or network calls',()=>{
  const source="const fs=require('node:fs');fs.writeFileSync=()=>{throw Error('Unexpected write');};global.fetch=()=>{throw Error('Unexpected fetch');};require('./scripts/issue-build/to-bundle.js');";
  const out=spawnSync(process.execPath,['-e',source],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});
  assert.equal(out.status,0);assert.equal(out.stdout,'');assert.equal(out.stderr,'');
});

test('serialized output satisfies the actual IssueBuild TypeScript interface under strict checking',t=>{
  let ts;
  try{ts=require('../../apps/editor-console/node_modules/typescript');}
  catch(e){if(e.code==='MODULE_NOT_FOUND'){t.skip('Console TypeScript dependency is not installed');return;}throw e;}
  const run=memoryRun(),out=d.convertRun(run.dir,run.io),bundle=JSON.parse(run.files.get(out));
  const file=path.join(__dirname,'__in_memory_bundle_check__.ts');
  const source="import type { IssueBuild } from '../../apps/editor-console/lib/contracts';\n"+
    'const bundle = '+JSON.stringify(bundle,null,2)+' satisfies IssueBuild;\n';
  const options={strict:true,noEmit:true,skipLibCheck:true,types:[],target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,ignoreDeprecations:'6.0'};
  const host=ts.createCompilerHost(options),original=host.getSourceFile.bind(host);
  host.getSourceFile=(name,languageVersion,onError,shouldCreateNewSourceFile)=>path.resolve(name)===file?
    ts.createSourceFile(file,source,languageVersion,true):original(name,languageVersion,onError,shouldCreateNewSourceFile);
  host.writeFile=()=>assert.fail('Strict contract check must not emit any files');
  const program=ts.createProgram([file],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{
    getCanonicalFileName:x=>x,getCurrentDirectory:()=>path.resolve(__dirname,'../..'),getNewLine:()=> '\n'}));
});
