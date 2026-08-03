/**
 * Reconcile the 38 Step-1c `outcompeted` judgments into the R7 Label Deck.
 *
 * Dry-run by default. Pass --apply only after reviewing the printed manifest.
 * Pass --emit-artifact to (re)write models/sectioning/eval/step1c_reconciliation.json.
 *
 * The write is idempotent: each row must be either in its exact pre-write state or
 * already in its exact desired state. Any third state aborts before PATCHing.
 *
 * Usage:
 *   node scripts/reconcileR7Step1c.js
 *   node scripts/reconcileR7Step1c.js --emit-artifact
 *   node scripts/reconcileR7Step1c.js --apply
 *
 * ---------------------------------------------------------------------------------
 * THE WRITE POLICY IS ADDITIVE. This is the one non-obvious choice in the file.
 *
 * Every one of these 38 rows currently reads `Section=None, NoneReason=['outcompeted']`.
 * The reconciliation could either REPLACE that tick or ADD to it. This script ADDS:
 *
 *   positive -> set Section; LEAVE `outcompeted` in place (inert: route_s77 returns
 *               'positive' on Section alone and never inspects reasons)
 *   negative -> append the permanent reason ALONGSIDE `outcompeted`; §77 precedence
 *               evaluates `outcompeted` LAST, so permanent wins and the row routes
 *               negative. combinationFlags() in auditR7Labels.js already exists to
 *               report exactly this pair, informationally.
 *   withheld -> no write at all.
 *
 * Why additive: the `outcompeted` tick is the editor's own evidence that the row lost
 * a week on relative merit. Decision_Log §87 assigns relative/click-oriented ranking to
 * R6, and Airtable is where R6 will look for it. Clearing the tick would leave that
 * evidence only in git history of the pull files. The gate is unaffected either way.
 *
 * The cost of additive: `Section=<real>` + `NoneReason=['outcompeted']` is a state the
 * §77 fixture does not cover (routing_s77_cases.json tests sectioned rows only with an
 * EMPTY reason list). Three cases are added there in the same change so the contract
 * asserts what this write actually produces.
 * ---------------------------------------------------------------------------------
 *
 * NoneReasoning is NEVER touched. Unlike Step 4b — which wrote the verbatim reason into
 * a field that was empty on all 11 rows — 14 of these 38 already carry NoneReasoning or
 * LinkGave text from the ORIGINAL sitting. Overwriting would destroy first-sitting
 * evidence to record second-sitting evidence. The Step-1c verbatim reasons live in
 * docs/r7/R7_Outcompeted_Editor_Form_38_Completed.md and in the emitted artifact.
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../NLAP_Airtable.env"),
  quiet: true,
});

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const APPLY = process.argv.includes("--apply");
const EMIT = process.argv.includes("--emit-artifact");
const CHUNK_SIZE = 10;

const WRONG_FIT = "wrong fit / not our audience";
const B2B = "B2B / professional dev";
const CIVIC = "civic";
const OUTCOMPETED = "outcompeted";

const SHEET = path.join(__dirname, "../docs/r7/R7_Outcompeted_Editor_Form_38_Completed.md");
const ARTIFACT = path.join(__dirname, "../models/sectioning/eval/step1c_reconciliation.json");

/**
 * THE FROZEN ANSWER KEY — Ariel-settled, 2026-08-03. Do not re-derive.
 *
 * `verdict`  = the editor's round-1 token, verbatim population.
 * `reason`   = the editor's round-1 free text, verbatim (typos preserved).
 * `to`       = settled gate disposition.
 * `section`  = canonical section, Airtable's SHORT vocabulary (Families/Couples/Golden).
 * `secFrom`  = provenance of the SECTION: 'editor-prose' where the editor named an
 *              audience in his own reason text, 'ariel' where Ariel authored it.
 * `dispFrom` = provenance of the DISPOSITION: 'editor-round1' where the verdict carried
 *              straight through, 'ariel' where Ariel resolved UNCLEAR or overturned.
 * `note`     = Ariel's annotation, carried verbatim into the artifact.
 */
