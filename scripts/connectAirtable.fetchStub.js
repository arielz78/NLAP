// connectAirtable.fetchStub.js
// Test support only — preloaded by connectAirtable.test.js via `node --require`.
// Replaces global fetch with an in-memory Airtable fake so a direct run of
// connectAirtable.js never reaches the network. Never required by pipeline code.
//
// STUB_SCENARIO=existing → the future issue already has one locked + one unlocked IssueItem
// STUB_SCENARIO=empty    → the future issue has no IssueItems
// Every request is echoed to stderr as `__FETCH__ {json}` for the test to assert on.

const ISSUE_DATE = "2099-01-01";
const TABLES = {
  issues:     "tbl0NZBBOHiu4nb95",
  issueItems: "tblrz2fZYUhxpZph2",
  candidates: "tblRsboN66ZLzyDrM",
};

const existingIssueItems = [
  { id: "recLOCKED",   fields: { Issue: ["recISSUE1"], Candidate: ["recCAND1"], Section: "For Families", Slot: 1, Lock: true } },
  { id: "recUNLOCKED", fields: { Issue: ["recISSUE1"], Candidate: ["recCAND2"], Section: "For Couples",  Slot: 1 } },
];

const candidate = (id, segment, score) => ({
  id,
  fields: { "Start Date": "2099-01-03", SegmentSuggested: segment, Score_Final: score, Status: "Approved" },
});

function respond(method, url, body) {
  const { pathname } = new URL(url);
  if (pathname.includes("/meta/")) {
    // All four ensure*Field() checks find their field — no schema writes
    return { tables: [
      { id: TABLES.issueItems, fields: [{ name: "SectionOrder" }, { name: "CandidateURL" }, { name: "CandidateStartDate" }] },
      { id: TABLES.issues,     fields: [{ name: "SelectionNotes" }] },
    ] };
  }
  if (method === "GET" && pathname.endsWith(TABLES.issues)) {
    return { records: [{ id: "recISSUE1", fields: { IssueDate: ISSUE_DATE } }] };
  }
  if (method === "GET" && pathname.endsWith(TABLES.issueItems)) {
    return { records: process.env.STUB_SCENARIO === "existing" ? existingIssueItems : [] };
  }
  if (method === "GET" && pathname.endsWith(TABLES.candidates)) {
    return { records: [
      candidate("recCAND1", "For Families", 90),
      candidate("recCAND2", "For Couples",  80),
      candidate("recCAND3", "Local Aroma",  70),
    ] };
  }
  if (method === "POST" && pathname.endsWith(TABLES.issueItems)) {
    return { records: JSON.parse(body).records.map((_, i) => ({ id: `recNEW${i}` })) };
  }
  return {}; // DELETE, PATCH
}

globalThis.fetch = async (url, opts = {}) => {
  const method = opts.method ?? "GET";
  process.stderr.write(`__FETCH__ ${JSON.stringify({ method, url: String(url) })}\n`);
  const data = respond(method, String(url), opts.body);
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
};
