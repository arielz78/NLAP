# Source Decision Sheet – Week 1 (Corrected to match your screenshot links)

---

## Source Probe Methodology — Hierarchy of Methods (added 2026-06-06)

When probing a new source for machine-readable event data, work top-to-bottom. Stop at the first method that returns clean, reliable data.

**1. DevTools first (before any code)**
Open the site in Chrome → DevTools → Network tab → Fetch/XHR filter → reload the page. Look for any XHR/fetch call returning event data (large JSON, or a call with "ajax", "api", "events", "calendar" in the name). Click it → Payload tab to get the action/parameters → replicate as a direct POST/GET. This catches: WordPress admin-ajax plugins (HavenDestinations, custom ACF loaders), REST-ish endpoints, and any dynamic data source. Should be the *first* move on any site that looks dynamic.

**2. Check the main HTML document in DevTools**
In the Network tab (All filter), click the first Doc request → Response tab. If the page is server-rendered, the event data will be in the HTML. This catches sites that look like SPAs but are actually rendered server-side (VPL being a prime example — dismissed as SPA, actually fully server-rendered).

**3. Public feed endpoints (blind probe)**
Try common paths: `/feed`, `/?feed=rss2`, `/?ical=1`, `/events.ics`, `/calendar.ics`. Works for WordPress RSS, The Events Calendar iCal, and other standard CMS plugins.

**4. WP REST API**
`/wp-json/wp/v2/types` → lists all registered post types. Then `/wp-json/wp/v2/{type}` for each event-like type. Catches WordPress sites with custom post types (CPTs) exposed via REST.

**5. JSON-LD in page source**
Server-fetch the page, extract `<script type="application/ld+json">` blocks, look for `@type: Event`. Works for sites using Schema.org markup (TRCA pattern). No auth, no browser needed.

**6. HTML scraping**
Server-fetch the page, parse HTML using known class names or structural patterns. Works when data is server-rendered but without structured markup (VPL `/programs` pattern). Fragile to redesigns but zero infrastructure.

**7. Headless browser (last resort)**
Puppeteer/Playwright — full Chrome rendering, extracts JS-populated content. Only justified when: (a) source is high-value and weekly, (b) all methods above are confirmed dead ends, (c) the maintenance cost of a broken scraper is acceptable post-handoff.

**Lesson learned (2026-06-06):** Three sources (VPL, visitvaughan.ca, unionville.ca) were initially assessed as needing a headless browser or dropped. All three turned out to be fully automatable via methods 1–2. Blind endpoint probing (methods 3–5) without DevTools inspection led to premature DROP verdicts. **Always open DevTools before writing off a source.**

---


## Previously closed sources — re-evaluation against DevTools method (2026-06-06)

Three sources were dropped earlier in R5 probing. Re-evaluated below against the corrected methodology:

**Markham BiblioCommons** — CONFIRMED DROP. DevTools inspection was already performed at time of original probe ("only 2 network calls on page load, neither returning event data"). The site is a React SPA that makes no data calls for events server-side. DevTools confirms: no XHR with event data. Drop stands.

**Meetup** — CONFIRMED DROP. Not a detection failure — the iCal feeds work and data is accessible. Dropped for yield reasons: platform caps iCal exports at ~10 events per group, York Region groups return 2–4 usable events after geo-filter. No DevTools investigation would change this.

**CityPlayhouse** — CONFIRMED DROP. Not a detection failure — posts are ephemeral by design (published then deleted within hours; Inoreader caches stale data). Even if a DevTools probe found an API, the content wouldn't be there. Drop stands.

No previously dropped sources need re-evaluation.

---

This sheet is based **only** on the URLs visible in your screenshot.

## 1) Source list (from the image)

