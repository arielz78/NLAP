// Weekly issue-build producer (Decision_Log §102): the per-run demo.js lineage, parameterised by issue date.
// The issue date is the only required input; nothing in this folder is edited for a routine week.
// No Airtable reads or writes; production allocator stays unchanged. See README.md for the command sequence.
'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto'), child=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const {buildIssues}=require(path.join(ROOT,'scripts/buildIssues.js'));
const {isFormUrl,repair}=require('./repair.js');
const {normTitle}=require('../r6/lib/util.js');
const SECTIONS=['For Families','For Couples','For Golden Age Readers'];
const OUT_ROOT='data/tracking/issue_build', R7_ROOT='data/tracking/r7_live_runner', SNAPSHOTS='data/tracking/snapshots';
// The three TEMPLATES carry the editor's feedback and are gitignored (public repo); EXAMPLES are their tracked, stripped copies.
const TEMPLATES={prompt:'ranking_prompt.template.txt',rules:'editor_rules.template.md',guidance:'guidance.json'};
const EXAMPLES={prompt:'ranking_prompt.template.example.txt',rules:'editor_rules.template.example.md',guidance:'guidance.example.json'};
const CODE=['issueBuild.js','repair.js','prepare_inputs.py',...Object.values(TEMPLATES)];
// Thin-supply floors. PICKS and ALTERNATIVES are the two checks the per-run finalize already made
// (5 filled slots and 5 replaceable alternatives per section); the pool floor is only their arithmetic.
const PICKS=5, ALTERNATIVES=5, POOL_FLOOR=PICKS*SECTIONS.length;
const HUMAN_REVIEW='HUMAN REVIEW REQUIRED: a person must review this slate before it is sent to the editor.';
class ThinSupplyError extends Error{constructor(message,detail){super(message);this.name='ThinSupplyError';this.detail=detail;}}

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const abs=p=>path.resolve(ROOT,p), rel=p=>path.relative(ROOT,path.resolve(ROOT,p)).split(path.sep).join('/');
const read=(dir,n)=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const save=(dir,n,x)=>fs.writeFileSync(path.join(dir,n),typeof x==='string'?x:JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const has=(dir,n)=>fs.existsSync(path.join(dir,n));
const localDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
function assert(ok,message){if(!ok)throw new Error(message);}

// ---- Week context: everything the per-run scripts hard-coded, derived from the issue date. ----
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ORDINALS=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth',
  'fourteenth','fifteenth','sixteenth','seventeenth','eighteenth','nineteenth','twentieth'];
const ymd=s=>s.split('-').map(Number);
const addDays=(s,n)=>{const [y,m,d]=ymd(s);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);};
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&addDays(s,0)===s;
const dayLabel=s=>MONTHS[ymd(s)[1]-1]+' '+ymd(s)[2];
const longLabel=s=>dayLabel(s)+', '+ymd(s)[0];
const listed=(items,last)=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' '+last+' '+items.at(-1);
function windowLabel(a,b){
  const [ya,ma]=ymd(a),[yb,mb,db]=ymd(b);
  return ya!==yb?longLabel(a)+' – '+longLabel(b):ma!==mb?dayLabel(a)+' – '+dayLabel(b)+', '+yb:dayLabel(a)+' – '+db+', '+yb;
}
function weekContext(issue,guidance,opts={}){
  assert(isDate(issue),'--issue must be a real date, YYYY-MM-DD');
  const reviewed=[...guidance.reviewed_demo_issues].sort();
  assert(isDate(guidance.first_demo_issue)&&reviewed.length&&reviewed.every(isDate),'guidance.json needs first_demo_issue and reviewed_demo_issues dates');
  assert(reviewed.every(x=>x<issue),'guidance.json records feedback on a round that is not before '+issue+'; that week cannot be built from the current guidance');
  const demoNumber=opts.demoNumber??Math.floor((Date.parse(issue)-Date.parse(guidance.first_demo_issue))/604800000)+1;
  assert(Number.isInteger(demoNumber)&&demoNumber>0,'Demonstration number must be a positive integer; pass --demo-number');
  // Rounds sent after the last one the editor answered. The prompt and the rules both name them.
  const unreviewed=[];for(let x=addDays(reviewed.at(-1),7);x<issue;x=addDays(x,7))unreviewed.push(x);
  const reviewedLabel=listed(reviewed.map(dayLabel),'and'),[y,m]=ymd(issue);
  return {issue,version:opts.version||'v'+demoNumber,demoNumber,thursday:new Date(issue+'T00:00:00Z').getUTCDay()===4,
    windowStart:addDays(issue,1),windowEnd:addDays(issue,10),issueLabel:dayLabel(issue),issueLong:longLabel(issue),
    windowLabel:windowLabel(addDays(issue,1),addDays(issue,10)),windowStartLabel:dayLabel(addDays(issue,1)),windowEndLabel:dayLabel(addDays(issue,10)),
    // Same calendar month one year earlier: the seasonal history examples.
    seasonPrefix:(y-1)+'-'+String(m).padStart(2,'0'),reviewed,unreviewed,reviewedLabel,
    demoIntro:'This is the '+(ORDINALS[demoNumber-1]||'number '+demoNumber)+' demonstration. The editor reviewed the '+reviewedLabel+' demonstrations'
      +(unreviewed.length?' (none was recorded on '+listed(unreviewed.map(dayLabel),'or')+')':''),
    unreviewedNote:unreviewed.length?' No feedback was given on the '+listed(unreviewed.map(dayLabel),'and')+' shortlist'+(unreviewed.length>1?'s':'')+'; guidance unchanged.':''};
}
// The recency rule names the latest published issues. Discovered from the staged history; --recent-issues overrides.
function recentIssues(d,week,override){
  const found=[...new Set(d.published_issues.map(i=>i.date))].sort().reverse().slice(0,3);
  const dates=override||found;
  assert(dates.length===3&&dates.every(isDate),'Need the three most recent published issue dates (found '+dates.length+'); pass --recent-issues a,b,c');
  const stale=found[0]!==addDays(week.issue,-7);
  return {recent_issues:dates,recent_issues_source:override?'--recent-issues':'publication history',
    history_warning:stale?'Latest published issue before '+week.issue+' is '+(found[0]||'none')+', not '+addDays(week.issue,-7)+'. Refresh data/beehiiv/issue_history.json before the model call, or the recency guidance points a week back.':null};
}
function fill(template,values){
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,k)=>{assert(Object.hasOwn(values,k),'Template placeholder {{'+k+'}} has no value');return values[k];});
}
function templateValues(week){
  const [r1,r2,older]=week.recent_issues.map(dayLabel);
  return {ISSUE_LONG:week.issueLong,ISSUE_LABEL:week.issueLabel,VERSION:week.version,WINDOW_START_LABEL:week.windowStartLabel,WINDOW_END_LABEL:week.windowEndLabel,
    DEMO_INTRO:week.demoIntro,UNREVIEWED_NOTE:week.unreviewedNote,RECENT_ISSUE_1:r1,RECENT_ISSUE_2:r2,OLDER_ISSUE:older};
}
function template(name){
  const file=path.join(__dirname,TEMPLATES[name]);
  assert(fs.existsSync(file),TEMPLATES[name]+' is missing from scripts/issue-build/. It is gitignored: copy '+EXAMPLES[name]+' to that name and fill it in');
  return fs.readFileSync(file);
}
function filled(name,week){
  const text=template(name).toString('utf8');
  assert(!text.includes('TODO(ariel)'),TEMPLATES[name]+' still has TODO(ariel) blanks; fill them before preparing the request');
  return fill(text,templateValues(week));
}
const editorRules=week=>filled('rules',week);

