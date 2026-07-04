// postRunChecks.js
// Runs the full post-R1 health-check suite in order, as ONE step so no check is
// forgotten. Intended to fire right after each R1 ingestion run.
//
//   1. snapshotCandidates.js  — capture state FIRST (the others read its output)
//   2. integrityCheck.js      — silent-corruption alarm (Approved→New, lock-drop)
//   3. overlapAudit.js        — cross-source duplicate health
//   4. depthCheck.js          — per-issue in-window pool depth vs floor
//   5. facebookSubmissionCheck.js — Facebook 0-submission / stale-intake alarm
//   6. rejectionCheck.js      — pre-Airtable drop counts + reasons (Clean/Filter, DateWindow)
//
// Each check runs even if an earlier one fails; a single combined exit code and
// summary are returned at the end. If DISCORD_WEBHOOK_RUNLOGS is set in the env,
// posts a one-line summary (and any integrity violation) to Discord #run-logs —
// because a check you never see is the same as not running it.
//
// Run: node scripts/postRunChecks.js

const { execFileSync } = require("child_process");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../NLAP_Airtable.env") });

const CHECKS = [
  { name: "snapshot", file: "snapshotCandidates.js" },
  { name: "integrity", file: "integrityCheck.js" },
  { name: "overlap", file: "overlapAudit.js" },
  { name: "depth", file: "depthCheck.js" },
  { name: "fbsubmission", file: "facebookSubmissionCheck.js" },
  { name: "rejections", file: "rejectionCheck.js" },
];

function runOne(file) {
  try {
    const out = execFileSync("node", [path.join(__dirname, file)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (e) {
    // execFileSync throws on nonzero exit (e.g. integrityCheck on violation).
    return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}`.trim() || e.message };
  }
}

async function postDiscord(content) {
  const url = process.env.DISCORD_WEBHOOK_RUNLOGS;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }), // Discord 2000-char cap
    });
    if (!res.ok) console.error(`Discord post failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error(`Discord post error: ${e.message}`);
  }
}

async function main() {
  const results = [];
  for (const c of CHECKS) {
    process.stdout.write(`\n===== ${c.name} (${c.file}) =====\n`);
    const r = runOne(c.file);
    process.stdout.write(r.out + "\n");
    results.push({ ...c, ...r });
  }

  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  const allOk = failed.length === 0;

  // Build a compact Discord/console summary. The integrity result is the one
  // that must be loud — a failure there means an editor decision was overwritten.
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  let summary = `**Post-R1 checks — ${stamp}**\n`;
  summary += allOk
    ? "✅ All five checks passed."
    : `🚨 FAILED: ${failed.join(", ")}.`;
  if (failed.includes("integrity")) {
    const integ = results.find((r) => r.name === "integrity");
    const lines = integ.out.split("\n").filter((l) => l.includes("🚨") || l.includes("["));
    if (lines.length) summary += "\n" + lines.join("\n");
  }

  console.log("\n" + summary.replace(/\*\*/g, ""));
  await postDiscord(summary);

  process.exit(allOk ? 0 : 1);
}

main();
