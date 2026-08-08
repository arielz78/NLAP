/**
 * Shared Airtable deck I/O — the chunking, pagination, rate-limiting and safety
 * guard that pushLabelDeck.js and pushLiveDemo30.js each had their own copy of.
 *
 * "Deck" here means a STANDALONE table the editor rules in: no links to
 * Candidates/IssueItems, nothing reads from it automatically.
 *
 * Two non-obvious constraints are encoded here because both were live bugs:
 *   - Airtable caps writes/deletes at 10 records per request (CHUNK).
 *   - url.searchParams.append(), NOT .set(), for repeated `fields[]` params.
 *     .set() overwrites, so only the last field is requested and the others come
 *     back undefined — the 2026-07-23 bug where a purge silently no-op'd and Row
 *     numbers collided.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../NLAP_Airtable.env") });

const CHUNK = 10;
const PACE_MS = 220; // stay under Airtable's 5 req/sec limit

function auth() {
  const key = process.env.AIRTABLE_API_KEY;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!key) throw new Error("AIRTABLE_API_KEY is not set");
  if (!base) throw new Error("AIRTABLE_BASE_ID is not set");
  return { key, base };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Airtable returns single-selects as {id,name} in some contexts and a bare string in others. */
function selectName(v) {
  return v && typeof v === "object" ? v.name : v;
}

/** Read every record in a table, requesting only the named fields. */
async function fetchAll(tableId, fields = []) {
  const { key, base } = auth();
  const out = [];
  for (let cursor; ; ) {
    const url = new URL(`https://api.airtable.com/v0/${base}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    for (const f of fields) url.searchParams.append("fields[]", f); // append, not set
    if (cursor) url.searchParams.set("offset", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    out.push(...json.records);
    if (!json.offset) break;
    cursor = json.offset;
    await sleep(PACE_MS);
  }
  return out;
}

async function deleteRecords(tableId, ids) {
  const { key, base } = auth();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const qs = ids.slice(i, i + CHUNK).map((id) => `records[]=${id}`).join("&");
    const res = await fetch(`https://api.airtable.com/v0/${base}/${tableId}?${qs}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`delete at ${i + 1} failed: ${res.status} ${await res.text()}`);
    await sleep(PACE_MS);
  }
  return ids.length;
}

async function createRecords(tableId, records, { onProgress } = {}) {
  const { key, base } = auth();
  let done = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const res = await fetch(`https://api.airtable.com/v0/${base}/${tableId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: chunk, typecast: true }),
    });
    if (!res.ok) throw new Error(`chunk at row ${i + 1} failed: ${res.status} ${await res.text()}`);
    done += chunk.length;
    if (onProgress) onProgress(done, records.length);
    await sleep(PACE_MS);
  }
  return done;
}

/** Patch existing records in Airtable's 10-record chunks. */
async function updateRecords(tableId, records, { onProgress } = {}) {
  const { key, base } = auth();
  let done = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const res = await fetch(`https://api.airtable.com/v0/${base}/${tableId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: chunk, typecast: true }),
    });
    if (!res.ok) throw new Error(`update at row ${i + 1} failed: ${res.status} ${await res.text()}`);
    done += chunk.length;
    if (onProgress) onProgress(done, records.length);
    await sleep(PACE_MS);
  }
  return done;
}

/**
 * The guard both push scripts carried by hand: refuse to delete rows the editor
 * has already ruled on. `ruledField` is whatever field means "he answered this"
 * — Section on the R7 Label Deck, Verdict on a validation packet.
 */
function assertUnruled(records, ruledField, context) {
  const ruled = records.filter((r) => r.fields && r.fields[ruledField]).length;
  if (ruled > 0) {
    throw new Error(
      `ABORT: ${ruled} rows in ${context} already have a ${ruledField}. ` +
      `The editor has started ruling — refusing to destroy his work.`
    );
  }
}

module.exports = { CHUNK, PACE_MS, sleep, selectName, fetchAll, deleteRecords, createRecords, updateRecords, assertUnruled };
