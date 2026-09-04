// scripts/r6/lib/collapse.js
// Listings -> series. The ranking unit is the series (Decision_Log §92: production permits one
// occurrence of a recurring series per section/week; 321 listings collapsed to 225 on 2026-08-13).
//
// Representative listing = earliest in-window occurrence (assumption, labelled in the report).
// Text = the longest DescriptionRaw among members (richest-record, same spirit as §51).

const { normTitle, normVenue, ymd, tokenSet, jaccard } = require("./util.js");

function collapse(survivors) {
  const bySeries = new Map();
  for (const r of survivors) {
    const key = normTitle(r["Event Title"]) || `id:${r.id}`;
    if (!bySeries.has(key)) bySeries.set(key, []);
    bySeries.get(key).push(r);
  }
  const series = [];
  for (const [seriesKey, members] of bySeries) {
    members.sort((a, b) => ymd(a["Start Date"]).localeCompare(ymd(b["Start Date"])));
    const rep = members[0];
    const richest = members.reduce(
      (best, m) => ((m.DescriptionRaw || "").length > (best.DescriptionRaw || "").length ? m : best),
      rep
    );
    series.push({
      seriesKey,
      title: rep["Event Title"] || "",
      description: richest.DescriptionRaw || "",
      representativeId: rep.id,
      memberIds: members.map((m) => m.id),
      memberDates: members.map((m) => ymd(m["Start Date"])),
      memberUrls: [...new Set(members.map((m) => m.URL).filter(Boolean))],
      url: rep.URL || "",
      startDate: ymd(rep["Start Date"]),
      endDate: ymd(rep["End Date"]),
      venue: rep.LocationName || "",
      venueKey: normVenue(rep.LocationName),
      organizer: rep.Organizer || "",
      organizerKey: normTitle(rep.Organizer),
      city: rep.City || "",
      source: rep.Source || "",
      cost: rep.CostRaw || "",
      categories: rep.SourceCategories || "",
      occurrencesInWindow: members.length,
    });
  }
  return series;
}

// Report-only near-duplicate clusters: two series whose title token sets overlap strongly AND
// that share a venue or fall within one day of each other. Never merges; assembly flags or skips
// per config. Threshold is a plumbing heuristic, not a scoring number.
function nearDupClusters(series, jaccardMin) {
  const tokens = series.map((s) => tokenSet(s.title));
  const parent = series.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const j1 = jaccard(tokens[i], tokens[j]);
      if (j1 < jaccardMin) continue;
      const a = series[i], b = series[j];
      const sameVenue = a.venueKey && a.venueKey === b.venueKey;
      const closeDate = Math.abs(Date.parse(a.startDate) - Date.parse(b.startDate)) <= 86400000;
      if (sameVenue || closeDate) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  series.forEach((s, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  let n = 0;
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const id = `dup-${++n}`;
    for (const i of idx) {
      series[i].nearDupCluster = id;
      series[i].nearDupOf = idx.filter((k) => k !== i).map((k) => series[k].title);
    }
  }
  return series;
}

module.exports = { collapse, nearDupClusters };
