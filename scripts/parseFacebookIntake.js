// parseFacebookIntake.js
// Pure parser for the Facebook manual-intake staging blob (FacebookIntake.Events).
// Turns the single tab-separated table the client pastes (output of the
// VB_FACEBOOK_INTAKE ChatGPT prompt) into canonical Candidate rows ready to upsert.
//
// Design (see Execution_Log 2026-06-21):
//  - Bad-row policy: SKIP malformed rows, ingest the good ones, collect diagnostics.
//    A wrong column count, a missing Title, or a *present-but-unparseable* StartDate
//    drops just that row. A blank StartDate is allowed through (event lands dateless;
//    the downstream DateWindow filter handles it). A malformed EndDate / out-of-set City
//    is a SOFT error — the field is nulled but the row survives, because StartDate is
//    what matters and we don't lose an event over a secondary field.
//  - UniqueEventID uses the SAME norm() as updateUniqueEventIDs.js / the "Make
//    UniqueEventID" n8n node. Any divergence recreates the duplicate-ID bug. If you
//    change norm() here, change it in both other places too.
//
// This module has no Airtable/n8n dependency so it can be unit-tested locally; the
// parseFacebookEvents() body is also what goes into the n8n Code node.

// --- canonical normalization (mirror of updateUniqueEventIDs.js v2) -----------
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function straighten(s) {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[  -  ]/g, " ")
    .replace(/…/g, "...");
}
function norm(s) {
  return straighten(decodeEntities((s || "").toString()))
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function computeUniqueEventID(title, startDate) {
  return `${norm(title)}|${startDate ?? ""}`;
}

// --- field validators ---------------------------------------------------------
const COLUMNS = ["Title", "StartDate", "EndDate", "LocationName", "City", "Link"];
const ALLOWED_CITIES = ["Vaughan", "Markham", "Richmond Hill", "Toronto"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidISODate(s) {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function matchCity(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  const hit = ALLOWED_CITIES.find((c) => c.toLowerCase() === v.toLowerCase());
  return hit || null; // null = present but out-of-set (soft error)
}

// --- main parser --------------------------------------------------------------
// Returns { rows: [canonical Candidate objects], errors: [string], softNotes: [string] }
function parseFacebookEvents(eventsText) {
  const rows = [];
  const errors = [];
  const softNotes = [];
  const seen = new Set(); // intra-batch dedup by UniqueEventID

  // NB: do NOT trim whole lines — a trailing tab marks an empty final cell (blank Link)
  // and trimming would drop it, corrupting the column count. Trim cells individually below.
  const lines = (eventsText || "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    errors.push("Empty submission — no rows.");
    return { rows, errors, softNotes };
  }

  // Drop a header row if present (first line whose first cell is literally "Title").
  let start = 0;
  if (lines[0].split("\t")[0].trim().toLowerCase() === "title") start = 1;

  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    let cells = lines[i].split("\t").map((c) => c.trim());

    // Tolerate trailing-tab nondeterminism from the LLM (see study 2026-06-22):
    // a row may arrive with too FEW cells (missing trailing empty Link) or too MANY
    // (an extra trailing tab added on top of the empty Link). Both are the same
    // benign whitespace artifact, so we reconcile to COLUMNS.length deterministically:
    //   - drop extra trailing cells ONLY if they are empty (a non-empty 7th cell is
    //     real data corruption and must still fail loudly);
    //   - pad short rows with empty trailing cells.
    // This is the guarantee; the prompt's "trailing tab" rule is only a nudge.
    while (cells.length > COLUMNS.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length > COLUMNS.length) {
      errors.push(`Row ${lineNo}: ${cells.length} columns with non-empty overflow — skipped.`);
      continue;
    }
    while (cells.length < COLUMNS.length) cells.push("");

    let [title, startDate, endDate, location, city, link] = cells;

    if (!title) {
      errors.push(`Row ${lineNo}: missing Title — skipped.`);
      continue;
    }
    if (startDate && !isValidISODate(startDate)) {
      errors.push(`Row ${lineNo} ("${title}"): bad StartDate "${startDate}" — skipped.`);
      continue;
    }
    if (endDate && !isValidISODate(endDate)) {
      softNotes.push(`Row ${lineNo} ("${title}"): bad EndDate "${endDate}" — cleared.`);
      endDate = "";
    }
    const cityChecked = matchCity(city);
    if (cityChecked === null) {
      softNotes.push(`Row ${lineNo} ("${title}"): City "${city}" not in allowed set — cleared.`);
      city = "";
    } else {
      city = cityChecked;
    }

    const uid = computeUniqueEventID(title, startDate);
    if (seen.has(uid)) {
      softNotes.push(`Row ${lineNo} ("${title}"): duplicate within submission — skipped.`);
      continue;
    }
    seen.add(uid);

    const row = {
      "Event Title": title,
      "Source": "Facebook",
      "UniqueEventID": uid,
    };
    if (startDate) row["Start Date"] = startDate;
    if (endDate) row["End Date"] = endDate;
    if (location) row["LocationName"] = location;
    if (city) row["City"] = city;
    if (link) row["URL"] = link;

    rows.push(row);
  }

  return { rows, errors, softNotes };
}

module.exports = { parseFacebookEvents, computeUniqueEventID, norm };

// --- local test harness: `node scripts/parseFacebookIntake.js` ----------------
if (require.main === module) {
  const cases = {
    "happy path + header + blanks": [
      "Title\tStartDate\tEndDate\tLocationName\tCity\tLink",
      "Cirque Italia\t2026-06-25\t\tCNE Grounds\tToronto\thttps://facebook.com/events/670",
      "The Mom Market\t2026-06-21\t\tPromenade Mall\tVaughan\t",
      "Winter Lights\t2026-06-22\t2026-06-29\tMcMichael\tVaughan\t",
    ].join("\n"),
    "bad rows: wrong cols, missing title, bad date": [
      "Title\tStartDate\tEndDate\tLocationName\tCity\tLink",
      "Too Few Cols\t2026-06-25\tVaughan",
      "\t2026-06-25\t\tVenue\tVaughan\t",
      "Bad Date Event\t06/25/2026\t\tVenue\tVaughan\t",
      "Good One\t2026-06-25\t\tVenue\tMarkham\t",
    ].join("\n"),
    "soft errors: bad end date, weird city, dup": [
      "Festival X\t2026-06-25\tNOTADATE\tPlace\tHamilton\t",
      "Festival X\t2026-06-25\t\tPlace\tVaughan\t",
      "Dateless Event\t\t\tPlace\tVaughan\t",
    ].join("\n"),
  };
  for (const [name, blob] of Object.entries(cases)) {
    const out = parseFacebookEvents(blob);
    console.log(`\n=== ${name} ===`);
    console.log(`rows (${out.rows.length}):`, JSON.stringify(out.rows, null, 1));
    if (out.errors.length) console.log("errors:", out.errors);
    if (out.softNotes.length) console.log("softNotes:", out.softNotes);
  }
}
