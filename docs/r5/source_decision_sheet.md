# Source Decision Sheet – Week 1 (Corrected to match your screenshot links)

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

**McMichael LocationName gap:** No `LOCATION` field in iCal records — location is embedded in the `DESCRIPTION` HTML blob. W2 will need to either extract it or leave LocationName blank (soft-required field, won't crater the pool).

**Meetup LocationName gap:** No location field in the iCal feed at all. Same handling as McMichael — blank is acceptable per R5_Scope hard-reject vs soft-required distinction.

**Markham BiblioCommons — drop rationale:** Fully client-side React SPA. No public API, no iCal export, no JSON-LD on event pages. Browser dev tools inspection confirmed only 2 network calls on page load (systemMessages + jQuery state), neither returning event data. Server-side rendered with no structured data accessible to a headless fetch. Requires browser execution — worse than scraping. Dropped per R5_Scope rule ("if any source requires HTML scraping, drop to three sources").

**Net: 3 confirmed sources** (TRCA, McMichael, Meetup). W2 builds branches for these three only.

---

## AllEvents.in Probe (2026-06-06)

| Source | Method confirmed | title | date | LocationName | url | Verdict |
|---|---|---|---|---|---|---|
| AllEvents Vaughan | JSON-LD in page source (`allevents.in/vaughan-on`) | ✓ | ✓ YYYY-MM-DD | ✓ location.name + addressLocality | ✓ allevents.in event URLs | **PASS** |

### Notes

**Integration path:**
1. Fetch `https://allevents.in/vaughan-on/all` (server-side rendered — no browser required, returns full event list)
2. Extract `<script type="application/ld+json">` blocks
3. Find the block where `@type = "Event"`
4. Fields: `name` (title), `startDate` (clean YYYY-MM-DD), `url`, `location.name`, `location.address.addressLocality`

**Yield:** `/vaughan-on/all` → **135 events across 3 pages** (45 per page). `/vaughan-on` only shows 12 featured events — use `/all`. Page count fluctuates with season; do not hardcode 3.

**Pagination:** Standard HTML pagination via `<link rel="next">`. Follow `rel="next"` dynamically until absent — handles 2 pages in a slow week or 6 pages in summer without code changes.

**JSON-LD completeness confirmed:** 45 JSON-LD events vs 50 event-card divs per page. Gap of 5 = ad cards embedded in the grid (confirmed via class inspection: `event-card + ad` pattern). JSON-LD captures all real events.

**Geography:** `addressLocality = "Vaughan"` on all events, but AllEvents mis-tags some — e.g. "Puppy Yoga IN TORONTO", "JEY ONE TORONTO CANADA" tagged as Vaughan. **Geo-filter (W2c) is non-negotiable for this source.** AllEvents branch must ship in the same slice as W2c — do not enable it before geo-filter is live.

**Dedup risk:** AllEvents aggregates from Eventbrite and other sources. Same event may appear in both AllEvents and Eventbrite branches with slightly different titles → different UniqueEventID → two records. Cannot quantify pre-run. After first run: query Airtable for candidates on the same date with similar titles. If overlap is small, ignore. If large, add a title normalization step.

**B2B leakage:** "Canada Automotive Summit" and similar will appear. R2 rejects these — not a pipeline concern.

**RSS:** Feed URL exists (`https://allevents.in/vaughan-on/RSS`) but timed out on probe. Not used — JSON-LD from page is cleaner.

**CityPlayhouse (tickets.cityplayhouse.ca) — DROP:** Full probe 2026-06-06. Stack: WordPress 6.9.4 + Red61 ticketing theme. RSS feed (`/feed/`, `/news/feed/`), WP REST API (`/wp-json/wp/v2/news`), and all post-type-specific feeds return 200 with valid structure but 0 items. The 13 Inoreader items are stale cache — site publishes WordPress news posts per show when first listed, Inoreader picks them up, then posts are deleted/unpublished. Dates were parseable from description text ("June 27, 2026") but source is unreliable by design: content appears briefly then disappears. Actual event database is in Red61's proprietary system, inaccessible without a partnership. Not viable for a weekly automated pipeline. Verdict: dropped.