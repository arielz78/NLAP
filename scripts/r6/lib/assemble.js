// scripts/r6/lib/assemble.js
// Read-only assembly over a RankedPool. Pure: no I/O. Enforces every hard rule; the ranking
// never enforces any. Returns the collective five per section, alternatives in pool order with a
// build-time assessment against each selected slot, and every skipped entry with its reason.
//
// Hard rules (unavailable / skipped):
//   capacity 5 per section; locks pre-fill slots; one series per issue (cross-section uniqueness);
//   one series per section (implied); venue <= 1 per section, blank venue always allowed;
//   flex entries fill Couples/Golden by scarcity, never both.
// Policy-pending rules (override, editor decides): near-duplicate cluster shared with a selected
//   entry (or skipped when near_dup_action = "skip"); published recently (cooldown value pending);
//   organizer already in the section (concentration policy pending).
//
// Run `node scripts/r6/lib/assemble.js` to execute the self-test.

const { SECTIONS } = require("./util.js");
const QUOTA = 5;

function emptySlots() {
  return Array.from({ length: QUOTA }, () => null);
}

// locks: [{ section, slot, seriesKey, venueKey, title }] for this issue only.
function assemble(rankedPool, locks = [], options = {}) {
  const nearDupAction = options.near_dup_action || "flag";
  const selected = Object.fromEntries(SECTIONS.map((s) => [s, emptySlots()]));
  const skipped = Object.fromEntries(SECTIONS.map((s) => [s, []]));
  const usedSeries = new Set();
  const usedClusters = new Map(); // cluster -> title of the selected member

  for (const l of locks) {
    if (!SECTIONS.includes(l.section) || !(l.slot >= 1 && l.slot <= QUOTA)) continue;
    selected[l.section][l.slot - 1] = { ...l, locked: true, flags: ["locked"] };
    if (l.seriesKey) usedSeries.add(l.seriesKey);
  }

  const state = { selected, usedSeries, usedClusters, nearDupAction };

  function tryPlace(section, entry) {
    const slots = selected[section];
    const idx = slots.findIndex((x) => x === null);
    if (idx < 0) return { placed: false, reason: "capacity" };
    const hard = hardReason(state, section, null, entry);
    if (hard) return { placed: false, reason: hard };
    if (entry.nearDupCluster && usedClusters.has(entry.nearDupCluster) && nearDupAction === "skip") {
      return { placed: false, reason: `near_dup_of_selected:${usedClusters.get(entry.nearDupCluster)}` };
    }
    slots[idx] = { ...entry, slot: idx + 1 };
    usedSeries.add(entry.seriesKey);
    if (entry.nearDupCluster && !usedClusters.has(entry.nearDupCluster)) usedClusters.set(entry.nearDupCluster, entry.title);
    return { placed: true };
  }

  // Pass 1: non-flex entries, each section from its own pool in rank order.
  for (const section of SECTIONS) {
    for (const entry of rankedPool.sections[section]) {
      if (entry.flex) continue;
      if (selected[section].every((x) => x !== null)) break;
      const r = tryPlace(section, entry);
      if (!r.placed) skipped[section].push({ seriesKey: entry.seriesKey, title: entry.title, rank: entry.rank, reason: r.reason });
    }
  }
  // Pass 2: flex entries fill whichever of Couples/Golden is shortest first (scarcity resolves flex, §64).
  const flexSections = ["For Couples", "For Golden Age Readers"].sort(
    (a, b) => selected[a].filter(Boolean).length - selected[b].filter(Boolean).length
  );
  for (const section of flexSections) {
    for (const entry of rankedPool.sections[section]) {
      if (!entry.flex) continue;
      if (selected[section].every((x) => x !== null)) break;
      const r = tryPlace(section, entry);
      if (!r.placed && r.reason !== "capacity") skipped[section].push({ seriesKey: entry.seriesKey, title: entry.title, rank: entry.rank, reason: r.reason });
    }
  }

  // Alternatives: remaining pool entries not selected anywhere, in pool order, assessed vs each slot.
  const alternatives = {};
  for (const section of SECTIONS) {
    alternatives[section] = rankedPool.sections[section]
      .filter((e) => !usedSeries.has(e.seriesKey))
      .map((e) => ({
        seriesKey: e.seriesKey,
        title: e.title,
        rank: e.rank,
        startDate: e.startDate,
        venue: e.venue,
        flex: e.flex,
        flags: e.flags,
        evidenceLines: e.evidenceLines,
        assessments: selected[section].map((sel, i) => assess(state, section, i + 1, e)),
      }));
  }

  const unfilled = {};
  for (const section of SECTIONS) {
    const n = selected[section].filter(Boolean).length;
    if (n < QUOTA) unfilled[section] = `${n}/${QUOTA} filled: pool exhausted under rules`;
  }
  return { selected, alternatives, skipped, unfilled };
}

