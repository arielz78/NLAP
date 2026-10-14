/**
 * R4 — generateBlurbs.js
 * Fetches IssueItems for a target issue, calls gpt-5.4-nano to generate
 * newsletter blurbs in client format, validates 9-11 word count, writes
 * DisplayTitle, Description, and CTA back to IssueItems.
 *
 * Usage:
 *   node generateBlurbs.js [ISSUE_DATE]
 *   node generateBlurbs.js 2026-04-09
 *
 * Env (NLAP_Airtable.env):
 *   AIRTABLE_API_KEY=...
 *   OPENAI_API_KEY=...
 */

require('dotenv').config({ path: require('path').join(__dirname, '../NLAP_Airtable.env') });

// ── Config ────────────────────────────────────────────────────────────────────
const AIRTABLE_KEY        = process.env.AIRTABLE_API_KEY;
const OPENAI_KEY          = process.env.OPENAI_API_KEY;
const BASE_ID             = process.env.AIRTABLE_BASE_ID;
const ISSUEITEMS_TABLE_ID = 'tblrz2fZYUhxpZph2';
const DRY_RUN             = process.argv.includes('--dry-run');
const TARGET_DATE         = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const MODEL               = 'gpt-5.4-nano';

// Checked in main(), not here, so the test file can require() this module.
function checkConfig() {
  if (!TARGET_DATE) { console.error('Usage: node generateBlurbs.js YYYY-MM-DD [--dry-run]'); process.exit(1); }
  if (!AIRTABLE_KEY) throw new Error('AIRTABLE_API_KEY missing from NLAP_Airtable.env');
  if (!OPENAI_KEY)   throw new Error('OPENAI_API_KEY missing from NLAP_Airtable.env');
  if (!BASE_ID)      throw new Error('AIRTABLE_BASE_ID missing from NLAP_Airtable.env');
}

// ── Fetch timeout ──────────────────────────────────────────────────────────────
function timedFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// ── Airtable helpers ──────────────────────────────────────────────────────────
async function metaFetch(path, opts = {}) {
  const url = `https://api.airtable.com/v0/meta/${path}`;
  const res = await timedFetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable META ${opts.method || 'GET'} /meta/${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function ensureIssueItemFields() {
  const data = await metaFetch(`bases/${BASE_ID}/tables`);
  const table = data.tables.find(t => t.id === ISSUEITEMS_TABLE_ID);
  if (!table) throw new Error(`IssueItems table ${ISSUEITEMS_TABLE_ID} not found in base`);
  const existingNames = new Set(table.fields.map(f => f.name));
  const toCreate = [
    { name: 'DisplayTitle', type: 'singleLineText' },
    { name: 'Description',  type: 'singleLineText' },
    { name: 'CTA',          type: 'singleLineText' },
  ].filter(f => !existingNames.has(f.name));
  for (const field of toCreate) {
    await metaFetch(`bases/${BASE_ID}/tables/${ISSUEITEMS_TABLE_ID}/fields`, {
      method: 'POST',
      body: JSON.stringify(field)
    });
    console.log(`  ✅ Created field: ${field.name}`);
  }
  if (!toCreate.length) console.log('  Fields DisplayTitle, Description, CTA already exist.');
}

async function atFetch(path, opts = {}, retries = 3) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await timedFetch(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      }
    });
    if (res.status === 429) {
      if (attempt === retries) throw new Error(`Airtable rate limit hit on /${path} — out of retries`);
      const wait = parseInt(res.headers.get('Retry-After') ?? '1', 10) * 1000;
      console.warn(`Rate limited on /${path} — retrying in ${wait}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${opts.method || 'GET'} /${path} → ${res.status}: ${body}`);
    }
    return res.json();
  }
}

async function getAllRecords(table, formula) {
  let records = [], offset;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (formula) params.set('filterByFormula', formula);
    if (offset)  params.set('offset', offset);
    const data = await atFetch(`${encodeURIComponent(table)}?${params}`);
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return records;
}