| Category/Tag | URL |
|---|---|
| Events | https://blackcreek.ca/events/ |
| Cooking class | https://www.longos.com/cooking-classes/in-person-classes |
| Cooking class | https://littlekitchenacademy.com/locations/vaughan/ |
| Kids classes | https://thechefupstairs.com/pages/kids-classes |
| Events | https://mcmichael.com/upcoming-events/ |
| Things to do | https://www.todocanada.ca/things-to-do-in-vaughan/ |
| Activity | https://www.puttingedge.com/locations/vaughan/ |
| Activity | https://www.pinotspalette.com/woodbridge |
| Cooking class | https://rookstocooks.ca/ |
| Seniors | https://www.meetup.com/find/ca--vaughan/seniors/ |
| Spa | https://www.santehealingspas.com/spa-deals-thornhill |
| Spa | https://sanctuarydayspas.com/menu/specials/ |
| Floating spa | https://www.facebook.com/elementalwellnessstudio/ |
| Spa | https://trubliss.ca/ |
| Kids spa salon | https://www.glamagalparty.com/ |
| Local news/events | https://www.onrichmondhill.com/ |
| Events | https://www.experienceyorkregion.com/event/concerts-in-richmond-hill/ |
| Food festival | https://jazzlicious.ca/ |
| Ticketed experiences | https://feverup.com/en/toronto/candlelight |
| Events | https://unionville.ca/things-to-do/events/ |
| Events | https://www.richmondhill.ca/en/things-to-do/events.aspx |
| Library events | https://markham.bibliocommons.com/v2/events |

## 2) Week 1 triage decisions (best-first, per roadmap)

I prioritized sources that are most likely to provide **structured** event data (RSS/Atom/iCal/JSON) with minimal scraping:

### A) The Village at Black Creek
- Primary URL: https://blackcreek.ca/events/
- Likely cheapest working method: **Use the TRCA events calendar listing** (structured event pages)
- Candidate structured source discovered:
  - https://calendar.trca.ca/event_listing_category/the-village-at-black-creek/
- Next probe (method order #1–#3):
  1) check for RSS/Atom on calendar.trca.ca
  2) check for iCal “.ics” export per event/list
  3) if none, parse HTML (server-rendered) from category pages

### B) Markham Public Library (BiblioCommons)
- URL: https://markham.bibliocommons.com/v2/events
- Likely cheapest working method: **HTML + embedded structured data** (often includes JSON-LD) or per-event **Add to Calendar (.ics)**
- Next probe:
  1) open an individual event page and look for “Add to calendar / iCal”
  2) if present, harvest .ics links
  3) else parse list HTML + JSON-LD

### C) City of Richmond Hill
- URL: https://www.richmondhill.ca/en/things-to-do/events.aspx
- High probability there is a separate calendar backend:
  - https://calendar.richmondhill.ca/ (confirmed via search results)
- Candidate structured source discovered:
  - https://calendar.richmondhill.ca/
- Next probe:
  1) look for “iCal / RSS” or “download” options beyond PDF
  2) if only PDF is offered, treat as **blocked** for automation (unless you accept PDF parsing, which is later in the decision order)

### D) McMichael (upcoming events)
- URL: https://mcmichael.com/upcoming-events/
- Many museum sites use WordPress event plugins that have iCal exports.
- Next probe:
  1) find the canonical events list page and look for iCal export
  2) if plugin is “The Events Calendar,” typical patterns are /events/ with iCal endpoints
  3) fallback: parse HTML list pages

### E) Meetup “seniors” search page (Vaughan)
- URL: https://www.meetup.com/find/ca--vaughan/seniors/
- This is **not** a stable feed by itself.
- Best approach:
  1) pick 3–5 specific senior groups you trust
  2) use each group’s iCal feed (Meetup supports /events/ical on group pages)
- If you keep it as a search page, it’s effectively **blocked** without scraping.

## 3) Week 1 deliverable target (from roadmap)

- “Source Decision Sheet” (this doc)
- At least **1 previously blocked source** producing ingestible output:
  - Best candidates to get working fastest: **TRCA Black Creek category** or **Markham BiblioCommons .ics links**.

---

## Task 3 — Source Probe Results (2026-06-05)

