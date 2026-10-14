// writeIssuePicks.test.js
// Run: node --test scripts/writeIssuePicks.test.js
// No live Airtable traffic: every execution of writeIssuePicks.js goes through a stubbed fetch.
//
// This file has two roles. Run by `node --test` it is the test suite. Preloaded into a child
// process with `node --require` and STUB_SCENARIO set, it only installs the in-memory Airtable
// fake below and returns — the same arrangement as connectAirtable.fetchStub.js, kept in one file.

const fs = require("node:fs");
const path = require("node:path");

const ISSUE_DATE = "2099-01-01"; // the one future issue the stub serves (a Thursday)
const ISSUE_ID   = "recISSUE1";
const TABLES = {
  issues:     "tbl0NZBBOHiu4nb95",
  issueItems: "tblrz2fZYUhxpZph2",
  candidates: "tblRsboN66ZLzyDrM",
};

const candId = (n) => `recCAND${String(n).padStart(10, "0")}`;
const itemRow = (id, section, slot, date, issueId, extra = {}) => ({
  id,
  fields: { Name: `${section} Slot ${slot} — ${date}`, Section: section, Slot: slot, Issue: [issueId], Candidate: [`recOLD${id}`], ...extra },
});

// ---------------------------------------------------------------------------
// Airtable fake (stub role)
// ---------------------------------------------------------------------------

// STUB_SCENARIO=empty    → the issue exists; its only rows are locked bystanders in sections the picks don't use
// STUB_SCENARIO=existing → as empty, plus a locked row already sitting in For Couples Slot 2
// STUB_SCENARIO=open     → as empty, but one bystander is unlocked
// STUB_SCENARIO=no-issue → no Issues record for the date
// STUB_STATE_FILE        → optional; state is loaded from and saved to it, so writes survive across runs
// Every request is echoed to stderr as `__FETCH__ {json}` for the test to assert on.
function initialState(scenario) {
  const past = { id: "recISSUEPAST", fields: { IssueDate: "2098-12-25" } };
  // Same section and slot as a pick, on another date — must never count as a conflict
  const pastRow = itemRow("recPASTROW", "For Families", 1, "2098-12-25", "recISSUEPAST", { Lock: true });
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    id: candId(i + 1),
    fields: { "Event Title": `Event ${i + 1}`, "Start Date": "2099-01-03", URL: `https://example.com/${i + 1}`, Status: "New" },
  }));
  if (scenario === "no-issue") return { issues: [past], issueItems: [pastRow], candidates, seq: 0 };

  const issueItems = [
    pastRow,
    itemRow("recBYLOCKED", "Local Aroma", 1, ISSUE_DATE, ISSUE_ID, { Lock: true, Description: "kept" }),
    itemRow("recBYOPEN",   "Local Aroma", 2, ISSUE_DATE, ISSUE_ID, scenario === "open" ? { Description: "kept" } : { Lock: true, Description: "kept" }),
  ];
  if (scenario === "existing") {
    issueItems.push(itemRow("recCONFLICT", "For Couples", 2, ISSUE_DATE, ISSUE_ID, { Lock: true }));
  }
  return { issues: [past, { id: ISSUE_ID, fields: { IssueDate: ISSUE_DATE } }], issueItems, candidates, seq: 0 };
}

