// Tests for pageExtract.js: what the ranker reads from an event's own page (ship-plan item 14, #147).
// Fixtures are trimmed copies of each site's real markup, fetched 2026-10-14. Offline.
// Run: node --test scripts/issue-build/pageExtract.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractDescription, sameEvent, skipPage, PAGE_TEXT_CAP } = require("./pageExtract.js");

const NAV = '<nav><a>Kids Painting Parties</a><a>Mobile Painting Events</a><a>How It Works</a></nav>';

const RICHMOND_HILL = `<html><body>${NAV}<div class="contentLeft" > <div class="detailsContent">
  <div> <h2 class="sectionHeader">Address:</h2> <p> Rouge Woods CC, Aspen Room B <br /> <a href="#">View on Google Maps</a> </p> </div>
  <div> <h2 class="sectionHeader"> Category: </h2> <p> Richmond Hill Organized Festivals &amp; Events </p> </div>
  <div> <h2 class="sectionHeader"> Event Details: </h2> <p> <p class="MsoNormal">Back by popular demand! Join Artist Instructor Fernanda Saraga in this hands-on watercolour workshop.</p>
  <p class="MsoNormal">&nbsp;</p> <div><p>Register online.</p></div> </p> </div>
  <div> <h2 class="sectionHeader">Contact:</h2> <p>905-555-0100</p> </div>
</div></div><footer>Site map</footer></body></html>`;

const VPL = `<html><body>${NAV}<div class="description"> The whole family can laugh, listen, and enjoy a lively, fun, and amusing puppet show, led by VPL staff! <br/> <br/>
  <div class="share_span"> <button id="button_share">Share</button> </div> </div><footer>Library hours</footer></body></html>`;

const EVENTBRITE = `<html><head><script type="application/ld+json">{"@type":"SocialEvent","name":"Noche Loca","description":"NOCHE LOCA | 16 OCTOBER | 8PM - 2AM"}</script></head>
<body>${NAV}<script>window.__SERVER_DATA__ = {"event":{"id":"1"},"structuredContent":{"modules":[{"type":"text","text":"\\u003cp\\u003e\\u003cstrong\\u003eNOCHE LOCA | HALLOWEEN PARTY\\u003c/strong\\u003e\\u003c/p\\u003e\\u003cp\\u003eVivo Club, Friday October 16. Costume contest at midnight with a {prize}.\\u003c/p\\u003e"},{"type":"image","url":"x.jpg"},{"type":"text","text":"\\u003cp\\u003eNo age limit.\\u003c/p\\u003e"}]},"other":1};</script></body></html>`;

const EVENTBRITE_LD_ONLY = `<html><head><script type="application/ld+json">[{"@type":"WebPage"},{"@type":"Event","description":"A summary only."}]</script></head><body>${NAV}</body></html>`;

test("Richmond Hill: only the Event Details block, not address, category or contact", () => {
  const r = extractDescription("https://calendar.richmondhill.ca/default/Detail/2026-10-17-1000-Watercolour", RICHMOND_HILL);
  assert.equal(r.method, "richmondhill_details");
  assert.match(r.text, /^Back by popular demand! Join Artist Instructor Fernanda Saraga/);
  assert.match(r.text, /Register online\./, "nested blocks inside the details are kept");
  assert.doesNotMatch(r.text, /Rouge Woods|Category|905-555|Kids Painting|Site map/);
});

test("VPL: the description block, without the share button or the menu", () => {
  const r = extractDescription("https://www.vaughanpl.info/programs/view/12345", VPL);
  assert.equal(r.method, "vpl_description");
  assert.equal(r.text, "The whole family can laugh, listen, and enjoy a lively, fun, and amusing puppet show, led by VPL staff!");
});

test("Eventbrite: the full body from structuredContent, text modules only, braces in text are safe", () => {
  const r = extractDescription("https://www.eventbrite.ca/e/noche-loca-tickets-1234567890", EVENTBRITE);
  assert.equal(r.method, "eventbrite_structured");
  assert.match(r.text, /NOCHE LOCA \| HALLOWEEN PARTY/);
  assert.match(r.text, /Costume contest at midnight with a \{prize\}\./);
  assert.match(r.text, /No age limit\./);
  assert.doesNotMatch(r.text, /<|Kids Painting/);
});

test("Eventbrite without structuredContent falls back to the JSON-LD Event description", () => {
  const r = extractDescription("https://www.eventbrite.com/e/x-tickets-99", EVENTBRITE_LD_ONLY);
  assert.equal(r.method, "jsonld_event");
  assert.equal(r.text, "A summary only.");
});

test("a known site whose structure changed yields no text, never the menu", () => {
  const r = extractDescription("https://calendar.richmondhill.ca/default/Detail/x", `<html><body>${NAV}<p>Redesigned page</p></body></html>`);
  assert.equal(r.text, null);
  assert.equal(r.method, "richmondhill_details");
});

test("an unknown site uses JSON-LD if present, else a labelled tag-strip fallback", () => {
  assert.equal(extractDescription("https://example.org/e/1", EVENTBRITE_LD_ONLY).method, "jsonld_event");
  const r = extractDescription("https://example.org/e/1", `<html><body><script>var x=1</script><p>Plain page text.</p></body></html>`);
  assert.equal(r.method, "tag_strip_fallback");
  assert.equal(r.text, "Plain page text.");
});

test("extracted text is capped at PAGE_TEXT_CAP characters", () => {
  const long = `<div class="description">${"word ".repeat(2000)}</div>`;
  const r = extractDescription("https://www.vaughanpl.info/programs/view/1", long);
  assert.equal(PAGE_TEXT_CAP, 3000);
  assert.equal(r.text.length, PAGE_TEXT_CAP);
  assert.equal(r.truncated, true);
});

test("a redirect to a different page is not the event (the Pinot's calendar redirect)", () => {
  assert.equal(sameEvent("https://www.pinotspalette.com/woodbridge/event/927042", "https://www.pinotspalette.com/woodbridge/calendar"), false);
  assert.equal(sameEvent("https://www.eventbrite.ca/e/x-tickets-1", "https://www.eventbrite.com/e/x-tickets-1?aff=ebdssbdestsearch"), true, "host and query may change");
  assert.equal(sameEvent("https://www.vaughanpl.info/programs/view/1/", "https://www.vaughanpl.info/programs/view/1"), true);
  assert.equal(sameEvent("https://www.vaughanpl.info/programs/view/1", "https://www.vaughanpl.info/programs/view/2"), false);
});

test("Pinot's Palette pages are skipped: its section rule lives in the editor guidance", () => {
  assert.equal(skipPage("https://www.pinotspalette.com/woodbridge/event/927574"), true);
  assert.equal(skipPage("https://www.eventbrite.ca/e/x-tickets-1"), false);
});
