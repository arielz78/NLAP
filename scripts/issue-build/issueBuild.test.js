// Acceptance cases for the weekly issue build; no API calls, page fetches, Airtable traffic or writes.
// Every fixture date is an offset from the issue date, and the allocation cases run for several issue
// dates (including a month and a year boundary), so no date here is ever moved by hand.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), child = require('node:child_process');
const d = require('./issueBuild.js');
const {repair, isFormUrl} = require('./repair.js');
const [F,C,G] = d.SECTIONS;
const GUIDANCE = {first_demo_issue:'2026-09-10', reviewed_demo_issues:['2026-09-10','2026-09-17','2026-09-24']};
// Not included: an issue whose window spans the March clock change (e.g. 2027-03-04). buildIssues.js
// measures the window in 24-hour blocks, so in a DST timezone it admits IssueDate+11 on those weeks and the
// out-of-window case below would fail. Reported, not fixed here: buildIssues.js is not this producer's to edit.
const ISSUES = ['2026-10-01','2026-10-08','2026-10-29','2026-12-31','2027-01-07'];
let ISSUE = ISSUES[0];
const candidate = (id, venue, title=id, date=d.addDays(ISSUE,3), url='https://example.com/events/'+id) => ({record_id:id,
  snapshot_fields:{'Event Title':title,'Start Date':date,URL:url,
    LocationName:venue,Status:'New',DescriptionRaw:null},
  r7:{record_id:id,start_date:date,p_include:0.8,section_probabilities:{[F]:0.2,[C]:0.4,[G]:0.4}}});
const offer = id => ({id,reason:'A suitable activity.',evidence_quote:'',warnings:[],history_refs:[],flex_reason:''});
const pool = (f=[],c=[],g=[]) => ({sections:d.SECTIONS.map((section,i)=>({section,ordered:[f,c,g][i].map(offer)})), exclusions:[],notes:[]});
const week = (issue=ISSUE, opts) => ({...d.weekContext(issue,GUIDANCE,opts), snapshotLabel:'October 4', recent_issues:[-7,-14,-21].map(n=>d.addDays(issue,n))});
const packetOf = rows => ({candidates:rows, history:[], coverage:{all_candidates:rows.length, click_history_through:null}});
// Ten distinct-venue records per section: enough for 5 picks + 5 replaceable alternatives everywhere.
const fullRows = () => ['f','c','g'].flatMap(k=>Array.from({length:10},(_,i)=>candidate(k+i,k.toUpperCase()+i)));
const fullPool = rows => pool(...['f','c','g'].map(k=>rows.filter(x=>x.record_id[0]===k).map(x=>x.record_id)));
let cases = 0;
function test(name, fn) {fn(); cases++; console.log('PASS '+name);}

