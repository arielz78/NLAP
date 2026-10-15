// Response repair for the weekly issue build. Replaces the per-run, hand-written repair_response.js.
// Three sources of change, all recorded in the repair receipt, applied in this order:
//   automatic (form links) — rows naming a form-linked record are removed (Decision_Log §101).
//   corrections file — hand repairs written as data, each applied only if its precondition holds.
//   automatic (mechanical, ship-plan item 16a) — the four bookkeeping defects validation used to stop on:
//     repeated section, record-id typo, misquoted text, history-ref typo. Each is repaired only when exactly
//     one correction exists; anything else is left for validation, which still stops the run.
// Judgment errors (a pick its own reason rejects, a wrong real record, a recent repeat) are not repaired here.
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

// ---- Mechanical repairs (ship-plan item 16a). ----
// The text a quote is checked against. validateRanking uses this same function.
const recordText=c=>[c.snapshot_fields['Event Title'],c.snapshot_fields.DescriptionRaw,c.page?.text].filter(Boolean).join('\n');
// True when a and b differ by at most one inserted, deleted or substituted character.
function withinOneEdit(a,b){
  if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}
  }
  return edits+(a.length-i)+(b.length-j)<=1;
}
// What "the same text" means for a quote: case, runs of whitespace (spaces, newlines, non-breaking spaces),
// zero-width characters, and typographic quotes, apostrophes and dashes are ignored. Nothing else is.
// Each normalized character remembers the span of source text it came from, so a match maps back to the exact source.
// from/to hold one entry per UTF-16 code unit of out, because indexOf on out counts code units: one entry per
// character put every quote after an emoji one position off ('Tickets $10' came back as 'ickets $100'; Codex, 2026-10-15).
// No NFKC: it also folded 10² into 102, which is more than case, spacing and typography.
function normalized(s){
  let out='';const from=[],to=[];let at=0;
  for(const ch of String(s)){
    let t=ch.replace(/[​-‍⁠﻿]/g,'').replace(/[‘’‚‛′]/g,"'")
      .replace(/[“”„‟″]/g,'"').replace(/[‐-―−]/g,'-').toLowerCase();
    if(/^\s+$/.test(t))t=out===''||out.endsWith(' ')?'':' ';
    for(const c of t){out+=c;for(let u=0;u<c.length;u++){from.push(at);to.push(at+ch.length);}}
    at+=ch.length;
  }
  return {out,from,to};
}
// {exact} when the quote is in the text as written; {to} when it matches exactly one source span once normalized;
// {none} or {ambiguous} otherwise. Two spans that differ only in case or spacing count as two corrections, not one.
function quoteMatch(quote,text){
  if(!quote||text.includes(quote))return {exact:true};
  const q=normalized(quote).out.trim(),src=normalized(text);
  if(!q)return {none:true};
  const spans=new Set();
  for(let k=src.out.indexOf(q);k>=0;k=src.out.indexOf(q,k+1))spans.add(text.slice(src.from[k],src.to[k+q.length-1]));
  return spans.size===1?{to:[...spans][0]}:spans.size?{ambiguous:[...spans]}:{none:true};
}
const AUTH='V1 ship plan item 16a',BY='harness (mechanical repair)';
// A section returned more than once: kept when every copy but one is empty, or all copies are identical.
function repeatedSections(rank,out){
  for(const name of [...new Set(rank.sections.map(s=>s.section))]){
    const idx=rank.sections.map((s,i)=>s.section===name?i:-1).filter(i=>i>=0);
    if(idx.length<2)continue;
    const filled=idx.filter(i=>rank.sections[i].ordered.length>0),same=new Set(idx.map(i=>JSON.stringify(rank.sections[i]))).size===1;
    let keep,why;
    if(filled.length<=1){keep=filled[0]??idx[0];why=filled.length?'kept the only copy with rows':'every copy was empty; kept one';}
    else if(same){keep=idx[0];why='all copies identical; kept the first';}
    else continue; // two different populated lists: which one the model meant is not mechanical
    rank.sections=rank.sections.filter((s,i)=>s.section!==name||i===keep);
    out.push({type:'repeated_section',section:name,copies:idx.length,kept_position:idx.indexOf(keep)+1,
      action:'dropped '+(idx.length-1)+' repeated '+name+' section(s): '+why,authority:AUTH,detected_by:BY});
  }
}
// A ranked id that is not a shortlisted record. Remapped only when exactly one shortlisted id is one character
// away, that id is not already ranked in the section, and the row's quote is in that record's text.
function recordIdTypos(rank,byId,out){
  const ids=[...byId.keys()];
  for(const s of rank.sections)for(const row of s.ordered){
    if(byId.has(row.id))continue;
    if(s.ordered.filter(o=>o.id===row.id).length!==1)continue;
    const near=ids.filter(k=>withinOneEdit(row.id,k));
    if(near.length!==1||s.ordered.some(o=>o.id===near[0]))continue;
    const target=byId.get(near[0]),m=quoteMatch(row.evidence_quote,recordText(target));
    if(typeof row.evidence_quote!=='string'||!row.evidence_quote||!(m.exact||m.to))continue; // no corroborating quote: leave it for a person
    out.push({type:'record_id_typo',section:s.section,from:row.id,to:near[0],title:target.snapshot_fields['Event Title'],
      action:'remapped '+row.id+' -> '+near[0]+' in '+s.section+': the only shortlisted id one character away, and the row\'s quote is in that record',
      authority:AUTH,detected_by:BY});
    row.id=near[0];
  }
}
// A quote not in the record as written. Replaced only when it matches exactly one span of that record's text
// under the normalization above. An added or missing word is a different text and is never repaired.
function misquotes(rank,byId,out){
  for(const s of rank.sections)for(const row of s.ordered){
    const c=byId.get(row.id);if(!c||typeof row.evidence_quote!=='string'||!row.evidence_quote)continue;
    const m=quoteMatch(row.evidence_quote,recordText(c));if(!m.to)continue;
    out.push({type:'quote_text_mismatch',section:s.section,record_id:row.id,title:c.snapshot_fields['Event Title'],from:row.evidence_quote,to:m.to,
      action:'evidence_quote replaced with the record\'s own text, which it matches once case, spacing and typographic punctuation are ignored',
      authority:AUTH,detected_by:BY});
    row.evidence_quote=m.to;
  }
}
// A history ref that does not exist. Remapped only when exactly one ref offered for that record in the packet
// (exact-URL or similar-title publications) is one character away. The reason may rest on the mistyped date.
function historyRefTypos(rank,byId,refs,out){
  for(const s of rank.sections)for(const row of s.ordered){
    const c=byId.get(row.id);if(!c)continue;
    const offered=[...new Set([...(c.exact_url_publication_refs||[]),...(c.weak_lexical_comparable_refs||[])])].filter(r=>refs.has(r));
    row.history_refs=row.history_refs.map(ref=>{
      if(refs.has(ref))return ref;
      const near=offered.filter(r=>withinOneEdit(ref,r));
      if(near.length!==1)return ref;
      out.push({type:'history_ref_typo',section:s.section,record_id:row.id,title:c.snapshot_fields['Event Title'],from:ref,to:near[0],
        action:'remapped history ref '+ref+' -> '+near[0]+': the only ref offered for this record one character away',
        check:'the row\'s reason and warnings were written against the mistyped ref; read them against '+near[0],authority:AUTH,detected_by:BY});
      return near[0];
    });
  }
}
function mechanical(rank,records,historyRefs){
  const out=[],byId=new Map(records.map(c=>[c.record_id,c])),refs=new Set(historyRefs);
  repeatedSections(rank,out);
  if(Array.isArray(rank.sections)&&rank.sections.every(s=>Array.isArray(s.ordered)&&s.ordered.every(o=>o&&typeof o.id==='string'))){
    recordIdTypos(rank,byId,out);misquotes(rank,byId,out);
    if(rank.sections.every(s=>s.ordered.every(o=>Array.isArray(o.history_refs))))historyRefTypos(rank,byId,refs,out);
  }
  return out;
}

