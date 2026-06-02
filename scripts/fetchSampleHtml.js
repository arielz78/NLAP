// One-off script: fetch HTML for 6 sampled past issues and save locally.
// Purpose: Issue #54 stratified parser correctness audit (2026-06-02).
// Fetches specific issue dates from Beehiiv API and saves raw HTML to
// data/beehiiv/past_issues/ for manual parser verification.
// Not part of the weekly pipeline — reuse if a future audit needs more samples.
// Run: node scripts/fetchSampleHtml.js

require('dotenv').config({ path: require('path').join(__dirname, '../NLAP_Airtable.env') });
const fs = require('fs');
const path = require('path');

const KEY = process.env.BEEHIIV_API_KEY;
const PUB_ID = 'pub_ff7a12c2-7452-46da-9792-771ec6ece149';

if (!KEY) throw new Error('BEEHIIV_API_KEY not set in NLAP_Airtable.env');

const TARGET_DATES = new Set([
  '2025-01-16',
  '2025-03-20',
  '2025-05-22',
  '2025-07-17',
  '2025-10-02',
  '2025-12-11',
]);

async function fetchPage(page) {
  const res = await fetch(
    `https://api.beehiiv.com/v2/publications/${PUB_ID}/posts` +
    `?limit=10&page=${page}&status=confirmed&expand[]=free_email_content`,
    { headers: { Authorization: `Bearer ${KEY}` } }
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const outDir = path.join(__dirname, '../data/beehiiv/past_issues');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching posts to find target dates...');
  const first = await fetchPage(1);
  const totalPages = first.total_pages;
  let posts = first.data;

  for (let page = 2; page <= totalPages; page++) {
    await new Promise(r => setTimeout(r, 300));
    const data = await fetchPage(page);
    posts = posts.concat(data.data);
    console.log(`  Page ${page}/${totalPages}`);
  }

  console.log(`\nTotal posts fetched: ${posts.length}`);

  const remaining = new Set(TARGET_DATES);

  for (const post of posts) {
    const date = post.publish_date
      ? new Date(post.publish_date * 1000).toISOString().slice(0, 10)
      : null;
    if (!date || !remaining.has(date)) continue;

    const html = post.content?.free?.email;
    if (!html) {
      console.warn(`  WARNING: ${date} — no HTML content available`);
      remaining.delete(date);
      continue;
    }

    const outPath = path.join(outDir, `issue_${date}.html`);
    fs.writeFileSync(outPath, html);
    console.log(`  Saved: issue_${date}.html (${(html.length / 1024).toFixed(0)} KB)`);
    remaining.delete(date);
  }

  if (remaining.size > 0) {
    console.warn(`\nWARNING: ${remaining.size} target date(s) not found in API response:`);
    remaining.forEach(d => console.warn(`  - ${d}`));
  } else {
    console.log('\nAll 6 target dates saved successfully.');
  }
}

main().catch(console.error);
