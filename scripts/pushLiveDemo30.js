/**
 * Append the 30-event live-demo draw into the existing "R7 Label Deck" table as a new batch.
 *
 * Source : models/sectioning/deck/live_demo_30_seed23.json  (written by live_demo_30.py)
 * Target : tblOxYHuAl2yp9Znl — the SAME standalone deck table the 416 labelled rows live in.
 *
 * APPEND ONLY. Unlike pushLabelDeck.js this NEVER purges: that table now holds the editor's
 * 416 rulings and a purge would destroy the R7 gate set. It only POSTs new records and never
 * touches an existing one. `Section` / `Either` are left empty — the editor's to fill.
 *
 * Rows are numbered from the current max Row + 1 so they can't collide with the answer key.
 * Batch is tagged "5 - Live Demo (30)" so these are separable from the labelled deck forever
 * — they are a DEMO, not eval data, and must not be scored with the gate slice.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const BATCH_LABEL = "5 - Live Demo (30)";
const CHUNK = 10;

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");

  const src = path.join(__dirname, "../models/sectioning/deck/live_demo_30_seed23.json");
  const rows = JSON.parse(fs.readFileSync(src, "utf8"));
  console.log(`loaded ${rows.length} demo rows`);

  // Scan the table: find the max Row outside batch 5, and collect batch-5 rows to replace.
  // Re-running this script REPLACES the demo batch (it's a demo, redrawn freely) but never
  // touches batches 1-4 -- those hold the editor's 416 rulings and are the R7 gate set.
  let maxRow = 0;
  let existing = 0;
  const demoRows = [];
  for (let cursor; ; ) {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    // .append(), NOT .set() -- set() overwrites, so only the last field is requested and
    // Row/Batch come back undefined (the 07-23 bug: purge silently no-op'd, Rows collided).
    url.searchParams.append("fields[]", "Row");
    url.searchParams.append("fields[]", "Batch");
    url.searchParams.append("fields[]", "Section");
    if (cursor) url.searchParams.set("offset", cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } });
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    for (const rec of j.records) {
      existing++;
      const f = rec.fields || {};
      const batch = typeof f.Batch === "object" ? f.Batch && f.Batch.name : f.Batch;
      if (batch === BATCH_LABEL) {
        demoRows.push({ id: rec.id, labelled: Boolean(f.Section) });
      } else if (typeof f.Row === "number" && f.Row > maxRow) {
        maxRow = f.Row;
      }
    }
    if (!j.offset) break;
    cursor = j.offset;
  }

  const alreadyRuled = demoRows.filter((r) => r.labelled).length;
  if (alreadyRuled > 0) {
    throw new Error(
      `ABORT: ${alreadyRuled} rows in "${BATCH_LABEL}" already have a Section. ` +
      `The editor has started ruling — refusing to replace them.`);
  }
  for (let i = 0; i < demoRows.length; i += CHUNK) {
    const ids = demoRows.slice(i, i + CHUNK).map((r) => `records[]=${r.id}`).join("&");
    await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?${ids}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    await new Promise((r) => setTimeout(r, 220));
  }
  if (demoRows.length) console.log(`replaced: purged ${demoRows.length} prior demo rows (unlabelled)`);
  console.log(`table has ${existing} rows, max non-demo Row = ${maxRow} -> appending ${maxRow + 1}..${maxRow + rows.length}`);

  const records = rows.map((r, i) => ({
    fields: {
      Event: String(r.title || "").slice(0, 500),
      Row: maxRow + 1 + i,
      Batch: BATCH_LABEL,
      Details: String(r.desc || ""),
      Link: String(r.url || "") || undefined,   // url field rejects empty strings
    },
  }));

  let done = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: chunk, typecast: true }),
    });
    if (!res.ok) throw new Error(`chunk at row ${i + 1} failed: ${res.status} ${await res.text()}`);
    done += chunk.length;
    process.stdout.write(`\rpushed ${done}/${records.length}`);
    await new Promise((r) => setTimeout(r, 220));   // stay under 5 req/sec
  }
  console.log(`\ndone — ${done} appended as "${BATCH_LABEL}". Filter on that batch in Airtable.`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
