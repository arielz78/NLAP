// Weekly pipeline chain (ship-plan item 4a): one operator command that runs the build stages for one issue date.
// It runs the existing scripts as child processes and holds none of their logic. Stages run in order; the first
// failure stops the run, names the stage and exits non-zero; a rerun skips every stage whose output is on disk.
// It never runs `signoff`: a person reviews the slate. Use: node scripts/issue-build/runWeek.js --issue YYYY-MM-DD
'use strict';
const fs=require('node:fs'), path=require('node:path'), child=require('node:child_process');
const {addDays,HUMAN_REVIEW}=require('./issueBuild.js');
const ROOT=path.resolve(__dirname,'../..');
const OUT_ROOT='data/tracking/issue_build', R7_ROOT='data/tracking/r7_live_runner', SNAPSHOTS='data/tracking/snapshots', HISTORY='data/beehiiv/issue_history.json';
const PRODUCER='scripts/issue-build/issueBuild.js', LIVE_RUNNER='models/sectioning/live_runner.py';
const STAGES=['snapshot','r1-freshness','history','r7-score','prepare','call','finalize'];
// R1 runs in n8n behind a manual trigger and nothing in this repo can start it, so this command only checks
// that it ran: the newest candidate in the snapshot must have been created within this many hours of the capture.
const R1_MAX_AGE_HOURS=24;
// A snapshot taken longer ago than this is not reused for a week that has no R7 folder yet; a new one is taken.
const SNAPSHOT_REUSE_HOURS=24;
// Exit codes: 1 a stage failed; 2 thin supply (as the producer); 3 the producer's validation stop, which is the
// normal first ending of `finalize` (record the repair in corrections.json and rerun this command).
const EXIT={failed:1,thin:2,validation:3};
const VALIDATION_STOP='failed validation after repair';
class StageError extends Error{constructor(message,code=EXIT.failed){super(message);this.name='StageError';this.code=code;}}

const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&addDays(s,0)===s;
const isStamp=s=>/^\d{4}-\d{2}-\d{2}_\d{4}$/.test(String(s));
const hours=ms=>ms/3600000;
function stop(ok,message,code){if(!ok)throw new StageError(message,code);}

// ---- What is on disk for this issue date. Every "already present" decision is one of these lookups. ----
function context(issue,opts,deps){
  const abs=p=>path.resolve(deps.root,p), has=p=>fs.existsSync(abs(p));
  const names=dir=>has(dir)?fs.readdirSync(abs(dir)).sort():[];
  const c={issue,opts,abs,has,stamp:null,
    python:opts.python||(process.platform==='win32'?'models/.venv/Scripts/python.exe':'models/.venv/bin/python'),
    snapshotFile:(kind,stamp)=>SNAPSHOTS+'/'+kind+'_'+stamp+'.json',
    // Complete snapshots only: the candidates file and the issue-items file with the same stamp.
    snapshots:()=>names(SNAPSHOTS).map(n=>(/^candidates_(\d{4}-\d{2}-\d{2}_\d{4})\.json$/.exec(n)||[])[1])
      .filter(s=>s&&has(c.snapshotFile('issueitems',s))),
    // The R7 folder for this issue names the snapshot it scored; once it exists the week is pinned to that snapshot.
    r7Folders:()=>names(R7_ROOT).filter(n=>n.startsWith('issue_'+issue+'_snapshot_')&&isStamp(n.slice(n.lastIndexOf('_snapshot_')+10))),
    r7Dir:()=>R7_ROOT+'/issue_'+issue+'_snapshot_'+c.stamp,
    scored:()=>has(c.r7Dir()+'/scored_survivors.jsonl'),
    // The producer's run folder for this issue and snapshot; --version picks one when a date has several.
    runDir:()=>{
      const tail='_'+issue+'_snapshot_'+c.stamp;
      const hits=names(OUT_ROOT).filter(n=>opts.version?n===opts.version+tail:n.endsWith(tail));
      stop(hits.length<2,'Several run folders for '+issue+' on snapshot '+c.stamp+' ('+hits.join(', ')+'); pass --version <one of them>, or a new --version to build another');
      return hits.length?OUT_ROOT+'/'+hits[0]:null;
    },
    prepared:()=>{const dir=c.runDir();return dir&&has(dir+'/request_manifest.json')?dir:null;}};
  return c;
}
function readSnapshot(c,stamp){
  const s=JSON.parse(fs.readFileSync(c.abs(c.snapshotFile('candidates',stamp)),'utf8'));
  const captured=Date.parse(s.capturedAt), created=(s.records||[]).map(r=>Date.parse(r.createdTime)).filter(Number.isFinite);
  stop(Number.isFinite(captured)&&created.length,'Snapshot '+stamp+' has no capturedAt or no dated records');
  return {captured,newestAgeHours:hours(captured-Math.max(...created))};
}
const maxAge=c=>c.opts.r1MaxAgeHours??R1_MAX_AGE_HOURS;
function run(deps,c,cmd,args,capture){
  deps.log('  $ '+[cmd,...args].map(a=>/\s/.test(a)?'"'+a+'"':a).join(' '));
  const r=deps.exec(cmd,args,{cwd:deps.root,capture:Boolean(capture)});
  return {status:r.status??1,stderr:String(r.stderr||'')};
}
const node=(deps,c,args,capture)=>run(deps,c,process.execPath,args,capture);
const ran=detail=>({status:'ran',detail}), skipped=detail=>({status:'skipped (already present)',detail});

