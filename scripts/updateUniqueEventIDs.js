// updateUniqueEventIDs.js
// One-time script: recomputes UniqueEventID for all Candidates records.
// Formula: lowercase(title).trim() + "|" + start_date (YYYY-MM-DD)

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });

const BASE_ID       = "appVXHOyQcgQAk1gV";
const CANDIDATES_ID = "tblRsboN66ZLzyDrM";

async function airtableFetch(path, options = {}) {
  const url = `https://api.airtable.com/v0/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${options.method ?? "GET"} /${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchAllCandidates() {
  const records = [];
  let offset;
  do {
    const query = new URLSearchParams([
      ["fields[]", "Event Title"],
      ["fields[]", "Start Date"],
      ["fields[]", "UniqueEventID"],
      ...(offset ? [["offset", offset]] : []),
    ]);
    const data = await airtableFetch(`${BASE_ID}/${CANDIDATES_ID}?${query}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

function computeUniqueEventID(title, startDate) {
  const titlePart = (title ?? "").toLowerCase().trim();
  const datePart  = startDate ?? "";
  return `${titlePart}|${datePart}`;
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY is not set in NLAP_Airtable.env");
  }

  console.log("Fetching all Candidates...");
  const records = await fetchAllCandidates();
  console.log(`Fetched ${records.length} records.`);

  const updates = [];
  let skipped = 0;

  for (const r of records) {
    const title     = r.fields["Event Title"] ?? "";
    const startDate = r.fields["Start Date"]  ?? "";
    const current   = r.fields["UniqueEventID"] ?? "";
    const computed  = computeUniqueEventID(title, startDate);

    if (current === computed) {
      skipped++;
      continue;
    }

    updates.push({ id: r.id, fields: { UniqueEventID: computed } });
  }

  console.log(`${updates.length} records need updating, ${skipped} already correct.`);

  if (updates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let updated = 0;
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    await airtableFetch(`${BASE_ID}/${CANDIDATES_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch }),
    });
    updated += batch.length;
    console.log(`Updated ${updated}/${updates.length}...`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