// ---- Lifted unchanged from demo.js, except that the issue date is an argument. ----
function urlKey(value) {
  try {const u=new URL(value);u.hash='';u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');
    for(const k of [...u.searchParams.keys()]) if(/^utm_/i.test(k)||['fbclid','gclid','mc_cid','mc_eid'].includes(k))u.searchParams.delete(k);
    u.searchParams.sort();return u.hostname+u.pathname.replace(/\/$/,'')+u.search;
  }catch{return null;}
}
function sameOpportunity(a,b) {
  if(a.record_id===b.record_id)return true;
  const x=a.snapshot_fields,y=b.snapshot_fields,v=norm(x.LocationName);
  if(!v||v!==norm(y.LocationName))return false;
  return norm(x['Event Title'])===norm(y['Event Title']) || (urlKey(x.URL)&&urlKey(x.URL)===urlKey(y.URL));
}
function historyFor(c,history,clicks) {
  const key=urlKey(c.snapshot_fields.URL);
  const pubs=key?history.filter(h=>urlKey(h.url)===key):[];
  const observed=key?clicks.filter(h=>urlKey(h.url)===key):[];
  return {exact_url_publications:pubs.length?pubs:null,exact_url_clicks:observed.length?observed:null,
    match_warning:'An exact URL may identify a reused programme page; occurrence identity is not established by URL alone.'};
}
function requestKey(request,codeHash){return sha(JSON.stringify({request,codeHash}));}
function makeSchema() {
  const str={type:'string'}, strings={type:'array',items:str};
  const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
  const row=object({id:str,reason:str,evidence_quote:str,warnings:strings,history_refs:strings,flex_reason:str});
  return object({sections:{type:'array',items:object({section:{type:'string',enum:SECTIONS},ordered:{type:'array',items:row}})},
    exclusions:{type:'array',items:object({id:str,reason:str})},notes:strings});
}
function checkSchema(v,s,at='result') {
  if(s.type==='object') {assert(v&&typeof v==='object'&&!Array.isArray(v),at+' must be object');
    assert(Object.keys(v).length===s.required.length&&s.required.every(k=>Object.hasOwn(v,k)),at+' wrong keys');
    for(const [k,sub]of Object.entries(s.properties))checkSchema(v[k],sub,at+'.'+k);
  } else if(s.type==='array'){assert(Array.isArray(v),at+' must be array');v.forEach((x,i)=>checkSchema(x,s.items,at+'['+i+']'));}
  else {assert(typeof v===s.type,at+' wrong type');if(s.enum)assert(s.enum.includes(v),at+' invalid enum');}
}
function validateRanking(r,candidates,history) {
  checkSchema(r,makeSchema());
  const byId=new Map(candidates.map(c=>[c.record_id,c])),refs=new Set(history.map(h=>h.ref));
  assert(r.sections.length===3&&new Set(r.sections.map(s=>s.section)).size===3,'Missing/duplicate section');
  const selected=new Set();
  for(const s of r.sections){const seen=new Set();for(const row of s.ordered){
    assert(byId.has(row.id),'Unknown candidate '+row.id);assert(!seen.has(row.id),'Duplicate rank '+row.id);seen.add(row.id);selected.add(row.id);
    assert(row.reason.trim().length>0,'Missing reason');assert(row.history_refs.every(x=>refs.has(x)),'Unknown history reference');
    const c=byId.get(row.id),text=[c.snapshot_fields['Event Title'],c.snapshot_fields.DescriptionRaw,c.page?.text].filter(Boolean).join('\n');
    assert(!row.evidence_quote||text.includes(row.evidence_quote),'Unsupported exact quote '+row.id);
  }}
  const rejected=new Set();for(const row of r.exclusions){assert(byId.has(row.id),'Unknown excluded ID');assert(!selected.has(row.id),'Ranked and excluded '+row.id);assert(!rejected.has(row.id),'Duplicate exclusion');rejected.add(row.id);}
  return r;
}
function contextRows(candidates){return candidates.map(c=>({id:c.record_id,...c.snapshot_fields,Status:'ContextOnly'}));}
function accepted(issue,c,section,rank,candidates,locks){
  if(!c||c.snapshot_fields.Status==='Rejected')return null;
  const projected={id:c.record_id,...c.snapshot_fields,Status:'Approved',SegmentSuggested:section,Score_Final:-rank};
  // Approved is a local adapter eligibility projection, never a persisted editor ruling.
  return buildIssues([...contextRows(candidates),projected],locks,[localDate(issue)],localDate(issue))[0]||null;
}
function allocate(issue,candidates,ranked,originalLocks=[]) {
  const byId=new Map(candidates.map(c=>[c.record_id,c]));
  for(const l of originalLocks)assert(byId.has(l.ItemID),'Lock candidate absent from demo input');
  const locks=originalLocks.map(x=>({...x})),trace=[];
  const rankedBySection=new Map(ranked.sections.map(s=>[s.section,s.ordered]));
  const options=section=>(rankedBySection.get(section)||[]).map((offer,i)=>({offer,rank:i+1,c:byId.get(offer.id)}))
    .filter(x=>x.c&&!locks.some(l=>sameOpportunity(x.c,byId.get(l.ItemID))))
    .map(x=>({...x,assignment:accepted(issue,x.c,section,x.rank,candidates,locks)})).filter(x=>x.assignment);
  while(true){
    const choices=SECTIONS.map((section,i)=>{
      const open=PICKS-locks.filter(l=>l.Section===section&&l.IssueDate===issue).length;
      const list=open>0?options(section):[];
      // Distinct venues approximate remaining feasible supply. Blank venues are individually available.
      const supply=new Set(list.map(x=>norm(x.c.snapshot_fields.LocationName)||x.c.record_id)).size;
      return {section,i,open,list,supply,ratio:open>0?supply/open:Infinity};
    }).filter(x=>x.list.length).sort((a,b)=>a.ratio-b.ratio||a.i-b.i);
    if(!choices.length)break;
    const chosen=choices[0],x=chosen.list[0];locks.push(x.assignment);
    trace.push({id:x.offer.id,section:chosen.section,llm_rank:x.rank,remaining_supply:chosen.supply,open_slots_before:chosen.open,
      dual_fit:ranked.sections.filter(s=>s.ordered.some(o=>o.id===x.offer.id)).map(s=>s.section)});
  }
  const picks=locks.sort((a,b)=>SECTIONS.indexOf(a.Section)-SECTIONS.indexOf(b.Section)||a.Slot-b.Slot);
  const shortfalls=Object.fromEntries(SECTIONS.map(s=>[s,PICKS-picks.filter(p=>p.Section===s&&p.IssueDate===issue).length]));
  return {picks,trace,shortfalls};
}
function alternatives(issue,candidates,ranked,picks) {
  const byId=new Map(candidates.map(c=>[c.record_id,c]));
  return Object.fromEntries(SECTIONS.map(section=>[section,(ranked.sections.find(s=>s.section===section)?.ordered||[])
    .filter(row=>!picks.some(p=>p.ItemID===row.id))
    .map((row)=>{
      const c=byId.get(row.id),slots=[];
      for(const removed of picks.filter(p=>p.Section===section)){
        const held=picks.filter(p=>p!==removed);
        if(held.some(p=>sameOpportunity(c,byId.get(p.ItemID))))continue;
        if(accepted(issue,c,section,1,candidates,held))slots.push(removed.Slot);
      }
      return {...row,replaceable_slots:slots};
    })]));
}
function codeIdentity(){return sha(CODE.map(n=>sha(fs.readFileSync(path.join(__dirname,n)))).concat(sha(fs.readFileSync(path.join(ROOT,'scripts/buildIssues.js')))).join('|'));}
function verifyInputs(dir,issue) {
  const manifest=read(dir,'preparation_manifest.json');
  assert(sha(fs.readFileSync(path.join(dir,'evidence_inputs.json')))===manifest.evidence_inputs_sha256,'Prepared input hash mismatch');
  for(const input of Object.values(manifest.inputs))assert(sha(fs.readFileSync(path.join(ROOT,input.path)))===input.sha256,'Source changed: '+input.path);
  const d=read(dir,'evidence_inputs.json');assert(d.issue_date===issue,'Wrong issue');
  const ids=new Set();for(const c of d.candidates){assert(!ids.has(c.record_id),'Duplicate source ID');ids.add(c.record_id);
    assert(c.r7.record_id===c.record_id&&c.snapshot_fields['Event Title']===c.r7.title&&c.snapshot_fields['Start Date']===c.r7.start_date&&c.snapshot_fields.URL===c.r7.url,'Wrong R7 join');
    assert(sha(c.r7.text)===c.r7.text_sha256,'Wrong R7 text hash');
    const ps=c.r7.section_probabilities;assert(SECTIONS.every(s=>Number.isFinite(ps[s])&&ps[s]>=0&&ps[s]<=1)&&Math.abs(Object.values(ps).reduce((a,b)=>a+b,0)-1)<1e-6,'Bad probabilities');
  }
  const targetItems=d.issueitems_snapshot.records.filter(r=>String(r.fields.Name||'').includes(issue));
  // This bounded demo expects the observed empty target issue. Fail loudly if that changes.
  assert(targetItems.length===0,'Target issue now contains items; explicit lock reconciliation required');
  return d;
}
// Decision_Log §101: a registration form is not a publishable link. The record stays a candidate in
// evidence_inputs.json; it is kept out of the shortlist, so the model never ranks it and its place backfills.
function formLinked(d){
  return d.candidates.filter(c=>isFormUrl(c.snapshot_fields.URL)).map(c=>({record_id:c.record_id,title:c.snapshot_fields['Event Title'],url:c.snapshot_fields.URL}));
}
function shortlist(d) {
  const pool=d.candidates.filter(c=>!isFormUrl(c.snapshot_fields.URL));
  const why=new Map(),add=(c,s)=>{if(!why.has(c.record_id))why.set(c.record_id,[]);why.get(c.record_id).push(s);};
  const cmp=score=>(a,b)=>score(b)-score(a)||a.r7.start_date.localeCompare(b.r7.start_date)||a.record_id.localeCompare(b.record_id);
  for(const s of SECTIONS){const representatives=[];for(const c of [...pool].sort(cmp(c=>c.r7.p_include*c.r7.section_probabilities[s]))){
    if(representatives.some(x=>sameOpportunity(x,c)))continue;representatives.push(c);add(c,'top30_distinct_for_'+s);if(representatives.length===30)break;
  }}
  for(const c of [...pool].sort(cmp(c=>c.r7.p_include*Math.min(c.r7.section_probabilities[SECTIONS[1]],c.r7.section_probabilities[SECTIONS[2]]))).slice(0,20))add(c,'shared_Couples_Golden_top20');
  for(const c of [...pool].sort(cmp(c=>c.r7.p_include*(1-Math.max(...Object.values(c.r7.section_probabilities))))).slice(0,10))add(c,'viable_uncertain_section_top10');
  return pool.filter(c=>why.has(c.record_id)).map(c=>({...c,retrieval_reasons:why.get(c.record_id)})).sort((a,b)=>a.record_id.localeCompare(b.record_id));
}
// Stops before any request is written. Section supply is only knowable after the response; see supplyProblems.
function assertPoolSupply(d){
  const usable=d.candidates.length-formLinked(d).length;
  if(usable<POOL_FLOOR)throw new ThinSupplyError('Thin supply: the in-window pool has '+usable+' usable candidate(s); '+POOL_FLOOR+' are needed to fill '+PICKS+' picks in each of '+SECTIONS.length+' sections. No request was prepared.',{usable,floor:POOL_FLOOR});
}
function assemblePacket(d,selected,pages,week,rules) {
  const ISSUE=week.issue;
  const clicks=d.click_history.records.filter(c=>c.issueDate<ISSUE);
  const history=d.published_issues.filter(i=>i.date<ISSUE).flatMap(i=>i.events.map((e,n)=>({ref:i.date+'|'+e.section+'|'+e.slot+'|'+n,date:i.date,...e,
    click_observation:clicks.find(c=>c.issueDate===i.date&&c.section===e.section&&c.slot===e.slot&&urlKey(c.url)===urlKey(e.url))||null})));
  const byPage=new Map(pages.map(p=>[p.id,p]));
  const recentDates=[...new Set(history.map(h=>h.date))].sort().reverse().slice(0,4);
  const seasonDates=[...new Set(history.map(h=>h.date))].filter(s=>s.startsWith(week.seasonPrefix)).slice(0,2);
  const needed=new Set(history.filter(h=>recentDates.includes(h.date)||seasonDates.includes(h.date)).map(h=>h.ref));
  const tokens=x=>new Set(norm(x).split(' ').filter(w=>w.length>=4&&!['with','from','this','that','your','event','class','vaughan','markham'].includes(w)));
  const candidates=selected.map(c=>{
    const evidence=historyFor(c,history,clicks);for(const h of evidence.exact_url_publications||[])needed.add(h.ref);
    const words=tokens(c.snapshot_fields['Event Title']);
    const similar=history.map(h=>({h,overlap:[...tokens(h.displayTitle)].filter(w=>words.has(w)).length}))
      .filter(x=>x.overlap>=2).sort((a,b)=>b.overlap-a.overlap||b.h.date.localeCompare(a.h.date)||a.h.ref.localeCompare(b.h.ref)).slice(0,3);
    similar.forEach(x=>needed.add(x.h.ref));
    const page=byPage.get(c.record_id);
    const pageExcerpt=page?{...page,text:page.text?.slice(0,3000)||null,packet_excerpt_truncated:(page.text?.length||0)>3000}:null;
    // This packet is the model's input. The console's seriesId and classification are not added here:
    // displayedEvents() writes them at finalize, so the request stays the same.
    return {record_id:c.record_id,snapshot_fields:c.snapshot_fields,
      r7:{p_include:c.r7.p_include,section_probabilities:c.r7.section_probabilities,gate_fit_overlap:c.r7.gate_fit_overlap},
      retrieval_reasons:c.retrieval_reasons,page:pageExcerpt,
      exact_url_publication_refs:evidence.exact_url_publications?.map(h=>h.ref)||null,
      exact_url_clicks:evidence.exact_url_clicks,weak_lexical_comparable_refs:similar.map(x=>x.h.ref)};
  });
  return {issue_date:ISSUE,window:d.window,shortlist_policy:'Demo only: top30 distinct opportunities per section, shared C/G top20 and uncertain-section top10; union. All '+d.candidates.length+' remain in the preparation bundle.',
    coverage:{all_candidates:d.candidates.length,shortlisted:candidates.length,all_historical_issues:d.published_issues.length,
      latest_issue:d.published_issues.map(i=>i.date).sort().at(-1),click_history_through:clicks.map(c=>c.issueDate).sort().at(-1)},
    evidence_warning:'Null means no matched observation in this evidence set, not zero performance or never published. Weak lexical matches do not establish event, venue or organizer identity.',
    candidates,history:history.filter(h=>needed.has(h.ref)).map(h=>({ref:h.ref,date:h.date,section:h.section,slot:h.slot,url:h.url,
      displayTitle:h.displayTitle,description:h.description?.slice(0,300)||null,description_truncated:(h.description?.length||0)>300,
      click_observation:h.click_observation?{vuc:h.click_observation.vuc,percentileVuc:h.click_observation.percentileVuc,sectionSize:h.click_observation.sectionSize}:null})),editor_feedback:d.editor_feedback,
    editor_feedback_on_previous_demo:d.editor_feedback_v1_demo,editor_rules:rules,
    explicit_editor_criterion:'Decision Log section 66: cultural-tie-in nightlife rejected; generic party can fit. Do not generalize to other cultural activities.'};
}
async function fetchPages(selected) {
  const wanted=selected.filter(c=>String(c.snapshot_fields.DescriptionRaw||'').length<120)
    .sort((a,b)=>b.r7.p_include-a.r7.p_include||a.record_id.localeCompare(b.record_id)).slice(0,24);
  const results=[];
  for(let offset=0;offset<wanted.length;offset+=4){
    const batch=await Promise.all(wanted.slice(offset,offset+4).map(async c=>{
      const start=new Date().toISOString(),url=c.snapshot_fields.URL;
      try{const u=new URL(url);assert(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!/^\d|localhost$|\.local$/i.test(u.hostname),'Unsupported page URL');
        const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'NLAP-Editorial-Review/1.0'}});
        if(!r.ok)return {id:c.record_id,url,fetched_at:start,status:r.status,text:null};
        const raw=await r.text();assert(raw.length<4000000,'Page too large');
        const text=raw.replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')
          .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
        return {id:c.record_id,url,final_url:r.url,fetched_at:start,status:r.status,raw_sha256:sha(raw),full_text_chars:text.length,text:text.slice(0,10000),truncated:text.length>10000,
          identity_status:'unverified retrieval; compare title, venue and occurrence before relying on this text'};
      }catch{return {id:c.record_id,url,fetched_at:start,status:'fetch_failed',text:null};}
    }));results.push(...batch);console.log('Detail pages attempted '+results.length+'/'+wanted.length);
  }
  return results;
}

