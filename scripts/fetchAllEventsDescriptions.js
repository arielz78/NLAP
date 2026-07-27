/**
 * Fetch AllEvents event descriptions from their HTML detail pages.
 *
 * WHY THIS EXISTS: the AllEvents JSON API we integrate (`POST allevents.in/api/events/list`)
 * carries NO description key at all -- verified absent, not merely empty, across 392 live
 * records. Every event's own detail page IS server-side rendered with the description.
 * Measured 2026-07-27 (#108): 20/20 currently-live events yield one (median 1,097 chars);
 * 111/137 (81.0%) of the R7 label deck's prose-gap rows yield one (median 908 chars).
 *
 * This is the reference implementation for the R1 `AllEvents Normalize` enhancement (#108).
 * It is NOT wired into R1 -- that build has three unresolved decisions attached (the 300-char
 * cap in clean(), dedup richest-wins survivorship per DL§51/#72, and backfill timing).
 *
 * FIVE CONSTRAINTS, ALL LEARNED THE HARD WAY. A fetch that skips any of them corrupts data:
 *   1. ENDED events serve a stripped page unless the url carries "?ref=past-event-page".
 *      Live events do not need it. Try plain first, then the ref variant.
 *   2. encodeURI() the url -- em-dashes in AllEvents slugs throw
 *      "Cannot convert argument to a ByteString".
 *   3. VERIFY THE NUMERIC EVENT ID in the final (post-redirect) url matches the one requested.
 *      3 of 137 (2.2%) silently redirected to a DIFFERENT event. Writing a redirected page's
 *      text onto the original row is a silent data-poisoning bug with no symptom. Discard.
 *   4. Retry once before recording a miss -- transient 410s succeed on retry.
 *   5. Extract ONLY from the DOM container whose id/class contains "description".
 *      og:description is templated boilerplate ("Find tickets & information for X...") and must
 *      never be accepted. JSON-LD truncates at ~300 chars -- second choice only.
 *
 * Polite delay >= 800ms between requests. ~200-300 events/week at production volume.
 *
 * Extracted text carries two artifacts the caller should strip: the event title duplicated at
 * the head (106/111 records), and a trailing "Also check out other <cat> in <city> ." nav
 * sentence. Both are position-anchored and safe to remove; neither is stripped here, because
 * where that belongs (clean() vs the fetch) is an open call.
 *
 * Usage:
 *   const { fetchDescription, fetchMany } = require("./fetchAllEventsDescriptions.js");
 *   const rec = await fetchDescription("https://allevents.in/vaughan/some-event/100001992700496828");
 *
 *   node scripts/fetchAllEventsDescriptions.js <urls.json> [out.json]
 *     <urls.json> = array of url strings, or of objects carrying a `url` or `Link` key.
 */
const fs = require("fs");
const path = require("path");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DELAY_MS = 900;
const ENDED_RE = /event\s+(has\s+)?ended|this event has passed|event is over/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- html -> text -----------------------------------------------------------------------
function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function strip(h) {
  const noScript = h.replace(/<script[\s\S]*?<\/script>/gi, "");
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, "");
  const brs = noStyle.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  return decode(brs.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Constraint 5 (primary): the container whose id/class mentions "description". */
function bodyDescription(html) {
  const patterns = [
    /<div[^>]*(?:id|class)=["'][^"']*event[-_ ]?description[^"']*["'][^>]*>([\s\S]{0,40000}?)<\/div>/i,
    /<section[^>]*(?:id|class)=["'][^"']*description[^"']*["'][^>]*>([\s\S]{0,40000}?)<\/section>/i,
    /<div[^>]*(?:id|class)=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]{0,40000}?)<\/div>/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const t = strip(m[1]);
      if (t) return t;
    }
  }
  return "";
}

/** Constraint 5 (fallback): JSON-LD. Truncates at ~300 chars -- second choice only. */
function jsonLdDescription(html) {
  let best = "";
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch (e) {
      continue;
    }
    const queue = Array.isArray(parsed) ? parsed.slice() : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      if (typeof node.description === "string" && node.description.length > best.length) {
        best = node.description;
      }
    }
  }
  return strip(best);
}

// NOTE: there is deliberately no metaDescription() here. og:description on AllEvents is
// templated boilerplate and accepting it produces text that looks like a description and isn't.

/** AllEvents detail urls end in a long numeric event id. Constraint 3 depends on this. */
function eventIdOf(u) {
  try {
    const segs = new URL(u).pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] || "";
    return /^\d{6,}$/.test(last) ? last : null;
  } catch (e) {
    return null;
  }
}

async function get(url) {
  const res = await fetch(encodeURI(url), {
    headers: { "User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9" },
    redirect: "follow",
  });
  return { status: res.status, finalUrl: res.url, html: await res.text() };
}

function extract(html) {
  const body = bodyDescription(html);
  if (body) return { text: body, source: "body" };
  const ld = jsonLdDescription(html);
  if (ld) return { text: ld, source: "jsonld" };
  return { text: "", source: null };
}

