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
if (!TARGET_DATE) { console.error('Usage: node generateBlurbs.js YYYY-MM-DD [--dry-run]'); process.exit(1); }
const MODEL               = 'gpt-5.4-nano';

if (!AIRTABLE_KEY) throw new Error('AIRTABLE_API_KEY missing from NLAP_Airtable.env');
if (!OPENAI_KEY)   throw new Error('OPENAI_API_KEY missing from NLAP_Airtable.env');
if (!BASE_ID)      throw new Error('AIRTABLE_BASE_ID missing from NLAP_Airtable.env');

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

// ── LLM call ──────────────────────────────────────────────────────────────────
async function callGPT(eventList, issueDate) {
  const systemPrompt = `You are a newsletter copywriter for the Vaughan Brief, a warm local events newsletter for the Greater Toronto Area. Audience: 75% women aged 35–60. Most popular section: For Families.

For each event provided, generate a blurb with THREE parts:
1. A creative display title of ~6 words in Title Case — NOT the original event name verbatim. Rephrase to be engaging and specific. You may use an em dash (–) to add urgency or context (e.g. "– Last Chance", "– Free Admission", "– Kids Welcome"). Include an appropriate emoji at the start. Example: "🍁 Canada's Largest Maple Syrup Festival – Last Chance" or "🧭 Family Mapping & Orienteering at Kortright"
2. A description of 10 words — aim for exactly 10, but 9 or 11 is acceptable
3. A unique 2–3 word CTA — every CTA across the entire list must be distinct

Style rules:
- Warm, community-focused, never salesy
- No hype, no superlatives, no filler
- Descriptions must be factual and event-specific — no generic copy
- CTAs vary meaningfully (not just synonyms): e.g. "Book Now", "Join the Fun", "Register Today", "Grab Tickets", "Plan Your Visit", "Come Along", "Reserve a Spot", "Learn More", "Sign Up Free", "Find Out More", "Attend Tonight", "Explore It"

Return ONLY valid JSON — no markdown, no preamble:
{
  "blurbs": [
    {
      "index": 1,
      "emoji": "🎭",
      "displayTitle": "Creative Six-Word Title for This Event",
      "description": "Exactly ten words that describe this specific event well",
      "cta": "Book Now"
    }
  ]
}`;

  const userPrompt = `Issue date: ${issueDate}\n\nGenerate blurbs for all ${eventList.length} events. Return JSON with a "blurbs" array.\n\n${eventList.map((e, i) =>
    `${i + 1}. TITLE: ${e.title}\n   DESC: ${e.desc.slice(0, 600)}\n   SECTION: ${e.section}\n   CITY: ${e.city}`
  ).join('\n\n')}`;

  const res = await timedFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_completion_tokens: 2500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    })
  }, 120000);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const raw  = data.choices[0].message.content;

  let parsed;
  try {
    const obj = JSON.parse(raw);
    // Accept {blurbs:[]} or top-level array
    parsed = Array.isArray(obj) ? obj : (obj.blurbs || Object.values(obj).find(Array.isArray) || []);
  } catch (e) {
    throw new Error(`GPT JSON parse failed: ${e.message}\nRaw:\n${raw}`);
  }

  return parsed;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
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

  // 6. Call LLM
  console.log(`\n🤖 Calling ${MODEL} for ${itemsToBlurb.length} blurbs...`);
  const blurbs = await callGPT(itemsToBlurb, TARGET_DATE);
  console.log(`   Received ${blurbs.length} blurbs\n`);

  // 7. Validate + build write payload
  const ctaSeen = new Set();
  const results = [];

  for (const blurb of blurbs) {
    const idx  = blurb.index - 1;
    const item = itemsToBlurb[idx];
    if (!item) {
      console.warn(`⚠️  No item for index ${blurb.index}`);
      continue;
    }

    const wc         = countWords(blurb.description);
    const wordOk     = wc >= 9 && wc <= 11;
    const ctaDupe    = ctaSeen.has((blurb.cta || '').toLowerCase());
    const ctaWords   = countWords(blurb.cta || '');
    const ctaOk      = !ctaDupe && ctaWords >= 2 && ctaWords <= 3;

    ctaSeen.add((blurb.cta || '').toLowerCase());

    const flags = [
      !wordOk  ? `WORD_COUNT:${wc}/10` : '',
      ctaDupe  ? 'CTA_DUPLICATE'       : '',
      !ctaOk && !ctaDupe ? `CTA_LENGTH:${ctaWords}` : ''
    ].filter(Boolean).join(' | ');

    const displayTitle = `${blurb.emoji} ${blurb.displayTitle}`;

    console.log(`[${item.section} | Slot ${item.slot}]  ${wordOk ? '✅' : '⚠️ '} ${wc}w  CTA: "${blurb.cta}" ${ctaOk ? '✅' : '⚠️ '}`);
    console.log(`  ${displayTitle}`);
    console.log(`  "${blurb.description}"`);
    console.log();

    results.push({ id: item.id, displayTitle, description: blurb.description, cta: blurb.cta, flags, valid: wordOk && ctaOk });
  }

  // 8. Write back
  if (DRY_RUN) {
    console.log('⏭️  Dry run — skipping Airtable writes.');
  } else {
    console.log(`📤 Writing ${results.length} blurbs to Airtable...`);
    let ok = 0, flagged = 0;

    for (const r of results) {
      const fields = {
        DisplayTitle: r.displayTitle,
        Description:  r.description,
        CTA:          r.cta,
      };
      if (r.flags) fields.Notes = `⚠️ ${r.flags}`;
      await patchRecord('IssueItems', r.id, fields);
      if (r.valid) ok++; else flagged++;
    }

    console.log(`\n✅ Done.  Written: ${ok}  |  Flagged: ${flagged}`);
    if (flagged) console.log('   Check IssueItems.Notes for flagged records.');
  }
}

main().catch(err => {
  console.error(`\n❌ Fatal: ${err.message}`);
  process.exit(1);
});