function installStub() {
  const stateFile = process.env.STUB_STATE_FILE;
  const state = stateFile && fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : initialState(process.env.STUB_SCENARIO);
  const save = () => { if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state)); };

  function respond(method, url, body) {
    const { pathname, searchParams } = new URL(url);
    if (pathname.includes("/meta/")) return { tables: [] };
    if (method === "GET" && pathname.endsWith(TABLES.issues))     return { records: state.issues };
    if (method === "GET" && pathname.endsWith(TABLES.issueItems)) return { records: state.issueItems };
    if (method === "GET" && pathname.endsWith(TABLES.candidates)) {
      const ids = [...(searchParams.get("filterByFormula") ?? "").matchAll(/RECORD_ID\(\)='([^']+)'/g)].map((m) => m[1]);
      return { records: state.candidates.filter((c) => ids.includes(c.id)) };
    }
    if (method === "POST" && pathname.endsWith(TABLES.issues)) {
      const created = JSON.parse(body).records.map((r) => ({ id: `recNEWISSUE${++state.seq}`, fields: r.fields }));
      state.issues.push(...created);
      save();
      return { records: created };
    }
    if (method === "POST" && pathname.endsWith(TABLES.issueItems)) {
      const created = JSON.parse(body).records.map((r) => ({ id: `recNEW${++state.seq}`, fields: r.fields }));
      state.issueItems.push(...created);
      save();
      return { records: created };
    }
    if (method === "PATCH" && pathname.endsWith(TABLES.issueItems)) {
      for (const patch of JSON.parse(body).records) {
        const row = state.issueItems.find((r) => r.id === patch.id);
        if (row) Object.assign(row.fields, patch.fields);
      }
      save();
      return { records: [] };
    }
    return {}; // DELETE and anything else — the tests assert these never happen
  }

  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method ?? "GET";
    process.stderr.write(`__FETCH__ ${JSON.stringify({ method, url: String(url), body: opts.body ?? null })}\n`);
    const data = respond(method, String(url), opts.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  };
}

if (process.env.STUB_SCENARIO) {
  installStub();
  return;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const SCRIPT  = path.join(__dirname, "writeIssuePicks.js");
const CONNECT = path.join(__dirname, "connectAirtable.js");
const STUB    = __filename;

// Fixture files live under data/ (gitignored), in a folder removed when the suite ends
const TMP_PARENT = path.join(__dirname, "..", "data", "tracking");
fs.mkdirSync(TMP_PARENT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(TMP_PARENT, "writeIssuePicks-test-"));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// 12 picks across three sections — more than one Airtable batch of 10
const PICKS = [
  ...[1, 2, 3, 4, 5].map((slot) => ({ Section: "For Families", Slot: slot })),
  ...[1, 2, 3, 4, 5].map((slot) => ({ Section: "For Couples", Slot: slot })),
  ...[1, 2].map((slot) => ({ Section: "For Golden Age Readers", Slot: slot })),
].map((p, i) => ({ IssueDate: ISSUE_DATE, ItemID: candId(i + 1), ...p }));
const EXPECTED_NAMES = PICKS.map((p) => `${p.Section} Slot ${p.Slot} — ${ISSUE_DATE}`);

// Each call gets its own folder, so a receipt from one test never leaks into another.
// The file carries allocation.json's extra keys to prove they are ignored.
function writePicksFile(picks = PICKS) {
  const dir = fs.mkdtempSync(path.join(TMP, "run-"));
  const file = path.join(dir, "allocation.json");
  fs.writeFileSync(file, JSON.stringify({ picks, trace: [], shortfalls: {}, alternatives: {} }));
  return { file, receipt: path.join(dir, "allocation.write_receipt.json"), state: path.join(dir, "stub_state.json") };
}

// Direct run in a child process, with the fetch stub preloaded before the script loads.
// Fake credentials are set in the child env; dotenv never overrides an already-set variable.
function run(script, args, scenario, stateFile) {
  const res = spawnSync(process.execPath, ["--require", STUB, script, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      AIRTABLE_API_KEY: "test-key",
      AIRTABLE_BASE_ID: "appTEST",
      STUB_SCENARIO:    scenario,
      ...(stateFile ? { STUB_STATE_FILE: stateFile } : {}),
    },
  });
  const requests = res.stderr
    .split("\n")
    .filter((line) => line.startsWith("__FETCH__ "))
    .map((line) => JSON.parse(line.slice("__FETCH__ ".length)));
  return { ...res, requests };
}
const runWriter = (file, flags, scenario, stateFile) => run(SCRIPT, [file, "--issue", ISSUE_DATE, ...flags], scenario, stateFile);

const methods    = (requests) => requests.map((r) => r.method);
const onlyReads  = (requests) => assert.deepStrictEqual([...new Set(methods(requests))], ["GET"]);
const postedRows = (requests) => requests
  .filter((r) => r.method === "POST" && r.url.endsWith(TABLES.issueItems))
  .flatMap((r) => JSON.parse(r.body).records);

