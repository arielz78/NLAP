// applySubmission.js
// Bridges an editor-console submission to writeIssuePicks.js (ship-plan item 7).
//
//   node scripts/applySubmission.js --issue YYYY-MM-DD --build <bundle.json>                      dry run (default)
//   node scripts/applySubmission.js --issue YYYY-MM-DD --build <bundle.json> --write              write the picks file
//   node scripts/applySubmission.js --issue YYYY-MM-DD --build <bundle.json> --submission <file>  read a saved submission, not the database
//
// Without --submission it reads the latest submission for the issue date from the console's database,
// with one read-only query. DATABASE_URL comes from the environment, then from the console's
// .env.local (--console-env names another file).
//
// --build is the bundle.json the operator published for the issue (scripts/issue-build/to-bundle.js).
// It names the build the submission must have been made against, and supplies each section's candidates.
//
// Contract:
//   - It chooses nothing. The picks are the submission's final lineup, slot for slot.
//   - It never calls Airtable and has no --apply. Its only write is the picks file, under --write. It
//     prints the writeIssuePicks.js command; the operator runs it (Decision_Log §96).
//   - Refuses a submission whose issue or build identity differs from --issue / --build (R8_Scope W1).
//   - Refuses a submission the editor reopened afterwards and has not submitted again (live read only).
//   - Refuses a final lineup that cannot be written: not exactly five per section, or one event in two
//     slots (the writer refuses a repeated ItemID).
//   - Never refuses the editor's own choices. A repeated venue or series in a section is reported as a
//     warning and the picks go through; he was warned in the console and went ahead.
//   - Refuses a submission that was already applied: writeIssuePicks.js --apply leaves a receipt beside
//     the picks file, and the picks file path is fixed by the submission ID.
//   - Slots the editor marked "I'm filling this myself" (ship-plan D0) produce no pick and are listed.
//   - Every refusal names every problem and happens before the picks file is written.
//   - A rerun writes the same bytes. An existing picks file that differs is never overwritten.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { QUOTAS, venueKey } = require("./buildIssues.js");

const WRITER      = path.join(__dirname, "writeIssuePicks.js");
const DEFAULT_OUT = path.join(__dirname, "../data/tracking/issue_apply");
const CONSOLE_ENV = path.join(__dirname, "../apps/editor-console/.env.local");

// Console section id (lib/contracts.ts sectionIds) → the Section value IssueItems carries.
// Same pairs as scripts/issue-build/to-bundle.js. Local Aroma and Trust Me Recipe are not in the console.
const SECTION_LABELS = {
  "families":   "For Families",
  "couples":    "For Couples",
  "golden-age": "For Golden Age Readers",
};

// The identity a submission copies from its build at submit time (draft-domain.ts createSubmission)
const IDENTITY_FIELDS = [
  ["issueBuildId",    "id"],
  ["issueKey",        "issueKey"],
  ["issueDate",       "issueDate"],
  ["buildVersion",    "buildVersion"],
  ["contractVersion", "contractVersion"],
  ["bundleHash",      "bundleHash"],
];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const USAGE = "Usage: node scripts/applySubmission.js --issue YYYY-MM-DD --build <bundle.json> [--submission <submission.json>] [--console-env <file>] [--out-dir <dir>] [--write]";

function parseArgs(argv) {
  const opts = { issueDate: null, buildFile: null, submissionFile: null, envFile: null, outDir: null, write: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write")            opts.write = true;
    else if (arg === "--issue")       opts.issueDate = argv[++i] ?? null;
    else if (arg === "--build")       opts.buildFile = argv[++i] ?? null;
    else if (arg === "--submission")  opts.submissionFile = argv[++i] ?? null;
    else if (arg === "--console-env") opts.envFile = argv[++i] ?? null;
    else if (arg === "--out-dir")     opts.outDir = argv[++i] ?? null;
    else throw new Error(`Unknown option ${arg}\n${USAGE}`);
  }
  opts.envFile = path.resolve(opts.envFile ?? CONSOLE_ENV);

  if (!opts.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(opts.issueDate)) {
    throw new Error(`Missing or malformed issue date (expected YYYY-MM-DD)\n${USAGE}`);
  }
  if (!opts.buildFile) throw new Error(`Missing --build: name the build this submission must match\n${USAGE}`);
  opts.buildFile = path.resolve(opts.buildFile);
  if (opts.submissionFile) opts.submissionFile = path.resolve(opts.submissionFile);
  opts.outDir = path.resolve(opts.outDir ?? path.join(DEFAULT_OUT, opts.issueDate));
  return opts;
}

