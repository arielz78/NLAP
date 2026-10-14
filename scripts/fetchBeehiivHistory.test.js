/**
 * fetchBeehiivHistory.test.js — offline tests for the issue-history parser (#156).
 * Run: node --test scripts/fetchBeehiivHistory.test.js
 * Fixtures are excerpts of saved issues in data/beehiiv/past_issues/ (style attributes and long
 * tracking values trimmed), built here; nothing is read from data/, no network, no credentials.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseIssue } = require("./fetchBeehiivHistory.js");

// 2025-01-16 email markup: one <p> per slot, lines split by <br>, a ZWJ emoji, Beehiiv UTM tags
// whose utm_source value contains vaughanbrief.com.
const EMAIL_2025 =
  '<h3><span><b>For Families</b></span></h3>' +
  '<ol start="2"><li class="listItem ultext"><p> 🏃‍➡️<b>Escape Rooms</b><br>Escape rooms are designed for children & families to solve puzzles together.<br>' +
  '<span><b><a class="link" href="https://escapeok.com/?utm_source=https%3A%2F%2Fwww.vaughanbrief.com%2Fsubscribe&utm_medium=newsletter&utm_campaign=vaughan-your-weekend-fun-plan-in-3-minutes&_bhlid=0983c096eb4b75f8e7ce651862ed5fa951190bb1">' +
  '<span>Plan Your Visit</span></a></b></span><span> </span><span>| </span><span><b>Rating</b></span><span>: 4.7/5</span></p></li></ol>' +
  '<ol start="3"><li class="listItem ultext"><p> 🦎<span> </span><span><b>Reptilia Zoo</b></span><br><span>Get up close with reptiles.</span><br>' +
  '<span><a class="link" href="https://reptilia.org/?utm_source=https%3A%2F%2Fwww.vaughanbrief.com%2Fsubscribe&utm_medium=newsletter">Learn More</a></span></p></li></ol>';

// 2026-05-28 markup: title, description and CTA in separate <p> elements.
const P_2026 =
  '<h3><span class="hxnnnr0"><strong>For Couples</strong></span></h3>' +
  '<ol start="2"><li class="_11av8sw0"><div class="j6zgbu0"><p class="dream-post-content-paragraph j6zgbu1"><span class="dl6s8g0 hxnnnr0">🍖</span><span class="hxnnnr0"> </span>' +
  '<span class="hxnnnr0"><strong><em><u><a href="https://ribfestx.com/event/markham-ribfest-2026/">Markham Ribfest</a></u></em></strong></span></p></div>' +
  '<div class="j6zgbu0"><p class="dream-post-content-paragraph j6zgbu1"><span class="hxnnnr0">Award-winning BBQ, food vendors, music, &amp; festival energy for kids and parents.</span><br/>' +
  '<span class="hxnnnr0"><strong><em><u><a href="https://ribfestx.com/event/markham-ribfest-2026/">Pick Your BBQ</a></u></em></strong></span></p></div></li></ol>' +
  '<ol start="4"><li class="_11av8sw0"><div class="j6zgbu0"><p class="dream-post-content-paragraph j6zgbu1"><span class="dl6s8g0 hxnnnr0">🔵</span><span class="hxnnnr0"> </span>' +
  '<span class="hxnnnr0"><strong><em><u><a href="https://www.facebook.com/events/2059359768123175?acontext=%7B%22ref_notif_type%22%3Anull%7D">Relaxing Date - Blue Moon Sunset Meditation</a></u></em></strong></span></p></div>' +
  '<div class="j6zgbu0"><p class="dream-post-content-paragraph j6zgbu1"><span class="hxnnnr0">A calm sunset meditation for reflection, release, and a quiet evening reset.</span></p></div>' +
  '<div class="j6zgbu0"><p class="dream-post-content-paragraph j6zgbu1"><span class="hxnnnr0"><strong><em><u><a href="https://www.facebook.com/events/2059359768123175?acontext=%7B%22ref_notif_type%22%3Anull%7D">See Details</a></u></em></strong></span></p></div></li></ol>';

// 2026-10-08 shape: a VB-exclusive deal with more than three paragraphs.
const MULTI_P =
  '<h3><strong>For Families</strong></h3>' +
  '<ol start="3"><li><p>⛳ <strong><a href="https://parkgolfbookingsystem.com/?utm_id=vaughanbrief">VB Exclusive: 20% Off Park Golf Thornhill</a></strong></p>' +
  '<p>1 club. 1 ball. 1 hour of fun.</p><p>📅 Discount valid through November 30, 2026</p>' +
  '<p><a href="https://parkgolfbookingsystem.com/?utm_id=vaughanbrief">Claim 20% Off</a></p></li></ol>';

test("bug 1: the leading emoji is kept in its own field, and no ZWJ/variation-selector residue is left on the title", () => {
  const [escape, reptile] = parseIssue(EMAIL_2025);
  assert.equal(escape.displayTitle, "Escape Rooms");
  assert.equal(escape.emoji, "🏃‍➡️");
  assert.equal(reptile.displayTitle, "Reptilia Zoo");
  assert.equal(reptile.emoji, "🦎");
  const [rib] = parseIssue(P_2026);
  assert.equal(rib.emoji, "🍖");
});

test("bug 2: title, description and CTA in separate <p> elements are separate fields", () => {
  const [rib, moon] = parseIssue(P_2026);
  assert.deepEqual([rib.displayTitle, rib.description, rib.cta], [
    "Markham Ribfest",
    "Award-winning BBQ, food vendors, music, & festival energy for kids and parents.",
    "Pick Your BBQ",
  ]);
  assert.deepEqual([moon.displayTitle, moon.description, moon.cta], [
    "Relaxing Date - Blue Moon Sunset Meditation",
    "A calm sunset meditation for reflection, release, and a quiet evening reset.",
    "See Details",
  ]);
});

test("bug 2: no text is dropped when a slot has more than three paragraphs — the middle ones join the description", () => {
  const [golf] = parseIssue(MULTI_P);
  assert.equal(golf.displayTitle, "VB Exclusive: 20% Off Park Golf Thornhill");
  assert.equal(golf.description, "1 club. 1 ball. 1 hour of fun. 📅 Discount valid through November 30, 2026");
  assert.equal(golf.cta, "Claim 20% Off");
});

test("the <br> layout of 2025 issues parses as before", () => {
  const [escape] = parseIssue(EMAIL_2025);
  assert.equal(escape.description, "Escape rooms are designed for children & families to solve puzzles together.");
  assert.equal(escape.cta, "Plan Your Visit | Rating: 4.7/5");
});

test("bug 3 (regression guard): an event link whose UTM tags name vaughanbrief.com is kept, with the tags stripped", () => {
  const events = parseIssue(EMAIL_2025);
  assert.deepEqual(events.map((e) => [e.section, e.slot, e.url]), [
    ["For Families", 2, "https://escapeok.com/"],
    ["For Families", 3, "https://reptilia.org/"],
  ]);
});