test("require() makes zero requests", () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error("fetch must not be called on require()");
  };
  process.env.AIRTABLE_API_KEY = "test-key";
  process.env.AIRTABLE_BASE_ID = "appTEST";
  try {
    const mod = require("./writeIssuePicks.js");
    for (const name of ["itemName", "readPicks", "findConflicts", "buildRows", "lockWrittenRows", "main"]) {
      assert.strictEqual(typeof mod[name], "function", `${name} is exported`);
    }
    assert.strictEqual(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Name is `${Section} Slot ${n} — ${date}` and byte-equal to the Name connectAirtable.js writes", async () => {
  process.env.AIRTABLE_API_KEY = "test-key";
  process.env.AIRTABLE_BASE_ID = "appTEST";
  const { itemName } = require("./writeIssuePicks.js");
  const { writeIssueItems } = require("./connectAirtable.js");
  const pick = { IssueDate: "2026-10-15", ItemID: candId(1), Section: "For Golden Age Readers", Slot: 3 };

  const mine = itemName(pick);
  assert.strictEqual(mine, "For Golden Age Readers Slot 3 — 2026-10-15"); // U+2014 em dash, ISO date
  assert.deepStrictEqual(
    Buffer.from(mine, "utf8").subarray(29, 34),
    Buffer.from([0x20, 0xe2, 0x80, 0x94, 0x20]),
  );

  // Drift guard: capture what the existing writer POSTs for the same item
  const realFetch = globalThis.fetch;
  let posted;
  globalThis.fetch = async (url, opts) => {
    posted = JSON.parse(opts.body).records;
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ records: [{ id: "recX" }] }) };
  };
  try {
    await writeIssueItems([pick], { "2026-10-15": "recISSUEX" }, {}, {});
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(Buffer.from(posted[0].fields.Name, "utf8").equals(Buffer.from(mine, "utf8")));
});

test("dry run lists exactly the file's picks — zero writes, zero deletes, no receipt", () => {
  const { file, receipt } = writePicksFile();
  const res = runWriter(file, [], "empty");
  assert.strictEqual(res.status, 0, res.stderr);
  onlyReads(res.requests);

  const listed = res.stdout.split("\n").filter((l) => l.startsWith("ROW ")).map((l) => JSON.parse(l.slice(4)));
  assert.deepStrictEqual(listed.map((r) => r.Name), EXPECTED_NAMES);
  assert.deepStrictEqual(listed.map((r) => r.Candidate[0]), PICKS.map((p) => p.ItemID));
  assert.match(res.stdout, /Would create 12 IssueItems\. Deletes: 0\./);
  assert.ok(!fs.existsSync(receipt), "a dry run writes no receipt");
});

test("--apply issues exactly one create per pick with the correct Name and fields, and nothing else", () => {
  const { file, receipt } = writePicksFile();
  const res = runWriter(file, ["--apply"], "empty");
  assert.strictEqual(res.status, 0, res.stderr);

  // Only GETs and IssueItems creates: no DELETE, no PATCH, no Issues write
  const writes = res.requests.filter((r) => r.method !== "GET");
  assert.deepStrictEqual(writes.map((r) => r.method), ["POST", "POST"]); // 12 picks → batches of 10 + 2
  assert.ok(writes.every((r) => r.url.endsWith(TABLES.issueItems)));

  const rows = postedRows(res.requests);
  assert.strictEqual(rows.length, PICKS.length);
  assert.deepStrictEqual(rows.map((r) => r.fields.Name), EXPECTED_NAMES);
  rows.forEach((row, i) => {
    const { "Added to Base": addedAt, ...fields } = row.fields;
    assert.ok(addedAt, "Added to Base is set");
    assert.deepStrictEqual(fields, {
      Name:               EXPECTED_NAMES[i],
      Section:            PICKS[i].Section,
      Slot:               PICKS[i].Slot,
      SectionOrder:       { "For Families": 1, "For Couples": 2, "For Golden Age Readers": 3 }[PICKS[i].Section],
      Issue:              [ISSUE_ID],
      Candidate:          [PICKS[i].ItemID],
      CandidateStartDate: "2099-01-03",
      CandidateURL:       `https://example.com/${i + 1}`,
    });
  });

  const saved = JSON.parse(fs.readFileSync(receipt, "utf8"));
  assert.strictEqual(saved.complete, true);
  assert.strictEqual(saved.issueDate, ISSUE_DATE);
  assert.deepStrictEqual(saved.rows.map((r) => r.id), PICKS.map((_, i) => `recNEW${i + 1}`));
  assert.deepStrictEqual(saved.rows.map((r) => r.Name), EXPECTED_NAMES);
  assert.match(res.stdout, /12 records created\. Deletes: 0\./);
});

