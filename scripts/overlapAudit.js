// overlapAudit.js
// Read-only cross-source duplicate audit for the Candidates table.
//
// The pipeline upserts on UniqueEventID (`normalizedTitle|YYYY-MM-DD`), so two
// records with an IDENTICAL UniqueEventID are already collapsed into one row.
// The leak we care about is the OPPOSITE: two DIFFERENT rows (different
// UniqueEventID) that actually refer to the same real-world event, slipping
// past the exact-match key because two sources formatted the title differently.
// This is the cross-aggregator dedup risk (AllEvents ingests Eventbrite, etc.).
//
// Method: one global pass. Group every candidate by an aggressive FUZZY key
// (punctuation/year/parenthetical-stripped title + date). Any fuzzy group with
// 2+ rows is a suspected duplicate cluster. Report which sources collided and
// print samples so a human can confirm they are true dupes (fuzzy matching can
// false-positive on same-title/same-day-but-different events).
//
// Reads Candidates via the Airtable REST API key in the env file. Writes a compact
// timestamped summary (metrics + suspect dupe pairs, NOT raw records — the candidates
// snapshot already holds those) to data/tracking/overlap_audits/ for run-over-run
// dup-health monitoring: a climbing cross-source count flags a source change or dedup
// regression early.

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") });
const fs = require("fs");
const path = require("path");

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const CANDIDATES_TABLE = "tblRsboN66ZLzyDrM";
const OUT_DIR = path.join(__dirname, "../data/tracking/overlap_audits");

function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function timedFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function airtableFetch(pathStr, options = {}, retries = 3) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const url = `https://api.airtable.com/v0/${pathStr}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await timedFetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    if (res.status === 429) {
      if (attempt === retries) throw new Error(`Airtable rate limit hit on /${pathStr} — out of retries`);
      const wait = parseInt(res.headers.get("Retry-After") ?? "1", 10) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Airtable GET /${pathStr} → ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

async function fetchAllRecords(tableId) {
  const records = [];
  let offset;
  do {
    const query = new URLSearchParams(offset ? { offset } : {});
    const data = await airtableFetch(`${BASE_ID}/${tableId}?${query}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// Aggressive normalization for the FUZZY key — deliberately looser than the
// pipeline's UniqueEventID norm(). Strips parentheticals (e.g. "(Vaughan)",
// "(Ages 10-13)"), 4-digit years, and all punctuation so that title variants
// of the same event collapse together. Date keeps them from over-merging.
function fuzzyTitle(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/&amp;/g, "&")
    .replace(/\([^)]*\)/g, " ")   // drop parentheticals
    .replace(/\b\d{4}\b/g, " ")    // drop years
    .replace(/[^a-z0-9]+/g, " ")   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Source derived from the URL domain — ground truth, unlike the Source field
// which is blank on ~half the legacy pool. This is the canonical source key.
function sourceFromUrl(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("eventbrite.")) return "Eventbrite";
  if (u.includes("allevents.in")) return "AllEvents";
  if (u.includes("mcmichael.")) return "McMichael";
  if (u.includes("trca.ca")) return "TRCA";
  if (u.includes("bibliocommons.com")) return "BiblioCommons";
  if (!u) return "(no url)";
  return "(unknown)";
}

// Stopwords stripped before token comparison so generic filler doesn't inflate
// similarity between genuinely different events.
const STOP = new Set(["the", "a", "an", "of", "in", "on", "at", "and", "or", "for", "to", "with", "&", "de", "la", "vs"]);

