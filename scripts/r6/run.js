#!/usr/bin/env node
// scripts/r6/run.js — R6 demo runner. READ-ONLY: reads local snapshots and history files, calls the
// LLM only with --attributes, and writes a run folder under data/tracking/r6_demo/. Never touches Airtable.
//
// Usage:
//   node scripts/r6/run.js --issue-date 2026-09-10 [--snapshot <candidates.json>] [--issueitems <issueitems.json>]
//        [--r7 <scored_survivors.jsonl>] [--attributes] [--max-calls 400] [--today YYYY-MM-DD] [--out <dir>]
//
// Modes (chosen from what is supplied):
//   evidence  no routing evidence (no --r7, no --attributes): collapse + evidence only, no slate.
//   prior     --r7 without filled weights: ordering = p_include x p_section (R8's day-one adapter).
//   scored    weights filled, plus --attributes and/or --r7: full RankedPool + Slate.
// Every scored/prior run also builds a date-order slate under identical rules for side-by-side comparison.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "../../NLAP_Airtable.env") });

const { SECTIONS, sha256, sha256File, todayIso, stampForFilename, normVenue, normTitle } = require("./lib/util.js");
const { latestFile, loadSnapshot, loadJsonl, inWindowSurvivors } = require("./lib/load.js");
const { collapse, nearDupClusters } = require("./lib/collapse.js");
const ev = require("./lib/evidence.js");
const attr = require("./lib/attributes.js");
const { weightBlanks, buildRankedPool } = require("./lib/score.js");
const { assemble } = require("./lib/assemble.js");

const ROOT = path.join(__dirname, "../..");
const SNAP_DIR = path.join(ROOT, "data/tracking/snapshots");
const DEFAULTS = {
  history: path.join(ROOT, "data/beehiiv/issue_history.json"),
  clicks: path.join(ROOT, "models/ranking/click_join/click_join_FROZEN_2026-07-07.json"),
  schema: path.join(__dirname, "config/attribute_schema.json"),
  weights: path.join(__dirname, "config/weights.json"),
  out: path.join(ROOT, "data/tracking/r6_demo"),
};

