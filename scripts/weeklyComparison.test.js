/**
 * weeklyComparison.test.js — offline tests for the weekly comparison join.
 * Run: node --test scripts/weeklyComparison.test.js
 * Every fixture is built here; nothing is read from data/ and nothing is written.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const wc = require("./weeklyComparison.js");

const ISSUE = "2026-09-17"; // window 2026-09-18 .. 2026-09-27
const F = "For Families", C = "For Couples", G = "For Golden Age Readers";

const rec = (id, title, url, start_date, extra = {}) => ({ id, title, url, start_date, ...extra });
const pub = (section, slot, displayTitle, url, description = "", cta = "") => ({ section, slot, displayTitle, url, description, cta });
function lineup(parts) {
  return wc.normalizeLineup({ issue_date: ISSUE, source: { kind: "run_folder", ref: "fixture", signed_off: true }, picks: [], alternatives: [], pool: [], ...parts });
}
const run = (published, parts) => wc.compare({ issueDate: ISSUE, published, lineup: lineup(parts) });

test("clean match: pick, shown alternative, pool and never-a-candidate are each counted once", () => {
  const r = run(
    [
      pub(F, 1, "Harvest Moon Lantern Walk", "https://www.example.org/lantern-walk/?utm_source=newsletter"),
      pub(F, 2, "Pumpkin Carving Afternoon", "https://example.org/pumpkin-carving"),
      pub(F, 3, "Birding Secrets & Basics", "https://example.org/birding-basics"),
      pub(F, 4, "Apple Cider Trolley Day", "https://elsewhere.example/applefest"),
      pub("Local Aroma", 1, "Some Restaurant", "https://example.org/lantern-walk"), // not an event section: ignored
    ],
    {
      picks: [{ section: F, slot: 1, ...rec("recPICK", "Harvest Moon Lantern Walk 2026", "https://example.org/lantern-walk", "2026-09-20") }],
      alternatives: [{ section: F, position: 1, rendered: true, ...rec("recALT", "Pumpkin Carving for All Ages", "https://example.org/pumpkin-carving/", "2026-09-21") }],
      pool: [rec("recPOOL", "All Ages Workshop: Birding basics (ID)", "https://example.org/birding-basics", "2026-09-26", { stage: "survivor_not_shortlisted" })],
    }
  );
  assert.equal(r.published_slots, 4);
  assert.deepEqual([r.totals.main_pick, r.totals.alternative_shown, r.totals.in_pool_not_shown, r.totals.never_candidate, r.totals.ambiguous], [1, 1, 1, 1, 0]);
  assert.equal(r.totals.supplied, 2);
  assert.equal(r.rows[0].matched.id, "recPICK");
  assert.equal(r.rows[2].matched.stage, "survivor_not_shortlisted");
  assert.equal(r.ambiguous.length, 0);
  assert.ok(r.warnings.some((w) => /For Couples: 0 published slots found, expected 5/.test(w)), "a short section is warned about, not padded");
});

test("same URL, two dates, different standing: listed as ambiguous with both candidates, never picked", () => {
  const url = "https://library.example/programs/view/2924";
  const r = run([pub(G, 1, "Gentle Chair Yoga", url)], {
    picks: [{ section: G, slot: 2, ...rec("recFRI", "Gentle Chair Yoga", url, "2026-09-18") }],
    pool: [rec("recTUE", "Gentle Chair Yoga", url, "2026-09-22")],
  });
  const row = r.rows[0];
  assert.equal(row.class, "ambiguous");
  assert.equal(row.matched, null);
  assert.deepEqual(row.candidates.map((c) => c.id).sort(), ["recFRI", "recTUE"]);
  assert.deepEqual(row.candidates.map((c) => c.class_if_this_one).sort(), ["in_pool_not_shown", "main_pick"]);
  assert.equal(row.best_case, "main_pick");
  assert.equal(row.worst_case, "in_pool_not_shown");
  assert.equal(r.totals.supplied, 0, "an ambiguous row is not counted as supplied");
  assert.equal(r.totals.supplied_if_every_ambiguous_row_resolves_in_favour, 1);
  assert.equal(r.ambiguous.length, 1);
  assert.match(wc.formatReport(r), /AMBIGUOUS — 1 row/);
});

test("same URL, two dates: a date stated in the published slot selects the occurrence", () => {
  const url = "https://library.example/programs/view/2924";
  const parts = {
    picks: [{ section: G, slot: 2, ...rec("recFRI", "Gentle Chair Yoga", url, "2026-09-18") }],
    pool: [rec("recTUE", "Gentle Chair Yoga", url, "2026-09-22")],
  };
  const byText = run([pub(G, 1, "Gentle Chair Yoga", url, "Stretch and unwind on Tuesday, Sept. 22.")], parts).rows[0];
  assert.equal(byText.class, "in_pool_not_shown");
  assert.equal(byText.matched.id, "recTUE");
  assert.match(byText.occurrence_resolved_by, /2026-09-22/);

  // A date in the URL that matches neither occurrence resolves nothing.
  const noHelp = run([pub(G, 1, "Gentle Chair Yoga", url + "?start=2026-09-01", "")], {
    picks: [{ section: G, slot: 2, ...rec("recFRI", "Gentle Chair Yoga", url + "?start=2026-09-01", "2026-09-18") }],
    pool: [rec("recTUE", "Gentle Chair Yoga", url + "?start=2026-09-01", "2026-09-22")],
  }).rows[0];
  assert.equal(noHelp.class, "ambiguous");
});

test("same URL, two dates, same standing: class is kept but the row is still listed for a human", () => {
  const url = "https://library.example/programs/view/2924";
  const r = run([pub(G, 1, "Gentle Chair Yoga", url)], {
    pool: [rec("recFRI", "Gentle Chair Yoga", url, "2026-09-18"), rec("recTUE", "Gentle Chair Yoga", url, "2026-09-22")],
  });
  assert.equal(r.rows[0].class, "in_pool_not_shown");
  assert.equal(r.rows[0].matched, null);
  assert.equal(r.ambiguous.length, 1);
  assert.equal(r.totals.ambiguous, 0);
});

test("different occurrences carried in the URL itself never cross-match", () => {
  const base = "https://chef.example/products/greek-mezze?location=Vaughan&select=";
  const r = run([pub(C, 1, "Greek Mezze - Delicious Cooking", base + "2026-09-25T18%3A30")], {
    picks: [{ section: C, slot: 1, ...rec("recOTHER", "Modern Greek Mezze: An Aegean Escape", base + "2026-09-19T18%3A30", "2026-09-19") }],
  });
  assert.equal(r.rows[0].class, "never_candidate");
  assert.equal(r.totals.supplied, 0);
  assert.equal(r.rows[0].leads[0].id, "recOTHER", "the other occurrence is offered as a lead");
  assert.equal(r.totals.never_candidate_with_a_lead_to_review, 1);
});

test("no URL match: never a candidate; a similar title under another URL is a lead, not a match", () => {
  const r = run(
    [pub(C, 1, "Forest of Shadows", "https://tickets.example/forest-of-shadows"), pub(C, 2, "Double Ninth Festival", "https://unrelated.example/double-ninth")],
    { picks: [{ section: C, slot: 1, ...rec("recFOS", "Forest of Shadows", "https://calendar.example/event/forest-of-shadows", "2026-09-25") }] }
  );
  assert.equal(r.rows[0].class, "never_candidate");
  assert.equal(r.rows[0].matched, null);
  assert.equal(r.rows[0].leads[0].id, "recFOS");
  assert.ok(r.rows[0].flags.some((f) => /needs a human/.test(f)));
  assert.equal(r.rows[1].class, "never_candidate");
  assert.equal(r.rows[1].leads.length, 0);
  assert.equal(r.totals.never_candidate, 2);
  assert.equal(r.totals.supplied, 0);
});

test("shared listing page: a URL hit whose title does not verify is ambiguous, not a match", () => {
  const url = "https://unionville.example/things-to-do/events/";
  const r = run([pub(C, 4, "Double Ninth Festival", url)], {
    picks: [{ section: C, slot: 1, ...rec("recJAZZ", "Thursday Night Jazz at the Bandstand", url, "2026-09-24") }],
  });
  assert.equal(r.rows[0].class, "ambiguous");
  assert.match(r.rows[0].reason, /titles do not verify/);
  assert.equal(r.rows[0].candidates[0].id, "recJAZZ");
  assert.equal(r.totals.main_pick, 0);
});

test("the URL is known only outside the window: ambiguous, not silently matched or dropped", () => {
  const url = "https://library.example/programs/view/777";
  const r = run([pub(F, 1, "Stories and Strollers", url)], { pool: [rec("recOLD", "Stories and Strollers", url, "2026-08-11")] });
  assert.equal(r.rows[0].class, "ambiguous");
  assert.match(r.rows[0].reason, /outside this issue's window/);
  assert.equal(r.rows[0].candidates[0].class_if_this_one, null);
});

test("alternative outside the rendered window is in the pool, not shown", () => {
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  const titles = ["Pottery Wheel Basics", "Sunset Canoe Paddle", "Salsa Under Stars", "Vineyard Harvest Tour", "Jazz Supper Club", "Moonlit Garden Stroll", "Candlelight String Quartet"];
  const evidence = {
    issue_date: ISSUE, window: ["2026-09-18", "2026-09-27"],
    candidates: ids.map((id, i) => ({ record_id: id, snapshot_fields: { "Event Title": titles[i], URL: "https://example.org/e/" + id, "Start Date": "2026-09-2" + i } })),
  };
  const alt = (id, slots = [1]) => ({ id, replaceable_slots: slots });
  // a2 has no replaceable slot, so the preview skips it and renders a1,a3,a4,a5,a6. a7 is sixth: not rendered.
  const allocation = { picks: [], alternatives: { [C]: [alt("a1"), alt("a2", []), alt("a3"), alt("a4"), alt("a5"), alt("a6"), alt("a7")] } };
  const l = wc.lineupFromRunData({ evidence, allocation, ref: "fixture", signedOff: true });
  assert.deepEqual(l.alternatives.filter((a) => a.rendered).map((a) => a.id), ["a1", "a3", "a4", "a5", "a6"]);
  assert.equal(wc.RENDERED_ALTERNATIVES, 5);

  const r = wc.compare({ issueDate: ISSUE, lineup: l, published: [
    pub(C, 1, "Moonlit Garden Stroll", "https://example.org/e/a6"),
    pub(C, 2, "Candlelight String Quartet", "https://example.org/e/a7"),
    pub(C, 3, "Sunset Canoe Paddle", "https://example.org/e/a2"),
  ] });
  assert.deepEqual(r.rows.map((x) => x.class), ["alternative_shown", "in_pool_not_shown", "in_pool_not_shown"]);
  assert.equal(r.totals.alternative_shown, 1);
  assert.equal(r.rows[1].matched.roles[0].kind, "alternative_not_rendered");
});

test("the rendered-alternatives number still matches the producer's preview code", () => {
  const src = fs.readFileSync(path.join(__dirname, "issue-build", "issueBuild.js"), "utf8");
  const n = src.split(`.filter(a=>a.replaceable_slots.length).slice(0,${wc.RENDERED_ALTERNATIVES})`).length - 1;
  assert.ok(n >= 2, "issueBuild.js no longer renders the first " + wc.RENDERED_ALTERNATIVES + " replaceable alternatives (HTML and Markdown); update RENDERED_ALTERNATIVES deliberately");
});

test("a slot published under one section but shown under another is supplied, and says so", () => {
  const r = run([pub(G, 3, "Acrylic Fluid Art Workshop - Free", "https://example.org/fluid-art")], {
    alternatives: [
      { section: C, position: 5, rendered: true, ...rec("recART", "Acrylic Fluid Art Workshop by Eddie Li", "https://example.org/fluid-art", "2026-09-26") },
      { section: G, position: 7, rendered: false, ...rec("recART", "Acrylic Fluid Art Workshop by Eddie Li", "https://example.org/fluid-art", "2026-09-26") },
    ],
  });
  assert.equal(r.rows[0].class, "alternative_shown");
  assert.equal(r.rows[0].section_agrees, false);
  assert.equal(r.totals.supplied, 1);
  assert.equal(r.totals.supplied_same_section, 0);
  assert.ok(r.rows[0].flags.some((f) => /shown under For Couples, published under For Golden Age Readers/.test(f)));
});

test("missing copy is reported as not available, never as zero", () => {
  const r = run([pub(F, 1, "Harvest Moon Lantern Walk", "https://example.org/lantern-walk")], {
    picks: [{ section: F, slot: 1, ...rec("recPICK", "Harvest Moon Lantern Walk", "https://example.org/lantern-walk", "2026-09-20") }],
  });
  assert.equal(r.copy_use, wc.NO_COPY);
  assert.equal(typeof r.copy_use, "string");
  assert.equal(r.rows[0].copy.status, wc.NO_COPY);
  assert.match(wc.formatReport(r), /Exported copy used: not available/);
});

test("exported copy, when present, is compared with the published blurb", () => {
  const copy = { display_title: "Harvest Moon Lantern Walk", description: "Carry a lantern through the orchard at dusk.", cta: "Light The Way" };
  const parts = {
    picks: [
      { section: F, slot: 1, copy, ...rec("recA", "Harvest Moon Lantern Walk", "https://example.org/lantern-walk", "2026-09-20") },
      { section: F, slot: 2, copy: { display_title: "Pumpkin Carving", description: "Carve a pumpkin.", cta: "Sign Up" }, ...rec("recB", "Pumpkin Carving Afternoon", "https://example.org/pumpkin-carving", "2026-09-21") },
      { section: F, slot: 3, ...rec("recC", "Birding Basics Workshop", "https://example.org/birding-basics", "2026-09-26") },
    ],
  };
  const r = run(
    [
      // Parser quirk: description folded into the title field. Still the same text.
      pub(F, 1, "🏮 Harvest Moon Lantern Walk Carry a lantern through the orchard at dusk.", "https://example.org/lantern-walk", "Light The Way"),
      pub(F, 2, "Pumpkin Carving Afternoon", "https://example.org/pumpkin-carving", "Scoop, carve and light your own jack-o'-lantern.", "Grab A Pumpkin"),
      pub(F, 3, "Birding Basics", "https://example.org/birding-basics"),
    ],
    parts
  );
  assert.deepEqual(r.rows.map((x) => x.copy.status), ["identical", "differs", "not available"]);
  assert.deepEqual(r.copy_use, { identical: 1, differs: 1, not_available: 1, of_supplied_slots: 3 });
});

test("categories that need a console submission say so instead of reporting zero", () => {
  const r = run([], {});
  for (const k of ["confirmed_and_published", "changed_after_confirm", "self_filled"]) assert.equal(r.not_available[k], wc.NO_CONSOLE);
  assert.match(wc.formatReport(r), /Self-filled:\s+not available: no console submission/);
});

test("a lineup built for another issue is refused", () => {
  assert.throws(() => wc.compare({ issueDate: "2026-09-24", published: [], lineup: lineup({}) }), /refusing to join across issues/);
});

test("urlKey ignores tracking parameters, www, trailing slash and query order", () => {
  assert.equal(wc.urlKey("https://www.Example.org/a/?b=2&utm_source=x&a=1&_bhlid=z#top"), wc.urlKey("https://example.org/a?a=1&b=2"));
  assert.notEqual(wc.urlKey("https://example.org/a?select=2026-09-25"), wc.urlKey("https://example.org/a?select=2026-09-19"));
  assert.equal(wc.urlKey("not a url"), null);
});

// ---- Programme level (same listing, any date) beside the exact-date count ----
test("one known occurrence, a different date stated: not claimed as exact, counted at programme level, listed for a human", () => {
  const url = "https://library.example/programs/view/2924";
  const r = run([pub(G, 1, "Gentle Chair Yoga", url, "Stretch and unwind on Tuesday, Sept. 22.")], {
    picks: [{ section: G, slot: 2, ...rec("recFRI", "Gentle Chair Yoga", url, "2026-09-18") }],
  });
  const row = r.rows[0];
  assert.equal(row.class, "ambiguous");
  assert.match(row.reason, /only on 2026-09-18; the published slot states 2026-09-22/);
  assert.equal(r.totals.supplied, 0, "the exact-date count does not claim it");
  assert.equal(r.totals.supplied_same_programme, 1, "the programme-level count does");
  assert.equal(r.ambiguous.length, 1);
  assert.ok(row.flags.some((f) => /counted at programme level only/.test(f)));
  assert.match(wc.formatReport(r), /Supplied by the system:\s+1 of 1\s+\(same programme, any date\)\n\s+on the exact date shown:\s+0 of 1/);
});

test("one known occurrence and no stated date, or a stated date that agrees: counted at both levels", () => {
  const url = "https://library.example/programs/view/2924";
  const parts = { picks: [{ section: G, slot: 2, ...rec("recFRI", "Gentle Chair Yoga", url, "2026-09-18") }] };
  for (const text of ["", "Join us Friday, Sept. 18."]) {
    const r = run([pub(G, 1, "Gentle Chair Yoga", url, text)], parts);
    assert.equal(r.rows[0].class, "main_pick");
    assert.deepEqual([r.totals.supplied, r.totals.supplied_same_programme], [1, 1]);
  }
});

test("same URL, two dates, different standing: ambiguous for the exact count, supplied at programme level", () => {
  const url = "https://library.example/programs/view/2924";
  const r = run([pub(G, 1, "Gentle Chair Yoga", url)], {
    picks: [{ section: G, slot: 2, ...rec("recFRI", "Gentle Chair Yoga", url, "2026-09-18") }],
    pool: [rec("recTUE", "Gentle Chair Yoga", url, "2026-09-22")],
  });
  assert.deepEqual([r.totals.supplied, r.totals.supplied_same_programme], [0, 1]);
});

test("same page, another date in the query string: never a candidate for the exact count, supplied at programme level", () => {
  const base = "https://chef.example/products/greek-mezze?location=Vaughan&select=";
  const r = run([pub(C, 1, "Greek Mezze - Delicious Cooking", base + "2026-09-25T18%3A30")], {
    picks: [{ section: C, slot: 1, ...rec("recOTHER", "Modern Greek Mezze: An Aegean Escape", base + "2026-09-19T18%3A30", "2026-09-19") }],
  });
  assert.equal(r.rows[0].class, "never_candidate");
  assert.deepEqual([r.totals.supplied, r.totals.supplied_same_programme], [0, 1]);
});

test("a similar title under a different URL is still only a lead: counted at neither level", () => {
  const r = run([pub(F, 1, "Toy Hunters Toy Show", "https://social.example/events/963478036724966/")], {
    picks: [{ section: F, slot: 1, ...rec("recTOY", "Toy Hunters Toy Show", "https://listings.example/markham/toy-hunters-toy-show/1", "2026-09-20") }],
  });
  assert.equal(r.rows[0].class, "never_candidate");
  assert.deepEqual([r.totals.supplied, r.totals.supplied_same_programme], [0, 0]);
});