// ranking: parsed model output. formExcluded: [{record_id,title,url}] kept out of the shortlist.
// corrections: parsed corrections file or null. records: the packet's candidates (for the mechanical repairs);
// historyRefs: the packet's history refs. Returns a repaired copy plus the receipt; never validates.
function repair(ranking,{responseSha,formExcluded=[],corrections=null,correctionsSource=null,knownIds=[],records=[],historyRefs=[]}){
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
  // Only when no person has corrected this response: run after a corrections file, the quote repair rewrote a
  // person's set_quote ('FREE ENTRY' became 'Free entry'; Codex, 2026-10-15). With a corrections file, whatever
  // the person left is checked by validation as it stands.
  if(!corrections)automatic.push(...mechanical(rank,records,historyRefs));
  const receipt={source_response_sha256:responseSha,corrections_file:correctionsSource,
    changed:automatic.length+hand.length>0,automatic,hand_corrections:hand,rows_before:before,rows_after:count(rank),
    reviewed_ranking_sha256:sha(JSON.stringify(rank,null,2)+'\n'),
    note:'automatic = changed by rule without a person (form links, Decision_Log §101; mechanical repairs, ship-plan item 16a); hand_corrections = applied from the corrections file. Validation runs after this step and repairs nothing.'};
  return {ranking:rank,receipt};
}
module.exports={isFormUrl,repair,OPS,recordText,withinOneEdit,quoteMatch};
