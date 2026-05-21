// buildIssues.js
// R3: Multi-issue planner for newsletter automation pipeline.

const QUOTAS = {
  "For Families":          { min: 5, max: 5 },
  "For Couples":           { min: 5, max: 5 },
  "For Golden Age Readers":{ min: 5, max: 5 },
  "Local Aroma":           { min: 5, max: 5 },
  "Trust Me Recipe":       { min: 1, max: 2 },
};

/**
 * Get the next N Thursday dates from a given date.
 * If today is Thursday, the first result is NEXT Thursday (not today).
 */
function getNextThursdays(count = 3, fromDate = new Date()) {
  const thursdays = [];
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  const daysUntilThursday = ((4 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  for (let i = 0; i < count; i++) {
    thursdays.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return thursdays;
}

/**
 * Build issue assignments for the next 3 newsletter issues.
 *
 * @param {Array}      eligibleItems      - Airtable Candidates records
 * @param {Set|Array}  lockedAssignments  - Item IDs already locked; skip these
 * @param {Array|null} issueDates         - Date objects for each issue; defaults to next 3 Thursdays
 * @returns {Array} IssueItems            - [{ IssueDate, ItemID, Section, Slot }]
 */
/**
 * @param {Array} lockedAssignments - existing IssueItems: [{ IssueDate, ItemID, Section, Slot }]
 *   These are treated as pre-filled slots. Their candidates are excluded from re-allocation
 *   and their slot counts seed the per-section counters for each issue.
 */
function buildIssues(eligibleItems, lockedAssignments = [], issueDates = null, asOfDate = null) {
  const today = asOfDate ? toMidnight(asOfDate) : new Date();
  if (!asOfDate) today.setHours(0, 0, 0, 0);

  const dates = issueDates ?? getNextThursdays(3, today);

  // Build a set of all already-assigned ItemIDs so they are never re-allocated
  const assignedIds = new Set(lockedAssignments.map((a) => a.ItemID));

  // Apply eligibility rules from SYSTEM_CONTEXT
  const eligible = eligibleItems.filter((item) => {
    if (item.Status !== "Approved")      return false;
    if (item.NeedsReview !== false)      return false;
    if (!item["Start Date"])             return false;
    const start = toMidnight(item["Start Date"]);
    if (start < today)                   return false;
    if (assignedIds.has(item.id))        return false;
    return true;
  });

  // Sort by Score_Final descending; ties broken by Start Date ascending (sooner = more urgent)
  eligible.sort((a, b) => {
    const scoreDiff = (b.Score_Final ?? 0) - (a.Score_Final ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return toMidnight(a["Start Date"]) - toMidnight(b["Start Date"]);
  });

  const issueItems = [];

  for (let idx = 0; idx < dates.length; idx++) {
    const issueDate     = dates[idx];
    const issueDateNorm = toMidnight(issueDate);
    const issueDateStr  = fmtDate(issueDateNorm);

    // Window: day after issue date → 10 days out (inclusive), i.e. [issueDate+1, issueDate+10]
    const windowStart = new Date(issueDateNorm.getTime() + 1 * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(issueDateNorm.getTime() + 11 * 24 * 60 * 60 * 1000); // exclusive upper bound

    // Track filled slots per section for this issue (seed from locked assignments)
    const filledSlots = {};

    // Per-section venue count: { section: { venueName: count } }
    const venueCount = {};

    for (const a of lockedAssignments) {
      if (a.IssueDate === issueDateStr && a.Section in QUOTAS) {
        filledSlots[a.Section] ??= new Set();
        filledSlots[a.Section].add(a.Slot);
        const lockedItem = eligibleItems.find((i) => i.id === a.ItemID);
        if (lockedItem?.LocationName) {
          venueCount[a.Section] ??= {};
          venueCount[a.Section][lockedItem.LocationName] =
            (venueCount[a.Section][lockedItem.LocationName] ?? 0) + 1;
        }
      }
    }

    for (const item of eligible) {
      if (assignedIds.has(item.id)) continue;

      // item must start within this issue's window (issueDate+1 to issueDate+10 inclusive)
      const startDate = toMidnight(item["Start Date"]);
      if (startDate < windowStart) continue;
      if (startDate >= windowEnd)  continue;

      const section = item.SegmentSuggested;
      if (!(section in QUOTAS)) continue; // unknown section — skip

      const { max } = QUOTAS[section];
      const filled = filledSlots[section] ?? new Set();
      if (filled.size >= max) continue; // quota full

      // Find lowest available slot number
      let slot = null;
      for (let i = 1; i <= max; i++) {
        if (!filled.has(i)) { slot = i; break; }
      }
      if (slot === null) continue;

      // Venue diversity: skip if same venue already appears in this section/issue
      const venue = item.LocationName;
      if (venue) {
        const sectionVenues = venueCount[section] ?? {};
        if ((sectionVenues[venue] ?? 0) >= 1) continue;
      }

      filledSlots[section] ??= new Set();
      filledSlots[section].add(slot);
      assignedIds.add(item.id);

      // Track venue count for this section/issue
      if (venue) {
        venueCount[section] ??= {};
        venueCount[section][venue] = (venueCount[section][venue] ?? 0) + 1;
      }

      issueItems.push({
        IssueDate: issueDateStr,
        ItemID:    item.id,
        Section:   section,
        Slot:      slot,
      });
    }
  }

  return issueItems;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMidnight(date) {
  // Parse "YYYY-MM-DD" strings as local time to avoid UTC-offset shifts
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(date) {
  // Use local date parts to avoid UTC-offset shifts
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Test data & edge-case coverage
// ---------------------------------------------------------------------------

function runTests() {
  const TODAY     = new Date("2026-04-13");
  const THURSDAY1 = "2026-05-01"; // issue date 1
  const THURSDAY2 = "2026-05-08"; // issue date 2
  const THURSDAY3 = "2026-05-15"; // issue date 3
  // Window for each issue: day after issue date → +10 days inclusive
  const WINDOW1_START = "2026-05-02"; // first eligible start date for issue 1 (May 1 + 1)
  const WINDOW2_START = "2026-05-12"; // outside issue 1 window (ends May 11), inside issue 2 window (May 9–18)
  // Note: string literals "YYYY-MM-DD" are always parsed as local time by toMidnight()

  // Helper to build a candidate record
  const item = (id, segment, score, startDate, opts = {}) => ({
    id,
    "Event Title":       `Event ${id}`,
    "Start Date":        startDate,
    SegmentSuggested:    segment,
    SegmentConfidence:   opts.confidence ?? 0.9,
    NeedsReview:         opts.needsReview ?? false,
    Status:              opts.status      ?? "Approved",
    Score_Final:         score,
    LocationName:        opts.location    ?? "",
  });

  // --- Build a full pool ---
  const pool = [
    // For Families — 6 available (only 5 should be placed per issue)
    item("F1", "For Families",    90, WINDOW1_START),
    item("F2", "For Families",    85, WINDOW1_START),
    item("F3", "For Families",    80, WINDOW1_START),
    item("F4", "For Families",    75, WINDOW1_START),
    item("F5", "For Families",    70, WINDOW1_START),
    item("F6", "For Families",    65, WINDOW1_START), // overflow → pushed to later issue

    // For Couples — only 2 items, leaving room for venue diversity test items below
    item("C1", "For Couples",     88, WINDOW1_START),
    item("C2", "For Couples",     82, WINDOW1_START),

    // For Golden Age Readers
    item("G1", "For Golden Age Readers",  91, WINDOW1_START),
    item("G2", "For Golden Age Readers",  84, WINDOW1_START),
    item("G3", "For Golden Age Readers",  79, WINDOW1_START),
    item("G4", "For Golden Age Readers",  73, WINDOW2_START), // starts window 2
    item("G5", "For Golden Age Readers",  68, WINDOW2_START),

    // Local Aroma
    item("L1", "Local Aroma", 95, WINDOW1_START),
    item("L2", "Local Aroma", 87, WINDOW1_START),
    item("L3", "Local Aroma", 83, WINDOW1_START),
    item("L4", "Local Aroma", 77, WINDOW1_START),
    item("L5", "Local Aroma", 71, WINDOW1_START),

    // Trust Me Recipe — max 2 per issue, min 1
    item("R1", "Trust Me Recipe",      60, WINDOW1_START),
    item("R2", "Trust Me Recipe",      55, WINDOW1_START),
    item("R3", "Trust Me Recipe",      50, WINDOW2_START),

    // Edge cases
    item("BAD1", "For Families",  99, "2026-03-15"),  // past start date — excluded
    item("BAD2", "For Couples",   99, WINDOW1_START, { status: "Pending" }),     // wrong status
    item("BAD3", "For Couples",   99, WINDOW1_START, { needsReview: true }),     // needs review
    item("BAD4", "Unknown Segment", 99, WINDOW1_START),                          // unknown segment
    item("BAD5", "For Families",  99, WINDOW1_START),     // will be locked

    // Venue diversity — 3 events at "Venue Alpha" in For Couples, same issue
    // V1 (score 72) should be placed; V2 (score 68) and V3 (score 64) should be skipped (max 1 per venue)
    item("V1", "For Couples", 72, WINDOW1_START, { location: "Venue Alpha" }),
    item("V2", "For Couples", 68, WINDOW1_START, { location: "Venue Alpha" }), // 2nd — should be skipped
    item("V3", "For Couples", 64, WINDOW1_START, { location: "Venue Alpha" }), // 3rd — should be skipped
    // Blank venue should always be allowed through
    item("V4", "For Couples", 62, WINDOW1_START, { location: "" }),
  ];

  // BAD5 is pre-existing in IssueItems as slot 1 of For Families in issue 1
  const locked = [
    { IssueDate: THURSDAY1, ItemID: "BAD5", Section: "For Families", Slot: 1 },
  ];

  // Use toMidnight() so strings parse as local time, not UTC
  const issueDates = [
    toMidnight(THURSDAY1),
    toMidnight(THURSDAY2),
    toMidnight(THURSDAY3),
  ];

  const result = buildIssues(pool, locked, issueDates, TODAY);

  // --- Assertions ---
  const errors = [];

  const byIssue = {};
  for (const r of result) {
    (byIssue[r.IssueDate] ??= []).push(r);
  }

  // 1. No duplicates across issues
  const allIds = result.map((r) => r.ItemID);
  const uniqueIds = new Set(allIds);
  if (allIds.length !== uniqueIds.size)
    errors.push("FAIL: duplicate ItemIDs across issues");

  // 2. Quota not exceeded
  for (const [issueDate, items] of Object.entries(byIssue)) {
    const counts = {};
    for (const r of items) counts[r.Section] = (counts[r.Section] ?? 0) + 1;
    for (const [section, count] of Object.entries(counts)) {
      const { max } = QUOTAS[section];
      if (count > max)
        errors.push(`FAIL [${issueDate}]: ${section} has ${count} items, max is ${max}`);
    }
  }

  // 3. Bad items not included
  const badIds = ["BAD1", "BAD2", "BAD3", "BAD4", "BAD5"];
  for (const id of badIds) {
    if (uniqueIds.has(id))
      errors.push(`FAIL: ${id} should have been excluded but was assigned`);
  }

  // 4. G4/G5 start on WINDOW2_START — must appear in issue 2, not issue 1
  const issue1Sections = (byIssue[THURSDAY1] ?? []);
  for (const r of issue1Sections) {
    if (r.ItemID === "G4" || r.ItemID === "G5")
      errors.push(`FAIL: ${r.ItemID} starts on ${WINDOW2_START} but was placed in issue 1 (${THURSDAY1})`);
  }
  // Assert no item's start date falls before its issue's window start (issueDate + 1 day)
  for (const r of result) {
    const itemObj = pool.find((p) => p.id === r.ItemID);
    if (!itemObj) continue;
    const startDate  = toMidnight(itemObj["Start Date"]);
    const issueDate  = toMidnight(r.IssueDate);
    const winStart   = new Date(issueDate.getTime() + 1 * 24 * 60 * 60 * 1000);
    if (startDate < winStart)
      errors.push(`FAIL: ${r.ItemID} startDate ${fmtDate(startDate)} is before window start ${fmtDate(winStart)} for issue ${r.IssueDate}`);
  }

  // 5. F6 overflow: quota is 5 — F6 should land in a later issue or not at all
  const issue1Ids = new Set((byIssue[THURSDAY1] ?? []).map((r) => r.ItemID));
  if (issue1Ids.has("F6")) {
    const f1Count = (byIssue[THURSDAY1] ?? []).filter((r) => r.Section === "For Families").length;
    if (f1Count > 5)
      errors.push(`FAIL: Families in issue 1 exceeds quota (${f1Count})`);
  }

  // 6. Slot numbers are sequential per section per issue (accounting for pre-existing locked slots)
  for (const [issueDate, items] of Object.entries(byIssue)) {
    // Combine new items with locked assignments for this issue
    const lockedForIssue = locked.filter((a) => a.IssueDate === issueDate);
    const allItems = [...lockedForIssue.map((a) => ({ Section: a.Section, Slot: a.Slot })), ...items];
    const bySection = {};
    for (const r of allItems) (bySection[r.Section] ??= []).push(r.Slot);
    for (const [section, slots] of Object.entries(bySection)) {
      const sorted = [...slots].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] !== i + 1)
          errors.push(`FAIL [${issueDate}] ${section}: slots not sequential — got ${sorted}`);
      }
    }
  }

  // 7. Venue diversity: V1 placed, V2 and V3 (same venue) skipped, V4 (blank venue) placed
  const issue1Ids2 = new Set((byIssue[THURSDAY1] ?? []).map((r) => r.ItemID));
  if (!issue1Ids2.has("V1")) errors.push("FAIL: V1 should be placed (1st at Venue Alpha)");
  if (issue1Ids2.has("V2"))  errors.push("FAIL: V2 should be skipped (2nd at Venue Alpha — venue limit)");
  if (issue1Ids2.has("V3"))  errors.push("FAIL: V3 should be skipped (3rd at Venue Alpha — venue limit)");
  if (!issue1Ids2.has("V4")) errors.push("FAIL: V4 should be placed (blank venue — always allowed)");

  // 8. Slot-aware lock: BAD5 is pre-existing at For Families slot 1 in issue 1
  //    Allocator must not re-place BAD5, and new For Families slots must start at 2
  if (issue1Ids2.has("BAD5"))
    errors.push("FAIL: BAD5 is locked/pre-existing and must not be re-allocated");
  const familySlots = (byIssue[THURSDAY1] ?? []).filter((r) => r.Section === "For Families").map((r) => r.Slot);
  if (familySlots.includes(1))
    errors.push("FAIL: For Families slot 1 is pre-occupied by BAD5 — allocator must not assign slot 1");
  if (familySlots.length > 0 && Math.min(...familySlots) < 2)
    errors.push("FAIL: For Families new slots should start at 2 (slot 1 pre-occupied)");

  if (errors.length === 0) {
    console.log("All tests passed.");
  } else {
    console.error("Test failures:");
    errors.forEach((e) => console.error(" ", e));
  }

  console.log("\nGenerated IssueItems:");
  console.table(result);

  return result;
}

// ---------------------------------------------------------------------------
// Exports & entry point
// ---------------------------------------------------------------------------

if (typeof module !== "undefined") {
  module.exports = { buildIssues, getNextThursdays, QUOTAS };
}

// Run tests when executed directly: node buildIssues.js
if (require.main === module) {
  runTests();
}
