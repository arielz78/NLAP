// Offline producer-run -> editor-console IssueBuild adapter (ship-plan item 10).
// Usage: node scripts/issue-build/to-bundle.js <run-folder>
// Writes bundle.json, or verifies identical existing bytes. Never replaces a different bundle.
// The producer supplies manifest.build_version and displayed_events.json (for every displayed event:
// a description marked 'source' or 'fallback', a series_id and a classification); a run finalized
// before it did is refused. Nothing here derives a series, defaults a classification or rewrites copy.
'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'), BUNDLE_FILE='bundle.json';
const CONTRACT_VERSION='r8.editor-console.v1', ADAPTER_VERSION='issue-build-to-bundle/1';
const SECTIONS=[['For Families','families','Families'],['For Couples','couples','Couples'],
  ['For Golden Age Readers','golden-age','Golden Age']];
const PICKS=5, DISPLAYED_ALTERNATIVES=5; // issueBuild.js render(): filter(replaceable_slots.length).slice(0,5)
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');

// Sort object keys only: selected/alternative array order is part of the contract.
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
const canonicalJSON=value=>JSON.stringify(canonical(value),null,2)+'\n';
function buildId(name){
  // RFC 4122 UUID v5, URL namespace, content-addressed name. No random IDs or clock reads.
  const namespace=Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex');
  const bytes=crypto.createHash('sha1').update(namespace).update('urn:nlap:issue-build:'+name).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const h=bytes.toString('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}

// Ship-plan item 9. No swap is ever refused: the worst verdict is a warning the editor can overrule.
// The verdict is the producer's own replaceable_slots, never a second copy of the allocator's rules
// (Decision_Log §87). The producer checked each alternative against the original five picks only, so
// a pair that can arise only after an earlier swap has no verdict and is marked as not checked.
const VERDICTS={
  clean:{status:'clean',reason:'Fits this slot.'},
  warning:{status:'override',reason:'This swap may repeat a venue or event already in this section.'},
  unchecked:{status:'override',reason:'Not checked against your earlier swaps. Look for a repeated venue or event in this section.'}
};
function buildAssessmentMatrix(section,replaceableSlots){
  const all=[...section.selected,...section.alternatives.map(a=>a.candidate)];
  const slotOf=new Map(section.selected.map((c,i)=>[c.id,i+1]));
  const verdict=(out,incoming)=>{
    const slot=slotOf.get(out.id),slots=replaceableSlots.get(incoming.id);
    if(slot===undefined||slots===undefined)return VERDICTS.unchecked;
    return slots.includes(slot)?VERDICTS.clean:VERDICTS.warning;
  };
  return Object.fromEntries(all.map(out=>[out.id,
    Object.fromEntries(all.filter(c=>c.id!==out.id).map(incoming=>[incoming.id,{...verdict(out,incoming)}]))]));
}

// Pure mapping. Collect every gap before refusing; the placeholder return values below are
// never serialized if any problem exists. They are not defaults for missing source fields.
function buildBundle({manifest,week,preparation,packet,ranked,allocation,displayed}){
  const problems=[];
  const text=(value,field,source,allowEmpty=false)=>{
    if(typeof value!=='string'||(!allowEmpty&&!value.trim())){
      problems.push(field+' not available: '+source);return '';
    }
    return value;
  };
  const list=(value,source)=>{
    if(!Array.isArray(value)){problems.push(source+' must be an array');return [];}
    return value;
  };
  const digest=(value,field,source)=>{
    const result=text(value,field,source);
    if(result&&!/^[a-f0-9]{64}$/.test(result))problems.push(source+' must be a SHA-256 hex digest');
    return result;
  };
  // Refuse explicit unclassified markers even on a row that will not be displayed.
  function checkClassification(value,at){
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      if((key==='classification'||key==='section'||key==='Section')&&item==='unclassified')problems.push('unclassified item at '+at+'.'+key);
      else checkClassification(item,at+'.'+key);
    }
  }
  checkClassification({packet,ranked,allocation,displayed},'run');
  const issueDate=text(manifest?.issue_date,'issueDate','run_manifest.json.issue_date');
  if(issueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(issueDate))problems.push('issueDate must be date-only');
  if(week?.issue!==issueDate||preparation?.issue_date!==issueDate)problems.push('Issue date mismatch in week.json or preparation_manifest.json');
  const version=text(manifest?.version,'rankerVersion','run_manifest.json.version');
  if(week?.version!==version)problems.push('Run version mismatch in week.json');
  const buildVersion=manifest?.build_version;
  if(!Number.isSafeInteger(buildVersion)||buildVersion<1)problems.push('buildVersion not available: run_manifest.json.build_version must be an explicit positive integer (not the demo number)');
  const git=text(manifest?.git?.sha,'rankerVersion','run_manifest.json.git.sha');
  if(git&&!/^[a-f0-9]{40}$/.test(git))problems.push('run_manifest.json.git.sha must be a full git SHA');
  const code=digest(manifest?.render_code_sha256,'rankerVersion','run_manifest.json.render_code_sha256');
  const prompt=digest(manifest?.prompt_template_sha256,'rankerVersion','run_manifest.json.prompt_template_sha256');
  const snapshot=text(week?.snapshot,'evidenceVersion','week.json.snapshot');
  const snapshotInput=preparation?.inputs?.candidates;
  const snapshotPath=text(snapshotInput?.path,'evidenceVersion','preparation_manifest.json.inputs.candidates.path');
  if(snapshot&&snapshotPath&&!snapshotPath.endsWith('/candidates_'+snapshot+'.json'))problems.push('Snapshot identity mismatch between week.json and preparation_manifest.json');
  const snapshotHash=digest(snapshotInput?.sha256,'evidenceVersion','preparation_manifest.json.inputs.candidates.sha256');
  const generatedAt=text(manifest?.finished_at,'generatedAt','run_manifest.json.finished_at');
  if(generatedAt&&(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt)||!Number.isFinite(Date.parse(generatedAt))))problems.push('run_manifest.json.finished_at must be a timestamp with a timezone');
  const inputHash=digest(preparation?.evidence_inputs_sha256,'inputHash','preparation_manifest.json.evidence_inputs_sha256');
  const byId=new Map();
  for(const c of list(packet?.candidates,'ranking_packet.json.candidates')){
    const id=text(c?.record_id,'candidate.id','ranking_packet.json.candidates[].record_id');
    if(byId.has(id))problems.push('Duplicate candidate ID: '+id);
    byId.set(id,c);
  }
  // The description_source mark stays in displayed_events.json: the console's Candidate has no field for it.
  if(!displayed)problems.push('description not available: displayed_events.json is missing (the producer writes it at finalize; this run predates it)');
  else if(displayed.issue_date!==issueDate)problems.push('Issue date mismatch in displayed_events.json');
  const shownById=new Map((displayed?list(displayed.events,'displayed_events.json.events'):[]).map(e=>[e?.id,e]));
  const describe=(itemId,raw)=>{
    if(!displayed)return '';
    const e=shownById.get(itemId),at='displayed_events.json event '+itemId,hasRaw=typeof raw==='string'&&raw.trim().length>0;
    const value=text(e?.description,'description',at+'.description');
    if(e&&!['source','fallback'].includes(e.description_source))problems.push('description_source must be source or fallback: '+at);
    else if(e&&(e.description_source==='source')!==hasRaw)problems.push('description_source does not match the snapshot: '+at+' is marked '+e.description_source);
    else if(e&&hasRaw&&value!==raw)problems.push('description differs from the snapshot text: '+at+' against snapshot_fields.DescriptionRaw');
    return value;
  };
  const ranking=list(ranked?.sections,'ranked_pool.json.sections'),picks=list(allocation?.picks,'allocation.json.picks');
  for(const s of ranking)if(!SECTIONS.some(([label])=>label===s?.section))problems.push('Unknown section in ranked_pool.json: '+s?.section);
  for(const p of picks)if(!SECTIONS.some(([label])=>label===p?.Section))problems.push('Unknown section in allocation.json: '+p?.Section);
  const seenPicks=new Set();
  const sections=SECTIONS.map(([label,id,displayLabel])=>{
    const matches=ranking.filter(s=>s?.section===label),s=matches[0];
    if(!matches.length)problems.push('Missing section: '+label+' in ranked_pool.json');
    if(matches.length>1)problems.push('Duplicate section: '+label+' in ranked_pool.json');
    const ordered=list(s?.ordered,'ranked_pool.json '+label+'.ordered');
    const selectedRows=picks.filter(p=>p?.Section===label).sort((a,b)=>a.Slot-b.Slot);
    if(!selectedRows.length)problems.push('Missing section: '+label+' in allocation.json.picks');
    if(selectedRows.length!==PICKS)problems.push(label+': '+selectedRows.length+' of '+PICKS+' picks (exactly five required)');
    if(selectedRows.some((p,i)=>p.Slot!==i+1))problems.push(label+' must have slots 1 through 5 exactly once');
    if(!Array.isArray(allocation?.alternatives?.[label]))problems.push('Missing section: '+label+' in allocation.json.alternatives');
    const alternativeRows=list(allocation?.alternatives?.[label],'allocation.json.alternatives '+label);
    for(const a of alternativeRows)if(!Array.isArray(a?.replaceable_slots))problems.push('Missing replaceable_slots for alternative '+a?.id+' in '+label);
    // Only selection of already-rendered rows; this does not produce or reinterpret assessments.
    const shown=alternativeRows.filter(a=>a?.replaceable_slots?.length).slice(0,DISPLAYED_ALTERNATIVES);
    const item=itemId=>{
      const c=byId.get(itemId),f=c?.snapshot_fields;
      if(!c)problems.push('Candidate '+itemId+' missing from ranking_packet.json');
      if(!ordered.some(row=>row?.id===itemId))problems.push('Candidate '+itemId+' missing from ranked section '+label);
      const at='ranking_packet.json candidate '+itemId,shownAt='displayed_events.json event '+itemId;
      // Both come from the producer's displayed_events.json (ship-plan item 10a). Never derived or defaulted here.
      const classification=shownById.get(itemId)?.classification;
      if(classification!=='classified')problems.push('classification not available or not classified: '+shownAt+'.classification');
      const startsAt=text(f?.['Start Date'],'startsAt',at+'.snapshot_fields[Start Date]');
      if(startsAt&&!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}.*)?$/.test(startsAt))problems.push('Invalid startsAt for '+itemId+': '+startsAt);
      return {id:text(c?.record_id,'id',at+'.record_id'),
        seriesId:text(shownById.get(itemId)?.series_id,'seriesId',shownAt+'.series_id'),
        occurrenceId:text(f?.UniqueEventID,'occurrenceId',at+'.snapshot_fields.UniqueEventID'),
        title:text(f?.['Event Title'],'title',at+'.snapshot_fields[Event Title]'),startsAt,
        venue:text(f?.LocationName,'venue',at+'.snapshot_fields.LocationName'),
        city:text(f?.City,'city',at+'.snapshot_fields.City'),
        description:describe(itemId,f?.DescriptionRaw),
        sourceLabel:text(f?.Source,'sourceLabel',at+'.snapshot_fields.Source'),
        sourceUrl:text(f?.URL,'sourceUrl',at+'.snapshot_fields.URL'),classification};
    };
    const selected=selectedRows.map(p=>{
      if(p.IssueDate!==issueDate)problems.push('Pick '+p.ItemID+' IssueDate does not match '+issueDate);
      if(seenPicks.has(p.ItemID))problems.push('Duplicate selected candidate: '+p.ItemID);
      seenPicks.add(p.ItemID);return item(p.ItemID);
    });
    const alternatives=shown.map((a,i)=>({candidate:item(a.id),orderingPosition:i+1}));
    const localIds=[...selected.map(c=>c.id),...alternatives.map(a=>a.candidate.id)];
    if(new Set(localIds).size!==localIds.length)problems.push('Duplicate displayed candidate in '+label);
    const section={id,label:displayLabel,selected,alternatives};
    return {...section,replacementAssessments:buildAssessmentMatrix(section,new Map(shown.map(a=>[a.id,a.replaceable_slots])))};
  });
  if(problems.length)throw new Error('Cannot create IssueBuild bundle:\n- '+[...new Set(problems)].join('\n- '));
  const payload={issueKey:'vaughan-brief-'+issueDate,issueDate,buildVersion,contractVersion:CONTRACT_VERSION,
    ordering:{adapterVersion:ADAPTER_VERSION,rankerVersion:'issue-build:'+version+';git:'+git+';code:'+code+';prompt:'+prompt,
      evidenceVersion:'snapshot:'+snapshot+';sha256:'+snapshotHash,generatedAt,inputHash},sections};
  const body={id:buildId(sha(canonicalJSON(payload))),...payload};
  // Self-hash convention: SHA-256 of canonical JSON (including id), with bundleHash omitted.
  // A hash of the final file bytes is also stable, but differs from this self-hash.
  return {...body,bundleHash:sha(canonicalJSON(body))};
}