// ---- Discovery: the R7 scores folder for the issue names the snapshot it scored. ----
function discover(issue,opts){
  let r7=opts.r7Dir&&rel(opts.r7Dir);
  if(!r7){
    const hits=fs.readdirSync(abs(R7_ROOT)).filter(n=>n.startsWith('issue_'+issue+'_snapshot_')&&fs.existsSync(abs(R7_ROOT+'/'+n+'/scored_survivors.jsonl'))).sort();
    assert(hits.length,'No R7 scores for '+issue+': expected '+R7_ROOT+'/issue_'+issue+'_snapshot_<stamp>/scored_survivors.jsonl. Run the R7 live runner first, or pass --r7-dir.');
    r7=R7_ROOT+'/'+hits.at(-1);
    if(hits.length>1)console.log('Several R7 folders for '+issue+'; using the latest: '+hits.at(-1)+' (override with --r7-dir)');
  }
  const stamp=opts.snapshot||(/_snapshot_(\d{4}-\d{2}-\d{2}_\d{4})\/?$/.exec(r7)||[])[1];
  assert(stamp,'Cannot read a snapshot stamp from '+r7+'; pass --snapshot <YYYY-MM-DD_HHMM>');
  for(const n of ['candidates_','issueitems_'])assert(fs.existsSync(abs(SNAPSHOTS+'/'+n+stamp+'.json')),'Snapshot file missing: '+SNAPSHOTS+'/'+n+stamp+'.json');
  return {r7_dir:r7,snapshot:stamp,r7_dir_source:opts.r7Dir?'--r7-dir':'discovered',snapshot_source:opts.snapshot?'--snapshot':'from the R7 folder name'};
}
function runDir(week,stamp,opts){
  const dir=abs(opts.runDir||OUT_ROOT+'/'+week.version+'_'+week.issue+'_snapshot_'+stamp),r=rel(dir);
  assert(r.startsWith('data/tracking/')&&!r.startsWith('data/tracking/r6_demo'),'Run folder must be new output under data/tracking/, outside r6_demo: '+r);
  return dir;
}
function findRun(issue,opts){
  if(opts.runDir)return abs(opts.runDir);
  assert(isDate(issue),'--issue must be a real date, YYYY-MM-DD');
  const names=fs.existsSync(abs(OUT_ROOT))?fs.readdirSync(abs(OUT_ROOT)).filter(n=>n.includes('_'+issue+'_snapshot_')&&(!opts.version||n.startsWith(opts.version+'_'))):[];
  assert(names.length,'No run folder for '+issue+' under '+OUT_ROOT+'; run prepare first');
  assert(names.length===1,'Several run folders for '+issue+' ('+names.join(', ')+'); pass --version or --run-dir');
  return abs(OUT_ROOT+'/'+names[0]);
}
function git(){
  const run=args=>{try{return child.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}};
  const dirty=run(['status','--porcelain','--','scripts/issue-build','scripts/buildIssues.js','models/sectioning']);
  // The SHA alone does not identify uncommitted producer code; code_sha256 hashes the files actually run.
  return {sha:run(['rev-parse','HEAD']),producer_paths_uncommitted:dirty===null?null:dirty.split('\n').filter(Boolean)};
}

