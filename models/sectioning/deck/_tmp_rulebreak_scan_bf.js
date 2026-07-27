/**
 * Task 2 — rule-break scan over the 239 None rows. REPORT ONLY, writes no Airtable, no deck.
 *
 * CLAUDE.md's WRITTEN reject list is exactly four things:
 *   B2B · civic · professional development · non-GTA
 * Nothing else is a written rule. "Too niche" is the breadth criterion (DL§75) and belongs to
 * Wrong fit, NOT Rule-break. "Not an event" / "not English" appear in the R7 plan doc's ladder
 * but are NOT in CLAUDE.md — scanned separately and reported apart, never pooled into the rate.
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const pull = require(path.join(HERE, "_tmp_deck_pull_2026-07-27.json"));
const none = pull.filter((r) => r.Section === "None");

const BF = require(path.join(HERE, 'allevents_backfill_2026-07-27.json'));
const REC = new Map(BF.filter((x) => x.recoveredLen > 0).map((x) => [x.Row, x.recoveredText]));
const txt = (r) => (r.Event || "") + " — " + (r.Details || "") + " " + (REC.get(r.Row) || "");

// ---- rule 1: professional development -------------------------------------------------
const PROFDEV = [
  /\btraining\b/i,
  /\bcertification\b|\bcertificate course\b/i,
  /\bmasterclass\b/i,
  /\bseminar\b/i,
  /\bbootcamp\b/i,
  /\b(1|2|3|one|two|three)[- ]day (workshop|course|training|program)\b/i,
  /\bprofessional development\b|\bCPD\b|\bPMP\b|\bPDU\b/i,
  /\bcareer (fair|workshop|coach)/i,
  /\bresume\b|\bjob (fair|search)\b/i,
  /\bcourse\b(?!.*\b(golf|obstacle|tasting)\b)/i,
  /\bupskill|\bre-?skill/i,
  /\bcontinuing education\b/i,
];
// ---- rule 2: B2B ----------------------------------------------------------------------
const B2B = [
  /\bB2B\b/i,
  /\bvendor management\b|\bsupply chain\b|\bprocurement\b/i,
  /\bbusiness (case|analysis|writing|owners?|network|summit|conference|expo|mixer|breakfast)\b/i,
  /\bfor (realtors|agents|brokers|entrepreneurs|founders|professionals)\b/i,
  /\bnetworking (event|night|mixer|breakfast|lunch)\b/i,
  /\bentrepreneur|\bstartup\b|\bfounders?\b/i,
  /\bsales (training|summit|conference)\b/i,
  /\btrade show\b|\bindustry (summit|conference|expo)\b/i,
  /\bcorporate\b/i,
  /\bSME\b|\bexecutives?\b/i,
  /\bleadership (training|summit|program)\b|\bmanagement skills\b/i,
  /\bfranchis(e|ing)\b/i,
  /\bAGM\b|\bannual general meeting\b/i,
  /\brecruit(ing|ment)\b|\bhiring (event|fair)\b/i,
];
// ---- rule 3: civic --------------------------------------------------------------------
const CIVIC = [
  /\b(city|town) council\b|\bcouncil meeting\b/i,
  /\btown hall\b/i,
  /\bpublic (consultation|meeting|information (session|centre))\b/i,
  /\bcommittee (meeting|of the whole)\b/i,
  /\bbudget (consultation|meeting)\b/i,
  /\ball[- ]candidates\b|\bcandidate (debate|meeting)\b/i,
  /\bward \d+ meeting\b/i,
  /\bopen house\b.*\b(city|municipal|planning|official plan)\b/i,
  /\bofficial plan\b|\bzoning\b|\bby-?law\b/i,
];
// ---- rule 4: non-GTA ------------------------------------------------------------------
// GTA-ish allowlist of allevents city slugs + a foreign-TLD test + explicit far-place names.
const GTA_SLUGS = new Set([
  "toronto", "vaughan", "markham", "richmond-hill", "mississauga", "brampton", "north-york",
  "scarborough", "etobicoke", "woodbridge", "thornhill", "maple", "concord", "aurora",
  "newmarket", "oakville", "burlington", "pickering", "ajax", "whitby", "oshawa", "milton",
  "king-city", "stouffville", "unionville", "vaughan-on", "east-gwillimbury", "georgina",
  "caledon", "halton-hills", "uxbridge", "brock", "clarington", "bradford",
]);
const FAR_PLACES =
  /\b(savannah|georgia|new york|nyc|chicago|london, uk|hamburg|berlin|singapore|dubai|mumbai|delhi|calgary|vancouver|edmonton|montreal|ottawa|winnipeg|halifax|kitchener|waterloo, on|guelph|hamilton, on|barrie|niagara|st\.? catharines|windsor, on|kingston, on|peterborough|orillia|collingwood|muskoka|sudbury|thunder bay)\b/i;

function allEventsSlug(u) {
  try {
    const p = new URL(u).pathname.split("/").filter(Boolean);
    return new URL(u).hostname.includes("allevents.in") ? p[0] : null;
  } catch (e) {
    return null;
  }
}
function foreignEventbrite(u) {
  try {
    const h = new URL(u).hostname;
    return /eventbrite\./.test(h) && !/eventbrite\.(ca|com)$/.test(h);
  } catch (e) {
    return false;
  }
}

// ---- not-in-CLAUDE.md, reported separately -------------------------------------------
const NOT_AN_EVENT = [
  /\bsign-?up form\b|\bregistration form\b/i,
  /\bequipment drive\b|\bdonation drive\b/i,
  /\bsale\b(?!.*\b(garage|bake|book|plant)\b)/i,
  /\bnewsletter\b|\bsubscribe\b/i,
  /\bfundrais(er|ing) (page|campaign)\b/i,
];
const NOT_ENGLISH = /[Ѐ-ӿ֐-׿؀-ۿ一-鿿぀-ヿ가-힯]/;

function firstHit(pats, s) {
  for (const p of pats) {
    const m = s.match(p);
    if (m) return m[0];
  }
  return null;
}

function scan(r) {
  const s = txt(r);
  const hits = [];
  const pd = firstHit(PROFDEV, s);
  if (pd) hits.push({ rule: "prof-dev", ev: pd });
  const b2b = firstHit(B2B, s);
  if (b2b) hits.push({ rule: "B2B", ev: b2b });
  const civ = firstHit(CIVIC, s);
  if (civ) hits.push({ rule: "civic", ev: civ });

  const slug = allEventsSlug(r.Link);
  if (slug && !GTA_SLUGS.has(slug)) hits.push({ rule: "non-GTA", ev: `allevents slug /${slug}/` });
  else if (foreignEventbrite(r.Link)) hits.push({ rule: "non-GTA", ev: `foreign eventbrite tld` });
  else {
    const fp = s.match(FAR_PLACES);
    if (fp) hits.push({ rule: "non-GTA", ev: `place: ${fp[0]}` });
  }

  const extra = [];
  const ne = firstHit(NOT_AN_EVENT, s);
  if (ne) extra.push({ rule: "not-an-event(UNWRITTEN)", ev: ne });
  if (NOT_ENGLISH.test(s)) extra.push({ rule: "not-english(UNWRITTEN)", ev: "non-latin script" });

  return { hits, extra };
}

const scanned = none.map((r) => {
  const { hits, extra } = scan(r);
  return {
    Row: r.Row,
    Event: r.Event,
    Batch: r.Batch,
    Link: r.Link,
    Details: r.Details || "",
    NoneType: r.NoneType || null,
    NoneReasoning: r.NoneReasoning || null,
    ruleBreak: hits.length > 0,
    rules: hits.map((h) => h.rule),
    evidence: hits.map((h) => `${h.rule}: "${h.ev}"`).join(" | "),
    unwritten: extra.map((h) => `${h.rule}: "${h.ev}"`).join(" | "),
  };
});

fs.writeFileSync(path.join(HERE, "_tmp_rulebreak_scan_backfilled.json"), JSON.stringify(scanned, null, 1));

const flagged = scanned.filter((r) => r.ruleBreak);
console.log(`=== scanned ${scanned.length} None rows; ${flagged.length} flagged (${((100 * flagged.length) / scanned.length).toFixed(1)}%)`);
const byRule = {};
for (const r of flagged) for (const rule of r.rules) byRule[rule] = (byRule[rule] || 0) + 1;
console.log("by rule (rows may hit >1):", byRule);
const multi = flagged.filter((r) => r.rules.length > 1).length;
console.log(`multi-rule rows: ${multi}`);
const unwrittenOnly = scanned.filter((r) => !r.ruleBreak && r.unwritten);
console.log(`unwritten-rule-only rows (NOT counted as rule-break): ${unwrittenOnly.length}`);
unwrittenOnly.forEach((r) => console.log(`   r${r.Row} ${r.unwritten} :: ${String(r.Event).slice(0, 60)}`));

// slice split — only the gate slice (batch 4/5? see plan §4.9) is representative; report all three
const bySlice = {};
for (const r of scanned) {
  const k = r.Batch;
  bySlice[k] = bySlice[k] || { n: 0, flagged: 0 };
  bySlice[k].n++;
  if (r.ruleBreak) bySlice[k].flagged++;
}
console.log("\nby batch:", JSON.stringify(bySlice, null, 1));

console.log("\n=== the editor's 12 ===");
const twelve = scanned.filter((r) => r.NoneType);
for (const r of twelve) {
  console.log(
    `r${r.Row} his=${r.NoneType.padEnd(11)} scan=${r.ruleBreak ? "RULE-BREAK" : "no-rule   "} ${r.evidence || ""}`
  );
  console.log(`     ${String(r.Event).slice(0, 70)}`);
  console.log(`     "${r.NoneReasoning || "(none)"}"`);
}

console.log("\n=== all flagged rows ===");
flagged.forEach((r) => console.log(`r${r.Row}\t${r.rules.join("+")}\t${String(r.Event).slice(0, 72)}\t${r.evidence}`));