for (const issue of ISSUES) { ISSUE = issue; const at = ' ['+issue+']';
test('identity does not merge identical titles at different venues'+at,()=>{
 assert.equal(d.sameOpportunity(candidate('a','A','Yoga'),candidate('b','B','Yoga')),false);
 assert.equal(d.sameOpportunity(candidate('a','A','Yoga'),candidate('b','A','Yoga')),true);
});
test('scarce section can use flex before a full section takes it'+at,()=>{
 const rows=[...Array.from({length:6},(_,i)=>candidate('c'+i,'C'+i)),...Array.from({length:4},(_,i)=>candidate('g'+i,'G'+i)),candidate('flex','X')];
 const result=d.allocate(ISSUE,rows,pool([],['flex',...rows.filter(x=>x.record_id[0]==='c').map(x=>x.record_id)],['flex','g0','g1','g2','g3']));
 assert.equal(result.picks.filter(x=>x.Section===G).length,5);
 assert.equal(result.picks.find(x=>x.ItemID==='flex').Section,G);
 assert.equal(new Set(result.picks.map(x=>x.ItemID)).size,result.picks.length);
});
test('venue constraint backfills, locks occupy slots, input status stays New'+at,()=>{
 const rows=[candidate('a','Same'),candidate('b','Same'),candidate('c','Other')];
 const locks=[{IssueDate:ISSUE,ItemID:'a',Section:F,Slot:1}];
 const result=d.allocate(ISSUE,rows,pool(['b','c']),locks);
 assert.equal(result.picks.find(x=>x.ItemID==='c').Slot,2);
 assert.ok(!result.picks.some(x=>x.ItemID==='b'));
 assert.ok(rows.every(x=>x.snapshot_fields.Status==='New'));
});
test('insufficient supply is explicit and out-of-window records cannot fill'+at,()=>{
 // Window is IssueDate+1..+10 inclusive: +10 fills, +11 and the issue day itself do not.
 const rows=[candidate('a','A'),candidate('b','B','b',d.addDays(ISSUE,11)),candidate('c','C','c',ISSUE),candidate('e','E','e',d.addDays(ISSUE,10))];
 const result=d.allocate(ISSUE,rows,pool(['a','b','c','e']));
 assert.deepEqual(result.picks.map(x=>x.ItemID),['a','e']); assert.equal(result.shortfalls[F],3);
});
test('stable ordering and cross-section identity survive reversed source order'+at,()=>{
 const rows=[candidate('a','A'),candidate('b','B'),candidate('c','C')];
 assert.deepEqual(d.allocate(ISSUE,rows,pool([],['a','b'],['a','c'])),d.allocate(ISSUE,[...rows].reverse(),pool([],['a','b'],['a','c'])));
});
test('alternatives are checked against each actual replacement slot'+at,()=>{
 const rows=[candidate('a','Same'),candidate('b','B'),candidate('c','C'),candidate('e','E'),candidate('f','F'),candidate('alt','Same')];
 const ranked=pool(['a','b','c','e','f','alt']); const r=d.allocate(ISSUE,rows,ranked);
 const alternatives=d.alternatives(ISSUE,rows,ranked,r.picks);
 assert.deepEqual(alternatives[F][0].replaceable_slots,[1]);
});
test('a full pool builds a slate and renders both previews'+at,()=>{
 const rows=fullRows(), built=d.buildSlate(week(),packetOf(rows),fullPool(rows));
 assert.equal(built.result.picks.length,15); assert.ok(Object.values(built.checks).every(Boolean));
 assert.ok(built.output.html.includes(week().windowLabel)&&built.output.md.includes('## '+G));
});
test('thin supply stops before render and names the section and the count'+at,()=>{
 // Deliberately thin: Golden Age has 3 usable records, Couples has 5 picks but only 2 alternatives.
 const rows=[...Array.from({length:10},(_,i)=>candidate('f'+i,'F'+i)),...Array.from({length:7},(_,i)=>candidate('c'+i,'C'+i)),...Array.from({length:3},(_,i)=>candidate('g'+i,'G'+i))];
 assert.throws(()=>d.buildSlate(week(),packetOf(rows),fullPool(rows)),e=>{
  assert.ok(e instanceof d.ThinSupplyError);
  assert.match(e.message,/For Golden Age Readers: 3 of 5 picks filled/);
  assert.match(e.message,/For Couples: 2 of 5 replaceable alternatives/);
  assert.doesNotMatch(e.message,/For Families/);
  assert.equal(e.detail.checks.filled_sections,false); assert.equal(e.detail.output,undefined);
  return true;});
});
}

ISSUE = '2026-10-08';
test('URL identity preserves occurrence query and removes tracking only',()=>{
 assert.notEqual(d.urlKey('https://x.com/p?select=2026-10-03'),d.urlKey('https://x.com/p?select=2026-09-26'));
 assert.equal(d.urlKey('https://x.com/p?utm_source=a'),d.urlKey('https://x.com/p'));
});
test('unknown IDs, duplicate ranks, missing sections and invented quotes fail',()=>{
 const rows=[candidate('a','A')]; const p=pool(['a']); d.validateRanking(p,rows,[]);
 assert.throws(()=>d.validateRanking(pool(['wrong']),rows,[]));
 assert.throws(()=>d.validateRanking(pool(['a','a']),rows,[]));
 assert.throws(()=>d.validateRanking({sections:[],exclusions:[],notes:[]},rows,[]));
 const bad=pool(['a']); bad.sections[0].ordered[0].evidence_quote='made up';
 assert.throws(()=>d.validateRanking(bad,rows,[]));
});
test('missing evidence remains null and is not described as zero history',()=>{
 const row=candidate('a','A'); const ev=d.historyFor(row,[],[]);
 assert.equal(ev.exact_url_publications,null); assert.equal(ev.exact_url_clicks,null);
 assert.equal(row.snapshot_fields.DescriptionRaw,null);
});
test('request identity changes when prompt, model, input or code changes',()=>{
 const base={model:'m',input:'a',instructions:'b'};
 for(const changed of [{...base,model:'n'},{...base,input:'z'},{...base,instructions:'z'}]) assert.notEqual(d.requestKey(base,'v1'),d.requestKey(changed,'v1'));
 assert.notEqual(d.requestKey(base,'v1'),d.requestKey(base,'v2'));
});