// ---- Stages. Each returns ran/skipped or throws; none repeats work whose output is already on disk. ----
const RUNNERS={
  // Stage 1: scripts/snapshotCandidates.js. Read-only against Airtable; writes one timestamped pair of files.
  snapshot(c,deps){
    const {opts}=c, all=c.snapshots(), pinned=c.r7Folders().at(-1);
    if(opts.snapshot){stop(all.includes(opts.snapshot),'--snapshot '+opts.snapshot+': no such snapshot pair under '+SNAPSHOTS);c.stamp=opts.snapshot;return skipped(c.snapshotFile('candidates',c.stamp)+' (--snapshot)');}
    if(pinned){c.stamp=pinned.slice(pinned.lastIndexOf('_snapshot_')+10);stop(all.includes(c.stamp),'R7 folder '+pinned+' names snapshot '+c.stamp+', which is not under '+SNAPSHOTS);
      return skipped(c.snapshotFile('candidates',c.stamp)+' (the snapshot R7 folder '+pinned+' was built on)');}
    const latest=all.at(-1);
    if(latest){
      // Reuse today's snapshot on a rerun. A snapshot that failed the R1 check is not reused: after R1 runs, a new one is needed.
      const s=readSnapshot(c,latest),age=hours(deps.now()-s.captured);
      if(age>=0&&age<=SNAPSHOT_REUSE_HOURS&&(opts.skipR1||s.newestAgeHours<=maxAge(c))){c.stamp=latest;return skipped(c.snapshotFile('candidates',latest));}
    }
    const started=deps.now(), r=node(deps,c,['scripts/snapshotCandidates.js']);
    stop(r.status===0,'snapshotCandidates.js exited '+r.status);
    const made=c.snapshots().at(-1);
    stop(made&&readSnapshot(c,made).captured>=started-60000,'snapshotCandidates.js exited 0 but wrote no new snapshot pair under '+SNAPSHOTS);
    c.stamp=made;return ran(c.snapshotFile('candidates',made));
  },
  // Stage 2: did R1 run? Nothing here can start it, so this is a check on the snapshot, with an explicit override.
  'r1-freshness'(c){
    if(c.opts.skipR1)return {status:'skipped (--skip-r1)',detail:'R1 was not checked'};
    if(c.scored())return skipped(c.r7Dir()+'/scored_survivors.jsonl (this snapshot is already scored)');
    const age=readSnapshot(c,c.stamp).newestAgeHours;
    stop(age<=maxAge(c),'The newest candidate in snapshot '+c.stamp+' was created '+age.toFixed(1)+' hours before the capture (limit '+maxAge(c)+'). R1 has not run for this week. '
      +'Run the "NLAP R1" workflow in n8n (it has a manual trigger only; nothing in this repo can start it), then rerun this command: it takes a new snapshot. '
      +'To build on this snapshot anyway, rerun with --skip-r1.');
    return ran('newest candidate created '+age.toFixed(1)+' h before snapshot '+c.stamp);
  },
  // Stage 3: scripts/fetchBeehiivHistory.js rewrites the publication history the producer reads.
  history(c,deps){
    const latest=()=>{try{return JSON.parse(fs.readFileSync(c.abs(HISTORY),'utf8')).map(i=>i.date).filter(Boolean).sort().at(-1)||null;}catch{return null;}};
    const want=addDays(c.issue,-7), mtime=()=>c.has(HISTORY)?fs.statSync(c.abs(HISTORY)).mtimeMs:null;
    // A prepared run folder holds a hash of this file; rewriting it would make `call` and `finalize` refuse.
    if(c.prepared())return skipped(HISTORY+' (already read into '+c.prepared()+')');
    if(latest()>=want)return skipped(HISTORY+' (through '+latest()+')');
    const before=mtime(), r=node(deps,c,['scripts/fetchBeehiivHistory.js']);
    stop(r.status===0,'fetchBeehiivHistory.js exited '+r.status);
    // That script logs an API error and still exits 0, so an unchanged file is the only sign that it failed.
    stop(mtime()!==null&&mtime()!==before&&latest(),'fetchBeehiivHistory.js exited 0 but did not rewrite '+HISTORY+'; read its output above');
    return ran(HISTORY+' (through '+latest()+(latest()<want?'; WARNING: '+want+' is not published yet, so the producer will warn that recency guidance is a week back':'')+')');
  },
  // Stage 4: the R7 live runner, once: it applies the eligibility rules, then makes its paid embedding calls and
  // scores. The runner does the local part first, so a bad snapshot or window fails before anything is paid for.
  // Never repeated once scored_survivors.jsonl exists; the runner itself reuses a complete embedding cache in the
  // folder, so a failed fit does not pay twice.
  'r7-score'(c,deps){
    const marker=c.r7Dir()+'/scored_survivors.jsonl';
    if(c.scored())return skipped(marker+' (paid embedding calls not repeated)');
    const r=run(deps,c,c.python,['-B',LIVE_RUNNER,'--snapshot',c.snapshotFile('candidates',c.stamp),'--issue-date',c.issue,'--output',c.r7Dir(),'--materialize-embeddings','--allow-network']);
    stop(r.status===0&&c.scored(),'live_runner.py exited '+r.status+(r.status===0?' but wrote no '+marker:''));
    return ran(marker);
  },
  // Stage 5: producer `prepare`. Builds the inputs and the request; fetches public event pages unless told not to.
  prepare(c,deps){
    if(c.prepared())return skipped(c.prepared()+'/request_manifest.json');
    const partial=c.runDir();
    stop(!partial,'Run folder '+partial+' exists without a finished request (an earlier prepare stopped part-way, or on thin supply). The producer never overwrites a run folder: rerun with a new --version.');
    const {opts}=c, r=node(deps,c,[PRODUCER,'prepare','--issue',c.issue,'--r7-dir',c.r7Dir(),...(opts.version?['--version',opts.version]:[]),
      ...(opts.python?['--python',opts.python]:[]),...(opts.noFetchPages?[]:['--fetch-pages'])]);
    stop(r.status===0,'issueBuild.js prepare exited '+r.status,r.status===2?EXIT.thin:EXIT.failed);
    stop(c.prepared(),'issueBuild.js prepare exited 0 but no run folder for '+c.issue+' on snapshot '+c.stamp+' holds a request_manifest.json');
    return ran(c.prepared()+'/request_manifest.json');
  },
  // Stage 6: producer `call`, the one paid model call. A recorded response or attempt is never called again.
  call(c,deps){
    const dir=c.prepared();
    if(c.has(dir+'/response.json'))return skipped(dir+'/response.json (paid model call not repeated)');
    stop(!c.has(dir+'/attempt.json'),dir+'/attempt.json records a model call that left no response. It may have been billed, so it is not repeated here. Inspect it; to call again, build a new run with a new --version.');
    const r=node(deps,c,[PRODUCER,'call','--issue',c.issue,'--run-dir',dir]);
    stop(r.status===0&&c.has(dir+'/response.json'),'issueBuild.js call exited '+r.status+(r.status===0?' but saved no response.json':''));
    return ran(dir+'/response.json');
  },
  // Stage 7: producer `finalize`: repair, validate, allocate, render. Ends at the preview or at the validation stop.
  finalize(c,deps){
    const dir=c.prepared(), preview=dir+'/editor_preview.html';
    if(c.has(dir+'/run_manifest.json')&&c.has(preview))return skipped(preview);
    stop(!c.has(dir+'/ranked_pool.json'),dir+' already holds a ranked pool and no preview: finalize stopped there on thin supply (see allocation.json). The producer never replaces it; build a new run with a new --version.',EXIT.thin);
    const r=node(deps,c,[PRODUCER,'finalize','--issue',c.issue,'--run-dir',dir],true);
    if(r.status!==0&&r.stderr.includes(VALIDATION_STOP))throw new StageError('Validation stop (the producer\'s normal first ending): one defect in the model response needs a hand repair. '
      +'Record it in '+dir+'/corrections.json (scripts/issue-build/README.md, "Corrections file") and rerun this command; the paid call is not repeated.',EXIT.validation);
    stop(r.status===0&&c.has(preview),'issueBuild.js finalize exited '+r.status+(r.status===0?' but rendered no preview':''),r.status===2?EXIT.thin:EXIT.failed);
    return ran(preview);
  }};

