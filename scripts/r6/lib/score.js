// scripts/r6/lib/score.js
// Routing + scoring. Pure functions over series with evidence and (optionally) attributes.
//
// Routing (which section pools a series enters):
//   1. Hard rules from the editor (2026-07-09, settled): alcohol -> For Couples only;
//      kids' activities -> For Families only. Applied here, never by the model.
//   2. Otherwise R7 section probabilities when supplied (argmax; flex when |Couples-Golden| <= flex_margin).
//   3. Otherwise the model's section_appeal (argmax; same flex rule on normalized appeal).
//      This fallback exists only because the demo may run without Voyage-embedded R7 scores.
//   4. No evidence -> unrouted, excluded with a reason.
//
// Score = renormalized weighted sum over KNOWN features in [0,1] minus penalties.
// Unknown features contribute nothing and their weight is dropped from the denominator
// ("unknown is never a zero", per the §51 thin-record concern). Weights are Ariel's.

const { SECTIONS } = require("./util.js");

function weightBlanks(weights) {
  const blanks = [];
  for (const [k, v] of Object.entries(weights.features || {})) if (typeof v !== "number") blanks.push(`features.${k}`);
  for (const [k, v] of Object.entries(weights.penalties || {})) if (typeof v !== "number") blanks.push(`penalties.${k}`);
  for (const k of ["recency_horizon_days", "recurring_cap_occurrences", "click_shrink_n", "flex_margin"]) {
    if (typeof (weights.params || {})[k] !== "number") blanks.push(`params.${k}`);
  }
  return blanks;
}

function attrValue(s, name) {
  const cell = s.attributes && s.attributes[name];
  return cell ? cell.value : "unknown";
}

function normalizedAppeal(s) {
  const a = attrValue(s, "section_appeal");
  if (a === "unknown" || typeof a !== "object") return null;
  const out = {};
  for (const sec of SECTIONS) out[sec] = (a[sec] - 1) / 4;
  return out;
}

function route(s, params) {
  const flags = [];
  const alcohol = attrValue(s, "alcohol") === true;
  const kids = attrValue(s, "kids_activities") === true;
  if (kids && alcohol) flags.push("hard_rule_conflict:kids+alcohol");
  if (kids) return { sections: ["For Families"], flex: false, routedBy: "hard_rule:kids", flags };
  if (alcohol) return { sections: ["For Couples"], flex: false, routedBy: "hard_rule:alcohol", flags };

  let probs = null;
  let routedBy = null;
  if (s.evidence.r7 && s.evidence.r7.section_probabilities) {
    probs = s.evidence.r7.section_probabilities;
    routedBy = "r7";
  } else {
    probs = normalizedAppeal(s);
    routedBy = probs ? "section_appeal" : null;
  }
  if (!probs) return { sections: [], flex: false, routedBy: "none", flags: [...flags, "unrouted:no_section_evidence"] };

  const top = SECTIONS.reduce((a, b) => (probs[a] >= probs[b] ? a : b));
  const c = probs["For Couples"], g = probs["For Golden Age Readers"];
  const flex = top !== "For Families" && Math.abs(c - g) <= params.flex_margin;
  const sections = flex ? ["For Couples", "For Golden Age Readers"] : [top];
  if (flex) flags.push("flex:couples_golden");
  return { sections, flex, routedBy, flags, probs };
}

// Feature extraction: name -> value in [0,1] or null (unknown).
function features(s, section, schema, weights) {
  const p = weights.params;
  const e = s.evidence;
  const f = {};
  f.p_include = e.r7 ? e.r7.p_include : null;
  f.section_fit = e.r7 && e.r7.section_probabilities ? e.r7.section_probabilities[section] : null;

  const byName = Object.fromEntries((schema.fields || []).map((x) => [x.name, x]));
  for (const name of ["novelty_type", "audience_breadth", "participation", "cost_tier"]) {
    const v = attrValue(s, name);
    const def = byName[name];
    f[name] = def && def.values && typeof def.values[v] === "number" ? def.values[v] : null;
  }
  const fd = attrValue(s, "food_drink");
  f.food_drink = fd === true ? 1 : fd === false ? 0 : null;
  const ap = normalizedAppeal(s);
  f.section_appeal = ap ? ap[section] : null;

  if (e.clickN > 0) {
    const k = p.click_shrink_n;
    f.click_prior = (e.clickN * e.clickMedianPct + k * 0.5) / (e.clickN + k);
  } else f.click_prior = null;
  return f;
}