// ---- Week context: the values the per-run scripts hard-coded. ----
test('labels, window and season are derived from the issue date',()=>{
 const w=d.weekContext('2026-10-08',GUIDANCE);
 assert.deepEqual([w.issueLabel,w.windowLabel,w.windowStart,w.windowEnd,w.version,w.seasonPrefix],['October 8','October 9 – 18, 2026','2026-10-09','2026-10-18','v5','2025-10']);
 assert.equal(w.demoIntro,'This is the fifth demonstration. The editor reviewed the September 10, September 17 and September 24 demonstrations (none was recorded on October 1)');
 const v=d.weekContext('2026-10-01',GUIDANCE,{version:'v4b'});
 assert.deepEqual([v.windowLabel,v.version,v.demoNumber,v.unreviewedNote],['October 2 – 11, 2026','v4b',4,'']);
 assert.equal(d.weekContext('2026-10-29',GUIDANCE).windowLabel,'October 30 – November 8, 2026');
 assert.equal(d.weekContext('2026-12-31',GUIDANCE).windowLabel,'January 1 – 10, 2027');
 assert.equal(d.weekContext('2026-12-24',GUIDANCE).windowLabel,'December 25, 2026 – January 3, 2027');
 assert.match(d.weekContext('2026-10-15',GUIDANCE).demoIntro,/sixth demonstration.*\(none was recorded on October 1 or October 8\)$/);
 assert.throws(()=>d.weekContext('2026-10-32',GUIDANCE)); assert.throws(()=>d.weekContext('2026-09-17',GUIDANCE));
});
test('recency dates come from the publication history and a stale history is flagged',()=>{
 const issues=n=>({published_issues:Array.from({length:n},(_,i)=>({date:d.addDays('2026-10-08',-7*(i+1))}))});
 const fresh=d.recentIssues(issues(5),week('2026-10-08'));
 assert.deepEqual(fresh.recent_issues,['2026-10-01','2026-09-24','2026-09-17']); assert.equal(fresh.history_warning,null);
 assert.match(d.recentIssues(issues(5),week('2026-10-15')).history_warning,/2026-10-01, not 2026-10-08/);
 assert.equal(d.recentIssues(issues(5),week('2026-10-15'),['2026-10-08','2026-10-01','2026-09-24']).recent_issues[0],'2026-10-08');
});
test('both templates fill completely for any week and an unknown placeholder fails',()=>{
 // The real templates are gitignored, so a fresh clone has only the example copies; check whichever exist.
 const present=name=>[d.TEMPLATES[name],d.EXAMPLES[name]].filter(f=>fs.existsSync(path.join(__dirname,f)));
 for(const issue of ISSUES) for(const name of ['prompt','rules']) for(const file of present(name)){
  const text=d.fill(fs.readFileSync(path.join(__dirname,file),'utf8'),d.templateValues(week(issue)));
  assert.ok(!text.includes('{{')); assert.ok(text.includes(d.weekContext(issue,GUIDANCE).issueLabel));
 }
 for(const name of ['prompt','rules','guidance']) assert.ok(fs.existsSync(path.join(__dirname,d.EXAMPLES[name])));
 assert.throws(()=>d.fill('{{NOPE}}',{}));
});