function defaultExec(cmd,args,o){
  const r=child.spawnSync(cmd,args,{cwd:o.cwd,encoding:'utf8',stdio:o.capture?['ignore','inherit','pipe']:['ignore','inherit','inherit']});
  if(o.capture&&r.stderr)process.stderr.write(r.stderr);
  if(r.error)return {status:1,stderr:String(r.stderr||'')+r.error.message};
  return r;
}
// Runs the chain. Returns {code, failed, results, preview}; never throws for a stage failure.
function runWeek(issue,opts={},injected={}){
  const deps={root:ROOT,exec:defaultExec,now:()=>Date.now(),log:console.log,error:console.error,...injected};
  if(!isDate(issue))throw new Error('The issue date must be a real date, YYYY-MM-DD'+(issue?' (got '+issue+')':''));
  if(opts.snapshot!==undefined&&!isStamp(opts.snapshot))throw new Error('--snapshot must be a snapshot stamp, YYYY-MM-DD_HHMM');
  if(opts.r1MaxAgeHours!==undefined&&!(opts.r1MaxAgeHours>0))throw new Error('--r1-max-age-hours must be a positive number');
  const c=context(issue,opts,deps), results=[];
  let failed=null, code=0;
  for(const name of STAGES){
    if(failed){results.push({stage:name,status:'not reached',detail:''});continue;}
    deps.log('['+name+']');
    try{results.push({stage:name,...RUNNERS[name](c,deps)});}
    catch(e){
      failed=name;code=e instanceof StageError?e.code:EXIT.failed;
      results.push({stage:name,status:code===EXIT.validation?'stopped (validation)':'failed',detail:e.message});
      deps.error('Stage '+name+(code===EXIT.validation?' stopped: ':' failed: ')+e.message);
    }
  }
  const preview=failed?null:c.prepared()+'/editor_preview.html';
  deps.log('\nWeek build for '+issue+(c.stamp?' on snapshot '+c.stamp:'')+':');
  for(const r of results)deps.log('  '+r.stage.padEnd(13)+r.status+(r.detail&&r.status!=='failed'&&r.status!=='stopped (validation)'?' — '+r.detail:''));
  if(failed)deps.log((code===EXIT.validation?'Stopped at ':'FAILED at ')+failed+'. Earlier stages\' outputs are in place; rerunning this command resumes from '+failed+'.');
  else{deps.log('Editor preview: '+preview);deps.log(HUMAN_REVIEW+' Sign-off is not part of this command: node '+PRODUCER+' signoff --issue '+issue+' --run-dir '+c.prepared()+' --by "<name>"');}
  return {code,failed,results,preview,stamp:c.stamp};
}