const KEY = Object.freeze([
  // ---- GATE-POSITIVE :: Families ------------------------------------------------
  { row: 364, verdict: "ELIGIBLE",  reason: "it's a family event", to: "positive", section: "Families", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 267, verdict: "ELIGIBLE",  reason: "a good family event", to: "positive", section: "Families", secFrom: "editor-prose", dispFrom: "editor-round1" },
  {
    row: 175, verdict: "ELIGIBLE", reason: "families  would like this event",
    to: "positive", section: "Families", secFrom: "ariel", dispFrom: "ariel",
    // The only row in this reconciliation that clears a field. `Label` held a stale
    // first-sitting string that the canonical judgment supersedes; `NoneReasoning`
    // ("pokeman is popular, people like it") is supportive and is retained.
    clear: ["Label"],
    note: "Explicit Ariel adjudication (2026-08-03): ELIGIBLE / For Families.",
  },
  { row: 337, verdict: "UNCLEAR",   reason: "UNCLEAR what this event is", to: "positive", section: "Families", secFrom: "ariel", dispFrom: "ariel" },
  { row: 312, verdict: "UNCLEAR",   reason: "UNCLEAR if the geo location is sutiable", to: "positive", section: "Families", secFrom: "ariel", dispFrom: "ariel" },
  { row: 351, verdict: "PERMANENT", reason: "doesn't get clicks", to: "positive", section: "Families", secFrom: "ariel", dispFrom: "ariel" },
  { row: 156, verdict: "PERMANENT", reason: "doesn't get clicks", to: "positive", section: "Families", secFrom: "ariel", dispFrom: "ariel", note: "Families, expected low R6 rank." },
  { row: 205, verdict: "PERMANENT", reason: "from the previous times – it's expensive, and doesn't get clicks", to: "positive", section: "Families", secFrom: "ariel", dispFrom: "ariel", note: "Families and considered good; do NOT annotate as low-ranked." },

  // ---- GATE-POSITIVE :: Couples ---------------------------------------------------
  { row: 380, verdict: "ELIGIBLE",  reason: "good event people like it.", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "editor-round1", note: "Couples primary, genuinely multi-fit." },
  { row: 245, verdict: "ELIGIBLE",  reason: "popular summer event", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "editor-round1" },
  { row: 243, verdict: "ELIGIBLE",  reason: "good novelty event for couples", to: "positive", section: "Couples", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 143, verdict: "ELIGIBLE",  reason: "couples would like this event", to: "positive", section: "Couples", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 89,  verdict: "ELIGIBLE",  reason: "might be a good event for couples (women with friends)", to: "positive", section: "Couples", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 180, verdict: "UNCLEAR",   reason: "UNCLEAR what this event is", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "ariel" },
  { row: 138, verdict: "UNCLEAR",   reason: "I would take this event by itself, but from the description it looks like this event takes place at Woodbridge Ribfest X that I promote as a separate event, so I would avoid duplication", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "ariel", note: "Eligible Couples; the parent-event/Ribfest overlap is a DOWNSTREAM duplication constraint (allocator), not a gate-negative." },
  { row: 141, verdict: "UNCLEAR",   reason: "depends on a week and more detailed description", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "ariel", note: "Couples; Georgina remains within the current GTA rule." },
  { row: 133, verdict: "UNCLEAR",   reason: "needs more information", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "ariel", note: "Couples primary; Golden Age alternate/flex." },
  { row: 158, verdict: "PERMANENT", reason: "doesn't get clicks", to: "positive", section: "Couples", secFrom: "ariel", dispFrom: "ariel", note: "Couples; nightlife evidence came from the description/link, not title alone." },

  // ---- GATE-POSITIVE :: Golden Age Readers ----------------------------------------
  { row: 236, verdict: "ELIGIBLE",  reason: "workshop for seniors", to: "positive", section: "Golden", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 278, verdict: "ELIGIBLE",  reason: "seniors", to: "positive", section: "Golden", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 122, verdict: "ELIGIBLE",  reason: "it's a good seniors' event", to: "positive", section: "Golden", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 131, verdict: "ELIGIBLE",  reason: "it's a good seniors' event", to: "positive", section: "Golden", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 383, verdict: "ELIGIBLE",  reason: "might be a good event for seniors", to: "positive", section: "Golden", secFrom: "editor-prose", dispFrom: "editor-round1" },
  { row: 280, verdict: "UNCLEAR",   reason: "depends on a week and more detailed description and age category", to: "positive", section: "Golden", secFrom: "ariel", dispFrom: "ariel" },
  { row: 203, verdict: "UNCLEAR",   reason: "depends on a age category", to: "positive", section: "Golden", secFrom: "ariel", dispFrom: "ariel", note: "Golden Age, expected low R6 rank." },

  // ---- GATE-NEGATIVE :: wrong fit / permanent audience mismatch --------------------
  { row: 398, verdict: "PERMANENT", reason: "too niche", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 297, verdict: "PERMANENT", reason: "too niche", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 93,  verdict: "PERMANENT", reason: "too niche, not my age group", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 260, verdict: "PERMANENT", reason: "too niche, this type of events gets a little clicks", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 186, verdict: "PERMANENT", reason: "people might enjoy learning to imporve their speaking", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 250, verdict: "PERMANENT", reason: "too niche", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 365, verdict: "PERMANENT", reason: "too niche", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 354, verdict: "PERMANENT", reason: "too niche", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1", note: "Blind-sitting twin of r62, whose Step-4b verdict was also NEVER 'too niche'. Independent reproduction." },
  { row: 206, verdict: "PERMANENT", reason: "too niche, wrong age group", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 109, verdict: "PERMANENT", reason: "too niche", to: "negative", nreason: WRONG_FIT, dispFrom: "editor-round1" },
  { row: 204, verdict: "UNCLEAR",   reason: "too niche, depends on a week and more detailed description", to: "negative", nreason: WRONG_FIT, dispFrom: "ariel" },

  // ---- GATE-NEGATIVE :: B2B / professional or civic --------------------------------
  { row: 231, verdict: "PERMANENT", reason: "doesn't get clicks", to: "negative", nreason: B2B, dispFrom: "ariel", note: "Adjudicated on event content (B2B/professional or civic housing event), NOT on the verbatim click reason. Click language is never a gate-negative reason (§87)." },

  // ---- WITHHELD FROM FIT -----------------------------------------------------------
  {
    row: 342, verdict: "ELIGIBLE", reason: "it's a good seasonal family event", to: "withheld",
    dispFrom: "ariel",
    note:
      "The editor judged the underlying EVENT eligible / For Families, but the model input " +
      "text explicitly opens 'Event Cancelled (Extreme Weather)'. Training or evaluating on " +
      "that text teaches the gate from a cancellation notice, not from the event. Preserve " +
      "the evidence; do not represent it as positive or negative.",
  },
]);

// Reason vocabulary guard: a rename in Airtable must fail here, loudly, before any PATCH.
const KNOWN_REASONS = new Set([WRONG_FIT, B2B, CIVIC, OUTCOMPETED, "non-GTA", "can't tell"]);
const SECTIONS = new Set(["Families", "Couples", "Golden"]);

for (const k of KEY) {
  if (k.to === "positive" && !SECTIONS.has(k.section)) {
    throw new Error(`r${k.row}: positive row needs a canonical section, got ${k.section}`);
  }
  if (k.to === "negative" && !KNOWN_REASONS.has(k.nreason)) {
    throw new Error(`r${k.row}: negative row needs a known permanent reason, got ${k.nreason}`);
  }
  if (k.to === "negative" && k.nreason === OUTCOMPETED) {
    throw new Error(`r${k.row}: 'outcompeted' can never BE the negative reason (§77)`);
  }
}

// ---------------------------------------------------------------------------------
// Count contract, asserted before anything reads Airtable. 38 unique / 25 / 12 / 1.
// ---------------------------------------------------------------------------------
const rowsSeen = new Set(KEY.map((k) => k.row));
const tally = KEY.reduce((acc, k) => ((acc[k.to] = (acc[k.to] || 0) + 1), acc), {});
const EXPECTED = { unique: 38, positive: 25, negative: 12, withheld: 1 };
if (rowsSeen.size !== EXPECTED.unique) {
  throw new Error(`expected ${EXPECTED.unique} unique rows, got ${rowsSeen.size} (duplicate row id?)`);
}
if (KEY.length !== EXPECTED.unique) {
  throw new Error(`expected ${EXPECTED.unique} key entries, got ${KEY.length}`);
}
for (const [dest, want] of Object.entries({ positive: 25, negative: 12, withheld: 1 })) {
  if ((tally[dest] || 0) !== want) {
    throw new Error(`expected ${want} ${dest}, got ${tally[dest] || 0}`);
  }
}

const SECTION_TALLY = KEY.filter((k) => k.to === "positive").reduce(
  (acc, k) => ((acc[k.section] = (acc[k.section] || 0) + 1), acc),
  {}
);

// ---------------------------------------------------------------------------------
// Desired / pre-write state per row. Mirrors stateOf() in reconcileR7Step4b.js.
// ---------------------------------------------------------------------------------
function arr(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}
function sameReasons(actual, expected) {
  return JSON.stringify([...arr(actual)].sort()) === JSON.stringify([...expected].sort());
}

const COMMENTARY_FIELDS = ["Label", "NoneReasoning", "LinkGave"];

/** Verbatim first-sitting commentary this write RETAINS. Null when the row carries none. */
function retainedCommentary(k, fields) {
  const clearing = new Set(k.clear || []);
  const out = {};
  for (const field of COMMENTARY_FIELDS) {
    if (clearing.has(field)) continue;
    if (String(fields[field] || "").trim()) out[field] = fields[field];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Write receipt for cleared fields: the exact string this write DESTROYS, captured
 * verbatim in the committed artifact. Airtable has no undo and data/ is gitignored, so
 * without this the value would survive nowhere after --apply.
 */
function clearedCommentary(k, fields) {
  if (!k.clear || !k.clear.length) return null;
  const out = {};
  for (const field of k.clear) out[field] = fields[field] ?? null;
  return out;
}

/**
 * What the row must look like BEFORE the write: untouched from the original sitting.
 * A row that clears a field must still be CARRYING that field, otherwise a re-run after
 * a partial write would read as pristine and the clear would be silently skipped.
 */
function preState(k, fields) {
  const intact =
    fields.Section === "None" && sameReasons(fields.NoneReason, [OUTCOMPETED]);
  const stillCarries = (k.clear || []).every((f) => String(fields[f] || "").trim());
  return intact && stillCarries;
}

/** What the row must look like AFTER the write, per the additive policy. */
function desired(k) {
  const base =
    k.to === "positive"
      ? { Section: k.section, NoneReason: [OUTCOMPETED] }
      : k.to === "negative"
      ? { Section: "None", NoneReason: [OUTCOMPETED, k.nreason] }
      : { Section: "None", NoneReason: [OUTCOMPETED] }; // withheld: identical to pre-state
  for (const field of k.clear || []) base[field] = "";
  return base;
}

/** Only the fields that actually change. Empty object => no PATCH for this row. */
function patchFor(k, fields) {
  const want = desired(k);
  const patch = {};
  if (fields.Section !== want.Section) patch.Section = want.Section;
  if (!sameReasons(fields.NoneReason, want.NoneReason)) patch.NoneReason = want.NoneReason;
  for (const field of k.clear || []) {
    if (String(fields[field] || "").trim()) patch[field] = "";
  }
  return patch;
}

function stateOf(k, fields) {
  const want = desired(k);
  const atDesired =
    fields.Section === want.Section &&
    sameReasons(fields.NoneReason, want.NoneReason) &&
    (k.clear || []).every((f) => !String(fields[f] || "").trim());
  // withheld rows: pre-state IS the desired state, so they read 'already-applied'.
  if (k.to !== "withheld" && atDesired) return "already-applied";
  if (k.to === "withheld" && atDesired) return "no-write";
  if (preState(k, fields)) return "pending";
  return "conflict";
}

// ---------------------------------------------------------------------------------
async function airtable(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`Airtable ${response.status}: ${JSON.stringify(body.error || body)}`);
  }
  return body;
}

async function fetchAll() {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const page = await airtable(url.toString());
    records.push(...page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * Refuse to regenerate an artifact that already records an applied write.
 *
 * WHY THIS GUARD EXISTS. `plan` is built from LIVE Airtable state. Before --apply that is
 * the pre-write state, which is what `before` and `cleared_commentary` are supposed to
 * record. AFTER --apply, live state IS the post-write state, so a plain --emit-artifact
 * would silently rewrite:
 *   before              -> the post-write values (the pre-write record destroyed)
 *   cleared_commentary  -> {"Label": null} (the destroyed string is gitignored in data/
 *                          and lives NOWHERE else -- permanently unrecoverable)
 *   applied_at / ids    -> null / [] (the write receipt erased)
 *
 * That path was reachable and, worse, RECOMMENDED: _load_withheld_rows() in gate_step4a.py
 * told anyone with a missing artifact to run exactly this command.
 */
function assertSafeToEmit() {
  if (!fs.existsSync(ARTIFACT)) return;
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(ARTIFACT, "utf-8"));
  } catch {
    return; // unparseable: regenerating is strictly an improvement
  }
  if (!existing.applied_at) return;
  throw new Error(
    `${path.basename(ARTIFACT)} already records an applied write ` +
      `(applied_at ${existing.applied_at}, ${(existing.applied_airtable_row_ids || []).length} ids).\n` +
      "  Regenerating now would rebuild `before` and `cleared_commentary` from POST-write\n" +
      "  live state, destroying the pre-write record and the cleared Label string, which\n" +
      "  exists nowhere else (data/ is gitignored). Refusing.\n" +
      "  To inspect current state, run the dry run WITHOUT --emit-artifact.\n" +
      "  To genuinely rebuild, move the existing artifact aside first, deliberately."
  );
}

function emitArtifact(plan) {
  const artifact = {
    step: "R7-W6 Step 1c",
    source_sheet_path: "docs/r7/R7_Outcompeted_Editor_Form_38_Completed.md",
    source_sheet_sha256: sha256(SHEET),
    answer_key: {
      settled_by: "Ariel",
      settled_on: "2026-08-03",
      frozen_in: "scripts/reconcileR7Step1c.js (const KEY)",
      basis:
        "Round-1 blind editor sitting (38 rows) plus Ariel's adjudication of the 9 UNCLEAR " +
        "rows, the click-only PERMANENT rejections, and the sections the editor did not name.",
    },
    policy: {
      write_mode: "additive",
      outcompeted_tick: "preserved on all 38 rows; retained as R6 ranking evidence per Decision_Log §87",
      none_reasoning: "never written; 14 of 38 already carry first-sitting text",
      click_language: "never a gate-negative reason; R6 ranking evidence only",
      section_vocabulary: "Airtable short names (Families / Couples / Golden)",
    },
    counts: {
      unique_rows: rowsSeen.size,
      positive: tally.positive,
      negative: tally.negative,
      withheld: tally.withheld,
      positive_by_section: SECTION_TALLY,
      round1_verdicts: KEY.reduce((a, k) => ((a[k.verdict] = (a[k.verdict] || 0) + 1), a), {}),
      disposition_provenance: KEY.reduce((a, k) => ((a[k.dispFrom] = (a[k.dispFrom] || 0) + 1), a), {}),
    },
    withheld_from_fit: KEY.filter((k) => k.to === "withheld").map((k) => ({
      row: k.row,
      editor_verdict_round1: k.verdict,
      editor_reason_verbatim: k.reason,
      editor_implied_section: "Families",
      reason_withheld: k.note,
      airtable_representation:
        "unchanged (Section=None, NoneReason=['outcompeted']) -> routes 'withheld' by §77. " +
        "No option in the 6-value vocabulary truthfully means 'input text is a cancellation " +
        "notice', so the truthful record is this artifact plus WITHHELD_ROWS in gate_step4a.py; " +
        "no false label is written.",
    })),
    rows: plan,
    applied_airtable_row_ids: [],
    applied_at: null,
  };
  fs.writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2) + "\n", "utf-8");
  return artifact;
}

