// Response repair for the weekly issue build. Replaces the per-run, hand-written repair_response.js.
// Two sources of change, both recorded in the repair receipt:
//   automatic — rows naming a form-linked record are removed (Decision_Log §101); nothing else is automatic.
//   corrections file — hand repairs written as data, each applied only if its precondition holds.
// Validation still stops the run on any defect it finds; which defects deserve an automatic repair is
// not decided (Decision_Log §102), so none is invented here.
'use strict';
const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const FORM_URL=/forms\.gle|docs\.google\.com\/forms/i;
const isFormUrl=url=>FORM_URL.test(String(url||''));
function need(ok,message){if(!ok)throw new Error(message);}
const count=ranking=>({sections:ranking.sections.map(s=>({section:s.section,ordered:s.ordered.length})),exclusions:ranking.exclusions.length});

// Each op mirrors a hand repair that a past run needed. Preconditions are the ones those scripts checked.
const OPS={
  // Nonexistent id (a dropped character). `to` must be a real record not already ranked in that section.
  remap_id(rank,c,known){
    const rows=rank.sections.filter(s=>s.section===c.section).flatMap(s=>s.ordered);
    const hits=rows.filter(o=>o.id===c.from);
    need(hits.length===1,'expected '+c.from+' ranked once in '+c.section);
    need(known.has(c.to),c.to+' is not a shortlisted record');need(!rows.some(o=>o.id===c.to),c.to+' already ranked in '+c.section);
    hits[0].id=c.to;return 'remapped '+c.from+' -> '+c.to+' in '+c.section;
  },
  // One row out of one section (self-disavowed row, cross-section duplicate).
  drop_row(rank,c){
    const s=rank.sections.filter(x=>x.section===c.section);need(s.length===1,'expected one '+c.section+' section');
    const at=s[0].ordered.map((o,i)=>o.id===c.id?i:-1).filter(i=>i>=0);
    need(at.length===1,'expected '+c.id+' ranked once in '+c.section);
    s[0].ordered.splice(at[0],1);return 'removed from '+c.section+' (was rank '+(at[0]+1)+')';
  },
  // A record out of every section (an editorial removal).
  drop_everywhere(rank,c){
    const from=rank.sections.filter(s=>s.ordered.some(o=>o.id===c.id)).map(s=>s.section);
    need(from.length>0,c.id+' is not ranked in any section');
    for(const s of rank.sections)s.ordered=s.ordered.filter(o=>o.id!==c.id);
    return 'removed from '+from.join(' + ');
  },
  // The schema permits a repeated section. Dropped only when the two copies are identical.
  drop_duplicate_section(rank,c){
    const idx=rank.sections.map((s,i)=>s.section===c.section?i:-1).filter(i=>i>=0);
    need(idx.length===2&&JSON.stringify(rank.sections[idx[0]])===JSON.stringify(rank.sections[idx[1]]),'expected two identical '+c.section+' sections');
    rank.sections.splice(idx[1],1);return 'dropped the second, identical '+c.section+' section';
  },
  // A repeated section whose second copy is empty. Dropped only when exactly one of the two copies has no rows.
  drop_empty_section(rank,c){
    const idx=rank.sections.map((s,i)=>s.section===c.section?i:-1).filter(i=>i>=0);
    const empty=idx.filter(i=>rank.sections[i].ordered.length===0);
    need(idx.length===2&&empty.length===1,'expected two '+c.section+' sections, exactly one of them empty');
    rank.sections.splice(empty[0],1);return 'dropped the empty, repeated '+c.section+' section';
  },
  // A ranked record that also sits in the exclusions (a placement note filed as an exclusion). The ranking is kept.
  drop_exclusion(rank,c){
    const ranked=rank.sections.flatMap(s=>s.ordered).filter(o=>o.id===c.id).length;
    const at=rank.exclusions.map((o,i)=>o.id===c.id?i:-1).filter(i=>i>=0);
    need(ranked===1&&at.length===1,'expected '+c.id+' ranked once and excluded once');
    rank.exclusions.splice(at[0],1);return 'removed from exclusions; ranking kept';
  },
  // Quote that differs from the source text (whitespace). `to` is checked against the record by validation.
  set_quote(rank,c){
    const hits=rank.sections.flatMap(s=>s.ordered).filter(o=>o.id===c.id&&o.evidence_quote===c.from);
    need(hits.length>0,'no row for '+c.id+' carries that quote');
    for(const o of hits)o.evidence_quote=c.to;return 'evidence_quote replaced on '+hits.length+' row(s)';
  },
};

// ranking: parsed model output. formExcluded: [{record_id,title,url}] kept out of the shortlist.
// corrections: parsed corrections file or null. Returns a repaired copy plus the receipt; never validates.
function repair(ranking,{responseSha,formExcluded=[],corrections=null,correctionsSource=null,knownIds=[]}){
  const rank=JSON.parse(JSON.stringify(ranking)),known=new Set(knownIds),automatic=[],hand=[];
  need(Array.isArray(rank.sections)&&Array.isArray(rank.exclusions),'Response has no sections/exclusions arrays');
  for(const s of rank.sections)need(s&&Array.isArray(s.ordered),'Response section has no ordered array');
  const before=count(rank);
  for(const f of formExcluded){
    const removed=rank.sections.flatMap(s=>s.ordered.map((o,i)=>o.id===f.record_id?{section:s.section,rank:i+1}:null).filter(Boolean));
    const excluded=rank.exclusions.some(o=>o.id===f.record_id);
    if(!removed.length&&!excluded)continue;
    for(const s of rank.sections)s.ordered=s.ordered.filter(o=>o.id!==f.record_id);
    rank.exclusions=rank.exclusions.filter(o=>o.id!==f.record_id);
    automatic.push({type:'source_url_is_registration_form',record_id:f.record_id,title:f.title,url:f.url,removed_from:removed,
      removed_from_exclusions:excluded,action:'removed from all sections; allocator backfills',authority:'Decision_Log §101',detected_by:'harness (form-URL rule)'});
  }
  if(corrections){
    need(Array.isArray(corrections.corrections),'Corrections file needs a corrections array');
    need(corrections.source_response_sha256===responseSha,'Corrections refer to another response');
    corrections.corrections.forEach((c,i)=>{
      need(Object.hasOwn(OPS,c.op),'Correction '+(i+1)+': unknown op '+c.op+' (use '+Object.keys(OPS).join(', ')+')');
      let effect;try{effect=OPS[c.op](rank,c,known);}catch(e){throw new Error('Correction '+(i+1)+' ('+(c.defect||c.op)+') precondition failed: '+e.message);}
      hand.push({...c,effect});
    });
  }
  const receipt={source_response_sha256:responseSha,corrections_file:correctionsSource,
    changed:automatic.length+hand.length>0,automatic,hand_corrections:hand,rows_before:before,rows_after:count(rank),
    reviewed_ranking_sha256:sha(JSON.stringify(rank,null,2)+'\n'),
    note:'automatic = removed by rule without a person; hand_corrections = applied from the corrections file. Validation runs after this step and repairs nothing.'};
  return {ranking:rank,receipt};
}
module.exports={isFormUrl,repair,OPS};
