/**
 * Read back the editor's rulings on the live-demo batch and join them to the model's
 * predictions. READ-ONLY on Airtable -- writes nothing.
 *
 * Joins tblOxYHuAl2yp9Znl (Batch = "5 - Live Demo (30)") to
 * models/sectioning/deck/live_demo_30_seed23.json by Row (427..456 -> n 1..30).
 *
 * NOT A GATE NUMBER. n=30 with ~6-9 per class; the error bar is far too wide to compare
 * against the §3 bars. The gate number is the 184-event transfer test. This is a demo readout.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const BATCH_LABEL = "5 - Live Demo (30)";

const norm = (s) => {
  const v = String(s || "").toLowerCase();
  if (v.includes("famil")) return "Families";
  if (v.includes("couple")) return "Couples";
  if (v.includes("golden") || v.includes("older") || v.includes("senior")) return "Golden";
  if (v.includes("none") || v.includes("no")) return "None";
  return String(s || "").trim();
};

async function main() {
  const preds = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../models/sectioning/deck/live_demo_30_seed23.json"), "utf8"));

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

  const batchOf = (f) => (typeof f.Batch === "object" ? f.Batch && f.Batch.name : f.Batch);
  const demo = recs.filter((r) => batchOf(r.fields || {}) === BATCH_LABEL);
  console.log(`pulled ${recs.length} rows; ${demo.length} in "${BATCH_LABEL}"`);
  if (!demo.length) throw new Error("no demo rows found");

  // show what fields actually carry content, so nothing he typed gets missed
  const fieldsSeen = new Set();
  demo.forEach((r) => Object.entries(r.fields || {}).forEach(([k, v]) => {
    if (v !== "" && v != null && String(v).trim() !== "") fieldsSeen.add(k);
  }));
  console.log("fields with content:", [...fieldsSeen].join(" | "));

  const rows = demo.map((r) => {
    const f = r.fields || {};
    const rowNum = typeof f.Row === "number" ? f.Row : null;
    const p = preds.find((x) => rowNum != null && 426 + x.n === rowNum);
    const sec = typeof f.Section === "object" ? f.Section && f.Section.name : f.Section;
    return {
      row: rowNum,
      title: f.Event || (p && p.title) || "",
      editor: norm(sec),
      model: p ? p.model_pred : "?",
      conf: p ? p.confidence : null,
      margin: p ? p.margin : null,
      either: f.Either || "",
      note: f.Notes || f.Label || f.Comments || f.Comment || "",
    };
  }).filter((r) => r.row != null).sort((a, b) => a.row - b.row);

  const ruled = rows.filter((r) => r.editor);
  const includable = ruled.filter((r) => r.editor !== "None");
  const none = ruled.filter((r) => r.editor === "None");
  const correct = includable.filter((r) => r.editor === r.model);
  const wrong = includable.filter((r) => r.editor !== r.model);

  console.log(`\n${"row".padStart(4)} ${"EDITOR".padEnd(9)} ${"MODEL".padEnd(9)} ${"conf".padStart(5)} ${"marg".padStart(5)}  ok  title`);
  for (const r of rows) {
    const ok = !r.editor ? "--" : (r.editor === "None" ? "NONE" : (r.editor === r.model ? "OK" : "XX"));
    console.log(`${String(r.row).padStart(4)} ${(r.editor || "-").padEnd(9)} ${r.model.padEnd(9)} ` +
      `${r.conf == null ? "  -  " : r.conf.toFixed(2).padStart(5)} ${r.margin == null ? "  -  " : r.margin.toFixed(2).padStart(5)}  ` +
      `${ok.padEnd(4)}${String(r.title).slice(0, 44)}${r.note ? "   // " + r.note : ""}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`ruled            : ${ruled.length} of ${rows.length}`);
  console.log(`marked None      : ${none.length}  (${(100 * none.length / (ruled.length || 1)).toFixed(0)}% of ruled)`);
  console.log(`includable       : ${includable.length}`);
  console.log(`  correct        : ${correct.length}`);
  console.log(`  incorrect      : ${wrong.length}`);
  console.log(`  ratio          : ${correct.length}:${wrong.length}` +
    (includable.length ? `  (${(100 * correct.length / includable.length).toFixed(0)}% of includables)` : ""));

  const byClass = {};
  for (const r of includable) {
    byClass[r.editor] = byClass[r.editor] || { n: 0, ok: 0 };
    byClass[r.editor].n++;
    if (r.editor === r.model) byClass[r.editor].ok++;
  }
  console.log("\nper editor-class (recall):");
  for (const [c, v] of Object.entries(byClass)) {
    console.log(`  ${c.padEnd(9)} ${v.ok}/${v.n}  ${(100 * v.ok / v.n).toFixed(0)}%`);
  }

  const noneCommitted = none.filter((r) => r.margin != null && r.margin >= 0.15);
  console.log(`\nNones the model committed on (margin >=0.15, would NOT abstain): ${noneCommitted.length}/${none.length}`);
  if (wrong.length) {
    console.log("\nMISSES:");
    wrong.forEach((r) => console.log(`  ${r.row}  he:${r.editor} / it:${r.model} (${r.conf})  ${String(r.title).slice(0, 50)}${r.note ? "  // " + r.note : ""}`));
  }
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
