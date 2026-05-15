/**
 * R4 — pushToBeehiiv.js
 * Fetches IssueItems for a target issue date, renders newsletter HTML content,
 * and writes a .html file the client pastes into Beehiiv's HTML blocks.
 *
 * Usage:
 *   node scripts/pushToBeehiiv.js YYYY-MM-DD [--dry-run]
 *
 * --dry-run: prints the HTML to console without writing the file.
 *
 * Env (NLAP_Airtable.env):
 *   AIRTABLE_API_KEY=...
 *
 * Output:
 *   output/{YYYY-MM-DD}_beehiiv.html  (5 sections, paste each into a Beehiiv HTML block)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../NLAP_Airtable.env') });
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const AIRTABLE_KEY        = process.env.AIRTABLE_API_KEY;
const BASE_ID             = process.env.AIRTABLE_BASE_ID;
const ISSUES_TABLE_ID     = 'tbl0NZBBOHiu4nb95';
const ISSUEITEMS_TABLE_ID = 'tblrz2fZYUhxpZph2';
const DRY_RUN             = process.argv.includes('--dry-run');
const TARGET_DATE         = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const OUTPUT_DIR          = path.join(__dirname, '../output');

if (!TARGET_DATE) {
  console.error('Usage: node scripts/pushToBeehiiv.js YYYY-MM-DD [--dry-run]');
  process.exit(1);
}
if (!AIRTABLE_KEY) throw new Error('AIRTABLE_API_KEY missing from NLAP_Airtable.env');
if (!BASE_ID)      throw new Error('AIRTABLE_BASE_ID missing from NLAP_Airtable.env');

const SECTION_ORDER = {
  'For Families':           1,
  'For Couples':            2,
  'For Golden Age Readers': 3,
  'Local Aroma':            4,
  'Trust Me Recipe':        5,
};

const C_TITLE = '#3a14f0'; // blue — event title links
const C_CTA   = '#e80c0c'; // red  — CTA links

// ── Fetch timeout ──────────────────────────────────────────────────────────────
function timedFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// ── Airtable helpers ──────────────────────────────────────────────────────────
async function atFetch(urlPath, opts = {}) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${urlPath}`;
  const res = await timedFetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${opts.method || 'GET'} /${urlPath} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function getAllRecords(tableId, params = {}) {
  const records = [];
  let offset;
  do {
    const query = new URLSearchParams({ pageSize: '100', ...params, ...(offset ? { offset } : {}) });
    const data  = await atFetch(`${tableId}?${query}`);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

// ── Fetch issue ID ────────────────────────────────────────────────────────────
async function fetchIssueId(date) {
  const formula = `IS_SAME({IssueDate}, "${date}", "day")`;
  const records = await getAllRecords(ISSUES_TABLE_ID, { filterByFormula: formula });
  if (!records.length) throw new Error(`No issue found for date: ${date}`);
  return records[0].id;
}

// ── Fetch IssueItems for an issue ─────────────────────────────────────────────
async function fetchIssueItems(issueId) {
  const all = await getAllRecords(ISSUEITEMS_TABLE_ID);
  return all
    .filter(r => (r.fields.Issue || []).includes(issueId))
    .map(r => ({
      id:           r.id,
      section:      r.fields.Section      || '',
      slot:         r.fields.Slot         || 0,
      sectionOrder: SECTION_ORDER[r.fields.Section] || 99,
      displayTitle: r.fields.DisplayTitle || '',
      description:  r.fields.Description || '',
      cta:          r.fields.CTA          || '',
      candidateUrl: r.fields.CandidateURL || '#',
    }))
    .sort((a, b) =>
      a.sectionOrder !== b.sectionOrder
        ? a.sectionOrder - b.sectionOrder
        : a.slot - b.slot
    );
}

// ── HTML helpers ──────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSlot(item) {
  const url = esc(item.candidateUrl);
  return [
    `  <li style="margin-bottom:16px;">`,
    `    <strong><em><u><a href="${url}" target="_blank" style="color:${C_TITLE};text-decoration:underline;">${esc(item.displayTitle)}</a></u></em></strong><br/>`,
    `    ${esc(item.description)}<br/>`,
    `    <strong><em><u><a href="${url}" target="_blank" style="color:${C_CTA};text-decoration:underline;">${esc(item.cta)}</a></u></em></strong>`,
    `  </li>`,
  ].join('\n');
}

function renderSection(sectionName, items) {
  const lines = [`<ol>`];
  if (items.length) {
    lines.push(items.map(item => renderSlot(item)).join('\n'));
  } else {
    lines.push(`  <!-- No items allocated for this section -->`);
  }
  lines.push(`</ol>`);
  return lines.join('\n');
}

function renderHTML(sections) {
  const sectionNames = [
    'For Families',
    'For Couples',
    'For Golden Age Readers',
    'Local Aroma',
    'Trust Me Recipe',
  ];

  const divider = (name) => [
    `<!-- ${'='.repeat(60)} -->`,
    `<!-- SECTION: ${name.toUpperCase()} -->`,
    `<!-- Copy the <ol> below and paste into its own Beehiiv HTML block. -->`,
    `<!-- ${'='.repeat(60)} -->`,
  ].join('\n');

  const header = [
    `<!-- Vaughan Brief — ${TARGET_DATE} -->`,
    `<!-- Generated by pushToBeehiiv.js -->`,
    `<!-- 5 sections below — paste each <ol> into a separate Beehiiv HTML block. -->`,
    '',
  ].join('\n');

  const parts = [header];
  for (const name of sectionNames) {
    parts.push(divider(name));
    parts.push('');
    parts.push(renderSection(name, sections[name] || []));
    parts.push('');
    parts.push('');
  }

  return parts.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📰 Vaughan Brief — Beehiiv HTML Export`);
  console.log(`   Issue: ${TARGET_DATE}${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

  // 1. Fetch issue ID
  console.log(`🔍 Fetching issue for ${TARGET_DATE}...`);
  const issueId = await fetchIssueId(TARGET_DATE);
  console.log(`   ✅ Issue: ${issueId}`);

  // 2. Fetch IssueItems
  console.log(`📋 Fetching IssueItems...`);
  const items = await fetchIssueItems(issueId);
  console.log(`   ${items.length} items found`);
  if (!items.length) throw new Error('No IssueItems found for this issue. Run R3 first.');

  // 3. Check for missing blurbs
  const missing = items.filter(i => !i.displayTitle || !i.description || !i.cta);
  if (missing.length) {
    console.warn(`\n⚠️  ${missing.length} item(s) missing blurbs — run generateBlurbs.js first:`);
    missing.forEach(i => console.warn(`   [${i.section} / Slot ${i.slot}] ${i.displayTitle || '(no title)'}`));
    console.warn('');
  }

  // 4. Group by section and log
  const sections = {};
  for (const item of items) {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
    console.log(`  [${item.section} / Slot ${item.slot}] ${item.displayTitle || '⚠️ no title'}`);
  }

  // 5. Render HTML
  console.log('\n🖊️  Rendering HTML...');
  const html = renderHTML(sections);

  // 6. Output
  if (DRY_RUN) {
    console.log('\n── DRY RUN OUTPUT ──────────────────────────────────────────\n');
    console.log(html);
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('⏭️  Dry run — file not written.');
  } else {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outFile = path.join(OUTPUT_DIR, `${TARGET_DATE}_beehiiv.html`);
    fs.writeFileSync(outFile, html, 'utf8');
    console.log(`\n✅ Done. File written to:\n   ${outFile}`);
    console.log('\nNext steps:');
    console.log('  1. Open the file — it has 5 sections, one per Beehiiv HTML block');
    console.log('  2. Paste each <ol> into its own Beehiiv HTML block');
    console.log('  3. Add a native image widget above each HTML block');
    console.log('  4. Add polls and spotlight/ad blocks manually in Beehiiv');
  }
}

main().catch(err => {
  console.error(`\n❌ Fatal: ${err.message}`);
  process.exit(1);
});