// ---- Decision_Log §101: form links never reach the shortlist. ----
test('a form-linked candidate is excluded from the shortlist and recorded',()=>{
 assert.ok(isFormUrl('https://forms.gle/VWKdVSznq4vG45QA7')&&isFormUrl('https://docs.google.com/forms/d/e/abc/viewform')&&isFormUrl('HTTPS://DOCS.GOOGLE.COM/forms/x'));
 assert.ok(!isFormUrl('https://docs.google.com/document/d/abc')&&!isFormUrl('https://example.com/events/forms')&&!isFormUrl(null));
 const rows=[candidate('a','A'),candidate('gle','B','Walking Tour',undefined,'https://forms.gle/abc123'),candidate('gdoc','C','Sign Up',undefined,'https://docs.google.com/forms/d/e/xyz/viewform'),candidate('z','Z')];
 // The form records score highest, so only the rule can keep them out.
 rows[1].r7.p_include=rows[2].r7.p_include=0.99;
 const input={candidates:rows}, picked=d.shortlist(input);
 assert.deepEqual(picked.map(c=>c.record_id),['a','z']);
 assert.equal(picked.filter(c=>isFormUrl(c.snapshot_fields.URL)).length,0);
 assert.deepEqual(d.formLinked(input).map(c=>c.record_id),['gle','gdoc']);
 assert.equal(input.candidates.length,4); // the record stays a candidate; only the shortlist drops it
});
test('a replayed response that ranks a form-linked record is repaired with a receipt',()=>{
 const ranking=pool(['a','gle'],['gle','b']); ranking.exclusions=[];
 const {ranking:out,receipt}=repair(ranking,{responseSha:'s',formExcluded:[{record_id:'gle',title:'Walking Tour',url:'https://forms.gle/abc123'}],knownIds:['a','b']});
 assert.deepEqual(out.sections.map(s=>s.ordered.map(o=>o.id)),[['a'],['b'],[]]);
 assert.deepEqual(receipt.automatic[0].removed_from,[{section:F,rank:2},{section:C,rank:1}]);
 assert.equal(receipt.changed,true); assert.equal(ranking.sections[0].ordered.length,2); // input not mutated
 assert.equal(repair(pool(['a']),{responseSha:'s',formExcluded:[{record_id:'gle'}],knownIds:['a']}).receipt.changed,false);
});

// ---- Repair receipt: hand corrections are data, applied only when their precondition holds. ----
test('correction ops apply, are recorded, and refuse a failed precondition or another response',()=>{
 const ranking=pool(['a','typo'],['b','a'],['c']); ranking.sections.push(JSON.parse(JSON.stringify(ranking.sections[2])));
 ranking.sections[0].ordered[0].evidence_quote='one space';
 const file={source_response_sha256:'s',corrections:[
  {defect:'D1',op:'drop_duplicate_section',section:G},{defect:'D2',op:'remap_id',section:F,from:'typo',to:'real'},
  {defect:'D3',op:'drop_row',section:C,id:'a'},{defect:'D4',op:'set_quote',id:'a',from:'one space',to:'one  space'},{defect:'D5',op:'drop_everywhere',id:'c'}]};
 const {ranking:out,receipt}=repair(ranking,{responseSha:'s',corrections:file,knownIds:['a','b','c','real']});
 assert.deepEqual(out.sections.map(s=>s.ordered.map(o=>o.id)),[['a','real'],['b'],[]]);
 assert.equal(out.sections[0].ordered[0].evidence_quote,'one  space');
 assert.equal(receipt.hand_corrections.length,5); assert.ok(receipt.hand_corrections.every(c=>c.effect));
 assert.deepEqual(receipt.rows_before.sections.map(s=>s.ordered),[2,2,1,1]); assert.deepEqual(receipt.rows_after.sections.map(s=>s.ordered),[2,1,0]);
 const run=corrections=>()=>repair(pool(['a']),{responseSha:'s',corrections:{source_response_sha256:'s',corrections},knownIds:['a']});
 assert.throws(run([{op:'drop_row',section:F,id:'missing'}]),/precondition failed/);
 assert.throws(run([{op:'remap_id',section:F,from:'a',to:'not-shortlisted'}]),/precondition failed/);
 assert.throws(run([{op:'invent'}]),/unknown op/);
 assert.throws(()=>repair(pool(['a']),{responseSha:'other',corrections:file,knownIds:['a']}),/another response/);
});
test('an empty repeated section is dropped; a populated repeat or a lone empty section is refused',()=>{
 const fix=ranking=>repair(ranking,{responseSha:'s',corrections:{source_response_sha256:'s',corrections:[{op:'drop_empty_section',section:F}]},knownIds:['a','b','c']});
 const ranking=pool(['a'],['b'],['c']); ranking.sections.push({section:F,ordered:[]});
 assert.deepEqual(fix(ranking).ranking.sections.map(s=>[s.section,s.ordered.length]),[[F,1],[C,1],[G,1]]);
 const populated=pool(['a'],['b'],['c']); populated.sections.push(JSON.parse(JSON.stringify(populated.sections[0])));
 assert.throws(()=>fix(populated),/precondition failed/);
 assert.throws(()=>fix(pool([],['b'],['c'])),/precondition failed/);
});
test('a ranked record is removed from the exclusions; an unranked or unexcluded one is refused',()=>{
 const fix=(ranking,id)=>repair(ranking,{responseSha:'s',corrections:{source_response_sha256:'s',corrections:[{op:'drop_exclusion',id}]},knownIds:['a','b','c']});
 const ranking=pool(['a'],['b'],['c']); ranking.exclusions=[{id:'a',reason:'note'},{id:'z',reason:'out'}];
 const out=fix(ranking,'a').ranking;
 assert.deepEqual(out.exclusions.map(o=>o.id),['z']); assert.deepEqual(out.sections[0].ordered.map(o=>o.id),['a']);
 assert.throws(()=>fix(ranking,'z'),/precondition failed/);
 assert.throws(()=>fix(ranking,'b'),/precondition failed/);
});

