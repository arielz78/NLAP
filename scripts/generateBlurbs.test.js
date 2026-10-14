// Tests for generateBlurbs.js: one model call per event, so a blurb can only land on the row it was
// written for. Offline: the model is a stub, nothing touches Airtable or OpenAI.
// Run: node --test scripts/generateBlurbs.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const { blurbItems, buildPrompts, buildRequestBody } = require("./generateBlurbs.js");

const items = [
  { id: "recRowA", section: "For Families", slot: 1, title: "Pottery Night", desc: "Wheel throwing for kids", city: "Vaughan" },
  { id: "recRowB", section: "For Families", slot: 2, title: "Jazz Brunch", desc: "Live trio and pancakes", city: "Markham" },
  { id: "recRowC", section: "For Couples", slot: 1, title: "Wine Walk", desc: "Six tastings downtown", city: "Richmond Hill" },
];

const quiet = () => {};

function blurbFor(item, cta) {
  return {
    emoji: "🎨",
    displayTitle: `About ${item.title}`,
    description: `This blurb was written only for ${item.title} and nothing else`,
    cta,
  };
}

test("each blurb is written to the row of the event the model was given", async () => {
  const seen = [];
  const ctas = ["Book Now", "Join the Fun", "Grab Tickets"];
  const callModel = async (item) => {
    seen.push(item.id);
    return blurbFor(item, ctas[seen.length - 1]);
  };

  const results = await blurbItems(items, "2026-10-22", callModel, quiet);

  assert.deepEqual(seen, ["recRowA", "recRowB", "recRowC"], "one call per event, in order");
  assert.equal(results.length, 3);
  for (const r of results) {
    const item = items.find((i) => i.id === r.id);
    assert.ok(r.description.includes(item.title), `${r.id} carries its own event's copy`);
  }
});

test("each prompt carries exactly one event and no row ID or index", () => {
  const { userPrompt } = buildPrompts(items[1], "2026-10-22", []);
  assert.ok(userPrompt.includes("Jazz Brunch"));
  assert.ok(!userPrompt.includes("Pottery Night"));
  assert.ok(!userPrompt.includes("Wine Walk"));
  assert.ok(!userPrompt.includes("recRowB"));
});

test("CTAs already used are passed to later calls", async () => {
  const usedPerCall = [];
  const ctas = ["Book Now", "Join the Fun", "Grab Tickets"];
  const callModel = async (item, _date, used) => {
    usedPerCall.push([...used]);
    return blurbFor(item, ctas[usedPerCall.length - 1]);
  };

  await blurbItems(items, "2026-10-22", callModel, quiet);

  assert.deepEqual(usedPerCall, [[], ["Book Now"], ["Book Now", "Join the Fun"]]);
  const { userPrompt } = buildPrompts(items[2], "2026-10-22", ["Book Now", "Join the Fun"]);
  assert.ok(userPrompt.includes("Book Now") && userPrompt.includes("Join the Fun"));
});

test("a repeated CTA is still flagged, never silently accepted", async () => {
  const callModel = async (item) => blurbFor(item, "Book Now");
  const results = await blurbItems(items, "2026-10-22", callModel, quiet);
  assert.equal(results[0].flags, "");
  assert.match(results[1].flags, /CTA_DUPLICATE/);
  assert.equal(results[1].valid, false);
});

test("a blank or missing emoji never prints 'undefined' and is flagged", async () => {
  const emojis = [undefined, "  ", "🎨"];
  let n = 0;
  const callModel = async (item) => ({ ...blurbFor(item, `Go ${item.id}`), emoji: emojis[n++] });
  const results = await blurbItems(items, "2026-10-22", callModel, quiet);

  assert.equal(results[0].displayTitle, "About Pottery Night");
  assert.equal(results[1].displayTitle, "About Jazz Brunch");
  assert.equal(results[2].displayTitle, "🎨 About Wine Walk");
  assert.match(results[0].flags, /NO_EMOJI/);
  assert.match(results[1].flags, /NO_EMOJI/);
  assert.doesNotMatch(results[2].flags, /NO_EMOJI/);
});

// Seen on the real model, 2026-10-14 dry run for 2026-05-28: 4 of 10 titles broken this way.
test("an emoji inside the title is removed so the title carries exactly one", async () => {
  const callModel = async (item) => ({ ...blurbFor(item, `Go ${item.id}`), emoji: "🐾", displayTitle: "🧴 VADER Derm Day – Pet Skin Health" });
  const [r] = await blurbItems([items[0]], "2026-10-22", callModel, quiet);
  assert.equal(r.displayTitle, "🐾 VADER Derm Day – Pet Skin Health");
  assert.match(r.flags, /TITLE_HAD_EMOJI/);
});

test("a title the model wrote twice is cut back to once", async () => {
  const callModel = async (item) => ({
    ...blurbFor(item, `Go ${item.id}`),
    emoji: "🌷",
    displayTitle: "🌷 Richmond Hill Spring Fair – Family Fun 🌷 Richmond Hill Spring Fair – Family Fun",
  });
  const [r] = await blurbItems([items[0]], "2026-10-22", callModel, quiet);
  assert.equal(r.displayTitle, "🌷 Richmond Hill Spring Fair – Family Fun");
  assert.match(r.flags, /TITLE_REPEATED/);
});

test("multi-part emoji in the title are removed whole", async () => {
  const callModel = async (item) => ({ ...blurbFor(item, `Go ${item.id}`), emoji: "🎨", displayTitle: "👨‍👩‍👧 🧘🏽‍♀️ Family Yoga Morning" });
  const [r] = await blurbItems([items[0]], "2026-10-22", callModel, quiet);
  assert.equal(r.displayTitle, "🎨 Family Yoga Morning");
});

test("an emoji only in the title is kept when the emoji field is blank", async () => {
  const callModel = async (item) => ({ ...blurbFor(item, `Go ${item.id}`), emoji: "", displayTitle: "🕯️ Candle Craft for Beginners" });
  const [r] = await blurbItems([items[0]], "2026-10-22", callModel, quiet);
  assert.equal(r.displayTitle, "🕯️ Candle Craft for Beginners");
  assert.doesNotMatch(r.flags, /NO_EMOJI/);
});

test("a clean title passes through unchanged and unflagged", async () => {
  const callModel = async (item) => ({ ...blurbFor(item, "Book Now"), emoji: "🎭", displayTitle: "Spring Fair – Kids Welcome" });
  const [r] = await blurbItems([items[0]], "2026-10-22", callModel, quiet);
  assert.equal(r.displayTitle, "🎭 Spring Fair – Kids Welcome");
  assert.doesNotMatch(r.flags, /TITLE_/);
});

test("the prompt keeps the emoji out of the title", () => {
  const { systemPrompt } = buildPrompts(items[0], "2026-10-22", []);
  assert.doesNotMatch(systemPrompt, /emoji at the start/i);
  assert.match(systemPrompt, /no emoji/i);
});

test("the request asks for a strict schema with every field required", () => {
  const { response_format } = buildRequestBody(items[0], "2026-10-22", []);
  assert.equal(response_format.type, "json_schema");
  assert.equal(response_format.json_schema.strict, true);
  assert.deepEqual(
    [...response_format.json_schema.schema.required].sort(),
    ["cta", "description", "displayTitle", "emoji"]
  );
});

test("a failed model call stops the run instead of skipping the event", async () => {
  const callModel = async (item) => {
    if (item.id === "recRowB") throw new Error("bad JSON");
    return blurbFor(item, `Go ${item.id}`);
  };
  await assert.rejects(blurbItems(items, "2026-10-22", callModel, quiet), /recRowB/);
});
