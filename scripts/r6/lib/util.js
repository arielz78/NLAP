// scripts/r6/lib/util.js
// Small shared helpers for the R6 demo harness. No I/O beyond hashing files.

const crypto = require("crypto");
const fs = require("fs");

const SECTIONS = ["For Families", "For Couples", "For Golden Age Readers"];

// Same convention as models/sectioning/gate_step4a.norm_title and the R7 instruments (Decision_Log §92):
// whitespace-collapsed, lowercase title. This is the series key.
function normTitle(t) {
  return String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Light venue normalization only: the 2026-07-07 check showed exact match works after case/punct/ws.
// Junk values come from models/ranking/config.py's blocklist.
const VENUE_BLOCKLIST = new Set([
  "online programs", "online", "online (markham public library)", "virtual", "tbd", "tba", "various locations",
]);
function normVenue(v) {
  const s = String(v || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
  if (!s || VENUE_BLOCKLIST.has(s)) return "";
  return s;
}

// Canonical URL helper, copied verbatim from fetchBeehiivHistory.js / joinClicksData.js (neither exports it).
function stripUtm(url) {
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign", "_bhlid", "fbclid", "acontext"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return url;
  }
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

// Dates as YYYY-MM-DD strings, compared lexically. No local-time parsing anywhere.
function ymd(v) {
  return typeof v === "string" ? v.slice(0, 10) : "";
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function daysBetween(fromIso, toIso) {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function stampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Title tokens for the report-only near-duplicate check (same family as overlapAudit.js).
const STOP = new Set(["the", "a", "an", "and", "of", "for", "in", "at", "to", "with", "on", "by", "&", "-", "–", "—"]);
function tokenSet(title) {
  return new Set(
    normTitle(title)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t))
  );
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

module.exports = {
  SECTIONS, normTitle, normVenue, stripUtm, sha256, sha256File, ymd, addDays, daysBetween,
  todayIso, stampForFilename, tokenSet, jaccard, median,
};