function parseArgs(argv) {
  const a = { attributes: false, maxCalls: 400 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--issue-date") a.issueDate = v, i++;
    else if (k === "--snapshot") a.snapshot = v, i++;
    else if (k === "--issueitems") a.issueitems = v, i++;
    else if (k === "--r7") a.r7 = v, i++;
    else if (k === "--attributes") a.attributes = true;
    else if (k === "--max-calls") a.maxCalls = Number(v), i++;
    else if (k === "--today") a.today = v, i++;
    else if (k === "--out") a.out = v, i++;
    else if (k === "--history") a.history = v, i++;
    else if (k === "--clicks") a.clicks = v, i++;
    else if (k === "--schema") a.schema = v, i++;
    else if (k === "--weights") a.weights = v, i++;
    else if (k === "--limit") a.limit = Number(v), i++; // smoke tests: extract attributes for the first N series only
    else throw new Error(`unknown arg ${k}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.issueDate || "")) throw new Error("--issue-date YYYY-MM-DD is required");
  return a;
}

function gitCommit() {
  try { return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return null; }
}

function locksForIssue(issueItems, candidatesById, issueDate) {
  const locks = [];
  for (const it of issueItems) {
    if (it.Lock !== true) continue;
    const m = /(\d{4}-\d{2}-\d{2})\s*$/.exec(it.Name || "");
    if (!m || m[1] !== issueDate) continue;
    const candId = Array.isArray(it.Candidate) ? it.Candidate[0] : null;
    const rec = candId ? candidatesById.get(candId) : null;
    locks.push({
      section: it.Section, slot: it.Slot,
      seriesKey: rec ? normTitle(rec["Event Title"]) : `locked:${it.id}`,
      venueKey: rec ? normVenue(rec.LocationName) : "",
      title: rec ? rec["Event Title"] : (it.Name || "locked item"),
    });
  }
  return locks;
}

function pct(n, d) { return d ? `${((100 * n) / d).toFixed(0)}%` : "n/a"; }
function fmtScore(e) { return e.score && e.score.score !== null ? e.score.score.toFixed(3) : e.ordering !== null && e.ordering !== undefined ? e.ordering.toFixed(3) : "-"; }

function assessmentSummary(alt) {
  const counts = {};
  for (const a of alt.assessments) counts[a.result] = (counts[a.result] || 0) + 1;
  const parts = Object.entries(counts).map(([k, v]) => `${k} x${v}`);
  const firstOverride = alt.assessments.find((a) => a.result === "override");
  return parts.join(", ") + (firstOverride ? ` (${firstOverride.reason})` : "");
}

function writeReport(outDir, ctx) {
  const { args, mode, window, counts, stats, rankedPool, slate, basePool, baseSlate, series, schema, assumptions } = ctx;
  const L = [];
  L.push(`# R6 demo run — issue ${args.issueDate}`);
  L.push("");
  L.push(`Mode: **${mode}** · window ${window.start} to ${window.end} · generated ${new Date().toISOString()}`);
  L.push("");
  L.push("| Count | Value |");
  L.push("|---|---:|");
  for (const [k, v] of Object.entries(counts)) L.push(`| ${k} | ${v} |`);
  if (stats) {
    L.push(`| LLM calls / cache hits / failures / budget-stopped | ${stats.calls} / ${stats.cacheHits} / ${stats.failures} / ${stats.budgetStopped} |`);
    L.push(`| tokens prompt / completion | ${stats.promptTokens} / ${stats.completionTokens} |`);
  }
  L.push("");

  if (!rankedPool) {
    L.push("## Evidence only (no routing evidence supplied)");
    L.push("");
    L.push("Supply `--r7 <scored_survivors.jsonl>` or fill the config worksheets and pass `--attributes` to build a slate.");
    L.push("");
    L.push("| Start | Series | Dates | Venue | Evidence |");
    L.push("|---|---|---:|---|---|");
    for (const s of [...series].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      L.push(`| ${s.startDate} | ${s.title.replace(/\|/g, "/")} | ${s.occurrencesInWindow} | ${s.venue.replace(/\|/g, "/")} | ${s.evidenceLines.join(" · ").replace(/\|/g, "/")} |`);
    }
    fs.writeFileSync(path.join(outDir, "report.md"), L.join("\n"));
    return;
  }

  for (const section of SECTIONS) {
    L.push(`## ${section}`);
    L.push("");
    L.push(`Pool: ${rankedPool.sections[section].length} series (${rankedPool.sections[section].filter((e) => e.flex).length} flex).`);
    L.push("");
    L.push("### Selected");
    L.push("");
    L.push("| Slot | Rank | Series | Date | Venue | Score | Flags | Evidence |");
    L.push("|---:|---:|---|---|---|---:|---|---|");
    slate.selected[section].forEach((e, i) => {
      if (!e) { L.push(`| ${i + 1} | - | *(unfilled)* | | | | | |`); return; }
      const flags = (e.flags || []).filter((f) => f !== "published_before").join(", ");
      L.push(`| ${i + 1} | ${e.rank ?? "-"} | ${(e.title || "").replace(/\|/g, "/")} | ${e.startDate || ""} | ${(e.venue || "").replace(/\|/g, "/")} | ${e.locked ? "lock" : fmtScore(e)} | ${flags} | ${(e.evidenceLines || []).join(" · ").replace(/\|/g, "/")} |`);
    });
    if (slate.unfilled[section]) L.push(`\n**Unfilled:** ${slate.unfilled[section]}`);
    L.push("");
    L.push("### Alternatives (next 8 in pool order)");
    L.push("");
    L.push("| Rank | Series | Date | Assessment vs slots 1-5 | Evidence |");
    L.push("|---:|---|---|---|---|");
    for (const a of slate.alternatives[section].slice(0, 8)) {
      L.push(`| ${a.rank} | ${a.title.replace(/\|/g, "/")}${a.flex ? " *(flex)*" : ""} | ${a.startDate} | ${assessmentSummary(a)} | ${(a.evidenceLines || []).join(" · ").replace(/\|/g, "/")} |`);
    }
    L.push("");
    if (slate.skipped[section].length) {
      L.push("### Skipped by the assembler");
      L.push("");
      for (const s of slate.skipped[section]) L.push(`- #${s.rank} ${s.title} — ${s.reason}`);
      L.push("");
    }
    if (baseSlate) {
      const r6 = slate.selected[section].filter(Boolean).map((e) => e.seriesKey);
      const base = baseSlate.selected[section].filter(Boolean).map((e) => e.seriesKey);
      const overlap = r6.filter((k) => base.includes(k)).length;
      L.push(`### Versus date order (today's path)`);
      L.push("");
      L.push(`Overlap ${overlap}/5. Date-order slate: ${baseSlate.selected[section].filter(Boolean).map((e) => e.title).join(" · ")}`);
      const added = slate.selected[section].filter((e) => e && !base.includes(e.seriesKey)).map((e) => e.title);
      const dropped = baseSlate.selected[section].filter((e) => e && !r6.includes(e.seriesKey)).map((e) => e.title);
      if (added.length) L.push(`\nR6 added: ${added.join(" · ")}`);
      if (dropped.length) L.push(`\nR6 dropped: ${dropped.join(" · ")}`);
      L.push("");
    }
  }

  if (mode === "scored" && schema) {
    L.push("## Attribute unknown rate (diagnostic)");
    L.push("");
    L.push("| Field | unknown | of |");
    L.push("|---|---:|---:|");
    const withAttrs = series.filter((s) => s.attributes);
    for (const f of schema.fields) {
      const unk = withAttrs.filter((s) => s.attributes[f.name]?.value === "unknown").length;
      L.push(`| ${f.name} | ${unk} (${pct(unk, withAttrs.length)}) | ${withAttrs.length} |`);
    }
    L.push("");
  }

  if (rankedPool.excluded.length) {
    L.push(`## Unrouted series (${rankedPool.excluded.length})`);
    L.push("");
    for (const x of rankedPool.excluded.slice(0, 15)) L.push(`- ${x.title} — ${x.flags.join(", ")}`);
    if (rankedPool.excluded.length > 15) L.push(`- … ${rankedPool.excluded.length - 15} more in ranked_pool.json`);
    L.push("");
  }

  L.push("## Assumptions in this run");
  L.push("");
  for (const a of assumptions) L.push(`- ${a}`);
  fs.writeFileSync(path.join(outDir, "report.md"), L.join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = args.today || todayIso();
  const snapshotPath = args.snapshot || latestFile(SNAP_DIR, "candidates_");
  const issueItemsPath = args.issueitems || latestFile(SNAP_DIR, "issueitems_");
  const historyPath = args.history || DEFAULTS.history;
  const clicksPath = args.clicks || DEFAULTS.clicks;
  if (!snapshotPath) throw new Error("no candidates snapshot found; run scripts/snapshotCandidates.js first");

  const outDir = path.join(args.out || DEFAULTS.out, `${args.issueDate}_${stampForFilename()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const callsLogPath = path.join(outDir, "calls.jsonl");

  // ---- inputs ----
  const records = loadSnapshot(snapshotPath);
  const candidatesById = new Map(records.map((r) => [r.id, r]));
  const issueItems = issueItemsPath ? loadSnapshot(issueItemsPath) : [];
  const issueHistory = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  const clickJoin = JSON.parse(fs.readFileSync(clicksPath, "utf8"));
  const r7Rows = args.r7 ? loadJsonl(args.r7) : null;
  const schemaPath = args.schema || DEFAULTS.schema;
  const weightsPath = args.weights || DEFAULTS.weights;
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const weights = JSON.parse(fs.readFileSync(weightsPath, "utf8"));

  // ---- pool -> series -> evidence ----
  const { window, survivors, ledger } = inWindowSurvivors(records, args.issueDate);
  fs.writeFileSync(path.join(outDir, "survivors_ledger.jsonl"), ledger.map((l) => JSON.stringify(l)).join("\n"));
  let series = collapse(survivors);
  series = nearDupClusters(series, weights.params?.near_dup_jaccard ?? 0.6);
  const ctx = {
    issueDate: args.issueDate,
    historyIdx: ev.buildHistoryIndex(Array.isArray(issueHistory) ? issueHistory : issueHistory.issues || []),
    issueItemsIdx: ev.buildIssueItemsIndex(issueItems, candidatesById),
    clickIdx: ev.buildClickIndex(clickJoin),
    r7Idx: ev.buildR7Index(r7Rows),
    horizonCounts: ev.horizonCounts(records, today),
  };
  ev.attachEvidence(series, ctx);

  // ---- mode ----
  const sBlanks = attr.schemaBlanks(schema);
  const wBlanks = weightBlanks(weights);
  let mode;
  if (args.attributes) {
    if (sBlanks.length || wBlanks.length) {
      console.error("Cannot run --attributes: authored blanks remain.");
      if (sBlanks.length) console.error("  attribute_schema.json: " + sBlanks.join(", "));
      if (wBlanks.length) console.error("  weights.json: " + wBlanks.join(", "));
      process.exit(2);
    }
    mode = "scored";
  } else if (r7Rows) {
    mode = wBlanks.length ? "prior" : "scored";
  } else {
    mode = "evidence";
  }
  if (mode === "prior" && typeof weights.params.flex_margin !== "number") weights.params.flex_margin = 0;

  // ---- attributes ----
  let stats = null;
  if (mode === "scored" && args.attributes) {
    const apiKey = process.env.R6_LLM_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY (or R6_LLM_API_KEY) missing from NLAP_Airtable.env");
    let target = series;
    if (args.limit) {
      target = [...series]
        .sort((a, b) => (b.evidence.r7?.p_include ?? -1) - (a.evidence.r7?.p_include ?? -1) || a.startDate.localeCompare(b.startDate))
        .slice(0, args.limit);
      for (const s of series) if (!target.includes(s)) { s.attributes = null; s.attributesMeta = { skipped: "limit" }; }
    }
    stats = await attr.extractAttributes(target, {
      schema, apiKey, maxCalls: args.maxCalls, callsLogPath,
      cacheDir: path.join(args.out || DEFAULTS.out, "cache", "attributes"),
    });
    console.log(`attributes: ${stats.calls} calls, ${stats.cacheHits} cache hits, ${stats.failures} failures, ${stats.budgetStopped} budget-stopped`);
  }

  // ---- rank + assemble ----
  let rankedPool = null, slate = null, basePool = null, baseSlate = null;
  const locks = locksForIssue(issueItems, candidatesById, args.issueDate);
  if (mode !== "evidence") {
    rankedPool = buildRankedPool(series, { schema, weights, mode, issueDate: args.issueDate });
    slate = assemble(rankedPool, locks, { near_dup_action: weights.params.near_dup_action || "flag" });
    basePool = buildRankedPool(series, { schema, weights, mode: "date", issueDate: args.issueDate });
    baseSlate = assemble(basePool, locks, { near_dup_action: weights.params.near_dup_action || "flag" });
  }

  // ---- artifacts ----
  const counts = {
    "snapshot records": records.length,
    "in-window listings": survivors.length,
    "series (ranking unit)": series.length,
    "near-dup clusters": new Set(series.map((s) => s.nearDupCluster).filter(Boolean)).size,
    "series published before": series.filter((s) => s.evidence.publishedCount).length,
    "series with click history": series.filter((s) => s.evidence.clickN).length,
    "series without description": series.filter((s) => !s.evidence.completeness.hasDescription).length,
    "locks for this issue": locks.length,
  };
  if (rankedPool) counts["unrouted series"] = rankedPool.excluded.length;
  const manifest = {
    run_id: null,
    generated_at: new Date().toISOString(),
    code_commit: gitCommit(),
    issue_date: args.issueDate, window, today, mode,
    inputs: {
      candidates_snapshot: { path: path.relative(ROOT, snapshotPath), sha256: sha256File(snapshotPath) },
      issueitems_snapshot: issueItemsPath ? { path: path.relative(ROOT, issueItemsPath), sha256: sha256File(issueItemsPath) } : null,
      issue_history: { path: path.relative(ROOT, historyPath), sha256: sha256File(historyPath) },
      click_join: { path: path.relative(ROOT, clicksPath), sha256: sha256File(clicksPath) },
      r7_scores: args.r7 ? { path: path.relative(ROOT, args.r7), sha256: sha256File(args.r7) } : null,
    },
    config: {
      attribute_schema: { path: path.relative(ROOT, schemaPath), prompt_version: schema.prompt_version, sha256: attr.schemaHash(schema), blanks: sBlanks.length },
      weights: { path: path.relative(ROOT, weightsPath), sha256: sha256(JSON.stringify(weights)), blanks: wBlanks.length },
      llm_model: args.attributes ? attr.MODEL : null,
      max_calls: args.maxCalls,
      limit: args.limit || null,
    },
    counts, llm_stats: stats,
  };
  manifest.run_id = sha256(JSON.stringify({ i: manifest.inputs, c: manifest.config, d: args.issueDate, m: mode })).slice(0, 16);
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, "series_evidence.json"), JSON.stringify(series, null, 2));
  if (rankedPool) {
    fs.writeFileSync(path.join(outDir, "ranked_pool.json"), JSON.stringify({ manifest_run_id: manifest.run_id, ...rankedPool }, null, 2));
    fs.writeFileSync(path.join(outDir, "slate.json"), JSON.stringify({ manifest_run_id: manifest.run_id, ...slate }, null, 2));
    fs.writeFileSync(path.join(outDir, "baseline_date_slate.json"), JSON.stringify(baseSlate, null, 2));
  }
  const assumptions = [
    "Ranking unit is the series (whitespace-collapsed lowercase title); representative listing is the earliest in-window occurrence.",
    "Series text is the longest DescriptionRaw among its members; the model reads at most 2000 characters of it.",
    mode === "scored" && !r7Rows
      ? "Section routing comes from the model's section_appeal because no R7 scores were supplied (demo-only fallback; production routing is R7)."
      : r7Rows ? "Section routing comes from R7 section probabilities; flex when |Couples - Golden| <= flex_margin." : "No section routing evidence in this run.",
    "Hard rules applied deterministically: alcohol -> For Couples only; kids' activities -> For Families only (editor, 2026-07-09).",
    "Venue and organizer history come from IssueItems joins only (post-pipeline issues); pre-pipeline venue history is not recoverable.",
    "Published-before uses stripped-URL matches against issue_history.json and IssueItems; recurring events with per-date URLs will undercount.",
    "Recurring cooldown and organizer concentration are policy-pending: surfaced as 'override' assessments, never as blocks.",
    "Near-duplicate clusters are report-level (title token overlap + same venue or adjacent date); action per weights.json near_dup_action.",
    "Locks are read from the IssueItems snapshot for this issue date; nothing is written back.",
  ];
  writeReport(outDir, { args, mode, window, counts, stats, rankedPool, slate, basePool, baseSlate, series, schema, assumptions });

  console.log(`mode=${mode}  listings=${survivors.length}  series=${series.length}  out=${path.relative(ROOT, outDir)}`);
  if (rankedPool) {
    for (const section of SECTIONS) {
      const sel = slate.selected[section].filter(Boolean).map((e) => e.title).join("  ·  ");
      console.log(`  ${section}: ${sel}${slate.unfilled[section] ? `  [${slate.unfilled[section]}]` : ""}`);
    }
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
