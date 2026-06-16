// depthCheck.js
// Read-only. Measures per-issue in-window candidate DEPTH — the classification-
// independent half of the R5 sign-off gate (the per-segment half is coupled to R7
// and deferred). Answers: "for each of the next few weekly issues, how many eligible
// candidates fall in that issue's 10-day window?" Catches the §37 trap where the total
// pool looks fat but a specific issue's window is thin.
//
// Eligibility = supply capacity, NOT editorial throughput:
//   - Status != Rejected (Rejected == functional delete)
//   - Start Date present + parseable
//   - URL present
//   (Approved is NOT required — that measures editor throughput, not R5 ingestion supply.)
//
// Windows overlap by design: issues are 7 days apart, windows are 10 days
// (IssueDate+1..+10), so consecutive windows share 3 days. An event can count
// toward two issues — correct, it's a candidate for whichever issue picks it.
//
// Run: node scripts/depthCheck.js

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../NLAP_Airtable.env") });

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const CANDIDATES_TABLE = "tblRsboN66ZLzyDrM";
const OUT_DIR = path.join(__dirname, "../data/tracking/depth_checks");

function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const SLOTS_PER_ISSUE = 25;        // 5 sections x 5 (Trust Me Recipe is 1-2, manual)
const FLOOR_RATIO = 5;             // 5:1 floor per R5_Scope (revised 2026-06-05)
const FLOOR = SLOTS_PER_ISSUE * FLOOR_RATIO; // 125
const NUM_ISSUES = 4;              // next 4 weekly issues (~next month)

async function fetchAllRecords(tableId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  let records = [];
  let offset;
  do {
    const query = new URLSearchParams(offset ? { offset } : {});
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${query}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = await res.json();
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

const dateOnly = (v) => (typeof v === "string" ? v.slice(0, 10) : "");

// Format a Date (UTC parts) as YYYY-MM-DD, no timezone drift.
function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

// Next NUM_ISSUES Thursdays (issue dates), starting from the first Thursday >= today.
function upcomingIssueDates() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const daysToThu = (4 - today.getUTCDay() + 7) % 7; // Thursday == 4
  const first = new Date(today);
  first.setUTCDate(first.getUTCDate() + daysToThu);
  const out = [];
  for (let i = 0; i < NUM_ISSUES; i++) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i * 7);
    out.push(ymd(d));
  }
  return out;
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const records = await fetchAllRecords(CANDIDATES_TABLE);
  const today = ymd(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));

  // Eligible supply: non-Rejected, dated, URL present.
  const eligible = records
    .map((r) => ({
      status: r.fields["Status"] ?? "(blank)",
      url: r.fields["URL"] || "",
      day: dateOnly(r.fields["Start Date"]),
    }))
    .filter((r) => r.status !== "Rejected" && r.url && /^\d{4}-\d{2}-\d{2}$/.test(r.day));

  const issues = upcomingIssueDates();

  console.log(`\nDepth check — ${records.length} total Candidate records, ${eligible.length} eligible (non-Rejected + dated + URL).`);
  console.log(`Today: ${today} | Floor: ${FLOOR} per issue (${FLOOR_RATIO}:1 vs ${SLOTS_PER_ISSUE} slots)\n`);
  console.log("Issue (Thu)  Window (events)        Depth   vs floor   New / Approved / other");
  console.log("-----------  ---------------------  ------  ---------  ----------------------");

  const perIssue = [];
  for (const issue of issues) {
    const winStart = addDays(issue, 1);
    const winEnd = addDays(issue, 10);
    const inWin = eligible.filter((r) => r.day >= winStart && r.day <= winEnd);
    const nNew = inWin.filter((r) => r.status === "New").length;
    const nAppr = inWin.filter((r) => r.status === "Approved").length;
    const nOther = inWin.length - nNew - nAppr;
    const meetsFloor = inWin.length >= FLOOR;
    const verdict = meetsFloor ? "OK" : `SHORT (-${FLOOR - inWin.length})`;
    console.log(
      `${issue}   ${winStart}..${winEnd}  ${String(inWin.length).padStart(5)}  ${verdict.padEnd(9)}  ${nNew} / ${nAppr} / ${nOther}`
    );
    perIssue.push({
      issueDate: issue,
      window: [winStart, winEnd],
      depth: inWin.length,
      meetsFloor,
      byStatus: { New: nNew, Approved: nAppr, other: nOther },
    });
  }

  console.log(
    "\nNote: depth is AGGREGATE (all segments pooled). Per-segment depth — the number that" +
    "\nactually governs starvation — needs trustworthy classification (R7) and is deferred there."
  );

  // Persist a compact summary for run-over-run depth monitoring (the gate is "across
  // 3 consecutive runs", so the time series is what clears it — not any single run).
  // Mirrors scripts/overlapAudit.js. Aggregate only; per-segment is R7-deferred.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    capturedAt: new Date().toISOString(),
    today,
    params: { slotsPerIssue: SLOTS_PER_ISSUE, floorRatio: FLOOR_RATIO, floor: FLOOR, numIssues: NUM_ISSUES },
    totals: { records: records.length, eligible: eligible.length },
    perIssue,
  };
  const outPath = path.join(OUT_DIR, `depth_${timestampForFilename()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nDepth summary written: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
