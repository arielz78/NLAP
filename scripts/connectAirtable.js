// connectAirtable.js
// Fetches Candidates from Airtable, runs buildIssues(), writes results to IssueItems.

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const { buildIssues, QUOTAS } = require("./buildIssues.js");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLES = {
  issues:     "tbl0NZBBOHiu4nb95",
  issueItems: "tblrz2fZYUhxpZph2",
  candidates: "tblRsboN66ZLzyDrM",
};
const VIEW_ELIGIBLE = "R3 - Eligible for Scheduling";

const SECTION_ORDER = {
  "For Families":          1,
  "For Couples":           2,
  "For Golden Age Readers":3,
  "Local Aroma":           4,
  "Trust Me Recipe":       5,
};

// ---------------------------------------------------------------------------
// Fetch timeout
// ---------------------------------------------------------------------------

function timedFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// ---------------------------------------------------------------------------
// Airtable helpers
// ---------------------------------------------------------------------------

async function airtableFetch(path, options = {}, retries = 3) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const url = `https://api.airtable.com/v0/${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await timedFetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (res.status === 429) {
      if (attempt === retries) throw new Error(`Airtable rate limit hit on /${path} — out of retries`);
      const wait = parseInt(res.headers.get("Retry-After") ?? "1", 10) * 1000;
      console.warn(`Rate limited on /${path} — retrying in ${wait}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${options.method ?? "GET"} /${path} → ${res.status}: ${body}`);
    }
    return res.json();
  }
}

async function fetchAllRecords(tableId, params = {}) {
  const records = [];
  let offset;
  do {
    const query = new URLSearchParams({ ...params, ...(offset ? { offset } : {}) });
    const data = await airtableFetch(`${BASE_ID}/${tableId}?${query}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