// ---------------------------------------------------------------------------------
(async () => {
  if (!BASE_ID || !process.env.AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_BASE_ID / AIRTABLE_API_KEY missing from NLAP_Airtable.env");
  }

  const records = await fetchAll();
  const byRow = new Map();
  for (const rec of records) {
    const row = rec.fields.Row;
    if (row !== undefined) byRow.set(row, rec);
  }

  const plan = [];
  const states = { pending: 0, "already-applied": 0, "no-write": 0, conflict: 0 };
  const conflicts = [];

  for (const k of KEY) {
    const rec = byRow.get(k.row);
    if (!rec) throw new Error(`r${k.row} not found in the live deck (${records.length} records)`);
    const f = rec.fields;
    const state = stateOf(k, f);
    states[state] += 1;
    const patch = patchFor(k, f);
    if (state === "conflict") {
      conflicts.push({ row: k.row, Section: f.Section, NoneReason: arr(f.NoneReason) });
    }
    plan.push({
      row: k.row,
      record_id: rec.id,
      title: f.Event,
      slice: f.Slice,
      editor_verdict_round1: k.verdict,
      editor_reason_verbatim: k.reason,
      settled_disposition: k.to,
      canonical_section: k.to === "positive" ? k.section : null,
      negative_reason: k.to === "negative" ? k.nreason : null,
      section_provenance: k.secFrom || null,
      disposition_provenance: k.dispFrom,
      annotation: k.note || null,
      retained_commentary: retainedCommentary(k, f),
      cleared_commentary: clearedCommentary(k, f),
      before: { Section: f.Section ?? null, NoneReason: arr(f.NoneReason) },
      after: desired(k),
      patch: Object.keys(patch).length ? patch : null,
      state,
    });
  }

  // ------------------------------- the preview -------------------------------
  const W = 96;
  console.log("\n" + "=".repeat(W));
  console.log("STEP-1c RECONCILIATION — " + (APPLY ? "APPLY" : "DRY RUN (no write)"));
  console.log("=".repeat(W));
  console.log(
    `deck: ${records.length} records · key: ${KEY.length} rows ` +
      `(${tally.positive} positive / ${tally.negative} negative / ${tally.withheld} withheld)`
  );
  console.log(
    `positive by section: ` +
      Object.entries(SECTION_TALLY).map(([s, n]) => `${s} ${n}`).join(" · ")
  );
  console.log(
    `state: ${states.pending} pending · ${states["already-applied"]} already-applied · ` +
      `${states["no-write"]} no-write · ${states.conflict} conflict`
  );

  for (const dest of ["positive", "negative", "withheld"]) {
    const group = plan.filter((p) => p.settled_disposition === dest);
    console.log("\n" + "-".repeat(W));
    console.log(`${dest.toUpperCase()} — ${group.length} rows`);
    console.log("-".repeat(W));
    for (const p of group) {
      const before = `${p.before.Section} + [${p.before.NoneReason.join(", ")}]`;
      const after = `${p.after.Section} + [${p.after.NoneReason.join(", ")}]`;
      console.log(
        `r${String(p.row).padEnd(4)} ${p.record_id}  ${String(p.slice).padEnd(6)} ` +
          `${p.state.padEnd(15)} ${String(p.title || "").slice(0, 44)}`
      );
      console.log(`       ${before}   ->   ${after}`);
      console.log(
        `       round1 ${p.editor_verdict_round1} "${p.editor_reason_verbatim}"` +
          `  | section:${p.section_provenance || "-"} disposition:${p.disposition_provenance}`
      );
      if (p.cleared_commentary) {
        for (const [field, value] of Object.entries(p.cleared_commentary)) {
          console.log(`       CLEARS ${field}: "${value}" -> "" (destructive; no Airtable undo)`);
        }
      }
      if (p.annotation) console.log(`       NOTE: ${p.annotation}`);
    }
  }

  if (conflicts.length) {
    console.log("\n" + "!".repeat(W));
    console.log("CONFLICT — rows in neither the pre-write nor the desired state. NOTHING WRITTEN.");
    for (const c of conflicts) console.log(`  r${c.row}: ${c.Section} + [${c.NoneReason.join(", ")}]`);
    console.log("!".repeat(W));
    process.exitCode = 1;
    return;
  }

  if (EMIT) {
    assertSafeToEmit();
    emitArtifact(plan);
    console.log(`\nartifact written: ${path.relative(process.cwd(), ARTIFACT)}`);
  }

  if (!APPLY) {
    const writes = plan.filter((p) => p.patch);
    console.log(`\n${writes.length} of ${plan.length} rows would be PATCHed. Re-run with --apply.`);
    return;
  }

  // ------------------------------- the write ---------------------------------
  // Same guard as --emit-artifact. A second --apply is already a no-op on Airtable (every
  // row reads 'already-applied'), but it would still reach emitArtifact() below and
  // rebuild the artifact from post-write state. Belt and braces on the same failure.
  assertSafeToEmit();
  const writes = plan.filter((p) => p.patch);
  const applied = [];
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    await airtable(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        records: chunk.map((p) => ({ id: p.record_id, fields: p.patch })),
      }),
    });
    applied.push(...chunk.map((p) => p.record_id));
    console.log(`  patched ${applied.length}/${writes.length}`);
  }

  const artifact = emitArtifact(plan);
  artifact.applied_airtable_row_ids = applied;
  artifact.applied_at = new Date().toISOString();
  fs.writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2) + "\n", "utf-8");
  console.log(`\napplied ${applied.length} records · artifact: ${path.relative(process.cwd(), ARTIFACT)}`);
  console.log("Re-run without --apply to verify every row now reads 'already-applied'.");
})().catch((error) => {
  console.error("\nFAILED:", error.message);
  process.exitCode = 1;
});
