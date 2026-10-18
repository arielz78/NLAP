// Cloud fetch probe: does every R1 source still answer when the request comes from a datacenter IP?
//
// Repeats each source's first fetch the way the live R1 workflow makes it (same URL, method, body,
// headers; Node's https module, as n8n uses) and checks the body for real event content, not just a
// 200: a bot wall can answer 200 with a challenge page. Read-only: no Airtable, no writes. The two
// Airtable-backed inputs (Facebook intake, the upsert) are not probed; they are an API, not a scrape.
//
// Run on the laptop for the baseline, then on a GitHub runner (.github/workflows/cloud-fetch-probe.yml)
// and compare. Usage: node scripts/probeCloudFetch.js [--json out.json]
// Exit code is 0 unless the probe itself crashes; the table is the result.

const https = require('https');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BLOCK_RE = /cf-chl|just a moment\.\.\.|attention required|captcha|access denied|request blocked|incapsula|perimeterx/i;

// Same cipher list as live R1's `BiblioCommons RSS Fetch1` node.
const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA', 'ECDHE-RSA-AES256-SHA', 'AES128-GCM-SHA256', 'AES256-GCM-SHA384',
  'AES128-SHA', 'AES256-SHA',
].join(':');

function request(url, { method = 'GET', headers = {}, body, ciphers } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const opts = { method, headers: { 'User-Agent': UA, ...headers } };
    if (ciphers) { opts.ciphers = ciphers; opts.minVersion = 'TLSv1.2'; }
    if (body !== undefined) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, ms: Date.now() - t0 }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, body: '', headers: {}, ms: Date.now() - t0 }));
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const form = (o) => new URLSearchParams(o).toString();
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const count = (s, re) => (s.match(re) || []).length;
const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