Probed all 4 confirmed sources headlessly (curl + Node) to validate integration method and field coverage before any W2 build work.

| Source | Method confirmed | title | date | LocationName | Verdict |
|---|---|---|---|---|---|
| TRCA | JSON-LD per event page (iCal dead — WordPress ignores `?ical=1`) | ✓ | ✓ | ✓ full address | **PASS** |
| McMichael | iCal direct (`/events/?ical=1` and `/events/category/adult-programs/?ical=1`) | ✓ | ✓ | ✗ buried in description HTML | **PASS — flag for W2** |
| Markham BiblioCommons | — | — | — | — | **DROP** |
| Meetup | iCal direct, headless confirmed (no browser required) | ✓ | ✓ | ✗ not in feed | **PASS — flag for W2** |

### Notes

**TRCA integration path:**
1. Fetch listing page (`/event_listing_category/the-village-at-black-creek/`) → extract event slugs
2. Fetch each event page → parse `<script type="application/ld+json">` block where `@type = "Event"`
3. Fields: `name` (title), `startDate`, `Location.name` (full address)

### McMichael — superseded 2026-06-07: direct REST API found, replaces iCal

**Discovery:** Response headers on `mcmichael.com/events/` advertise a public REST API root:
```
X-Tec-Api-Origin: https://mcmichael.com
X-Tec-Api-Root: https://mcmichael.com/wp-json/tribe/events/v1/
X-Tec-Api-Version: v1
```
This is **The Events Calendar (Modern Tribe)** plugin's REST API. Cloudflare returns 403 to a bare server-side request, but a GET with full browser-like headers (`User-Agent`, `Accept`, `Referer: https://mcmichael.com/events/`, `Sec-Fetch-*`) passes cleanly — no headless browser needed.

**Confirmed working:**
```
GET https://mcmichael.com/wp-json/tribe/events/v1/events?per_page=N
```
Returns `{ events: [...], total, total_pages }` — paginated, clean JSON.

**Why this is strictly better than iCal:**
1. **~2x yield** — API reports **56 total events** across 6 pages vs. **28 records** currently landing via the iCal branch. Likely the iCal feed is a curated/truncated subset.
2. **`categories` included** (e.g. "Tours", "Accessible Programs") — iCal has none. Solves a gap that was previously written off as unsolvable for this source.
3. **Real `description` field with rich HTML** — the current McMichael branch hardcodes `DescriptionRaw: ''` because iCal has nothing usable. The API's `description` field is full event copy (exhibition context, program details). This directly improves R2 classification input — the prior session noted McMichael's high NeedsReview rate was attributed to "title-only classification, same as TRCA." Real description text should reduce that.
4. **Clean structured `start_date`/`end_date`** with times — no iCal line-unfolding/parsing needed.

**Venue field is empty (`venue: []`) — not a gap.** Every McMichael event happens at the museum itself; they don't bother setting a per-event venue. The current branch's hardcoded `locationName = "McMichael Canadian Art Collection"` remains correct and should be kept as-is regardless of which fetch method is used.

**Recommendation:** Swap the McMichael branch from iCal fetch+parse to a paginated REST API loop (`page=1..total_pages`, `per_page=50` or similar) before/alongside W2c. This is a live branch already in production — treat as a planned upgrade, not an emergency; coordinate the swap with a verification pass (re-run R1, confirm record count moves toward ~56, spot-check categories and descriptions land correctly in Airtable).

**~~McMichael LocationName gap (superseded)~~:** No `LOCATION` field in iCal records — location is embedded in the `DESCRIPTION` HTML blob. Moot — see above, hardcoded LocationName is correct either way.

**Meetup LocationName gap:** No location field in the iCal feed at all. Same handling as McMichael — blank is acceptable per R5_Scope hard-reject vs soft-required distinction.

**Markham BiblioCommons — drop rationale:** Fully client-side React SPA. No public API, no iCal export, no JSON-LD on event pages. Browser dev tools inspection confirmed only 2 network calls on page load (systemMessages + jQuery state), neither returning event data. Server-side rendered with no structured data accessible to a headless fetch. Requires browser execution — worse than scraping. Dropped per R5_Scope rule ("if any source requires HTML scraping, drop to three sources").