// ---- Stage 1: build inputs + request. Offline apart from --fetch-pages. ----
async function prepare(issue,opts={}) {
  const guidance=JSON.parse(template('guidance')),base=weekContext(issue,guidance,opts),found=discover(issue,opts),dir=runDir(base,found.snapshot,opts);
  assert(!has(dir,'evidence_inputs.json'),'Preserve existing preparation: '+rel(dir)+' (choose another --version or --run-dir)');
  if(!base.thursday)console.warn('Warning: '+issue+' is not a Thursday (the publish day).');
  fs.mkdirSync(dir,{recursive:true});
  const python=opts.python||abs(process.platform==='win32'?'models/.venv/Scripts/python.exe':'models/.venv/bin/python');
  child.execFileSync(python,['-B',path.join(__dirname,'prepare_inputs.py'),'--issue',issue,'--r7-dir',found.r7_dir,'--snapshot',found.snapshot,'--out',rel(dir)],{cwd:ROOT,stdio:'inherit'});
  const d=verifyInputs(dir,issue);
  assert(d.window[0]===base.windowStart&&d.window[1]===base.windowEnd,'R7 window '+d.window.join('..')+' is not IssueDate+1..+10');
  const week={...base,...found,snapshotLabel:dayLabel(found.snapshot.slice(0,10)),...recentIssues(d,base,opts.recentIssues),run_dir:rel(dir)};
  if(week.history_warning)console.warn('Warning: '+week.history_warning);
  save(dir,'week.json',week);
  assertPoolSupply(d);
  const rules=editorRules(week),prompt=filled('prompt',week);
  save(dir,'editor_rules.md',rules);save(dir,'ranking_prompt.txt',prompt);
  const selected=shortlist(d),excluded=formLinked(d);
  let pages=[],pageSource='none';
  if(opts.pageEvidence){fs.copyFileSync(abs(opts.pageEvidence),path.join(dir,'page_evidence.json'),fs.constants.COPYFILE_EXCL);pages=read(dir,'page_evidence.json');pageSource='reused '+rel(opts.pageEvidence);}
  else if(opts.fetchPages){pages=await fetchPages(selected);save(dir,'page_evidence.json',pages);pageSource='fetched';}
  const packet=assemblePacket(d,selected,pages,week,rules);
  const request={model:'gpt-5.6-terra',store:false,reasoning:{effort:'medium'},max_output_tokens:15000,
    instructions:prompt,
    input:JSON.stringify(packet),text:{format:{type:'json_schema',name:'weekly_editor_rankings',strict:true,schema:makeSchema()}}};
  assert(Buffer.byteLength(JSON.stringify(request))<360000,'Packet too large for this bounded demo: '+Buffer.byteLength(JSON.stringify(request))+' bytes');
  const formHits=packet.candidates.filter(c=>isFormUrl(c.snapshot_fields.URL)).length;
  assert(formHits===0,'Form-linked record reached the shortlist');
  save(dir,'ranking_packet.json',packet);save(dir,'request.json',request);
  save(dir,'request_manifest.json',{issue_date:issue,created_at:new Date().toISOString(),request_sha256:sha(JSON.stringify(request)),code_sha256:codeIdentity(),
    request_key:requestKey(request,codeIdentity()),source_manifest_sha256:sha(fs.readFileSync(path.join(dir,'preparation_manifest.json'))),
    packet_sha256:sha(fs.readFileSync(path.join(dir,'ranking_packet.json'))),request_bytes:Buffer.byteLength(JSON.stringify(request)),
    git:git(),prompt_template_sha256:sha(template('prompt')),editor_rules_template_sha256:sha(template('rules')),guidance_sha256:sha(template('guidance')),
    prompt_rendered_sha256:sha(prompt),page_evidence:pageSource,form_url_exclusions:excluded,shortlist_form_url_matches:formHits,
    rates_usd_per_million:{input:2,cached_input:0.2,output:12},pricing_source:'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
    provisional:true,network:'Up to 24 supplied public page URLs; one model request; no hosted tools or automatic retries.'});
  console.log(JSON.stringify({run_dir:rel(dir),prepared_candidates:packet.candidates.length,history_examples:packet.history.length,page_attempts:pages.length,
    form_url_excluded:excluded.length,request_bytes:Buffer.byteLength(JSON.stringify(request))}));
  return dir;
}

