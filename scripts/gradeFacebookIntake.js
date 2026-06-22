// gradeFacebookIntake.js
// Test harness for the VB_FACEBOOK_INTAKE prompt outputs.
// Feed it a file containing one raw ChatGPT output (the tab-separated table,
// pasted verbatim) and it runs that text through the REAL parser
// (parseFacebookIntake.js) and prints a per-run verdict: how many rows ingested,
// which dropped and why (loud failures), which fields were soft-cleared
// (e.g. blanked City / EndDate), plus a tab-count sanity line per row.
//
// Usage:
//   node scripts/gradeFacebookIntake.js path/to/output.txt
//   node scripts/gradeFacebookIntake.js test_runs/*.txt    (grades each, then a roll-up)
//   node scripts/gradeFacebookIntake.js --truth truth.txt run.txt   (accuracy diff)
//
// Two modes:
//   STRUCTURAL (default): runs each file through the parser, prints parseability
//   verdict — drops, soft-clears, tab anomalies. Catches structure, NOT correctness.
//   ACCURACY (--truth): diffs a model run against a hand-labeled gold-standard file
//   (same tab-separated format). Catches the semantic errors the parser is blind to:
//   hallucinated events, wrong dates, wrong cities, wrong venues. Match key = norm(title);
//   a title that differs surfaces as both a "missing" and an "extra" row.
//
// The parser is the grader. Don't eyeball outputs — rendered tabs are invisible.
// This reads the raw bytes, so tab vs space is decided correctly.

const fs = require("fs");
const path = require("path");
const { parseFacebookEvents, norm } = require("./parseFacebookIntake.js");

const EXPECTED_TABS = 5; // 6 columns = 5 tab chars per well-formed row

function tabAudit(text) {
  // Per-line tab count, ignoring blank lines. Flags rows that won't have 6 cols.
  return text
    .split(/\r?\n/)
    .map((l, i) => ({ lineNo: i + 1, line: l, tabs: (l.match(/\t/g) || []).length }))
    .filter((r) => r.line.trim().length > 0);
}

function gradeOne(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const { rows, errors, softNotes } = parseFacebookEvents(text);

  const audit = tabAudit(text);
  const dataLines = audit.length - (audit[0] && /^title\t/i.test(audit[0].line) ? 1 : 0);
  const badTabRows = audit.filter((r) => r.tabs !== EXPECTED_TABS);

  console.log(`\n=== ${path.basename(filePath)} ===`);
  console.log(`data rows (excl header): ${dataLines}`);
  console.log(`ingested OK            : ${rows.length}`);
  console.log(`dropped (loud)         : ${errors.length}`);
  console.log(`soft-cleared fields    : ${softNotes.length}`);

  if (badTabRows.length) {
    console.log(`\n  ⚠ tab-count anomalies (expected ${EXPECTED_TABS} tabs/row):`);
    for (const r of badTabRows) {
      console.log(`    line ${r.lineNo}: ${r.tabs} tabs — "${r.line.slice(0, 50)}..."`);
    }
  }
  if (errors.length) {
    console.log(`\n  DROPPED:`);
    errors.forEach((e) => console.log(`    - ${e}`));
  }
  if (softNotes.length) {
    console.log(`\n  SOFT (field cleared, row kept):`);
    softNotes.forEach((n) => console.log(`    - ${n}`));
  }

  // Blank-City count: the signal we care about post-fix (hallucination -> blank).
  const blankCity = rows.filter((r) => !r["City"]).length;
  console.log(`\n  rows with blank City   : ${blankCity} (blank = honest "verify me", not a guess)`);

  return {
    file: path.basename(filePath),
    dataLines,
    ingested: rows.length,
    dropped: errors.length,
    soft: softNotes.length,
    badTabRows: badTabRows.length,
    blankCity,
  };
}

// --- accuracy diff: model run vs hand-labeled truth --------------------------
const COMPARE_FIELDS = [
  ["Start Date", "StartDate"],
  ["End Date", "EndDate"],
  ["City", "City"],
  ["LocationName", "LocationName"],
];