test("an existing row for the same (date, section, slot) refuses — non-zero exit, names the conflict, zero writes", () => {
  for (const flags of [[], ["--apply"]]) {
    const { file, receipt } = writePicksFile();
    const res = runWriter(file, flags, "existing");
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stderr, /Refusing to write/);
    assert.ok(res.stderr.includes(`For Couples Slot 2 — ${ISSUE_DATE}`), "message names the conflicting row");
    assert.ok(res.stderr.includes("recCONFLICT"), "message names the existing record");
    // The same slot on another date, and other sections on this date, are not conflicts
    assert.ok(!res.stderr.includes("recPASTROW") && !res.stderr.includes("recBYOPEN"));
    onlyReads(res.requests);
    assert.ok(!fs.existsSync(receipt));
  }
});

test("an unlocked row already on the issue refuses — generateBlurbs would replace its copy — zero writes", () => {
  for (const flags of [[], ["--apply"]]) {
    const { file, receipt } = writePicksFile();
    const res = runWriter(file, flags, "open");
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stderr, /Refusing to write: 1 unlocked IssueItems already exist/);
    assert.ok(res.stderr.includes("recBYOPEN"), "message names the unlocked row");
    assert.ok(!res.stderr.includes("recBYLOCKED"), "a locked bystander is not a reason to refuse");
    onlyReads(res.requests);
    assert.ok(!fs.existsSync(receipt));
  }
});

test("a repeat --apply refuses, and connectAirtable.js then refuses the date too", () => {
  const { file, receipt, state } = writePicksFile();
  const first = runWriter(file, ["--apply"], "empty", state);
  assert.strictEqual(first.status, 0, first.stderr);
  const receiptAfterFirst = fs.readFileSync(receipt, "utf8");

  const second = runWriter(file, ["--apply"], "empty", state);
  assert.notStrictEqual(second.status, 0);
  assert.match(second.stderr, /Refusing to write: IssueItems already exist for 12 of the picks/);
  onlyReads(second.requests);
  assert.strictEqual(fs.readFileSync(receipt, "utf8"), receiptAfterFirst, "the receipt is not rewritten");

  // Exactly one row per pick in the table after both runs
  const rows = JSON.parse(fs.readFileSync(state, "utf8")).issueItems;
  for (const name of EXPECTED_NAMES) {
    assert.strictEqual(rows.filter((r) => r.fields.Name === name).length, 1, name);
  }

  // The allocator's own guard (ship-plan item 2) sees the written rows
  const allocator = run(CONNECT, [], "empty", state);
  assert.notStrictEqual(allocator.status, 0);
  assert.match(allocator.stderr, /Refusing to run/);
  onlyReads(allocator.requests);
});

test("an existing receipt refuses --apply even when Airtable has no rows for the date", () => {
  const { file, receipt } = writePicksFile();
  fs.writeFileSync(receipt, JSON.stringify({ issueDate: ISSUE_DATE, complete: true, rows: [] }));
  const res = runWriter(file, ["--apply"], "empty");
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /a receipt already exists/);
  onlyReads(res.requests);
});

