// Probe B — corpus staging (PLUMBING ONLY, not the analysis).
// Produces two clean inputs for the vocabulary-overlap analysis:
//   published_titles.json     — 3-class labeled training titles (edited displayTitles)
//   raw_candidate_titles.json — unique raw scraped titles (production distribution)
// The analysis (per-class discriminative tokens -> coverage in raw pool -> readout)
// is authored separately by Ariel. This file only assembles the corpora.

const fs = require("fs");
const path = require("path");

const OUT = __dirname;
const KEEP = new Set(["For Families", "For Couples", "For Golden Age Readers"]); // 3-class; Local Aroma excluded (separate intake)

// ---- published (labeled) titles from beehiiv issue history ----
const hist = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/beehiiv/issue_history.json"), "utf8"));
const published = [];
for (const iss of hist) {
  for (const e of (iss.events || [])) {
    if (!KEEP.has(e.section)) continue;
    const title = (e.displayTitle || "").trim();
    if (title) published.push({ title, section: e.section });
  }
}

// ---- raw candidate titles (union across all snapshots, deduped) ----
const snapDir = path.join(__dirname, "../../data/tracking/snapshots");
const files = fs.readdirSync(snapDir).filter(f => f.startsWith("candidates_"));
const seen = new Set();
const rawTitles = [];
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8"));
  for (const r of (Array.isArray(arr) ? arr : arr.records || [])) {
    const t = ((r.fields || r)["Event Title"] || "").trim();
    if (t && !seen.has(t)) { seen.add(t); rawTitles.push(t); }
  }
}

fs.writeFileSync(path.join(OUT, "published_titles.json"), JSON.stringify(published, null, 2));
fs.writeFileSync(path.join(OUT, "raw_candidate_titles.json"), JSON.stringify(rawTitles, null, 2));

const byClass = published.reduce((a, p) => (a[p.section] = (a[p.section] || 0) + 1, a), {});
console.log("published_titles.json     :", published.length, "rows", byClass);
console.log("raw_candidate_titles.json :", rawTitles.length, "unique raw titles");