// Each probe returns { status, bytes, ms, items, note }. `items` is the content check: >0 means real events.
const PROBES = {
  async Eventbrite() {
    const tok = await request('https://www.eventbrite.com/d/canada--york/events/', { headers: { Accept: 'text/html' } });
    const setCookie = tok.headers['set-cookie'] || [];
    const token = (setCookie.join(';').match(/csrftoken=([^;]+)/) || [])[1];
    if (!token) return { ...tok, items: 0, note: `token page HTTP ${tok.status}, no csrftoken` };
    const d = new Date();
    const ymd = (x) => x.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const body = JSON.stringify({
      event_search: { bbox: '-79.75,43.74,-79.15,44.00', date_range: { from: ymd(d), to: ymd(new Date(d.getTime() + 6 * 864e5)) },
        dates: 'current_future', dedup: false, page: 1, page_size: 50 },
      browse_surface: 'search',
    });
    const r = await request('https://www.eventbrite.com/api/v3/destination/search/', {
      method: 'POST', body,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token,
        Cookie: setCookie.map((c) => c.split(';')[0]).join('; '), Referer: 'https://www.eventbrite.com/d/canada--york/events/' },
    });
    const j = tryJson(r.body);
    return { ...r, items: j?.events?.results?.length || 0 };
  },
  async AllEvents() {
    const page = await request('https://allevents.in/vaughan-on/all', { headers: { Accept: 'text/html' } });
    const cst = (page.body.match(/window\.__cst\s*=\s*"([^"]+)"/) || [])[1];
    if (!cst) return { ...page, items: 0, note: `token page HTTP ${page.status}, no __cst` };
    const r = await request('https://allevents.in/api/events/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-State': cst },
      body: JSON.stringify({ city: 'vaughan', country: 'canada', page: 0, rows: 500, popular: true, venue: [], keywords: '', type: '', sdate: '', edate: '', ids: [] }),
    });
    const j = tryJson(r.body);
    const items = Array.isArray(j?.item) ? j.item.length : Array.isArray(j?.data) ? j.data.length : 0;
    return { ...r, items, note: j?.error ? `error: ${j.message}` : '' };
  },
  async McMichael() {
    const r = await request('https://mcmichael.com/wp-json/tribe/events/v1/events?page=1&per_page=50', {
      headers: { Accept: 'application/json, text/plain, */*', Referer: 'https://mcmichael.com/events/',
        'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'empty' },
    });
    return { ...r, items: tryJson(r.body)?.events?.length || 0 };
  },
  async 'TRCA RSS'() {
    const r = await request('https://calendar.trca.ca/?feed=event_feed&search_categories=trca');
    return { ...r, items: count(r.body, /<item[\s>]/g) };
  },
  async BiblioCommons() {
    const r = await request('https://markham.bibliocommons.com/events/rss/all', {
      ciphers: CHROME_CIPHERS,
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8', 'Accept-Language': 'en-CA,en;q=0.9' },
    });
    return { ...r, items: count(r.body, /<item[\s>]/g) };
  },
  async 'Visit Vaughan'() {
    const r = await request('https://visitvaughan.ca/wp-admin/admin-ajax.php', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ action: 'haven_calendar', search_date: firstOfMonth() }),
    });
    // R1's normalize reads results[date].list_items[].
    const res = tryJson(r.body)?.results || {};
    const items = Object.values(res).reduce((n, d) => n + ((d && d.list_items) || []).length, 0);
    return { ...r, items };
  },
  async Unionville() {
    const r = await request('https://unionville.ca/wp-admin/admin-ajax.php', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ action: 'load_upcoming_events' }),
    });
    return { ...r, items: r.status === 200 && r.body.length > 200 ? count(r.body, /<a\s[^>]*href=/gi) : 0, note: 'items = links in the returned HTML' };
  },
  async VPL() {
    const d = new Date();
    const r = await request(`https://www.vaughanpl.info/events_calendars/calendar/${d.getFullYear()}/${MONTHS[d.getMonth()]}`);
    return { ...r, items: count(r.body, /href="\/programs\/view\/\d+"/g), note: 'items = program links' };
  },
  async OnRichmondHill() {
    const r = await request('https://www.onrichmondhill.com/?q=events');
    return { ...r, items: count(r.body, /views-row/g), note: 'items = views-row blocks' };
  },
  async 'Richmond Hill (city)'() {
    const r = await request('https://calendar.richmondhill.ca/default/Rss');
    return { ...r, items: count(r.body, /<(entry|item)[\s>]/g) };
  },
  async "Pinot's Palette"() {
    const r = await request('https://www.pinotspalette.com/woodbridge');
    return { ...r, items: count(r.body, /\/woodbridge\/event\//g), note: 'items = event links' };
  },
  async 'Chef Upstairs'() {
    const r = await request('https://the-chef-upstairs.bookthatapp.com/availability/schedule.json?shop=the-chef-upstairs.myshopify.com&location=13173');
    const j = tryJson(r.body);
    const items = Array.isArray(j) ? j.length : Array.isArray(j?.events) ? j.events.length : (j ? Object.keys(j).length : 0);
    return { ...r, items };
  },
};

function verdict(r) {
  if (r.status === 0) return 'ERROR';
  if (BLOCK_RE.test(r.body.slice(0, 5000)) && !(r.items > 0)) return 'BLOCKED?';
  if (r.status !== 200) return 'FAIL';
  return r.items > 0 ? 'OK' : 'EMPTY';
}

async function main() {
  const out = [];
  for (const [name, fn] of Object.entries(PROBES)) {
    let r;
    try { r = await fn(); } catch (e) { r = { status: 0, error: e.message, body: '', ms: 0, items: 0 }; }
    const row = { source: name, verdict: verdict(r), status: r.status, items: r.items, bytes: r.body.length, ms: r.ms,
      note: [r.error, r.note].filter(Boolean).join('; ') };
    out.push(row);
    console.log(`${row.verdict.padEnd(9)} ${name.padEnd(22)} HTTP ${String(row.status).padEnd(4)} items ${String(row.items).padEnd(5)} ${String(row.bytes).padStart(8)} B ${String(row.ms).padStart(6)} ms  ${row.note}`);
  }
  const ok = out.filter((r) => r.verdict === 'OK').length;
  console.log(`\n${ok}/${out.length} sources returned events.`);

  const i = process.argv.indexOf('--json');
  if (i > 0 && process.argv[i + 1]) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = ['| Source | Verdict | HTTP | Items | Bytes | ms | Note |', '|---|---|---|---|---|---|---|',
      ...out.map((r) => `| ${r.source} | ${r.verdict} | ${r.status} | ${r.items} | ${r.bytes} | ${r.ms} | ${r.note} |`),
      '', `**${ok}/${out.length} sources returned events.**`].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
