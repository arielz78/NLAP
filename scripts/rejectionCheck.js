// rejectionCheck.js
// Read-only. Surfaces what the ingestion pipeline silently dropped before it ever
// reached Airtable — the pre-R2 schema validator (Title/Link/StartDate hard-reject,
// #7/#34) and the date-window filter (DateWindow) both used to fail silently
// (console.log only, visible to nobody). This reads the durable log those two n8n
// Code nodes now write on every run (data/tracking/ingestion_rejections.jsonl) and
// reports it the same way the other five post-run checks do.
//
// Precedent this guards against: #58, the RSS date-parsing bug that silently
// dropped valid future events for months before anyone noticed by manually
// inspecting feed content. A count you never see is the same as not counting.
//
// No alarm threshold yet — there's no baseline for "normal" MISSING_LINK/
// MISSING_DATE volume per source (same reasoning as the per-source expected-count
// health check waiting for ~5 runs before it flags). This version reports plainly;
// add a threshold once a baseline exists.
//
// Run: node scripts/rejectionCheck.js

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../data/tracking/ingestion_rejections.jsonl");

function readLatestEntries() {
  if (!fs.existsSync(LOG_FILE)) return {};
  const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
  const latest = {};
  for (const line of lines) {
    const entry = JSON.parse(line);
    latest[entry.node] = entry; // last occurrence per node wins — append-only file
  }
  return latest;
}

function printEntry(entry) {
  if (!entry) {
    console.log("  (no data — node hasn't run since logging was added, or log file is missing)");
    return;
  }
  const reasonCounts = Object.entries(entry)
    .filter(([k]) => !["timestamp", "node", "kept", "rejected"].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`  [${entry.node}] ${reasonCounts} kept=${entry.kept} (run: ${entry.timestamp})`);
  if (entry.rejected && entry.rejected.length) {
    for (const r of entry.rejected) {
      const detail = r.title || r.link || "(no title/link)";
      console.log(`    - ${r.reason}: ${r.sourceCanonical || "(unknown source)"} — ${detail}`);
    }
  }
}

function main() {
  const latest = readLatestEntries();

  console.log("\nIngestion rejection check — counts + reasons for records dropped pre-Airtable.\n");
  printEntry(latest["Clean/Filter"]);
  printEntry(latest["DateWindow"]);

  // Flag if a single source accounts for most of a reason's rejections — the
  // signal that caught Unionville monopolizing MISSING_LINK on the first real run.
  const cf = latest["Clean/Filter"];
  if (cf && cf.rejected && cf.rejected.length >= 3) {
    const bySource = {};
    for (const r of cf.rejected) bySource[r.sourceCanonical] = (bySource[r.sourceCanonical] || 0) + 1;
    const [topSource, topCount] = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
    if (topCount === cf.rejected.length) {
      console.log(`\n⚠️  All ${topCount} Clean/Filter rejections this run are from one source: ${topSource}. Worth checking its normalize logic.`);
    }
  }

  console.log("\n(No alarm threshold yet — reporting only. See file header.)");
}

main();
