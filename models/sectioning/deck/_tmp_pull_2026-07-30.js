/**
 * READ-ONLY pull of the R7 Label Deck (tblOxYHuAl2yp9Znl) after Sitting 2.
 * Writes nothing to Airtable. Dumps a name-keyed snapshot + prints the post-sitting state:
 * labelling progress by Slice, NoneReason tallies, invalid combos, missing reasoning,
 * exact-title repeat-pair agreement, and the target-flipping `outcompeted` set.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

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
  const out = path.join(__dirname, "_tmp_deck_pull_2026-07-30.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));

  console.log(`pulled ${rows.length} rows -> ${path.basename(out)}`);
  console.log("field keys:", [...new Set(rows.flatMap((r) => Object.keys(r)))].sort().join(", "));

  const none = rows.filter((r) => r.Section === "None");
  const labelled = none.filter((r) => arr(r.NoneReason).length > 0);
  console.log(`\n=== PROGRESS ===`);
  console.log(`Section=None: ${none.length} | labelled: ${labelled.length} | remaining: ${none.length - labelled.length}`);

  console.log(`\n--- by Slice (labelled / total None) ---`);
  const slices = [...new Set(none.map((r) => r.Slice || "(blank)"))].sort();
  for (const s of slices) {
    const g = none.filter((r) => (r.Slice || "(blank)") === s);
    const l = g.filter((r) => arr(r.NoneReason).length > 0);
    console.log(`${s.padEnd(20)} ${String(l.length).padStart(3)} / ${String(g.length).padStart(3)}`);
  }

  console.log(`\n--- gate slice detail ---`);
  const gate = none.filter((r) => r.Slice === "gate");
  const gateL = gate.filter((r) => arr(r.NoneReason).length > 0);
  console.log(`gate None: ${gate.length} | labelled ${gateL.length} | unlabelled ${gate.length - gateL.length}`);
  console.log(`  unlabelled+hinted: ${gate.filter((r) => !arr(r.NoneReason).length && arr(r.PreMarked).length).length}`);
  console.log(`  unlabelled+unhinted: ${gate.filter((r) => !arr(r.NoneReason).length && !arr(r.PreMarked).length).length}`);

  console.log(`\n=== NoneReason TALLY (all labelled None rows) ===`);
  const tally = {};
  let selections = 0;
  for (const r of labelled) for (const t of arr(r.NoneReason)) { tally[t] = (tally[t] || 0) + 1; selections++; }
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);
  console.log(`${String(selections).padStart(4)}  TOTAL selections across ${labelled.length} rows`);

  console.log(`\n=== INVALID COMBOS (can't tell + anything else) ===`);
  const invalid = labelled.filter((r) => arr(r.NoneReason).length > 1 && arr(r.NoneReason).some((t) => /can.?t tell/i.test(t)));
  invalid.forEach((r) => console.log(`r${r.Row} [${r.Slice}] ${JSON.stringify(r.NoneReason)} | ${String(r.Event).slice(0, 60)}`));
  if (!invalid.length) console.log("(none)");

  console.log(`\n=== TARGET-FLIPPING: outcompeted ticked ===`);
  const oc = labelled.filter((r) => arr(r.NoneReason).some((t) => /outcompeted/i.test(t)));
  console.log(`${oc.length} rows`);
  oc.forEach((r) =>
    console.log(
      `r${r.Row} [${r.Slice}] ${JSON.stringify(r.NoneReason)} | hints=${JSON.stringify(arr(r.PreMarked))} | ${String(r.Event).slice(0, 60)}\n     why: ${r.NoneReasoning || "(NO REASONING)"}`
    )
  );

  console.log(`\n=== MISSING REASONING (subjective/ambiguous labels) ===`);
  const subjective = labelled.filter((r) =>
    arr(r.NoneReason).some((t) => /wrong fit|outcompeted|can.?t tell/i.test(t)) && !r.NoneReasoning
  );
  console.log(`${subjective.length} rows: ${subjective.map((r) => "r" + r.Row).join(", ") || "(none)"}`);

  console.log(`\n=== EXACT-TITLE REPEAT PAIRS ===`);
  const byTitle = {};
  for (const r of rows) {
    const k = String(r.Event || "").trim().toLowerCase();
    if (!k) continue;
    (byTitle[k] = byTitle[k] || []).push(r);
  }
  let agree = 0, disagree = 0, partial = 0;
  for (const [k, g] of Object.entries(byTitle)) {
    if (g.length < 2) continue;
    const nones = g.filter((r) => r.Section === "None");
    const inclVsNone = new Set(g.map((r) => (r.Section === "None" ? "None" : "include")));
    const allLabelled = nones.length === g.length && nones.every((r) => arr(r.NoneReason).length);
    if (inclVsNone.size > 1) {
      disagree++;
      console.log(`FLIP include/None  ${g.map((r) => `r${r.Row}=${r.Section}`).join(" ")} | ${g[0].Event.slice(0, 55)}`);
    } else if (allLabelled) {
      const sets = nones.map((r) => arr(r.NoneReason).slice().sort().join("+"));
      if (new Set(sets).size > 1) {
        partial++;
        console.log(`REASON MISMATCH   ${nones.map((r) => `r${r.Row}[${arr(r.NoneReason).join(",")}]`).join(" ")} | ${g[0].Event.slice(0, 45)}`);
      } else agree++;
    }
  }
  console.log(`fully-labelled None pairs: agree ${agree} | reason-mismatch ${partial} | include/None flips ${disagree}`);

  console.log(`\n=== LINK EVIDENCE ===`);
  const link = labelled.filter((r) => r.LinkGave);
  console.log(`${link.length} labelled rows carry LinkGave`);
  link.forEach((r) => console.log(`r${r.Row} [${arr(r.NoneReason).join(",")}] ${String(r.LinkGave).slice(0, 90)}`));
})();
