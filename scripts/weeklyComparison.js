/**
 * weeklyComparison.js — after an issue publishes, join it against the lineup the system sent
 * (ship-plan item 13a; method: Decision_Log §100; why it exists: Decision_Log §106).
 *
 * For each published slot in the three event sections it reports one of:
 *   main_pick           supplied as one of the 5 picks
 *   alternative_shown   supplied as an alternative that was actually rendered to the editor
 *   in_pool_not_shown   a candidate that week, but not on screen
 *   never_candidate     no candidate carried that URL
 *   ambiguous           the data cannot decide — listed with every candidate, never guessed
 *
 * READ-ONLY. Reads local files under data/ only; writes one JSON file of its own under
 * data/tracking/weekly_comparison/. No Airtable, no network, no credentials.
 *
 * Usage:
 *   node scripts/weeklyComparison.js --issue 2026-09-17 --run-dir data/tracking/r6_demo/v2b_2026-09-17_snapshot_2026-09-12_1958
 *   node scripts/weeklyComparison.js --issue 2026-10-15 --picks path/to/picks.json
 * Options: --history <issue_history.json>  --snapshot <candidates_*.json>  --no-snapshot  --out <file>
 *
 * THE JOIN RULE (read before changing anything here):
 *   1. URL join. Published URL and candidate URL are compared by urlKey() — host without www, path
 *      without trailing slash, query sorted, tracking parameters dropped. Exact key equality only.
 *   2. Title-verified. A URL hit counts only if the candidate's title shares >= 2 significant words
 *      with the published text. This is what stops a shared listing page (one URL, many events)
 *      from producing a plausible wrong match. A URL hit that fails it is `ambiguous`, not a match.
 *   3. Occurrence identity. One URL can carry several dates. If the verified hits span more than one
 *      Start Date, the slot is matched only when a date written in the published URL or text selects
 *      exactly one of them. Otherwise the row goes to the ambiguous list with every occurrence shown.
 *   4. Pinned to the rendered slate. "Shown" means the 5 picks plus the alternatives the preview
 *      rendered: those with a replaceable slot, first RENDERED_ALTERNATIVES per section
 *      (issueBuild.js render(): `.filter(a=>a.replaceable_slots.length).slice(0,5)`; demo.js:249).
 *      Never all of allocation.json.
 *   Matching is by event, not by section: a slot published under Golden Age that was shown as a
 *   Couples alternative counts as supplied, and the row says the section differed.
 *
 * PICKS FILE (the --picks input; a run folder is converted to this same shape, so a console
 * submission can be passed later without touching the join):
 *   { "schema": "weekly-comparison-picks/1", "issue_date": "YYYY-MM-DD",
 *     "window": ["YYYY-MM-DD","YYYY-MM-DD"],                      // optional; default IssueDate+1..+10
 *     "source": { "kind": "run_folder" | "console_submission", "ref": "...", "signed_off": true|false|null },
 *     "picks":        [{ "section", "slot", "id", "title", "url", "start_date", "copy"? }],
 *     "alternatives": [{ "section", "position", "id", "title", "url", "start_date", "rendered": bool, "copy"? }],
 *     "pool":         [{ "id", "title", "url", "start_date", "stage"?, "in_window"? }] }
 *   `copy` is the exported blurb: { "display_title", "description", "cta" }. Omit it when none exists.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const HISTORY_PATH = path.join(REPO, "data/beehiiv/issue_history.json");
const OUT_DIR = path.join(REPO, "data/tracking/weekly_comparison");

const SECTIONS = ["For Families", "For Couples", "For Golden Age Readers"];
const SLOTS_PER_SECTION = 5;
// How many alternatives per section the editor preview renders. Pinned to the producer's render
// code, not to ALTERNATIVES (that constant is the thin-supply floor). The test file trips if the
// producer's literal changes.
const RENDERED_ALTERNATIVES = 5;
const MIN_TITLE_OVERLAP = 2;
const NO_CONSOLE = "not available: no console submission";
const NO_COPY = "not available: no exported copy for this run";

const CLASSES = ["main_pick", "alternative_shown", "in_pool_not_shown", "never_candidate", "ambiguous"];
const RANK = { main_pick: 3, alternative_shown: 2, in_pool_not_shown: 1, never_candidate: 0 };

// ---- URL normalisation: issueBuild.js urlKey(), plus the two Beehiiv params joinClicksData.js strips ----
function urlKey(value) {
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()])
      if (/^utm_/i.test(k) || ["fbclid", "gclid", "mc_cid", "mc_eid", "_bhlid", "acontext"].includes(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return u.hostname + u.pathname.replace(/\/$/, "") + u.search;
  } catch {
    return null;
  }
}
function pathKey(value) {
  try {
    const u = new URL(value);
    const p = u.pathname.replace(/\/$/, "");
    return p.length > 1 ? u.hostname.toLowerCase().replace(/^www\./, "") + p : null; // a bare domain identifies nothing
  } catch {
    return null;
  }
}

// ---- Title verification ----
// Function words, plus words so common in event titles here that sharing them proves nothing.
const STOP = new Set(("the and for with from your you our their this that these those into onto over under about are was will can all any " +
  "event events free class classes workshop workshops program programs session sessions night day days week weekend " +
  "show live family families kids adult adults senior seniors vaughan markham richmond hill toronto ontario presents presented").split(" "));
function words(text) {
  const out = new Set();
  for (let w of String(text || "").normalize("NFKD").toLowerCase().replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ")) {
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1); // basics/basic, shadows/shadow
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}
function sharedWords(a, b) {
  const x = words(a), y = words(b);
  return [...x].filter((w) => y.has(w));
}
const publishedText = (p) => [p.displayTitle, p.description, p.cta].filter(Boolean).join(" ");
function titleVerified(published, candidateTitle) {
  const shared = sharedWords(candidateTitle, publishedText(published));
  const need = Math.min(MIN_TITLE_OVERLAP, words(candidateTitle).size || MIN_TITLE_OVERLAP);
  return { ok: shared.length >= need && shared.length > 0, shared };
}

// ---- Dates ----
const day = (s) => (s ? String(s).slice(0, 10) : null);
function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const defaultWindow = (issue) => [addDays(issue, 1), addDays(issue, 10)];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Dates the published slot itself states: ISO dates in the URL, "Sept 26" style dates in the text.
// Used only to SELECT among several known occurrences — never to reject a match (a URL can carry
// an unrelated date, e.g. a calendar's `start=` parameter, and copy can quote a promo deadline).
function dateHints(published, issueDate) {
  const hints = new Set();
  let decoded = String(published.url || "");
  try { decoded = decodeURIComponent(decoded); } catch { /* keep raw */ }
  for (const m of decoded.matchAll(/(20\d{2})-(\d{2})-(\d{2})/g)) hints.add(m[0]);
  const year = Number(issueDate.slice(0, 4)), issueMonth = Number(issueDate.slice(5, 7));
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)/gi;
  for (const m of publishedText(published).matchAll(re)) {
    const mo = MONTHS[m[1].toLowerCase()], d = Number(m[2]);
    if (d < 1 || d > 31) continue;
    const y = mo < issueMonth - 6 ? year + 1 : year; // a January date in a December issue
    hints.add(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return [...hints].sort();
}

// ---- Copy ----
const squash = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// The history parser sometimes folds the description into displayTitle, so the three fields are
// compared as one run of text rather than field by field.
function compareCopy(published, copy) {
  if (!copy) return { status: "not available" };
  const a = squash(publishedText(published)), b = squash([copy.display_title, copy.description, copy.cta].filter(Boolean).join(" "));
  if (!b) return { status: "not available" };
  if (a === b) return { status: "identical", similarity: 1 };
  const x = new Set(a.split(" ")), y = new Set(b.split(" "));
  const inter = [...x].filter((w) => y.has(w)).length;
  return { status: "differs", similarity: +(inter / (x.size + y.size - inter || 1)).toFixed(2) };
}

// ---- Lineup: one shape for a run folder today and a console submission later ----
function normalizeLineup(raw) {
  if (!raw || !raw.issue_date) throw new Error("picks file: issue_date is required");
  const window = raw.window || defaultWindow(raw.issue_date);
  const inWindow = (d) => (d ? d >= window[0] && d <= window[1] : null);
  const byId = new Map();
  const add = (e, stage) => {
    if (!e.id) throw new Error("picks file: every entry needs an id");
    const prev = byId.get(e.id);
    const start = day(e.start_date);
    const iw = e.in_window != null ? e.in_window : inWindow(start);
    if (!prev) byId.set(e.id, { id: e.id, title: e.title || "", url: e.url || null, start_date: start, stage: e.stage || stage, in_window: iw });
  };
  const picks = (raw.picks || []).map((p) => ({ ...p, start_date: day(p.start_date) }));
  const alternatives = (raw.alternatives || []).map((a) => ({ ...a, start_date: day(a.start_date), rendered: a.rendered === true }));
  // Pool first so its stage labels win; picks and alternatives are added in case the pool omits them.
  for (const e of raw.pool || []) add(e, "pool");
  for (const p of picks) add(p, "main_pick");
  for (const a of alternatives) add(a, a.rendered ? "alternative_shown" : "alternative_not_rendered");
  return {
    schema: "weekly-comparison-picks/1", issue_date: raw.issue_date, window,
    source: raw.source || { kind: "picks_file", ref: null, signed_off: null },
    picks, alternatives, pool: [...byId.values()],
  };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

// Converts a producer run folder (data/tracking/issue_build/* or the older r6_demo/*) to the picks shape.
function lineupFromRunDir(runDir, opts = {}) {
  const need = (f) => {
    const p = path.join(runDir, f);
    if (!fs.existsSync(p)) throw new Error(`${runDir}: ${f} is missing — not a finalized run folder`);
    return readJson(p);
  };
  const optional = (f) => (fs.existsSync(path.join(runDir, f)) ? readJson(path.join(runDir, f)) : null);
  const evidence = need("evidence_inputs.json"), allocation = need("allocation.json"), prep = optional("preparation_manifest.json");
  // The wider Candidates snapshot: records the gate or the window dropped before this run saw them.
  let snapshotPath = opts.snapshot === false ? null : opts.snapshot ? path.resolve(opts.snapshot) : null;
  if (!snapshotPath && opts.snapshot !== false && prep?.inputs?.candidates?.path) snapshotPath = path.join(REPO, prep.inputs.candidates.path);
  if (opts.snapshot && opts.snapshot !== false && !fs.existsSync(snapshotPath)) throw new Error(`snapshot ${snapshotPath} not found`);
  const haveSnapshot = snapshotPath && fs.existsSync(snapshotPath);
  return lineupFromRunData({
    evidence, allocation, ranked: optional("ranked_pool.json"), packet: optional("ranking_packet.json"),
    snapshot: haveSnapshot ? readJson(snapshotPath) : null,
    snapshotRef: haveSnapshot ? path.relative(REPO, snapshotPath).replace(/\\/g, "/") : null,
    ref: path.relative(REPO, path.resolve(runDir)).replace(/\\/g, "/"),
    signedOff: fs.existsSync(path.join(runDir, "human_review.json")) ? true : null, // older r6_demo folders have no sign-off file
  });
}

// Pure half of the conversion (no file access), so the rendered-window rule is testable.
function lineupFromRunData({ evidence, allocation, ranked = null, packet = null, snapshot = null, snapshotRef = null, ref = null, signedOff = null }) {
  const cand = new Map(evidence.candidates.map((c) => [c.record_id, c]));
  const fields = (id) => {
    const c = cand.get(id);
    if (!c) throw new Error(`allocation references ${id}, which is not in evidence_inputs.json`);
    const f = c.snapshot_fields;
    return { id, title: f["Event Title"] || "", url: f.URL || null, start_date: day(f["Start Date"]) };
  };

  const picks = allocation.picks.map((p) => ({ section: p.Section, slot: p.Slot, ...fields(p.ItemID) }));
  const alternatives = [];
  for (const section of Object.keys(allocation.alternatives || {})) {
    let shown = 0;
    allocation.alternatives[section].forEach((a, i) => {
      // Mirrors the preview: only alternatives with a replaceable slot are rendered, first N of them.
      const rendered = a.replaceable_slots.length > 0 && ++shown <= RENDERED_ALTERNATIVES;
      alternatives.push({ section, position: i + 1, rendered, replaceable_slots: a.replaceable_slots, ...fields(a.id) });
    });
  }

  const rankedIds = new Set((ranked?.sections || []).flatMap((s) => s.ordered.map((r) => r.id)));
  const excludedIds = new Set((ranked?.exclusions || []).map((r) => r.id));
  const shortlistIds = new Set((packet?.candidates || []).map((c) => c.record_id));
  const stageOf = (id) =>
    rankedIds.has(id) ? "ranked_not_on_screen" : excludedIds.has(id) ? "excluded_by_model"
      : shortlistIds.has(id) ? "shortlisted_not_ranked" : "survivor_not_shortlisted";
  const pool = evidence.candidates.map((c) => ({ ...fields(c.record_id), stage: stageOf(c.record_id), in_window: true }));

  const window = evidence.window || defaultWindow(evidence.issue_date);
  for (const r of snapshot?.records || []) {
    if (cand.has(r.id)) continue;
    const start = day(r.fields["Start Date"]);
    const iw = start ? start >= window[0] && start <= window[1] : null;
    pool.push({ id: r.id, title: r.fields["Event Title"] || "", url: r.fields.URL || null, start_date: start,
      stage: iw ? "in_snapshot_in_window_not_a_survivor" : "in_snapshot_outside_window", in_window: iw });
  }

  return normalizeLineup({
    issue_date: evidence.issue_date, window,
    source: { kind: "run_folder", ref, signed_off: signedOff, snapshot: snapshotRef },
    picks, alternatives, pool,
  });
}

// ---- The join ----
function buildIndex(lineup) {
  const roles = new Map(); // id -> [{kind, section, slot|position, copy}]
  const addRole = (id, role) => { if (!roles.has(id)) roles.set(id, []); roles.get(id).push(role); };
  for (const p of lineup.picks) addRole(p.id, { kind: "main_pick", section: p.section, slot: p.slot, copy: p.copy || null });
  for (const a of lineup.alternatives)
    addRole(a.id, { kind: a.rendered ? "alternative_shown" : "alternative_not_rendered", section: a.section, position: a.position, copy: a.copy || null });
  const byUrl = new Map(), byPath = new Map();
  for (const e of lineup.pool) {
    const k = urlKey(e.url), p = pathKey(e.url);
    if (k) { if (!byUrl.has(k)) byUrl.set(k, []); byUrl.get(k).push(e); }
    if (p) { if (!byPath.has(p)) byPath.set(p, []); byPath.get(p).push(e); }
  }
  return { roles, byUrl, byPath };
}

// Best standing of one record: main pick beats shown alternative beats pool; same section breaks ties.
function standing(entry, section, index) {
  const all = index.roles.get(entry.id) || [];
  const scored = all
    .map((r) => ({ r, cls: r.kind === "alternative_not_rendered" ? "in_pool_not_shown" : r.kind }))
    .sort((a, b) => RANK[b.cls] - RANK[a.cls] || (b.r.section === section) - (a.r.section === section));
  const best = scored[0];
  return {
    cls: best ? best.cls : "in_pool_not_shown",
    role: best ? best.r : null,
    all_roles: all.map(({ copy, ...r }) => r),
  };
}

const show = (e, extra = {}) => ({ id: e.id, title: e.title, start_date: e.start_date, url: e.url, stage: e.stage, ...extra });

// Programme level: the same listing on any date. `class` keeps occurrence identity (the exact date);
// `programme_class` is the looser answer — a different showing of a programme we showed still counts
// as supplied (Ariel, 2026-10-11). Both are reported, so neither hides inside the other.
function setProgramme(row, entries, section, index) {
  const best = entries.map((e) => ({ e, s: standing(e, section, index) })).sort((a, b) => RANK[b.s.cls] - RANK[a.s.cls])[0];
  if (!best) return;
  row.programme_class = best.s.cls;
  row.programme_match = { id: best.e.id, title: best.e.title, start_date: best.e.start_date };
}

function classifySlot(published, lineup, index) {
  const row = {
    section: published.section, slot: published.slot, published_title: published.displayTitle || "", published_url: published.url || null,
    class: null, flags: [], matched: null, candidates: [], leads: [], copy: { status: "not available" },
  };
  const key = urlKey(published.url);
  if (!key) { row.class = "ambiguous"; row.reason = "published slot has no usable URL — cannot be joined"; return row; }

  const hits = index.byUrl.get(key) || [];
  const describe = (e) => {
    const s = standing(e, published.section, index), v = titleVerified(published, e.title);
    return show(e, { class_if_this_one: e.in_window === false ? null : s.cls, roles: s.all_roles, title_words_shared: v.shared, title_verified: v.ok });
  };
  const inWin = hits.filter((e) => e.in_window !== false);
  const outWin = hits.filter((e) => e.in_window === false);

  if (!inWin.length) {
    const verifiedOut = outWin.filter((e) => titleVerified(published, e.title).ok);
    if (verifiedOut.length) {
      row.class = "ambiguous";
      row.reason = "the URL is known only with dates outside this issue's window — same event on another date, or an occurrence the window excluded";
      row.candidates = verifiedOut.slice(0, 12).map(describe);
      return row;
    }
    row.class = "never_candidate";
    if (outWin.length) row.flags.push("URL seen on unrelated-looking records outside the window (titles did not verify)");
    // Leads only: the URL join found nothing, but the pool may hold the same event under another link.
    const seen = new Set();
    const lead = (e, kind) => {
      if (seen.has(e.id) || row.leads.length >= 5) return;
      seen.add(e.id);
      row.leads.push(show(e, { lead: kind, class_if_this_one: standing(e, published.section, index).cls }));
    };
    const pk = pathKey(published.url);
    const samePage = ((pk && index.byPath.get(pk)) || []).filter((e) => e.in_window !== false && titleVerified(published, e.title).ok);
    for (const e of samePage) lead(e, "same page, different query string");
    // Same page and a verified title, differing only in the query string (usually the date): same programme.
    setProgramme(row, samePage, published.section, index);
    for (const e of lineup.pool) {
      if (e.in_window === false) continue;
      const shared = sharedWords(e.title, published.displayTitle);
      const size = words(e.title).size;
      if (shared.length >= 2 && shared.length / size >= 0.6) lead(e, "similar title, different URL");
    }
    if (row.leads.length) row.flags.push("possible same event in the pool under a different URL — not counted, needs a human");
    return row;
  }

  const verified = inWin.filter((e) => titleVerified(published, e.title).ok);
  if (!verified.length) {
    row.class = "ambiguous";
    row.reason = "URL matches a candidate but the titles do not verify — shared listing page, or a heavily rewritten title";
    row.candidates = inWin.slice(0, 12).map(describe);
    return row;
  }

  // Occurrence identity: group the verified hits by date.
  const occurrences = new Map();
  for (const e of verified) { const d = e.start_date || "unknown"; if (!occurrences.has(d)) occurrences.set(d, []); occurrences.get(d).push(e); }
  setProgramme(row, verified, published.section, index);
  let chosen = null;
  if (occurrences.size === 1) {
    // One known occurrence is not proof it is the one that ran: if the published slot states dates and
    // none is this one, the exact match is not claimed. The programme-level answer above still stands.
    const [date, entries] = [...occurrences.entries()][0];
    const stated = dateHints(published, lineup.issue_date);
    if (date !== "unknown" && stated.length && !stated.includes(date)) {
      row.class = "ambiguous";
      row.reason = `the pool holds this listing only on ${date}; the published slot states ${stated.join(", ")}`;
      row.candidates = verified.slice(0, 12).map(describe);
      row.best_case = row.programme_class;
      return row;
    }
    chosen = entries;
  } else {
    const hints = dateHints(published, lineup.issue_date).filter((h) => occurrences.has(h));
    if (hints.length === 1) { chosen = occurrences.get(hints[0]); row.occurrence_resolved_by = "date stated in the published URL or text: " + hints[0]; }
  }

  if (!chosen) {
    const perOccurrence = [...occurrences.entries()].map(([d, es]) => {
      const best = es.map((e) => standing(e, published.section, index)).sort((a, b) => RANK[b.cls] - RANK[a.cls])[0];
      return { date: d, cls: best.cls };
    });
    const classes = [...new Set(perOccurrence.map((o) => o.cls))].sort((a, b) => RANK[b] - RANK[a]);
    row.candidates = verified.slice(0, 20).map(describe);
    row.occurrences = perOccurrence;
    row.reason = `the URL carries ${occurrences.size} dates in the pool (${[...occurrences.keys()].sort().join(", ")}) and nothing published says which one ran`;
    if (classes.length === 1) {
      // Which occurrence is unknown, but every occurrence gives the same answer, so the class is not in doubt.
      row.class = classes[0];
      row.flags.push("occurrence undetermined — class is the same under every candidate date");
      row.occurrence_ambiguous = true;
    } else {
      row.class = "ambiguous";
      row.best_case = classes[0];
      row.worst_case = classes[classes.length - 1];
    }
    return row;
  }

  // One occurrence. Several records can still share it (duplicates); take the best standing.
  const ranked = chosen.map((e) => ({ e, s: standing(e, published.section, index) })).sort((a, b) => RANK[b.s.cls] - RANK[a.s.cls]);
  const { e, s } = ranked[0];
  row.class = s.cls;
  row.matched = show(e, { roles: s.all_roles, title_words_shared: titleVerified(published, e.title).shared });
  row.matched_as = s.role ? { kind: s.role.kind, section: s.role.section, slot: s.role.slot, position: s.role.position } : null;
  if (ranked.length > 1) row.flags.push(`${ranked.length} pool records share this URL and date — best standing used`);
  if (s.role && s.cls !== "in_pool_not_shown") {
    row.section_agrees = s.role.section === published.section;
    if (!row.section_agrees) row.flags.push(`shown under ${s.role.section}, published under ${published.section}`);
    row.copy = compareCopy(published, s.role.copy);
  }
  return row;
}

function compare({ issueDate, published, lineup }) {
  if (lineup.issue_date !== issueDate) throw new Error(`lineup is for ${lineup.issue_date}, not ${issueDate} — refusing to join across issues`);
  const index = buildIndex(lineup);
  const slots = published.filter((p) => SECTIONS.includes(p.section));
  const rows = slots.map((p) => classifySlot(p, lineup, index));
  const warnings = [];
  for (const s of SECTIONS) {
    const n = rows.filter((r) => r.section === s).length;
    if (n !== SLOTS_PER_SECTION) warnings.push(`${s}: ${n} published slots found, expected ${SLOTS_PER_SECTION} — totals use what was found`);
  }
  // One pool record answering two published slots is a sign something is off.
  const claimed = new Map();
  for (const r of rows) if (r.matched) { if (!claimed.has(r.matched.id)) claimed.set(r.matched.id, []); claimed.get(r.matched.id).push(r); }
  for (const rs of claimed.values()) if (rs.length > 1) for (const r of rs) r.flags.push("the same pool record also matches another published slot");
  if (lineup.source.signed_off !== true) warnings.push("the lineup source carries no sign-off record (human_review.json) — treated as the sent lineup on the operator's word");

  const count = (f) => rows.filter(f).length;
  const totals = Object.fromEntries(CLASSES.map((c) => [c, count((r) => r.class === c)]));
  const supplied = totals.main_pick + totals.alternative_shown;
  const ambiguousRows = rows.filter((r) => r.class === "ambiguous" || r.occurrence_ambiguous);
  const isSupplied = (c) => c === "main_pick" || c === "alternative_shown";
  // Programme level: the exact answer where there is one, otherwise the same listing on another date.
  const programmeOf = (r) => (isSupplied(r.class) ? r.class : r.programme_class || r.class);
  for (const r of rows) if (!isSupplied(r.class) && isSupplied(r.programme_class))
    r.flags.push(`same programme as a shown event (${r.programme_match.start_date || "no date"}), on a different or unconfirmed date — counted at programme level only`);
  const leadCouldBeSupplied = count((r) => r.class === "never_candidate" && r.leads.some((c) => isSupplied(c.class_if_this_one)));
  const couldBeSupplied = count((r) => r.class === "ambiguous" && (r.best_case === "main_pick" || r.best_case === "alternative_shown"
    || (!r.best_case && r.candidates.some((c) => c.class_if_this_one === "main_pick" || c.class_if_this_one === "alternative_shown"))));
  const bySection = Object.fromEntries(SECTIONS.map((s) => [s, Object.fromEntries(CLASSES.map((c) => [c, count((r) => r.section === s && r.class === c)]))]));

  const anyCopy = [...lineup.picks, ...lineup.alternatives].some((e) => e.copy);
  const suppliedRows = rows.filter((r) => r.class === "main_pick" || r.class === "alternative_shown");
  const copy_use = anyCopy
    ? { identical: suppliedRows.filter((r) => r.copy.status === "identical").length, differs: suppliedRows.filter((r) => r.copy.status === "differs").length,
        not_available: suppliedRows.filter((r) => r.copy.status === "not available").length, of_supplied_slots: suppliedRows.length }
    : NO_COPY;
  if (!anyCopy) for (const r of rows) r.copy = { status: NO_COPY };

  const publishedIds = new Set(rows.filter((r) => r.class === "main_pick" && r.matched_as?.kind === "main_pick").map((r) => r.matched.id));
  const sentPicksNotPublished = lineup.picks.filter((p) => !publishedIds.has(p.id)).map((p) => ({ section: p.section, slot: p.slot, id: p.id, title: p.title }));

  return {
    issue_date: issueDate, window: lineup.window, source: lineup.source,
    published_slots: rows.length,
    totals: {
      ...totals, supplied, supplied_same_section: count((r) => RANK[r.class] >= 2 && r.section_agrees === true),
      supplied_same_programme: count((r) => isSupplied(programmeOf(r))),
      supplied_if_every_ambiguous_row_resolves_in_favour: supplied + couldBeSupplied,
      never_candidate_with_a_lead_to_review: count((r) => r.class === "never_candidate" && r.leads.length > 0),
      // Upper bound only. The URL join undercounts when the editor links the same event through a different page.
      supplied_if_every_ambiguous_row_and_every_lead_also_resolves_in_favour: supplied + couldBeSupplied + leadCouldBeSupplied,
    },
    by_section: bySection,
    copy_use,
    not_available: { confirmed_and_published: NO_CONSOLE, changed_after_confirm: NO_CONSOLE, self_filled: NO_CONSOLE },
    // Not "changed after confirm": the editor never confirmed these, they are simply sent picks he did not run.
    sent_picks_not_published: { count: sentPicksNotPublished.length, of: lineup.picks.length, picks: sentPicksNotPublished },
    rendered_alternatives_per_section: RENDERED_ALTERNATIVES,
    pool_size: { in_window: lineup.pool.filter((e) => e.in_window !== false).length, outside_window: lineup.pool.filter((e) => e.in_window === false).length },
    warnings, ambiguous: ambiguousRows, rows,
  };
}

// ---- Report ----
function formatReport(r) {
  const t = r.totals, n = r.published_slots, L = [];
  const label = (row) => `${row.section} #${row.slot}  "${row.published_title.slice(0, 60)}"`;
  L.push(`Weekly comparison — issue ${r.issue_date}, window ${r.window[0]} to ${r.window[1]}`);
  L.push(`Lineup: ${r.source.kind} ${r.source.ref || ""}${r.source.signed_off === true ? " (signed off)" : " (no sign-off record)"}`);
  L.push("");
  L.push(`Published slots: ${n}`);
  L.push(`  Supplied by the system:      ${t.supplied_same_programme} of ${n}   (same programme, any date)`);
  L.push(`    on the exact date shown:   ${t.supplied} of ${n}   (same section as shown: ${t.supplied_same_section})`);
  L.push(`    from main picks:           ${t.main_pick}`);
  L.push(`    from shown alternatives:   ${t.alternative_shown}   (first ${r.rendered_alternatives_per_section} per section)`);
  L.push(`  In the pool, not shown:      ${t.in_pool_not_shown}`);
  L.push(`  Never a candidate:           ${t.never_candidate}${t.never_candidate_with_a_lead_to_review ? `   (${t.never_candidate_with_a_lead_to_review} with a lead to review)` : ""}`);
  L.push(`  Ambiguous, needs a human:    ${t.ambiguous}${t.ambiguous ? `   (supplied would be ${t.supplied_if_every_ambiguous_row_resolves_in_favour} if every one resolved in favour)` : ""}`);
  L.push(`  Supplied, upper bound:       ${t.supplied_if_every_ambiguous_row_and_every_lead_also_resolves_in_favour} of ${n}   (only if every ambiguous row and every different-URL lead below is confirmed by a person)`);
  L.push("");
  for (const s of SECTIONS) { const b = r.by_section[s]; L.push(`  ${s.padEnd(24)} picks ${b.main_pick} · alternatives ${b.alternative_shown} · pool ${b.in_pool_not_shown} · never ${b.never_candidate} · ambiguous ${b.ambiguous}`); }
  L.push("");
  L.push(`Sent picks not published: ${r.sent_picks_not_published.count} of ${r.sent_picks_not_published.of}`);
  L.push(`Exported copy used: ${typeof r.copy_use === "string" ? r.copy_use : `identical ${r.copy_use.identical}, differs ${r.copy_use.differs}, not available ${r.copy_use.not_available} (of ${r.copy_use.of_supplied_slots} supplied slots)`}`);
  L.push(`Confirmed and published: ${r.not_available.confirmed_and_published}`);
  L.push(`Changed after confirm:   ${r.not_available.changed_after_confirm}`);
  L.push(`Self-filled:             ${r.not_available.self_filled}`);
  for (const w of r.warnings) L.push(`WARNING: ${w}`);

  L.push("", `AMBIGUOUS — ${r.ambiguous.length} row(s), not guessed:`);
  for (const row of r.ambiguous) {
    L.push(`  ${label(row)}${row.class !== "ambiguous" ? `  [counted as ${row.class}]` : ""}`);
    L.push(`    ${row.reason}`);
    for (const c of row.candidates) L.push(`      - ${c.start_date || "no date"}  ${c.class_if_this_one || "outside window"}  ${c.id}  "${c.title.slice(0, 55)}"${c.title_verified ? "" : "  (title not verified)"}`);
  }
  const flagged = r.rows.filter((row) => row.flags.length && !r.ambiguous.includes(row));
  L.push("", `FLAGGED — ${flagged.length} row(s) counted under the class shown in brackets, worth a look:`);
  for (const row of flagged) {
    L.push(`  ${label(row)}  [${row.class}]`);
    for (const f of row.flags) L.push(`    ${f}`);
    for (const c of row.leads) L.push(`      - ${c.lead}: ${c.start_date || "no date"}  ${c.class_if_this_one}  ${c.id}  "${c.title.slice(0, 55)}"`);
  }
  return L.join("\n");
}

// ---- CLI ----
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-snapshot") o.snapshot = false;
    else if (["--issue", "--run-dir", "--picks", "--history", "--snapshot", "--out"].includes(a)) {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      o[a.slice(2).replace(/-(.)/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else throw new Error(`unknown argument ${a}`);
  }
  return o;
}
function stamp() {
  const d = new Date(), p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function loadPublished(historyPath, issueDate) {
  const history = readJson(historyPath);
  const issues = history.filter((i) => day(i.date) === issueDate);
  if (!issues.length) throw new Error(`${issueDate} is not in ${path.basename(historyPath)} — refresh it with fetchBeehiivHistory.js after the issue publishes`);
  if (issues.length > 1) throw new Error(`${issueDate} appears ${issues.length} times in ${path.basename(historyPath)} — cannot tell which is the published issue`);
  return issues[0];
}

function main(argv) {
  const o = parseArgs(argv);
  if (!o.issue || !/^\d{4}-\d{2}-\d{2}$/.test(o.issue)) throw new Error("--issue YYYY-MM-DD is required");
  if (!o.runDir === !o.picks) throw new Error("pass exactly one of --run-dir <run folder> or --picks <picks file>");
  const historyPath = o.history ? path.resolve(o.history) : HISTORY_PATH;
  const issue = loadPublished(historyPath, o.issue);
  const lineup = o.runDir ? lineupFromRunDir(path.resolve(o.runDir), { snapshot: o.snapshot }) : normalizeLineup(readJson(path.resolve(o.picks)));
  const result = compare({ issueDate: o.issue, published: issue.events || [], lineup });
  result.generated_at = new Date().toISOString();
  result.inputs = { history: path.relative(REPO, historyPath).replace(/\\/g, "/"), issue_slug: issue.slug, picks_file: o.picks || null, run_dir: o.runDir || null };
  result.join_rule = "URL join (normalised, exact) + title verification (>= 2 shared significant words) + occurrence identity (several dates on one URL are never resolved by guessing, and a stated date that contradicts the one known occurrence is not claimed); shown = picks + rendered alternatives only. Decision_Log 100. supplied_same_programme additionally counts the same listing on another date.";
  // The lineup that was joined, minus the pool, so the output file stands alone.
  result.lineup = { picks: lineup.picks, alternatives: lineup.alternatives };

  console.log(formatReport(result));
  let out = o.out ? path.resolve(o.out) : null;
  if (!out) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tag = (lineup.source.ref ? path.basename(lineup.source.ref) : "picks").replace(/[^A-Za-z0-9_.-]+/g, "_");
    out = path.join(OUT_DIR, `weekly_comparison_${o.issue}_${tag}_${stamp()}.json`);
  }
  if (fs.existsSync(out)) throw new Error(`${out} already exists — not overwriting`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`\nFull per-slot detail: ${out}`);
}

module.exports = { SECTIONS, RENDERED_ALTERNATIVES, NO_CONSOLE, NO_COPY, urlKey, pathKey, words, titleVerified, dateHints, compareCopy,
  normalizeLineup, lineupFromRunDir, lineupFromRunData, classifySlot, compare, formatReport, parseArgs };

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error("weeklyComparison: " + e.message); process.exit(1); }
}
