// shared HTML description extractors for the #108 probe (temp)
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
      if (typeof node.description === "string" && node.description.length > best.length) best = node.description;
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

module.exports = { decode, strip, jsonLdDescription, metaDescription, bodyDescription };
