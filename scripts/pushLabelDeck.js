/**
 * One-off: push the R7 editor labelling deck into Airtable.
 *
 * Source : eval/deck/editor_deck_2026-07-18.json  (written by eval/classifier2give2editor.py)
 * Target : "R7 Label Deck (2026-07-18)" — a STANDALONE table. It is NOT pipeline data.
 *          Nothing reads from it automatically; never join it to Candidates/IssueItems.
 *
 * Writes only Event / Row / Batch / Details / Link. `Section` and `Flag` are left
 * empty on purpose — those are the editor's to fill, and this script must never
 * overwrite them. Re-running appends duplicates; clear the table first if re-pushing.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const CHUNK = 10;                        // Airtable REST caps writes at 10 records/request

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");

  const src = path.join(__dirname, "../eval/deck/editor_deck_2026-07-18.json");
  const rows = JSON.parse(fs.readFileSync(src, "utf8"));
  console.log(`loaded ${rows.length} rows from ${path.basename(src)}`);

  // Purge first so re-running replaces rather than appends. SAFE ONLY because this
  // table is a standalone deck with no editor input yet -- once he has started
  // labelling, re-running this would destroy his work. Guard on that.
  const existing = [];
  for (let cursor; ; ) {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields[]", "Section");
    if (cursor) url.searchParams.set("offset", cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } });
    const j = await r.json();
    existing.push(...j.records);
    if (!j.offset) break;
    cursor = j.offset;
  }
  const labelled = existing.filter((r) => r.fields && r.fields.Section).length;
  if (labelled > 0) {
    throw new Error(`ABORT: ${labelled} rows already have a Section. Refusing to delete the editor's work.`);
  }
  for (let i = 0; i < existing.length; i += CHUNK) {
    const ids = existing.slice(i, i + CHUNK).map((r) => `records[]=${r.id}`).join("&");
    await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?${ids}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    await new Promise((r) => setTimeout(r, 220));
  }
  if (existing.length) console.log(`purged ${existing.length} existing rows`);

  const records = rows.map((r) => ({
    fields: {
      Event: String(r.Event || "").slice(0, 500),
      Row: r.Row,
      Batch: r.Batch,
      Details: String(r.Details || ""),
      Link: String(r.Link || "") || undefined,   // url field rejects empty strings
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
    if (!res.ok) {
      throw new Error(`chunk at row ${i + 1} failed: ${res.status} ${await res.text()}`);
    }
    done += chunk.length;
    process.stdout.write(`\rpushed ${done}/${records.length}`);
    await new Promise((r) => setTimeout(r, 220));   // stay under the 5 req/sec limit
  }
  console.log(`\ndone — ${done} records in "${TABLE_ID}"`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
