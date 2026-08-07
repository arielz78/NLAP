/**
 * Push any editor deck / validation packet into a standalone Airtable table.
 *
 * Replaces the per-deck copies: pushLabelDeck.js (mode=replace) and
 * pushLiveDemo30.js (mode=replace-batch). Those two are spent one-offs and are
 * kept only for their historical headers — new pushes go through this.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply, matching the house
 * pattern in reconcileR7Step1c.js / reconcileR7Step4b.js.
 *
 * Write order is CREATE THEN DELETE, so a failed create can never leave the table
 * emptied. Destructive modes also refuse to run on empty input or a mapping that
 * resolves to nothing — see the guards in main().
 *
 * Usage:
 *   node scripts/pushDeck.js --table tblXXXX --input path/to/rows.jsonl \
 *     --map "Event=title" --map "Details=desc" --map "Link=url" \
 *     --const "Batch=6 - Instrument A" --ruled Verdict \
 *     --auto-row --mode replace-batch [--apply]
 *
 * Flags (unknown flags, missing values and duplicates are hard errors):
 *   --table      Airtable table id (required)
 *   --input      .json (array) or .jsonl source file (required)
 *   --map        Airtable field = source key. REPEAT the flag per field; commas
 *                are not separators, so field names may contain them. (required)
 *   --const      Airtable field = literal value. Repeatable. (optional)
 *   --mode       append | replace | replace-batch          (default: append)
 *                append        never deletes anything
 *                replace       purges the whole table first; also RESETS Row
 *                              identity when combined with --auto-row
 *                replace-batch purges only rows whose Batch matches --const Batch
 *   --ruled      field(s) meaning "the editor answered", comma-separated.
 *                REQUIRED for replace / replace-batch — there is deliberately no
 *                default, because the deck answers in `Section` and a validation
 *                packet answers in `Verdict`, and a wrong default makes the guard
 *                inspect a field nobody fills and delete real answers.
 *                Deletes abort if any row to be deleted has any of them filled.
 *   --auto-row   number a `Row` field from (max existing Row outside the purge set) + 1
 *   --apply      actually write; omit for a dry run
 */
const fs = require("fs");
const path = require("path");
const { selectName, fetchAll, deleteRecords, createRecords, assertUnruled } = require("./lib/airtableDeck");

// Strict parsing: this utility deletes records, so an unrecognised or malformed
// flag must fail loudly rather than be ignored into a destructive default.
const VALUE_FLAGS = new Set(["table", "input", "mode", "ruled"]);
const REPEATABLE_FLAGS = new Set(["map", "const"]);   // repeat the flag; commas are NOT separators
const BOOL_FLAGS = new Set(["apply", "auto-row"]);