// ---- Console bundle inputs (ship-plan item 10a): build version and displayed descriptions. ----
test('build version is a per-issue number that rises with every finished build',()=>{
 const first=d.nextBuildVersion(ISSUE,[]); assert.equal(first,1);
 const second=d.nextBuildVersion(ISSUE,[{issue_date:ISSUE,build_version:first}]);
 assert.ok(Number.isSafeInteger(second)&&second>first);
 assert.equal(d.nextBuildVersion(ISSUE,[{issue_date:ISSUE,build_version:first},{issue_date:ISSUE,build_version:second}]),3);
 // Another issue's builds do not count. A run finished before the field existed counts as one build.
 assert.equal(d.nextBuildVersion(ISSUE,[{issue_date:d.addDays(ISSUE,7),build_version:9}]),1);
 assert.equal(d.nextBuildVersion(ISSUE,[{issue_date:ISSUE}]),2);
 assert.equal(d.nextBuildVersion(ISSUE,[{issue_date:ISSUE},{issue_date:ISSUE,build_version:2}]),3);
 assert.equal(d.nextBuildVersion(ISSUE,[{issue_date:ISSUE,build_version:4}]),5);
 // From disk: only folders holding a run manifest are finished builds, and the folder being built is not its own sibling.
 const root=path.resolve(__dirname,'../../data/tracking/issue_build'),at=(...p)=>path.join(root,...p);
 const files=new Map([[at('v5_a','run_manifest.json'),JSON.stringify({issue_date:ISSUE,build_version:1})],
  [at('v5_stopped','ranked_pool.json'),'{}'],[at('v6_a','run_manifest.json'),JSON.stringify({issue_date:d.addDays(ISSUE,7),build_version:1})],
  [at('v5_b','run_manifest.json'),JSON.stringify({issue_date:ISSUE,build_version:7})]]);
 const io={existsSync:p=>p===root||files.has(p),readdirSync:()=>['v5_a','v5_stopped','v6_a','v5_b'],readFileSync:p=>files.get(p)};
 const found=d.finishedManifests(at('v5_b'),io);
 assert.deepEqual(found.map(m=>m.build_version),[1,1]);
 assert.equal(d.nextBuildVersion(ISSUE,found),2);
});
test('every displayed event carries a description and a fallback is marked as one',()=>{
 const rows=fullRows(); rows[0].snapshot_fields.DescriptionRaw='From the source.'; rows[1].snapshot_fields.DescriptionRaw='   ';
 Object.assign(rows[2].snapshot_fields,{City:'Vaughan',Source:'Library'});
 const built=d.buildSlate(week(),packetOf(rows),fullPool(rows)), events=built.displayed.events;
 const shown=[...new Set([...built.result.picks.map(p=>p.ItemID),
  ...d.SECTIONS.flatMap(s=>built.alts[s].filter(a=>a.replaceable_slots.length).slice(0,5).map(a=>a.id))])].sort();
 assert.equal(shown.length,30); assert.deepEqual(events.map(e=>e.id),shown);
 assert.ok(events.every(e=>e.description.trim().length>0&&['source','fallback'].includes(e.description_source)));
 const byId=new Map(events.map(e=>[e.id,e]));
 assert.deepEqual(byId.get('f0'),{id:'f0',series_id:d.seriesId(rows[0]),classification:'classified',description:'From the source.',description_source:'source'});
 // Same title is one series whatever the venue or time; a blank title falls back to the record id.
 assert.equal(d.seriesId({record_id:'a',snapshot_fields:{'Event Title':' Little  Explorers STORYTIME',LocationName:'Maple Library'}}),'little explorers storytime');
 assert.equal(d.seriesId({record_id:'b',snapshot_fields:{'Event Title':'Little Explorers Storytime',LocationName:'Carrville Library'}}),'little explorers storytime');
 assert.equal(d.seriesId({record_id:'c',snapshot_fields:{'Event Title':'  '}}),'id:c');
 assert.ok(events.every(e=>e.classification==='classified'&&e.series_id));
 // Whitespace is not a description. The fallback uses only the candidate's own fields.
 assert.equal(byId.get('f1').description_source,'fallback');
 assert.equal(byId.get('f1').description,d.fallbackDescription(rows[1].snapshot_fields));
 assert.equal(d.fallbackDescription({'Event Title':'Family Day!','Start Date':'2026-10-17T11:30:00-04:00',LocationName:'Library',City:'Vaughan',Source:'VPL'}),
  'Family Day! October 17, 2026 at Library, Vaughan. No description was supplied by the source (VPL).');
 assert.equal(d.fallbackDescription({'Event Title':'Yoga',LocationName:null}),'Yoga. No description was supplied by the source.');
 assert.ok(byId.get('f2').description.includes('at F2, Vaughan.')&&byId.get('f2').description.endsWith('(Library).'));
 assert.equal(events.filter(e=>e.description_source==='fallback').length,29);
 assert.equal(built.displayed.issue_date,ISSUE); assert.ok(byId.get('f1').description.startsWith('f1. '));
 assert.deepEqual(d.buildSlate(week(),packetOf(rows),fullPool(rows)).displayed,built.displayed);
});

