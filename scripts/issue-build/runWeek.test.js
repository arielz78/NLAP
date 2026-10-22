// Acceptance cases for the weekly pipeline chain (ship-plan item 4a). Every stage is a stub: the injected exec
// writes the file the real script would write, inside a throwaway root. No network, no model or embedding call,
// no Airtable traffic, no Python. The throwaway roots live under data/tracking/ (gitignored) and are removed.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), child = require('node:child_process');
const w = require('./runWeek.js');
const {addDays} = require('./issueBuild.js');
const REPO = path.resolve(__dirname,'../..'), TMP = path.join(REPO,'data/tracking');
const ISSUE = '2026-10-15', NOW = Date.parse('2026-10-11T16:00:00Z'), HOUR = 3600000;
const ALL = ['snapshot','history','r7-score','prepare','call','finalize'];   // r1-freshness runs no command
const PAID = ['r7-score','call'];
let cases = 0;
const roots = [];
function test(name, fn) {fn(); cases++; console.log('PASS '+name);}

// One throwaway repo root plus an exec stub that stands in for every script the chain calls.
function world(over={}) {
  fs.mkdirSync(TMP,{recursive:true});
  const root = fs.mkdtempSync(path.join(TMP,'.run_week_test_')); roots.push(root);
  const s = {root, calls:[], lines:[], errors:[], now:NOW, stamps:['2026-10-11_1129','2026-10-11_1210','2026-10-11_1300'],
    failAt:null, newestAgeHours:1, version:'v6', finalize:'ok', historyThrough:addDays(ISSUE,-7), historySilentFailure:false, ...over};
  const put = (rel,x) => {const f=path.join(root,rel); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,typeof x==='string'?x:JSON.stringify(x));};
  const arg = (args,flag) => args[args.indexOf(flag)+1];
  s.put = put; s.has = rel => fs.existsSync(path.join(root,rel));
  s.snapshot = (stamp,newestAgeHours=s.newestAgeHours,capturedHoursAgo=0) => {
    const captured = s.now-capturedHoursAgo*HOUR;
    put('data/tracking/snapshots/candidates_'+stamp+'.json',{capturedAt:new Date(captured).toISOString(),
      records:[{id:'rec1',createdTime:new Date(captured-newestAgeHours*HOUR).toISOString(),fields:{}}]});
    put('data/tracking/snapshots/issueitems_'+stamp+'.json',{capturedAt:new Date(captured).toISOString(),records:[]});
  };
  s.exec = (cmd,args,o) => {
    const script = args.find(a=>/\.(js|py)$/.test(a)), sub = args[args.indexOf(script)+1];
    const stage = /snapshotCandidates/.test(script)?'snapshot':/fetchBeehiivHistory/.test(script)?'history'
      :/live_runner/.test(script)?'r7-score':sub;
    s.calls.push({stage,cmd,args,cwd:o.cwd});
    if (s.failAt===stage) {s.atFailure=tree(root); return {status:1,stderr:'stub failure'};}
    if (stage==='snapshot') s.snapshot(s.stamps.shift());
    else if (stage==='history') {
      if (!s.historySilentFailure) {put('data/beehiiv/issue_history.json',[{date:s.historyThrough,events:[]}]);
        const t=new Date(Date.now()+s.calls.length*1000); fs.utimesSync(path.join(root,'data/beehiiv/issue_history.json'),t,t);}
    }
    else if (stage==='r7-score') {
      const out = arg(args,'--output'); put(out+'/scoring_input.jsonl','{}\n'); put(out+'/run_summary.json',{});
      put(out+'/scored_survivors.jsonl','{}\n');
    }
    else if (stage==='prepare') {
      if (s.prepareThin) {put('data/tracking/issue_build/'+s.version+'_'+ISSUE+'_snapshot_'+arg(args,'--r7-dir').slice(-15)+'/week.json',{}); return {status:2,stderr:''};}
      const dir = 'data/tracking/issue_build/'+(args.includes('--version')?arg(args,'--version'):s.version)+'_'+ISSUE+'_snapshot_'+arg(args,'--r7-dir').slice(-15);
      put(dir+'/request.json',{}); put(dir+'/request_manifest.json',{});
    }
    else if (stage==='call') {const dir=arg(args,'--run-dir'); put(dir+'/attempt.json',{}); put(dir+'/response.json',{});}
    else if (stage==='finalize') {
      const dir = arg(args,'--run-dir');
      if (s.finalize==='validation') return {status:1,stderr:'Issue build stopped: Model response failed validation after repair: Unknown candidate recX. Nothing was rendered.'};
      if (s.finalize==='thin') {put(dir+'/ranked_pool.json',{}); return {status:2,stderr:'Issue build stopped: Thin supply: For Couples: 4 of 5 replaceable alternatives'};}
      put(dir+'/ranked_pool.json',{}); put(dir+'/run_manifest.json',{}); put(dir+'/editor_preview.html','<!doctype html>');
    }
    else throw new Error('The chain ran something it must not: '+args.join(' '));
    return {status:0,stderr:''};
  };
  s.run = (opts={},...date) => {s.calls=[]; s.lines=[]; s.errors=[]; const issue=date.length?date[0]:ISSUE;
    return w.runWeek(issue,opts,{root,exec:s.exec,now:()=>s.now,...(s.clock?{clock:s.clock}:{}),log:x=>s.lines.push(x),error:x=>s.errors.push(x)});};
  s.stages = () => s.calls.map(c=>c.stage);
  s.status = (result,stage) => result.results.find(r=>r.stage===stage).status;
  return s;
}
// Every file under the root with its bytes and modified time: "earlier outputs untouched" is this map unchanged.
function tree(root, dir=root, out={}) {
  for (const n of fs.readdirSync(dir)) {const f=path.join(dir,n), st=fs.statSync(f);
    if (st.isDirectory()) tree(root,f,out); else out[path.relative(root,f)]=st.mtimeMs+':'+fs.readFileSync(f,'utf8');}
  return out;
}
const RUN = 'data/tracking/issue_build/v6_'+ISSUE+'_snapshot_2026-10-11_1129', R7 = 'data/tracking/r7_live_runner/issue_'+ISSUE+'_snapshot_2026-10-11_1129';