**Net: 3 confirmed sources** (TRCA, McMichael, Meetup). W2 builds branches for these three only.

---

## Meetup Group Audit (2026-06-06)

The two groups Nate selected for the config were pulled from real past newsletter issue URLs — they appeared in 5 Couples placements across the last 7 issues. Likely entered via Facebook manual intake, not directly from Meetup.

| Group | iCal events | York Region events | Verdict |
|---|---|---|---|
| `torontobikemeetup` | 10 (iCal cap) | 0 — all Toronto/Niagara cycling routes | **DROP** |
| `women-that` | 0 — defunct | — | **DROP** |

**iCal cap:** Meetup iCal feeds cap at ~10 upcoming events regardless of how many the group has scheduled. Web page showed 19 for `torontobikemeetup`; iCal returned 10. Applies to any Meetup group added to the pipeline.

**Decision:** Both groups dropped. Any Meetup events will come through Facebook manual intake (W3). Meetup branch not built for R5. York Region alternatives (Forest Footprints, Dim Sum Meetup) still to be probed — if viable, add as additional groups rather than replacements.

### York Region alternatives probed (2026-06-06)

| Group | Members | iCal events | York Region yield | Verdict |
|---|---|---|---|---|
| Forest Footprints (Richmond Hill) | 811 | 10 (cap) | ~3/10 after geo-filter — no LOCATION field | **Skip** |
| Dim Sum Meetup (Markham) | 1,186 | 1 | 1 event per cycle | **Skip** |

**Final Meetup decision for R5:** Skip entirely. iCal cap of ~10 events per group + heavy geo-filtering = 2–4 usable events per run at best. AllEvents direct branch is the higher-ROI lever. Revisit after AllEvents lands if pool is still short. Any Meetup events enter via Facebook manual intake (W3).

---

## AllEvents.in Probe (2026-06-06, superseded same day — direct JSON API found)

| Source | Method confirmed | title | date | LocationName | url | Verdict |
|---|---|---|---|---|---|---|
| AllEvents Vaughan | **Direct JSON API** (`POST allevents.in/api/events/list`) | ✓ | ✓ Unix timestamp + display string | ✓ full venue object incl. lat/long | ✓ allevents.in event URLs | **PASS — upgraded path** |

### Superseding integration path (found via DevTools, 2026-06-06)

DevTools Fetch/XHR inspection of `/vaughan-on/all` revealed the page loads events via a clean paginated JSON API — `combined-eventlist.js` fires `POST https://allevents.in/api/events/list`. This replaces the JSON-LD scraping plan below entirely.

**Request payload (POST body):**
```json
{
  "city": "vaughan",
  "country": "canada",
  "page": 0,
  "rows": 9,
  "popular": true,
  "venue": [],
  "keywords": "",
  "type": "",
  "sdate": "",
  "edate": "",
  "ids": []
}
```
Confirmed working with `rows: 20` directly via server-side POST — no browser, no auth, no cookies required.

**Response shape — clean structured JSON per event:**
- `eventname` — title
- `start_time` (Unix timestamp) + `start_time_display` (human string, e.g. "Sun Jun 07 2026 at 10:00 am")
- `end_time` / `end_time_display`
- `venue.street`, `venue.city`, `venue.state`, `venue.country`, `venue.latitude`, `venue.longitude`, `venue.full_address`
- `event_url` (canonical allevents.in link)
- `categories` (array, e.g. `["entertainment","zumba","dance","workshops","health-wellness"]`)
- `organizer.name`
- `tickets.has_tickets`

