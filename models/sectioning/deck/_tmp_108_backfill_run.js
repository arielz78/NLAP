// #108 Task 1 — backfill the label deck's AllEvents prose gap from the HTML detail pages.
// Read-only w.r.t. everything else: writes ONE new staging file, touches no corpus,
// no deck file, no embedding matrix, no Airtable.
//
// Traps honoured (all confirmed the hard way in the 07-27 probe):
//   1. ended events need "?ref=past-event-page"; live events don't
//   2. encodeURI() the URL (em-dashes in slugs throw ByteString errors)
//   3. verify the numeric event id in the FINAL url == the one requested (2/25 silently redirected)
//   4. retry once before recording a miss (transient 410s succeed on retry)
//   5. body container with id/class ~ "description" only; og:description is boilerplate; JSON-LD truncates ~300
const fs = require("fs");
const path = require("path");
const { jsonLdDescription, bodyDescription } = require("./_tmp_108_extract.js");

const HERE = __dirname;
const DECK = require(path.join(HERE, "editor_deck_2026-07-18.json"));
const OUT = path.join(HERE, "allevents_backfill_2026-07-27.json");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DELAY = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (e) {
    return "(none)";
  }
};
const stratumOf = (r) => {
  const t = (r.Details || "").trim();
  if (!t) return "blank";
  if (/^AllEvents Categories:/i.test(t)) return "block";
  if (t.length < 60) return "short";
  return "prose";
};
// AllEvents detail urls end in a long numeric event id
const idOf = (u) => {
  try {
    const segs = new URL(u).pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] || "";
    return /^\d{6,}$/.test(last) ? last : null;
  } catch (e) {
    return null;
  }
};

async function get(url) {
  const res = await fetch(encodeURI(url), {
    headers: { "User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9" },
    redirect: "follow",
  });
  const html = await res.text();
  return { status: res.status, finalUrl: res.url, html };
}

function extract(html) {
  const body = bodyDescription(html);
  if (body) return { text: body, source: "body" };
  const ld = jsonLdDescription(html);
  if (ld) return { text: ld, source: "jsonld" };
  return { text: "", source: null };
}

const ENDED_RE = /event\s+(has\s+)?ended|this event has passed|event is over/i;

(async () => {
  const targets = DECK.filter((r) => host(r.Link) === "allevents.in" && stratumOf(r) !== "prose");
  console.log(`targets: ${targets.length}`);

  const out = [];
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    const requestedId = idOf(r.Link);
    const rec = {
      Row: r.Row,
      Event: r.Event,
      stratum: stratumOf(r),
      deckDetails: r.Details || "",
      deckLen: (r.Details || "").length,
      Link: r.Link,
      requestedId,
      finalUrl: "",
      finalId: null,
      idMatched: false,
      status: null,
      recoveredText: "",
      recoveredLen: 0,
      source: null,
      attempts: 0,
      ended: false,
      usedRefParam: false,
      error: null,
    };

    // pass 1: plain url, with one retry on transport/HTTP failure
    let page = null;
    for (let a = 0; a < 2 && !page; a++) {
      rec.attempts++;
      try {
        const p = await get(r.Link);
        rec.status = p.status;
        if (p.status === 200) page = p;
        else if (a === 1) rec.error = `http ${p.status}`;
      } catch (e) {
        rec.error = String((e && e.message) || e).slice(0, 200);
      }
      if (!page) await sleep(DELAY);
    }

    if (page) {
      rec.ended = ENDED_RE.test(page.html);
      let best = extract(page.html);
      // pass 2: ended pages hide the body unless asked for the past-event view
      if (!best.text) {
        const refUrl = r.Link + (r.Link.includes("?") ? "&" : "?") + "ref=past-event-page";
        let page2 = null;
        for (let a = 0; a < 2 && !page2; a++) {
          rec.attempts++;
          await sleep(DELAY);
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
      rec.finalId = idOf(page.finalUrl);
      rec.idMatched = !!(requestedId && rec.finalId && requestedId === rec.finalId);
      if (best.text) {
        rec.recoveredText = best.text;
        rec.recoveredLen = best.text.length;
        rec.source = best.source;
      }
      // never keep a redirected page's text on this row
      if (!rec.idMatched) {
        rec.error = rec.error || "id-mismatch: discarded";
        rec.recoveredText = "";
        rec.recoveredLen = 0;
        rec.source = null;
      }
    }

    out.push(rec);
    console.log(
      `[${i + 1}/${targets.length}] r${rec.Row} ${rec.stratum.padEnd(5)} st=${rec.status} len=${rec.recoveredLen} src=${rec.source || "-"} ref=${rec.usedRefParam} ended=${rec.ended} idOk=${rec.idMatched} ${rec.error || ""}`
    );
    if (i % 10 === 0) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    await sleep(DELAY);
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${OUT} (${out.length} records)`);
})();