try {
// ---- The issue date is the only required input, and it must be a real date. ----
test('a missing or malformed issue date is refused before any stage runs',()=>{
  const s=world();
  for (const bad of [undefined,'','2026-10-32','2026-02-30','15-10-2026','2026-10-15T00:00','next thursday']) assert.throws(()=>s.run({},bad),/real date, YYYY-MM-DD/);
  assert.equal(s.calls.length,0); assert.deepEqual(fs.readdirSync(s.root),[]);
  assert.throws(()=>w.parseArgs([]),/issue date is required/);
  assert.throws(()=>w.parseArgs(['--issue']),/needs a value/);
  assert.throws(()=>w.parseArgs(['--issue',ISSUE,'--signoff']),/Unknown argument/);
  assert.deepEqual(w.parseArgs([ISSUE]),{issue:ISSUE}); assert.deepEqual(w.parseArgs(['--issue',ISSUE,'--skip-r1']),{issue:ISSUE,skipR1:true});
  assert.throws(()=>s.run({snapshot:'latest'}),/snapshot stamp/);
});
test('the command line refuses a missing or malformed date with exit 1 and runs nothing',()=>{
  const cli=args=>child.spawnSync(process.execPath,[path.join(__dirname,'runWeek.js'),...args],{encoding:'utf8'});
  for (const args of [[],['2026-13-01'],['--issue','tomorrow']]) {const r=cli(args);
    assert.equal(r.status,1); assert.match(r.stderr,/Week build refused: /); assert.equal(r.stdout,'');}
});

// ---- Order, commands, and where the chain ends. ----
test('stages run in order with the issue date as the only input, and end at the rendered preview',()=>{
  const s=world(), r=s.run();
  assert.deepEqual(s.stages(),ALL); assert.equal(r.code,0); assert.equal(r.failed,null);
  assert.deepEqual(r.results.map(x=>x.stage),w.STAGES); assert.ok(r.results.every(x=>x.status==='ran'));
  assert.equal(r.preview,RUN+'/editor_preview.html'); assert.ok(s.has(r.preview));
  const by=Object.fromEntries(s.calls.map(c=>[c.stage,c]));
  assert.ok(s.calls.every(c=>c.cwd===s.root));
  assert.deepEqual(by.snapshot.args,['scripts/snapshotCandidates.js']); assert.deepEqual(by.history.args,['scripts/fetchBeehiivHistory.js']);
  // The R7 runner goes through the project venv and is called exactly once, with both network flags.
  assert.equal(s.calls.filter(c=>c.stage==='r7-score').length,1); assert.match(by['r7-score'].cmd,/models[\\/]\.venv[\\/]/);
  assert.deepEqual(by['r7-score'].args,['-B','models/sectioning/live_runner.py','--snapshot','data/tracking/snapshots/candidates_2026-10-11_1129.json','--issue-date',ISSUE,'--output',R7,'--materialize-embeddings','--allow-network']);
  assert.deepEqual(by.prepare.args,['scripts/issue-build/issueBuild.js','prepare','--issue',ISSUE,'--r7-dir',R7,'--fetch-pages']);
  assert.deepEqual(by.call.args,['scripts/issue-build/issueBuild.js','call','--issue',ISSUE,'--run-dir',RUN]);
  assert.deepEqual(by.finalize.args,['scripts/issue-build/issueBuild.js','finalize','--issue',ISSUE,'--run-dir',RUN]);
  assert.ok(s.lines.some(l=>/HUMAN REVIEW REQUIRED/.test(l)&&/Sign-off is not part of this command/.test(l)));
});
test('sign-off is never run and never recorded',()=>{
  const s=world(); s.run(); s.run();
  assert.ok(!s.calls.some(c=>c.args.includes('signoff'))); assert.ok(!s.has(RUN+'/human_review.json'));
});
test('the summary lists every stage as ran, skipped, failed or not reached',()=>{
  const s=world({failAt:'r7-score'}), r=s.run();
  const text=s.lines.join('\n');
  for (const stage of w.STAGES) assert.match(text,new RegExp('\\n  '+stage+'\\s+([\\d.]+ s\\s+)?(ran|skipped|failed|not reached)'));
  assert.match(text,/FAILED at r7-score\./);
  assert.deepEqual(r.results.map(x=>x.status),['ran','ran','ran','failed','not reached','not reached','not reached']);
});
test('the summary times every stage that started, and the total',()=>{
  const s=world({failAt:'r7-score'}); let t=0; s.clock=()=>(t+=1500);   // each clock read advances 1.5 s
  const r=s.run(), text=s.lines.join('\n');
  assert.deepEqual(r.results.map(x=>x.seconds),[1.5,1.5,1.5,1.5,undefined,undefined,undefined]);
  assert.match(text,/\n  snapshot\s+1\.5 s\s+ran/); assert.match(text,/\(6\.0 s\):/);
  assert.match(text,/\n  prepare\s+not reached/);
});

// ---- Stop at the first failure; name it; leave earlier outputs alone; resume. ----
for (const stage of ALL) test('a failure in '+stage+' stops there, is named, exits non-zero and leaves earlier outputs intact',()=>{
  const s=world({failAt:stage}), r=s.run();
  assert.equal(r.failed,stage); assert.equal(r.code,1); assert.match(s.errors.join('\n'),new RegExp('^Stage '+stage+' failed: '));
  assert.deepEqual(s.stages(),ALL.slice(0,ALL.indexOf(stage)+1));              // nothing after the failed stage ran
  for (const paid of PAID) if (ALL.indexOf(paid)>ALL.indexOf(stage)) assert.ok(!s.stages().includes(paid));
  const before=tree(s.root); assert.deepEqual(before,s.atFailure);            // the failure itself changed nothing on disk
  // Rerun with the fault cleared: completed stages are skipped, their files are byte- and time-identical.
  s.failAt=null; const again=s.run();
  assert.equal(again.code,0); assert.deepEqual(s.stages(),ALL.slice(ALL.indexOf(stage)));
  const after=tree(s.root); for (const [file,state] of Object.entries(before)) assert.equal(after[file],state,file+' was rewritten');
  for (const done of ALL.slice(0,ALL.indexOf(stage))) assert.equal(s.status(again,done),'skipped (already present)');
});
test('a rerun of a finished week runs nothing and changes nothing',()=>{
  const s=world(); s.run(); const before=tree(s.root), r=s.run();
  assert.deepEqual(s.calls,[]); assert.equal(r.code,0); assert.deepEqual(tree(s.root),before);
  assert.ok(r.results.every(x=>x.status==='skipped (already present)')); assert.equal(r.preview,RUN+'/editor_preview.html');
});

// ---- The paid calls. ----
test('the validation stop exits 3 and the rerun repeats neither the model call nor the embedding calls',()=>{
  const s=world({finalize:'validation'}), r=s.run();
  assert.equal(r.failed,'finalize'); assert.equal(r.code,w.EXIT.validation); assert.equal(s.status(r,'finalize'),'stopped (validation)');
  assert.match(s.errors.join('\n'),/Stage finalize stopped: Validation stop.*corrections\.json/); assert.equal(r.preview,null);
  const response=tree(s.root)[path.join(RUN,'response.json')];
  // The operator records the repair and reruns the same command.
  s.put(RUN+'/corrections.json',{}); s.finalize='ok'; const again=s.run();
  assert.deepEqual(s.stages(),['finalize']); assert.equal(again.code,0);
  assert.match(s.status(again,'call'),/^skipped/); assert.match(again.results.find(x=>x.stage==='call').detail,/paid model call not repeated/);
  assert.match(again.results.find(x=>x.stage==='r7-score').detail,/paid embedding calls not repeated/);
  assert.equal(tree(s.root)[path.join(RUN,'response.json')],response);
});
test('a recorded call attempt with no response is never called again',()=>{
  const s=world({failAt:'call'}); s.run(); s.failAt=null;
  s.put(RUN+'/attempt.json',{}); const r=s.run();
  assert.equal(r.failed,'call'); assert.equal(r.code,1); assert.deepEqual(s.stages(),[]);
  assert.match(s.errors.join('\n'),/may have been billed, so it is not repeated/);
});
test('a failed finalize of any other kind exits 1, and a rerun still does not pay again',()=>{
  const s=world({failAt:'finalize'}), r=s.run();
  assert.equal(r.code,1); s.run(); assert.deepEqual(s.stages(),['finalize']);
});
test('thin supply exits 2 from prepare and from finalize, and a recorded thin stop is not retried',()=>{
  const a=world({prepareThin:true}), ra=a.run();
  assert.equal(ra.failed,'prepare'); assert.equal(ra.code,w.EXIT.thin); assert.ok(!a.stages().includes('call'));
  const again=a.run(); assert.equal(again.failed,'prepare'); assert.deepEqual(a.stages(),[]); assert.match(a.errors.join('\n'),/new --version/);
  const b=world({finalize:'thin'}), rb=b.run();
  assert.equal(rb.failed,'finalize'); assert.equal(rb.code,w.EXIT.thin);
  const rerun=b.run(); assert.deepEqual(b.stages(),[]); assert.equal(rerun.code,w.EXIT.thin); assert.match(b.errors.join('\n'),/thin supply/);
});

// ---- R1: checked, never started. ----
test('a snapshot with no recent candidates stops at r1-freshness before anything is paid for',()=>{
  const s=world({newestAgeHours:170}), r=s.run();
  assert.equal(r.failed,'r1-freshness'); assert.equal(r.code,1); assert.deepEqual(s.stages(),['snapshot']);
  assert.match(s.errors.join('\n'),/NLAP R1.*n8n.*--skip-r1/); assert.ok(!s.has('data/tracking/r7_live_runner'));
  // After R1 has run, the same command takes a new snapshot instead of reusing the stale one.
  s.newestAgeHours=0.5; const again=s.run();
  assert.equal(again.code,0); assert.equal(again.stamp,'2026-10-11_1210'); assert.equal(s.stages()[0],'snapshot');
  assert.ok(s.has('data/tracking/snapshots/candidates_2026-10-11_1129.json'));
});
test('--skip-r1 proceeds on the stale snapshot without retaking it, and says R1 was not checked',()=>{
  const s=world({newestAgeHours:170}); s.run(); const r=s.run({skipR1:true});
  assert.equal(r.code,0); assert.equal(r.stamp,'2026-10-11_1129'); assert.ok(!s.stages().includes('snapshot'));
  assert.equal(s.status(r,'r1-freshness'),'skipped (--skip-r1)');
  // Once the snapshot is scored the week is pinned to it; a later rerun does not ask for the flag again.
  const later=s.run(); assert.equal(later.code,0); assert.deepEqual(s.calls,[]);
});
test('the freshness limit is 24 hours by default and can be changed',()=>{
  const s=world({newestAgeHours:30}); assert.equal(s.run().failed,'r1-freshness');
  assert.equal(world({newestAgeHours:30}).run({r1MaxAgeHours:48}).code,0); assert.equal(world({newestAgeHours:23}).run().code,0);
  assert.throws(()=>s.run({r1MaxAgeHours:0}),/positive number/);
});

// ---- Which snapshot, which run folder. ----
test('a snapshot taken earlier today is reused; an older one is not',()=>{
  const today=world(); today.snapshot('2026-10-11_0900',1,3); today.run();
  assert.ok(!today.stages().includes('snapshot')); assert.ok(today.has('data/tracking/r7_live_runner/issue_'+ISSUE+'_snapshot_2026-10-11_0900'));
  const old=world(); old.snapshot('2026-10-04_1222',1,170); const r=old.run();
  assert.equal(old.stages()[0],'snapshot'); assert.equal(r.stamp,'2026-10-11_1129');
});
test('an existing R7 folder pins the week to its snapshot even when a newer snapshot exists',()=>{
  const s=world(); s.failAt='prepare'; s.run(); s.failAt=null;
  s.snapshot('2026-10-11_1500'); const r=s.run();
  assert.equal(r.stamp,'2026-10-11_1129'); assert.deepEqual(s.stages(),['prepare','call','finalize']);
});
test('--snapshot picks an existing snapshot and refuses one that is not on disk',()=>{
  const s=world(); s.snapshot('2026-10-10_0800',1,32);
  assert.equal(s.run({snapshot:'2026-10-10_0800'}).stamp,'2026-10-10_0800'); assert.ok(!s.stages().includes('snapshot'));
  const r=world().run({snapshot:'2026-10-09_0800'}); assert.equal(r.failed,'snapshot');
});
test('two run folders for one date need --version; a new --version builds a third without touching them',()=>{
  const s=world(); s.run(); s.put(RUN.replace('v6_','v6b_')+'/request_manifest.json',{});
  const before=tree(s.root), r=s.run();
  assert.equal(r.failed,'history'); assert.match(s.errors.join('\n'),/Several run folders.*v6_.*v6b_.*--version/); assert.deepEqual(s.calls,[]);
  assert.equal(s.run({version:'v6'}).code,0); assert.deepEqual(s.calls,[]);
  const third=s.run({version:'v6c'});
  assert.equal(third.code,0); assert.deepEqual(s.stages(),['prepare','call','finalize']); assert.ok(s.calls[0].args.includes('v6c'));
  const after=tree(s.root); for (const [file,state] of Object.entries(before)) assert.equal(after[file],state);
});

// ---- Publication history. ----
test('history is refreshed only when it is behind, and never after the run folder has read it',()=>{
  const s=world(); s.put('data/beehiiv/issue_history.json',[{date:addDays(ISSUE,-7)}]); s.run();
  assert.ok(!s.stages().includes('history'));
  const behind=world({historyThrough:addDays(ISSUE,-14)}), r=behind.run();
  assert.equal(r.code,0); assert.match(r.results.find(x=>x.stage==='history').detail,/WARNING: 2026-10-08 is not published yet/);
  // The prepared run folder holds a hash of the file, so a rerun must not rewrite it.
  behind.run(); assert.ok(!behind.stages().includes('history'));
});
test('a history refresh that exits 0 without rewriting the file is a failure',()=>{
  const s=world({historySilentFailure:true}); s.put('data/beehiiv/issue_history.json',[{date:addDays(ISSUE,-14)}]);
  const r=s.run(); assert.equal(r.failed,'history'); assert.match(s.errors.join('\n'),/did not rewrite/); assert.ok(!s.stages().includes('r7-score'));
});
test('--no-fetch-pages, --version and --python reach the producer; nothing else changes',()=>{
  const s=world(); s.run({noFetchPages:true,version:'v9',python:'C:/py/python.exe'});
  const prepare=s.calls.find(c=>c.stage==='prepare').args;
  assert.ok(!prepare.includes('--fetch-pages')); assert.deepEqual(prepare.slice(-4),['--version','v9','--python','C:/py/python.exe']);
  assert.equal(s.calls.find(c=>c.stage==='r7-score').cmd,'C:/py/python.exe');
});
console.log(cases+' acceptance cases passed.');
} finally {
  for (const root of roots) fs.rmSync(root,{recursive:true,force:true});
}
