/**
 * Pool coverage — did the editor's published picks exist in our candidate pool?
 *
 * Matching, in order of trust:
 *   1. URL      — normalised host+path equality. No judgment involved.
 *   2. IDF-title — fraction of the POOL title's *information* present in the published
 *                  text (displayTitle + description). IDF-weighted so that shared filler
 *                  ("summer", "family", "free") cannot carry a match on its own, which is
 *                  what broke plain containment: "Summer Succulent" scored 0.50 against
 *                  "Treetop Trekking Summer Adventure" on the word "summer".
 *
 * Direction matters: we ask how much of the POOL title appears in the PUBLISHED text,
 * not the reverse. Pool titles are clean scraped strings; published text is a rewritten
 * blurb with the description concatenated on, so it is the longer, noisier side.
 *
 * Venue+date matching is NOT possible here: the Beehiiv export carries only
 * section / slot / url / displayTitle / description / cta. No venue, no date.
 *
 * Emits a residual worksheet of everything unmatched, with the top neighbours, for
 * hand adjudication. Read-only.
 */
const fs = require("fs");
const path = require("path");

const ROOT = "c:/NA + Learning/NLAP";
const OUT = process.argv[2] || null;
const FROM_ISSUE = process.argv[3] || "2026-06-01";

const issues = JSON.parse(fs.readFileSync(path.join(ROOT, "data/beehiiv/issue_history.json"), "utf8"));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data/tracking/snapshots/candidates_2026-08-06_0944.json"), "utf8"));

const normUrl = (u) => {
  if (!u) return "";
  try {
    const p = new URL(u.trim());
    return p.hostname.toLowerCase().replace(/^www\./, "") + p.pathname.replace(/\/+$/, "").toLowerCase();
  } catch { return u.trim().toLowerCase().replace(/\/+$/, ""); }
};

const STOP = new Set(["the","a","an","and","or","of","at","in","on","for","to","with","by","your","you","is","this","from","are","was","its","it","be","as","that","will","all","our","out","up","off","new","free","join","enjoy","explore","discover","celebrate","watch","plan","meet","browse","try","catch","take","bring","get","see","come","event","events"]);
const tok = (t) => (t || "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .split(/\s+/)
  .filter((w) => w.length > 2 && !STOP.has(w));

const cands = snap.records.map((r) => {
  const f = r.fields;
  const date = ((f["Start Date"] || (f.UniqueEventID || "").split("|")[1]) || "").slice(0, 10);
  return {
    title: f["Event Title"] || "",
    url: f.URL || "",
    nurl: normUrl(f.URL),
    toks: tok(f["Event Title"]),
    date,
    source: f.Source || "(blank)",
    venue: f.LocationName || "",
  };
}).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date));

// ---- IDF over all pool titles (document = one candidate title) ----
const df = new Map();
for (const c of cands) for (const w of new Set(c.toks)) df.set(w, (df.get(w) || 0) + 1);
const N = cands.length;
const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1));

// How much of the pool title's information appears in the published text?
const idfCoverage = (poolToks, pubSet) => {
  const uniq = [...new Set(poolToks)];
  if (!uniq.length) return { score: 0, hits: 0 };
  let tot = 0, got = 0, hits = 0;
  for (const w of uniq) {
    const wt = idf(w);
    tot += wt;
    if (pubSet.has(w)) { got += wt; hits++; }
  }
  return { score: tot ? got / tot : 0, hits };
};

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const EXCLUDED = new Set(["Trust Me Recipe", "Local Aroma"]);

const TITLE_TH = 0.70;   // fraction of the pool title's IDF mass found in published text
const MIN_HITS = 2;      // and at least two distinct content words, so one word never carries it

const rows = [];
const residuals = [];

for (const issue of issues) {
  const from = addDays(issue.date, 1), to = addDays(issue.date, 10);
  if (issue.date < FROM_ISSUE) continue;
  const window = cands.filter((c) => c.date >= from && c.date <= to);
  const published = (issue.events || []).filter((e) => !EXCLUDED.has(e.section));
  if (!published.length) continue;

  let byUrl = 0, byTitle = 0;
  const miss = [];

  for (const ev of published) {
    const nu = normUrl(ev.url);
    const pubSet = new Set(tok(`${ev.displayTitle || ""} ${ev.description || ""}`));

    if (nu && window.some((c) => c.nurl === nu)) { byUrl++; continue; }

    const scored = window
      .map((c) => ({ c, ...idfCoverage(c.toks, pubSet) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= TITLE_TH && best.hits >= MIN_HITS) { byTitle++; continue; }

    miss.push({ ev, near: scored.slice(0, 6) });
  }

  rows.push({ issue: issue.date, from, to, pool: window.length, pub: published.length, byUrl, byTitle, miss: miss.length });
  residuals.push({ issue: issue.date, from, to, pool: window.length, miss });
}

// ---------- console table ----------
const pad = (s, n) => String(s).padEnd(n);
console.log("\nPOOL COVERAGE — published picks found in the in-window candidate pool");
console.log(`(URL match, or IDF-weighted title coverage >= ${TITLE_TH} with >= ${MIN_HITS} content words)\n`);
console.log(pad("issue", 12) + pad("window", 24) + pad("pool", 7) + pad("url", 6) + pad("title", 7) + pad("miss", 6) + "found");
console.log("-".repeat(74));
let T = { pub: 0, url: 0, title: 0, miss: 0 };
for (const r of rows) {
  console.log(pad(r.issue, 12) + pad(`${r.from}..${r.to}`, 24) + pad(r.pool, 7) + pad(r.byUrl, 6) + pad(r.byTitle, 7) + pad(r.miss, 6) + `${r.byUrl + r.byTitle}/${r.pub}`);
  T.pub += r.pub; T.url += r.byUrl; T.title += r.byTitle; T.miss += r.miss;
}
console.log("-".repeat(74));
console.log(pad("TOTAL", 43) + pad(T.url, 6) + pad(T.title, 7) + pad(T.miss, 6) + `${T.url + T.title}/${T.pub}`);
console.log("");

// ---------- residual worksheet ----------
if (OUT) {
  const o = [];
  o.push("# Residual misses — for hand adjudication\n");
  o.push(`Matcher: URL equality, or IDF-weighted title coverage >= ${TITLE_TH} with >= ${MIN_HITS} content words.\n`);
  o.push("Rule each: **PRESENT** (pool has this event, any source/URL) · **EVERGREEN** (standing place, no date, no calendar can list it) · **ABSENT** (dated event we never ingested).\n");
  o.push("---\n");
  for (const r of residuals) {
    if (!r.miss.length) continue;
    o.push(`## ${r.issue} — window ${r.from} → ${r.to} · ${r.pool} in pool · ${r.miss.length} unmatched\n`);
    for (const m of r.miss) {
      o.push(`### [${m.ev.section}] ${m.ev.displayTitle}`);
      if (m.ev.description) o.push(`- blurb: ${m.ev.description}`);
      o.push(`- url: ${m.ev.url}`);
      o.push(`- verdict: \`TODO\``);
      o.push(`- nearest in pool:`);
      for (const n of m.near) o.push(`  - \`${n.score.toFixed(2)}\` (${n.hits}w) **${n.c.title}** — ${n.c.date} · ${n.c.source}${n.c.venue ? " · " + n.c.venue : ""}`);
      o.push("");
    }
  }
  fs.writeFileSync(OUT, o.join("\n"), "utf8");
  console.log(`Residual worksheet -> ${OUT}  (${T.miss} rows)`);
}