// Days since the series last ran: strong joins always; probable (title-match) joins only when
// params.use_probable_history is true. Null when nothing matched.
function effectiveDaysSince(e, params) {
  const candidates = [e.daysSinceLastPublished];
  if (params && params.use_probable_history) candidates.push(e.probableDaysSince);
  const known = candidates.filter((d) => d !== null && d !== undefined);
  return known.length ? Math.min(...known) : null;
}

function penalties(s, weights) {
  const p = weights.params;
  const e = s.evidence;
  const out = {};
  const days = effectiveDaysSince(e, p);
  out.recency = days === null ? 0 : Math.max(0, 1 - days / p.recency_horizon_days);
  const occ = e.occurrencesInHorizon || 1;
  out.recurring = occ <= 1 ? 0 : Math.min(1, (occ - 1) / Math.max(1, p.recurring_cap_occurrences - 1));
  return out;
}

function scoreEntry(s, section, schema, weights) {
  const f = features(s, section, schema, weights);
  const pen = penalties(s, weights);
  let num = 0, den = 0;
  const used = {};
  for (const [name, w] of Object.entries(weights.features)) {
    if (f[name] === null || f[name] === undefined) continue;
    num += w * f[name];
    den += w;
    used[name] = f[name];
  }
  const base = den > 0 ? num / den : null;
  let penalty = 0;
  for (const [name, w] of Object.entries(weights.penalties)) penalty += w * pen[name];
  const score = base === null ? null : base - penalty;
  return { score, base, penalty, features: used, unknownFeatures: Object.keys(f).filter((k) => f[k] === null), penalties: pen };
}

// Builds the RankedPool: per section, ordered entries. mode = "scored" | "prior" | "date".
function buildRankedPool(series, { schema, weights, mode, issueDate }) {
  const pools = Object.fromEntries(SECTIONS.map((s) => [s, []]));
  const excluded = [];
  for (const s of series) {
    const r = route(s, weights ? weights.params : { flex_margin: 0 });
    s.routing = r;
    if (!r.sections.length) {
      excluded.push({ seriesKey: s.seriesKey, title: s.title, reason: "unrouted", flags: r.flags });
      continue;
    }
    for (const section of r.sections) {
      let ordering;
      let scoreInfo = null;
      if (mode === "scored") {
        scoreInfo = scoreEntry(s, section, schema, weights);
        ordering = scoreInfo.score;
      } else if (mode === "prior") {
        ordering = s.evidence.r7 ? s.evidence.r7.p_include * (s.evidence.r7.section_probabilities?.[section] ?? 1) : null;
      } else {
        ordering = null; // date mode: sorted by startDate below
      }
      const flags = [...r.flags];
      if (s.evidence.publishedCount) flags.push("published_before");
      else if (s.evidence.probableCount) flags.push("probably_published_before");
      const daysSince = effectiveDaysSince(s.evidence, weights ? weights.params : null);
      if (daysSince !== null && weights && typeof weights.params.recency_horizon_days === "number" && daysSince <= weights.params.recency_horizon_days) flags.push("published_recently");
      if (!s.evidence.completeness.hasDescription) flags.push("needs_a_look:no_description");
      if (s.attributes === null && mode === "scored") flags.push("needs_a_look:attributes_failed");
      if (s.nearDupCluster) flags.push(`near_dup:${s.nearDupCluster}`);
      pools[section].push({
        seriesKey: s.seriesKey,
        title: s.title,
        section,
        sections: r.sections,
        flex: r.flex,
        routedBy: r.routedBy,
        representativeId: s.representativeId,
        memberIds: s.memberIds,
        startDate: s.startDate,
        memberDates: s.memberDates,
        url: s.url,
        venue: s.venue,
        venueKey: s.venueKey,
        organizerKey: s.organizerKey,
        source: s.source,
        nearDupCluster: s.nearDupCluster || null,
        ordering,
        score: scoreInfo,
        flags,
        evidenceLines: s.evidenceLines,
        evidence: s.evidence,
        attributes: s.attributes || null,
      });
    }
  }
  for (const section of SECTIONS) {
    const arr = pools[section];
    if (mode === "date") arr.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
    else arr.sort((a, b) => (b.ordering ?? -Infinity) - (a.ordering ?? -Infinity) || a.startDate.localeCompare(b.startDate));
    arr.forEach((e, i) => (e.rank = i + 1));
  }
  return { issueDate, mode, sections: pools, excluded };
}

module.exports = { weightBlanks, route, features, penalties, scoreEntry, buildRankedPool, effectiveDaysSince };