test("no Issues record: refused without --ensure-issue; created once with it; a dry run still writes nothing", () => {
  const refused = writePicksFile();
  const res1 = runWriter(refused.file, ["--apply"], "no-issue");
  assert.notStrictEqual(res1.status, 0);
  assert.match(res1.stderr, /no Issues record found for date 2099-01-01/);
  assert.match(res1.stderr, /--ensure-issue/);
  onlyReads(res1.requests);

  const dry = writePicksFile();
  const res2 = runWriter(dry.file, ["--ensure-issue"], "no-issue");
  assert.strictEqual(res2.status, 0, res2.stderr);
  onlyReads(res2.requests);
  assert.match(res2.stdout, /Would create the Issues record for 2099-01-01/);

  const applied = writePicksFile();
  const res3 = runWriter(applied.file, ["--apply", "--ensure-issue"], "no-issue");
  assert.strictEqual(res3.status, 0, res3.stderr);
  const issuePosts = res3.requests.filter((r) => r.method === "POST" && r.url.endsWith(TABLES.issues));
  assert.strictEqual(issuePosts.length, 1);
  assert.deepStrictEqual(JSON.parse(issuePosts[0].body), { records: [{ fields: { IssueDate: ISSUE_DATE } }] });
  const firstRowPost = res3.requests.findIndex((r) => r.method === "POST" && r.url.endsWith(TABLES.issueItems));
  assert.ok(res3.requests.indexOf(issuePosts[0]) < firstRowPost, "the Issues record is created before the rows");
  const rows = postedRows(res3.requests);
  assert.strictEqual(rows.length, PICKS.length);
  assert.ok(rows.every((r) => r.fields.Issue.length === 1 && r.fields.Issue[0] === "recNEWISSUE1"));
});

test("--ensure-issue does not create a second Issues record when one exists", () => {
  const { file } = writePicksFile();
  const res = runWriter(file, ["--apply", "--ensure-issue"], "empty");
  assert.strictEqual(res.status, 0, res.stderr);
  assert.strictEqual(res.requests.filter((r) => r.method === "POST" && r.url.endsWith(TABLES.issues)).length, 0);
});

test("--lock patches exactly the written IDs with Lock=true and touches no other row", () => {
  const { file, receipt, state } = writePicksFile();
  assert.strictEqual(runWriter(file, ["--apply"], "empty", state).status, 0);
  const writtenIds = JSON.parse(fs.readFileSync(receipt, "utf8")).rows.map((r) => r.id);
  const before = JSON.parse(fs.readFileSync(state, "utf8")).issueItems;

  const res = runWriter(file, ["--lock"], "empty", state);
  assert.strictEqual(res.status, 0, res.stderr);

  const writes = res.requests.filter((r) => r.method !== "GET");
  assert.ok(writes.every((r) => r.method === "PATCH" && r.url.endsWith(TABLES.issueItems)));
  const patched = writes.flatMap((r) => JSON.parse(r.body).records);
  assert.deepStrictEqual(patched.map((p) => p.id), writtenIds);
  assert.ok(patched.every((p) => JSON.stringify(p.fields) === JSON.stringify({ Lock: true })));

  // Rows the writer did not create are byte-identical before and after
  const after = JSON.parse(fs.readFileSync(state, "utf8")).issueItems;
  for (const row of before.filter((r) => !writtenIds.includes(r.id))) {
    assert.strictEqual(JSON.stringify(after.find((r) => r.id === row.id)), JSON.stringify(row), row.id);
  }
  assert.ok(after.filter((r) => writtenIds.includes(r.id)).every((r) => r.fields.Lock === true));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(receipt, "utf8")).lockedIds, writtenIds);

  // A second --lock finds every row already locked and patches nothing
  const again = runWriter(file, ["--lock"], "empty", state);
  assert.strictEqual(again.status, 0, again.stderr);
  onlyReads(again.requests);
});

test("a self-filled slot leaves a gap: no row for it, the other slots keep their numbers, lock covers only the written rows", () => {
  // Families Slot 3 marked "I'm filling this myself": applySubmission.js leaves it out of the picks file
  const gapped = [1, 2, 4, 5].map((slot) => ({ IssueDate: ISSUE_DATE, ItemID: candId(slot), Section: "For Families", Slot: slot }));
  const { file, receipt, state } = writePicksFile(gapped);

  const res = runWriter(file, ["--apply"], "empty", state);
  assert.strictEqual(res.status, 0, res.stderr);
  const rows = postedRows(res.requests);
  assert.deepStrictEqual(rows.map((r) => r.fields.Name), [1, 2, 4, 5].map((s) => `For Families Slot ${s} — ${ISSUE_DATE}`));
  assert.deepStrictEqual(rows.map((r) => r.fields.Slot), [1, 2, 4, 5]);
  assert.match(res.stdout, /4 records created\. Deletes: 0\./);

  const writtenIds = JSON.parse(fs.readFileSync(receipt, "utf8")).rows.map((r) => r.id);
  const lock = runWriter(file, ["--lock"], "empty", state);
  assert.strictEqual(lock.status, 0, lock.stderr);
  const patched = lock.requests.filter((r) => r.method === "PATCH").flatMap((r) => JSON.parse(r.body).records);
  assert.deepStrictEqual(patched.map((p) => p.id), writtenIds);
  assert.strictEqual(writtenIds.length, 4);
});

