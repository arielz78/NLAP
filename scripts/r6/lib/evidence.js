// scripts/r6/lib/evidence.js
// Deterministic evidence joins, computed before any model call. Every fact carries its join
// source so the report can say where it came from. Nothing is imputed: absent is absent.
//
// Published-before joins, strongest first:
//   strong   issue_history.json by stripped URL                         -> via "history"
//   strong   IssueItems snapshot by Candidate record id or URL          -> via "issueitems"
//   strong   IssueItems -> Candidate -> series key (any occurrence)     -> via "issueitems_series"
//   probable issue_history displayTitle token containment >= 0.8       -> via "title_match"
//            (library programs carry a new URL per occurrence and an editor-polished title, so
//            "Mini-Makers Fun" 2026-07-16 must still be found for the series "mini-makers";
//            the matched title is surfaced so a false match is visible, never silent)
// Venue / organizer history: IssueItems -> Candidates only (post-pipeline; pre-pipeline venue
//   history is not recoverable, per the 2026-07-07 ~4% overlap check).
// Clicks: frozen click_join set by stripped URL (ordering evidence only, n shown).
// Recurrence: same series key across the whole snapshot horizon.
// R7 prior: scored_survivors.jsonl by record_id (optional).

const { stripUtm, normVenue, normTitle, ymd, daysBetween, median, tokenSet } = require("./util.js");

const PROBABLE_CONTAINMENT = 0.8;
const MIN_TOKENS = 2;

// Token containment of the shorter title in the longer. Two-token titles ("Real Talk", "D&D Club")
// are only accepted against a short counterpart (<= 6 tokens), otherwise they match anything long
// that happens to contain both words.
const SHORT_TITLE_MAX_OTHER = 6;
function containment(a, b) {
  if (a.size < MIN_TOKENS || b.size < MIN_TOKENS) return 0;
  const shorter = Math.min(a.size, b.size);
  const longer = Math.max(a.size, b.size);
  if (shorter <= 2 && longer > SHORT_TITLE_MAX_OTHER) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / shorter;
}

function buildHistoryIndex(issueHistory) {
  const byUrl = new Map();
  const titleRows = [];
  for (const issue of issueHistory) {
    for (const ev of issue.events || []) {
      const row = { date: issue.date, section: ev.section, slot: ev.slot, displayTitle: ev.displayTitle || "" };
      if (ev.url) {
        const k = stripUtm(ev.url);
        if (!byUrl.has(k)) byUrl.set(k, []);
        byUrl.get(k).push({ ...row, via: "history" });
      }
      if (row.displayTitle) titleRows.push({ ...row, tokens: tokenSet(row.displayTitle) });
    }
  }
  return { byUrl, titleRows };
}

// IssueItems carry the issue date in Name ("For Families Slot 3 — 2026-04-23") and the Candidate id.
function buildIssueItemsIndex(issueItems, candidatesById) {
  const byCandidate = new Map();
  const bySeriesKey = new Map();
  const byVenue = new Map();
  const byOrganizer = new Map();
  const byUrl = new Map();
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  for (const it of issueItems) {
    const m = /(\d{4}-\d{2}-\d{2})\s*$/.exec(it.Name || "");
    const date = m ? m[1] : null;
    if (!date) continue;
    const candId = Array.isArray(it.Candidate) ? it.Candidate[0] : null;
    const rec = candId ? candidatesById.get(candId) : null;
    const entry = { date, section: it.Section, slot: it.Slot, via: "issueitems", locked: it.Lock === true };
    if (candId) push(byCandidate, candId, entry);
    if (it.CandidateURL) push(byUrl, stripUtm(it.CandidateURL), entry);
    if (rec) {
      const sk = normTitle(rec["Event Title"]);
      if (sk) push(bySeriesKey, sk, { ...entry, via: "issueitems_series", title: rec["Event Title"] });
      const vk = normVenue(rec.LocationName);
      if (vk) push(byVenue, vk, { ...entry, title: rec["Event Title"] });
      const ok = normTitle(rec.Organizer);
      if (ok) push(byOrganizer, ok, { ...entry, title: rec["Event Title"] });
    }
  }
  return { byCandidate, bySeriesKey, byVenue, byOrganizer, byUrl };
}

