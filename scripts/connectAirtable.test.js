// connectAirtable.test.js
// Run: node --test scripts/connectAirtable.test.js
// No live Airtable traffic: every execution of connectAirtable.js goes through a stubbed fetch.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "connectAirtable.js");
const STUB   = path.join(__dirname, "connectAirtable.fetchStub.js");
const ISSUE_DATE = "2099-01-01"; // the one future issue the stub serves
const ISSUE_ITEMS_TABLE = "tblrz2fZYUhxpZph2";

// Direct run in a child process, with the fetch stub preloaded before the script loads.
// Fake credentials are set in the child env; dotenv never overrides an already-set variable.
function runDirect(scenario, args = []) {
  const res = spawnSync(process.execPath, ["--require", STUB, SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      AIRTABLE_API_KEY: "test-key",
      AIRTABLE_BASE_ID: "appTEST",
      STUB_SCENARIO:    scenario,
    },
  });
  const requests = res.stderr
    .split("\n")
    .filter((line) => line.startsWith("__FETCH__ "))
    .map((line) => JSON.parse(line.slice("__FETCH__ ".length)));
  return { ...res, requests };
}

const methods = (requests) => requests.map((r) => r.method);

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
    const mod = require("./connectAirtable.js");
    for (const name of [
      "airtableFetch", "fetchAllRecords", "fetchIssues", "fetchExistingIssueItems",
      "fetchCandidates", "writeIssueItems", "deleteUnlockedIssueItems", "main",
    ]) {
      assert.strictEqual(typeof mod[name], "function", `${name} is exported`);
    }
    assert.strictEqual(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("direct run refuses a date that already has IssueItems — non-zero exit, names the date, zero DELETEs", () => {
  const res = runDirect("existing");
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /Refusing to run/);
  assert.ok(res.stderr.includes(ISSUE_DATE), "message names the date");
  assert.ok(res.requests.length > 0, "the stub was reached");
  // Zero DELETEs and zero writes of any kind — only reads happened
  assert.deepStrictEqual([...new Set(methods(res.requests))], ["GET"]);
});

test("--rebuild restores delete → build → write", () => {
  const res = runDirect("existing", ["--rebuild"]);
  assert.strictEqual(res.status, 0, res.stderr);

  const deletes = res.requests.filter((r) => r.method === "DELETE");
  assert.strictEqual(deletes.length, 1);
  assert.ok(deletes[0].url.includes("recUNLOCKED"), "unlocked row is deleted");
  assert.ok(!deletes[0].url.includes("recLOCKED"), "locked row is never deleted");

  const m = methods(res.requests);
  const firstWrite = res.requests.findIndex((r) => r.method === "POST" && r.url.endsWith(ISSUE_ITEMS_TABLE));
  assert.ok(firstWrite !== -1, "new IssueItems are written");
  assert.ok(m.indexOf("DELETE") < firstWrite, "delete happens before write");
  assert.ok(m.includes("PATCH"), "SelectionNotes written");

  // Build ran against the stubbed candidates: recCAND1 is locked, so 2 of the 3 are placed
  assert.match(res.stdout, /Planned 2 IssueItems/);
  assert.match(res.stdout, /Done — 2 records created/);
});

test("direct run without --rebuild still builds a date that has no IssueItems", () => {
  const res = runDirect("empty");
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(!methods(res.requests).includes("DELETE"));
  assert.match(res.stdout, /Done — 3 records created/);
});
