// #108 probe — do AllEvents HTML detail pages carry descriptions the JSON API never returns?
// Temp measurement script; delete (or promote to scripts/) once the finding is recorded.
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const sample = require(path.join(HERE, "_tmp_108_sample.json"));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function metaDescription(html) {
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decode(m[1]).trim();
  }
  return "";
}

function bodyDescription(html) {
  // AllEvents renders the long description in a container whose id/class mentions "description"
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

(async () => {
  const out = [];
  for (const r of sample) {
    const rec = {
      Row: r.Row,
      stratum: r.stratum,
      Event: r.Event,
      Link: r.Link,
      deckDetails: r.Details || "",
      deckLen: (r.Details || "").length,
    };
    try {
      const res = await fetch(r.Link, {
        headers: { "User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9" },
        redirect: "follow",
      });
      rec.status = res.status;
      rec.finalUrl = res.url;
      const html = await res.text();
      rec.htmlLen = html.length;
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
      `${rec.stratum} r${rec.Row} status=${rec.status || "ERR"} ld=${rec.ldLen} meta=${rec.metaLen} body=${rec.bodyLen} ended=${rec.ended} ${rec.error || ""}`
    );
    await sleep(800);
  }
  fs.writeFileSync(path.join(HERE, "_tmp_108_fetch.json"), JSON.stringify(out, null, 1));
  console.log("\nwrote _tmp_108_fetch.json");
})();