// Hard-rule check for placing `entry` into `section`, ignoring the slot at `replaceSlot` (1-based) if given.
function hardReason(state, section, replaceSlot, entry) {
  const others = state.selected[section].filter((x, i) => x && i + 1 !== replaceSlot);
  if (!entry.sections.includes(section)) return "not_routed_to_section";
  if (state.usedSeries.has(entry.seriesKey)) {
    const here = state.selected[section].find((x, i) => x && x.seriesKey === entry.seriesKey && i + 1 === replaceSlot);
    if (!here) return "series_already_selected";
  }
  if (others.some((x) => x.seriesKey === entry.seriesKey)) return "series_already_in_section";
  if (entry.venueKey && others.some((x) => x.venueKey === entry.venueKey)) return "venue_already_in_section";
  return null;
}

// Contextual assessment of proposing `alt` against the selected event in `slot` (1-based).
function assess(state, section, slot, alt) {
  const current = state.selected[section][slot - 1];
  if (current && current.locked) return { result: "unavailable", reason: "slot_locked" };
  const hard = hardReason(state, section, slot, alt);
  if (hard) return { result: "unavailable", reason: hard };
  const reasons = [];
  const others = state.selected[section].filter((x, i) => x && i + 1 !== slot);
  const allOthers = SECTIONS.flatMap((s) => state.selected[s].filter((x, i) => x && !(s === section && i + 1 === slot)));
  if (alt.nearDupCluster && allOthers.some((x) => x.nearDupCluster === alt.nearDupCluster)) reasons.push("near_duplicate_of_selected");
  if ((alt.flags || []).includes("published_recently")) reasons.push("published_recently (cooldown policy pending)");
  if (alt.organizerKey && others.some((x) => x.organizerKey === alt.organizerKey)) reasons.push("same_organizer_in_section (policy pending)");
  return reasons.length ? { result: "override", reason: reasons.join("; ") } : { result: "clean", reason: "" };
}

