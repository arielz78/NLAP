/**
 * B2 + C2/C3 -- re-run the rule-break scan WITH #108 backfilled text and write the results
 * to the deck's `PreMarked` field (a GUESS column: no NoneReason is written, ever).
 *
 * Two deliberate differences from _tmp_rulebreak_scan.js:
 *  1. AllEvents backfilled descriptions are appended before scanning. Measured 2026-07-27:
 *     this takes the flag count 41 -> 51 (+24%) and makes `civic` fire for the first time,
 *     because civic language lives in descriptions and never in titles.
 *  2. B2B and prof-dev are MERGED into one option, per Ariel's 2026-07-28 call (DL §77).
 *
 * The 14 rows already carrying OutsideGTA are not given a non-GTA hint -- they are settled
 * by address, and a hint on top of a fact is noise.
 *
 * DRY RUN by default. Pass --write to actually write.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../../NLAP_Airtable.env") });
const fs = require("fs");

const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = "tblOxYHuAl2yp9Znl";
const F_PREMARKED = "fldWhnKcM6e3epRZt";
const WRITE = process.argv.includes("--write");

const DECK = "c:/NA + Learning/NLAP/models/sectioning/deck/_tmp_deck_pull_2026-07-27.json";
const BACKFILL = "c:/NA + Learning/NLAP/models/sectioning/deck/allevents_backfill_2026-07-27.json";
const OUTGTA = [87, 113, 119, 183, 189, 193, 227, 253, 275, 306, 324, 363, 378, 381];

// --- patterns lifted verbatim from _tmp_rulebreak_scan.js ---
const PROFDEV = [/\btraining\b/i, /\bcertification\b|\bcertificate course\b/i, /\bmasterclass\b/i, /\bseminar\b/i, /\bbootcamp\b/i, /\b(1|2|3|one|two|three)[- ]day (workshop|course|training|program)\b/i, /\bprofessional development\b|\bCPD\b|\bPMP\b|\bPDU\b/i, /\bcareer (fair|workshop|coach)/i, /\bresume\b|\bjob (fair|search)\b/i, /\bcourse\b(?!.*\b(golf|obstacle|tasting)\b)/i, /\bupskill|\bre-?skill/i, /\bcontinuing education\b/i];
const B2B = [/\bB2B\b/i, /\bvendor management\b|\bsupply chain\b|\bprocurement\b/i, /\bbusiness (case|analysis|writing|owners?|network|summit|conference|expo|mixer|breakfast)\b/i, /\bfor (realtors|agents|brokers|entrepreneurs|founders|professionals)\b/i, /\bnetworking (event|night|mixer|breakfast|lunch)\b/i, /\bentrepreneur|\bstartup\b|\bfounders?\b/i, /\bsales (training|summit|conference)\b/i, /\btrade show\b|\bindustry (summit|conference|expo)\b/i, /\bcorporate\b/i, /\bSME\b|\bexecutives?\b/i, /\bleadership (training|summit|program)\b|\bmanagement skills\b/i, /\bfranchis(e|ing)\b/i, /\bAGM\b|\bannual general meeting\b/i, /\brecruit(ing|ment)\b|\bhiring (event|fair)\b/i];
const CIVIC = [/\b(city|town) council\b|\bcouncil meeting\b/i, /\btown hall\b/i, /\bpublic (consultation|meeting|information (session|centre))\b/i, /\bcommittee (meeting|of the whole)\b/i, /\bbudget (consultation|meeting)\b/i, /\ball[- ]candidates\b|\bcandidate (debate|meeting)\b/i, /\bward \d+ meeting\b/i, /\bopen house\b.*\b(city|municipal|planning|official plan)\b/i, /\bofficial plan\b|\bzoning\b|\bby-?law\b/i];
const GTA_SLUGS = new Set(["toronto","vaughan","markham","richmond-hill","mississauga","brampton","north-york","scarborough","etobicoke","woodbridge","thornhill","maple","concord","aurora","newmarket","oakville","burlington","pickering","ajax","whitby","oshawa","milton","king-city","stouffville","unionville","vaughan-on","east-gwillimbury","georgina","caledon","halton-hills","uxbridge","brock","clarington","bradford"]);
const FAR_PLACES = /\b(savannah|georgia|new york|nyc|chicago|london, uk|hamburg|berlin|singapore|dubai|mumbai|delhi|calgary|vancouver|edmonton|montreal|ottawa|winnipeg|halifax|kitchener|waterloo, on|guelph|hamilton, on|barrie|niagara|st\.? catharines|windsor, on|kingston, on|peterborough|orillia|collingwood|muskoka|sudbury|thunder bay)\b/i;

const hit = (pats, s) => pats.some((p) => p.test(s));
function foreignEventbrite(u) { try { const h = new URL(u).hostname; return /eventbrite\./.test(h) && !/eventbrite\.(ca|com)$/.test(h); } catch (e) { return false; } }
function slugOf(u) { try { const url = new URL(u); return url.hostname.includes("allevents.in") ? url.pathname.split("/").filter(Boolean)[0] : null; } catch (e) { return null; } }

(async () => {
  const deck = JSON.parse(fs.readFileSync(DECK, "utf8"));
  const backfill = JSON.parse(fs.readFileSync(BACKFILL, "utf8"));
  const byUrl = new Map();
  for (const b of Array.isArray(backfill) ? backfill : backfill.records || []) {
    const u = b.Link; const d = b.recoveredText || "";
    if (u && d) byUrl.set(u, d);
  }
  console.log(`backfill entries with text: ${byUrl.size}`);

  const none = deck.filter((r) => r.Section === "None");
  const outSet = new Set(OUTGTA);
  const updates = [];
  const tally = { "b2b / prof-dev": 0, civic: 0, "non-GTA": 0 };
  let enriched = 0;

  for (const r of none) {
    let s = `${r.Event || ""} — ${r.Details || ""}`;
    const extra = byUrl.get(r.Link);
    if (extra) { s += " — " + extra; enriched++; }

    const tags = [];
    if (hit(PROFDEV, s) || hit(B2B, s)) tags.push("b2b / prof-dev");
    if (hit(CIVIC, s)) tags.push("civic");
    if (!outSet.has(r.Row)) {
      const slug = slugOf(r.Link);
      if ((slug && !GTA_SLUGS.has(slug)) || foreignEventbrite(r.Link) || FAR_PLACES.test(s)) tags.push("non-GTA");
    }
    if (!tags.length) continue;
    tags.forEach((t) => tally[t]++);
    updates.push({ id: r.id, Row: r.Row, Event: (r.Event || "").slice(0, 55), tags });
  }

  console.log(`\nNone rows: ${none.length} | text enriched by backfill: ${enriched}`);
  console.log(`FLAGGED: ${updates.length} of ${none.length} (${(100 * updates.length / none.length).toFixed(1)}%)`);
  console.log(`  b2b / prof-dev: ${tally["b2b / prof-dev"]}\n  civic: ${tally.civic}\n  non-GTA (hint only): ${tally["non-GTA"]}`);
  console.log(`  multi-tag rows: ${updates.filter((u) => u.tags.length > 1).length}`);

  if (!WRITE) { console.log("\nDRY RUN -- pass --write to apply."); updates.slice(0, 20).forEach((u) => console.log(`  r${u.Row} [${u.tags.join(", ")}] ${u.Event}`)); return; }

  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10).map((u) => ({ id: u.id, fields: { [F_PREMARKED]: u.tags } }));
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch }),
    });
    const j = await res.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    console.log(`wrote ${j.records.length} (batch ${i / 10 + 1})`);
  }
  console.log(`\nDONE -- PreMarked set on ${updates.length} rows. No NoneReason written.`);
})();