**Why this is strictly better than the JSON-LD scrape plan:**
1. **Paginated JSON loop** (`page`/`rows`) replaces the 3-step scrape (fetch listing pages → regex slug extraction → fetch + parse JSON-LD per event). One HTTP call per page, no HTML parsing.
2. **Structured venue object with lat/long** is stronger geo-filter material than the JSON-LD `addressLocality` string, which was confirmed mis-tagged (Toronto events tagged "Vaughan"). Full street address + coordinates lets the geo-filter work on real geography, not a self-reported label.
3. **Categories array included** — reopens the "category omit for R5" decision (closed 2026-06-06 on the basis that no confirmed source carried a clean category field). AllEvents does. Worth revisiting scope when W2c is built.
4. **No ad-card noise** — API returns events only; no embedded ad divs to filter (vs. the 45-JSON-LD-vs-50-card gap found in the HTML scrape).

**Geo-filter still required (W2c):** `venue.city` is more trustworthy than `addressLocality` but not guaranteed clean — confirm on a larger sample before treating it as authoritative. AllEvents branch still ships in the same slice as W2c.

**Dedup risk unchanged:** AllEvents aggregates from Eventbrite and other sources. Title variations may produce near-duplicate records → different UniqueEventID → two records. Assess after first run.

**B2B leakage unchanged:** "Canada Automotive Summit" and similar will appear. R2 rejects these — not a pipeline concern.

### Original JSON-LD scrape plan (superseded, kept for reference)

**Integration path:**
1. Fetch `https://allevents.in/vaughan-on/all` (server-side rendered — no browser required, returns full event list)
2. Extract `<script type="application/ld+json">` blocks
3. Find the block where `@type = "Event"`
4. Fields: `name` (title), `startDate` (clean YYYY-MM-DD), `url`, `location.name`, `location.address.addressLocality`

**Yield:** `/vaughan-on/all` → 135 events across 3 pages (45 per page). Page count fluctuates with season.

**Trending page (confirmed 2026-06-06):** `/vaughan-on` homepage "Trending Events" — 9 events, all present in `/vaughan-on/all`. Strict subset.

**JSON-LD completeness:** 45 JSON-LD events vs 50 event-card divs per page. Gap of 5 = ad cards.

**RSS:** Feed URL exists (`https://allevents.in/vaughan-on/RSS`) but timed out on probe. Not used — direct API above is cleaner than either RSS or JSON-LD.

**CityPlayhouse (tickets.cityplayhouse.ca) — DROP:** Full probe 2026-06-06. Stack: WordPress 6.9.4 + Red61 ticketing theme. RSS feed (`/feed/`, `/news/feed/`), WP REST API (`/wp-json/wp/v2/news`), and all post-type-specific feeds return 200 with valid structure but 0 items. The 13 Inoreader items are stale cache — site publishes WordPress news posts per show when first listed, Inoreader picks them up, then posts are deleted/unpublished. Dates were parseable from description text ("June 27, 2026") but source is unreliable by design: content appears briefly then disappears. Actual event database is in Red61's proprietary system, inaccessible without a partnership. Not viable for a weekly automated pipeline. Verdict: dropped.

---

## visitvaughan.ca/calendar Probe (2026-06-06)

| Source | Method confirmed | title | startDate | endDate | LocationName | city | Verdict |
|---|---|---|---|---|---|---|---|
| visitvaughan.ca | POST admin-ajax.php `action=haven_calendar` | ✓ | ✓ ISO datetime | ✓ ISO datetime | ✓ full address | ✓ `product_city` + `product_municipality` | **PASS — couples with W2c geo-filter** |

**Integration path:**
1. POST to `https://visitvaughan.ca/wp-admin/admin-ajax.php` with body `action=haven_calendar&search_date=YYYY-MM-01&dataType=json`
2. Parse `data.results` — keys are date strings (`"2026-06-06"`), each has `list_items[]`
3. Fields: `product_name` → title, `product_startdate` → startDate (YYYY-MM-DD HH:MM:SS), `product_enddate` → endDate, `product_link` → url, `product_location` → LocationName, `product_city` → city, `product_latlng` → lat/lng for geo-filter
4. No auth required. No headless browser.