function buildClickIndex(clickJoin) {
  const byUrl = new Map();
  for (const r of clickJoin.records || []) {
    const k = stripUtm(r.url);
    if (!byUrl.has(k)) byUrl.set(k, []);
    byUrl.get(k).push({ date: r.issueDate, section: r.section, slot: r.slot, pct: r.percentileVuc, vuc: r.vuc });
  }
  return byUrl;
}

function buildR7Index(scoredRows) {
  const byRecord = new Map();
  for (const row of scoredRows || []) byRecord.set(row.record_id, row);
  return byRecord;
}

function dedupeRuns(runs, issueDate) {
  const seen = new Set();
  return runs
    .filter((r) => r.date < issueDate) // only runs before this issue count as history
    .filter((r) => {
      const k = `${r.date}|${r.section}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function attachEvidence(series, ctx) {
  const { issueDate, historyIdx, issueItemsIdx, clickIdx, r7Idx, horizonCounts } = ctx;
  for (const s of series) {
    // --- strong published-before ---
    const runs = [];
    for (const u of s.memberUrls) {
      for (const h of historyIdx.byUrl.get(stripUtm(u)) || []) runs.push(h);
      for (const h of issueItemsIdx.byUrl.get(stripUtm(u)) || []) runs.push(h);
    }
    for (const id of s.memberIds) for (const h of issueItemsIdx.byCandidate.get(id) || []) runs.push(h);
    for (const h of issueItemsIdx.bySeriesKey.get(s.seriesKey) || []) runs.push(h);
    const published = dedupeRuns(runs, issueDate);
    const last = published.length ? published[published.length - 1] : null;

    // --- probable published-before (title match against polished display titles) ---
    const strongKeys = new Set(published.map((r) => `${r.date}|${r.section}`));
    const myTokens = tokenSet(s.title);
    const probableRuns = [];
    for (const row of historyIdx.titleRows) {
      if (strongKeys.has(`${row.date}|${row.section}`)) continue;
      if (containment(myTokens, row.tokens) >= PROBABLE_CONTAINMENT) {
        probableRuns.push({ date: row.date, section: row.section, slot: row.slot, via: "title_match", as: row.displayTitle });
      }
    }
    const probable = dedupeRuns(probableRuns, issueDate);
    const lastProbable = probable.length ? probable[probable.length - 1] : null;

    // --- venue / organizer history (post-pipeline only) ---
    const venueRuns = (s.venueKey ? issueItemsIdx.byVenue.get(s.venueKey) || [] : []).filter((r) => r.date < issueDate);
    const orgRuns = (s.organizerKey ? issueItemsIdx.byOrganizer.get(s.organizerKey) || [] : []).filter((r) => r.date < issueDate);
    const lastVenue = venueRuns.length ? venueRuns.reduce((a, b) => (a.date > b.date ? a : b)) : null;
    const lastOrg = orgRuns.length ? orgRuns.reduce((a, b) => (a.date > b.date ? a : b)) : null;

    // --- clicks for the same series (ordering evidence, n shown) ---
    const clicks = [];
    for (const u of s.memberUrls) for (const c of clickIdx.get(stripUtm(u)) || []) clicks.push(c);

    // --- R7 prior (optional) ---
    let r7 = null;
    if (r7Idx && r7Idx.size) {
      const rows = s.memberIds.map((id) => r7Idx.get(id)).filter(Boolean);
      if (rows.length) {
        const best = rows.reduce((a, b) => (a.p_include >= b.p_include ? a : b));
        r7 = { p_include: best.p_include, section_probabilities: best.section_probabilities, rows: rows.length };
      }
    }

    s.evidence = {
      published,
      publishedCount: published.length,
      lastPublishedDate: last ? last.date : null,
      lastPublishedSection: last ? last.section : null,
      daysSinceLastPublished: last ? daysBetween(last.date, issueDate) : null,
      probablePublished: probable,
      probableCount: probable.length,
      probableLastPublishedDate: lastProbable ? lastProbable.date : null,
      probableLastPublishedSection: lastProbable ? lastProbable.section : null,
      probableLastAs: lastProbable ? lastProbable.as : null,
      probableDaysSince: lastProbable ? daysBetween(lastProbable.date, issueDate) : null,
      venueLastDate: lastVenue ? lastVenue.date : null,
      venueLastTitle: lastVenue ? lastVenue.title : null,
      venueRunCount: venueRuns.length,
      organizerLastDate: lastOrg ? lastOrg.date : null,
      organizerRunCount: orgRuns.length,
      clickN: clicks.length,
      clickMedianPct: median(clicks.map((c) => c.pct)),
      occurrencesInWindow: s.occurrencesInWindow,
      occurrencesInHorizon: horizonCounts.get(s.seriesKey) || s.occurrencesInWindow,
      completeness: {
        hasDescription: s.description.trim().length > 0,
        descriptionChars: s.description.trim().length,
        hasCost: !!s.cost,
        hasVenue: !!s.venueKey,
        hasOrganizer: !!s.organizerKey,
        hasEndDate: !!s.endDate,
      },
      r7,
    };
    s.evidenceLines = evidenceLines(s);
  }
  return series;
}

// Three or fewer human-readable lines: what the console shows and the model reads.
function evidenceLines(s) {
  const e = s.evidence;
  const lines = [];
  if (e.publishedCount) {
    lines.push(
      `Ran before: ${e.publishedCount}x, last ${e.lastPublishedDate} in ${e.lastPublishedSection} (${e.daysSinceLastPublished}d before this issue)`
    );
  } else if (e.probableCount) {
    lines.push(
      `Probably ran before: ${e.probableCount}x, last ${e.probableLastPublishedDate} in ${e.probableLastPublishedSection} as "${e.probableLastAs}" (${e.probableDaysSince}d before; title match)`
    );
  } else {
    lines.push("Never published (no URL, record or title match in issue history / IssueItems)");
  }
  const rec = [];
  if (e.occurrencesInWindow > 1) rec.push(`${e.occurrencesInWindow} dates in window`);
  if (e.occurrencesInHorizon > e.occurrencesInWindow) rec.push(`${e.occurrencesInHorizon} in horizon`);
  if (e.venueLastDate) rec.push(`venue ran ${e.venueLastDate}`);
  if (e.organizerLastDate) rec.push(`organizer ran ${e.organizerLastDate}`);
  if (rec.length) lines.push(rec.join("; "));
  const tail = [];
  if (e.clickN) tail.push(`clicks: median pct ${e.clickMedianPct.toFixed(2)}, n=${e.clickN}`);
  if (!e.completeness.hasDescription) tail.push("no description on file");
  if (e.r7) tail.push(`R7 p_include ${e.r7.p_include.toFixed(2)}`);
  if (s.nearDupCluster) tail.push(`near-dup of: ${s.nearDupOf.slice(0, 2).join(" / ")}`);
  if (tail.length) lines.push(tail.join("; "));
  return lines.slice(0, 3);
}

// Occurrences of each series across every future-dated record in the snapshot (the horizon),
// so a weekly storytime shows as 8 in horizon even when only 2 fall in this window.
function horizonCounts(allRecords, fromIso) {
  const counts = new Map();
  for (const r of allRecords) {
    const start = ymd(r["Start Date"]);
    if (!start || start < fromIso || r.Status === "Rejected") continue;
    const k = normTitle(r["Event Title"]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

module.exports = {
  buildHistoryIndex, buildIssueItemsIndex, buildClickIndex, buildR7Index, attachEvidence, horizonCounts,
};
