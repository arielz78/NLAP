/**
 * B3/B4 — one-time R7 label-deck preparation.
 *
 * B3 strips two position-anchored artifacts from the 111 AllEvents descriptions
 * recovered on 2026-07-27:
 *   1. the event title duplicated at the head;
 *   2. trailing AllEvents recommendation/navigation text.
 *
 * B4 writes the cleaned text into the label deck's `Details` field.
 *
 * This script deliberately does NOT change R1, fetchAllEventsDescriptions.js, or
 * models/sectioning/text_recipe.py. Decision Log §79 reserves the production
 * cleaner for the same future change that wires detail-page fetching into R1.
 *
 * Safety:
 *   - dry-run by default;
 *   - reads the live deck before planning writes;
 *   - refuses to overwrite a Details value that differs from the staged value;
 *   - updates only Details, in Airtable batches of 10;
 *   - re-running after success produces zero updates.
 *
 * Usage:
 *   node models/sectioning/deck/_tmp_b3b4_details_backfill.js
 *   node models/sectioning/deck/_tmp_b3b4_details_backfill.js --write
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../../../NLAP_Airtable.env"),
});

const assert = require("assert");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tblOxYHuAl2yp9Znl";
const WRITE = process.argv.includes("--write");
const BACKFILL = require(path.join(__dirname, "allevents_backfill_2026-07-27.json"));

const collapse = (s) => (s || "").replace(/\s+/g, " ").trim();
const comparable = (s) =>
  collapse(s)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "");

function stripDuplicatedTitle(text, eventTitle) {
  let out = (text || "").trim();
  const title = (eventTitle || "").trim();
  if (!out || !title) return { text: out, removed: false };

  if (out.toLocaleLowerCase("en").startsWith(title.toLocaleLowerCase("en"))) {
    return { text: out.slice(title.length).trim(), removed: true };
  }

  // AllEvents sometimes turns leading emoji into "?" during HTML-to-text
  // extraction. In that case compare the first line without punctuation, then
  // remove that whole title/location line only when it starts with the deck title.
  const firstBreak = out.search(/\r?\n/);
  const firstLine = firstBreak === -1 ? out : out.slice(0, firstBreak);
  const titleKey = comparable(title);
  const lineKey = comparable(firstLine);
  if (titleKey && lineKey.startsWith(titleKey)) {
    return {
      text: (firstBreak === -1 ? "" : out.slice(firstBreak + 1)).trim(),
      removed: true,
    };
  }

  return { text: out, removed: false };
}

function stripTrailingNavigation(text) {
  let out = (text || "").trim();
  const markers = [
    /\s+You may also like the following events from\b[\s\S]*$/i,
    /\s+Also check out other\b[\s\S]*$/i,
  ];
  let removed = false;
  for (const marker of markers) {
    const next = out.replace(marker, "").trim();
    if (next !== out) {
      out = next;
      removed = true;
    }
  }
  return { text: out, removed };
}

function cleanRecoveredDescription(record) {
  const head = stripDuplicatedTitle(record.recoveredText, record.Event);
  const tail = stripTrailingNavigation(head.text);
  return {
    text: tail.text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    titleRemoved: head.removed,
    navigationRemoved: tail.removed,
  };
}

function selfTest() {
  assert.equal(
    stripDuplicatedTitle("Example Event\n\nReal description.", "Example Event").text,
    "Real description.",
  );
  assert.equal(
    stripDuplicatedTitle("? Example Event\n\nReal description.", "🎲 Example Event").text,
    "Real description.",
  );
  assert.equal(
    stripDuplicatedTitle(
      "Event Cancelled - Example Event\n\nReal description.",
      "Example Event",
    ).removed,
    false,
  );
  assert.equal(
    stripTrailingNavigation(
      "Real description.\nYou may also like the following events from X: Other Event in Quebec Also check out other Workshops in Markham.",
    ).text,
    "Real description.",
  );
  assert.equal(
    stripTrailingNavigation("Real description.\nAlso check out other Sports events in Vaughan.").text,
    "Real description.",
  );
}

async function airtable(pathAndQuery, options = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${pathAndQuery}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchLiveDeck() {
  const rows = [];
  let offset;
  do {
    const query = new URLSearchParams();
    query.append("fields[]", "Row");
    query.append("fields[]", "Event");
    query.append("fields[]", "Link");
    query.append("fields[]", "Details");
    if (offset) query.set("offset", offset);
    const page = await airtable(`${BASE_ID}/${TABLE_ID}?${query}`);
    rows.push(...page.records);
    offset = page.offset;
  } while (offset);
  return rows;
}

async function main() {
  selfTest();
  if (!BASE_ID || !process.env.AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_BASE_ID / AIRTABLE_API_KEY not loaded");
  }

  const recovered = BACKFILL.filter(
    (r) => r.recoveredText && r.idMatched && !r.error,
  );
  assert.equal(recovered.length, 111, "staged recovered-description count changed");

  const live = await fetchLiveDeck();
  const byRow = new Map(live.map((r) => [r.fields.Row, r]));
  const updates = [];
  const unchanged = [];
  const conflicts = [];
  const stats = { titleRemoved: 0, navigationRemoved: 0 };

  for (const staged of recovered) {
    const current = byRow.get(staged.Row);
    if (!current) {
      conflicts.push({ Row: staged.Row, reason: "row absent from live deck" });
      continue;
    }
    if (current.fields.Link !== staged.Link) {
      conflicts.push({ Row: staged.Row, reason: "live Link differs from staged Link" });
      continue;
    }

    const cleaned = cleanRecoveredDescription(staged);
    if (!cleaned.text) {
      conflicts.push({ Row: staged.Row, reason: "cleaning produced empty text" });
      continue;
    }
    if (cleaned.titleRemoved) stats.titleRemoved++;
    if (cleaned.navigationRemoved) stats.navigationRemoved++;

    const liveDetails = current.fields.Details || "";
    if (liveDetails === cleaned.text) {
      unchanged.push(staged.Row);
      continue;
    }
    if (collapse(liveDetails) !== collapse(staged.deckDetails || "")) {
      conflicts.push({
        Row: staged.Row,
        reason: "live Details changed since the staged pull",
      });
      continue;
    }

    updates.push({
      id: current.id,
      Row: staged.Row,
      Event: staged.Event,
      fields: { Details: cleaned.text },
    });
  }

  console.log(`Mode: ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`Recovered descriptions: ${recovered.length}`);
  console.log(`Title artifacts removed: ${stats.titleRemoved}`);
  console.log(`Navigation artifacts removed: ${stats.navigationRemoved}`);
  console.log(`Already current: ${unchanged.length}`);
  console.log(`Planned Details updates: ${updates.length}`);
  console.log(`Conflicts: ${conflicts.length}`);

  if (conflicts.length) {
    console.log(JSON.stringify(conflicts, null, 2));
    throw new Error("Refusing all writes because conflicts were found");
  }

  for (const sample of updates.slice(0, 3)) {
    console.log(
      `\nRow ${sample.Row} — ${sample.Event}\n${sample.fields.Details.slice(0, 300)}`,
    );
  }

  if (!WRITE) {
    console.log("\nDRY RUN — nothing written. Re-run with --write after review.");
    return;
  }

  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10).map(({ id, fields }) => ({ id, fields }));
    const result = await airtable(`${BASE_ID}/${TABLE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch }),
    });
    console.log(`Wrote ${result.records.length} (${Math.min(i + 10, updates.length)}/${updates.length})`);
  }
}

module.exports = {
  cleanRecoveredDescription,
  stripDuplicatedTitle,
  stripTrailingNavigation,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