function insideRoot(file){
  const relative=path.relative(ROOT,file);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Run path is outside the repository: '+file);
  return file;
}
function convertRun(runFolder,io=fs){
  const dir=insideRoot(path.resolve(ROOT,runFolder));
  const filePath=name=>{
    const file=path.join(dir,name);
    if(io.realpathSync&&io.existsSync(file))insideRoot(io.realpathSync(file));
    return file;
  };
  const bytes={},read=name=>{
    try{bytes[name]=io.readFileSync(filePath(name));return JSON.parse(bytes[name].toString('utf8'));}
    catch(e){throw new Error('Cannot read '+name+': '+e.message);}
  };
  const input={manifest:read('run_manifest.json'),week:read('week.json'),preparation:read('preparation_manifest.json'),
    request:read('request_manifest.json'),packet:read('ranking_packet.json'),ranked:read('ranked_pool.json'),allocation:read('allocation.json')};
  // Absent from a run finalized before the producer wrote it; buildBundle then names the gap with the others.
  if(io.existsSync(filePath('displayed_events.json')))input.displayed=read('displayed_events.json');
  for(const [name,expected] of [['allocation.json',input.manifest.allocation_sha256],
    ['ranked_pool.json',input.manifest.ranked_pool_sha256],['ranking_packet.json',input.request.packet_sha256],
    ...(input.displayed?[['displayed_events.json',input.manifest.displayed_events_sha256]]:[])]){
    if(typeof expected!=='string'||sha(bytes[name])!==expected)throw new Error(name+' hash mismatch against saved manifest');
  }
  const output=filePath(BUNDLE_FILE),serialized=canonicalJSON(buildBundle(input));
  if(io.existsSync(output)){
    if(io.readFileSync(output,'utf8')!==serialized)throw new Error('Refusing to overwrite a different bundle: '+output);
  }else io.writeFileSync(output,serialized,{flag:'wx'});
  return output;
}
function main(argv=process.argv.slice(2),io=fs){
  try{
    if(argv.length!==1||!argv[0]||argv[0].startsWith('--'))throw new Error('Usage: node scripts/issue-build/to-bundle.js <run-folder>');
    const output=convertRun(argv[0],io);console.log('Bundle verified/written: '+output);return output;
  }catch(e){console.error(e.message);process.exitCode=1;}
}
if(require.main===module)main();
module.exports={buildBundle,buildAssessmentMatrix,canonicalJSON,convertRun,main,BUNDLE_FILE};