async function getRecord(table, id) {
  return atFetch(`${encodeURIComponent(table)}/${id}`);
}

async function patchRecord(table, id, fields) {
  return atFetch(`${encodeURIComponent(table)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields })
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function stripHtml(str) {
  return (str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// One emoji as the reader sees it: flags, skin tones and ZWJ families count as one.
const EMOJI_RE = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}️?\p{Emoji_Modifier}?(?:‍\p{Extended_Pictographic}️?\p{Emoji_Modifier}?)*/gu;

// Backstop for the model writing its emoji into the title as well, or writing the title twice
// (both seen on the real model, 2026-10-14). The emoji field is the only emoji the title keeps.
function cleanTitle(raw) {
  const found = raw.match(EMOJI_RE) || [];
  let title = raw.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
  const words = title.split(' ');
  const half = words.length / 2;
  const repeated = words.length >= 2 && Number.isInteger(half) &&
    words.slice(0, half).join(' ') === words.slice(half).join(' ');
  if (repeated) title = words.slice(0, half).join(' ');
  return { title, firstEmoji: found[0] || '', hadEmoji: found.length > 0, repeated };
}

// ── LLM call ──────────────────────────────────────────────────────────────────
// One call per event. The code holds the row; the model never sees a row ID or a list index,
// so a blurb cannot land on another event's row. CTAs already used are passed in instead.
function buildPrompts(item, issueDate, usedCtas) {
  const systemPrompt = `You are a newsletter copywriter for the Vaughan Brief, a warm local events newsletter for the Greater Toronto Area. Audience: 75% women aged 35–60. Most popular section: For Families.

For the event provided, generate a blurb with THREE parts:
1. A creative display title of ~6 words in Title Case — NOT the original event name verbatim. Rephrase to be engaging and specific. You may use an em dash (–) to add urgency or context (e.g. "– Last Chance", "– Free Admission", "– Kids Welcome"). The title has no emoji: put one emoji that fits the event in the separate "emoji" field only. Example title: "Canada's Largest Maple Syrup Festival – Last Chance" or "Family Mapping & Orienteering at Kortright"
2. A description of 10 words — aim for exactly 10, but 9 or 11 is acceptable
3. A 2–3 word CTA that is different from every CTA listed as already used

Style rules:
- Warm, community-focused, never salesy
- No hype, no superlatives, no filler
- Descriptions must be factual and event-specific — no generic copy
- CTAs vary meaningfully (not just synonyms): e.g. "Book Now", "Join the Fun", "Register Today", "Grab Tickets", "Plan Your Visit", "Come Along", "Reserve a Spot", "Learn More", "Sign Up Free", "Find Out More", "Attend Tonight", "Explore It"

Return ONLY valid JSON — no markdown, no preamble:
{
  "emoji": "🎭",
  "displayTitle": "Creative Six-Word Title for This Event",
  "description": "Exactly ten words that describe this specific event well",
  "cta": "Book Now"
}`;

  const used = usedCtas.length ? usedCtas.map(c => `"${c}"`).join(', ') : 'none';
  const userPrompt = `Issue date: ${issueDate}\nCTAs already used in this issue: ${used}\n\nTITLE: ${item.title}\nDESC: ${item.desc.slice(0, 600)}\nSECTION: ${item.section}\nCITY: ${item.city}`;

  return { systemPrompt, userPrompt };
}

// Strict schema: the API cannot return a blurb with a field missing, so the emoji is always present.
const BLURB_SCHEMA = {
  type: 'object',
  properties: {
    emoji:        { type: 'string' },
    displayTitle: { type: 'string' },
    description:  { type: 'string' },
    cta:          { type: 'string' }
  },
  required: ['emoji', 'displayTitle', 'description', 'cta'],
  additionalProperties: false
};

function buildRequestBody(item, issueDate, usedCtas) {
  const { systemPrompt, userPrompt } = buildPrompts(item, issueDate, usedCtas);
  return {
    model: MODEL,
    temperature: 0.3,
    response_format: { type: 'json_schema', json_schema: { name: 'blurb', strict: true, schema: BLURB_SCHEMA } },
    max_completion_tokens: 2500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ]
  };
}

async function callGPT(item, issueDate, usedCtas) {
  const res = await timedFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRequestBody(item, issueDate, usedCtas))
  }, 60000);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const raw  = data.choices[0].message.content;

  let blurb;
  try {
    blurb = JSON.parse(raw);
  } catch (e) {
    throw new Error(`GPT JSON parse failed: ${e.message}\nRaw:\n${raw}`);
  }
  if (!blurb || typeof blurb.description !== 'string' || typeof blurb.displayTitle !== 'string') {
    throw new Error(`GPT returned no blurb fields.\nRaw:\n${raw}`);
  }
  return blurb;
}

// Calls the model once per item, in order, and validates each blurb. A failed call stops the run
// (naming the row) rather than leaving one event without copy.
async function blurbItems(itemsToBlurb, issueDate, callModel = callGPT, log = console.log) {
  const ctaSeen = new Set();
  const usedCtas = [];
  const results = [];

  for (const item of itemsToBlurb) {
    let blurb;
    try {
      blurb = await callModel(item, issueDate, [...usedCtas]);
    } catch (e) {
      throw new Error(`Blurb for ${item.id} [${item.section} / Slot ${item.slot}] failed: ${e.message}`);
    }

    const wc         = countWords(blurb.description);
    const wordOk     = wc >= 9 && wc <= 11;
    const ctaDupe    = ctaSeen.has((blurb.cta || '').toLowerCase());
    const ctaWords   = countWords(blurb.cta || '');
    const ctaOk      = !ctaDupe && ctaWords >= 2 && ctaWords <= 3;

    ctaSeen.add((blurb.cta || '').toLowerCase());
    usedCtas.push(blurb.cta || '');

    const cleaned = cleanTitle(blurb.displayTitle);
    const emoji = (typeof blurb.emoji === 'string' ? blurb.emoji.trim() : '') || cleaned.firstEmoji;

    const flags = [
      !wordOk  ? `WORD_COUNT:${wc}/10` : '',
      ctaDupe  ? 'CTA_DUPLICATE'       : '',
      !ctaOk && !ctaDupe ? `CTA_LENGTH:${ctaWords}` : '',
      !emoji   ? 'NO_EMOJI'            : '',
      cleaned.hadEmoji ? 'TITLE_HAD_EMOJI' : '',
      cleaned.repeated ? 'TITLE_REPEATED'  : ''
    ].filter(Boolean).join(' | ');

    const displayTitle = emoji ? `${emoji} ${cleaned.title}` : cleaned.title;

    log(`[${item.section} | Slot ${item.slot}]  ${wordOk ? '✅' : '⚠️ '} ${wc}w  CTA: "${blurb.cta}" ${ctaOk ? '✅' : '⚠️ '}`);
    log(`  ${displayTitle}`);
    log(`  "${blurb.description}"`);
    log();

    results.push({ id: item.id, displayTitle, description: blurb.description, cta: blurb.cta, flags, valid: wordOk && ctaOk });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  checkConfig();
  console.log(`\n🎯 R4 Blurb Generator`);
  console.log(`   Issue: ${TARGET_DATE}${DRY_RUN ? '  [DRY RUN — no writes]' : ''}\n`);

  // 0. Ensure Airtable fields exist
  console.log('🔧 Ensuring IssueItems fields...');
  await ensureIssueItemFields();

  // 1. Find the issue
  const issues = await getAllRecords('Issues', `IS_SAME({IssueDate}, "${TARGET_DATE}", "day")`);
  if (!issues.length) throw new Error(`No issue found for date: ${TARGET_DATE}`);
  const issue   = issues[0];
  const issueId = issue.id;
  console.log(`✅ Issue: ${issueId}  status=${issue.fields.Status || 'unknown'}`);

  // 2. Fetch IssueItems
  const formula = `SEARCH("${TARGET_DATE}", {Name}) > 0`;
  const rawItems = await getAllRecords('IssueItems', formula);
  if (!rawItems.length) throw new Error('No IssueItems found for this issue.');
  console.log(`📋 IssueItems: ${rawItems.length}`);

  // 3. Fetch linked Candidate records (Event Title + DescriptionRaw + City)
  const candidateIds = [...new Set(
    rawItems.map(r => (r.fields.Candidate || [])[0]).filter(Boolean)
  )];
  console.log(`📦 Fetching ${candidateIds.length} candidates...`);

  const candidateMap = {};
  for (const cid of candidateIds) {
    try {
      const rec = await getRecord('Candidates', cid);
      candidateMap[cid] = rec.fields;
    } catch (e) {
      console.warn(`   ⚠️  Candidate ${cid} fetch failed: ${e.message}`);
    }
  }

  // 4. Merge candidate data into IssueItems + sort
  const items = rawItems.map(item => {
    const f   = item.fields;
    const cid = (f.Candidate || [])[0];
    const c   = cid ? (candidateMap[cid] || {}) : {};
    return {
      id:          item.id,
      section:     f.Section || '',
      slot:        f.Slot || 0,
      sectionOrder:f.SectionOrder || 99,
      lock:        f.Lock || false,
      title:       c['Event Title'] || f.Name || '(no title)',
      desc:        stripHtml(c.DescriptionRaw || ''),
      city:        c.City || 'Vaughan',
    };
  }).sort((a, b) =>
    a.sectionOrder !== b.sectionOrder ? a.sectionOrder - b.sectionOrder : a.slot - b.slot
  );

  const lockedCount = items.filter(i => i.lock).length;
  if (lockedCount) console.log(`🔒 ${lockedCount} locked item(s) — skipping blurb generation for those.`);
  const itemsToBlurb = items.filter(i => !i.lock);
  if (!itemsToBlurb.length) { console.log('All items locked. Nothing to generate.'); return; }

  // 5. Log event list
  console.log('\n📋 Events to blurb:\n');
  itemsToBlurb.forEach((e, i) => {
    const descStatus = e.desc ? `${e.desc.slice(0, 60)}…` : '⚠️  NO DESCRIPTION';
    console.log(`  ${i + 1}. [${e.section} / Slot ${e.slot}] ${e.title}`);
    console.log(`     ${descStatus}`);
  });

  // 6–7. Call the model once per event, then validate
  console.log(`\n🤖 Calling ${MODEL} once per event for ${itemsToBlurb.length} blurbs...\n`);
  const results = await blurbItems(itemsToBlurb, TARGET_DATE);

  // Warnings print here only; nothing reads them from Airtable since review moved to the console.
  const flaggedRows = results.filter(r => r.flags);
  if (flaggedRows.length) {
    console.log(`⚠️  ${flaggedRows.length} blurb(s) flagged — check before export:`);
    for (const r of flaggedRows) console.log(`   ${r.id}  ${r.displayTitle}  →  ${r.flags}`);
    console.log();
  }

  // 8. Write back
  if (DRY_RUN) {
    console.log('⏭️  Dry run — skipping Airtable writes.');
  } else {
    console.log(`📤 Writing ${results.length} blurbs to Airtable...`);

    for (const r of results) {
      await patchRecord('IssueItems', r.id, {
        DisplayTitle: r.displayTitle,
        Description:  r.description,
        CTA:          r.cta,
      });
    }

    console.log(`\n✅ Done.  Written: ${results.length}  |  Flagged: ${flaggedRows.length}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { buildPrompts, buildRequestBody, blurbItems };