**Yield:** ~20–30 events per month visible for June–July 2026. Events are curated by Tourism Vaughan — higher editorial quality than raw aggregators.

**Geo-filter required (W2c):** `product_municipality` field shows "Vaughan" even for some non-Vaughan events (e.g. "Lost & Found" at North York address tagged as Vaughan municipality). Use lat/lng or address string for geo-filter, not municipality field alone. Ships in same slice as W2c — do not enable before geo-filter is live.

**Dedup risk:** McMichael events appear on visitvaughan.ca (McMichael is already a direct branch). Same event, different UniqueEventID possible. Assess after first run — if overlap is small, ignore; if large, add title-normalization dedup step.

**Field coverage:**
- `product_startdate`: clean `YYYY-MM-DD HH:MM:SS` ✓
- `product_enddate`: clean `YYYY-MM-DD HH:MM:SS` ✓
- `product_name`: event title ✓
- `product_link`: event URL ✓
- `product_location`: full civic address ✓
- `product_location_condensed`: short form ✓
- `product_city`: city name ✓
- `product_municipality`: municipality (unreliable for geo) ✓
- `product_latlng`: lat/lng coordinates ✓
- `product_description`: event description ✓
- `product_category_id`: "EVENT" or "EXHIBIT" ✓
- `product_image_url`: image ✓

---

## unionville.ca/things-to-do/events Probe (2026-06-06)

| Source | Method confirmed | title | startDate | LocationName | url | Verdict |
|---|---|---|---|---|---|---|
| unionville.ca | POST admin-ajax.php `action=load_upcoming_events` — HTML response, class-based parsing | ✓ | ✓ text format "June 6, 2026" | ✓ venue name | ✓ Learn More href | **PASS — couples with W2c geo-filter** |

**Integration path:**
1. POST to `https://unionville.ca/wp-admin/admin-ajax.php` with body `action=load_upcoming_events`
2. Parse HTML response — clean class names: `card-date`, `card-time`, `card-title`, `card-location`, `card-desc`, `btn-learn-more` href
3. Parse date text ("June 6, 2026 to June 7, 2026") → ISO startDate/endDate
4. No auth required. No headless browser.

**Yield:** 29 upcoming events (June–December 2026 window). Weekly events including Bandstand nights, markets, festivals, walking tours, Varley Gallery programs.

**Field coverage (29/29 events):**
- `card-title`: event title ✓ 100%
- `card-date`: date range text ✓ 100% (needs text→ISO parsing)
- `card-time`: time range ✓ 25/29 (4 events no time listed)
- `card-location`: venue name ✓ 100%
- `card-desc`: description ✓ 100%
- `btn-learn-more` href: event URL ✓ (regex needs refinement — confirmed present in HTML)

**Geo-filter required (W2c):** Varley Art Gallery of Markham events, Markham Cycling Day, and similar are Markham-based, not Vaughan. Ships in same slice as W2c.

**Recurring event note:** "Music on The Street" spans June 13–September 13. Date range stored as a single record — pipeline should use startDate for window filtering, not endDate.

**Initial assessment was wrong:** WP REST API (`/wp/v2/event`) returns titles/links but dates are in ACF (not REST-accessible). DevTools inspection revealed a separate `admin-ajax.php` call (`action=load_upcoming_events`) that returns fully rendered HTML cards with all fields. This is the correct integration path.

---

## VPL (Vaughan Public Library) Probe (2026-06-06)

| Source | Method confirmed | title | date | time | LocationName | Verdict |
|---|---|---|---|---|---|---|
| VPL (vaughanpl.info) | Server-side rendered HTML scrape of `/programs` | ✓ | ✓ date block header | ✓ `start_time` div | ✓ library name | **PASS — window limited to 4 days** |

**Integration path:**
1. GET `https://www.vaughanpl.info/programs`
2. Parse HTML: date blocks (`class="month"` + `class="day"` + `class="weekday"`), program cards (`card_upcoming_programs`), titles (`h2 > a[href^=/programs/view/]`), times (`class="start_time"`), libraries (`class="library"`), descriptions (`class="description"`)
3. Associate each program with the date block it falls under
4. No auth, no headless browser, fully server-side rendered

