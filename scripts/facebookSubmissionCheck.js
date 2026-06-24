// facebookSubmissionCheck.js
// Read-only. The Facebook 0-submission detector (R5-W3 / #35 Task 5).
//
// Facebook is the client's clicks engine (~58% of historical clicks) but its intake
// is MANUAL — the client must paste a screenshot-extraction into the Airtable form
// each week. If he misses a week, the affected issue loses its highest-engagement
// source with no automated fallback. This check is the alarm for that miss.
//
// Signal: days since the most recent FacebookIntake submission (the SubmittedAt
// createdTime). "FB events in this run = 0" from the spec collapses to the same thing
// for a post-run read — if he submitted recently there are FB events, if he didn't
// there aren't. Cadence-since-last-submission is the unambiguous, run-independent sensor.
//
// Exit nonzero when stale (so postRunChecks surfaces it in the 🚨 FAILED summary);
// exit 0 when fresh. Read-only — never writes.
//
// Run: node scripts/facebookSubmissionCheck.js

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../NLAP_Airtable.env") });

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const FACEBOOK_INTAKE_TABLE = "tblbuDSV4w6KRSwjE";

// Alarm threshold. Publish cadence is weekly (Thursday), so 8 days = "missed a full
// cycle" with one day of grace. Calibrated by the client's confirmed weekly-submission
// commitment (#35) — bump or lower this one constant if the agreed cadence differs.
const STALE_DAYS = 8;

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

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const records = await fetchAllRecords(FACEBOOK_INTAKE_TABLE);

  // SubmittedAt is a createdTime field; fall back to the record createdTime if absent.
  const times = records
    .map((r) => r.fields["SubmittedAt"] || r.createdTime)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t));

  console.log(`\nFacebook submission check — ${records.length} intake submission(s) on record.`);
  console.log(`Threshold: flag when last submission is more than ${STALE_DAYS} days old.\n`);

  // Set process.exitCode (not process.exit()) and return: forcing exit here would
  // tear down fetch's still-open keep-alive sockets mid-close and trip a libuv
  // assertion on Windows. Letting main() return lets the event loop drain cleanly.
  if (times.length === 0) {
    console.log("🚨 No Facebook intake submissions on record — cannot confirm the client is feeding the manual intake.");
    process.exitCode = 1;
    return;
  }

  const last = Math.max(...times);
  const daysSince = Math.floor((Date.now() - last) / 86400000);
  const lastIso = new Date(last).toISOString().slice(0, 10);

  if (daysSince > STALE_DAYS) {
    console.log(`🚨 STALE — last Facebook submission was ${lastIso} (${daysSince} days ago, threshold ${STALE_DAYS}).`);
    console.log("   The next issue may be missing its highest-engagement source. Nudge the client to submit.");
    process.exitCode = 1;
    return;
  }

  console.log(`✅ OK — last Facebook submission ${lastIso} (${daysSince} day(s) ago).`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