// ---- CLI ----
const USAGE='Use: runWeek.js --issue YYYY-MM-DD [--skip-r1] [--r1-max-age-hours N] [--snapshot YYYY-MM-DD_HHMM] [--version vN] [--no-fetch-pages] [--python <path>]';
const VALUE_FLAGS={'--issue':'issue','--snapshot':'snapshot','--version':'version','--python':'python','--r1-max-age-hours':'r1MaxAgeHours'};
const BOOLEAN_FLAGS={'--skip-r1':'skipR1','--no-fetch-pages':'noFetchPages'};
function parseArgs(argv){
  const opts={};
  for(let i=0;i<argv.length;i++){const a=argv[i];
    if(VALUE_FLAGS[a]){if(i+1>=argv.length)throw new Error(a+' needs a value');opts[VALUE_FLAGS[a]]=argv[++i];}
    else if(BOOLEAN_FLAGS[a])opts[BOOLEAN_FLAGS[a]]=true;
    else if(!a.startsWith('-')&&opts.issue===undefined)opts.issue=a;   // the date may be given bare
    else throw new Error('Unknown argument '+a+'. '+USAGE);}
  if(opts.r1MaxAgeHours!==undefined)opts.r1MaxAgeHours=Number(opts.r1MaxAgeHours);
  if(!opts.issue)throw new Error('The issue date is required. '+USAGE);
  return opts;
}
function main(argv){
  try{const {issue,...opts}=parseArgs(argv);process.exitCode=runWeek(issue,opts).code;}
  catch(e){console.error('Week build refused: '+e.message);process.exitCode=1;}
}
module.exports={STAGES,EXIT,R1_MAX_AGE_HOURS,SNAPSHOT_REUSE_HOURS,StageError,runWeek,parseArgs};
if(require.main===module)main(process.argv.slice(2));