function gradeTruth(truthPath, runPath) {
  const truth = parseFacebookEvents(fs.readFileSync(truthPath, "utf8")).rows;
  const run = parseFacebookEvents(fs.readFileSync(runPath, "utf8")).rows;

  const byTitle = (arr) => new Map(arr.map((r) => [norm(r["Event Title"]), r]));
  const truthMap = byTitle(truth);
  const runMap = byTitle(run);

  const hallucinated = []; // in run, not in truth
  const missed = []; // in truth, not in run
  const fieldErrors = []; // matched title, field mismatch

  for (const [k, r] of runMap) {
    if (!truthMap.has(k)) hallucinated.push(r["Event Title"]);
  }
  for (const [k, t] of truthMap) {
    if (!runMap.has(k)) {
      missed.push(t["Event Title"]);
      continue;
    }
    const r = runMap.get(k);
    for (const [label] of COMPARE_FIELDS) {
      const tv = (t[label] || "").trim();
      const rv = (r[label] || "").trim();
      // Blank in run when truth has a value = soft miss (honest "verify me"), not an error.
      // A WRONG non-blank value is the real failure.
      if (rv && rv !== tv) {
        fieldErrors.push(`"${t["Event Title"]}" — ${label}: got "${rv}", truth "${tv}"`);
      } else if (!rv && tv) {
        fieldErrors.push(`"${t["Event Title"]}" — ${label}: BLANK (truth "${tv}") [soft: editor fills]`);
      }
    }
  }

  console.log(`\n=== ACCURACY: ${path.basename(runPath)} vs ${path.basename(truthPath)} ===`);
  console.log(`truth events : ${truth.length}`);
  console.log(`run events   : ${run.length}`);
  console.log(`\nHALLUCINATED (in run, not in truth — HARD fail): ${hallucinated.length}`);
  hallucinated.forEach((t) => console.log(`  + ${t}`));
  console.log(`\nMISSED (in truth, not in run): ${missed.length}`);
  missed.forEach((t) => console.log(`  - ${t}`));
  console.log(`\nFIELD MISMATCHES: ${fieldErrors.length}`);
  fieldErrors.forEach((e) => console.log(`  ! ${e}`));

  const hardWrong = fieldErrors.filter((e) => !e.includes("[soft")).length;
  console.log(`\nVERDICT: ${hallucinated.length} hallucinated, ${hardWrong} wrong-value fields (both must be 0 to ship).`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--truth") {
    const [, truthPath, runPath] = args;
    if (!truthPath || !runPath) {
      console.error("Usage: node scripts/gradeFacebookIntake.js --truth <truth.txt> <run.txt>");
      process.exit(1);
    }
    gradeTruth(truthPath, runPath);
    return;
  }
  if (args.length === 0) {
    console.error("Usage: node scripts/gradeFacebookIntake.js <output.txt> [more.txt ...]");
    console.error("   or: node scripts/gradeFacebookIntake.js --truth <truth.txt> <run.txt>");
    process.exit(1);
  }
  const summary = args.map(gradeOne);

  if (summary.length > 1) {
    console.log(`\n\n=== ROLL-UP (${summary.length} runs) ===`);
    const tot = (k) => summary.reduce((s, r) => s + r[k], 0);
    console.log(`total data rows : ${tot("dataLines")}`);
    console.log(`total ingested  : ${tot("ingested")}`);
    console.log(`total dropped   : ${tot("dropped")}`);
    console.log(`total soft      : ${tot("soft")}`);
    console.log(`runs w/ tab bugs: ${summary.filter((r) => r.badTabRows > 0).length}/${summary.length}`);
    const dropRate = tot("dataLines") ? ((tot("dropped") / tot("dataLines")) * 100).toFixed(1) : "0";
    console.log(`drop rate       : ${dropRate}%  (loud drops only — silent corruption is NOT in this number)`);
  }
}

main();
