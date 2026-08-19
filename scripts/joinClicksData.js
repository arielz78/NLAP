/**
 * joinClicksData.js — Build the R6 labeled evaluation set from click behaviour.
 *
 * Joins the raw Beehiiv click export (link_clicks_*.csv) against issue_history.json
 * to label each historical newsletter pick with how well it performed *relative to
 * its section within its issue*.
 *
 * SCOPE: this grades the ORDERING of events that were already picked — not SELECTION.
 * No historical reject pool exists, so this backtest catches a grossly wrong formula
 * but does not validate which events should have been chosen. Selection is validated
 * forward via swap-rate. See docs: data/beehiiv/clicks_analysis_2026-05-13.md.
 *
 * Reads only local files under data/ (all gitignored — the CSV carries _bhlid
 * subscriber tokens). No Airtable/API/secrets needed. Read-only except its own output.
 *
 * Usage: node scripts/joinClicksData.js
 * Output: data/tracking/click_analysis/click_join_<YYYY-MM-DD_HHMM>.json
 */

const fs = require("fs");
const path = require("path");

// ---- Config (hardcoded on purpose: one-shot offline analysis, not a live/multi-tenant path) ----
const SCORED_SECTIONS = new Set(["For Families", "For Couples", "For Golden Age Readers"]);
const MATURATION_MIN_AGE_DAYS = 7; // clicks plateau by ~7d (measured 2026-07-07: <0.5% growth after day 7); exclude issues younger than this at export date
const MIN_SECTION_SIZE = 4;        // a percentile over 2-3 survivors is noise — drop that section-issue
const CLICK_METRIC = "Verified Unique Clicks"; // primary label metric (bot-filtered, per-subscriber)

const BEEHIIV_DIR = path.join(__dirname, "../data/beehiiv");
const HISTORY_PATH = path.join(BEEHIIV_DIR, "issue_history.json");
const OUT_DIR = path.join(__dirname, "../data/tracking/click_analysis");

// ---- URL normalization (canonical helper, copied verbatim from fetchBeehiivHistory.js) ----
function stripUtm(url) {
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign", "_bhlid", "fbclid", "acontext"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return url;
  }
}

function getCampaign(url) {
  try {
    return new URL(url).searchParams.get("utm_campaign");
  } catch {
    return null;
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "(unparseable)";
  }
}

function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ---- Minimal RFC4180-ish CSV parser (quote-aware; Beehiiv quotes thousands like "1,653") ----
function parseCsv(text) {
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field); field = "";
      if (record.length > 1 || record[0] !== "") rows.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length) { record.push(field); rows.push(record); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = r[i] !== undefined ? r[i] : null));
    return obj;
  });
}