// ---- Stage 2: the one paid model call. Nothing else in this file reaches the provider or loads credentials. ----
function usageFrom(body,m,replayed){
  const u=body.usage;assert(u&&Number.isFinite(u.input_tokens)&&Number.isFinite(u.output_tokens),'Missing provider usage');
  const cached=u.input_tokens_details?.cached_tokens||0;
  return {model:body.model,response_id:body.id,usage:u,estimated_usd:((u.input_tokens-cached)*2+cached*0.2+u.output_tokens*12)/1000000,
    basis:'Provider-reported tokens including reasoning, at published standard rates; excludes earlier R7 embedding costs and taxes.',
    rate_source:m.pricing_source,model_requests:replayed?0:1,hosted_tool_calls:0,
    ...(replayed?{replayed:true,note:'Cost of the original call that produced the replayed response; this run made no model request.'}:{})};
}
async function execute(dir) {
  const week=read(dir,'week.json');verifyInputs(dir,week.issue);const request=read(dir,'request.json'),m=read(dir,'request_manifest.json');
  assert(m.code_sha256===codeIdentity()&&m.request_key===requestKey(request,codeIdentity()),'Request/code changed; prepare a new run');
  assert(sha(fs.readFileSync(path.join(dir,'ranking_packet.json')))===m.packet_sha256,'Packet changed');
  assert(!has(dir,'response.json')&&!has(dir,'attempt.json'),'Attempt already recorded; replay locally, do not silently make another call');
  require('dotenv').config({path:path.join(ROOT,'NLAP_Airtable.env'),quiet:true});
  assert(process.env.OPENAI_API_KEY,'OPENAI_API_KEY missing');
  save(dir,'attempt.json',{started_at:new Date().toISOString(),request_key:m.request_key,model:request.model});
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(300000),
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request)});
  const body=await response.json();save(dir,'response.json',body);
  assert(response.ok,'OpenAI returned HTTP '+response.status+'; inspect saved provider response');
  save(dir,'usage.json',usageFrom(body,m,false));
  console.log(JSON.stringify({status:body.status,usage:body.usage,cost:read(dir,'usage.json').estimated_usd}));
  console.log('Response saved. Next: node scripts/issue-build/issueBuild.js finalize --issue '+week.issue);
}

