// integrityCheck.js
// Read-only. Diffs the two most recent snapshots (data/tracking/snapshots/) for
// SILENT CORRUPTION of editor decisions — the one failure mode that's effectively
// irreversible (the editorial signal is also R6/R7 training ground truth).
//
// Catches the §41-class regression (upsert silently resetting an editor's decision):
//   - Candidates: a record that was Status=Approved is now New or blank.
//     (Approved→Rejected is the editor's call — legitimate, NOT flagged.
//      New→Approved is normal approval — NOT flagged.)
//   - IssueItems: a record that was Lock=true is now unlocked, or has disappeared.
//     (Data rule: never overwrite IssueItems where Lock=true.)
//
// These are the two transitions no legitimate flow produces. Run after each R1.
// Exits nonzero if any violation is found, so it can gate. Writes a report ONLY
// when violations exist — the value here is the alarm, not a time series.
//
// Run: node scripts/integrityCheck.js

const fs = require("fs");
const path = require("path");

const SNAP_DIR = path.join(__dirname, "../data/tracking/snapshots");
const OUT_DIR = path.join(__dirname, "../data/tracking/integrity_checks");

// Two most recent snapshot files matching a prefix, oldest-first.
function lastTwo(prefix) {
  if (!fs.existsSync(SNAP_DIR)) return [];
  const files = fs
    .readdirSync(SNAP_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort(); // filename timestamps sort chronologically
  return files.slice(-2).map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), "utf8")),
  }));
}

function indexById(snapshot) {
  const m = new Map();
  for (const r of snapshot.data.records) m.set(r.id, r.fields || {});
  return m;
}

function main() {
  const violations = [];

  // --- Candidates: Approved → New/blank ---
  const cand = lastTwo("candidates_");
  if (cand.length < 2) {
    console.log("Candidates: fewer than 2 snapshots — nothing to diff yet.");
  } else {
    const [prev, curr] = cand;
    const prevMap = indexById(prev);
    const currMap = indexById(curr);
    for (const [id, prevFields] of prevMap) {
      if ((prevFields["Status"] ?? "") !== "Approved") continue;
      const currFields = currMap.get(id);
      const now = currFields ? currFields["Status"] ?? "(blank)" : "(MISSING)";
      if (now === "New" || now === "(blank)" || now === "(MISSING)") {
        violations.push({
          table: "Candidates",
          id,
          title: prevFields["Event Title"] || currFields?.["Event Title"] || "(no title)",
          change: `Status Approved → ${now}`,
        });
      }
    }
    console.log(`Candidates: diffed ${prev.file} → ${curr.file} (${prevMap.size} → ${currMap.size} records).`);
  }

  // --- IssueItems: Lock=true → unlocked or missing ---
  const items = lastTwo("issueitems_");
  if (items.length < 2) {
    console.log("IssueItems: fewer than 2 snapshots — nothing to diff yet.");
  } else {
    const [prev, curr] = items;
    const prevMap = indexById(prev);
    const currMap = indexById(curr);
    for (const [id, prevFields] of prevMap) {
      if (prevFields["Lock"] !== true) continue;
      const currFields = currMap.get(id);
      if (!currFields) {
        violations.push({ table: "IssueItems", id, title: prevFields["DisplayTitle"] || "(no title)", change: "Lock=true record DISAPPEARED" });
      } else if (currFields["Lock"] !== true) {
        violations.push({ table: "IssueItems", id, title: prevFields["DisplayTitle"] || "(no title)", change: "Lock true → not locked" });
      }
    }
    console.log(`IssueItems: diffed ${prev.file} → ${curr.file} (${prevMap.size} → ${currMap.size} records).`);
  }

  console.log("");
  if (violations.length === 0) {
    console.log("✅ No editorial-corruption regressions between the last two snapshots.");
    return;
  }

  console.error(`🚨 ${violations.length} INTEGRITY VIOLATION(S) — an editor decision was silently overwritten:`);
  for (const v of violations) console.error(`   [${v.table}] ${v.change} — "${v.title}" (${v.id})`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(OUT_DIR, `violations_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ capturedAt: new Date().toISOString(), violations }, null, 2));
  console.error(`\nReport written: ${outPath}`);
  process.exit(1);
}

main();
