// snapshotCandidates.js
// Captures a full point-in-time snapshot of the Candidates and IssueItems tables
// to timestamped JSON files. The candidate pool changes every run and unlocked
// IssueItems are overwritten on every R3 rerun — both are otherwise unrecoverable.
// This is the raw data the R6 scoring backtest joins against later
// (pool → R3 picks → clicks).
// Read-only against Airtable; writes only to data/tracking/snapshots/.

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const CANDIDATES_TABLE = "tblRsboN66ZLzyDrM";
const ISSUEITEMS_TABLE = "tblrz2fZYUhxpZph2";
const OUT_DIR = path.join(__dirname, "../data/tracking/snapshots");

function timedFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function airtableFetch(pathStr, options = {}, retries = 3) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const url = `https://api.airtable.com/v0/${pathStr}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await timedFetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    if (res.status === 429) {
      if (attempt === retries) throw new Error(`Airtable rate limit hit on /${pathStr} — out of retries`);
      const wait = parseInt(res.headers.get("Retry-After") ?? "1", 10) * 1000;
      console.warn(`Rate limited on /${pathStr} — retrying in ${wait}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Airtable GET /${pathStr} → ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

async function fetchAllRecords(tableId) {
  const records = [];
  let offset;
  do {
    const query = new URLSearchParams(offset ? { offset } : {});
    const data = await airtableFetch(`${BASE_ID}/${tableId}?${query}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY environment variable is not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID environment variable is not set");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = timestampForFilename();
  const capturedAt = new Date().toISOString();

  console.log("Fetching all Candidates...");
  const candidates = await fetchAllRecords(CANDIDATES_TABLE);
  console.log(`Fetched ${candidates.length} candidate records.`);

  // At-a-glance counts — cheap weekly read on the pool's health.
  const byStatus = {};
  let needsReview = 0;
  for (const r of candidates) {
    const status = r.fields["Status"] ?? "(blank)";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (r.fields["NeedsReview"] === true) needsReview++;
  }
  console.log("By Status:", byStatus);
  console.log(`NeedsReview = true: ${needsReview}`);

  const candidatesPath = path.join(OUT_DIR, `candidates_${stamp}.json`);
  fs.writeFileSync(candidatesPath, JSON.stringify({
    capturedAt,
    baseId: BASE_ID,
    tableId: CANDIDATES_TABLE,
    recordCount: candidates.length,
    summary: { byStatus, needsReview },
    records: candidates,
  }, null, 2));
  console.log(`Candidates snapshot written: ${candidatesPath}`);

  console.log("Fetching all IssueItems...");
  const issueItems = await fetchAllRecords(ISSUEITEMS_TABLE);
  console.log(`Fetched ${issueItems.length} IssueItem records.`);

  // At-a-glance counts — IssueItems per section + lock count for pool health.
  const bySection = {};
  let locked = 0;
  for (const r of issueItems) {
    const section = r.fields["Section"] ?? "(blank)";
    bySection[section] = (bySection[section] ?? 0) + 1;
    if (r.fields["Lock"] === true) locked++;
  }
  console.log("By Section:", bySection);
  console.log(`Locked: ${locked}`);

  const issueItemsPath = path.join(OUT_DIR, `issueitems_${stamp}.json`);
  fs.writeFileSync(issueItemsPath, JSON.stringify({
    capturedAt,
    baseId: BASE_ID,
    tableId: ISSUEITEMS_TABLE,
    recordCount: issueItems.length,
    summary: { bySection, locked },
    records: issueItems,
  }, null, 2));
  console.log(`IssueItems snapshot written: ${issueItemsPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
