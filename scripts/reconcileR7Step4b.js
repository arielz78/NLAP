/**
 * Reconcile the 11 Step-4b NEVER judgments into the R7 Label Deck.
 *
 * Dry-run by default. Pass --apply only after reviewing the printed manifest.
 * The write is idempotent: each row must be either in its exact pre-write state or
 * already in its exact desired state. Any third state aborts before PATCHing.
 *
 * Usage:
 *   node scripts/reconcileR7Step4b.js
 *   node scripts/reconcileR7Step4b.js --apply
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../NLAP_Airtable.env"),
  quiet: true,
});

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const APPLY = process.argv.includes("--apply");
const CHUNK_SIZE = 10;

const WRONG_FIT = "wrong fit / not our audience";
const B2B = "B2B / professional dev";

const CORRECTIONS = Object.freeze([
  { position: 2, row: 125, title: "Free Workshop: Navigating Grief & Loss", from: "Golden", reason: WRONG_FIT, reasoning: "NEVER. TOO NEGATIVE" },
  { position: 6, row: 304, title: "De-stressing The Downsizing Process", from: "Golden", reason: WRONG_FIT, reasoning: "NEVER. too niche." },
  { position: 10, row: 22, title: "Canadian Blood Services, Donor Centre", from: "Families", reason: B2B, reasoning: "NEVER. not entertainment." },
  { position: 13, row: 333, title: "Downsizing & Decluttering", from: "Golden", reason: WRONG_FIT, reasoning: "NEVER. newsletter doens't do self help that muhc" },
  { position: 19, row: 414, title: "Secret Saturdays | Each & Every Saturday | Aurea Lounge", from: "Couples", reason: WRONG_FIT, reasoning: "needed link. NEVER. seems more like a club scene, different age group than demographic." },
  { position: 22, row: 213, title: "Conversations with my Father: An Intergenerational Program", from: "Couples", reason: WRONG_FIT, reasoning: "NEVER. it's a bit of a heavy topic potentially, not for newsletter audience" },
  { position: 23, row: 256, title: "Wedbiz Society Socials Cocktails & Conversations :\"The Prelude\"", from: "Couples", reason: B2B, reasoning: "needed link. NEVER, people don't like wedding, too niche." },
  { position: 24, row: 151, title: "Voices of Tomorrow: Toronto CASG TEDEd Student Talks Showcase", from: "Golden", reason: WRONG_FIT, reasoning: "NEVER. this isn't entertainment, too niche." },
  { position: 26, row: 399, title: "Black Coffee in Toronto", from: "Golden", reason: WRONG_FIT, reasoning: "needed link. NEVER. not right fit for audience" },
  { position: 29, row: 270, title: "NEW: Why Do People Fall in Love with ChatGPT?", from: "Golden", reason: WRONG_FIT, reasoning: "NEVER. too niche" },
  { position: 30, row: 62, title: "YouTube AI Production Studio (Aug 10-14:AM)", from: "Families", reason: WRONG_FIT, reasoning: "NEVER. too niche" },
]);

function sameReasons(actual, expected) {
  const values = Array.isArray(actual) ? actual : actual ? [actual] : [];
  return JSON.stringify([...values].sort()) === JSON.stringify([...expected].sort());
}

function stateOf(fields, correction) {
  const oldState =
    fields.Section === correction.from &&
    sameReasons(fields.NoneReason, []) &&
    !String(fields.NoneReasoning || "").trim();
  const desiredState =
    fields.Section === "None" &&
    sameReasons(fields.NoneReason, [correction.reason]) &&
    String(fields.NoneReasoning || "") === correction.reasoning;
  if (oldState) return "pending";
  if (desiredState) return "already-applied";
  return "conflict";
}

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

async function fetchTargets() {
  const wanted = new Set(CORRECTIONS.map((item) => item.row));
  const found = [];
  for (let offset; ; ) {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    for (const field of ["Row", "Event", "Section", "NoneReason", "NoneReasoning", "Flag", "Label", "Slice"]) {
      url.searchParams.append("fields[]", field);
    }
    if (offset) url.searchParams.set("offset", offset);
    const body = await airtable(url);
    for (const record of body.records) {
      if (wanted.has(record.fields.Row)) found.push(record);
    }
    if (!body.offset) break;
    offset = body.offset;
  }
  return found;
}

function validate(records) {
  if (CORRECTIONS.length !== 11 || new Set(CORRECTIONS.map((item) => item.row)).size !== 11) {
    throw new Error("Correction fixture must contain exactly 11 unique rows");
  }
  const byRow = new Map(records.map((record) => [record.fields.Row, record]));
  if (byRow.size !== CORRECTIONS.length) {
    const missing = CORRECTIONS.filter((item) => !byRow.has(item.row)).map((item) => item.row);
    throw new Error(`Expected 11 unique Airtable rows; found ${byRow.size}; missing=${missing.join(",")}`);
  }

  return CORRECTIONS.map((correction) => {
    const record = byRow.get(correction.row);
    if (record.fields.Event !== correction.title) {
      throw new Error(`r${correction.row} title drift: expected ${JSON.stringify(correction.title)}, got ${JSON.stringify(record.fields.Event)}`);
    }
    const state = stateOf(record.fields, correction);
    if (state === "conflict") {
      throw new Error(
        `r${correction.row} is neither pre-write nor desired state: ` +
        JSON.stringify({
          Section: record.fields.Section,
          NoneReason: record.fields.NoneReason || [],
          NoneReasoning: record.fields.NoneReasoning || "",
        })
      );
    }
    return { correction, record, state };
  });
}

function printManifest(items) {
  console.log(`Step 4b Airtable manifest — ${APPLY ? "APPLY" : "DRY RUN"}`);
  for (const { correction: c, record, state } of items) {
    console.log(
      [
        `r${c.row}`,
        record.id,
        `position=${c.position}`,
        `state=${state}`,
        `Section:${c.from}->None`,
        `NoneReason:${c.reason}`,
        `Slice:${record.fields.Slice || "(blank)"}`,
        `title=${c.title}`,
      ].join(" | ")
    );
  }
  const pending = items.filter((item) => item.state === "pending").length;
  const already = items.length - pending;
  console.log(`TOTAL ${items.length} | pending ${pending} | already-applied ${already}`);
  console.log("Untouched fields: Event, Flag, Label, Slice");
}

async function apply(items) {
  const pending = items.filter((item) => item.state === "pending");
  for (let index = 0; index < pending.length; index += CHUNK_SIZE) {
    const records = pending.slice(index, index + CHUNK_SIZE).map(({ correction: c, record }) => ({
      id: record.id,
      fields: {
        Section: "None",
        NoneReason: [c.reason],
        NoneReasoning: c.reasoning,
      },
    }));
    await airtable(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ records }),
    });
  }
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");
  const before = validate(await fetchTargets());
  printManifest(before);
  if (!APPLY) {
    console.log("DRY RUN ONLY — pass --apply after reviewing this manifest.");
    return;
  }
  await apply(before);
  const after = validate(await fetchTargets());
  const incomplete = after.filter((item) => item.state !== "already-applied");
  if (incomplete.length) {
    throw new Error(`Post-write verification failed for rows: ${incomplete.map((item) => item.correction.row).join(",")}`);
  }
  console.log(`VERIFIED — ${after.length}/11 corrections are in their exact desired state.`);
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