function parseArgs(argv) {
  const out = { mode: "append", apply: false, autoRow: false, map: [], const: [] };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}" — flags must start with --`);
    const name = a.slice(2);
    if (BOOL_FLAGS.has(name)) {
      if (name === "apply") out.apply = true;
      else out.autoRow = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${name} requires a value (got ${value === undefined ? "end of args" : `"${value}"`})`);
    }
    i++;
    if (REPEATABLE_FLAGS.has(name)) out[name].push(value);
    else if (VALUE_FLAGS.has(name)) {
      if (seen.has(name)) throw new Error(`--${name} given more than once`);
      seen.add(name);
      out[name] = value;
    } else throw new Error(`unknown flag --${name}`);
  }
  return out;
}

/** ["Event=title", "Link=url"] -> { Event: "title", Link: "url" }; duplicate fields are an error. */
function parsePairs(specs, label) {
  const out = {};
  for (const spec of specs) {
    const i = spec.indexOf("=");
    if (i < 1) throw new Error(`bad --${label} "${spec}" — expected Field=value with a non-empty Field`);
    const field = spec.slice(0, i).trim();
    const value = spec.slice(i + 1).trim();
    if (!field || !value) throw new Error(`bad --${label} "${spec}" — Field and value must both be non-empty`);
    if (field in out) throw new Error(`--${label} sets "${field}" more than once`);
    out[field] = value;
  }
  return out;
}

function loadRows(file) {
  const text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".jsonl")) {
    return text.split("\n").filter((l) => l.trim()).map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(`bad JSON on line ${i + 1} of ${file}`); }
    });
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`${file} is not a JSON array`);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.table) throw new Error("--table is required");
  if (!args.input) throw new Error("--input is required");
  if (!args.map.length) throw new Error("--map is required (repeat the flag per field)");
  if (!["append", "replace", "replace-batch"].includes(args.mode)) {
    throw new Error(`--mode must be append | replace | replace-batch`);
  }

  const map = parsePairs(args.map, "map");
  const consts = parsePairs(args.const, "const");
  const destructive = args.mode !== "append";
  if (args.mode === "replace-batch" && !consts.Batch) {
    throw new Error("--mode replace-batch requires --const \"Batch=...\" to know what to replace");
  }
  // No default for --ruled: the deck table answers in `Section`, a validation
  // packet answers in `Verdict`. A wrong default makes the guard look at a field
  // nobody fills, find it empty, and delete the editor's real answers.
  if (destructive && !args.ruled) {
    throw new Error(`--mode ${args.mode} requires --ruled <field> naming the editor's answer field ` +
      `(comma-separate if the instrument has several)`);
  }
  const ruledFields = destructive ? args.ruled.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const src = path.isAbsolute(args.input) ? args.input : path.join(process.cwd(), args.input);
  const rows = loadRows(src);
  console.log(`loaded ${rows.length} rows from ${path.basename(src)}`);

  // Validate the INPUT before touching the table. An empty file or a mapping that
  // resolves to nothing would otherwise delete the purge set and replace it with
  // zero rows, or with plausible-looking rows holding only constants and Row numbers.
  if (!rows.length) throw new Error(`${path.basename(src)} contains no rows — refusing to run`);
  const deadKeys = Object.entries(map).filter(([, key]) => rows.every((r) => r[key] === undefined));
  for (const [field, key] of deadKeys) {
    const msg = `--map ${field}=${key} matched no source key on any row`;
    if (destructive) throw new Error(`${msg} — refusing to run a destructive mode on a bad mapping`);
    console.log(`WARNING: ${msg} — check the mapping`);
  }

  // One read serves both the purge set and the Row high-water mark. Request `Row`
  // ONLY under --auto-row: Airtable hard-errors on an unknown field name, and a
  // table keyed on something else (e.g. a sheet row id) has no `Row` column.
  const needed = [...(args.autoRow ? ["Row"] : []), "Batch", ...ruledFields]
    .filter((v, i, a) => a.indexOf(v) === i);
  const existing = await fetchAll(args.table, needed);

  let toDelete = [];
  let maxRow = 0;
  for (const rec of existing) {
    const f = rec.fields || {};
    const inPurgeSet =
      args.mode === "replace" ||
      (args.mode === "replace-batch" && selectName(f.Batch) === consts.Batch);
    if (inPurgeSet) toDelete.push(rec);
    else if (typeof f.Row === "number" && f.Row > maxRow) maxRow = f.Row;
  }
  for (const field of ruledFields) {
    assertUnruled(toDelete, field, `"${args.table}" (mode=${args.mode})`);
  }

  const records = rows.map((r, i) => {
    const fields = {};
    for (const [field, key] of Object.entries(map)) {
      const v = r[key];
      // Airtable url/text fields reject empty strings; omit rather than send "".
      if (v === undefined || v === null || v === "") continue;
      fields[field] = typeof v === "string" ? v.slice(0, 100000) : v;
    }
    for (const [field, v] of Object.entries(consts)) fields[field] = v;
    if (args.autoRow) fields.Row = maxRow + 1 + i;
    return { fields };
  });

  const hollow = records.filter((rec) => !Object.keys(map).some((f) => f in rec.fields)).length;
  if (hollow && destructive) {
    throw new Error(`${hollow} of ${records.length} records carry no mapped field — ` +
      `they would be constants and Row numbers only. Refusing to delete.`);
  }
  if (hollow) console.log(`WARNING: ${hollow} records carry no mapped field`);

  console.log(
    `table has ${existing.length} rows · would delete ${toDelete.length} · would create ${records.length}` +
    (args.autoRow ? ` · Row ${maxRow + 1}..${maxRow + records.length}` : "")
  );
  console.log(`sample record: ${JSON.stringify(records[0], null, 2)}`);

  if (!args.apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  // CREATE FIRST, THEN DELETE. A failed create (bad mapping, Airtable validation,
  // rate limit, dropped connection) must never leave the table emptied. The cost is
  // a transient window where old and new rows coexist — recoverable by hand; a
  // half-deleted deck is not. The captured ids in toDelete are still valid after
  // the create because Airtable record ids are stable.
  const done = await createRecords(args.table, records, {
    onProgress: (n, total) => process.stdout.write(`\rpushed ${n}/${total}`),
  });
  console.log(`\ncreated ${done} records`);

  if (toDelete.length) {
    await deleteRecords(args.table, toDelete.map((r) => r.id));
    console.log(`purged ${toDelete.length} superseded rows`);
  }
  console.log(`done — ${done} records in "${args.table}"`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
