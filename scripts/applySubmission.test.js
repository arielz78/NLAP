// applySubmission.test.js
// Run: node --test scripts/applySubmission.test.js
// Fixtures only: no database, no Airtable, no network. The submission reader is injected, and the
// CLI runs read a fixture file through --submission.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bridge = require("./applySubmission.js");

const SCRIPT     = path.join(__dirname, "applySubmission.js");
const ISSUE_DATE = "2099-01-01"; // a Thursday
const SECTIONS   = [["families", "For Families", "F"], ["couples", "For Couples", "C"], ["golden-age", "For Golden Age Readers", "G"]];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Candidate.id is the Airtable record ID (to-bundle.js maps it from record_id)
const candId = (letter, n) => `recCAND${letter}${String(n).padStart(9, "0")}`;
const candidate = (letter, n, extra = {}) => ({
  id:             candId(letter, n),
  seriesId:       `series-${letter}${n}`,
  occurrenceId:   `occurrence-${letter}${n}`,
  title:          `Event ${letter}${n}`,
  startsAt:       "2099-01-03",
  venue:          `Venue ${letter}${n}`,
  city:           "Vaughan",
  description:    "",
  sourceLabel:    "View event",
  sourceUrl:      `https://example.com/${letter}${n}`,
  classification: "classified",
  ...extra,
});

// An IssueBuild bundle (lib/contracts.ts): five selected and three alternatives per section
function makeBuild(extra = {}) {
  return {
    id:              "10000000-0000-4000-8000-000000000001",
    issueKey:        `vaughan-brief-${ISSUE_DATE}`,
    issueDate:       ISSUE_DATE,
    buildVersion:    1,
    contractVersion: "r8.editor-console.v1",
    bundleHash:      "a".repeat(64),
    sections: SECTIONS.map(([id, , letter]) => ({
      id,
      selected:     [1, 2, 3, 4, 5].map((n) => candidate(letter, n)),
      alternatives: [6, 7, 8].map((n, i) => ({ candidate: candidate(letter, n), orderingPosition: i + 1 })),
      replacementAssessments: {},
    })),
    ...extra,
  };
}