function tokenSet(title) {
  return new Set(
    fuzzyTitle(title)
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return { j: 0, contain: 0, inter: 0 };
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return { j: inter / union, contain: inter / Math.min(a.size, b.size), inter };
}

function dateOnly(d) {
  if (!d) return "";
  return String(d).slice(0, 10);
}

function dayNumber(d) {
  const s = dateOnly(d);
  if (!s) return null;
  const t = Date.parse(s + "T00:00:00Z");
  return isNaN(t) ? null : Math.round(t / 86400000);
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY not set");
  if (!BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  console.log("Fetching all Candidates...");
  const records = await fetchAllRecords(CANDIDATES_TABLE);
  console.log(`Fetched ${records.length} records.\n`);

  // Shape records. Source is DERIVED FROM URL (ground truth), with the stored
  // Source field kept only for comparison/diagnostics.
  const rows = [];
  const bySourceField = {};
  const bySourceUrl = {};
  for (const r of records) {
    const f = r.fields;
    const url = f["URL"] || "";
    const fieldSource = f["Source"] || "(blank)";
    const source = sourceFromUrl(url);
    bySourceField[fieldSource] = (bySourceField[fieldSource] ?? 0) + 1;
    bySourceUrl[source] = (bySourceUrl[source] ?? 0) + 1;
    rows.push({
      id: r.id,
      created: r.createdTime || "",
      title: f["Event Title"] || "",
      source,
      fieldSource,
      city: f["City"] || "",
      url,
      uid: f["UniqueEventID"] || "",
      venue: (f["LocationName"] || "").trim(),
      day: dateOnly(f["Start Date"]),
      endDay: dateOnly(f["End Date"]),
      dn: dayNumber(f["Start Date"]),
      fkey: `${fuzzyTitle(f["Event Title"])}|${dateOnly(f["Start Date"])}`,
      tokens: tokenSet(f["Event Title"]),
    });
  }
  console.log("Records by Source FIELD (as stored):");
  for (const [s, n] of Object.entries(bySourceField).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${s}`);
  }
  console.log("\nRecords by Source DERIVED FROM URL (ground truth):");
  for (const [s, n] of Object.entries(bySourceUrl).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${s}`);
  }

  // LocationName (venue) fill rate per source — feasibility check for venue+time
  // matching. Venue matching only works on sources where venue is populated.
  console.log("\nLocationName (venue) fill rate by source:");
  const venueStat = {};
  for (const row of rows) {
    (venueStat[row.source] ??= { filled: 0, total: 0 });
    venueStat[row.source].total++;
    if (row.venue) venueStat[row.source].filled++;
  }
  for (const [s, v] of Object.entries(venueStat).sort((a, b) => b[1].total - a[1].total)) {
    const pct = ((v.filled / v.total) * 100).toFixed(0);
    console.log(`  ${s.padEnd(14)} ${String(v.filled).padStart(4)}/${String(v.total).padStart(4)}  (${pct}%)`);
  }

  // Start-date distribution per source — tests whether two sources even cover
  // the same date window (if not, low cross-source overlap is an artifact).
  console.log("\nStart-date distribution by source (year-month):");
  const monthBySource = {};
  for (const row of rows) {
    const ym = row.day ? row.day.slice(0, 7) : "(no date)";
    (monthBySource[row.source] ??= {});
    monthBySource[row.source][ym] = (monthBySource[row.source][ym] ?? 0) + 1;
  }
  for (const [s, months] of Object.entries(monthBySource)) {
    const parts = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([m, n]) => `${m}:${n}`);
    console.log(`  ${s.padEnd(14)} ${parts.join("  ")}`);
  }

  // Sanity check: exact UniqueEventID dupes should be ~0 (upsert collapses them).
  const byUid = {};
  for (const row of rows) {
    if (!row.uid) continue;
    (byUid[row.uid] ??= []).push(row);
  }
  const exactDupes = Object.values(byUid).filter((g) => g.length > 1);
  console.log(`\nExact UniqueEventID duplicate rows (expect ~0): ${exactDupes.length} clusters`);

  // Detailed dump of identical-UniqueEventID clusters — distinguish a true
  // within-run upsert dupe (identical fields, same createdTime) from a recurring
  // event the title|date key can't separate (differing end dates / different runs).
  console.log(`\n--- Identical-UniqueEventID clusters (full detail) ---`);
  for (const g of exactDupes) {
    console.log(`\n  uid="${g[0].uid}"`);
    for (const r of g) {
      const sameUrl = new Set(g.map((x) => x.url)).size === 1 ? "" : " [URL DIFFERS]";
      console.log(`     • created=${r.created}  start=${r.day}  end=${r.endDay || "-"}  (${r.source}/${r.city})`);
      console.log(`         "${r.title}"`);
      console.log(`         ${r.url}${sameUrl}`);
    }
  }

  // Global fuzzy grouping — the actual leak detector.
  const byFuzzy = {};
  for (const row of rows) {
    if (!row.fkey || row.fkey.startsWith("|")) continue; // skip blank-title/blank-date
    (byFuzzy[row.fkey] ??= []).push(row);
  }
  const clusters = Object.values(byFuzzy).filter((g) => g.length > 1);

  // Split clusters: cross-source (2+ distinct sources) vs same-source.
  const crossSource = [];
  const sameSource = [];
  for (const g of clusters) {
    const sources = new Set(g.map((r) => r.source));
    (sources.size > 1 ? crossSource : sameSource).push(g);
  }

  console.log(`\nFuzzy clusters (same title+date, 2+ rows): ${clusters.length}`);
  console.log(`  cross-source (the real leak): ${crossSource.length}`);
  console.log(`  same-source (intra-source near-dupes): ${sameSource.length}`);

  // Which source-pairs are colliding, ranked.
  const pairCounts = {};
  for (const g of crossSource) {
    const sources = [...new Set(g.map((r) => r.source))].sort();
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const key = `${sources[i]}  <->  ${sources[j]}`;
        pairCounts[key] = (pairCounts[key] ?? 0) + 1;
      }
    }
  }
  console.log("\nCross-source collisions by source-pair:");
  const pairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]);
  if (pairs.length === 0) console.log("  (none)");
  for (const [pair, n] of pairs) console.log(`  ${String(n).padStart(4)}  ${pair}`);

  // ---- Token-similarity pass: catches PARAPHRASE dupes the exact-fuzzy key
  // misses (reordered/abbreviated/reworded titles), with a ±1-day window so
  // timezone date-rollover (AllEvents UTC vs Eventbrite local) can't hide a dupe.
  // Loose thresholds = high recall; output is for manual review, not auto-action.
  const J_THRESHOLD = 0.5;       // Jaccard token overlap
  const CONTAIN_THRESHOLD = 0.8; // smaller title's tokens mostly inside the larger
  const DAY_TOLERANCE = 1;

  // Bucket by day for an efficient ±1-day comparison instead of full O(n^2).
  const byDay = new Map();
  for (const row of rows) {
    if (row.dn == null || row.tokens.size === 0) continue;
    if (!byDay.has(row.dn)) byDay.set(row.dn, []);
    byDay.get(row.dn).push(row);
  }

  const seenPair = new Set();
  const matches = [];
  for (const row of rows) {
    if (row.dn == null || row.tokens.size === 0) continue;
    for (let d = row.dn - DAY_TOLERANCE; d <= row.dn + DAY_TOLERANCE; d++) {
      const bucket = byDay.get(d);
      if (!bucket) continue;
      for (const other of bucket) {
        if (other.id === row.id) continue;
        if (other.source === row.source) continue; // cross-source only
        const pid = [row.id, other.id].sort().join("|");
        if (seenPair.has(pid)) continue;
        seenPair.add(pid);
        const { j, contain, inter } = jaccard(row.tokens, other.tokens);
        if (inter >= 2 && (j >= J_THRESHOLD || contain >= CONTAIN_THRESHOLD)) {
          matches.push({ a: row, b: other, j, contain });
        }
      }
    }
  }
  matches.sort((x, y) => y.j - x.j);

  console.log(`\n=== TOKEN-SIMILARITY cross-source candidates (±${DAY_TOLERANCE}d, J>=${J_THRESHOLD} or contain>=${CONTAIN_THRESHOLD}) ===`);
  console.log(`Suspected paraphrase/cross-source dupe pairs: ${matches.length}\n`);
  for (const m of matches) {
    console.log(`  J=${m.j.toFixed(2)} contain=${m.contain.toFixed(2)}`);
    console.log(`     • (${m.a.source}/${m.a.city}/${m.a.day}) "${m.a.title}"`);
    console.log(`     • (${m.b.source}/${m.b.city}/${m.b.day}) "${m.b.title}"`);
    console.log("");
  }

  // Persist a compact summary for run-over-run dup-health monitoring. Mirrors the
  // snapshotCandidates pattern (timestamped file, same dir convention) but stores
  // only metrics + the suspect pairs — never the raw pool (snapshots own that).
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = timestampForFilename();
  const summary = {
    capturedAt: new Date().toISOString(),
    baseId: BASE_ID,
    tableId: CANDIDATES_TABLE,
    recordCount: records.length,
    bySourceField,
    bySourceUrl,
    venueFillBySource: Object.fromEntries(
      Object.entries(venueStat).map(([s, v]) => [s, { filled: v.filled, total: v.total }])
    ),
    exactDupeClusters: exactDupes.length,
    fuzzyClusters: { total: clusters.length, crossSource: crossSource.length, sameSource: sameSource.length },
    crossSourcePairCounts: pairCounts,
    tokenSimilarityPairCount: matches.length,
    tokenSimilarityPairs: matches.map((m) => ({
      j: Number(m.j.toFixed(2)),
      contain: Number(m.contain.toFixed(2)),
      a: { source: m.a.source, city: m.a.city, day: m.a.day, title: m.a.title, uid: m.a.uid },
      b: { source: m.b.source, city: m.b.city, day: m.b.day, title: m.b.title, uid: m.b.uid },
    })),
  };
  const outPath = path.join(OUT_DIR, `overlap_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nAudit summary written: ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