function toClicks(v) {
  if (v == null) return 0;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// ---- Find the latest link_clicks_*.csv, with its export date (from the filename timestamp) ----
function findLatestClicksCsv() {
  const files = fs.readdirSync(BEEHIIV_DIR).filter((f) => /^link_clicks_.*\.csv$/i.test(f));
  if (!files.length) throw new Error(`No link_clicks_*.csv found in ${BEEHIIV_DIR}`);
  const withDates = files.map((f) => {
    const m = f.match(/(\d{4}-\d{2}-\d{2})T/);
    const exportDate = m ? new Date(m[1]) : fs.statSync(path.join(BEEHIIV_DIR, f)).mtime;
    return { f, exportDate };
  });
  withDates.sort((a, b) => b.exportDate - a.exportDate);
  return withDates[0];
}

// mid-rank percentile of each value within its section-issue, in [0,1]
function sectionPercentiles(values) {
  const n = values.length;
  return values.map((v) => {
    let less = 0, eq = 0;
    for (const w of values) { if (w < v) less++; else if (w === v) eq++; }
    return (less + 0.5 * eq) / n; // n>=MIN_SECTION_SIZE guaranteed by caller
  });
}

function main() {
  // ---- Load history → scored-section picks ----
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  const { f: csvFile, exportDate } = findLatestClicksCsv();
  const csvPath = path.join(BEEHIIV_DIR, csvFile);
  console.log(`History: ${path.basename(HISTORY_PATH)} (${history.length} issues)`);
  console.log(`Clicks:  ${csvFile} (export date ${exportDate.toISOString().slice(0, 10)})`);

  // ---- Index CSV by stripped base URL → rows ----
  const csvRows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const byBaseUrl = new Map();
  for (const r of csvRows) {
    const full = r["Full URL"];
    if (!full) continue;
    const base = stripUtm(full);
    const row = {
      campaign: getCampaign(full),
      vuc: toClicks(r["Verified Unique Clicks"]),
      vtc: toClicks(r["Verified Total Clicks"]),
    };
    if (!byBaseUrl.has(base)) byBaseUrl.set(base, []);
    byBaseUrl.get(base).push(row);
  }
  console.log(`Parsed ${csvRows.length} CSV rows → ${byBaseUrl.size} distinct base URLs.`);

  // ---- Build scored picks + attach clicks (conditional-slug join) ----
  const picks = [];
  for (const issue of history) {
    const issueDate = new Date(issue.date);
    const ageDays = (exportDate - issueDate) / 86400000;
    for (const ev of issue.events || []) {
      if (!SCORED_SECTIONS.has(ev.section)) continue;
      picks.push({
        section: ev.section,
        slot: ev.slot,
        slug: issue.slug,
        issueDate: issue.date,
        ageDays,
        eventName: ev.displayTitle || "",
        url: ev.url,
        sectionKey: `${issue.slug}|${ev.section}`,
      });
    }
  }

  let matched = 0;
  const unmatchedByDomain = {};
  for (const p of picks) {
    const base = stripUtm(p.url);
    const hits = byBaseUrl.get(base);
    let hit = null;
    if (hits && hits.length === 1) {
      hit = hits[0]; // unambiguous — no slug needed
    } else if (hits && hits.length > 1) {
      hit = hits.find((h) => h.campaign === p.slug) || null; // recurring event → disambiguate by slug
    }
    if (hit) {
      p.vuc = hit.vuc; p.vtc = hit.vtc; p.matched = true; matched++;
    } else {
      p.matched = false;
      const d = domainOf(p.url);
      unmatchedByDomain[d] = (unmatchedByDomain[d] || 0) + 1;
    }
  }

  // ---- Coverage report ----
  const bySection = {};
  for (const p of picks) {
    const s = (bySection[p.section] ||= { total: 0, matched: 0 });
    s.total++; if (p.matched) s.matched++;
  }
  const coverage = {
    scoredPicks: picks.length,
    matched,
    pct: +(100 * matched / picks.length).toFixed(1),
    bySection: Object.fromEntries(
      Object.entries(bySection).map(([k, v]) => [k, { ...v, pct: +(100 * v.matched / v.total).toFixed(1) }])
    ),
    unmatchedByDomainTop: Object.entries(unmatchedByDomain).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };

  // ---- Maturation filter (fixed front-loaded cutoff) ----
  const immatureIssues = [...new Set(picks.filter((p) => p.ageDays < MATURATION_MIN_AGE_DAYS).map((p) => p.slug))];
  const eligible = picks.filter((p) => p.matched && p.ageDays >= MATURATION_MIN_AGE_DAYS);

  // ---- Sections (one per section-issue) + section-size floor ----
  const sections = new Map();
  for (const p of eligible) {
    if (!sections.has(p.sectionKey)) sections.set(p.sectionKey, []);
    sections.get(p.sectionKey).push(p);
  }
  let droppedSmallSections = 0;
  const labeled = [];
  for (const [, section] of sections) {
    if (section.length < MIN_SECTION_SIZE) { droppedSmallSections++; continue; }
    const pctile = sectionPercentiles(section.map((p) => p.vuc));
    section.forEach((p, i) => {
      labeled.push({
        section: p.section, slot: p.slot, slug: p.slug, issueDate: p.issueDate,
        eventName: p.eventName, url: p.url, vuc: p.vuc, vtc: p.vtc,
        sectionSize: section.length,
        percentileVuc: +pctile[i].toFixed(4), // PRIMARY LABEL
      });
    });
  }

  // ---- Slot gradient (mean primary-label percentile by slot) ----
  const slotAgg = {};
  for (const r of labeled) {
    const s = (slotAgg[r.slot] ||= { n: 0, sum: 0 });
    s.n++; s.sum += r.percentileVuc;
  }
  const slotGradient = Object.fromEntries(
    Object.entries(slotAgg).sort((a, b) => a[0] - b[0]).map(([slot, v]) => [slot, { n: v.n, meanPercentile: +(v.sum / v.n).toFixed(3) }])
  );

  // ---- Write output (JSON + CSV + plain-text summary, same basename so they never drift) ----
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = timestampForFilename();
  const outPath = path.join(OUT_DIR, `click_join_${stamp}.json`);
  const csvOutPath = path.join(OUT_DIR, `click_join_${stamp}.csv`);
  const summaryPath = path.join(OUT_DIR, `click_join_${stamp}_summary.txt`);

  const sectionsSummary = { kept: sections.size - droppedSmallSections, droppedTooSmall: droppedSmallSections };
  fs.writeFileSync(outPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    scope: "Ordering of already-picked events (For Families/Couples/Golden Age Readers). NOT selection — validate that forward via swap-rate.",
    inputs: { historyPath: path.basename(HISTORY_PATH), clicksCsv: csvFile, exportDate: exportDate.toISOString() },
    config: { metric: CLICK_METRIC, maturationMinAgeDays: MATURATION_MIN_AGE_DAYS, minSectionSize: MIN_SECTION_SIZE },
    coverage,
    maturation: { minAgeDays: MATURATION_MIN_AGE_DAYS, excludedIssues: immatureIssues },
    sections: sectionsSummary,
    slotGradient,
    recordCount: labeled.length,
    records: labeled,
  }, null, 2));

  // CSV — the human-readable view (the metadata blocks above are JSON-only by design)
  const csvCols = ["issueDate", "section", "slot", "eventName", "slug", "url", "vuc", "vtc", "sectionSize", "percentileVuc"];
  const csvEsc = (v) => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const csv = [csvCols.join(",")]
    .concat(labeled.map((r) => csvCols.map((c) => csvEsc(r[c])).join(",")))
    .join("\n");
  fs.writeFileSync(csvOutPath, csv);

  // Summary sidecar — at-a-glance metadata for a CSV-first workflow, no JSON needed
  const summary = [
    `Click-join eval set — summary`,
    `Generated: ${new Date().toISOString()}`,
    `Inputs: ${path.basename(HISTORY_PATH)} + ${csvFile} (export ${exportDate.toISOString().slice(0, 10)})`,
    `Label metric: ${CLICK_METRIC} (within-section-within-issue percentile)`,
    ``,
    `Labeled records: ${labeled.length}`,
    `Coverage: ${matched}/${picks.length} scored picks matched (${coverage.pct}%)`,
    ...Object.entries(coverage.bySection).map(([sec, v]) => `  ${sec}: ${v.matched}/${v.total} (${v.pct}%)`),
    `Sections kept: ${sectionsSummary.kept}  |  dropped (<${MIN_SECTION_SIZE} matched): ${sectionsSummary.droppedTooSmall}`,
    `Issues excluded (younger than ${MATURATION_MIN_AGE_DAYS}d): ${immatureIssues.length ? immatureIssues.join(", ") : "none"}`,
    ``,
    `Slot gradient (mean within-section percentile by slot):`,
    ...Object.entries(slotGradient).map(([slot, v]) => `  slot ${slot}: ${v.meanPercentile}  (n=${v.n})`),
  ].join("\n");
  fs.writeFileSync(summaryPath, summary);

  // ---- Console summary ----
  console.log("\n=== COVERAGE ===");
  console.log(`  ${matched}/${picks.length} scored picks matched (${coverage.pct}%)`);
  for (const [sec, v] of Object.entries(coverage.bySection)) console.log(`  ${sec}: ${v.matched}/${v.total} (${v.pct}%)`);
  console.log("  Top unmatched domains:", JSON.stringify(coverage.unmatchedByDomainTop));
  console.log("\n=== MATURATION ===");
  console.log(`  Excluded ${immatureIssues.length} issue(s) younger than ${MATURATION_MIN_AGE_DAYS}d:`, immatureIssues);
  console.log("\n=== SECTIONS ===");
  console.log(`  ${sectionsSummary.kept} sections kept, ${sectionsSummary.droppedTooSmall} dropped (<${MIN_SECTION_SIZE} matched picks)`);
  console.log("\n=== SLOT GRADIENT (mean within-section percentile by slot) ===");
  for (const [slot, v] of Object.entries(slotGradient)) console.log(`  slot ${slot}: ${v.meanPercentile}  (n=${v.n})`);
  console.log(`\nLabeled records: ${labeled.length}`);
  console.log(`Written: ${outPath}`);
  console.log(`         ${csvOutPath}`);
  console.log(`         ${summaryPath}`);
}

main();
