// Fetches all published Vaughan Brief issues via Beehiiv API.
// Extracts (date, section, slot, url, emoji, displayTitle, description, cta) per event.
// Output: data/beehiiv/issue_history.json
// Incremental: fetches the newest posts and merges them into the stored file, which never shrinks.
// --full refetches every post (re-parses old issues after a parser change), still merged.
//
// Run: node scripts/fetchBeehiivHistory.js [--full]
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

// One page of posts, newest first. A page that is not a list of posts is retried, then the run
// stops: a bad page once wrote a 9-issue history over a 93-issue one, silently (2026-10-22).
async function fetchPage(page, fetchImpl = fetch, tries = 3, waitMs = 1000) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetchImpl(
        `https://api.beehiiv.com/v2/publications/${PUB_ID}/posts` +
        `?limit=10&page=${page}&status=confirmed&expand[]=free_email_content&order_by=publish_date&direction=desc`,
        { headers: { Authorization: `Bearer ${KEY}` } }
      );
      if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = await res.json();
      if (!Array.isArray(body.data) || !Number.isInteger(body.total_pages)) {
        throw new Error(`page ${page} is not a list of posts (keys: ${Object.keys(body || {}).join(', ')})`);
      }
      return body;
    } catch (err) {
      last = err;
      if (attempt < tries) await new Promise(r => setTimeout(r, waitMs * attempt));
    }
  }
  throw new Error(`Beehiiv page ${page} failed ${tries} times; nothing written. Last error: ${last.message}`);
}

function toIssue(post) {
  const html = post.content?.free?.email;
  const events = html ? parseIssue(html) : [];
  if (events.length === 0) return null;
  return {
    date: post.publish_date ? new Date(post.publish_date * 1000).toISOString().slice(0, 10) : null,
    subject: post.subject_line,
    slug: post.slug,
    events,
  };
}

// Fresh issues replace stored ones with the same slug; stored issues are never dropped, so the
// result can only grow. A post that parsed to nothing never replaces a stored issue.
function mergeHistory(stored, fresh) {
  const bySlug = new Map(stored.map(i => [i.slug, i]));
  for (const issue of fresh) bySlug.set(issue.slug, issue);
  const merged = [...bySlug.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (merged.length < stored.length) throw new Error(`merged history has ${merged.length} issues, fewer than the ${stored.length} stored; nothing written`);
  return merged;
}

async function main(argv = process.argv.slice(2)) {
  require('dotenv').config({ path: path.join(__dirname, '../NLAP_Airtable.env') });
  KEY = process.env.BEEHIIV_API_KEY;
  if (!KEY) throw new Error('BEEHIIV_API_KEY not set in NLAP_Airtable.env');
  const full = argv.includes('--full');

  const outDir = path.join(__dirname, '../data/beehiiv');
  const outPath = path.join(outDir, 'issue_history.json');
  const stored = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : [];
  const known = new Set(stored.map(i => i.slug));

  // Newest first. Page 1 is always refetched, so a late edit in Beehiiv to a recent issue is picked
  // up; later pages only while every post on the page before was new to the stored history.
  console.log(full || stored.length === 0 ? 'Fetching all published posts...' : `Fetching posts newer than the ${stored.length} stored issues...`);
  const posts = [];
  for (let page = 1; ; page++) {
    if (page > 1) await new Promise(r => setTimeout(r, 300));
    const body = await fetchPage(page);
    posts.push(...body.data);
    console.log(`  Page ${page}/${body.total_pages} — ${posts.length} posts so far`);
    const reachedStored = body.data.some(p => known.has(p.slug));
    if (page >= body.total_pages || (!full && stored.length > 0 && reachedStored)) break;
  }

  const fresh = posts.map(toIssue).filter(Boolean);
  const skipped = posts.length - fresh.length;
  const history = mergeHistory(stored, fresh);
  console.log(`\nPosts fetched: ${posts.length} · new issues: ${history.length - stored.length}`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(history, null, 2));

  const totalEvents = history.reduce((sum, i) => sum + i.events.length, 0);
  const sectionCounts = {};
  history.forEach(issue =>
    issue.events.forEach(e => {
      sectionCounts[e.section] = (sectionCounts[e.section] || 0) + 1;
    })
  );

  console.log(`\nIssues stored: ${history.length} (${skipped} fetched posts skipped — no content or no sections)`);
  console.log(`Total (section, url) pairs: ${totalEvents}`);
  console.log('\nBy section:');
  Object.entries(sectionCounts).forEach(([s, c]) => console.log(`  ${s}: ${c}`));
  console.log(`\nSaved to ${outPath}`);
}

module.exports = { parseIssue, stripUtm, isEventUrl, fetchPage, mergeHistory };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
