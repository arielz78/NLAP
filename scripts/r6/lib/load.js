// scripts/r6/lib/load.js
// Reads local snapshots only. Never touches Airtable.
//
// Eligibility for the R6 pool mirrors depthCheck.js's supply definition, not the allocator's
// "Approved" view: Status != Rejected, Start Date present, URL present, start inside
// [issueDate+1, issueDate+10]. Approval happens later, in the R8 console, not before ranking.

const fs = require("fs");
const path = require("path");
const { ymd, addDays } = require("./util.js");

function latestFile(dir, prefix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

// snapshotCandidates.js format: { records: [{ id, createdTime, fields }] }. Bare arrays accepted too.
function loadSnapshot(p) {
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const recs = raw.records || raw;
  return recs.map((r) => ({ id: r.id, createdTime: r.createdTime, ...(r.fields || r) }));
}

function loadJsonl(p) {
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function windowFor(issueDate) {
  return { start: addDays(issueDate, 1), end: addDays(issueDate, 10) };
}

// Returns { survivors, ledger } where ledger records every exclusion with a reason,
// so an omission is visible and countable (README: "missed events, invisibly").
function inWindowSurvivors(records, issueDate) {
  const w = windowFor(issueDate);
  const survivors = [];
  const ledger = [];
  for (const r of records) {
    const start = ymd(r["Start Date"]);
    let reason = null;
    if (r.Status === "Rejected") reason = "status_rejected";
    else if (!start) reason = "no_start_date";
    else if (!r.URL) reason = "no_url";
    else if (start < w.start || start > w.end) reason = "outside_window";
    if (reason) ledger.push({ id: r.id, reason });
    else survivors.push(r);
  }
  return { window: w, survivors, ledger };
}

module.exports = { latestFile, loadSnapshot, loadJsonl, windowFor, inWindowSurvivors };