// A SubmissionSnapshot (lib/contracts.ts) for that build. The editor replaced Couples slot 2
// (index 1) with alternative 7, so the final state differs from the build's original picks.
function makeSubmission(build = makeBuild(), extra = {}) {
  const finalSelections = Object.fromEntries(build.sections.map((s) => [s.id, structuredClone(s.selected)]));
  finalSelections.couples[1] = candidate("C", 7);
  return {
    submissionId:        "30000000-0000-4000-8000-000000000001",
    submitClientEventId: "40000000-0000-4000-8000-000000000001",
    issueKey:            build.issueKey,
    issueDate:           build.issueDate,
    issueBuildId:        build.id,
    buildVersion:        build.buildVersion,
    contractVersion:     build.contractVersion,
    bundleHash:          build.bundleHash,
    editorIdentity:      "fixture-editor",
    revision:            1,
    draftId:             "20000000-0000-4000-8000-000000000001",
    draftRevision:       2,
    submittedAt:         "2098-12-28T15:00:00.000Z",
    finalSelections,
    replacements:        [],
    trainingPairs:       [],
    incompleteEventCount: 0,
    ...extra,
  };
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "applySubmission-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Runs main() in-process with an injected reader and a quiet console
async function runMain(t, { submission = makeSubmission(), build = makeBuild(), write = false, outDir } = {}) {
  const dir = outDir ?? tempDir(t);
  const buildFile = path.join(dir, "bundle.json");
  fs.writeFileSync(buildFile, JSON.stringify(build));
  const lines = [];
  const argv = ["--issue", ISSUE_DATE, "--build", buildFile, "--out-dir", dir, ...(write ? ["--write"] : [])];
  const result = await bridge.main(argv, {
    readSubmission: async () => submission,
    log: (line) => lines.push(String(line)),
  });
  return { result, dir, output: lines.join("\n") };
}

function runCli(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

// ---------------------------------------------------------------------------
// 1. A fixture submission maps exactly to its final state
// ---------------------------------------------------------------------------

test("maps the final lineup slot for slot", () => {
  const submission = makeSubmission();
  const { picks, skipped } = bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE);

  const expected = SECTIONS.flatMap(([id, label]) =>
    submission.finalSelections[id].map((c, i) => ({ IssueDate: ISSUE_DATE, ItemID: c.id, Section: label, Slot: i + 1 }))
  );
  assert.deepEqual(picks, expected);
  assert.equal(picks.length, 15);
  assert.deepEqual(skipped, []);
  // The replacement is what is written, not the build's original pick
  assert.deepEqual(picks.find((p) => p.Section === "For Couples" && p.Slot === 2).ItemID, candId("C", 7));
});

test("--write produces a picks file in the shape writeIssuePicks.js accepts", async (t) => {
  const submission = makeSubmission();
  const { result, output } = await runMain(t, { submission, write: true });

  const file = JSON.parse(fs.readFileSync(result.picksFile, "utf8"));
  assert.deepEqual(file.picks, result.picks);
  assert.equal(file.picks.length, 15);
  for (const p of file.picks) {
    assert.deepEqual(Object.keys(p), ["IssueDate", "ItemID", "Section", "Slot"]);
    assert.match(p.ItemID, /^rec[A-Za-z0-9]{14}$/);
    assert.equal(p.IssueDate, ISSUE_DATE);
  }
  assert.equal(file.submission.submissionId, submission.submissionId);
  assert.equal(file.submission.bundleHash, submission.bundleHash);

  // The printed command names the writer, the file just written and the issue date, with no --apply on the first line
  assert.ok(output.includes(`writeIssuePicks.js" "${result.picksFile}" --issue ${ISSUE_DATE}`));
  assert.equal(result.mode, "write");
});

test("dry run is the default and writes nothing", async (t) => {
  const { result, dir } = await runMain(t);
  assert.equal(result.mode, "dry-run");
  assert.deepEqual(fs.readdirSync(dir), ["bundle.json"]);
});

test("a rerun of --write converges on the same bytes; a different file is never overwritten", async (t) => {
  const first = await runMain(t, { write: true });
  const bytes = fs.readFileSync(first.result.picksFile);
  const second = await runMain(t, { write: true, outDir: first.dir });
  assert.deepEqual(fs.readFileSync(second.result.picksFile), bytes);

  fs.writeFileSync(first.result.picksFile, "{}");
  await assert.rejects(runMain(t, { write: true, outDir: first.dir }), /Refusing to overwrite/);
});

// ---------------------------------------------------------------------------
// 2. Venue and series rules
// ---------------------------------------------------------------------------

test("two same-venue picks in one section go through with a warning naming the section and slots", () => {
  const submission = makeSubmission();
  submission.finalSelections.couples[3].venue = "  venue  c1 ";
  const { picks, warnings } = bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE);
  assert.equal(picks.length, 15);
  assert.deepEqual(warnings, ["For Couples Slot 4: same venue as Slot 1 (venue  c1)"]);
});

test("a lineup with no repeats carries no warnings", () => {
  assert.deepEqual(bridge.mapSubmission(makeSubmission(), makeBuild(), ISSUE_DATE).warnings, []);
});

test("blank venues are always allowed through", () => {
  const submission = makeSubmission();
  submission.finalSelections.families[0].venue = "";
  submission.finalSelections.families[1].venue = "";
  submission.finalSelections.families[2].venue = "   ";
  const { picks } = bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE);
  assert.equal(picks.length, 15);
});

test("the same venue in two different sections is allowed", () => {
  const submission = makeSubmission();
  submission.finalSelections.couples[0].venue = submission.finalSelections.families[0].venue;
  assert.equal(bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE).picks.length, 15);
});

test("two picks from one series in a section go through with a warning naming the slot", () => {
  const submission = makeSubmission();
  submission.finalSelections["golden-age"][4].seriesId = submission.finalSelections["golden-age"][2].seriesId;
  const { picks, warnings } = bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE);
  assert.equal(picks.length, 15);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^For Golden Age Readers Slot 5: same series as Slot 3/);
});

// ---------------------------------------------------------------------------
// 3. Build identity (W1)
// ---------------------------------------------------------------------------