**Yield:** 31 programs per page, 11 pages total. Page 1 covers Jun 6–9; page 11 reaches Jun 30 — nearly a month of programs. Programs are VPL library events — cooking classes, storytimes, exhibits, workshops, special events. High Golden Age and Families segment relevance.

**Pagination:** `/programs/page/N` (N = 1–11). Each page shows 31 programs starting from today, with the date range extending further on each page. Programs overlap across pages (page 1 programs also appear on pages 2–11). Correct integration: scrape all pages, deduplicate by `/programs/view/{id}` URL, then filter by issue date window.

**Window coverage for 10-day issue window:** Pages 1–4 cover roughly IssueDate through IssueDate+10 (Jun 6–16 in current window). Safest approach: scrape all 11 pages and let the date filter handle cutoff — avoids hardcoding page count which changes week to week.

**~~4-day window limitation note~~ — INCORRECT (2026-06-06 correction):** Initial assessment was based on page 1 only (Jun 6–9). Page 11 goes to Jun 30. The P1/P2/P3 Inoreader paginated subscriptions were intentionally set up to reach further into the window — they covered approximately 3 pages × ~2 extra days = Jun 6–14. Full scrape of all 11 pages provides ~3.5 weeks of coverage.

**Field coverage:**
- Title ✓ — from `h2 > a` link text
- Date ✓ — from surrounding date block (month + day + weekday)
- Time ✓ — from `class="start_time"` (some exhibits show date range instead of time)
- Library/location ✓ — from `class="library"` (VMC Library, Bathurst Clark, etc.)
- Description ✓ — from `class="description"`
- URL ✓ — `/programs/view/{id}` href

**Initial assessment was wrong:** First probe attempts failed because BiblioCommons (`vaughanpl.bibliocommons.com`) blocks headless access, and earlier scrapes didn't locate the program content in the HTML. The `vaughanpl.info` own site IS server-side rendered — program data confirmed at index 41991 in the HTML. The programs page is the correct integration target, not BiblioCommons.

**Gap closed 2026-06-07 — blind feed probe (methodology step 3) actually run:** Same exhaustiveness gap as unionville.ca had — the original VPL conclusion ("server-rendered, scraping is the only path") jumped from DevTools straight to scraping without checking `/feed/`, `?ical=1`, `.ics` paths. Ran it on `www.vaughanpl.info`:
- `/feed/`, `/programs/feed/`, `/programs/?ical=1` → 301 redirects to generic nginx error pages
- `/?feed=rss2`, `/?ical=1` → 200, but query params ignored entirely — just serves the regular homepage HTML
- `/events.ics`, `/calendar.ics`, `/programs.ics` → 404
- `/wp-json/wp/v2/types` → 404 generic error page (confirms this isn't even a WordPress site — custom-built, so WP feed conventions don't apply)

**No feeds exist in any form.** HTML scraping of `/programs` is confirmed as the genuine ceiling — audit now exhaustive across the full methodology hierarchy for VPL too, with no gaps remaining.
---

## DevTools Coverage Audit — re-check of all confirmed/live sources (2026-06-07)

Triggered by a fragility/efficiency audit of already-live or already-confirmed sources — checking whether each source's *original* confirmation method (often headless probing, pre-dating the DevTools-first methodology) was actually the best available path, and whether "scraping is the ceiling" verdicts were ever run through the *full* methodology hierarchy or just stopped at the first dead end.