// ---------------------------------------------------------------------------
// Submission readers
// ---------------------------------------------------------------------------

function readJsonFile(file, what) {
  if (!fs.existsSync(file)) throw new Error(`${what} not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${what} is not valid JSON: ${file} — ${err.message}`);
  }
}

// Same merge as the console's rowToSubmission (lib/server/workspace-store.ts): the row's columns win
// over the copies inside the snapshot.
function rowToSubmission(row) {
  return {
    ...row.snapshot,
    submissionId:        row.submission_id,
    submitClientEventId: row.submit_client_event_id,
    issueBuildId:        row.issue_build_id,
    issueKey:            row.issue_key,
    buildVersion:        row.build_version,
    revision:            row.issue_revision,
    editorIdentity:      row.editor_id,
    draftId:             row.draft_id,
    draftRevision:       row.draft_revision,
    submittedAt:         new Date(row.submitted_at).toISOString(),
    replacements:        row.snapshot.replacements ?? [],
  };
}

// The console's database URL: the environment first, then the console's own env file (the one
// publish-build reads). Returns undefined when neither has it.
function resolveDatabaseUrl(env, envFile) {
  const fromEnv = env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  if (!envFile || !fs.existsSync(envFile)) return undefined;
  const parsed = require("dotenv").parse(fs.readFileSync(envFile));
  return parsed.DATABASE_URL?.trim() || undefined;
}

// For the operator, before the live read: host, database name and which source supplied the URL.
// Never the user or password. A stale shell DATABASE_URL would otherwise be used without notice.
function describeDatabase(env, envFile) {
  const url = resolveDatabaseUrl(env, envFile);
  if (!url) return `no DATABASE_URL in the shell or ${envFile}`;
  const source = env.DATABASE_URL?.trim() ? "the shell's DATABASE_URL" : envFile;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname} (from ${source})`;
  } catch {
    return `an unparseable DATABASE_URL (from ${source})`;
  }
}

// It selects by issue date, not by build, on purpose: if the latest submission was made against
// another build, the identity check below must see it and refuse.
const LATEST_SUBMISSION_QUERY = `
  SELECT s.submission_id, s.submit_client_event_id, s.draft_id, s.issue_build_id, s.issue_key,
         s.build_version, s.issue_revision, s.editor_id, s.draft_revision, s.submitted_at, s.snapshot,
         d.is_current AS draft_is_current
  FROM submissions s
  JOIN issue_builds b ON b.id = s.issue_build_id
  JOIN drafts d ON d.id = s.draft_id
  WHERE b.issue_date = $1::date
  ORDER BY s.submitted_at DESC
  LIMIT 1`;

// Loaded here, not at the top: a --submission run and the tests need no database client.
function connectNeon(url) {
  return require("@neondatabase/serverless").neon(url);
}

// The live read: one read-only query, returning the latest submission for the issue date or null.
// Reopening a submitted issue retires its draft (drafts.is_current = false) and opens a new one, so a
// latest submission whose draft is no longer current is a lineup the editor has taken back.
async function readLatestSubmissionFromPostgres({ issueDate }, env = process.env, connect = connectNeon) {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      `DATABASE_URL is not set — the live submission read for ${issueDate} is not configured. ` +
      `Set it in the environment or in the console's .env.local, or pass --submission <submission.json> ` +
      `to read a saved submission instead.`
    );
  }
  const rows = await connect(url).query(LATEST_SUBMISSION_QUERY, [issueDate]);
  if (!rows.length) return null;
  if (!rows[0].draft_is_current) {
    throw new Error(
      `Refusing submission ${rows[0].submission_id} for issue ${issueDate}: the editor reopened the issue ` +
      `after submitting it and has not submitted again. Nothing was written.`
    );
  }
  return rowToSubmission(rows[0]);
}