test("a submission made against a different build is refused", async (t) => {
  const submission = makeSubmission(makeBuild(), { bundleHash: "b".repeat(64), buildVersion: 2 });
  await assert.rejects(runMain(t, { submission, write: true }), (err) => {
    assert.match(err.message, /build identity/i);
    assert.match(err.message, /bundleHash/);
    assert.match(err.message, /buildVersion/);
    return true;
  });
});

test("every identity field is compared", () => {
  for (const [field, value] of [
    ["issueBuildId", "10000000-0000-4000-8000-000000000099"],
    ["issueKey", "another-newsletter-2099-01-01"],
    ["contractVersion", "r8.editor-console.v0"],
  ]) {
    const submission = makeSubmission(makeBuild(), { [field]: value });
    assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), new RegExp(field), field);
  }
});

test("a submission for another issue date is refused", () => {
  const build = makeBuild({ issueDate: "2099-01-08", issueKey: "vaughan-brief-2099-01-08" });
  assert.throws(
    () => bridge.mapSubmission(makeSubmission(build), build, ISSUE_DATE),
    /issueDate "2099-01-08" does not match --issue 2099-01-01/
  );
});

test("a mismatch writes no picks file", async (t) => {
  const dir = tempDir(t);
  const submission = makeSubmission(makeBuild(), { bundleHash: "b".repeat(64) });
  await assert.rejects(runMain(t, { submission, write: true, outDir: dir }));
  assert.deepEqual(fs.readdirSync(dir), ["bundle.json"]);
});

// ---------------------------------------------------------------------------
// 4. Replay of an applied submission
// ---------------------------------------------------------------------------

test("a submission whose picks file has a writer receipt is refused", async (t) => {
  const first = await runMain(t, { write: true });
  // What writeIssuePicks.js --apply leaves beside the picks file
  const receiptPath = bridge.receiptPathFor(first.result.picksFile);
  assert.equal(path.basename(receiptPath), `${path.parse(first.result.picksFile).name}.write_receipt.json`);
  fs.writeFileSync(receiptPath, JSON.stringify({ issueDate: ISSUE_DATE, complete: true, rows: [] }));

  for (const write of [true, false]) {
    await assert.rejects(runMain(t, { write, outDir: first.dir }), (err) => {
      assert.match(err.message, /already been applied/);
      assert.ok(err.message.includes(receiptPath));
      return true;
    });
  }
});

test("a receipt from an unfinished write is also refused, and says so", async (t) => {
  const first = await runMain(t, { write: true });
  fs.writeFileSync(bridge.receiptPathFor(first.result.picksFile), JSON.stringify({ complete: false, rows: [] }));
  await assert.rejects(runMain(t, { write: true, outDir: first.dir }), /did not finish/);
});

test("a different submission for the same issue is not treated as a replay", async (t) => {
  const first = await runMain(t, { write: true });
  fs.writeFileSync(bridge.receiptPathFor(first.result.picksFile), JSON.stringify({ complete: true, rows: [] }));
  const reopened = makeSubmission(makeBuild(), { submissionId: "30000000-0000-4000-8000-000000000002", revision: 2 });
  const second = await runMain(t, { submission: reopened, write: true, outDir: first.dir });
  assert.notEqual(second.result.picksFile, first.result.picksFile);
});

// ---------------------------------------------------------------------------
// 5. D0: slots the editor fills himself
// ---------------------------------------------------------------------------

test("self-filled slots produce no pick and are listed in the summary", async (t) => {
  const submission = makeSubmission(makeBuild(), {
    selfFilledSlots: [{ sectionId: "families", slotIndex: 2 }, { sectionId: "golden-age", slotIndex: 0 }],
  });
  const { result, output } = await runMain(t, { submission, write: true });

  assert.equal(result.picks.length, 13);
  assert.ok(!result.picks.some((p) => p.Section === "For Families" && p.Slot === 3));
  assert.ok(!result.picks.some((p) => p.Section === "For Golden Age Readers" && p.Slot === 1));
  // The other slots keep their own numbers: nothing is renumbered around a gap
  assert.deepEqual(result.picks.filter((p) => p.Section === "For Families").map((p) => p.Slot), [1, 2, 4, 5]);
  assert.deepEqual(result.skipped, [
    { Section: "For Families", Slot: 3 },
    { Section: "For Golden Age Readers", Slot: 1 },
  ]);
  assert.match(output, /For Families Slot 3/);
  assert.match(output, /For Golden Age Readers Slot 1/);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.picksFile, "utf8")).skipped, result.skipped);
});

