// What the ranker reads from an event's own page (ship-plan item 14, #147; Decision_Log §105).
//
// The page fetch exists for shortlisted events whose source description is thin. A tag-strip of the
// whole page gave the model mostly site navigation, and Richmond Hill's description started past the
// 3,000-character cut, so it never arrived. Each known site's description is taken from the element
// that holds it, wherever it sits on the page. A known site whose markup no longer matches yields no
// text rather than the menu; only a site with no extractor falls back to a labelled tag-strip.
//
// AllEvents is not here: its pages carry five traps already handled by fetchAllEventsDescriptions.js.

const PAGE_TEXT_CAP = 3000; // Ariel, 2026-10-14: today's cap, so the prompt can never grow past its current size.

// Pinot's Palette is one product in rotation; the page adds a "children must be accompanied" line that
// reads as Families, which the editor has ruled out (editor_rules.template.md, Standing source rules).
const SKIP_HOSTS = [/(^|\.)pinotspalette\.com$/i];

const host = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const skipPage = (url) => SKIP_HOSTS.some((re) => re.test(host(url)));

function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function toText(html) {
  return decode(html.replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

// Inner HTML of the element whose opening tag starts at `start`, counting nested tags of the same name.
function innerAt(html, start) {
  const open = html.slice(start).match(/^<([a-z0-9]+)\b[^>]*>/i);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start + open[0].length;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start + open[0].length, m.index);
  }
  return null;
}

function innerOfFirst(html, openTagRe) {
  const m = html.match(openTagRe);
  return m ? innerAt(html, m.index) : null;
}

// The JSON value that follows `"key":`, read with string-aware brace matching.
function jsonValueAfter(source, key) {
  const k = source.indexOf(`"${key}":`);
  if (k < 0) return null;
  const start = source.indexOf("{", k);
  if (start < 0) return null;
  let depth = 0, inString = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) { if (ch === "\\") i++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

function jsonLdEventDescription(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let parsed;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      const types = [].concat(node["@type"] || []).join(" ");
      if (/Event\b/.test(types) && typeof node.description === "string" && node.description.trim()) return toText(node.description);
    }
  }
  return null;
}

const EXTRACTORS = [
  {
    host: /(^|\.)eventbrite\.(ca|com)$/i,
    run(html) {
      const sc = jsonValueAfter(html, "structuredContent");
      const body = (sc?.modules || []).filter((m) => m?.type === "text" && typeof m.text === "string").map((m) => toText(m.text)).join(" ").trim();
      if (body) return { text: body, method: "eventbrite_structured" };
      return { text: jsonLdEventDescription(html), method: "jsonld_event" };
    },
  },
  {
    host: /^calendar\.richmondhill\.ca$/i,
    run(html) {
      const details = innerOfFirst(html, /<div[^>]*class=["'][^"']*\bdetailsContent\b[^"']*["'][^>]*>/i);
      const h2 = details ? details.search(/<h2[^>]*>\s*Event Details:?\s*<\/h2>/i) : -1;
      if (h2 < 0) return { text: null, method: "richmondhill_details" };
      const block = innerAt(details, details.lastIndexOf("<div", h2));
      return { text: block ? toText(block.replace(/<h2[\s\S]*?<\/h2>/i, " ")) || null : null, method: "richmondhill_details" };
    },
  },
  {
    host: /(^|\.)vaughanpl\.info$/i,
    run(html) {
      const inner = innerOfFirst(html, /<div[^>]*class=["']description["'][^>]*>/i);
      return { text: inner ? toText(inner.split(/<div[^>]*class=["']share_span/i)[0]) || null : null, method: "vpl_description" };
    },
  },
];

// Returns { text, method, truncated }. text is null when nothing trustworthy was found.
function extractDescription(url, html) {
  const h = host(url);
  const known = EXTRACTORS.find((e) => e.host.test(h));
  let r;
  if (known) r = known.run(html);
  else {
    const ld = jsonLdEventDescription(html);
    r = ld ? { text: ld, method: "jsonld_event" } : { text: toText(html) || null, method: "tag_strip_fallback" };
  }
  const text = r.text || null;
  return { text: text && text.slice(0, PAGE_TEXT_CAP), method: r.method, truncated: Boolean(text && text.length > PAGE_TEXT_CAP), full_chars: text ? text.length : 0 };
}

// The page we landed on is the event we asked for: same path after redirects. Host and query may change
// (eventbrite.ca → .com, tracking params); a different path means a calendar, a listing or another event.
function sameEvent(requestedUrl, finalUrl) {
  const path = (u) => { try { return new URL(u).pathname.replace(/\/+$/, "").toLowerCase(); } catch { return null; } };
  const a = path(requestedUrl), b = path(finalUrl);
  return a !== null && a === b;
}

module.exports = { extractDescription, sameEvent, skipPage, PAGE_TEXT_CAP };
