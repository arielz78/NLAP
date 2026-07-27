/**
 * READ-ONLY pull of the R7 Label Deck (tblOxYHuAl2yp9Znl) for the #108 delegated run.
 * Writes nothing to Airtable. Dumps a name-keyed snapshot for the rule-break scan (Task 2)
 * and the pilot remap (Task 3).
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";

(async () => {
  const recs = [];
  for (let cursor; ; ) {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    if (cursor) url.searchParams.set("offset", cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } });
    const j = await r.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    recs.push(...j.records);
    if (!j.offset) break;
    cursor = j.offset;
  }
  const rows = recs.map((r) => ({ id: r.id, ...r.fields }));
  rows.sort((a, b) => (a.Row || 0) - (b.Row || 0));
  fs.writeFileSync(path.join(__dirname, "_tmp_deck_pull_2026-07-27.json"), JSON.stringify(rows, null, 1));
  console.log(`pulled ${rows.length} rows`);
  console.log("field keys seen:", [...new Set(rows.flatMap((r) => Object.keys(r)))].sort().join(", "));
  const done = rows.filter((r) => r.NoneType);
  console.log(`rows with NoneType filled: ${done.length}`);
  for (const r of done) {
    console.log(
      `r${r.Row} | ${r.NoneType} | reason=${JSON.stringify(r.NoneReason || null)} | link=${r.NeededLink || false} | ${String(r.Event).slice(0, 55)}`
    );
    console.log(`     reasoning: ${r.NoneReasoning || "(none)"}`);
  }
})();