test("a self-filled slot is exempt from the lineup checks", () => {
  const submission = makeSubmission(makeBuild(), { selfFilledSlots: [{ sectionId: "couples", slotIndex: 3 }] });
  submission.finalSelections.couples[3].venue = submission.finalSelections.couples[0].venue;
  assert.equal(bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE).picks.length, 14);

  // The slot may also be empty in the snapshot
  submission.finalSelections.couples[3] = null;
  assert.equal(bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE).picks.length, 14);
});

test("a malformed or repeated self-filled marker is refused", () => {
  for (const marker of [
    { sectionId: "local-aroma", slotIndex: 0 },
    { sectionId: "families", slotIndex: 5 },
    { sectionId: "families", slotIndex: "2" },
  ]) {
    const submission = makeSubmission(makeBuild(), { selfFilledSlots: [marker] });
    assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), /selfFilledSlots/, JSON.stringify(marker));
  }
  const twice = makeSubmission(makeBuild(), {
    selfFilledSlots: [{ sectionId: "families", slotIndex: 1 }, { sectionId: "families", slotIndex: 1 }],
  });
  assert.throws(() => bridge.mapSubmission(twice, makeBuild(), ISSUE_DATE), /more than once/);
});

test("a submission with every slot self-filled is refused", () => {
  const all = SECTIONS.flatMap(([id]) => [0, 1, 2, 3, 4].map((slotIndex) => ({ sectionId: id, slotIndex })));
  const submission = makeSubmission(makeBuild(), { selfFilledSlots: all });
  assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), /no picks/i);
});

// ---------------------------------------------------------------------------
// Further refusals
// ---------------------------------------------------------------------------

test("a missing section is refused", () => {
  const submission = makeSubmission();
  delete submission.finalSelections.couples;
  assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), /For Couples: section is missing/);
});

test("an unknown section is refused", () => {
  const submission = makeSubmission();
  submission.finalSelections["local-aroma"] = [];
  assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), /unknown section "local-aroma"/);
});

test("a wrong pick count is refused", () => {
  const short = makeSubmission();
  short.finalSelections.families.pop();
  assert.throws(() => bridge.mapSubmission(short, makeBuild(), ISSUE_DATE), /For Families: 4 selections, expected exactly 5/);

  const long = makeSubmission();
  long.finalSelections.families.push(candidate("F", 6));
  assert.throws(() => bridge.mapSubmission(long, makeBuild(), ISSUE_DATE), /For Families: 6 selections, expected exactly 5/);
});

test("a candidate that is not in the build's section is refused", () => {
  const submission = makeSubmission();
  submission.finalSelections.families[1] = candidate("F", 99);
  assert.throws(
    () => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE),
    new RegExp(`For Families Slot 2: candidate ${candId("F", 99)} is not in build`)
  );
});

test("a candidate id that is not an Airtable record ID is refused", () => {
  const submission = makeSubmission();
  submission.finalSelections.families[1].id = "fam-02";
  assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), /For Families Slot 2: candidate id "fam-02" is not an Airtable record ID/);
});

test("an empty slot that is not marked self-filled is refused", () => {
  const submission = makeSubmission();
  submission.finalSelections.couples[4] = null;
  assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), /For Couples Slot 5: no candidate/);
});

test("one candidate in two slots is refused", () => {
  const build = makeBuild();
  build.sections[1].alternatives.push({ candidate: candidate("F", 1), orderingPosition: 4 });
  const submission = makeSubmission(build);
  submission.finalSelections.couples[4] = candidate("F", 1);
  assert.throws(
    () => bridge.mapSubmission(submission, build, ISSUE_DATE),
    new RegExp(`For Couples Slot 5: candidate ${candId("F", 1)} is already in For Families Slot 1`)
  );
});

