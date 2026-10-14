// Fetches all published Vaughan Brief issues via Beehiiv API.
// Extracts (date, section, slot, url, emoji, displayTitle, description, cta) per event.
// Output: data/beehiiv/issue_history.json
//
// Run: node scripts/fetchBeehiivHistory.js
// Test (offline, parser only): node --test scripts/fetchBeehiivHistory.test.js

const fs = require('fs');
const path = require('path');

let KEY;
const PUB_ID = 'pub_ff7a12c2-7452-46da-9792-771ec6ece149';

const SECTIONS = [
  'For Families',
  'For Couples',
  'For Golden Age Readers',
  'Local Aroma',
  'Trust Me Recipe',
];

const SKIP_PATTERNS = [
  'beehiiv.com',
  'vaughanbrief.com',
  'facebook.com/sharer',
  'twitter.com/intent',
  'threads.net/intent',
  'linkedin.com/sharing',
  'refind.com',
  '_bhiiv=opp_',
];

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripUtm(url) {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', '_bhlid', 'fbclid', 'acontext'].forEach(p =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return url;
  }
}

function isEventUrl(url) {
  return !SKIP_PATTERNS.some(p => url.includes(p));
}

function parseIssue(html) {
  // Find position of each section header in the HTML
  const positions = [];
  for (const label of SECTIONS) {
    for (const variant of [label, label + ' ']) {
      const idx = html.indexOf('<b>' + variant + '</b>');
      if (idx !== -1) { positions.push({ section: label, pos: idx }); break; }
      const idx2 = html.indexOf('<strong>' + variant + '</strong>');
      if (idx2 !== -1) { positions.push({ section: label, pos: idx2 }); break; }
    }
  }
  positions.sort((a, b) => a.pos - b.pos);

  const events = [];
  for (let i = 0; i < positions.length; i++) {
    const sectionStart = positions[i].pos;
    const sectionEnd = i + 1 < positions.length ? positions[i + 1].pos : html.length;
    const chunk = html.slice(sectionStart, sectionEnd);

    const olRegex = /<ol[^>]+start="(\d+)"[^>]*>([\s\S]*?)<\/ol>/g;
    let olMatch;
    while ((olMatch = olRegex.exec(chunk)) !== null) {
      const slot = parseInt(olMatch[1]);
      const liContent = olMatch[2];

      const urlMatches = [...liContent.matchAll(/href="(https?:\/\/[^"]+)"/g)];
      if (urlMatches.length === 0) continue;

      const url = stripUtm(urlMatches[0][1]);
      if (!isEventUrl(url)) continue;

      // A line ends at <br> or at a closing </p>: newer issues put title, description and CTA in
      // separate paragraphs (#156).
      const lines = liContent.split(/<br\s*\/?>|<\/p>/i)
        .map(l => stripTags(l).trim())
        .filter(l => l.length > 0);

      // The leading emoji goes in its own field. ZWJ, variation selectors, skin tones and keycaps
      // are part of the emoji, so none of them is left on the title.
      const emojiMatch = (lines[0] || '').match(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\u20e3\s]+/u);
      const emoji = emojiMatch ? emojiMatch[0].replace(/\s+/g, '') : '';
      const displayTitle = (lines[0] || '').slice(emojiMatch ? emojiMatch[0].length : 0).trim();
      // More than three lines: the last is the CTA and the middle ones are the description.
      const description = lines.length > 3 ? lines.slice(1, -1).join(' ') : lines[1] || '';
      const cta = lines.length > 3 ? lines[lines.length - 1] : lines[2] || '';

      events.push({ section: positions[i].section, slot, url, emoji, displayTitle, description, cta });
    }
  }

  return events;
}

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
  require('dotenv').config({ path: path.join(__dirname, '../NLAP_Airtable.env') });
  KEY = process.env.BEEHIIV_API_KEY;
  if (!KEY) throw new Error('BEEHIIV_API_KEY not set in NLAP_Airtable.env');
  console.log('Fetching all published posts...');
  const first = await fetchPage(1);
  const totalPages = first.total_pages;
  let posts = first.data;

  for (let page = 2; page <= totalPages; page++) {
    await new Promise(r => setTimeout(r, 300));
    const data = await fetchPage(page);
    posts = posts.concat(data.data);
    console.log(`  Page ${page}/${totalPages} — ${posts.length} posts so far`);
  }

  console.log(`\nTotal posts fetched: ${posts.length}`);

  const history = [];
  let skipped = 0;

  for (const post of posts) {
    const html = post.content?.free?.email;
    if (!html) { skipped++; continue; }

    const events = parseIssue(html);
    if (events.length === 0) { skipped++; continue; }

    history.push({
      date: post.publish_date ? new Date(post.publish_date * 1000).toISOString().slice(0, 10) : null,
      subject: post.subject_line,
      slug: post.slug,
      events,
    });
  }

  history.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const outDir = path.join(__dirname, '../data/beehiiv');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'issue_history.json');
  fs.writeFileSync(outPath, JSON.stringify(history, null, 2));

  const totalEvents = history.reduce((sum, i) => sum + i.events.length, 0);
  const sectionCounts = {};
  history.forEach(issue =>
    issue.events.forEach(e => {
      sectionCounts[e.section] = (sectionCounts[e.section] || 0) + 1;
    })
  );

  console.log(`\nIssues parsed: ${history.length} (${skipped} skipped — no content or no sections)`);
  console.log(`Total (section, url) pairs: ${totalEvents}`);
  console.log('\nBy section:');
  Object.entries(sectionCounts).forEach(([s, c]) => console.log(`  ${s}: ${c}`));
  console.log(`\nSaved to ${outPath}`);
}

module.exports = { parseIssue, stripUtm, isEventUrl };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
