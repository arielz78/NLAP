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
const PERMANENT_NEGATIVES = new Set([
  REASONS.NON_GTA,
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
}

function targetOf(row) {
  const reasons = arr(row.NoneReason);
  if (!reasons.length) return "unlabelled";

  const permanent = reasons.some((reason) => PERMANENT_NEGATIVES.has(reason));
  const outcompeted = reasons.includes(REASONS.OUTCOMPETED);
  const cantTell = reasons.includes(REASONS.CANT_TELL);

  if ((permanent && outcompeted) || (cantTell && reasons.length > 1)) {
    return "conflicted";
  }
  if (permanent) return "negative";
  if (outcompeted) return "positive";
  if (cantTell) return "excluded";
  return "unknown";
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
  const positives = originalIncludables + (targetCounts.positive ?? 0);
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
    `  excluded/conflicted   ${(targetCounts.excluded ?? 0) + (targetCounts.conflicted ?? 0)}`
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

  const targetConflicts = labelled.filter(
    (row) => targetOf(row) === "conflicted"
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
  const cancelledPositive = labelled.filter(
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

  printRows("TARGET-CONFLICTING COMBINATIONS", targetConflicts);
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
