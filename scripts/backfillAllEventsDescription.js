// backfillAllEventsDescription.js
// One-off (idempotent) cleanup for #70 / the AllEvents extraction (Decision_Log §51).
//
// History: AllEvents Normalize used to concatenate "AllEvents Categories/Organizer/Score"
// into DescriptionRaw. That (a) made richest-wins survivorship pick AllEvents over a
// real-description source on raw length, and (b) polluted the R6 content-scoring signal.
// The normalize nodes now emit those as discrete fields (Organizer/SourceScore/
// SourceCategories) and leave DescriptionRaw empty.
//
// But the live upsert OMITS empty values (never blanks an existing field), so existing
// rows keep the old polluted DescriptionRaw forever. This script does the one thing the
// pipeline can't: blank it. For rows the pipeline hasn't re-ingested (out-of-window
// AllEvents events), it first RECOVERS the metadata from the blob into the new fields so
// nothing is lost, then blanks DescriptionRaw. Only fills new fields that are currently
// empty — never overwrites fresher pipeline-written values. Editorial fields untouched.
//
// Usage:
//   node scripts/backfillAllEventsDescription.js            # DRY RUN (prints, writes nothing)
//   node scripts/backfillAllEventsDescription.js --apply    # actually writes

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const CANDIDATES_TABLE = "tblRsboN66ZLzyDrM";
const APPLY = process.argv.includes("--apply");

function timedFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function airtableFetch(pathStr, options = {}, retries = 3) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const url = `https://api.airtable.com/v0/${pathStr}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await timedFetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    if (res.status === 429) {
      if (attempt === retries) throw new Error(`Airtable rate limit on /${pathStr} — out of retries`);
      const wait = parseInt(res.headers.get("Retry-After") ?? "1", 10) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Airtable ${options.method || "GET"} /${pathStr} → ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

// Parse the legacy blob back into discrete fields. Tolerant of any line order / missing lines.
function parseBlob(desc) {
  const out = { organizer: "", sourceScore: null, categories: "" };
  for (const line of (desc || "").split("\n")) {
    let m;
    if ((m = line.match(/^AllEvents Categories:\s*(.*)$/))) out.categories = m[1].trim();
    else if ((m = line.match(/^AllEvents Organizer:\s*(.*)$/))) out.organizer = m[1].trim();
    else if ((m = line.match(/^AllEvents Score:\s*(.*)$/))) {
      const n = parseFloat(m[1]);
      out.sourceScore = isNaN(n) ? null : n;
    }
  }
  return out;
}

// A row is "polluted" if its DescriptionRaw carries any of the legacy markers.
function isPolluted(desc) {
  return /^AllEvents (Categories|Organizer|Score):/m.test(desc || "");
}

async function fetchPollutedRows() {
  const formula = `OR(FIND("AllEvents Categories",{DescriptionRaw}),FIND("AllEvents Organizer",{DescriptionRaw}),FIND("AllEvents Score",{DescriptionRaw}))`;
  const rows = [];
  let offset;
  do {
    const q = new URLSearchParams({ filterByFormula: formula, ...(offset ? { offset } : {}) });
    const data = await airtableFetch(`${BASE_ID}/${CANDIDATES_TABLE}?${q}`);
    rows.push(...data.records);
    offset = data.offset;
  } while (offset);
  return rows;
}

async function patchBatch(records) {
  await airtableFetch(`${BASE_ID}/${CANDIDATES_TABLE}`, {
    method: "PATCH",
    body: JSON.stringify({ records, typecast: true }),
  });
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY || !BASE_ID) throw new Error("AIRTABLE_API_KEY / AIRTABLE_BASE_ID not set");
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes — pass --apply to write)"}\n`);

  const rows = await fetchPollutedRows();
  console.log(`Found ${rows.length} rows with a polluted DescriptionRaw.\n`);

  const updates = [];
  let recovered = 0;
  for (const r of rows) {
    const f = r.fields;
    if (!isPolluted(f["DescriptionRaw"])) continue; // belt-and-suspenders vs FIND false hits
    const parsed = parseBlob(f["DescriptionRaw"]);
    const fields = { DescriptionRaw: "" }; // the core fix: blank the pollution

    // Recover metadata into the new fields ONLY where they're currently empty —
    // never clobber values the pipeline already wrote on re-ingest.
    if (!f["Organizer"] && parsed.organizer) { fields["Organizer"] = parsed.organizer; recovered++; }
    if ((f["SourceScore"] === undefined || f["SourceScore"] === null) && parsed.sourceScore !== null) fields["SourceScore"] = parsed.sourceScore;
    if (!f["SourceCategories"] && parsed.categories) fields["SourceCategories"] = parsed.categories;

    updates.push({ id: r.id, fields });
  }

  console.log(`Will blank DescriptionRaw on ${updates.length} rows; recover Organizer on ${recovered} that lacked it.`);
  if (updates.length) {
    const sample = updates[0];
    console.log(`\nSample update: ${sample.id}`);
    console.log(JSON.stringify(sample.fields, null, 1));
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to commit.`);
    return;
  }

  for (let i = 0; i < updates.length; i += 10) {
    await patchBatch(updates.slice(i, i + 10));
    console.log(`  patched ${Math.min(i + 10, updates.length)}/${updates.length}`);
  }
  console.log(`\nDone. ${updates.length} rows cleaned.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