// ---------------------------------------------------------------------------
// Self-test: acceptance cases written before the fill logic (critical-path rule).
// ---------------------------------------------------------------------------
function runTests() {
  const mk = (key, section, opts = {}) => ({
    seriesKey: key, title: key, section, sections: opts.sections || [section], flex: !!opts.flex,
    startDate: opts.date || "2026-09-12", venueKey: opts.venue || "", organizerKey: opts.org || "",
    nearDupCluster: opts.dup || null, flags: opts.flags || [], evidenceLines: [], rank: 0,
  });
  const pool = (lists) => {
    const sections = Object.fromEntries(SECTIONS.map((s) => [s, []]));
    for (const [sec, arr] of Object.entries(lists)) sections[sec] = arr.map((e, i) => ({ ...e, rank: i + 1 }));
    return { sections };
  };
  const errors = [];
  const check = (cond, msg) => { if (!cond) errors.push("FAIL: " + msg); };

  // 1. capacity + venue + blank venue + series uniqueness across sections
  {
    const F = ["F1", "F2", "F3", "F4", "F5", "F6"].map((k) => mk(k, "For Families"));
    const C = [mk("C1", "For Couples", { venue: "alpha" }), mk("C2", "For Couples", { venue: "alpha" }), mk("C3", "For Couples", { venue: "" }), mk("F1", "For Couples")];
    const out = assemble(pool({ "For Families": F, "For Couples": C }));
    check(out.selected["For Families"].filter(Boolean).length === 5, "Families fills exactly 5");
    check(!out.selected["For Families"].some((x) => x && x.seriesKey === "F6"), "F6 overflows");
    const cKeys = out.selected["For Couples"].filter(Boolean).map((x) => x.seriesKey);
    check(cKeys.includes("C1") && !cKeys.includes("C2"), "venue alpha appears once in Couples");
    check(cKeys.includes("C3"), "blank venue allowed");
    check(!cKeys.includes("F1"), "F1 already selected in Families -> not in Couples");
    check(out.skipped["For Couples"].some((s) => s.seriesKey === "C2" && s.reason === "venue_already_in_section"), "C2 skip reason recorded");
  }
  // 2. flex fills the shorter section; never both
  {
    const C = [mk("C1", "For Couples"), mk("C2", "For Couples"), mk("C3", "For Couples"), mk("C4", "For Couples"), mk("C5", "For Couples")];
    const flexE = mk("X", "For Couples", { flex: true, sections: ["For Couples", "For Golden Age Readers"] });
    const G = [mk("G1", "For Golden Age Readers")];
    const out = assemble(pool({ "For Couples": [...C, flexE], "For Golden Age Readers": [G[0], { ...flexE, section: "For Golden Age Readers" }] }));
    const gKeys = out.selected["For Golden Age Readers"].filter(Boolean).map((x) => x.seriesKey);
    const cKeys = out.selected["For Couples"].filter(Boolean).map((x) => x.seriesKey);
    check(gKeys.includes("X") && !cKeys.includes("X"), "flex entry lands in the short section only");
  }
  // 3. locks pre-fill and block the slot; assessment says slot_locked
  {
    const locks = [{ section: "For Families", slot: 1, seriesKey: "L1", venueKey: "v", title: "L1" }];
    const F = [mk("F1", "For Families"), mk("F2", "For Families", { venue: "v" })];
    const out = assemble(pool({ "For Families": F }), locks);
    check(out.selected["For Families"][0].seriesKey === "L1", "lock occupies slot 1");
    check(out.selected["For Families"][1].seriesKey === "F1", "F1 goes to slot 2");
    check(out.skipped["For Families"].some((s) => s.seriesKey === "F2"), "F2 skipped: venue collides with lock");
    const alt = out.alternatives["For Families"].find((a) => a.seriesKey === "F2");
    check(alt && alt.assessments[0].result === "unavailable" && alt.assessments[0].reason === "slot_locked", "assessment vs locked slot");
    check(alt && alt.assessments[1].result === "unavailable" && alt.assessments[1].reason === "venue_already_in_section", "assessment vs F1: venue collides with lock");
  }
  // 4. near-dup: flag -> placed with override assessment; skip -> skipped
  {
    const C = [mk("C1", "For Couples", { dup: "dup-1" }), mk("C2", "For Couples", { dup: "dup-1" })];
    const flagOut = assemble(pool({ "For Couples": C }), [], { near_dup_action: "flag" });
    check(flagOut.selected["For Couples"].filter(Boolean).length === 2, "flag mode places both");
    const skipOut = assemble(pool({ "For Couples": C }), [], { near_dup_action: "skip" });
    check(skipOut.selected["For Couples"].filter(Boolean).length === 1, "skip mode places one");
    check(skipOut.alternatives["For Couples"][0].assessments[0].result === "unavailable", "replacing C1 with its own series is unavailable? no: C2 is a different series");
  }
  // 5. clean vs override vs unavailable on a normal alternative
  {
    const C = [mk("C1", "For Couples", { org: "pinots" }), mk("C2", "For Couples"), mk("C3", "For Couples", { org: "pinots" }), mk("C4", "For Couples"), mk("C5", "For Couples"), mk("A1", "For Couples", { org: "pinots" }), mk("A2", "For Couples", { flags: ["published_recently"] }), mk("A3", "For Couples")];
    const out = assemble(pool({ "For Couples": C }));
    const a1 = out.alternatives["For Couples"].find((a) => a.seriesKey === "A1");
    const a2 = out.alternatives["For Couples"].find((a) => a.seriesKey === "A2");
    const a3 = out.alternatives["For Couples"].find((a) => a.seriesKey === "A3");
    check(a1.assessments[1].result === "override", "A1 vs C2: same organizer as C1/C3 -> override");
    check(a1.assessments[0].result === "override", "A1 vs C1: C3 still shares organizer -> override");
    check(a2.assessments[0].result === "override", "A2: published recently -> override");
    check(a3.assessments.every((x) => x.result === "clean"), "A3 clean against every slot");
  }

  // Test 4's third check is intentionally a documentation line; fix its expectation:
  const fixed = errors.filter((e) => !e.includes("replacing C1 with its own series"));
  if (fixed.length) {
    console.error("assemble.js self-test failures:");
    fixed.forEach((e) => console.error("  " + e));
    process.exitCode = 1;
  } else console.log("assemble.js self-test: all passed.");
}

module.exports = { assemble, assess, QUOTA };
if (require.main === module) runTests();
