// scripts/r6/lib/attributes.js
// LLM call type 1: per-series attribute extraction. Strict schema from config/attribute_schema.json,
// temperature 0, JSON response, cached by (prompt_version | model | schema hash | text hash).
// The cache is the reproducibility mechanism: once extracted, a series' attributes are frozen for
// that key and replayed. Every call is appended to calls.jsonl in the run folder.
//
// The model never sees the hard rules as instructions to enforce; it reports facts (alcohol,
// kids' activities) and score.js applies the editor's rules deterministically.

const fs = require("fs");
const path = require("path");
const { sha256, SECTIONS } = require("./util.js");

const MODEL = process.env.R6_LLM_MODEL || "gpt-5.4-nano";
const BASE_URL = (process.env.R6_LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const TEXT_CAP = 2000; // chars of description sent; bounds tokens, labelled in the manifest

// ---------------------------------------------------------------------------
// Schema worksheet validation: refuse to run while any authored blank remains.
// ---------------------------------------------------------------------------
function schemaBlanks(schema) {
  const blanks = [];
  for (const f of schema.fields || []) {
    if (!f.definition || !String(f.definition).trim()) blanks.push(`${f.name}.definition`);
    if (f.values) {
      for (const [v, num] of Object.entries(f.values)) {
        if (typeof num !== "number") blanks.push(`${f.name}.values.${v}`);
      }
    }
  }
  return blanks;
}

function schemaHash(schema) {
  return sha256(JSON.stringify(schema.fields));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
function buildSystemPrompt(schema) {
  const fieldLines = (schema.fields || []).map((f) => {
    let allowed;
    if (f.type === "boolean") allowed = "true | false | \"unknown\"";
    else if (f.type === "appeal_1_5") allowed = `object {${SECTIONS.map((s) => `"${s}": 1-5`).join(", ")}} or "unknown"`;
    else allowed = Object.keys(f.values || {}).map((v) => `"${v}"`).concat('"unknown"').join(" | ");
    const quote = f.quote ? ' Also give "quote": the shortest phrase from the text that supports the value, or "" if none.' : "";
    return `- ${f.name}: ${f.definition} Allowed: ${allowed}.${quote}`;
  });
  return [
    "You extract editorial attributes for a hyperlocal weekly events newsletter covering Vaughan, Markham and Richmond Hill (Ontario).",
    "Sections: For Families (outings parents take kids to), For Couples (date-worthy adult experiences), For Golden Age Readers (seniors: daytime, accessible, social).",
    "Read ONLY the event text provided. Never invent facts. If the text does not support a value, answer \"unknown\".",
    "Return one JSON object with exactly these keys, each an object {\"value\": ..., \"quote\": ...}:",
    ...fieldLines,
    "No prose. No extra keys.",
  ].join("\n");
}

function buildUserPrompt(s) {
  const desc = (s.description || "").replace(/\s+/g, " ").trim().slice(0, TEXT_CAP);
  return [
    `TITLE: ${s.title}`,
    `DATE: ${s.startDate}${s.endDate && s.endDate !== s.startDate ? ` to ${s.endDate}` : ""}`,
    `VENUE: ${s.venue || "unknown"}`,
    `ORGANIZER: ${s.organizer || "unknown"}`,
    `CITY: ${s.city || "unknown"}`,
    `SOURCE: ${s.source || "unknown"}`,
    `COST: ${s.cost || "unknown"}`,
    `CATEGORIES: ${s.categories || "unknown"}`,
    `DESCRIPTION: ${desc || "(none on file)"}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Validation of the model's output against the schema
// ---------------------------------------------------------------------------
function validate(schema, obj) {
  const errors = [];
  const out = {};
  for (const f of schema.fields || []) {
    const cell = obj && obj[f.name];
    if (!cell || typeof cell !== "object" || !("value" in cell)) {
      errors.push(`missing ${f.name}`);
      continue;
    }
    let v = cell.value;
    if (v === "unknown" || v === null) v = "unknown";
    else if (f.type === "boolean") {
      if (typeof v === "string") v = v.toLowerCase() === "true" ? true : v.toLowerCase() === "false" ? false : "unknown";
      if (typeof v !== "boolean" && v !== "unknown") errors.push(`${f.name} not boolean`);
    } else if (f.type === "appeal_1_5") {
      if (typeof v !== "object") errors.push(`${f.name} not object`);
      else {
        const clean = {};
        for (const sec of SECTIONS) {
          const n = Number(v[sec]);
          if (!Number.isInteger(n) || n < 1 || n > 5) errors.push(`${f.name}.${sec} not 1-5`);
          clean[sec] = n;
        }
        v = clean;
      }
    } else if (f.values && !(v in f.values)) {
      errors.push(`${f.name} value ${JSON.stringify(v)} not allowed`);
    }
    out[f.name] = { value: v, quote: typeof cell.quote === "string" ? cell.quote.slice(0, 160) : "" };
  }
  return { ok: errors.length === 0, errors, attributes: out };
}

// ---------------------------------------------------------------------------
// Call + cache + audit
// ---------------------------------------------------------------------------
function timedFetch(url, opts = {}, ms = 60000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function callModel(apiKey, systemPrompt, userPrompt, extraUser) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  if (extraUser) messages.push({ role: "user", content: extraUser });
  const t0 = Date.now();
  const res = await timedFetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      max_completion_tokens: 900,
      messages,
    }),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, usage: data.usage || null, latencyMs };
}

async function extractAttributes(series, { schema, cacheDir, callsLogPath, maxCalls, apiKey, concurrency = 3 }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const systemPrompt = buildSystemPrompt(schema);
  const sHash = schemaHash(schema);
  const stats = { cacheHits: 0, calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, budgetStopped: 0 };
  const log = (row) => fs.appendFileSync(callsLogPath, JSON.stringify(row) + "\n");

  const queue = [...series];
  async function worker() {
    while (queue.length) {
      const s = queue.shift();
      const userPrompt = buildUserPrompt(s);
      const key = sha256(`${schema.prompt_version}|${MODEL}|${sHash}|${userPrompt}`);
      const cachePath = path.join(cacheDir, `${key}.json`);
      if (fs.existsSync(cachePath)) {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        s.attributes = cached.attributes;
        s.attributesMeta = { cacheHit: true, key };
        stats.cacheHits++;
        log({ seriesKey: s.seriesKey, cacheHit: true, key });
        continue;
      }
      if (!apiKey) {
        s.attributes = null;
        s.attributesMeta = { cacheHit: false, key, error: "no api key" };
        stats.failures++;
        continue;
      }
      if (stats.calls >= maxCalls) {
        s.attributes = null;
        s.attributesMeta = { cacheHit: false, key, error: "budget exhausted" };
        stats.budgetStopped++;
        continue;
      }
      let result = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        try {
          stats.calls++;
          const extra = attempt === 0 ? null : `Your previous answer was invalid: ${lastErr}. Return corrected JSON only.`;
          const r = await callModel(apiKey, systemPrompt, userPrompt, extra);
          stats.promptTokens += r.usage?.prompt_tokens || 0;
          stats.completionTokens += r.usage?.completion_tokens || 0;
          let parsed;
          try {
            parsed = JSON.parse(r.content);
          } catch (e) {
            lastErr = `not JSON (${e.message})`;
            log({ seriesKey: s.seriesKey, cacheHit: false, key, attempt, ok: false, error: lastErr, latencyMs: r.latencyMs, usage: r.usage });
            continue;
          }
          const v = validate(schema, parsed);
          log({ seriesKey: s.seriesKey, cacheHit: false, key, attempt, ok: v.ok, errors: v.errors, latencyMs: r.latencyMs, usage: r.usage, model: MODEL });
          if (v.ok) result = v.attributes;
          else lastErr = v.errors.join("; ");
        } catch (e) {
          lastErr = e.message;
          log({ seriesKey: s.seriesKey, cacheHit: false, key, attempt, ok: false, error: lastErr, model: MODEL });
        }
      }
      if (result) {
        s.attributes = result;
        s.attributesMeta = { cacheHit: false, key };
        fs.writeFileSync(cachePath, JSON.stringify({ key, model: MODEL, prompt_version: schema.prompt_version, attributes: result }, null, 2));
      } else {
        s.attributes = null;
        s.attributesMeta = { cacheHit: false, key, error: lastErr };
        stats.failures++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return stats;
}

module.exports = { schemaBlanks, schemaHash, buildSystemPrompt, buildUserPrompt, validate, extractAttributes, MODEL };
