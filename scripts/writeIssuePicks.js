// writeIssuePicks.js
// Writes a file of editor-confirmed picks to IssueItems (ship-plan item 3, #149).
//
//   node scripts/writeIssuePicks.js <picks.json> --issue YYYY-MM-DD                    dry run (default)
//   node scripts/writeIssuePicks.js <picks.json> --issue YYYY-MM-DD --apply            create the rows
//   node scripts/writeIssuePicks.js <picks.json> --issue YYYY-MM-DD --apply --ensure-issue
//   node scripts/writeIssuePicks.js <picks.json> --issue YYYY-MM-DD --lock             after generateBlurbs
//
// The picks file is { picks: [{ IssueDate, ItemID, Section, Slot }] } (allocation.json from
// scripts/issue-build/) or a bare array of the same objects — the shape buildIssues() returns.
// A pick may instead carry OwnEvent: { title, url, date, description? } and no ItemID: an event the
// editor typed into a slot he filled himself (Decision_Log §113, written by applySubmission.js).
//
// Contract:
//   - Create-only. It never deletes and never updates an existing row in any mode; --lock is the one
//     PATCH, and it touches only the record IDs this writer created.
//   - Refuses if a row already exists for the same (date, section, slot), so a repeat --apply refuses.
//   - Refuses if any row already on the issue is unlocked: generateBlurbs.js rewrites every unlocked
//     row for the date, so that row's copy would be replaced by the step that follows this one.
//   - Every refusal happens before the first write.
//   - --apply writes a receipt next to the picks file (<picks>.write_receipt.json) holding the created
//     record IDs. --lock reads it. A receipt is never overwritten.
//   - Trust Me Recipe is manual only: a picks file containing it is refused.
//   - An own event is linked to the Candidates row with the same UniqueEventID (title|date, R1's key)
//     when one exists; otherwise --apply creates one with Source "Editor" before the IssueItems rows,
//     and records it in the receipt. It never updates an existing Candidates row.

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { TABLES, airtableFetch, fetchAllRecords } = require("./connectAirtable.js");
const { QUOTAS } = require("./buildIssues.js");
// R1's UniqueEventID normalization; the same norm() the n8n node and the Facebook intake use
const { computeUniqueEventID } = require("./parseFacebookIntake.js");

// What an own event's Candidates row carries in Source (Decision_Log §113)
const OWN_EVENT_SOURCE = "Editor";

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const MANUAL_ONLY_SECTION = "Trust Me Recipe";

