/**
 * Call-prep audit for the 239 R7 None rows.
 *
 * `PreMarked` is a GUESS column. It helps the editor batch-review likely rule
 * breaks but never writes a subjective `NoneReason`.
 *
 * One factual exception is handled here: r103 says repeatedly that the event is
 * in Ottawa despite an AllEvents Richmond Hill URL. It receives `OutsideGTA`
 * plus `NoneReason = non-GTA`; `OutsideGTA` preserves machine provenance.
 *
 * The reviewed additions/removals below come from a full-row audit on
 * 2026-07-29. They correct failures that a keyword-only scan cannot distinguish:
 * "Chicago" as a band reference, "Georgia" as a novel setting, professional
 * terms used incidentally, and strong professional-event descriptions whose
 * titles contain none of the original keywords.
 *
 * DRY RUN by default. Pass --write to apply only the displayed deltas.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../../NLAP_Airtable.env") });

const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = "tblOxYHuAl2yp9Znl";
const F_PREMARKED = "fldWhnKcM6e3epRZt";
const WRITE = process.argv.includes("--write");

const FACT_OUTGTA_ROWS = new Set([103]);

// Exact organizer provenance: 18 None rows, two already editor-confirmed.
const ADEPTSKIL = /AllEvents Organizer:\s*AdeptSkil\b/i;

// Strong misses from the 2026-07-29 full-row review. These remain hints only.
const REVIEWED_B2B_ADDS = new Set([
  48, 64, 68, 71, 102, 115, 117, 154, 162, 182, 195, 207, 224,
  252, 305, 308, 326, 328, 345, 353, 370, 386, 419, 440, 442, 452,
]);

// Keyword hits reviewed as incidental content, not the event's nature.
const REVIEWED_REMOVALS = new Map([
  [97, new Set(["b2b / prof-dev"])],
  [140, new Set(["non-GTA"])],
  [176, new Set(["non-GTA"])],
  [186, new Set(["b2b / prof-dev"])],
  [234, new Set(["non-GTA"])],
  [253, new Set(["b2b / prof-dev"])],
  [278, new Set(["non-GTA"])],
  [291, new Set(["b2b / prof-dev"])],
  [313, new Set(["b2b / prof-dev"])],
  [341, new Set(["b2b / prof-dev"])],
  [357, new Set(["b2b / prof-dev"])],
]);

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
const GTA_SLUGS = new Set([
  "toronto", "vaughan", "markham", "richmond-hill", "mississauga", "brampton",
  "north-york", "scarborough", "etobicoke", "woodbridge", "thornhill", "maple",
  "concord", "aurora", "newmarket", "oakville", "burlington", "pickering", "ajax",
  "whitby", "oshawa", "milton", "king-city", "stouffville", "unionville",
  "vaughan-on", "east-gwillimbury", "georgina", "caledon", "halton-hills",
  "uxbridge", "brock", "clarington", "bradford",
]);
const FAR_PLACES =
  /\b(savannah|georgia|new york|nyc|chicago|london, uk|hamburg|berlin|singapore|dubai|mumbai|delhi|calgary|vancouver|edmonton|montreal|ottawa|winnipeg|halifax|kitchener|waterloo, on|guelph|hamilton, on|barrie|niagara|st\.? catharines|windsor, on|kingston, on|peterborough|orillia|collingwood|muskoka|sudbury|thunder bay)\b/i;

const hit = (patterns, text) => patterns.some((pattern) => pattern.test(text));

function foreignEventbrite(link) {
  try {
    const host = new URL(link).hostname;
    return /eventbrite\./.test(host) && !/eventbrite\.(ca|com)$/.test(host);
  } catch {
    return false;
  }
}

function allEventsSlug(link) {
  try {
    const url = new URL(link);
    return url.hostname.includes("allevents.in")
      ? url.pathname.split("/").filter(Boolean)[0]
      : null;
  } catch {
    return null;
  }
}

function sorted(values) {
  return [...values].sort();
}

function sameValues(a, b) {
  return JSON.stringify(sorted(a || [])) === JSON.stringify(sorted(b || []));
}

async function fetchDeck() {
  const records = [];
  for (let offset; ; ) {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    const body = await response.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    records.push(...body.records);
    if (!body.offset) break;
    offset = body.offset;
  }
  return records.map((record) => ({ id: record.id, ...record.fields }));
}

function targetTags(row) {
  const text = `${row.Event || ""} — ${row.Details || ""}`;
  const tags = new Set();

  if (hit(PROFDEV, text) || hit(B2B, text) || ADEPTSKIL.test(row.Details || "")) {
    tags.add("b2b / prof-dev");
  }
  if (hit(CIVIC, text)) tags.add("civic");

  const factOutside = row.OutsideGTA || FACT_OUTGTA_ROWS.has(row.Row);
  if (!factOutside) {
    const slug = allEventsSlug(row.Link);
    if (
      (slug && !GTA_SLUGS.has(slug)) ||
      foreignEventbrite(row.Link) ||
      FAR_PLACES.test(text)
    ) {
      tags.add("non-GTA");
    }
  }

  if (REVIEWED_B2B_ADDS.has(row.Row)) tags.add("b2b / prof-dev");
  for (const tag of REVIEWED_REMOVALS.get(row.Row) || []) tags.delete(tag);
  return sorted(tags);
}

(async () => {
  const deck = await fetchDeck();
  const none = deck.filter((row) => row.Section === "None");
  const changes = [];

  for (const row of none) {
    const fields = {};
    const beforeTags = row.PreMarked || [];
    const afterTags = targetTags(row);
    if (!sameValues(beforeTags, afterTags)) fields[F_PREMARKED] = afterTags;

    if (FACT_OUTGTA_ROWS.has(row.Row)) {
      if (!row.OutsideGTA) fields.OutsideGTA = true;
      const reasons = new Set(row.NoneReason || []);
      reasons.add("non-GTA");
      if (!sameValues(row.NoneReason || [], reasons)) fields.NoneReason = sorted(reasons);
    }

    if (Object.keys(fields).length) {
      changes.push({
        id: row.id,
        Row: row.Row,
        Event: row.Event || "",
        beforeTags: sorted(beforeTags),
        afterTags,
        fields,
      });
    }
  }

  const finalRows = none.map((row) => ({
    ...row,
    PreMarked: targetTags(row),
    OutsideGTA: row.OutsideGTA || FACT_OUTGTA_ROWS.has(row.Row),
  }));
  const hinted = finalRows.filter((row) => row.PreMarked.length);
  const factual = finalRows.filter((row) => row.OutsideGTA);

  console.log(`None rows: ${none.length}`);
  console.log(`Target state: ${hinted.length} PreMarked | ${factual.length} OutsideGTA`);
  console.log(`Deltas: ${changes.length}`);
  for (const change of changes) {
    const fact = FACT_OUTGTA_ROWS.has(change.Row) ? " | FACT non-GTA" : "";
    console.log(
      `r${change.Row} ${JSON.stringify(change.beforeTags)} -> ${JSON.stringify(change.afterTags)}${fact} | ${change.Event}`
    );
  }

  if (!WRITE) {
    console.log("\nDRY RUN — pass --write to apply these deltas.");
    return;
  }

  for (let i = 0; i < changes.length; i += 10) {
    const records = changes.slice(i, i + 10).map((change) => ({
      id: change.id,
      fields: change.fields,
    }));
    const response = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records }),
    });
    const body = await response.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    console.log(`wrote ${body.records.length} (batch ${Math.floor(i / 10) + 1})`);
  }
  console.log(`\nDONE — ${changes.length} rows updated.`);
})();
