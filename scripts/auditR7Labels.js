/**
 * Read-only audit of the standalone R7 Label Deck in Airtable.
 *
 * One run does exactly one paginated Airtable pull, writes the raw snapshot once,
 * and performs every check against the in-memory rows. The raw records are never
 * printed. Console output is limited to aggregates and rows needing human review.
 *
 * By default, the newest prior snapshot in data/tracking/r7_label_audits/ is used
 * as the diff baseline. Airtable exposes no cell-modified timestamp on this table,
 * so snapshot diffs are the only exact way to isolate one sitting from the next.
 *
 * Usage:
 *   node scripts/auditR7Labels.js
 *   node scripts/auditR7Labels.js --show-changes
 *   node scripts/auditR7Labels.js --details
 *   node scripts/auditR7Labels.js --baseline <snapshot.json> --no-snapshot
 *
 * This script never writes to Airtable. Local snapshots are gitignored.
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../NLAP_Airtable.env"),
  quiet: true,
});

const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const OUT_DIR = path.join(__dirname, "../data/tracking/r7_label_audits");

// These are the live Airtable option strings. Fail on schema drift rather than
// silently mapping a new or renamed option to the wrong model target.
const REASONS = Object.freeze({
  NON_GTA: "non-GTA",
  B2B: "B2B / professional dev",
  CIVIC: "civic",
  WRONG_FIT: "wrong fit / not our audience",
  OUTCOMPETED: "outcompeted",
  CANT_TELL: "can't tell",
});

const KNOWN_REASONS = new Set(Object.values(REASONS));

// Every field this script reads. A rename here is silent corruption, not a crash:
// a missing key reads as undefined and the row quietly drops out of a filter.
// This is the failure that put `gate_step4a.py` on a field-id-keyed pull it could
// no longer join — fail loud instead.
const REQUIRED_FIELDS = Object.freeze([
  "Row",
  "Event",
  "Section",
  "Slice",
  "Flag",
  "Label",
  "Details",
  "NoneReason",
  "NoneReasoning",
  "LinkGave",
  "PreMarked",
  "OutsideGTA",
]);
// §77 routing: `non-GTA` is a RECORD FACT and routes to Stage 0 — it is NOT a gate
// negative. It used to live in this set, which is why the gate slice printed 123/60
// where §77-correct is 95/54. Permanent CONTENT rejections are the gate's negatives.
const PERMANENT_NEGATIVES = new Set([
  REASONS.B2B,
  REASONS.CIVIC,
  REASONS.WRONG_FIT,
]);
const SOFT_REASONS = new Set([
  REASONS.WRONG_FIT,
  REASONS.OUTCOMPETED,
  REASONS.CANT_TELL,
]);
const INCLUDED_SECTIONS = new Set(["Families", "Couples", "Golden"]);

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const parsed = {
    baseline: null,
    writeSnapshot: true,
    showChanges: false,
    details: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--baseline") {
      if (!argv[i + 1]) throw new Error("--baseline requires a path");
      parsed.baseline = path.resolve(argv[++i]);
    } else if (arg === "--no-snapshot") {
      parsed.writeSnapshot = false;
    } else if (arg === "--show-changes") {
      parsed.showChanges = true;
    } else if (arg === "--details") {
      parsed.details = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/auditR7Labels.js [options]",
          "",
          "Options:",
          "  --baseline <path>  Diff against an explicit prior snapshot",
          "  --no-snapshot      Run without writing a new local snapshot",
          "  --show-changes     Print every row newly labelled since baseline",
          "  --details          Include Details snippets on flagged rows",
          "  -h, --help         Show this help",
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function arr(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function clip(value, limit = 100) {
  const compact = text(value).replace(/\s+/g, " ");
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function sorted(values) {
  return [...values].sort();
}

function sameArray(a, b) {
  return JSON.stringify(sorted(arr(a))) === JSON.stringify(sorted(arr(b)));
}

function timestampForFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join("_");
}

function timedFetch(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function fetchPage(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await timedFetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });

    if (response.status === 429) {
      if (attempt === retries) {
        throw new Error("Airtable rate limit exceeded after retries");
      }
      const waitMs =
        Number.parseInt(response.headers.get("Retry-After") ?? "1", 10) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Airtable GET failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
  }
  throw new Error("Unreachable Airtable fetch state");
}

async function fetchDeck() {
  const records = [];
  let offset;
  let requests = 0;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const page = await fetchPage(url);
    requests++;
    records.push(...page.records);
    offset = page.offset;
  } while (offset);

  const rows = records
    .map((record) => ({
      id: record.id,
      createdTime: record.createdTime,
      ...record.fields,
    }))
    .sort((a, b) => (a.Row ?? 0) - (b.Row ?? 0));

  return { rows, requests };
}

function newestSnapshot() {
  if (!fs.existsSync(OUT_DIR)) return null;
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((name) => /^r7_label_deck_.*\.json$/.test(name))
    .map((name) => path.join(OUT_DIR, name))
    .sort();
  return files.at(-1) ?? null;
}

function rowsFromSnapshot(snapshotPath) {
  const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.records)) return parsed.records;
  throw new Error(`Unsupported snapshot shape: ${snapshotPath}`);
}

function writeSnapshot(rows) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const snapshotPath = path.join(
    OUT_DIR,
    `r7_label_deck_${timestampForFilename()}.json`
  );
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseId: BASE_ID,
        tableId: TABLE_ID,
        recordCount: rows.length,
        records: rows,
      },
      null,
      2
    )
  );
  return snapshotPath;
}

function validateRows(rows) {
  const rowNumbers = rows.map((row) => row.Row).filter((row) => row != null);
  if (rows.length !== 456) {
    throw new Error(`Expected 456 deck rows; received ${rows.length}`);
  }
  if (new Set(rowNumbers).size !== rowNumbers.length) {
    throw new Error("Duplicate Row values found in R7 Label Deck");
  }

  const unknown = new Set();
  for (const row of rows) {
    for (const reason of arr(row.NoneReason)) {
      if (!KNOWN_REASONS.has(reason)) unknown.add(reason);
    }
  }
  if (unknown.size) {
    throw new Error(
      `Unknown NoneReason option(s): ${JSON.stringify([...unknown])}`
    );
  }

  // Airtable omits empty cells, so presence is checked across the whole deck
  // rather than per row. A field absent from all 456 rows has been renamed or
  // deleted; the checks that read it would otherwise return silent zeroes.
  const present = new Set(rows.flatMap((row) => Object.keys(row)));
  const missing = REQUIRED_FIELDS.filter((field) => !present.has(field));
  if (missing.length) {
    throw new Error(
      `Field(s) absent from every deck row — renamed or deleted: ${missing.join(", ")}`
    );
  }
  const added = [...present].filter(
    (field) => field !== "id" && !REQUIRED_FIELDS.includes(field)
  );
  if (added.length) {
    console.log(`Note: ${added.length} field(s) present but unread: ${added.sort().join(", ")}`);
  }
}

// ---------------------------------------------------------------------------------------
// THE §77 ROUTING CONTRACT — the JS twin of `route_s77()` in models/sectioning/gate_step4a.py.
//
// Two implementations, ONE case table. The Python side is canonical because that is where
// the model target is built; this side must agree, and PARITY_CASES below is the same list
// asserted in both files so a change to one that is not made to the other fails loudly at
// startup rather than surfacing as a mismatched count weeks later.
//
// PRECEDENCE (the order IS the contract):
//   1. non-GTA     -> stage0    record fact; beats every content judgment
//   2. can't tell  -> excluded  editor could not decide; nothing brings these back
//   3. permanent   -> negative  wrong fit / B2B / civic; the gate's job
//   4. outcompeted -> withheld  LAST, so permanent+outcompeted falls through to (3)
//                               and lands in the gate as a negative — fails safe
//
// The previous version of this function returned "positive" for `outcompeted` and folded
// `non-GTA` into the negatives. That single defect produced three separate wrong numbers
// on 2026-07-30: a gate slice reported as 123/60, a false "zero residual conflicts", and a
// merged-binary target in the Python fit.
//
// NOTE ON "conflicted": it is gone as a routing outcome. Precedence RESOLVES double-ticks
// by design — that is what evaluating `outcompeted` last buys. A permanent+outcompeted row
// is still worth a human look, so it is surfaced by combinationFlags() as INFORMATIONAL,
// never as an unrouted row.
// ---------------------------------------------------------------------------------------
function targetOf(row) {
  const reasons = arr(row.NoneReason);
  if (INCLUDED_SECTIONS.has(row.Section)) return "positive";
  if (row.Section !== "None") return "excluded";
  // Throw on an unrecognised option, matching the Python side. Returning "unknown" here
  // would let an Airtable rename route silently into a bucket nobody reads.
  const unknown = reasons.filter((reason) => !KNOWN_REASONS.has(reason));
  if (unknown.length) {
    throw new Error(`unrecognised NoneReason option(s): ${JSON.stringify(unknown.sort())}`);
  }
  if (!reasons.length) return "unlabelled";
  if (reasons.includes(REASONS.NON_GTA)) return "stage0";
  if (reasons.includes(REASONS.CANT_TELL)) return "excluded";
  if (reasons.some((reason) => PERMANENT_NEGATIVES.has(reason))) return "negative";
  if (reasons.includes(REASONS.OUTCOMPETED)) return "withheld";
  throw new Error(`unroutable reason set: ${JSON.stringify(reasons.sort())}`);
}

// A permanent reason ticked alongside `outcompeted` routes cleanly to the gate, but it
// means the editor gave two different KINDS of reason on one row. Informational only.
function combinationFlags(row) {
  const reasons = arr(row.NoneReason);
  const flags = [];
  if (
    reasons.includes(REASONS.OUTCOMPETED) &&
    reasons.some((reason) => PERMANENT_NEGATIVES.has(reason))
  ) {
    flags.push("permanent+outcompeted (routes to gate-negative by precedence)");
  }
  if (reasons.includes(REASONS.CANT_TELL) && reasons.length > 1) {
    flags.push("can't-tell alongside a decided reason (routes to excluded)");
  }
  if (reasons.includes(REASONS.NON_GTA) && reasons.length > 1) {
    flags.push("non-GTA alongside a content reason (routes to stage0)");
  }
  return flags;
}

// PARITY, for real this time. Both implementations load THIS file — there is no local
// copy of the cases to edit, so the two cannot be changed consistently-with-themselves
// and still diverge from each other. The Python side asserts the same fixture at import.
const ROUTING_CASES = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "models", "sectioning", "routing_s77_cases.json"),
    "utf8"
  )
);

for (const c of ROUTING_CASES.cases) {
  const got = targetOf({ Section: c.section, NoneReason: c.reasons });
  if (got !== c.want) {
    throw new Error(
      `§77 routing contract broken: ${c.section} ${JSON.stringify(c.reasons)} ` +
        `-> ${got}, want ${c.want}`
    );
  }
}
for (const c of ROUTING_CASES.throw_cases) {
  let threw = false;
  try {
    targetOf({ Section: c.section, NoneReason: c.reasons });
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `§77 contract: expected a throw for ${JSON.stringify(c.reasons)} (${c.why})`
    );
  }
}

function tally(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function printCounts(counts, indent = "  ") {
  for (const [key, value] of Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )) {
    console.log(`${indent}${String(value).padStart(3)}  ${key}`);
  }
}

function rowSummary(row, includeDetails = false) {
  const parts = [
    `r${row.Row}`,
    `[${row.Slice ?? "no-slice"}]`,
    JSON.stringify(arr(row.NoneReason)),
    clip(row.Event, 72),
  ];
  if (text(row.NoneReasoning)) parts.push(`why=${clip(row.NoneReasoning, 100)}`);
  if (text(row.LinkGave)) parts.push(`link=${clip(row.LinkGave, 100)}`);
  if (arr(row.PreMarked).length) {
    parts.push(`hint=${JSON.stringify(arr(row.PreMarked))}`);
  }
  if (includeDetails && text(row.Details)) {
    parts.push(`details=${clip(row.Details, 160)}`);
  }
  return parts.join(" | ");
}

function printRows(heading, rows, options = {}) {
  const unique = [...new Map(rows.map((row) => [row.Row, row])).values()].sort(
    (a, b) => (a.Row ?? 0) - (b.Row ?? 0)
  );
  console.log(`\n=== ${heading} (${unique.length}) ===`);
  if (!unique.length) {
    console.log("  none");
    return;
  }
  for (const row of unique) {
    console.log(`  ${rowSummary(row, options.details ?? args.details)}`);
  }
}

function printProgress(rows) {
  const none = rows.filter((row) => row.Section === "None");
  const labelled = none.filter((row) => arr(row.NoneReason).length);
  console.log("\n=== PROGRESS ===");
  console.log(
    `  Section=None ${none.length} | labelled ${labelled.length} | remaining ${
      none.length - labelled.length
    }`
  );

  for (const slice of ["gate", "train", "walkthrough", "not in model set"]) {
    const sliceRows = none.filter((row) => row.Slice === slice);
    const sliceLabelled = sliceRows.filter((row) => arr(row.NoneReason).length);
    console.log(
      `  ${slice.padEnd(18)} ${String(sliceLabelled.length).padStart(3)} / ${String(
        sliceRows.length
      ).padStart(3)}`
    );
  }

  console.log("\n=== REASON TALLY — ALL LABELLED NONE ===");
  printCounts(tally(labelled.flatMap((row) => arr(row.NoneReason))));
}

function printGateRead(rows) {
  const gate = rows.filter((row) => row.Slice === "gate");
  const originalIncludables = gate.filter((row) =>
    INCLUDED_SECTIONS.has(row.Section)
  ).length;
  const gateNone = gate.filter(
    (row) => row.Section === "None" && arr(row.NoneReason).length
  );
  const targetCounts = tally(gateNone.map(targetOf));
  // §77: a `Section=None` row is NEVER a gate positive. Positives are the sectioned rows.
  // `outcompeted` routes to `withheld` and is deliberately absent from the fit.
  const positives = originalIncludables;
  const negatives = targetCounts.negative ?? 0;
  const usable = positives + negatives;

  console.log("\n=== REPRESENTATIVE GATE SLICE — DO NOT POOL WITH TRAIN ===");
  console.log(`  original includables  ${originalIncludables}`);
  printCounts(targetCounts);
  console.log(
    `  usable target         ${positives} positive / ${negatives} negative (${(
      (100 * positives) /
      (usable || 1)
    ).toFixed(1)}% positive, n=${usable})`
  );
  console.log(
    `  not fitted            ${targetCounts.withheld ?? 0} withheld (§83, pending Step 1c)` +
      `  ${targetCounts.stage0 ?? 0} stage0  ${targetCounts.excluded ?? 0} excluded`
  );
}

function compareSnapshots(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [row.Row, row]));
  const after = new Map(afterRows.map((row) => [row.Row, row]));
  const newlyLabelled = [];
  const cleared = [];
  const reasonChanged = [];
  const evidenceChanged = [];
  const protectedChanged = [];

  for (const [rowNumber, current] of after) {
    const prior = before.get(rowNumber);
    if (!prior) continue;

    const hadReason = arr(prior.NoneReason).length > 0;
    const hasReason = arr(current.NoneReason).length > 0;
    if (!hadReason && hasReason) newlyLabelled.push(current);
    if (hadReason && !hasReason) cleared.push(current);
    if (hadReason && hasReason && !sameArray(prior.NoneReason, current.NoneReason)) {
      reasonChanged.push(current);
    }
    if (
      text(prior.NoneReasoning) !== text(current.NoneReasoning) ||
      text(prior.LinkGave) !== text(current.LinkGave)
    ) {
      evidenceChanged.push(current);
    }

    const protectedFields = ["Section", "Flag", "Label", "Slice", "OutsideGTA"];
    const changedFields = protectedFields.filter(
      (field) => JSON.stringify(prior[field] ?? null) !== JSON.stringify(current[field] ?? null)
    );
    if (changedFields.length) {
      protectedChanged.push({ ...current, changedFields });
    }
  }

  return {
    newlyLabelled,
    cleared,
    reasonChanged,
    evidenceChanged,
    protectedChanged,
  };
}

function printDiff(baselinePath, beforeRows, rows) {
  const diff = compareSnapshots(beforeRows, rows);
  console.log(`\n=== DIFF VS ${path.basename(baselinePath)} ===`);
  console.log(`  newly labelled        ${diff.newlyLabelled.length}`);
  console.log(`  labels cleared        ${diff.cleared.length}`);
  console.log(`  reason sets changed   ${diff.reasonChanged.length}`);
  console.log(`  reasoning/link edits  ${diff.evidenceChanged.length}`);
  console.log(`  protected-field edits ${diff.protectedChanged.length}`);

  if (diff.newlyLabelled.length) {
    console.log("  newly labelled by slice:");
    printCounts(tally(diff.newlyLabelled.map((row) => row.Slice ?? "(blank)")), "    ");
    console.log("  newly labelled reasons:");
    printCounts(
      tally(diff.newlyLabelled.flatMap((row) => arr(row.NoneReason))),
      "    "
    );
  }

  if (args.showChanges) {
    printRows("NEWLY LABELLED ROWS", diff.newlyLabelled);
  }
  printRows("CLEARED LABELS", diff.cleared);
  printRows("CHANGED REASON SETS", diff.reasonChanged);

  if (diff.protectedChanged.length) {
    console.log(`\n=== PROTECTED-FIELD EDITS (${diff.protectedChanged.length}) ===`);
    for (const row of diff.protectedChanged) {
      console.log(
        `  ${rowSummary(row)} | fields=${row.changedFields.join(",")}`
      );
    }
  }
}

function repeatAudit(rows) {
  const byTitle = new Map();
  for (const row of rows) {
    const key = text(row.Event).toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(row);
  }

  const completedNoneGroups = [];
  const reasonMismatches = [];
  const includeNoneFlips = [];

  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    const sides = new Set(
      group.map((row) => (row.Section === "None" ? "None" : "include"))
    );
    if (sides.size > 1) includeNoneFlips.push(group);

    const completedNone = group.filter(
      (row) => row.Section === "None" && arr(row.NoneReason).length
    );
    if (completedNone.length < 2) continue;
    completedNoneGroups.push(completedNone);

    const reasonSets = new Set(
      completedNone.map((row) => sorted(arr(row.NoneReason)).join("|"))
    );
    if (reasonSets.size > 1) reasonMismatches.push(completedNone);
  }

  console.log("\n=== EXACT-TITLE CONSISTENCY ===");
  console.log(
    `  completed None groups ${completedNoneGroups.length} | agree ${
      completedNoneGroups.length - reasonMismatches.length
    } | mismatch ${reasonMismatches.length}`
  );
  console.log(`  include/None flips    ${includeNoneFlips.length}`);

  if (reasonMismatches.length) {
    console.log("\n  reason mismatches:");
    for (const group of reasonMismatches) {
      console.log(`  ${clip(group[0].Event, 90)}`);
      for (const row of group) console.log(`    ${rowSummary(row)}`);
    }
  }
}

function qualityAudit(rows) {
  const labelled = rows.filter(
    (row) => row.Section === "None" && arr(row.NoneReason).length
  );

  // §77 precedence RESOLVES every double-tick, so there is no such thing as an unrouted
  // row any more. These are surfaced because a row carrying two different KINDS of reason
  // is worth a human look — not because the target is ambiguous. Informational.
  const targetConflicts = labelled.filter(
    (row) => combinationFlags(row).length > 0
  );
  const missingReasoning = labelled.filter(
    (row) =>
      arr(row.NoneReason).some((reason) => SOFT_REASONS.has(reason)) &&
      !text(row.NoneReasoning)
  );
  const outsideMismatch = labelled.filter(
    (row) => row.OutsideGTA === true && !arr(row.NoneReason).includes(REASONS.NON_GTA)
  );

  const hintMap = new Map([
    ["b2b / prof-dev", REASONS.B2B],
    ["civic", REASONS.CIVIC],
    ["non-GTA", REASONS.NON_GTA],
  ]);
  const hintDisagreements = labelled.filter((row) =>
    arr(row.PreMarked).some(
      (hint) => hintMap.has(hint) && !arr(row.NoneReason).includes(hintMap.get(hint))
    )
  );

  const linkEvidence = labelled.filter((row) => text(row.LinkGave));
  // Runs over ALL rows, not just the None pile. Under §77 a `Section=None` row can never
  // be a gate positive, so scanning `labelled` here would have silently found nothing —
  // the check would have looked green while testing an empty set.
  const cancelledPositive = rows.filter(
    (row) =>
      targetOf(row) === "positive" &&
      /\bcancel(?:led|ed|lation)\b/i.test(`${text(row.Event)} ${text(row.Details)}`)
  );

  const semanticContradiction = labelled.filter((row) => {
    const reasoning = text(row.NoneReasoning);
    const link = text(row.LinkGave);
    if (
      arr(row.NoneReason).includes(REASONS.WRONG_FIT) &&
      /could be (?:placed under )?outcompeted|could be (?:ok|good)|would be i[mn]cluded/i.test(
        reasoning
      )
    ) {
      return true;
    }
    if (
      arr(row.NoneReason).includes(REASONS.CANT_TELL) &&
      /would be i[mn]cluded|too niche|\bno[!.]?$/i.test(link)
    ) {
      return true;
    }
    return false;
  });

  const sensitiveLanguage =
    /\b(?:asian|indian|jew(?:ish)?|muslim|gay|lesbian|indigenous|filipino|iranian|russian|afghan|women|ladies)\b/i;
  const sensitiveReasoning = labelled.filter((row) =>
    sensitiveLanguage.test(`${text(row.NoneReasoning)} ${text(row.LinkGave)}`)
  );

  // Not conflicts: §77 precedence routes every one of these deterministically. They are
  // surfaced because the row carries two different KINDS of reason, which is worth a look.
  printRows("MIXED-REASON COMBINATIONS — INFORMATIONAL, ROUTED BY PRECEDENCE", targetConflicts);
  printRows("OUTSIDE-GTA PROVENANCE MISMATCH", outsideMismatch);
  printRows("CANCELLED ROWS MAPPED POSITIVE", cancelledPositive);
  printRows("POSSIBLE SEMANTIC TARGET CONTRADICTIONS", semanticContradiction);

  console.log("\n=== MISSING REASONING ===");
  console.log(
    `  ${missingReasoning.length} subjective/ambiguous labels: ${missingReasoning
      .map((row) => `r${row.Row}`)
      .join(", ") || "none"}`
  );

  printRows(
    "HINT/LABEL DISAGREEMENTS — REVIEW, NOT AUTOMATIC ERRORS",
    hintDisagreements
  );
  printRows("LINK EVIDENCE — FINAL REVIEW STRATUM", linkEvidence);
  printRows(
    "SENSITIVE-ATTRIBUTE LANGUAGE — HUMAN REVIEW",
    sensitiveReasoning
  );

  repeatAudit(rows);
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY is not set");
  }
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");

  const automaticBaseline = args.baseline ? null : newestSnapshot();
  const baselinePath = args.baseline ?? automaticBaseline;
  const beforeRows = baselinePath ? rowsFromSnapshot(baselinePath) : null;

  const startedAt = Date.now();
  const { rows, requests } = await fetchDeck();
  validateRows(rows);

  const snapshotPath = args.writeSnapshot ? writeSnapshot(rows) : null;
  console.log(
    `Pulled ${rows.length} rows in ${requests} requests (${(
      (Date.now() - startedAt) /
      1000
    ).toFixed(1)}s)`
  );
  console.log(
    snapshotPath
      ? `Snapshot: ${path.relative(process.cwd(), snapshotPath)}`
      : "Snapshot: skipped (--no-snapshot)"
  );

  printProgress(rows);
  printGateRead(rows);
  if (beforeRows) printDiff(baselinePath, beforeRows, rows);
  else console.log("\n=== DIFF ===\n  no prior snapshot found; this run establishes the baseline");
  qualityAudit(rows);
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