/**
 * Fetch one event's description. Never throws; failures come back on the record.
 * Returns { url, finalUrl, requestedId, finalId, idMatched, status, description,
 *           descriptionLen, source, attempts, ended, usedRefParam, error }.
 * `description` is guaranteed empty when `idMatched` is false.
 */
async function fetchDescription(url, opts = {}) {
  const delay = opts.delayMs == null ? DELAY_MS : opts.delayMs;
  const requestedId = eventIdOf(url);
  const rec = {
    url,
    finalUrl: "",
    requestedId,
    finalId: null,
    idMatched: false,
    status: null,
    description: "",
    descriptionLen: 0,
    source: null,
    attempts: 0,
    ended: false,
    usedRefParam: false,
    error: null,
  };

  // pass 1 -- plain url, with one retry on transport/HTTP failure (constraint 4)
  let page = null;
  for (let a = 0; a < 2 && !page; a++) {
    rec.attempts++;
    try {
      const p = await get(url);
      rec.status = p.status;
      if (p.status === 200) page = p;
      else if (a === 1) rec.error = `http ${p.status}`;
    } catch (e) {
      rec.error = String((e && e.message) || e).slice(0, 200);
    }
    if (!page) await sleep(delay);
  }
  if (!page) return rec;

  rec.ended = ENDED_RE.test(page.html);
  let best = extract(page.html);

  // pass 2 -- ended pages hide the body unless asked for the past-event view (constraint 1)
  if (!best.text) {
    const refUrl = url + (url.includes("?") ? "&" : "?") + "ref=past-event-page";
    let page2 = null;
    for (let a = 0; a < 2 && !page2; a++) {
      rec.attempts++;
      await sleep(delay);
      try {
        const p = await get(refUrl);
        if (p.status === 200) page2 = p;
        else if (a === 1) rec.error = rec.error || `http ${p.status} (ref)`;
      } catch (e) {
        rec.error = rec.error || String((e && e.message) || e).slice(0, 200);
      }
    }
    if (page2) {
      rec.usedRefParam = true;
      rec.status = 200;
      rec.ended = rec.ended || ENDED_RE.test(page2.html);
      const b2 = extract(page2.html);
      if (b2.text) {
        best = b2;
        page = page2;
      }
    }
  }

  rec.finalUrl = page.finalUrl;
  rec.finalId = eventIdOf(page.finalUrl);
  rec.idMatched = !!(requestedId && rec.finalId && requestedId === rec.finalId);

  if (best.text) {
    rec.description = best.text;
    rec.descriptionLen = best.text.length;
    rec.source = best.source;
  }
  // constraint 3 -- never keep a redirected page's text on this row
  if (!rec.idMatched) {
    rec.error = rec.error || "id-mismatch: discarded";
    rec.description = "";
    rec.descriptionLen = 0;
    rec.source = null;
  }
  return rec;
}

/** Sequential, politely paced. `onRecord(rec, i, total)` is called after each fetch. */
async function fetchMany(urls, opts = {}) {
  const delay = opts.delayMs == null ? DELAY_MS : opts.delayMs;
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const rec = await fetchDescription(urls[i], opts);
    out.push(rec);
    if (opts.onRecord) opts.onRecord(rec, i, urls.length);
    if (i < urls.length - 1) await sleep(delay);
  }
  return out;
}

module.exports = { fetchDescription, fetchMany, bodyDescription, jsonLdDescription, eventIdOf, strip };

// --- CLI --------------------------------------------------------------------------------
if (require.main === module) {
  const [, , inPath, outPath] = process.argv;
  if (!inPath) {
    console.error("usage: node scripts/fetchAllEventsDescriptions.js <urls.json> [out.json]");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(path.resolve(inPath), "utf8"));
  const urls = raw
    .map((r) => (typeof r === "string" ? r : r.url || r.Link))
    .filter((u) => u && /allevents\.in/.test(u));
  console.log(`fetching ${urls.length} AllEvents detail pages...`);

  fetchMany(urls, {
    onRecord: (rec, i, total) =>
      console.log(
        `[${i + 1}/${total}] len=${rec.descriptionLen} src=${rec.source || "-"} ref=${rec.usedRefParam} ended=${rec.ended} idOk=${rec.idMatched} ${rec.error || ""}`
      ),
  }).then((out) => {
    const ok = out.filter((r) => r.descriptionLen > 0);
    const lens = ok.map((r) => r.descriptionLen).sort((a, b) => a - b);
    console.log(
      `\n${ok.length}/${out.length} recovered (${((100 * ok.length) / out.length).toFixed(1)}%)` +
        (lens.length ? `, median ${lens[Math.floor(lens.length / 2)]} chars` : "") +
        `; ${out.filter((r) => !r.idMatched && r.status === 200).length} discarded for id mismatch`
    );
    if (outPath) {
      fs.writeFileSync(path.resolve(outPath), JSON.stringify(out, null, 1));
      console.log(`wrote ${outPath}`);
    }
  });
}