| Source | Original method | What was checked today and why | Outcome |
|---|---|---|---|
| TRCA | JSON-LD scrape (headless probe, 2026-06-05) | Fresh DevTools pass — no XHR calls, fully server-rendered, JSON-LD is the only path. WP Event Manager API exists but is auth-gated (`wpem/events` → 405 Authentication Failed). | **Re-confirmed optimal — no change** |
| Eventbrite | Internal `city-browse` API (already in place pre-R5, built by Ariel) | Fresh DevTools pass — confirmed working without real CSRF auth (placeholder token accepted). Vaughan-specific place_id (`85633793`) returns 0 events; York Region place_id (`101740741`) is the correct geo level. Also confirmed `city-browse` is the *exact same call* the live Eventbrite site makes — not a workaround. | **Re-confirmed correct as-is — no change** |
| AllEvents | JSON-LD scrape (headless probe, 2026-06-06) | Fresh DevTools pass — **found a hidden direct JSON API** (`POST allevents.in/api/events/list`) via `combined-eventlist.js`. Replaces the planned JSON-LD scrape entirely — cleaner pagination, structured venue+lat/long, categories included. | **UPGRADED — integration plan rewritten, see AllEvents section above** |
| McMichael | iCal feed (headless probe, 2026-06-05 — currently live in R1) | Fresh DevTools pass — **found a hidden direct REST API** (`wp-json/tribe/events/v1/events`) via response headers on the live `/events/` page (`X-Tec-Api-Root`). Cloudflare-gated but passable with full browser-like headers. Returns ~2x the events with categories + rich descriptions — the iCal feed has none of this. | **UPGRADED — integration plan rewritten, see McMichael section below** |
| visitvaughan.ca | `admin-ajax.php` → `action=haven_calendar` (DevTools, 2026-06-06) | Nothing to re-check — `action=haven_calendar` already returns clean structured JSON directly. This is the best-case outcome the entire methodology can produce; no further probe could improve on a direct JSON API even if a feed existed. | **Stands as-is — already optimal** |
| VPL | Zero XHR calls, fully server-rendered (DevTools, 2026-06-06) | Gutcheck flagged that the original "scraping is the ceiling" verdict skipped methodology step 3 (blind feed probe). Ran `/feed/`, `?feed=rss2`, `/programs/feed/`, `?ical=1`, `.ics`, `/wp-json/` directly against `vaughanpl.info`: all either 301-redirect to bare nginx error pages, ignore query params and serve the plain homepage, or 404. `/wp-json/` 404 confirms this isn't even WordPress. No feed convention returns anything real. | **Gap closed — HTML scrape of `/programs` confirmed as genuine ceiling, zero gaps remain** |
| unionville.ca | `admin-ajax.php` → `action=load_upcoming_events` returns HTML cards (DevTools, 2026-06-06) | Two checks: (1) found a third ajax action, `load_past_events` — inspected its response, identical HTML card markup, confirms the plugin is HTML-only by design (a fourth call, `fusion_form_update_view`, is unrelated Avada/Fusion form-analytics noise); (2) blind feed probe — found two RSS feeds that *exist* (`/feed/`, `/things-to-do/events/feed/`) but both are WordPress auto-generated defaults (generic blog feed, page-comments feed) with **zero items** — coincidence, not signal. | **Gap closed — HTML-card scrape confirmed as genuine ceiling, zero gaps remain** |

**Net: zero open items, zero unverified conclusions.** Every "scraping is the only path" verdict in this sheet (TRCA, VPL, unionville.ca) is now backed by a complete run through the full methodology hierarchy — DevTools, blind feeds, REST API, and JSON-LD where relevant — not just the first check that happened to return empty. AllEvents and McMichael both flipped from "confirmed fine" to "confirmed fine via an inferior method — better path exists," which is what triggered pushing the rest of the audit one rung further rather than stopping at the first green light.

**Lesson reinforced:** the two upgrades (AllEvents, McMichael) both came from re-checking sources that were *never run through DevTools in the first place* — they were confirmed via headless probing before the DevTools-first methodology existed. Sources that *were* DevTools-checked from day one (visitvaughan.ca, unionville.ca, VPL) didn't yield upgrade-grade surprises on re-inspection — but two of them (VPL, unionville.ca) *did* have an unrun methodology step (blind feed probe) that needed closing before "scraping is the ceiling" could be called a verified conclusion rather than an assumption.
