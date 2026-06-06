const https = require('https');

function fetch(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d, loc: r.headers.location, ct: r.headers['content-type'] }));
    }).on('error', rej).on('timeout', () => rej(new Error('timeout: ' + url)));
  });
}

function countLD(body) {
  return (body.match(/application\/ld\+json/g) || []).length;
}

async function run() {
  // --- AllEvents ---
  console.log('=== ALLEVENTS.IN/VAUGHAN-ON ===');
  const ae = await fetch('https://allevents.in/vaughan-on');
  console.log('Status:', ae.status, ae.loc || '');
  console.log('Body length:', ae.body.length);
  console.log('SPA (Next.js)?', ae.body.includes('__NEXT_DATA__'));
  console.log('SPA (React)?', ae.body.includes('"react"') || ae.body.includes('_app') );
  console.log('JSON-LD blocks:', countLD(ae.body));
  const startDates = (ae.body.match(/"startDate":"[^"]+"/g) || []).slice(0, 3);
  console.log('startDate in source:', startDates);
  const feedLinks = (ae.body.match(/href="[^"]*(?:feed|rss|ical)[^"]*"/gi) || []).slice(0, 3);
  console.log('Feed links:', feedLinks);

  // AllEvents RSS attempt
  console.log('\n--- AllEvents /rss ---');
  const aerss = await fetch('https://allevents.in/vaughan-on/rss');
  console.log('Status:', aerss.status, aerss.loc || '');
  console.log('Has <item>:', aerss.body.includes('<item>'));

  // --- CityPlayhouse ---
  console.log('\n=== CITYPLAYHOUSE.CA ===');
  const cp = await fetch('https://cityplayhouse.ca/whats-on/');
  console.log('Status:', cp.status);
  console.log('JSON-LD blocks:', countLD(cp.body));

  // Try iCal
  const cpIcal = await fetch('https://cityplayhouse.ca/events/?ical=1');
  console.log('iCal ?ical=1 status:', cpIcal.status, '| CT:', cpIcal.ct);
  console.log('Is iCal?', cpIcal.body.includes('BEGIN:VCALENDAR'));

  // Try The Events Calendar plugin feed (common WP plugin)
  const cpFeed = await fetch('https://cityplayhouse.ca/?post_type=tribe_events&ical=1');
  console.log('Tribe iCal status:', cpFeed.status, '| CT:', cpFeed.ct);
  console.log('Is iCal?', cpFeed.body.includes('BEGIN:VCALENDAR'));
  if (cpFeed.body.includes('BEGIN:VEVENT')) {
    const count = (cpFeed.body.split('BEGIN:VEVENT').length - 1);
    console.log('Events in feed:', count);
    const s = cpFeed.body.match(/SUMMARY[^:]*:(.+)/);
    const d = cpFeed.body.match(/DTSTART[^:]*:(.+)/);
    const u = cpFeed.body.match(/URL[^:]*:(.+)/);
    console.log('Sample SUMMARY:', s && s[1].trim());
    console.log('Sample DTSTART:', d && d[1].trim());
    console.log('Sample URL:', u && u[1].trim());
  }

  // tickets subdomain RSS
  console.log('\n--- tickets.cityplayhouse.ca RSS ---');
  const tRss = await fetch('https://tickets.cityplayhouse.ca/feed/');
  console.log('Status:', tRss.status, '| CT:', tRss.ct);
  const tItems = (tRss.body.match(/<item>/g) || []).length;
  console.log('Items:', tItems);
  if (tItems > 0) {
    const titleMatch = tRss.body.match(/<title>([^<]+)<\/title>/);
    const dateMatch = tRss.body.match(/<pubDate>([^<]+)<\/pubDate>/);
    const contentMatch = tRss.body.match(/<description>[\s\S]{0,50}CDATA\[([^\]]{0,300})/);
    console.log('Sample title:', titleMatch && titleMatch[1]);
    console.log('Sample pubDate:', dateMatch && dateMatch[1]);
    console.log('Content snippet:', contentMatch && contentMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200));
  }
}

run().catch(console.error);