// ---- Receipt and exit status. ----
test('the run receipt carries the human-review line with a place for who and when',()=>{
 const manifest={mode:'replay',replay:{source:'x/response.json'},git:{sha:'abc',producer_paths_uncommitted:[]},prompt_template_sha256:'t',
  form_url_exclusions:[],shortlist_form_url_matches:0,supply:Object.fromEntries(d.SECTIONS.map(s=>[s,{picks:5,replaceable_alternatives:5}])),
  repair_receipt:{automatic:[],hand_corrections:[]}};
 const text=d.receiptText(week(),manifest);
 assert.ok(text.includes(d.HUMAN_REVIEW)); assert.match(d.HUMAN_REVIEW,/HUMAN REVIEW REQUIRED/);
 assert.match(text,/Reviewed by: _+\s+Reviewed at: _+/); assert.ok(text.includes('Git SHA: abc')&&text.includes('Prompt template sha256: t'));
});
test('thin pool stops before a request is prepared',()=>{
 const thin={candidates:[...Array.from({length:14},(_,i)=>candidate('a'+i,'A'+i)),candidate('form','V','Form',undefined,'https://forms.gle/x')]};
 assert.throws(()=>d.assertPoolSupply(thin),e=>e instanceof d.ThinSupplyError&&/14 usable candidate\(s\); 15 are needed/.test(e.message));
 d.assertPoolSupply({candidates:Array.from({length:15},(_,i)=>candidate('a'+i,'A'+i))});
});
test('thin supply exits non-zero (2); other failures exit 1; replay path loads no credentials',()=>{
 const run=body=>child.spawnSync(process.execPath,['-e','const d=require('+JSON.stringify(path.join(__dirname,'issueBuild.js'))+');'+body],{encoding:'utf8'});
 const thin=run("d.runGuarded(()=>{throw new d.ThinSupplyError('Thin supply: For Couples: 4 of 5 picks filled');});");
 assert.equal(thin.status,2); assert.match(thin.stderr,/Issue build stopped: Thin supply: For Couples: 4 of 5 picks filled/);
 assert.equal(run("d.runGuarded(()=>{throw new Error('broken');});").status,1);
 const loaded=run("d.runGuarded(()=>{});console.log(Object.keys(require.cache).filter(k=>/dotenv/.test(k)).length);");
 assert.equal(loaded.status,0); assert.equal(loaded.stdout.trim(),'0');
});
console.log(cases+' acceptance cases passed.');