test("every problem is reported in one refusal", () => {
  const submission = makeSubmission();
  delete submission.finalSelections.couples;
  submission.finalSelections.families.pop();
  submission.finalSelections["golden-age"][1] = null;
  assert.throws(() => bridge.mapSubmission(submission, makeBuild(), ISSUE_DATE), (err) => {
    assert.match(err.message, /For Couples: section is missing/);
    assert.match(err.message, /For Families: 4 selections/);
    assert.match(err.message, /For Golden Age Readers Slot 2: no candidate/);
    return true;
  });
});

test("no submission for the issue is refused", async (t) => {
  await assert.rejects(runMain(t, { submission: null }), /No submitted revision found for issue 2099-01-01/);
});

// ---------------------------------------------------------------------------
// Reader seam
// ---------------------------------------------------------------------------

test("rowToSubmission lets the row's columns win over the snapshot, as the console does", () => {
  const snapshot = makeSubmission(makeBuild(), { submissionId: "stale", revision: 9, buildVersion: 9 });
  const row = {
    submission_id:          "30000000-0000-4000-8000-000000000001",
    submit_client_event_id: "40000000-0000-4000-8000-000000000001",
    draft_id:               "20000000-0000-4000-8000-000000000001",
    issue_build_id:         "10000000-0000-4000-8000-000000000001",
    issue_key:              `vaughan-brief-${ISSUE_DATE}`,
    build_version:          1,
    issue_revision:         1,
    editor_id:              "fixture-editor",
    draft_revision:         2,
    submitted_at:           "2098-12-28T15:00:00.000Z",
    snapshot,
  };
  const submission = bridge.rowToSubmission(row);
  assert.deepEqual(submission, makeSubmission());
});

test("the live Postgres reader fails loudly: unconfigured, and configured but unwired", async () => {
  await assert.rejects(bridge.readLatestSubmissionFromPostgres({ issueDate: ISSUE_DATE }, {}), /DATABASE_URL is not set/);
  await assert.rejects(
    bridge.readLatestSubmissionFromPostgres({ issueDate: ISSUE_DATE }, { DATABASE_URL: "postgres://fixture" }),
    /not wired/
  );
});

// ---------------------------------------------------------------------------
// CLI: exit codes
// ---------------------------------------------------------------------------

function cliFixture(t, submission = makeSubmission()) {
  const dir = tempDir(t);
  const buildFile = path.join(dir, "bundle.json");
  const submissionFile = path.join(dir, "submission.json");
  fs.writeFileSync(buildFile, JSON.stringify(makeBuild()));
  fs.writeFileSync(submissionFile, JSON.stringify(submission));
  return { dir, base: ["--issue", ISSUE_DATE, "--build", buildFile, "--out-dir", dir], submissionFile };
}

test("CLI: a valid fixture exits 0 and prints the writer command", (t) => {
  const { base, submissionFile, dir } = cliFixture(t);
  const res = runCli([...base, "--submission", submissionFile, "--write"]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /writeIssuePicks\.js" ".*\.picks\.json" --issue 2099-01-01/);
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith(".picks.json")).length, 1);
});

test("CLI: a refusal exits non-zero and writes nothing", (t) => {
  const submission = makeSubmission();
  submission.finalSelections.couples[3] = null;
  const { base, submissionFile, dir } = cliFixture(t, submission);
  const res = runCli([...base, "--submission", submissionFile, "--write"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /For Couples Slot 4: no candidate/);
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith(".picks.json")).length, 0);
});

test("CLI: without --submission the unconfigured database read exits non-zero", (t) => {
  const { base } = cliFixture(t);
  const res = runCli(base);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /DATABASE_URL is not set/);
});

test("CLI: bad arguments exit non-zero", (t) => {
  const { base, submissionFile } = cliFixture(t);
  assert.equal(runCli(["--issue", ISSUE_DATE]).status, 1);
  assert.equal(runCli([...base.slice(2), "--submission", submissionFile]).status, 1);
  const res = runCli([...base, "--submission", submissionFile, "--apply"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Unknown option --apply/);
});