// ---------------------------------------------------------------------------
// Mapping and checks
// ---------------------------------------------------------------------------

function slotName(sectionId, slotIndex) {
  return `${SECTION_LABELS[sectionId]} Slot ${slotIndex + 1}`;
}

// Reads the D0 markers (Decision_Log §106): SubmissionSnapshot.selfFilledSlots in lib/contracts.ts,
// [{ sectionId, slotIndex }], slotIndex zero-based like SubmittedReplacement. The console leaves the
// slot's pick in finalSelections underneath; it is not a pick and is ignored here. A submission made
// before the console had the control carries no such field and marks nothing.
function readSelfFilledSlots(submission, problems) {
  const marked = new Set();
  const list = submission.selfFilledSlots ?? [];
  if (!Array.isArray(list)) {
    problems.push(`selfFilledSlots is not an array`);
    return marked;
  }
  list.forEach((m, i) => {
    const max = QUOTAS[SECTION_LABELS[m?.sectionId]]?.max;
    if (!(m?.sectionId in SECTION_LABELS)) {
      problems.push(`selfFilledSlots[${i}]: unknown section ${JSON.stringify(m?.sectionId)}`);
    } else if (!Number.isInteger(m.slotIndex) || m.slotIndex < 0 || m.slotIndex >= max) {
      problems.push(`selfFilledSlots[${i}]: slotIndex ${JSON.stringify(m.slotIndex)} is outside 0–${max - 1} for ${SECTION_LABELS[m.sectionId]}`);
    } else if (marked.has(`${m.sectionId}:${m.slotIndex}`)) {
      problems.push(`selfFilledSlots[${i}]: ${slotName(m.sectionId, m.slotIndex)} is marked more than once`);
    } else {
      marked.add(`${m.sectionId}:${m.slotIndex}`);
    }
  });
  return marked;
}

