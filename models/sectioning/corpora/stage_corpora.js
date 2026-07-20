// Probe B — corpus staging (PLUMBING ONLY, not the analysis).
// Produces the inputs for the vocabulary-overlap analysis:
//   published_titles.json      — 3-class labeled training titles (edited displayTitles)
//   raw_candidate_titles.json  — unique raw scraped titles (kept for compatibility)
//   raw_candidate_events.json  — serve-time text per event (2026-07-16 pre-registered gates):
//                                title + DescriptionRaw + SourceCategories, as available —
//                                mirrors what the model will actually see in production.
//                                Membership = the same frozen 1,805 unique titles (union across
//                                snapshots); desc/cats/url enriched from each title's latest
//                                snapshot occurrence (freshest non-empty value per field).
// The analysis (per-class discriminative tokens -> coverage in raw pool -> readout)
// is authored separately by Ariel. This file only assembles the corpora.

const fs = require("fs");
const path = require("path");

const OUT = __dirname;
const KEEP = new Set(["For Families", "For Couples", "For Golden Age Readers"]); // 3-class; Local Aroma excluded (separate intake)

// ---- published (labeled) titles from beehiiv issue history ----
const hist = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../data/beehiiv/issue_history.json"), "utf8"));
const published = [];
for (const iss of hist) {
  for (const e of (iss.events || [])) {
    if (!KEEP.has(e.section)) continue;
    const title = (e.displayTitle || "").trim();
    if (title) published.push({ title, section: e.section });
  }
}

// ---- raw candidate events (union across all snapshots, deduped by title) ----
const snapDir = path.join(__dirname, "../../../data/tracking/snapshots");
const files = fs.readdirSync(snapDir).filter(f => f.startsWith("candidates_")).sort(); // chronological
const catsToStr = c => (Array.isArray(c) ? c.join(", ") : (c || "").toString()).trim();
const events = new Map(); // title -> {desc, cats, url}; later snapshots refresh non-empty fields
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8"));
  for (const r of (Array.isArray(arr) ? arr : arr.records || [])) {
    const fld = r.fields || r;
    const t = (fld["Event Title"] || "").trim();
    if (!t) continue;
    const cur = events.get(t) || { desc: "", cats: "", url: "" };
    const desc = (fld.DescriptionRaw || "").trim();
    const cats = catsToStr(fld.SourceCategories);
    const url = (fld.URL || "").trim();
    events.set(t, {
      desc: desc || cur.desc,
      cats: cats || cur.cats,
      url: url || cur.url,
    });
  }
}
const rawTitles = [...events.keys()];
const rawEvents = rawTitles.map(title => {
  const { desc, cats, url } = events.get(title);
  return { title, url, desc, cats, text: [title, desc, cats].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() };
});

fs.writeFileSync(path.join(OUT, "published_titles.json"), JSON.stringify(published, null, 2));
fs.writeFileSync(path.join(OUT, "raw_candidate_titles.json"), JSON.stringify(rawTitles, null, 2));
fs.writeFileSync(path.join(OUT, "raw_candidate_events.json"), JSON.stringify(rawEvents, null, 2));

const byClass = published.reduce((a, p) => (a[p.section] = (a[p.section] || 0) + 1, a), {});
const mode = rawEvents.reduce((a, e) => {
  const k = e.desc ? (e.cats ? "desc+cats" : "desc only") : (e.cats ? "cats only" : "title only");
  return (a[k] = (a[k] || 0) + 1), a;
}, {});
console.log("published_titles.json     :", published.length, "rows", byClass);
console.log("raw_candidate_titles.json :", rawTitles.length, "unique raw titles");
console.log("raw_candidate_events.json :", rawEvents.length, "events; presence modes:", mode);