async function metaFetch(path, options = {}) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const url = `https://api.airtable.com/v0/meta/${path}`;
  const res = await timedFetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable META ${options.method ?? "GET"} /meta/${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function ensureSectionOrderField() {
  const data = await metaFetch(`bases/${BASE_ID}/tables`);
  const table = data.tables.find((t) => t.id === TABLES.issueItems);
  const exists = table && table.fields.some((f) => f.name === "SectionOrder");
  if (exists) {
    console.log("SectionOrder field already exists — skipping creation.");
    return;
  }
  await metaFetch(`bases/${BASE_ID}/tables/${TABLES.issueItems}/fields`, {
    method: "POST",
    body: JSON.stringify({ name: "SectionOrder", type: "number", options: { precision: 0 } }),
  });
  console.log("SectionOrder field created.");
}

async function ensureCandidateUrlField() {
  const data = await metaFetch(`bases/${BASE_ID}/tables`);
  const table = data.tables.find((t) => t.id === TABLES.issueItems);
  const exists = table && table.fields.some((f) => f.name === "CandidateURL");
  if (exists) {
    console.log("CandidateURL field already exists — skipping creation.");
    return;
  }
  await metaFetch(`bases/${BASE_ID}/tables/${TABLES.issueItems}/fields`, {
    method: "POST",
    body: JSON.stringify({ name: "CandidateURL", type: "url" }),
  });
  console.log("CandidateURL field created.");
}

async function ensureCandidateStartDateField() {
  const data = await metaFetch(`bases/${BASE_ID}/tables`);
  const table = data.tables.find((t) => t.id === TABLES.issueItems);
  const exists = table && table.fields.some((f) => f.name === "CandidateStartDate");
  if (exists) {
    console.log("CandidateStartDate field already exists — skipping creation.");
    return;
  }
  await metaFetch(`bases/${BASE_ID}/tables/${TABLES.issueItems}/fields`, {
    method: "POST",
    body: JSON.stringify({ name: "CandidateStartDate", type: "date", options: { dateFormat: { name: "iso" } } }),
  });
  console.log("CandidateStartDate field created.");
}

async function ensureSelectionNotesField() {
  const data = await metaFetch(`bases/${BASE_ID}/tables`);
  const table = data.tables.find((t) => t.id === TABLES.issues);
  const exists = table && table.fields.some((f) => f.name === "SelectionNotes");
  if (exists) {
    console.log("SelectionNotes field already exists — skipping creation.");
    return;
  }
  await metaFetch(`bases/${BASE_ID}/tables/${TABLES.issues}/fields`, {
    method: "POST",
    body: JSON.stringify({ name: "SelectionNotes", type: "multilineText" }),
  });
  console.log("SelectionNotes field created.");
}

async function writeSelectionNotes(newIssueItems, existingIssueItems, issueMap) {
  for (const [dateStr, issueId] of Object.entries(issueMap)) {
    const allForIssue = [
      ...existingIssueItems.filter((a) => a.IssueDate === dateStr),
      ...newIssueItems.filter((a) => a.IssueDate === dateStr),
    ];
    const countBySection = {};
    for (const a of allForIssue) {
      countBySection[a.Section] = (countBySection[a.Section] ?? 0) + 1;
    }
    const lines = [];
    for (const [section, { min, max }] of Object.entries(QUOTAS)) {
      const filled = countBySection[section] ?? 0;
      if (filled < min) {
        lines.push(`${section}: ${filled}/${max} slots filled — needs ${min - filled} more`);
      }
    }
    const notes = lines.length > 0 ? lines.join("\n") : "All sections at quota.";
    await airtableFetch(`${BASE_ID}/${TABLES.issues}/${issueId}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { SelectionNotes: notes } }),
    });
    console.log(`SelectionNotes written for ${dateStr}: ${notes}`);
  }
}

// ---------------------------------------------------------------------------
// Fetch stage
// ---------------------------------------------------------------------------

async function fetchIssues() {
  const records = await fetchAllRecords(TABLES.issues);
  // Returns map: "YYYY-MM-DD" → Airtable record ID
  const map = {};
  const today = new Date().toISOString().slice(0, 10);
  for (const r of records) {
    const date = r.fields["IssueDate"];
    if (!date || date < today) continue;
    if (map[date]) throw new Error(`Duplicate IssueDate in Issues table: ${date}`);
    map[date] = r.id;
  }
  return map;
}

async function fetchExistingIssueItems(issueMap) {
  // Build reverse map: issueRecordId → dateStr
  const idToDate = Object.fromEntries(Object.entries(issueMap).map(([date, id]) => [id, date]));
  const records = await fetchAllRecords(TABLES.issueItems);
  return records.flatMap((r) => {
    const candidate = r.fields["Candidate"];
    const issueLinked = r.fields["Issue"];
    const issueDate = Array.isArray(issueLinked) ? (idToDate[issueLinked[0]] ?? "") : "";
    if (!issueDate) return []; // past issue — not in issueMap, never touch
    return [{
      airtableId: r.id,
      IssueDate:  issueDate,
      ItemID:     Array.isArray(candidate) && candidate.length ? candidate[0] : null,
      Section:    r.fields["Section"] ?? "",
      Slot:       r.fields["Slot"] ?? 0,
      locked:     r.fields["Lock"] === true,
    }];
  });
}

async function deleteUnlockedIssueItems(records) {
  const toDelete = records.filter((r) => !r.locked);
  if (toDelete.length === 0) {
    console.log("No unlocked IssueItems to delete.");
    return;
  }
  for (let i = 0; i < toDelete.length; i += 10) {
    const batch = toDelete.slice(i, i + 10);
    const query = new URLSearchParams();
    batch.forEach((r) => query.append("records[]", r.airtableId));
    try {
      await airtableFetch(`${BASE_ID}/${TABLES.issueItems}?${query}`, { method: "DELETE" });
      console.log(`Deleted batch: ${batch.map((r) => r.airtableId).join(", ")}`);
    } catch (err) {
      console.error(`Failed to delete batch: ${batch.map((r) => r.airtableId).join(", ")} — ${err.message}`);
      throw err;
    }
  }
  console.log(`Deleted ${toDelete.length} unlocked IssueItem(s).`);
}

async function fetchCandidates() {
  const records = await fetchAllRecords(TABLES.candidates, { view: VIEW_ELIGIBLE });
  return records.map((r) => ({
    id:               r.id,
    "Start Date":     r.fields["Start Date"],
    SegmentSuggested: r.fields["SegmentSuggested"],
    Score_Final:      r.fields["Score_Final"] ?? 0,
    NeedsReview:      r.fields["NeedsReview"] ?? false,
    Status:           r.fields["Status"] ?? "Approved",
    LocationName:     r.fields["LocationName"] ?? "",
    URL:              r.fields["URL"] ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Write stage
// ---------------------------------------------------------------------------

function fmtLocalDateTime() {
  return new Date().toLocaleString("en-CA", {
    year:   "numeric",
    month:  "short",
    day:    "numeric",
    hour:   "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function writeIssueItems(issueItems, issueMap, startDateMap, urlMap) {
  const addedAt = fmtLocalDateTime();
  const records = issueItems.map((item) => {
    const issueId = issueMap[item.IssueDate];
    if (!issueId) throw new Error(`No Issues record found for date ${item.IssueDate}`);
    return {
      fields: {
        Name:                 `${item.Section} Slot ${item.Slot} — ${item.IssueDate}`,
        Section:              item.Section,
        Slot:                 item.Slot,
        SectionOrder:         SECTION_ORDER[item.Section] ?? 99,
        Issue:                [issueId],
        Candidate:            [item.ItemID],
        CandidateStartDate:   startDateMap[item.ItemID] ?? null,
        CandidateURL:         urlMap[item.ItemID] ?? null,
        "Added to Base":      addedAt,
      },
    };
  });

  // Airtable batch create: max 10 records per request
  const createdIds = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    try {
      const result = await airtableFetch(`${BASE_ID}/${TABLES.issueItems}`, {
        method: "POST",
        body: JSON.stringify({ records: batch }),
      });
      createdIds.push(...result.records.map((r) => r.id));
    } catch (err) {
      console.error(
        `Batch ${Math.floor(i / 10) + 1} failed. ` +
        `${createdIds.length} records already created. ` +
        `Created IDs: ${createdIds.join(", ")}`
      );
      throw err;
    }
  }
  return createdIds.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY environment variable is not set");
  }
  if (!BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  console.log("Ensuring SectionOrder field exists...");
  await ensureSectionOrderField();

  console.log("Ensuring CandidateURL field exists...");
  await ensureCandidateUrlField();

  console.log("Ensuring CandidateStartDate field exists...");
  await ensureCandidateStartDateField();

  console.log("Ensuring SelectionNotes field exists...");
  await ensureSelectionNotesField();

  console.log("Fetching Issues...");
  const issueMap = await fetchIssues();
  const issueDateStrs = Object.keys(issueMap).sort();
  console.log(`Found ${issueDateStrs.length} issues:`, issueDateStrs);

  console.log("Fetching Candidates...");
  const candidates = await fetchCandidates();
  console.log(`Fetched ${candidates.length} eligible candidates`);

  // Parse issue date strings as local time before passing to buildIssues()
  const issueDates = issueDateStrs.map((d) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  });

  console.log("Fetching existing IssueItems...");
  const allExistingIssueItems = await fetchExistingIssueItems(issueMap);
  const lockedIssueItems = allExistingIssueItems.filter((r) => r.locked && r.ItemID !== null);
  console.log(`Found ${lockedIssueItems.length} locked, ${allExistingIssueItems.length - lockedIssueItems.length} unlocked.`);

  console.log("Deleting unlocked IssueItems...");
  await deleteUnlockedIssueItems(allExistingIssueItems);

  console.log("Running buildIssues()...");
  const issueItems = buildIssues(candidates, lockedIssueItems, issueDates);
  console.log(`Planned ${issueItems.length} IssueItems:`);
  console.table(issueItems);

  const startDateMap = Object.fromEntries(candidates.map((c) => [c.id, c["Start Date"] ?? null]));
  const urlMap = Object.fromEntries(candidates.map((c) => [c.id, c.URL ?? null]));

  console.log("Writing IssueItems to Airtable...");
  const created = await writeIssueItems(issueItems, issueMap, startDateMap, urlMap);
  console.log(`Done — ${created} records created.`);

  console.log("Writing SelectionNotes to Issues...");
  await writeSelectionNotes(issueItems, lockedIssueItems, issueMap);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