// Maps a submission's final lineup to picks. Pure: no files, no requests.
// Throws one error naming every problem; returns { picks, skipped, warnings } only for a lineup with none.
function mapSubmission(submission, build, issueDate) {
  const problems = [];
  if (!submission || typeof submission !== "object") throw new Error("Refusing submission: it is not an object");
  if (!build || typeof build !== "object" || !Array.isArray(build.sections)) {
    throw new Error("Refusing submission: the named build is not an IssueBuild bundle (no sections array)");
  }

  // The submission ID becomes a file name, and the replay check hangs on it
  if (typeof submission.submissionId !== "string" || !/^[A-Za-z0-9-]+$/.test(submission.submissionId)) {
    problems.push(`submissionId ${JSON.stringify(submission.submissionId)} is missing or malformed`);
  }
  if (submission.issueDate !== issueDate) {
    problems.push(`issueDate ${JSON.stringify(submission.issueDate)} does not match --issue ${issueDate}`);
  }

  // Build identity (W1): every field the submission copied from its build must equal the named build's
  const mismatched = IDENTITY_FIELDS.filter(([field, buildField]) =>
    submission[field] === undefined || submission[field] === null || submission[field] !== build[buildField]
  );
  if (mismatched.length) {
    problems.push(
      `build identity mismatch — the submission was not made against the named build: ` +
      mismatched.map(([field, buildField]) =>
        `${field} ${JSON.stringify(submission[field])} ≠ ${JSON.stringify(build[buildField])}`
      ).join("; ")
    );
  }

  const selfFilled = readSelfFilledSlots(submission, problems);
  const finalSelections = submission.finalSelections;
  if (!finalSelections || typeof finalSelections !== "object" || Array.isArray(finalSelections)) {
    problems.push("finalSelections is missing");
  }

  for (const sectionId of Object.keys(finalSelections ?? {})) {
    if (!(sectionId in SECTION_LABELS)) problems.push(`finalSelections: unknown section ${JSON.stringify(sectionId)}`);
  }

  const picks = [];
  const skipped = [];
  const warnings = [];
  const seenCandidates = {};
  for (const [sectionId, label] of Object.entries(SECTION_LABELS)) {
    const selections = finalSelections?.[sectionId];
    const expected = QUOTAS[label].max;
    if (!Array.isArray(selections)) {
      problems.push(`${label}: section is missing from finalSelections`);
      continue;
    }
    if (selections.length !== expected) {
      problems.push(`${label}: ${selections.length} selections, expected exactly ${expected}`);
      continue;
    }

    const buildSection = build.sections.find((s) => s?.id === sectionId);
    const known = new Set([
      ...(buildSection?.selected ?? []).map((c) => c?.id),
      ...(buildSection?.alternatives ?? []).map((a) => a?.candidate?.id),
    ]);
    if (!buildSection) problems.push(`${label}: section is missing from the named build`);

    const venueSeen = {};
    const seriesSeen = {};
    selections.forEach((candidate, slotIndex) => {
      const name = slotName(sectionId, slotIndex);
      // D0: the editor fills this slot in Beehiiv. Whatever sits in it is not a pick and is not checked.
      if (selfFilled.has(`${sectionId}:${slotIndex}`)) {
        skipped.push({ Section: label, Slot: slotIndex + 1 });
        return;
      }
      if (!candidate || typeof candidate !== "object") {
        problems.push(`${name}: no candidate, and the slot is not marked self-filled`);
        return;
      }
      if (typeof candidate.id !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(candidate.id)) {
        problems.push(`${name}: candidate id ${JSON.stringify(candidate.id)} is not an Airtable record ID`);
        return;
      }
      if (buildSection && !known.has(candidate.id)) {
        problems.push(`${name}: candidate ${candidate.id} is not in build ${build.buildVersion}'s ${label} section`);
      }
      if (seenCandidates[candidate.id]) {
        problems.push(`${name}: candidate ${candidate.id} is already in ${seenCandidates[candidate.id]}`);
      }
      seenCandidates[candidate.id] ??= name;

      // Same match as buildIssues.js venueKey(): a blank venue never counts. Reported, never refused.
      const venue = venueKey(candidate.venue);
      if (venue) {
        if (venueSeen[venue]) warnings.push(`${name}: same venue as Slot ${venueSeen[venue]} (${candidate.venue.trim()})`);
        venueSeen[venue] ??= slotIndex + 1;
      }
      const series = typeof candidate.seriesId === "string" ? candidate.seriesId.trim() : "";
      if (series) {
        if (seriesSeen[series]) warnings.push(`${name}: same series as Slot ${seriesSeen[series]} (${series})`);
        seriesSeen[series] ??= slotIndex + 1;
      }

      picks.push({ IssueDate: issueDate, ItemID: candidate.id, Section: label, Slot: slotIndex + 1 });
    });
  }

  if (!problems.length && picks.length === 0) {
    problems.push("every slot is marked self-filled, so there are no picks to write");
  }
  if (problems.length) {
    throw new Error(
      `Refusing submission ${submission.submissionId ?? "(no id)"} — no picks file was written:\n  ${problems.join("\n  ")}`
    );
  }
  return { picks, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Picks file
// ---------------------------------------------------------------------------

// One file per submission, so the writer's receipt beside it identifies the submission it applied
function picksPathFor(outDir, submission) {
  return path.join(outDir, `submission_${submission.submissionId}.picks.json`);
}

// Same path writeIssuePicks.js receiptPathFor() computes. Restated, not imported: requiring the
// writer loads the Airtable environment, and this script must run without it.
function receiptPathFor(picksFile) {
  const { dir, name } = path.parse(picksFile);
  return path.join(dir, `${name}.write_receipt.json`);
}

function assertNotApplied(submission, picksFile) {
  const receiptPath = receiptPathFor(picksFile);
  if (!fs.existsSync(receiptPath)) return;
  let complete = null;
  try {
    complete = JSON.parse(fs.readFileSync(receiptPath, "utf8")).complete === true;
  } catch { /* an unreadable receipt is still a receipt */ }
  throw new Error(
    `Refusing submission ${submission.submissionId}: it has already been applied — a writer receipt exists at ${receiptPath}` +
    (complete ? "." : ", and it records a write that did not finish. Check IssueItems against that receipt before anything else.") +
    ` Nothing was written.`
  );
}

// writeIssuePicks.js reads only `picks`; the other keys record where the picks came from.
// No timestamps of its own, so a rerun on the same submission produces the same bytes.
function buildPicksFile(submission, picks, skipped) {
  return JSON.stringify({
    submission: {
      submissionId:    submission.submissionId,
      revision:        submission.revision ?? null,
      issueKey:        submission.issueKey,
      issueDate:       submission.issueDate,
      issueBuildId:    submission.issueBuildId,
      buildVersion:    submission.buildVersion,
      contractVersion: submission.contractVersion,
      bundleHash:      submission.bundleHash,
      editorIdentity:  submission.editorIdentity ?? null,
      submittedAt:     submission.submittedAt ?? null,
    },
    skipped,
    picks,
  }, null, 2) + "\n";
}

function writePicksFile(picksFile, contents) {
  if (fs.existsSync(picksFile)) {
    if (fs.readFileSync(picksFile, "utf8") !== contents) {
      throw new Error(`Refusing to overwrite a different picks file: ${picksFile}. Nothing was written.`);
    }
    return false;
  }
  fs.mkdirSync(path.dirname(picksFile), { recursive: true });
  fs.writeFileSync(picksFile, contents, { flag: "wx" });
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// deps.readSubmission({ issueDate }) → a SubmissionSnapshot or null. Injected by the tests; the default
// is the --submission file when given, otherwise the live Postgres read.
async function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  const log = deps.log ?? console.log;
  const readSubmission = deps.readSubmission ?? (opts.submissionFile
    ? async () => readJsonFile(opts.submissionFile, "Submission file")
    : (args) => readLatestSubmissionFromPostgres(args, { DATABASE_URL: resolveDatabaseUrl(process.env, opts.envFile) }));

  const build = readJsonFile(opts.buildFile, "Build bundle");
  if (!deps.readSubmission && !opts.submissionFile) log(`Database: ${describeDatabase(process.env, opts.envFile)}`);
  const submission = await readSubmission({ issueDate: opts.issueDate });
  if (!submission) throw new Error(`No submitted revision found for issue ${opts.issueDate}. Nothing was written.`);

  const { picks, skipped, warnings } = mapSubmission(submission, build, opts.issueDate);
  const picksFile = picksPathFor(opts.outDir, submission);
  assertNotApplied(submission, picksFile);

  const contents = buildPicksFile(submission, picks, skipped);
  const sha256 = crypto.createHash("sha256").update(contents).digest("hex");

  log(`${opts.write ? "WRITE" : "DRY RUN"} — submission ${submission.submissionId} (revision ${submission.revision ?? "?"}) for issue ${opts.issueDate}`);
  log(`Build: version ${build.buildVersion}, bundle ${build.bundleHash} — matches the submission`);
  log(`Picks (${picks.length}):`);
  for (const p of picks) log(`  ${p.Section} Slot ${p.Slot} → ${p.ItemID}`);
  log(`Self-filled slots skipped (${skipped.length})${skipped.length ? ":" : ""}`);
  for (const s of skipped) log(`  ${s.Section} Slot ${s.Slot}`);
  log(`Repeats the editor kept (${warnings.length})${warnings.length ? ":" : ""}`);
  for (const w of warnings) log(`  ${w}`);

  if (opts.write) {
    const created = writePicksFile(picksFile, contents);
    log(`${created ? "Picks file written" : "Picks file already present and identical"}: ${picksFile} (sha256 ${sha256})`);
  } else {
    log(`Dry run — nothing written. Would write ${picksFile} (sha256 ${sha256}). Re-run with --write.`);
  }

  const command = `node "${WRITER}" "${picksFile}" --issue ${opts.issueDate}`;
  log(`${opts.write ? "Next" : "After --write"}, the writer's dry run:`);
  log(`  ${command}`);
  log(`Then, to write to Airtable (add --ensure-issue if the Issues record does not exist):`);
  log(`  ${command} --apply`);

  return { mode: opts.write ? "write" : "dry-run", picks, skipped, warnings, picksFile, sha256, command };
}

module.exports = {
  SECTION_LABELS,
  parseArgs,
  rowToSubmission,
  resolveDatabaseUrl,
  describeDatabase,
  readLatestSubmissionFromPostgres,
  mapSubmission,
  picksPathFor,
  receiptPathFor,
  buildPicksFile,
  main,
};

// Run only when executed directly. require()-ing this file reads nothing and connects to nothing.
if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