test("--lock never patches a written row that is already locked", () => {
  const { file, receipt, state } = writePicksFile();
  assert.strictEqual(runWriter(file, ["--apply"], "empty", state).status, 0);
  const writtenIds = JSON.parse(fs.readFileSync(receipt, "utf8")).rows.map((r) => r.id);

  // The editor ticks Lock on one written row by hand before --lock runs
  const s = JSON.parse(fs.readFileSync(state, "utf8"));
  s.issueItems.find((r) => r.id === writtenIds[3]).fields.Lock = true;
  fs.writeFileSync(state, JSON.stringify(s));

  const res = runWriter(file, ["--lock"], "empty", state);
  assert.strictEqual(res.status, 0, res.stderr);
  const patched = res.requests.filter((r) => r.method === "PATCH").flatMap((r) => JSON.parse(r.body).records);
  assert.deepStrictEqual(patched.map((p) => p.id), writtenIds.filter((id) => id !== writtenIds[3]));
});

test("--lock refuses without a receipt, and refuses when a written row has gone — zero writes", () => {
  const noReceipt = writePicksFile();
  const res1 = runWriter(noReceipt.file, ["--lock"], "empty");
  assert.notStrictEqual(res1.status, 0);
  assert.match(res1.stderr, /no receipt/);
  assert.strictEqual(res1.requests.length, 0);

  const { file, receipt, state } = writePicksFile();
  assert.strictEqual(runWriter(file, ["--apply"], "empty", state).status, 0);
  const goneId = JSON.parse(fs.readFileSync(receipt, "utf8")).rows[0].id;
  const s = JSON.parse(fs.readFileSync(state, "utf8"));
  s.issueItems = s.issueItems.filter((r) => r.id !== goneId);
  fs.writeFileSync(state, JSON.stringify(s));

  const res2 = runWriter(file, ["--lock"], "empty", state);
  assert.notStrictEqual(res2.status, 0);
  assert.ok(res2.stderr.includes(goneId));
  onlyReads(res2.requests);
});

test("a Trust Me Recipe pick is refused before any request", () => {
  const picks = [...PICKS, { IssueDate: ISSUE_DATE, ItemID: candId(99), Section: "Trust Me Recipe", Slot: 1 }];
  for (const flags of [[], ["--apply"]]) {
    const { file, receipt } = writePicksFile(picks);
    const res = runWriter(file, flags, "empty");
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stderr, /Trust Me Recipe is manual only/);
    assert.strictEqual(res.requests.length, 0);
    assert.ok(!fs.existsSync(receipt));
  }
});

test("a malformed picks file is refused before any request", () => {
  const cases = [
    [[{ ...PICKS[0], IssueDate: "2099-01-08" }],            /does not match --issue/],
    [[PICKS[0], { ...PICKS[1], Slot: 1 }],                  /For Families Slot 1 appears more than once/],
    [[PICKS[0], { ...PICKS[1], ItemID: PICKS[0].ItemID }],  /appears more than once in the file/],
    [[{ ...PICKS[0], Slot: 6 }],                            /outside 1–5/],
    [[{ ...PICKS[0], Section: "For Everyone" }],            /unknown Section/],
    [[],                                                    /contains no picks/],
  ];
  for (const [picks, pattern] of cases) {
    const { file } = writePicksFile(picks);
    const res = runWriter(file, ["--apply"], "empty");
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stderr, pattern);
    assert.strictEqual(res.requests.length, 0);
  }
});

test("a pick with no Candidates record is refused — zero writes", () => {
  const { file } = writePicksFile([...PICKS.slice(0, 11), { ...PICKS[11], ItemID: candId(404) }]);
  const res = runWriter(file, ["--apply"], "empty");
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /have no Candidates record/);
  assert.ok(res.stderr.includes(candId(404)));
  onlyReads(res.requests);
});
