// #108 probe, part 2 — the PRODUCTION condition.
// Part 1 sampled the label deck, but 20/25 of those events have since ended and
// AllEvents strips the description body from ended pages. R1 collects events that
// are still upcoming, so the number that matters is: for a CURRENTLY-LIVE AllEvents
// event, does the detail page carry a description the api/events/list record lacks?
const fs = require("fs");
const path = require("path");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CITY_MAP = {
  Vaughan: "Vaughan",
  Woodbridge: "Vaughan",
  Thornhill: "Vaughan",
  Maple: "Vaughan",
  Concord: "Vaughan",
  "Richmond Hill": "Richmond Hill",
  Markham: "Markham",
  Unionville: "Markham",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { jsonLdDescription, metaDescription, bodyDescription } = require("./_tmp_108_extract.js");

async function fetchCity(city) {
  const res = await fetch("https://allevents.in/api/events/list", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      city,
      country: "canada",
      page: 0,
      rows: 500,
      popular: true,
      venue: [],
      keywords: "",
      type: "",
      sdate: "",
      edate: "",
      ids: [],
    }),
  });
  const j = await res.json();
  return j.data || [];
}

// which keys on the API record could plausibly carry description text?
const DESC_KEYS = ["description", "desc", "event_description", "about", "summary", "short_description", "details"];

(async () => {
  const all = [];
  for (const city of ["vaughan", "richmond hill", "markham"]) {
    const evs = await fetchCity(city);
    console.log(`API ${city}: ${evs.length} events`);
    all.push(...evs);
    await sleep(500);
  }

  // report which keys the API actually returns, once
  if (all.length) {
    console.log("\nAPI record keys:", Object.keys(all[0]).sort().join(", "));
    const present = DESC_KEYS.filter((k) => all.some((e) => e[k] && String(e[k]).trim().length > 0));
    console.log("description-ish keys with any non-empty value across all records:", present.length ? present.join(", ") : "NONE");
  }

  // same filters R1 applies: CITY_MAP + title + url + start_time, and still upcoming
  const now = Math.floor(Date.now() / 1000);
  const inScope = all.filter((ev) => {
    const city = CITY_MAP[((ev.venue || {}).city || "").trim()];
    const url = (ev.event_url || ev.share_url || "").trim();
    return city && (ev.eventname || "").trim() && url && ev.start_time && ev.start_time > now;
  });
  // dedupe by url
  const seen = new Set();
  const pool = inScope.filter((e) => {
    const u = (e.event_url || e.share_url).trim();
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  console.log(`\nin-scope upcoming AllEvents events (R1's own filters): ${pool.length}`);

  const N = 20;
  const step = pool.length / N;
  const sample = Array.from({ length: Math.min(N, pool.length) }, (_, i) => pool[Math.floor(i * step)]);

  const out = [];
  for (const ev of sample) {
    const url = (ev.event_url || ev.share_url).trim();
    const rec = {
      title: ev.eventname,
      url,
      city: ((ev.venue || {}).city || "").trim(),
      startsIn_days: Math.round((ev.start_time - now) / 86400),
      apiDescLen: DESC_KEYS.reduce((m, k) => Math.max(m, ev[k] ? String(ev[k]).trim().length : 0), 0),
      apiCategories: (ev.categories || []).length,
    };
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9" } });
      rec.status = res.status;
      const html = await res.text();
      rec.ld = jsonLdDescription(html);
      rec.meta = metaDescription(html);
      rec.body = bodyDescription(html);
      rec.ldLen = rec.ld.length;
      rec.metaLen = rec.meta.length;
      rec.bodyLen = rec.body.length;
      rec.ended = /event\s+(has\s+)?ended|this event has passed|event is over/i.test(html);
    } catch (e) {
      rec.error = String(e && e.message ? e.message : e).slice(0, 200);
    }
    out.push(rec);
    console.log(
      `+${rec.startsIn_days}d ${rec.city.padEnd(13)} api=${rec.apiDescLen} page_body=${rec.bodyLen} ld=${rec.ldLen} ended=${rec.ended}  ${String(rec.title).slice(0, 45)}`
    );
    await sleep(800);
  }
  fs.writeFileSync(path.join(__dirname, "_tmp_108_live_fetch.json"), JSON.stringify(out, null, 1));

  const ok = out.filter((r) => r.bodyLen > 0);
  console.log(`\n=== ${ok.length}/${out.length} live upcoming events yield a page description (median ${
    ok.length ? ok.map((r) => r.bodyLen).sort((a, b) => a - b)[Math.floor(ok.length / 2)] : 0
  } chars)`);
})();
