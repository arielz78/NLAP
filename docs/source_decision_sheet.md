# Source Decision Sheet

**What this doc is:** the single source of truth for **per-source integration method + field inventory + verdict**. One job. It answers "for source X, what's the confirmed method, endpoint, what fields does it carry, and is it a PASS/DROP?"

**What this doc is NOT:** it does not own *decisions* (→ `Decision_Log.md`), *session narrative* (→ `Execution_Log.md`), or *release status* (→ `R5_Scope.md` snapshot). When a probe produced a decision, it's one-lined here and linked to the Decision_Log §.

**Structure:**
1. **Source Register** — the live reference table. Update rows in place; never goes stale.
2. **Per-Source Build Reference** — stable technical detail (endpoints, payloads, field maps, traps) for live + build-ready sources.
3. **Methodology** — the probe hierarchy + tier definitions (stable).
4. **Probe Log** — append-only chronological record of what was probed/found/overturned.

---

## 1. Source Register

Status legend: **Live** (in R1) · **Ready** (probed, build-ready) · **Backlog** (PASS, not built) · **Dropped** · **Retired** (superseded).

| Source | Status | Method (Tier) | Endpoint | Verdict | Field audit | Ref |
|---|---|---|---|---|---|---|
| **Eventbrite** | Live (pre-R5) | `city-browse` internal API (T1) | York Region `place_id=101740741` | PASS | ❌ open | §2 |
| **AllEvents** (Vaughan / RHill / Markham) | Live | Direct JSON API (T1) | `POST allevents.in/api/events/list` | PASS | ✅ 2026-06-12 | §2 |
| **McMichael** | Live | Tribe REST API (T1) | `wp-json/tribe/events/v1/events` | PASS | ❌ open | §2 · DL§39 |
| **TRCA — Kortright** | Live | WP Event Manager RSS (T1) | `?feed=event_feed&search_categories=trca` | PASS | ❌ open | §2 |
| **TRCA — Black Creek** | Live (in TRCA RSS branch) | `Murray Ross` filter in Kortright RSS (T1) | (same feed as Kortright) | events ingest here; only the standalone JSON-LD scrape was retired 2026-06-12 | ❌ open | §2 |
| **BiblioCommons** (Markham) | Live | Public RSS (T1) | `markham.bibliocommons.com/events/rss/all` | PASS | ❌ open | §2 |
| **B4 — visitvaughan.ca** | **Live 2026-06-17** | `admin-ajax` direct JSON (T1) | `POST admin-ajax.php?action=haven_calendar` | PASS | ✅ 2026-06-16 | §2 |
| **B5 — unionville.ca** | **Live 2026-06-20** | `admin-ajax` HTML cards (T4) | `POST admin-ajax.php?action=load_upcoming_events` | PASS | ✅ 2026-06-20 | §2 |
| **Facebook** | **Built 2026-06-21** (intake live; E2E test pending) | Manual: screenshot → ChatGPT extract (`VB_FACEBOOK_INTAKE`) → Airtable form (`FacebookIntake`) → n8n adapter (10th Merge input) | events feed — no public API (deprecated); manual by design | **KEEP** — 58% of clicks (§18); linkless-through (`Source=Facebook` validity exception), link added at selection; DOM-extractor deferred (#67) | manual | DL§49 · #35 |
| **Meetup** | Backlog (deferred) | `__NEXT_DATA__` (T3) | `meetup.com/find/ca--on--vaughan/` | **PASS** — not built for R5 (low yield); revisit if pool short; events via Facebook (W3) meanwhile. **Inoreader-only, never in R1** (#73) | n/a | §2b |
| **CityPlayhouse** | Backlog | 2-step crawl + Red61 JSON (T3) | `tickets.cityplayhouse.ca/events/` | PASS, not built. **Inoreader-only, never in R1** (#73); single venue, low yield | n/a | §2b |
| **VPL** | **Live 2026-06-24** (#74) | calendar grid scrape + per-program detail fetch (T4) | `vaughanpl.info/events_calendars/calendar/{year}/{month}` + `/programs/view/{id}` | PASS — built into R1 (5-node branch → `Merge VPL` → Clean/Filter). Method revised 2026-06-24 (#73). Verified exec 475: 73 programs → 200 rows, 0 invalid/blank. **Build deviations from spec:** horizon = today→+30d (mirrors DateWindow, not the 10-day issue window); one-occurrence-per-date dedup (same-day multi-branch collapses to first branch — editorial call); `category` capture deferred | ✅ 2026-06-24 | §2b |
| **onrichmondhill.com** | **LIVE 2026-06-25 (#77)** | Drupal 7 **HTML list-scrape (T4)** | `?q=events&page=0..5` → detail pages | PASS — built + verified live (exec 482): 30 in-window RH events, **70% exclusive** (9/30 overlap vs AllEvents RHill, matches #73). **RSS rejected:** `/rss.xml` real but hard-capped at 10 items (drops ~80% of the 46-event calendar); list view paginates the full forward calendar. Date from RDFa `date-display-start` (not pubDate, #58); `City='Richmond Hill'`; `Source='OnRichmondHill'`. Tier 1 (`/jsonapi`,`/api/events`) 404 + no JSON-LD — D7 has no cleaner surface | ❌ open | PL 06-24 |
| **Richmond Hill** (city) | **LIVE 2026-06-26 (#78)** | eSolutionsGroup **Atom feed (T4)** | `calendar.richmondhill.ca/default/Rss` → detail pages | PASS — built + verified live (exec 483): 7 in-window (rolling ~5-wk feed maxes 07-04; climbs weekly as window advances), venue fill 7/7, **90% exclusive / 0% vs #77** (City-facility supply: Mill Pond Gallery, 55+ Seniors, observatory, stewardship). **Month-scrape rejected:** grid truncates busy days behind "View More" (45 vs feed's 58, ~20% undercount). Civic (Council/Committee/Advisory/Budget) dropped at R1 on full `<title>`; fuzzy B2B left to R2. LocationName from detail Google-Maps link (venue-name-only); `City='Richmond Hill'`; `Source='RichmondHill'`. No iCal export (`?ical=1`→HTML), no JSON-LD | ❌ open | §2b |
| **Pinot's Palette** | **LIVE 2026-06-26 (#79)** | bespoke ASP.NET/IIS **single-page Doc HTML-scrape (T4)** | `pinotspalette.com/woodbridge` (landing page) | PASS — built + verified live: 73 parsed → **58 in-window**, **0 dupes / 100% exclusive** (single partner venue, net-new Couples/Golden Age supply), venue-fill 58/58, `City='Vaughan'`. **One fetch, no detail hop** — all events render on the landing page with title (`h3`) + date+year (`h4.time`) inline; cards double-render → dedupe by event id. **Surfaces rejected:** `/woodbridge/events` = month-calendar (28/June only, paginated, date lacks year); `/api/DataLayerImpressions` (POST XHR) = GA impressions sink, no date/no usable URL → deferred artist/category **enrichment** option only (no consumer yet, #69-style park). **Partner relationship** — reader discount `PinotsVaughan` = commercial obligation, in pipeline regardless of supply math | ❌ open (covered by #63 sweep) | PL 06-24 |
| **The Chef Upstairs** | **LIVE 2026-06-30 (#80)** | Shopify + **BookThatApp booking feed (T1 JSON)** | `the-chef-upstairs.bookthatapp.com/availability/schedule.json?shop=…&location=13173` | PASS — built + verified live: 36 Vaughan occurrences → **16 single-night** after `DROP_MULTIDAY` (18 camps + 2 multi-week sessions dropped as wrong event-shape, **pending client confirm**) → 3 in-window this run (DateWindow horizon; rest roll in weekly), **0 dupes / 100% exclusive** (single partner venue, net-new Couples supply), venue 3/3, `City='Vaughan'`. **Surfaces rejected:** `/products.json` (T1 clean JSON) = class *catalog*, **no date** → fails the one field the pipeline can't derive; detail-page HTML = date JS-loaded (not in static Doc). Date from feed `start[]` (1-indexed month)/`select=` ISO; `callback=` JSONP dropped, `start`/`end`/`location` filter server-side. **DescriptionRaw enriched** from `products.json` `body_html` (joined on `handle`, inline `this.helpers.httpRequest`) → R6/R7 content signal, fail-safe to '' | ❌ open (covered by #63 sweep) | §2b |
| **Cooking cluster — others** (Little Kitchen Academy, Rooks to Cooks, Longo's) | **Dropped** | per-venue scrape | various | DROP (#73 frequency check) — featured **3 / 2 / 1×** respectively across 72 issues (6 total in 16 months = incidental, not a relied-on source). Revealed editorial preference doesn't justify the per-venue build | n/a | PL 06-24 |
| **todocanada.ca** | **Dropped** | aggregator | `/city/toronto/vaughan-events/` | DROP (#73) — pure aggregator, re-lists Kortright/Wonderland already ingested; ~zero exclusive supply | n/a | PL 06-24 |
| **experienceyorkregion.com** | **Dropped** | — | root | DROP (#73) — root domain "Account Suspended" + redundant aggregator | n/a | PL 06-24 |
| **feverup candlelight** | **Dropped** | — | `feverup.com/en/toronto/candlelight` | DROP (#73) — Toronto geo, out of scope | n/a | PL 06-24 |
| **jazzlicious.ca** | **Dropped** | — | — | DROP (#73) — no editorial fit (client-confirmed) | n/a | PL 06-24 |

**Field audit = ❌ open:** a full raw-response sweep (every key, not just the fields used at build) hasn't been done. Required before R5 close — see the [field-inventory gate in R5_Scope](R5_Scope.md). AllEvents, B4/visitvaughan, and B5/unionville are swept; the rest (Eventbrite, McMichael, TRCA RSS, BiblioCommons) remain open.

---

## 2. Per-Source Build Reference

Stable technical detail per live/ready source. This is build + maintenance reference, not narrative.

### Eventbrite (live, pre-R5)
- Internal `city-browse` API — same call the live Eventbrite site makes (not a workaround). Placeholder token accepted (no real CSRF auth needed).
- **Geo level:** Vaughan-specific `place_id=85633793` returns **0 events** — must use York Region `place_id=101740741`.
- **Substrate gap (R6):** existing branch does **not** write `LocationName`/`Source` (0% populated). Retrofit = W2b, ships alone (Decision_Log §; R5_Scope #4).
- ~30 foreign domains (`.de`/`.fr`/`.sg`/`.com.au`) leak past geo-filter — W2c #5. **Partial fix 2026-06-25 (#81):** `Eventbrite Normalize` now drops venueless events (`if(!venueCity) continue`) — kills the blank-venue → defaulted-`Vaughan` slice (the bulk of the foreign/B2B webinars); 72 contaminated rows purged. **Geo gate closed 2026-06-25 (#59):** `Eventbrite Normalize` now applies the same strict `CITY_MAP` allowlist as AllEvents (`if(!city) continue` + canonicalize) — named non-target cities (Newmarket/Aurora/Schomberg/Toronto…) now dropped at ingestion. Verified live (exec 480: 51 events, 100% Vaughan/Markham/Richmond Hill); 50 pre-existing out-of-area rows purged. Language filter deliberately not built (allowlist subsumes #41 — see DL§52 close). Blank-`Source` historical tail (28% LocationName fill, 513 blank-Source records) is not a geo hole → deferred to R6-W4 (#69).

### AllEvents (live — Vaughan / Richmond Hill / Markham branches)
- `POST https://allevents.in/api/events/list`, body: `{"city":"vaughan","country":"canada","page":0,"rows":500,...}`. `rows=500` returns full set, no pagination at current volume. Three branches, one per city.
- **Response: top-level key is `data`** (not `events`).
- Field map: `eventname`→title · `start_time` (Unix)→StartDate · `end_time`→EndDate · `event_url`→Link · **`venue.name` always empty** → locationName = `full_address` segment before first comma · `venue.city`→geo-filter (CITY_MAP).
- Extracted to **discrete Candidates fields** (#72, 2026-06-23): `categories[]`→`SourceCategories` · `organizer.name`→`Organizer` · `score` (internal popularity)→`SourceScore`. **`DescriptionRaw` left empty** — the API carries no event description. Previously these were concatenated into `DescriptionRaw`, which let AllEvents win richest-wins survivorship on raw length and polluted the R6 content signal — see DL§51 follow-on.
- Available but uncaptured (low priority): `featured`, `tags`, `tickets.has_tickets`, `going.totalCount` (RSVP).
- Build: `AllEvents Fetch` (HTTP POST, UA header) → `AllEvents Normalize` (geo + decodeEntities). Exec #440: 233 fetched → 154 in-window.

### McMichael (live — REST, upgraded from iCal 2026-06-07)
- `GET https://mcmichael.com/wp-json/tribe/events/v1/events?per_page=50&page=N`. Cloudflare 403 on bare request — **passes with full browser headers** (`User-Agent`, `Accept`, `Referer: https://mcmichael.com/events/`, `Sec-Fetch-*`). No headless needed.
- Returns `{events:[], total, total_pages}`. ~55 events/run (vs 28 under iCal).
- Field map: `title`, `start_date`/`end_date` (clean, with times), `url`, `description` (rich HTML → DescriptionRaw), `categories[]`.
- **`venue:[]` is empty by design** — every event is at the museum. Hardcode `locationName = "McMichael Canadian Art Collection"`.
- ⚠️ **Entity-decode trap (Decision_Log §39):** REST returns raw HTML entities (`&#8217;`) + smart quotes that don't byte-match iCal-era stored titles → silent duplicate `UniqueEventID`s. Check existing Airtable values before choosing a decode target. **Same risk class applies to B4/B5 (both WordPress admin-ajax).**
- ⚠️ Pagination 404 (2026-06-09) — resolve page count from `total_pages` at runtime, never hardcode.

### TRCA — Kortright (live — RSS)
- `GET trca.ca/events-calendar/?feed=event_feed&search_categories=trca` (WP Event Manager plugin feed — *not* standard WP `/feed/`, which is the empty comments feed). Plain curl, no auth. ~188 events all-locations.
- Field map: `event_listing:start_date` (ISO) · `event_listing:end_date` · `event_listing:location` (street address OR venue name, inconsistent) · `event_listing:organizer` · title, link, description.
- ⚠️ **Map `event_listing:start_date`, NOT RSS `pubDate`** — most events published March 2026, run Jul–Oct. `pubDate` would drop them all as "past" (Issue #58 silent-drop).
- **Geo filter — Kortright + Black Creek** (live code, corrected 2026-06-16): `isKortright = location.includes('Pine Valley') || location.includes('Kortright')`; `isBlackCreek = location.includes('Murray Ross')` (Black Creek Pioneer Village, North York — **deliberately in-scope**). LocationName set to `"Kortright Centre for Conservation"` or `"Black Creek Pioneer Village"` accordingly. (49 events use the address format, 8 the venue name — filtering Kortright on `Pine Valley` alone misses 14%.) All other TRCA addresses out of scope/civic/one-off. **What was "retired 2026-06-12" was the standalone Black Creek JSON-LD *scrape source*, NOT Black Creek events — those still ingest via this RSS branch.**

### BiblioCommons — Markham (live — RSS)
- `GET https://markham.bibliocommons.com/events/rss/all`. Headless-fetchable, no auth. (TOU prohibits HTML harvesting but **explicitly permits RSS** — RSS is the compliant path, not the `/v2/events` SPA.)
- Field map: `bc:start_date` (ISO) · `bc:end_date` · `bc:location` (name + city + street + lat/long) · `category domain="Audience"` (Children→Families, Seniors→Golden Age) · title, link, description.
- ⚠️ Map `bc:start_date`, not `isoDate`. Geo via `bc:city`. Native n8n RSS Read node.
- Verified 2026-06-12: 123 records, 0 missing DescriptionRaw, 0 missing City, CITY_MAP correct.
- **Online programs kept 2026-06-25 (#81 / DL§52 refinement):** virtual MPL programs carry an empty `bc:location` (no name, no city) — previously dropped (`if(!locationName) continue`). Now kept and tagged `City='Online'`, `LocationName='Online (Markham Public Library)'`. Justified because the feed *is* the Markham library — a venueless event here is a known-local virtual program (Yoga for Older Adults, Retirement Planning). Physical events still gate on covered city. ~87 programs/feed; 35 in-window landed on the 06-25 run.

### B4 — visitvaughan.ca (LIVE 2026-06-17 — Tier 1, direct JSON; optimal, nothing easier exists)
- `POST https://visitvaughan.ca/wp-admin/admin-ajax.php`, body: `action=haven_calendar&search_date=YYYY-MM-01&dataType=json`. No auth, no headless; plain `User-Agent` header sufficient.
- **Response shape (corrected at Step-0, 2026-06-16):** top level = `results` / `settings` / `query` — **no `data` wrapper** (earlier spec said `data.results` — wrong). `results` is keyed by date string `"2026-06-05"`, and **each value is an object `{date, list_items[]}`** — events live in `list_items`, one level deeper than a bare array. Parse path: `results` → each value → `list_items[]`.
- **Only one usable request param: `search_date`** (the month). `municipality` is parsed but **ignored** — hardcoded server-side to "Vaughan" (sent `Markham`/empty, still echoed Vaughan, identical 62 events). `dataType=json` sets format. The `query` key just echoes the server's parse, not knobs we control.
- **Windowing is monthly → loop current + next month** (Jun→62 rows, Jul→24, Aug→15 — distinct sets). A 10-day issue window crossing a month boundary needs both.
- **Per-call duplication:** multiday events repeat once per spanned date-key (June: 62 rows = 37 distinct `product_id`). Dedup by `product_id` early; the `title|date` upsert collapses them anyway.
- **Haven API — checked 2026-06-16, NOT viable.** `settings` exposes the upstream (`havenapi.havendestinations.ca`, `haven_feed_id`), but the API is **auth-gated** (`/api/v1/events` → 401; the feed path with the id alone → error page). The real key lives server-side in VV's WordPress plugin. The admin-ajax endpoint **is** VV's own authenticated proxy to Haven — clean JSON, no key needed. Stay on admin-ajax; going direct buys nothing and adds a credential/ToS problem.
- **Field map** (33 keys total; full dump in §4): `product_name`→Title · `product_startdate`/`product_enddate` (clean ISO `YYYY-MM-DD HH:MM:SS`, **no parser needed**)→StartDate/EndDate · `product_link`→Link · **`product_venue_name` (HTML-stripped) → LocationName**, fallback `product_location_condensed` · `product_city`→City · `product_latlng`→geo (unused, see geo note).
- **DescriptionRaw (`visitVaughan:` prefix) — signal-bearing extras only:** `product_description`/`product_excerpt`, `product_types` (8-code taxonomy: `EVTFOOD,FESTIVAL,EXHIBIT,PERFORMANC,SPORT,EVTMARKET,EVTCLASS,EVTCOMNTY`), `product_cost`. **NOT** the full street address — zero R6/R7 signal (decided 2026-06-16); city + venue already captured as fields.
- ⚠️ **Entity-decode trap (McMichael §39 class — WordPress admin-ajax):** `product_venue_name`, `product_datetime*`, `product_datetab`, `product_startdate_full`/`_enddate_full` are HTML `<span>`/`<time>` blobs — use the clean siblings and strip tags+entities before writing. Check existing Airtable values for the decode target.
- **Geo: NO filter (decided 2026-06-16).** `product_municipality` is hardcoded Vaughan (useless as a filter). `product_city` shows ~19% "North York", but that's overwhelmingly **Black Creek Pioneer Village — in-scope, already ingested via the TRCA RSS branch.** A blanket North-York drop would nuke wanted events; the few non-Black-Creek North York venues (York U area) are GTA-adjacent and the editor approves manually. Revisit only if non-Black-Creek noise shows up.
- ⚠️ **Dedup risk (highest of any source):** re-lists **McMichael** (existing branch) **and Black Creek** (TRCA RSS branch) → run `overlapAudit.js` after the first run, expect some `crossSource`; merge or accept per existing policy.
- Yield: ~20–30 events/month, Tourism-Vaughan curated.
- **Field audit ✅ complete (Step-0 sweep 2026-06-16).**

### B5 — unionville.ca (LIVE 2026-06-20 — Tier 4, HTML cards; floor tier but confirmed ceiling)
- `POST https://unionville.ca/wp-admin/admin-ajax.php`, body: `action=load_upcoming_events` → HTML cards. No auth, no headless.
- Parse classes: `card-title` · `card-date` · `card-time` · `card-location` · `card-desc` · `btn-learn-more` href. Field coverage 29/29 except `card-time` (25/29).
- ⚠️ **Filter the window on startDate, not endDate** — recurring events span months ("Music on The Street" Jun–Sep stored as one record).
- ⚠️ Entity-decode check vs Airtable before writing (WordPress admin-ajax, McMichael §39 class).
- Geo: Markham-heavy (Varley Gallery, Main St Unionville, Millennium Bandstand). **No geo-filter** — Unionville is a Markham neighbourhood and Markham is include-tier (W1), so its events are in-scope. `city` hardcoded `Markham` in normalize. (Build decision 2026-06-20; corrected the earlier "needs geo-filter" note.)
- **Why Tier 4 is the ceiling (nothing easier exists — verified, not assumed):** WP REST `/wp/v2/event` returns titles/links but **dates locked in ACF** (not REST-accessible); feeds (`/feed/`, `/things-to-do/events/feed/`) return **0 items** (WP auto-defaults); `load_past_events` confirms plugin is **HTML-only by design**. Closed 2026-06-07, zero gaps.
- **Both loose ends resolved at build (2026-06-20):** (1) `btn-learn-more` = simple anchor (`<a href="..." class="btn-learn-more">`), optional — linkless rec events (Yoga/Zumba) drop at the Validity Filter; (2) `card-date` is consistent `"Month D, YYYY"`, split on ` to ` for ranges → manual month-map parser (avoids `new Date()` TZ off-by-one).
- **Field inventory (live, 2026-06-20):** ~33 cards / full forward calendar in one call, no pagination. Stable `news-NNNN` id per card — **present but intentionally unused** (source-local, can't dedup cross-source; `title|date` key kept). `card-time` is unparseable free text (`"7:00pm"`, `"During gallery public hours"`) → folded into DescriptionRaw. Entity-decode trap confirmed live (`&#8211;`). Build: `HTTP Request` (POST) → `Unionville Normalize`; `sourceCanonical=Unionville`.

### Cross-cutting build discipline (every new branch)
- Step 0: re-probe endpoint + dump FULL raw response, inventory every key (probes are 2026-06-06).
- Entity-decode check vs existing Airtable values before writing (admin-ajax / REST sources).
- Map the real event date to StartDate, never `pubDate` (#58).
- Additive Merge input, append mode, **never map `Status`** (upsert reset, Decision_Log §40/§41).
- After each branch lands → re-run `overlapAudit.js`, confirm `crossSource` ~0. Venue/city sites (B4/B5) are the **highest** dedup risk — they re-list aggregators more than aggregators re-list each other.

### §2b — Backlog / Unresolved Build Reference

PASS-but-not-built and unresolved sources. Kept so a revival is a running start, not a re-probe. These are **build specs**, not decisions — the *why not built* is in §4 / Execution_Log.

**CityPlayhouse — `tickets.cityplayhouse.ca` (PASS, Tier 3, 2-step crawl)**
- Single Vaughan venue → hardcode LocationName (McMichael pattern).
- Step 1: `GET /events/` → server-rendered, ~36 cards. Extract `{title, eventUrl=/event/{id}}` pairs. **No date in the card** (dates are in ACF, not the listing).
- Step 2: `GET /event/{id}/` (301 → trailing slash) → embedded Red61 calendar JSON in a `data-*` attribute powering the booking widget:
  ```json
  {"dates":["08/06/2026","09/06/2026"],
   "times":{"09/06/2026":[{"id":"655:879","performanceRealTime":"2026-06-09 19:00:00",
     "performanceDate":"9th June 2026 19:00","admissionTime":"18:00","availability":81}]},
   "eventId":"655:660"}
  ```
  Use `performanceRealTime` (exact zoned datetime). Title/subtitle server-rendered: `<h2 class="primary-color">` / `<h4 class="subtitle">` (subtitle = description).
- Cost: N+1 fetches (1 listing + 1/show). Red61 JSON shape is platform-specific (won't transfer unless client #2 also runs Red61). Caveat: confirm shape stable across 3–4 detail pages before committing.

**VPL — `vaughanpl.info` calendar grid + per-program detail fetch (LIVE in R1 2026-06-24, #74; Tier 4 HTML scrape; high Golden Age + Families relevance)**
*Method revised 2026-06-24 (#73 deep re-probe). The old single-surface `/programs` scrape below the line is superseded — it had broken pagination + recurrence-range dates + incomplete coverage.*

**As built (#74, exec 475 — 73 programs → 200 rows, 0 invalid):** 5-node branch `VPL Build Months → VPL Calendar Fetch → VPL Parse Calendar → VPL Detail Fetch → VPL Normalize`, wired into a dedicated 2-input `Merge VPL` (the main Merge caps at 10 inputs in the UI; a 2nd merge keeps it UI-valid). Three deviations from the spec below, all deliberate:
- **Horizon = today→+30d**, applied in Parse Calendar before the detail fetch — mirrors `DateWindow` (which drops anything past +30 anyway), so detail fetches are spent only on events that survive. Not the 10-day issue window (that's the allocator's job, downstream).
- **One occurrence per (program, date):** same-day multi-branch collapses to the first branch seen. Editorial decision 2026-06-24 ("a storytime that day is enough"); keeps VPL's key = `title|date`, identical to every other source (no §59 divergence). Distinct dates stay distinct rows.
- **`category` capture deferred** — known-free classification signal (see below), not built for #74. Tracked: **#75** (R6).

**Two-step integration:**
1. **Spine — `GET /events_calendars/calendar/{year}/{month}`** (all-branches month grid; `/calendar` = current month). One fetch returns **all 14 branches, ~304 occurrences / ~85 unique programs per month**. Recurrences are **pre-expanded onto real dates** (a weekly program appears once in each day cell) — no recurrence-expansion logic needed. Parse: `<table class="table calendar">` → each `<td>` day cell has `class="cell-number"` (day-of-month; month/year from URL); events inside are `<a href="/programs/view/{id}" title="{time} {branch}" class="branch_{xx}">{title}</a>` → title, per-event URL, date (cell), time + branch (`title` attr / class). Cells can hold multiple events (`<span class="count">`). Pagination is clean: `/events_calendars/calendar/{year}/{month}` — fetch current month, +next if the 10-day window crosses month-end.
2. **Description — `GET /programs/view/{id}`** for each **in-window unique** program ID (filter & dedup on the calendar data first → ~15–30 fetches, one per program, reused across its occurrences). Description is a clean plain-text `<div class="description">` (no tags to strip). **Mandatory, not optional:** `DescriptionRaw` is the R6 content-scoring signal + segment-classification input (Decision_Log §51 thin-data corollary) — calendar-only events would be silently handicapped.

**Also capture `category`** (`.category` link, e.g. "Pre-school Programs") — a self-categorization signal that's *stronger than the blurb* for segment classification; civic/library sources hand you this free, aggregators don't.

**Field coverage (all required Candidate fields satisfiable):** Title/URL/Date/EndDate/LocationName(branch)/City(=Vaughan, all 14 branches)/Source/UniqueEventID from the calendar; **DescriptionRaw from the detail fetch.**

**Easier-path sweep — exhausted negative (2026-06-24):** BiblioCommons RSS `vaughanpl.bibliocommons.com/events/rss/all` = **0 items** (VPL uses BiblioCommons for catalogue/account only, not events — vs Markham's 1,158); no JSON API (`/api/programs`, `/jsonapi` → 404); no JSON-LD `@type:Event`; no iCal/RSS export on the calendar (`?format=ical`/`?ical=1` fake-out → `text/html`; `.ics`/`/feed`/`/rss` all 404); fully server-rendered PHP (jQuery/Bootstrap, no XHR data layer) → DevTools reveals nothing curl doesn't. `/programs` listing carries descriptions inline but has **broken pagination** (`:action` is an unsubstituted server-side template var; `/page/N` silently returns page 1) → only ~22 of 85 reachable, so it's neither a complete spine nor a complete description source. The calendar+detail two-step is the genuine ceiling.

<details><summary>Superseded original entry (2026-06-06, kept for trail)</summary>

- `GET /programs` — server-side rendered. Parse date blocks (`class="month"`/`"day"`/`"weekday"`), `card_upcoming_programs`, `h2 > a`, `start_time`, `library`, `description`.
- *Claimed* pagination `/programs/page/N` (N=1–11), 31/page — **wrong**: that pagination is broken (see sweep above).
- No feeds (re-confirmed 2026-06-24).
</details>

**Meetup — `meetup.com/find/ca--on--vaughan/` (PASS, Tier 3, deferred — not built for R5; revisit if pool short. Events via Facebook W3 meanwhile)**
- `GET` the discovery page (not per-group — iCal exports cap at ~10/group). Parse `__NEXT_DATA__.props.pageProps`.
- **Seven event arrays, must merge + dedup by `id`:** `eventsInLocation`, `todayEvents`, `thisWeekendEvents`, `topicalEventsMusic`, `topicalEventsSocial`, `topicalEventsOutdoor`, `topicalEventsSports` → ~37 unique.
- Fields: `id`, `title`, `eventUrl`, `eventType` (PHYSICAL/ONLINE), `dateTime`, `endTime`, `going.totalCount` (RSVP — unique popularity signal), `feeSettings`, `group{name,urlname}`, `venue{name,address,city,state,country}`.
- Geo dry-run: 13/37 pass York Region filter. Date spread Jun 8–28 (3-week window).
- Parser is Next.js-specific (won't transfer). Caveat: single-snapshot — Next.js build IDs can change the embedded shape; re-verify before building.

**Richmond Hill (city) — `calendar.richmondhill.ca` (RESOLVED — LIVE 2026-06-26 #78, eSolutionsGroup Atom feed T4)**
- CMS = **eSolutionsGroup** (Granicus municipal). Front door is ASP.NET (`richmondhill.ca/.../events.aspx`); `calendar.richmondhill.ca` root 404s, but `/default/Month` is the live calendar app and `/default/Rss` is a real **Atom feed** (58 entries, ~5-week rolling window; title + date + detail URL).
- **Chosen surface = Atom feed, not the Month-grid HTML scrape.** The Month grid truncates busy days behind "View More" (scrape 45 vs feed 58, ~20% silent undercount). Feed is the more durable contract *and* more complete *and* fewer HTTP calls. Detail page fetched per event only for LocationName (Google-Maps link, venue-name-only); geo is RH-by-definition so no geo-filter needed.
- **Civic split:** the feed mixes governance meetings (Council/Committee/Adjustment/Advisory/Budget — auto-reject) with community events. R1 normalize drops civic deterministically on the feed's full `<title>` (not the truncated slug — slug clips "...Committee"→"...Committ" and leaks); fuzzy B2B/professional-dev left to R2.
- **Overlap:** 90% exclusive (35/39), **0% vs onrichmondhill.com (#77)** — City-facility supply complementary to #77's community-org events; partial AllEvents-RHill overlap only (Watch Parties, Volunteer Fair, Canada Day).
- No iCal export (`?ical=1`→HTML), no `@type:Event` JSON-LD. **Revision trigger:** eSolutionsGroup→other CMS migration, or `/default/Rss` schema/horizon change.

---

## 3. Methodology

### Probe hierarchy — work top-to-bottom, stop at first clean reliable data
1. **DevTools first** (Network → Fetch/XHR → reload) — catches admin-ajax plugins, REST-ish endpoints, dynamic sources. First move on anything dynamic.
2. **Main HTML document** (Network → Doc → Response) — catches server-rendered "SPAs" (VPL).
3. **Blind feed probe** — `/feed`, `/?feed=rss2`, `/?ical=1`, `/events.ics`, `/calendar.ics`.
4. **WP REST API** — `/wp-json/wp/v2/types` → registered post types → `/wp-json/wp/v2/{type}`.
5. **JSON-LD** in page source — `<script type="application/ld+json">`, `@type: Event` (TRCA pattern).
6. **HTML scraping** — known class names / structure (VPL, unionville).
7. **Headless browser** — last resort; only for high-value weekly sources with all above dead.

**Core lesson (2026-06-06):** a DROP is only as strong as the *surface* it was tested against. Three sources (VPL, visitvaughan, unionville) were initially written off, then automated via methods 1–2. **Always open DevTools before writing off a source; never generalize "this surface is dead" to "this source is dead."** Full standard in `scrape_blueprint.md`.

### Integration tier ranking — ease *and* transferability
1. **Direct JSON/REST API** — AllEvents, McMichael, visitvaughan, Eventbrite. Cleanest; one call, you control pagination/filters.
2. **JSON-LD** (schema.org) — standardized parsing → transfers to any schema.org site. (TRCA Black Creek, retired.)
3. **Embedded app-state JSON** (`__NEXT_DATA__` etc.) — clean to fetch but bespoke per framework; parser doesn't transfer. (Meetup, CityPlayhouse.)
4. **HTML-card scrape** via ajax/admin endpoints — works, zero infra, fragile + bespoke. (unionville, VPL.)
5. **Headless required** — worst tier. No current sources here.

Tiers 1–2 = reusable integration code (ports to client #2). Tiers 3–4 = one-off build every time. **The portable asset is the canonical Candidates schema + adapter contract** (each adapter = pure function `raw feed → canonical record`); hardcode Vaughan specifics (aggregator domains, geo-filter, endpoints).

---

## 4. Probe Log

Append-only. One-to-three lines per probe/decision. Technical findings live in §2; this is the chronological trail. `DL§` = Decision_Log. `PL` = this Probe Log.

**2026-06-25 — #81 source-aware online handling (DL§52 refinement).** Audited all 11 live branches for online/blank-venue handling. **BiblioCommons** → keep venueless events as virtual MPL programs (`City='Online'`), since the feed is itself local. **Eventbrite** → drop venueless events (`if(!venueCity) continue`): its global city-browse served foreign/B2B online webinars that defaulted to `Vaughan` (72/224 = 32% contaminated; purged). Rule: trust a venueless event only from a locally-anchored source. Eventbrite out-of-range city gate + language filter + blank-Source tail remain open → #59.

**2026-06-24 — #73 source reconciliation: frontier probed, 4 dropped, 2 build-ready.** Catalogued all client-screenshot + Inoreader sources; confirmed **Inoreader ≠ R1** (CityPlayhouse/VPL/Meetup never wired in). **onrichmondhill.com** → Drupal 7, live RSS `/?q=events/feed` (Tier 2); overlap spot-check vs live AllEvents RHill API (172 ev) = **~75% exclusive**, civic/community supply → Ready. **VPL** spec re-confirmed live → Ready. **richmondhill.ca** (municipal) = unprobed candidate, distinct from onrichmondhill.com. **Cooking/paint cluster** exclusive (none on Eventbrite York, 175 ev checked) but category-gated (5 builds). **Dropped:** todocanada (redundant aggregator), experienceyorkregion (suspended + redundant), feverup (Toronto), jazzlicious (no fit). Value test applied: marginal *exclusive* supply that fits a segment, not volume. VPL+onrichmondhill queued for next-session build sprint.

**2026-06-16 — B4 visitvaughan Step-0 sweep ✅ + corrections.** Full 33-key dump (§2). Confirmed: no `data` wrapper (top = `results`/`settings`/`query`); events nested in `results[date].list_items[]`; `search_date` the only live param (`municipality` hardcoded Vaughan, ignored); monthly windowing → loop 2 months; 62 rows = 37 distinct `product_id` (multiday repeats). **Haven API auth-gated (401) — admin-ajax is its authenticated proxy, stay on it.** **Geo: no filter** — the ~19% "North York" is Black Creek Pioneer Village, in-scope (TRCA RSS already ingests it). DescriptionRaw = description/excerpt + `product_types` + `product_cost`, no street address (no R6/R7 signal).

**2026-06-16 — Doc correction: TRCA is Kortright + Black Creek, not "Kortright only."** Live RSS code filters `Pine Valley`/`Kortright` OR `Murray Ross` (Black Creek). The 2026-06-10 "Kortright only" note below was an oversimplification; only the standalone Black Creek JSON-LD *scrape* was retired (2026-06-12), never the events. §2 corrected.

**2026-06-12 — TRCA Black Creek JSON-LD retired.** RSS branch catches 27/27 of the scrape's events and 122 vs 27 total (scrape only crawled 3 hardcoded pages). Strict subset → scrape retired, 6 nodes deleted.

**2026-06-23 — AllEvents metadata extracted out of DescriptionRaw (#72).** `score`/`organizer`/`categories` moved from the concatenated `DescriptionRaw` blob into discrete `SourceScore`/`Organizer`/`SourceCategories` fields; `DescriptionRaw` now empty for AllEvents (no API description). Fixes richest-wins survivorship (Eventbrite's primary link + real description now wins EB↔AllEvents collisions) and de-pollutes the R6 content signal; 487 existing rows backfilled. See DL§51 follow-on.

**2026-06-12 — BiblioCommons full verification.** 123 records, 0 missing DescriptionRaw/City, CITY_MAP correct. Branch healthy, closed.

**2026-06-12 — AllEvents field audit ✅ (only source swept).** All keys documented; `score`/`organizer`/`categories` captured into DescriptionRaw; `featured`/`tags`/`tickets`/`going.totalCount` available, deferred.

**2026-06-10 — TRCA Kortright RSS discovered.** `?feed=event_feed&search_categories=trca` (WP Event Manager) found on `trca.ca/events-calendar/` — different surface from `calendar.trca.ca` (JSON-LD). Address audit → **Kortright only** (57 events, Vaughan venue); other TRCA addresses out-of-scope/civic/one-off.

**2026-06-09 — BiblioCommons DROP → PASS (overturn).** Original drop tested the `/v2/events` React SPA and stopped; never probed `/events/rss/all`. RSS is open, structured, no auth. Was the last hold of three overturns. Lesson: the original probe was the one that *did* open DevTools on the right page — generalization only held there.

**2026-06-09 — McMichael pagination 404.** Prompted the "resolve page count at runtime" rule → failure-visibility done-when in R5_Scope.

**2026-06-07 — McMichael iCal → REST upgrade shipped.** ~2x yield, real descriptions + categories. Surfaced pipeline-wide entity-decode gap → **DL§39**. Old iCal branch disabled (rollback).

**2026-06-07 — DevTools coverage audit (all live/confirmed sources).** Re-ran the full hierarchy on each. AllEvents + McMichael flipped "fine" → "fine via inferior method, better path exists" (both never DevTools-checked originally). VPL + unionville had an unrun blind-feed step → closed (HTML scrape confirmed as genuine ceiling). TRCA, Eventbrite, visitvaughan re-confirmed optimal.

**2026-06-07 — Meetup DROP → PASS, then dropped for R5 anyway.** Discovery page `meetup.com/find/ca--on--vaughan/` carries `__NEXT_DATA__` (37 events, 13 pass geo, 3-week window) — Tier 3, no iCal cap. But low net yield → **not built for R5; Meetup events enter via Facebook (W3)**. Original config groups (`torontobikemeetup`, `women-that`) were Toronto/defunct; York Region alternatives (Forest Footprints, Dim Sum) low-yield.

**2026-06-07 — CityPlayhouse DROP → PASS (backlog).** Original probe tested the ephemeral WP news/RSS layer; never opened the ticketing storefront. `tickets.cityplayhouse.ca/events/` is server-rendered; detail pages embed Red61 calendar JSON (`performanceRealTime`). Tier 3, 2-step crawl. PASS, not built (R5 backlog).

**2026-06-06 — AllEvents JSON-LD → direct API (same-day upgrade).** DevTools found `POST api/events/list` via `combined-eventlist.js`. Replaced the planned 3-step JSON-LD scrape. Top-level key `data`, `venue.name` empty (use `full_address`), `categories[]`, `score`.

**2026-06-06 — B4 visitvaughan probed → PASS (Tier 1).** `admin-ajax action=haven_calendar` direct JSON, 12 fields. Optimal — no feed could improve on direct JSON. Geo: lat/lng not `product_municipality`.

**2026-06-06 — B5 unionville probed → PASS (Tier 4).** `admin-ajax action=load_upcoming_events` HTML cards. WP REST dates locked in ACF, feeds empty → HTML is genuine ceiling. Two parsers open (href regex, date-range).

**2026-06-06 — VPL probed → PASS (Tier 4, backlog).** `vaughanpl.info/programs` server-rendered (not BiblioCommons SPA). 11 pages, ~3.5 weeks coverage. Blind feed probe (2026-06-07) confirmed no feeds exist → scrape is genuine ceiling. Not built.

**2026-06-06 — CityPlayhouse first probe → DROP** (later overturned). WP news layer ephemeral (posts published per show then deleted). Correct about that surface, wrong to generalize.

**2026-06-05 — Task 3 initial probe (4 sources).** TRCA (JSON-LD), McMichael (iCal), BiblioCommons (RSS), Meetup (iCal) — all PASS at the time. Methods later upgraded per above.

---

## Appendix — Client-provided source list (Week 1 origin input)

The original screenshot list the audit started from. Kept for traceability; not maintained.

<details>
<summary>Original 22-source list</summary>

blackcreek.ca/events · longos.com/cooking-classes · littlekitchenacademy.com/locations/vaughan · thechefupstairs.com/pages/kids-classes · mcmichael.com/upcoming-events · todocanada.ca/things-to-do-in-vaughan · puttingedge.com/locations/vaughan · pinotspalette.com/woodbridge · rookstocooks.ca · meetup.com/find/ca--vaughan/seniors · santehealingspas.com · sanctuarydayspas.com · facebook.com/elementalwellnessstudio · trubliss.ca · glamagalparty.com · onrichmondhill.com · experienceyorkregion.com · jazzlicious.ca · feverup.com/toronto/candlelight · unionville.ca/things-to-do/events · richmondhill.ca/en/things-to-do/events · markham.bibliocommons.com/v2/events

</details>