// Same values as connectAirtable.js (not exported there)
const SECTION_ORDER = {
  "For Families":          1,
  "For Couples":           2,
  "For Golden Age Readers":3,
  "Local Aroma":           4,
  "Trust Me Recipe":       5,
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const USAGE = "Usage: node scripts/writeIssuePicks.js <picks.json> --issue YYYY-MM-DD [--apply] [--ensure-issue] [--lock]";

function parseArgs(argv) {
  const opts = { picksFile: null, issueDate: null, apply: false, ensureIssue: false, lock: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply")             opts.apply = true;
    else if (arg === "--ensure-issue") opts.ensureIssue = true;
    else if (arg === "--lock")         opts.lock = true;
    else if (arg === "--issue")        opts.issueDate = argv[++i] ?? null;
    else if (arg.startsWith("--"))     throw new Error(`Unknown option ${arg}\n${USAGE}`);
    else positional.push(arg);
  }
  // The issue date may also be given as the second positional argument
  opts.picksFile = positional[0] ?? null;
  opts.issueDate ??= positional[1] ?? null;

  if (!opts.picksFile) throw new Error(`Missing picks file\n${USAGE}`);
  if (!opts.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(opts.issueDate)) {
    throw new Error(`Missing or malformed issue date (expected YYYY-MM-DD)\n${USAGE}`);
  }
  if (opts.lock && (opts.apply || opts.ensureIssue)) {
    throw new Error("--lock runs on its own, after generateBlurbs — do not combine it with --apply or --ensure-issue");
  }
  opts.picksFile = path.resolve(opts.picksFile);
  return opts;
}

// ---------------------------------------------------------------------------
// Picks file
// ---------------------------------------------------------------------------

// Byte-identical to the Name connectAirtable.js writes. generateBlurbs.js and pushToBeehiiv.js
// both select an issue's rows by searching Name for the date, so this is load-bearing.
function itemName(pick) {
  return `${pick.Section} Slot ${pick.Slot} — ${pick.IssueDate}`;
}

function receiptPathFor(picksFile) {
  const { dir, name } = path.parse(picksFile);
  return path.join(dir, `${name}.write_receipt.json`);
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function ownEventProblems(event) {
  if (!event || typeof event !== "object") return ["is not an object"];
  const wrong = [];
  if (typeof event.title !== "string" || !event.title.trim()) wrong.push("has no title");
  if (typeof event.url !== "string" || !/^https?:\/\/\S+$/i.test(event.url.trim())) wrong.push(`url ${JSON.stringify(event.url)} is not an http(s) URL`);
  if (!isValidIsoDate(event.date)) wrong.push(`date ${JSON.stringify(event.date)} is not YYYY-MM-DD`);
  if (event.description !== undefined && typeof event.description !== "string") wrong.push("description is not text");
  return wrong;
}

// Reads and validates the picks file. Throws one error naming every problem; makes no requests.
function readPicks(picksFile, issueDate) {
  if (!fs.existsSync(picksFile)) throw new Error(`Picks file not found: ${picksFile}`);
  const raw = fs.readFileSync(picksFile);
  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch (err) {
    throw new Error(`Picks file is not valid JSON: ${picksFile} — ${err.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.picks;
  if (!Array.isArray(list)) throw new Error(`Picks file has no "picks" array: ${picksFile}`);
  if (list.length === 0) throw new Error(`Picks file contains no picks: ${picksFile}`);

  const problems = [];
  const seenSlots = new Set();
  const seenItems = new Set();
  const seenOwn = new Map();
  const picks = list.map((p, i) => {
    const label = `pick ${i + 1}`;
    const isOwn = p?.OwnEvent !== undefined;
    const pick = isOwn
      ? { IssueDate: p?.IssueDate, OwnEvent: p.OwnEvent, Section: p?.Section, Slot: p?.Slot }
      : { IssueDate: p?.IssueDate, ItemID: p?.ItemID, Section: p?.Section, Slot: p?.Slot };

    if (pick.Section === MANUAL_ONLY_SECTION) {
      problems.push(`${label}: ${MANUAL_ONLY_SECTION} is manual only and is never written by this script`);
    } else if (!(pick.Section in QUOTAS)) {
      problems.push(`${label}: unknown Section ${JSON.stringify(pick.Section)}`);
    } else if (!Number.isInteger(pick.Slot) || pick.Slot < 1 || pick.Slot > QUOTAS[pick.Section].max) {
      problems.push(`${label}: Slot ${JSON.stringify(pick.Slot)} is outside 1–${QUOTAS[pick.Section].max} for ${pick.Section}`);
    }
    if (pick.IssueDate !== issueDate) {
      problems.push(`${label}: IssueDate ${JSON.stringify(pick.IssueDate)} does not match --issue ${issueDate}`);
    }
    if (isOwn) {
      if (p?.ItemID !== undefined) problems.push(`${label}: has both an ItemID and an OwnEvent`);
      const wrong = ownEventProblems(pick.OwnEvent);
      if (wrong.length) {
        problems.push(`${label}: OwnEvent ${wrong.join("; ")}`);
      } else {
        const uid = computeUniqueEventID(pick.OwnEvent.title, pick.OwnEvent.date);
        if (seenOwn.has(uid)) problems.push(`${label}: same event as ${seenOwn.get(uid)} (${uid})`);
        seenOwn.set(uid, label);
      }
    } else if (typeof pick.ItemID !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(pick.ItemID)) {
      problems.push(`${label}: ItemID ${JSON.stringify(pick.ItemID)} is not an Airtable record ID`);
    }

    const slotKey = `${pick.Section}|${pick.Slot}`;
    if (seenSlots.has(slotKey)) problems.push(`${label}: ${pick.Section} Slot ${pick.Slot} appears more than once in the file`);
    seenSlots.add(slotKey);
    if (!isOwn) {
      if (seenItems.has(pick.ItemID)) problems.push(`${label}: ItemID ${pick.ItemID} appears more than once in the file`);
      seenItems.add(pick.ItemID);
    }

    return pick;
  });

  if (problems.length) {
    throw new Error(`Refusing picks file ${picksFile} — nothing was written:\n  ${problems.join("\n  ")}`);
  }
  return { picks, sha256: crypto.createHash("sha256").update(raw).digest("hex") };
}

// ---------------------------------------------------------------------------
// Fetch stage (read-only)
// ---------------------------------------------------------------------------

// Not connectAirtable's fetchIssues(): that one drops past dates and returns a map of every
// upcoming issue. This needs the records for one date, including none or a duplicate.
async function fetchIssueRecords(issueDate) {
  const records = await fetchAllRecords(TABLES.issues);
  return records.filter((r) => r.fields["IssueDate"] === issueDate);
}

// Every IssueItems row belonging to the date: linked to its Issues record, or named for it.
// Name is checked as well as the link because the downstream scripts select rows by Name.
async function fetchRowsForDate(issueDate, issueId) {
  const records = await fetchAllRecords(TABLES.issueItems);
  return records.flatMap((r) => {
    const issueLinked = r.fields["Issue"];
    const name = r.fields["Name"] ?? "";
    const linked = issueId !== null && Array.isArray(issueLinked) && issueLinked.includes(issueId);
    if (!linked && !name.endsWith(` — ${issueDate}`)) return [];
    const candidate = r.fields["Candidate"];
    return [{
      airtableId: r.id,
      Name:       name,
      ItemID:     Array.isArray(candidate) && candidate.length ? candidate[0] : null,
      Section:    r.fields["Section"] ?? "",
      Slot:       r.fields["Slot"] ?? 0,
      locked:     r.fields["Lock"] === true,
    }];
  });
}

// Fetched by record ID, not through the R3 eligible view: confirmed picks are not required to be
// Status=Approved, so the view connectAirtable's fetchCandidates() reads would miss them.
async function fetchPickCandidates(picks) {
  const ids = picks.filter((p) => !p.OwnEvent).map((p) => p.ItemID);
  const map = {};
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const formula = `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const records = await fetchAllRecords(TABLES.candidates, { filterByFormula: formula });
    for (const r of records) {
      map[r.id] = {
        id:           r.id,
        title:        r.fields["Event Title"] ?? "",
        "Start Date": r.fields["Start Date"] ?? null,
        LocationName: r.fields["LocationName"] ?? "",
        URL:          r.fields["URL"] ?? null,
      };
    }
  }
  return map;
}

// An Airtable formula string literal: double-quoted, with backslash and double quote escaped
function formulaString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Resolves each own event to the Candidates row R1 (or an earlier week) already holds under the same
// UniqueEventID, or plans a new one. Read-only. Returns [{ pick, uid, existingId | null, fields }].
async function resolveOwnEvents(picks) {
  const own = picks.filter((p) => p.OwnEvent);
  const existing = {};
  for (let i = 0; i < own.length; i += 20) {
    const batch = own.slice(i, i + 20).map((p) => computeUniqueEventID(p.OwnEvent.title, p.OwnEvent.date));
    const formula = `OR(${batch.map((uid) => `{UniqueEventID}=${formulaString(uid)}`).join(",")})`;
    const records = await fetchAllRecords(TABLES.candidates, { filterByFormula: formula });
    for (const r of records) existing[r.fields["UniqueEventID"]] ??= r.id;
  }
  return own.map((pick) => {
    const { title, url, date, description } = pick.OwnEvent;
    const uid = computeUniqueEventID(title, date);
    const fields = {
      "Event Title":  title.trim(),
      Source:         OWN_EVENT_SOURCE,
      UniqueEventID:  uid,
      "Start Date":   date,
      URL:            url.trim(),
      ...(description?.trim() ? { DescriptionRaw: description.trim() } : {}),
    };
    return { pick, uid, existingId: existing[uid] ?? null, fields };
  });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function findConflicts(picks, existingRows) {
  const conflicts = [];
  for (const pick of picks) {
    const name = itemName(pick);
    for (const row of existingRows) {
      if ((row.Section === pick.Section && row.Slot === pick.Slot) || row.Name === name) {
        conflicts.push({ name, airtableId: row.airtableId, locked: row.locked });
      }
    }
  }
  return conflicts;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Non-blocking. The picks are editor-confirmed, so the allocator's rules are reported, not enforced.
function collectWarnings(picks, candidateMap, existingRows, issueDate) {
  const warnings = [];
  const [y, m, d] = issueDate.split("-").map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 4) warnings.push(`${issueDate} is not a Thursday`);

  const windowStart = addDays(issueDate, 1);
  const windowEnd   = addDays(issueDate, 10);
  const venueSeen = {};
  for (const pick of picks) {
    // An own event has only a date to check: no Candidates record yet and no venue
    if (pick.OwnEvent) {
      if (pick.OwnEvent.date < windowStart || pick.OwnEvent.date > windowEnd) {
        warnings.push(`${itemName(pick)}: own event date ${pick.OwnEvent.date} is outside the issue window ${windowStart} to ${windowEnd}`);
      }
      continue;
    }
    const c = candidateMap[pick.ItemID];
    const start = c["Start Date"] ? String(c["Start Date"]).slice(0, 10) : null;
    if (!start) {
      warnings.push(`${itemName(pick)}: candidate has no Start Date`);
    } else if (start < windowStart || start > windowEnd) {
      warnings.push(`${itemName(pick)}: Start Date ${start} is outside the issue window ${windowStart} to ${windowEnd}`);
    }
    if (!c.URL) warnings.push(`${itemName(pick)}: candidate has no URL`);
    if (c.LocationName) {
      const key = `${pick.Section}|${c.LocationName}`;
      if (venueSeen[key]) warnings.push(`${itemName(pick)}: same venue as ${venueSeen[key]} (${c.LocationName})`);
      venueSeen[key] ??= itemName(pick);
    }
    const already = existingRows.find((row) => row.ItemID === pick.ItemID);
    if (already) warnings.push(`${itemName(pick)}: candidate ${pick.ItemID} is already on this issue as ${already.Name}`);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Write stage
// ---------------------------------------------------------------------------

function fmtLocalDateTime() {
  return new Date().toLocaleString("en-CA", {
    year:   "numeric",
    month:  "short",
    day:    "numeric",
    hour:   "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Same fields, in the same shape, as connectAirtable's writeIssueItems(). An own event's pick has no
// ItemID until its Candidates row exists; ownIds maps its Name to that record (placeholder in a dry run).
function buildRows(picks, issueId, candidateMap, ownIds = {}) {
  const addedAt = fmtLocalDateTime();
  return picks.map((pick) => {
    const candidateId = pick.OwnEvent ? ownIds[itemName(pick)] : pick.ItemID;
    return {
      fields: {
        Name:                 itemName(pick),
        Section:              pick.Section,
        Slot:                 pick.Slot,
        SectionOrder:         SECTION_ORDER[pick.Section] ?? 99,
        Issue:                [issueId],
        Candidate:            [candidateId],
        CandidateStartDate:   pick.OwnEvent ? pick.OwnEvent.date : (candidateMap[pick.ItemID]["Start Date"] ?? null),
        CandidateURL:         pick.OwnEvent ? pick.OwnEvent.url.trim() : (candidateMap[pick.ItemID].URL ?? null),
        "Added to Base":      addedAt,
      },
    };
  });
}

// Creates the planned own-event Candidates rows (Airtable max 10 per request). The receipt is saved
// after every batch, so a failure partway still records what was created. typecast lets Airtable
// accept "Editor" in Source if the option does not exist yet.
async function createOwnCandidates(planned, receiptPath, receipt) {
  for (let i = 0; i < planned.length; i += 10) {
    const batch = planned.slice(i, i + 10);
    try {
      const result = await airtableFetch(`${BASE_ID}/${TABLES.candidates}`, {
        method: "POST",
        body: JSON.stringify({ records: batch.map((o) => ({ fields: o.fields })), typecast: true }),
      });
      if (result.records.length !== batch.length) {
        throw new Error(`Airtable returned ${result.records.length} records for a batch of ${batch.length}`);
      }
      result.records.forEach((r, j) => {
        receipt.candidates.push({ id: r.id, UniqueEventID: batch[j].uid, Name: itemName(batch[j].pick) });
      });
      saveReceipt(receiptPath, receipt);
    } catch (err) {
      saveReceipt(receiptPath, receipt);
      console.error(
        `Candidates batch ${Math.floor(i / 10) + 1} failed. ` +
        `${receipt.candidates.length} of ${planned.length} own-event Candidates already created ` +
        `(${receipt.candidates.map((c) => c.id).join(", ")}); no IssueItems written. Partial receipt: ${receiptPath}`
      );
      throw err;
    }
  }
}

async function createIssueRecord(issueDate) {
  const result = await airtableFetch(`${BASE_ID}/${TABLES.issues}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: { IssueDate: issueDate } }] }),
  });
  return result.records[0].id;
}

function saveReceipt(receiptPath, receipt) {
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
}

// connectAirtable's writeIssueItems() returns a count only; the receipt needs the record IDs,
// and it is saved after every batch so a mid-run failure still records what was created.
async function createRows(rows, receiptPath, receipt) {
  // Airtable batch create: max 10 records per request
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    try {
      const result = await airtableFetch(`${BASE_ID}/${TABLES.issueItems}`, {
        method: "POST",
        body: JSON.stringify({ records: batch }),
      });
      if (result.records.length !== batch.length) {
        throw new Error(`Airtable returned ${result.records.length} records for a batch of ${batch.length}`);
      }
      // Airtable returns created records in request order
      result.records.forEach((r, j) => {
        receipt.rows.push({
          id:        r.id,
          Name:      batch[j].fields.Name,
          Section:   batch[j].fields.Section,
          Slot:      batch[j].fields.Slot,
          Candidate: batch[j].fields.Candidate[0],
        });
      });
      saveReceipt(receiptPath, receipt);
    } catch (err) {
      console.error(
        `Batch ${Math.floor(i / 10) + 1} failed. ` +
        `${receipt.rows.length} of ${rows.length} records already created. ` +
        `Created IDs: ${receipt.rows.map((r) => r.id).join(", ")}. ` +
        `Partial receipt: ${receiptPath}`
      );
      throw err;
    }
  }
  receipt.complete = true;
  saveReceipt(receiptPath, receipt);
}

// ---------------------------------------------------------------------------
// Lock stage
// ---------------------------------------------------------------------------

async function lockWrittenRows(opts) {
  const receiptPath = receiptPathFor(opts.picksFile);
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`Refusing to lock: no receipt at ${receiptPath}. --lock only locks rows a previous --apply wrote.`);
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  if (receipt.issueDate !== opts.issueDate) {
    throw new Error(`Refusing to lock: receipt is for issue ${receipt.issueDate}, not ${opts.issueDate}`);
  }
  if (receipt.complete !== true) {
    throw new Error(`Refusing to lock: receipt ${receiptPath} records a write that did not finish. Nothing was locked.`);
  }

  console.log("Fetching IssueItems...");
  const records = await fetchAllRecords(TABLES.issueItems);
  const byId = Object.fromEntries(records.map((r) => [r.id, r]));

  const problems = [];
  const toLock = [];
  for (const row of receipt.rows) {
    const current = byId[row.id];
    if (!current) {
      problems.push(`${row.id} (${row.Name}) no longer exists`);
    } else if (current.fields["Name"] !== row.Name) {
      problems.push(`${row.id} was written as "${row.Name}" and is now "${current.fields["Name"]}"`);
    } else if (current.fields["Lock"] === true) {
      console.log(`Already locked — left untouched: ${row.id} ${row.Name}`);
    } else {
      if (!current.fields["Description"]) console.warn(`Warning: ${row.Name} has no Description — generateBlurbs skips locked rows`);
      toLock.push(row);
    }
  }
  if (problems.length) {
    throw new Error(`Refusing to lock — nothing was locked:\n  ${problems.join("\n  ")}`);
  }

  // Airtable batch update: max 10 records per request
  const lockedIds = [];
  for (let i = 0; i < toLock.length; i += 10) {
    const batch = toLock.slice(i, i + 10);
    await airtableFetch(`${BASE_ID}/${TABLES.issueItems}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch.map((row) => ({ id: row.id, fields: { Lock: true } })) }),
    });
    lockedIds.push(...batch.map((row) => row.id));
    console.log(`Locked batch: ${batch.map((row) => row.id).join(", ")}`);
  }

  receipt.lockedAt  = new Date().toISOString();
  receipt.lockedIds = [...(receipt.lockedIds ?? []), ...lockedIds];
  saveReceipt(receiptPath, receipt);
  console.log(`Done — ${lockedIds.length} of ${receipt.rows.length} written rows locked. Deletes: 0.`);
  return { mode: "lock", lockedIds };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  // File validation first — a bad picks file is refused without a single request
  const { picks, sha256 } = opts.lock ? {} : readPicks(opts.picksFile, opts.issueDate);

  if (!process.env.AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY environment variable is not set");
  }
  if (!BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  if (opts.lock) return lockWrittenRows(opts);

  console.log(`${opts.apply ? "APPLY" : "DRY RUN"} — ${picks.length} picks for issue ${opts.issueDate} from ${opts.picksFile}`);

  console.log("Fetching Issues...");
  const issues = await fetchIssueRecords(opts.issueDate);
  if (issues.length > 1) {
    throw new Error(`Duplicate IssueDate in Issues table: ${opts.issueDate} (${issues.map((r) => r.id).join(", ")})`);
  }
  let issueId = issues.length ? issues[0].id : null;

  console.log("Fetching existing IssueItems...");
  const existingRows = await fetchRowsForDate(opts.issueDate, issueId);
  const conflicts = findConflicts(picks, existingRows);
  if (conflicts.length) {
    throw new Error(
      `Refusing to write: IssueItems already exist for ${conflicts.length} of the picks' (date, section, slot):\n  ` +
      conflicts.map((c) => `${c.name} → ${c.airtableId}${c.locked ? " (locked)" : ""}`).join("\n  ") +
      `\nNothing was written or deleted.`
    );
  }

  // generateBlurbs.js rewrites the copy on every unlocked row for the date, not only the rows written
  // here, so an unlocked row already on the issue would have its copy replaced by the next step.
  const openRows = existingRows.filter((row) => !row.locked);
  if (openRows.length) {
    throw new Error(
      `Refusing to write: ${openRows.length} unlocked IssueItems already exist for ${opts.issueDate}:\n  ` +
      openRows.map((row) => `${row.Name} → ${row.airtableId}`).join("\n  ") +
      `\ngenerateBlurbs.js would replace their copy. Lock them first. Nothing was written or deleted.`
    );
  }

  console.log("Fetching the picks' Candidates...");
  const candidateMap = await fetchPickCandidates(picks);
  const missing = picks.filter((p) => !p.OwnEvent && !candidateMap[p.ItemID]);
  if (missing.length) {
    throw new Error(
      `Refusing to write: ${missing.length} picks have no Candidates record:\n  ` +
      missing.map((p) => `${itemName(p)} → ${p.ItemID}`).join("\n  ") +
      `\nNothing was written or deleted.`
    );
  }

  for (const w of collectWarnings(picks, candidateMap, existingRows, opts.issueDate)) console.warn(`Warning: ${w}`);

  // Own events (Decision_Log §113): link an existing Candidates row with the same key, or plan one
  const ownEvents = await resolveOwnEvents(picks);
  const plannedCandidates = ownEvents.filter((o) => !o.existingId);
  const ownIds = Object.fromEntries(ownEvents.map((o) => [itemName(o.pick), o.existingId ?? "(new Candidate)"]));
  for (const o of ownEvents) {
    console.log(
      `OWN ${itemName(o.pick)} → ` +
      (o.existingId ? `existing Candidate ${o.existingId}` : `new Candidate "${o.fields["Event Title"]}" (${o.fields["Start Date"]})`) +
      ` — ${o.uid}`
    );
  }

  // The rows, exactly as they will be POSTed (the Issue link is a placeholder until the record exists)
  const rows = buildRows(picks, issueId ?? "(created by --ensure-issue)", candidateMap, ownIds);
  console.log(`Issues record: ${issueId ?? "none"}`);
  console.log(`Existing IssueItems for ${opts.issueDate}: ${existingRows.length} (${existingRows.filter((r) => r.locked).length} locked) — none are touched`);
  console.log(`Rows to create (${rows.length}):`);
  console.table(rows.map((r, i) => ({
    Name:      r.fields.Name,
    Candidate: r.fields.Candidate[0],
    Start:     r.fields.CandidateStartDate,
    Title:     (picks[i].OwnEvent ? picks[i].OwnEvent.title : candidateMap[r.fields.Candidate[0]].title).slice(0, 50),
  })));
  for (const r of rows) console.log(`ROW ${JSON.stringify(r.fields)}`);

  if (!issueId && !opts.ensureIssue) {
    throw new Error(
      `Refusing to write: no Issues record found for date ${opts.issueDate}. ` +
      `Re-run with --ensure-issue to create it. Nothing was written or deleted.`
    );
  }
  const receiptPath = receiptPathFor(opts.picksFile);
  if (opts.apply && fs.existsSync(receiptPath)) {
    throw new Error(
      `Refusing to write: a receipt already exists at ${receiptPath} — this picks file has been applied before. ` +
      `Nothing was written or deleted.`
    );
  }

  if (!opts.apply) {
    if (!issueId) console.log(`Would create the Issues record for ${opts.issueDate} (--ensure-issue).`);
    const candidatesPart = plannedCandidates.length ? `${plannedCandidates.length} Candidates and ` : "";
    console.log(`Dry run — nothing written. Would create ${candidatesPart}${rows.length} IssueItems. Deletes: 0. Re-run with --apply to write.`);
    return { mode: "dry-run", rows };
  }

  if (!issueId) {
    console.log(`Creating Issues record for ${opts.issueDate}...`);
    issueId = await createIssueRecord(opts.issueDate);
    console.log(`Issues record created: ${issueId}`);
    for (const r of rows) r.fields.Issue = [issueId];
  }

  const receipt = {
    writtenAt:     new Date().toISOString(),
    issueDate:     opts.issueDate,
    issueRecordId: issueId,
    issueCreated:  issues.length === 0,
    picksFile:     path.basename(opts.picksFile),
    picksSha256:   sha256,
    baseId:        BASE_ID,
    tableId:       TABLES.issueItems,
    complete:      false,
    candidates:    [],
    rows:          [],
  };

  if (plannedCandidates.length) {
    console.log(`Creating ${plannedCandidates.length} own-event Candidates...`);
    await createOwnCandidates(plannedCandidates, receiptPath, receipt);
    for (const created of receipt.candidates) ownIds[created.Name] = created.id;
    const linked = buildRows(picks, issueId, candidateMap, ownIds);
    rows.forEach((r, i) => { r.fields.Candidate = linked[i].fields.Candidate; });
  }

  console.log("Writing IssueItems to Airtable...");
  await createRows(rows, receiptPath, receipt);
  console.log(`Done — ${receipt.rows.length} records created. Deletes: 0.`);
  console.log(`Receipt: ${receiptPath}`);
  return { mode: "apply", rows, receipt };
}

module.exports = {
  parseArgs,
  itemName,
  receiptPathFor,
  readPicks,
  fetchIssueRecords,
  fetchRowsForDate,
  fetchPickCandidates,
  findConflicts,
  buildRows,
  lockWrittenRows,
  main,
};

// Run only when executed directly. require()-ing this file must never touch Airtable.
if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