// ---- Stage 3: repair -> validate -> allocate -> render, from a response file. ----
function parseResponse(body){
  assert(body.status==='completed','Model response incomplete/refused; no editor output generated');
  const content=body.output.filter(o=>o.type==='message').flatMap(o=>o.content||[]);
  assert(!content.some(c=>c.type==='refusal'),'Model refused');
  return JSON.parse(content.filter(c=>c.type==='output_text').map(c=>c.text).join(''));
}
function render(week,packet,ranked,result,alts) {
  const ISSUE_LABEL=week.issueLabel,WINDOW_LABEL=week.windowLabel,SNAPSHOT_LABEL=week.snapshotLabel,VERSION=week.version;
  const byId=new Map(packet.candidates.map(c=>[c.record_id,c]));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanWarning=c=>!c.snapshot_fields.DescriptionRaw&&!c.page?.text?'Details are limited; check the event page before booking.':null;
  const card=(row,n,extra='')=>{
    const c=byId.get(row.id),f=c.snapshot_fields;
    const warnings=[...new Set([...row.warnings,cleanWarning(c)].filter(Boolean))];
    const metadata=[f['Start Date'],f.LocationName||'Venue unconfirmed',f.City,f.CostRaw?String(f.CostRaw):'Price unconfirmed'].filter(Boolean).join(' · ');
    const prior=(c.exact_url_publication_refs||[]).map(ref=>packet.history.find(h=>h.ref===ref)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date))[0];
    return `<article><div class="number">${n}</div><div><h3><a href="${esc(f.URL)}" target="_blank" rel="noopener noreferrer">${esc(f['Event Title'])}</a></h3><div class="meta">${esc(metadata)}</div><p>${esc(row.reason)}</p>${row.flex_reason?`<p class="flex">Also fits another section: ${esc(row.flex_reason)}</p>`:''}${prior?`<p class="history">Previously linked ${esc(prior.date)} (${esc(prior.section)}); a reused programme URL can cover a different occurrence.</p>`:''}${warnings.length?`<ul class="warnings">${warnings.map(w=>'<li>'+esc(w)+'</li>').join('')}</ul>`:''}${extra?'<p class="replacement">'+esc(extra)+'</p>':''}</div></article>`;
  };
  const blocks=SECTIONS.map(section=>{
    const s=ranked.sections.find(s=>s.section===section),picks=result.picks.filter(p=>p.Section===section);
    const good=alts[section].filter(a=>a.replaceable_slots.length).slice(0,5);
    return `<section id="${SECTIONS.indexOf(section)}"><div class="section-title"><h2>${esc(section)}</h2><span>${picks.length} recommendations · ${good.length} alternatives</span></div>${picks.map(p=>card(s.ordered.find(r=>r.id===p.ItemID),p.Slot)).join('')}<details open><summary>Ordered alternatives</summary>${good.map((r,i)=>card(r,i+1,'Can replace pick '+r.replaceable_slots.join(', ')+'. Recheck if making multiple swaps.')).join('')}</details></section>`;
  }).join('');
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vaughan Brief · ${ISSUE_LABEL} editor preview (${esc(VERSION)})</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f3ef;color:#26352f;font:16px/1.55 system-ui,sans-serif}main{max-width:980px;margin:auto;padding:42px 24px}header{padding:20px 0 30px;border-bottom:2px solid #284c40}.eyebrow{font-size:13px;letter-spacing:.13em;text-transform:uppercase;color:#63756b}h1{font:42px/1.15 Georgia,serif;margin:12px 0}h2{font:29px Georgia,serif;margin:0}h3{font-size:18px;margin:0 0 5px}a{color:#215c49;text-decoration-thickness:1px;text-underline-offset:3px}nav{display:flex;gap:20px;flex-wrap:wrap;margin:22px 0}section{margin:38px 0}.section-title{display:flex;justify-content:space-between;align-items:baseline;gap:15px;border-bottom:1px solid #bbc7bd;padding-bottom:14px}.section-title span,.meta{font-size:13px;color:#627166}article{display:grid;grid-template-columns:30px 1fr;gap:15px;padding:22px 0;border-bottom:1px solid #dde1d9}.number{font:24px Georgia,serif;color:#849a8b}p{margin:9px 0}.warnings{font-size:13px;color:#785725;margin:9px 0;padding-left:20px}.history,.flex,.replacement{font-size:13px}.history{color:#68756c}.flex{color:#426b74}.replacement{font-weight:600}details{margin-top:25px;background:#ecefe8;padding:16px 22px;border-radius:8px}summary{cursor:pointer;font-weight:700}footer{font-size:13px;border-top:1px solid #bbc7bd;padding-top:20px;color:#627166}.intro{max-width:760px}.badge{display:inline-block;padding:5px 10px;background:#dce8dd;border-radius:4px;font-size:12px}@media(max-width:600px){main{padding:24px 16px}h1{font-size:32px}.section-title{display:block}.section-title span{display:block;margin-top:8px}details{padding:14px}article{gap:8px}}@media print{body{background:white}main{padding:0}nav{display:none}article{break-inside:avoid}details{background:white;border:1px solid #ddd}a{color:inherit}h2{break-after:avoid}}
  </style><main><header><div class="eyebrow">Vaughan Brief · Editorial review</div><h1>${ISSUE_LABEL} shortlist</h1><span class="badge">R6 demonstration ${esc(VERSION)} · Editor decides</span><p class="intro">Five proposed events for each section, followed by ranked replacements. Event window: ${WINDOW_LABEL}. This version applies your feedback on the ${week.reviewedLabel} shortlists. Review the reasons, flag weak choices, and tell us which alternatives you prefer.</p><p class="meta">Event details reflect the ${SNAPSHOT_LABEL} snapshot. Prices and booking availability require confirmation where flagged. Alternatives are assessed as one replacement at a time.</p></header><nav>${SECTIONS.map((s,i)=>`<a href="#${i}">${esc(s)}</a>`).join('')}</nav>${blocks}<footer>Prepared from ${packet.coverage.all_candidates} candidates, with ${packet.candidates.length} compared using GPT-5.6 Terra, recent publication history, selected historical examples and available event-page evidence. Historical clicks run through ${esc(packet.coverage.click_history_through)} and are contextual evidence. This preview has not been sent or published.<p>For feedback: which pick would you replace, with which alternative, and why?</p></footer></main></html>`;
  const md=['# Vaughan Brief — '+ISSUE_LABEL+' editor preview ('+VERSION+')','', 'Event window: '+WINDOW_LABEL+'. Demo recommendations; editor makes the final decision.',''];
  for(const section of SECTIONS){md.push('## '+section,'');const s=ranked.sections.find(s=>s.section===section);
    for(const p of result.picks.filter(p=>p.Section===section)){const row=s.ordered.find(r=>r.id===p.ItemID),f=byId.get(p.ItemID).snapshot_fields;
      md.push(`${p.Slot}. **[${f['Event Title']}](${f.URL})** — ${f['Start Date']} · ${f.LocationName||'Venue unconfirmed'} · ${f.CostRaw||'Price unconfirmed'}`,`   ${row.reason}`);
      if(row.warnings.length)md.push('   Check: '+row.warnings.join(' '));md.push('');}
    md.push('### Ordered alternatives','');alts[section].filter(a=>a.replaceable_slots.length).slice(0,5).forEach((row,i)=>{const f=byId.get(row.id).snapshot_fields;md.push(`${i+1}. **[${f['Event Title']}](${f.URL})** — ${f['Start Date']} · ${f.LocationName||'Venue unconfirmed'}`,`   ${row.reason}`,`   Can replace pick ${row.replaceable_slots.join(', ')}. ${row.warnings.join(' ')}`,'');});
  }
  return {html,md:md.join('\n')};
}
// Which section is short, and by how much. Same two floors the per-run finalize asserted.
function supplyProblems(result,alts){
  const supply=Object.fromEntries(SECTIONS.map(s=>[s,{picks:PICKS-result.shortfalls[s],replaceable_alternatives:alts[s].filter(a=>a.replaceable_slots.length).length}]));
  const problems=SECTIONS.flatMap(s=>[
    supply[s].picks<PICKS?s+': '+supply[s].picks+' of '+PICKS+' picks filled':null,
    supply[s].replaceable_alternatives<ALTERNATIVES?s+': '+supply[s].replaceable_alternatives+' of '+ALTERNATIVES+' replaceable alternatives':null].filter(Boolean));
  return {supply,problems};
}
// ---- Console bundle inputs (ship-plan item 10a). to-bundle.js reads both; neither is sent to the model. ----
// Built only from fields already on the candidate: no model call, no page fetch. Always non-empty.
function fallbackDescription(f){
  const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
  const date=String(f['Start Date']||'').slice(0,10),place=[f.LocationName,f.City].map(clean).filter(Boolean).join(', ');
  const when=[isDate(date)?longLabel(date):'',place?'at '+place:''].filter(Boolean).join(' '),source=clean(f.Source);
  return [clean(f['Event Title']),when&&when[0].toUpperCase()+when.slice(1),'No description was supplied by the source'+(source?' ('+source+')':'')]
    .filter(Boolean).map(s=>/[.!?]$/.test(s)?s:s+'.').join(' ');
}
// Series rule (Ariel, 2026-10-13): listings with the same title are one series, whatever the venue or time.
// The key is the lowercase, whitespace-collapsed title, the same one R7 and scripts/r6 use (Decision_Log §92).
function seriesId(c){return normTitle(c.snapshot_fields['Event Title'])||'id:'+c.record_id;}
// One row per event the preview shows: every pick, plus the alternatives render() lists. description_source
// tells the snapshot's own text ('source') from the sentence built above ('fallback').
// classification (Ariel, 2026-10-13): every event shown here was placed in a section by the ranker, so each
// is 'classified'. 'unclassified' is for an event that reached the console without going through the ranker.
function displayedEvents(issue,packet,result,alts){
  const byId=new Map(packet.candidates.map(c=>[c.record_id,c]));
  const ids=[...new Set([...result.picks.map(p=>p.ItemID),
    ...SECTIONS.flatMap(s=>(alts[s]||[]).filter(a=>a.replaceable_slots.length).slice(0,ALTERNATIVES).map(a=>a.id))])].sort();
  return {schema_version:'issue-build-displayed/2',issue_date:issue,
    fallback_note:'description_source "fallback": the snapshot has no description; the text is the title, date, venue, city and source from the snapshot.',
    events:ids.map(id=>{
      const c=byId.get(id);assert(c,'Displayed event '+id+' is not in the ranking packet');
      const raw=c.snapshot_fields.DescriptionRaw,fromSource=typeof raw==='string'&&raw.trim().length>0;
      return {id,series_id:seriesId(c),classification:'classified',
        description:fromSource?raw:fallbackDescription(c.snapshot_fields),description_source:fromSource?'source':'fallback'};
    })};
}
// Every finished run beside this one: a folder holding run_manifest.json under the output root or next to the run folder.
function finishedManifests(dir,io=fs){
  const folders=[...new Set([abs(OUT_ROOT),path.dirname(dir)])].filter(root=>io.existsSync(root)).flatMap(root=>io.readdirSync(root).map(n=>path.join(root,n)));
  return [...new Set(folders)].filter(p=>p!==dir&&io.existsSync(path.join(p,'run_manifest.json'))).map(p=>JSON.parse(io.readFileSync(path.join(p,'run_manifest.json'),'utf8')));
}
// Per-issue build number: one more than the finished builds for this issue date, and never at or below a
// number one of them already carries. A run finished before the field existed counts as one build.
function nextBuildVersion(issue,manifests){
  const same=manifests.filter(m=>m?.issue_date===issue);
  return Math.max(same.length,...same.map(m=>m.build_version).filter(v=>Number.isSafeInteger(v)&&v>0))+1;
}
// Pure: a repaired ranking in, a checked slate and its preview out. Throws ThinSupplyError before anything is rendered.
function buildSlate(week,packet,ranking){
  const ranked=validateRanking(ranking,packet.candidates,packet.history);
  const result=allocate(week.issue,packet.candidates,ranked),alts=alternatives(week.issue,packet.candidates,ranked,result.picks);
  const {supply,problems}=supplyProblems(result,alts),byId=new Map(packet.candidates.map(c=>[c.record_id,c]));
  const checks={unique_ids:new Set(result.picks.map(p=>p.ItemID)).size===result.picks.length,
    filled_sections:Object.values(result.shortfalls).every(n=>n===0),alternatives:SECTIONS.every(s=>supply[s].replaceable_alternatives>=ALTERNATIVES),
    no_form_urls:!ranked.sections.some(s=>s.ordered.some(o=>isFormUrl(byId.get(o.id).snapshot_fields.URL)))};
  if(problems.length)throw new ThinSupplyError('Thin supply: '+problems.join('; ')+'. No editor preview was rendered; inspect allocation.json.',{ranked,result,alts,checks,supply});
  assert(checks.unique_ids,'A record was allocated twice');assert(checks.no_form_urls,'Form-linked record in the ranked pool (Decision_Log §101)');
  return {ranked,result,alts,checks,supply,displayed:displayedEvents(week.issue,packet,result,alts),output:render(week,packet,ranked,result,alts)};
}
function receiptText(week,manifest){
  const r=manifest.repair_receipt,line=c=>'  - '+[c.defect,c.type||c.op,c.title||c.record_id||c.id||c.section,c.effect||c.action].filter(Boolean).join(' · ');
  return ['# Issue build receipt — '+week.issueLong+' ('+week.version+')','',
    '**'+HUMAN_REVIEW+'**','','Reviewed by: ________________    Reviewed at: ________________','',
    'Record it with `node scripts/issue-build/issueBuild.js signoff --issue '+week.issue+' --by "<name>"` (writes `human_review.json`), or fill the line above.','',
    '- Mode: '+manifest.mode+(manifest.replay?' — replayed '+manifest.replay.source+'; no model call was made':''),
    '- Git SHA: '+manifest.git.sha+(manifest.git.producer_paths_uncommitted?.length?' (producer files uncommitted: '+manifest.git.producer_paths_uncommitted.length+')':''),
    '- Prompt template sha256: '+manifest.prompt_template_sha256,
    '- Event window: '+week.windowLabel+' · snapshot '+week.snapshot,
    '- Form links (Decision_Log §101): '+manifest.form_url_exclusions.length+' record(s) kept out of the shortlist; '+manifest.shortlist_form_url_matches+' shortlist URL(s) match',
    '- Supply: '+SECTIONS.map(s=>s+' '+manifest.supply[s].picks+' picks / '+manifest.supply[s].replaceable_alternatives+' replaceable alternatives').join('; '),
    '- Repairs to the model response: '+r.automatic.length+' automatic, '+r.hand_corrections.length+' from the corrections file',
    ...r.automatic.map(line),...r.hand_corrections.map(line),''].join('\n');
}
function finalize(dir,opts={}){
  assert(has(dir,'week.json')&&has(dir,'request_manifest.json'),'No prepared request in '+rel(dir)+'; run prepare first');
  assert(!has(dir,'ranked_pool.json'),'Already finalized: '+rel(dir)+' holds a ranked pool. Outputs are never replaced; build into a fresh run folder (--version or --run-dir).');
  const week=read(dir,'week.json'),d=verifyInputs(dir,week.issue),packet=read(dir,'ranking_packet.json'),m=read(dir,'request_manifest.json'),request=read(dir,'request.json');
  assert(m.request_key===requestKey(request,m.code_sha256),'Saved request mismatch');
  assert(sha(fs.readFileSync(path.join(dir,'ranking_packet.json')))===m.packet_sha256,'Saved packet mismatch');
  if(opts.response){
    // Replay: a saved response stands in for the paid call. It answered the request it was saved with, not necessarily this one.
    assert(!has(dir,'response.json')&&!has(dir,'attempt.json'),'This run folder already holds a response or a call attempt; replay into a fresh run folder');
    fs.copyFileSync(abs(opts.response),path.join(dir,'response.json'),fs.constants.COPYFILE_EXCL);
    save(dir,'replay.json',{replayed_at:new Date().toISOString(),source:rel(opts.response),response_sha256:sha(fs.readFileSync(path.join(dir,'response.json'))),model_calls_by_this_run:0,
      this_run_request_sha256:m.request_sha256,note:'Saved response replayed. It was produced for the request stored beside it, which can differ from this run\'s request.json.'});
  }
  assert(has(dir,'response.json'),'No response.json in '+rel(dir)+'; run call, or pass --response <file> to replay a saved one');
  const raw=fs.readFileSync(path.join(dir,'response.json')),body=JSON.parse(raw),replay=has(dir,'replay.json')?read(dir,'replay.json'):null;
  if(opts.corrections&&path.resolve(abs(opts.corrections))!==path.join(dir,'corrections.json'))fs.copyFileSync(abs(opts.corrections),path.join(dir,'corrections.json'),fs.constants.COPYFILE_EXCL);
  const corrections=has(dir,'corrections.json')?read(dir,'corrections.json'):null;
  // Read before anything is saved: an unreadable sibling manifest must stop the run while finalize can still be rerun.
  const buildVersion=nextBuildVersion(week.issue,finishedManifests(dir));
  const {ranking,receipt}=repair(parseResponse(body),{responseSha:sha(raw),formExcluded:formLinked(d),corrections,
    correctionsSource:corrections?(opts.corrections?rel(opts.corrections):rel(path.join(dir,'corrections.json'))):null,knownIds:packet.candidates.map(c=>c.record_id)});
  let built;
  try{built=buildSlate(week,packet,ranking);}
  catch(e){
    if(!(e instanceof ThinSupplyError))throw new Error('Model response failed validation after repair: '+e.message+'. Nothing was rendered. Record the hand repair in '+rel(path.join(dir,'corrections.json'))+' (README, "Corrections file") and rerun finalize.');
    save(dir,'ranked_pool.json',e.detail.ranked);save(dir,'allocation.json',{...e.detail.result,alternatives:e.detail.alts});save(dir,'validation.json',{...e.detail.checks,supply:e.detail.supply});
    throw e;
  }
  const {ranked,result,alts,checks,supply,displayed,output}=built;
  if(!has(dir,'usage.json'))save(dir,'usage.json',usageFrom(body,m,Boolean(replay)));
  const usage=read(dir,'usage.json');
  save(dir,'ranked_pool.json',ranked);save(dir,'allocation.json',{...result,alternatives:alts});save(dir,'validation.json',{...checks,supply});
  save(dir,'displayed_events.json',displayed);
  save(dir,'editor_preview.html',output.html);save(dir,'editor_preview.md',output.md);
  const manifest={schema_version:'issue-build-run/1',issue_date:week.issue,version:week.version,build_version:buildVersion,window:[week.windowStart,week.windowEnd],finished_at:new Date().toISOString(),
    mode:replay?'replay':'live',replay,git:git(),git_at_prepare:m.git,
    prompt_template_sha256:m.prompt_template_sha256,editor_rules_template_sha256:m.editor_rules_template_sha256,guidance_sha256:m.guidance_sha256,prompt_rendered_sha256:m.prompt_rendered_sha256,
    human_review:{required:true,statement:HUMAN_REVIEW,reviewed_by:null,reviewed_at:null,recorded_in:'human_review.json (signoff command) or the line in RECEIPT.md'},
    repair_receipt:receipt,form_url_exclusions:m.form_url_exclusions,shortlist_form_url_matches:m.shortlist_form_url_matches,page_evidence:m.page_evidence,
    request_key:m.request_key,request_code_sha256:m.code_sha256,render_code_sha256:codeIdentity(),
    allocator_sha256:sha(fs.readFileSync(path.join(ROOT,'scripts/buildIssues.js'))),response_sha256:sha(raw),
    ranked_pool_sha256:sha(fs.readFileSync(path.join(dir,'ranked_pool.json'))),allocation_sha256:sha(fs.readFileSync(path.join(dir,'allocation.json'))),
    displayed_events_sha256:sha(fs.readFileSync(path.join(dir,'displayed_events.json'))),editor_html_sha256:sha(output.html),checks,supply,cost_usd:usage.estimated_usd,history_warning:week.history_warning,
    projection:'Local Approved eligibility only; originals stay New/Approved. No Airtable mutation. Shared candidates retained until allocator-backed scarcity resolution.',
    architecture:'Provisional demo adapter; production buildIssues.js unchanged. Not a production cutover.'};
  save(dir,'run_manifest.json',manifest);save(dir,'RECEIPT.md',receiptText(week,manifest));
  console.log('Repairs: '+receipt.automatic.length+' automatic, '+receipt.hand_corrections.length+' from corrections file.');
  console.log('Editor preview created: '+path.join(dir,'editor_preview.html'));
  console.log(HUMAN_REVIEW+' See '+rel(path.join(dir,'RECEIPT.md')));
  return dir;
}
// Replay = stage 1 + stage 3 from a saved response. Never fetches pages, never calls the model, never loads credentials.
async function replay(issue,opts={}){
  assert(opts.response,'replay needs --response <saved response.json>');
  assert(Boolean(opts.pageEvidence)!==Boolean(opts.noPageEvidence),'replay never fetches pages: pass --page-evidence <saved page_evidence.json>, or --no-page-evidence');
  assert(fs.existsSync(abs(opts.response)),'No such response file: '+opts.response);
  const dir=await prepare(issue,{...opts,fetchPages:false});
  return finalize(dir,{response:opts.response,corrections:opts.corrections});
}
function signoff(dir,by){
  assert(by&&String(by).trim(),'signoff needs --by "<name of the person who reviewed the slate>"');
  assert(has(dir,'run_manifest.json'),'No finished slate in '+rel(dir));
  save(dir,'human_review.json',{reviewed_by:String(by).trim(),reviewed_at:new Date().toISOString(),
    run_manifest_sha256:sha(fs.readFileSync(path.join(dir,'run_manifest.json'))),editor_html_sha256:sha(fs.readFileSync(path.join(dir,'editor_preview.html')))});
  console.log('Human review recorded: '+rel(path.join(dir,'human_review.json')));
}

// ---- CLI ----
const USAGE='Use: issueBuild.js <prepare|call|finalize|replay|signoff> --issue YYYY-MM-DD [flags]  (see scripts/issue-build/README.md)';
const VALUE_FLAGS={'--issue':'issue','--version':'version','--demo-number':'demoNumber','--r7-dir':'r7Dir','--snapshot':'snapshot','--run-dir':'runDir',
  '--page-evidence':'pageEvidence','--response':'response','--corrections':'corrections','--recent-issues':'recentIssues','--python':'python','--by':'by'};
const BOOLEAN_FLAGS={'--fetch-pages':'fetchPages','--no-page-evidence':'noPageEvidence'};
function parseArgs(argv){
  const opts={};
  for(let i=0;i<argv.length;i++){const a=argv[i];
    if(VALUE_FLAGS[a]){assert(i+1<argv.length,a+' needs a value');opts[VALUE_FLAGS[a]]=argv[++i];}
    else if(BOOLEAN_FLAGS[a])opts[BOOLEAN_FLAGS[a]]=true;
    else throw new Error('Unknown flag '+a+'. '+USAGE);}
  if(opts.demoNumber!==undefined)opts.demoNumber=Number(opts.demoNumber);
  if(opts.recentIssues)opts.recentIssues=opts.recentIssues.split(',').map(s=>s.trim());
  return opts;
}
// Thin supply exits 2 so a wrapper can tell "not enough events" from a broken run (1).
function runGuarded(fn){
  return Promise.resolve().then(fn).catch(e=>{console.error('Issue build stopped: '+e.message);process.exitCode=e instanceof ThinSupplyError?2:1;});
}
function main(argv){
  const command=argv[0];
  return runGuarded(()=>{
    const opts=parseArgs(argv.slice(1));
    assert(opts.issue||(opts.runDir&&['call','execute','finalize','signoff'].includes(command)),'--issue YYYY-MM-DD is required. '+USAGE);
    if(command==='prepare'){assert(!(opts.pageEvidence&&opts.fetchPages),'Pass --page-evidence or --fetch-pages, not both');return prepare(opts.issue,opts);}
    if(command==='call'||command==='execute')return execute(findRun(opts.issue,opts));
    if(command==='finalize')return finalize(findRun(opts.issue,opts),{response:opts.response,corrections:opts.corrections});
    if(command==='replay')return replay(opts.issue,opts);
    if(command==='signoff')return signoff(findRun(opts.issue,opts),opts.by);
    throw new Error(USAGE);
  });
}
module.exports={SECTIONS,PICKS,ALTERNATIVES,POOL_FLOOR,HUMAN_REVIEW,ThinSupplyError,urlKey,sameOpportunity,historyFor,requestKey,validateRanking,allocate,alternatives,
  shortlist,formLinked,assertPoolSupply,supplyProblems,buildSlate,fallbackDescription,seriesId,displayedEvents,finishedManifests,nextBuildVersion,weekContext,recentIssues,windowLabel,fill,templateValues,addDays,receiptText,parseArgs,runGuarded,TEMPLATES,EXAMPLES};
if(require.main===module)main(process.argv.slice(2));
