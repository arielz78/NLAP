// Task 1 reporting over allevents_backfill_2026-07-27.json. Read-only analysis.
const path = require("path");
const HERE = __dirname;
const bf = require(path.join(HERE, "allevents_backfill_2026-07-27.json"));
const DECK = require(path.join(HERE, "editor_deck_2026-07-18.json"));

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
const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

const rec = bf.filter((r) => r.recoveredLen > 0);
console.log(`=== TASK 1 — AllEvents backfill (${bf.length} targets)`);
console.log(`recovered: ${rec.length}/${bf.length} = ${pct(rec.length, bf.length)}`);

// by stratum
const strat = {};
for (const r of bf) {
  strat[r.stratum] = strat[r.stratum] || { n: 0, ok: 0, lens: [] };
  strat[r.stratum].n++;
  if (r.recoveredLen > 0) {
    strat[r.stratum].ok++;
    strat[r.stratum].lens.push(r.recoveredLen);
  }
}
for (const [k, v] of Object.entries(strat)) {
  console.log(
    `  ${k.padEnd(6)} ${v.ok}/${v.n} = ${pct(v.ok, v.n)}   len min/med/max ${v.lens.length ? `${Math.min(...v.lens)}/${q(v.lens, 0.5)}/${Math.max(...v.lens)}` : "-"}`
  );
}

const lens = rec.map((r) => r.recoveredLen);
console.log(
  `\nlength distribution (recovered): min ${Math.min(...lens)} · p25 ${q(lens, 0.25)} · median ${q(lens, 0.5)} · p75 ${q(lens, 0.75)} · max ${Math.max(...lens)} · mean ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}`
);
const bySrc = {};
rec.forEach((r) => (bySrc[r.source] = (bySrc[r.source] || 0) + 1));
console.log("extraction source:", bySrc);
const under = rec.filter((r) => r.recoveredLen < 60).length;
console.log(`recovered but still <60 chars (would not clear the 'real prose' bar): ${under}`);
const over300 = rec.filter((r) => r.recoveredLen > 300).length;
console.log(`recovered longer than the 300-char DESC_CHAR_CAP: ${over300}/${rec.length} = ${pct(over300, rec.length)}`);

// ended / ref-param
console.log(
  `\nended pages: ${bf.filter((r) => r.ended).length}/${bf.length}; used ?ref=past-event-page: ${bf.filter((r) => r.usedRefParam).length}`
);
const endedRows = bf.filter((r) => r.ended);
const liveRows = bf.filter((r) => !r.ended);
console.log(
  `  recovery on ENDED pages: ${endedRows.filter((r) => r.recoveredLen > 0).length}/${endedRows.length} = ${pct(endedRows.filter((r) => r.recoveredLen > 0).length, endedRows.length)}`
);
console.log(
  `  recovery on LIVE  pages: ${liveRows.filter((r) => r.recoveredLen > 0).length}/${liveRows.length} = ${pct(liveRows.filter((r) => r.recoveredLen > 0).length, liveRows.length)}`
);

// discards + errors
const mismatch = bf.filter((r) => !r.idMatched);
console.log(`\nID MISMATCH / discarded: ${mismatch.length}`);
mismatch.forEach((r) =>
  console.log(`  r${r.Row} req=${r.requestedId} final=${r.finalId} status=${r.status} err=${r.error} :: ${String(r.Event).slice(0, 55)}\n      finalUrl=${r.finalUrl}`)
);
const errs = bf.filter((r) => r.error && r.idMatched);
console.log(`other errors (id ok): ${errs.length}`);
errs.forEach((r) => console.log(`  r${r.Row} ${r.error} :: ${String(r.Event).slice(0, 55)}`));

const misses = bf.filter((r) => r.idMatched && r.recoveredLen === 0);
console.log(`\ngenuine misses (page fetched, id matched, no description): ${misses.length}`);
misses.forEach((r) => console.log(`  r${r.Row} ended=${r.ended} :: ${String(r.Event).slice(0, 70)}`));

// residual gap deck-wide
const recovered = new Map(bf.filter((r) => r.recoveredLen >= 60).map((r) => [r.Row, r]));
const before = { total: 0, gap: 0, byHost: {} };
const after = { gap: 0, byHost: {} };
for (const r of DECK) {
  const h = host(r.Link);
  const s = stratumOf(r);
  before.total++;
  before.byHost[h] = before.byHost[h] || { n: 0, gap: 0, gapAfter: 0 };
  before.byHost[h].n++;
  if (s !== "prose") {
    before.gap++;
    before.byHost[h].gap++;
    if (!recovered.has(r.Row)) {
      after.gap++;
      before.byHost[h].gapAfter++;
    }
  }
}
console.log(`\n=== residual prose gap over the whole ${before.total}-row deck`);
console.log(`  before: ${before.gap}/${before.total} = ${pct(before.gap, before.total)}`);
console.log(`  after : ${after.gap}/${before.total} = ${pct(after.gap, before.total)}`);
console.log("  by host (n · gap before · gap after):");
Object.entries(before.byHost)
  .sort((a, b) => b[1].n - a[1].n)
  .forEach(([h, v]) => console.log(`    ${h.padEnd(28)} ${String(v.n).padStart(3)}  ${String(v.gap).padStart(3)}  ${String(v.gapAfter).padStart(3)}`));

// spot check
console.log(`\n=== 5-row qualitative spot check`);
const picks = [
  rec.filter((r) => r.stratum === "block").sort((a, b) => b.recoveredLen - a.recoveredLen)[0],
  rec.filter((r) => r.stratum === "block")[Math.floor(rec.filter((r) => r.stratum === "block").length / 2)],
  rec.filter((r) => r.stratum === "blank")[0],
  rec.filter((r) => r.stratum === "blank").sort((a, b) => a.recoveredLen - b.recoveredLen)[0],
  rec.filter((r) => r.stratum === "short")[0],
].filter(Boolean);
for (const p of picks) {
  console.log(`\n--- Row ${p.Row} [${p.stratum}] ${p.Event}`);
  console.log(`    DECK Details (${p.deckLen}): ${JSON.stringify(p.deckDetails.slice(0, 200))}`);
  console.log(`    RECOVERED (${p.recoveredLen}, src=${p.source}): ${JSON.stringify(p.recoveredText.replace(/\s+/g, " ").slice(0, 420))}`);
}
