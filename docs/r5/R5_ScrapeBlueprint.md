# Source Evaluation Blueprint for an Automated Weekly Event Newsletter Pipeline

**TL;DR**
- This blueprint defines a six-part, surface-by-surface methodology that produces an evidenced PASS or DROP for any event website; the controlling rule is that a DROP is only valid after every surface type on a domain has been probed, the CMS/platform has been positively identified, and at least three integration tiers (blind probe + DevTools + CMS-specific endpoints) have all returned documented negatives.
- The single biggest source of false negatives is generalizing "this surface is a dead end" to "this source is a dead end" — capped iCal feeds, JS-only calendar widgets, and blocked third-party catalogue subdomains routinely sit alongside server-rendered search pages, JSON-LD detail pages, REST endpoints, and RSS feeds on the *same* domain that pass cleanly.
- A DROP is about static-fetchability under the hard constraints (no headless browser, no auth/partnership, weekly-stable data), not about whether the site has event data; the proof-of-exhaustion standard exists to distinguish "I checked everything accessible without headless" from "the site has no data."

## Key Findings

- **CMS identity unlocks specific probe paths and must be established before any DROP.** WordPress with The Events Calendar exposes `/wp-json/tribe/events/v1/events` (Tier 1); Localist exposes `/api/2/events` (Tier 1); Drupal may expose `/jsonapi` or a Views REST export; Shopify exposes `/products.json` and `/collections/all/products.json`. You cannot declare a DROP without knowing which of these paths even apply.
- **The same platform often serves multiple tiers simultaneously.** The Events Calendar serves a Tier 1 REST API *and* a Tier 2 JSON-LD block on each event detail page *and* a Tier 4 iCal feed at `?ical=1` — if the iCal feed is capped, the REST API is uncapped, and vice versa.
- **Server-rendered ≠ contractually usable.** BiblioCommons `/v2/events` pages are fully server-rendered (statically fetchable, not a headless DROP), but the Terms of Use prohibit HTML harvesting while explicitly permitting RSS/XML feeds — so the correct PASS path is the RSS feed, not the HTML.
- **Auth-gating is tier-specific, not domain-wide.** BiblioCommons' `api2.bibliocommons.com/v1/{LIBRARY_ID}/events` REST API requires a private `x-api-key` (a DROP under the no-partnership constraint), yet the same library's public RSS feed needs no key at all.
- **"Something returned" is not "confirmed usable data."** A `200 OK` with an empty array is negative evidence, not positive. The Events Calendar's own knowledgebase documents that an auth-gated query "without authentication, a site with attendees will still return" a body like `{"rest_url":".../attendees/","total":0,"total_pages":0,"attendees":[]}` — because that data "requires authentication to retrieve." Confirmation requires the four pipeline fields actually present in the body.

## Details

The full blueprint follows in six sections.

---

# 1. UNIVERSAL SURFACE CHECKLIST

Before a DROP verdict is allowed to stand, **every** surface type below must be checked on the target domain. The front-door events page is one surface among a dozen. Each surface type commonly holds event data in a different shape and at a different tier than the obvious calendar page.

- **Homepage / root document.** Always the first fetch. The root HTML carries the CMS fingerprints (generator meta tag, `/wp-content/` asset paths, `cdn.shopify.com` references), the REST API discovery `Link` header, and frequently an inline app-state JSON blob. Never skip it even when an events page URL is known.
- **The primary events/calendar landing page.** The obvious front door (`/events`, `/calendar`, `/whats-on`). Check it, but treat it as the *start*, not the universe.
- **Search / discovery pages.** The site's event search results URL (often `/events/search?...` or `/events?keyword=`). Search pages frequently emit structured data or hit a clean XHR/JSON endpoint even when the static calendar page is a JS widget. This is the single most common false-negative rescue.
- **Category / tag / topic pages.** Filtered views (`/events/category/music`, `/events/tag/free`). These often expose the same REST endpoint with a filter parameter you can later use for geo-filtering, and they sometimes paginate differently (revealing the API behind the list).
- **Individual event detail pages.** The single-event permalink. This is where JSON-LD (`<script type="application/ld+json">` with `@type: Event`) most reliably lives, carrying name, startDate, endDate, and a nested `location` Place with PostalAddress — even when the listing page has none. Always open at least two or three detail pages.
- **Organizer / venue profile pages.** Pages for a specific venue or organizer (`/venue/...`, `/organizer/...`). These often expose a venue-scoped feed or API parameter (e.g., Localist `venue_id`, Tribe `venue` filter) that gives you clean geo-filtering by design.
- **API roots and discovery endpoints.** `/wp-json/`, `/api/`, `/api/2/`, `/jsonapi`, `/graphql`. Even when no events page reveals an API, the root may self-document every available namespace.
- **Feed paths.** RSS (`/feed`, `/events/feed`, `/events/rss/all`), Atom, and iCal (`/events/list/?ical=1`, `/events.ics`, `?ical=1`). Feeds are the highest-stability, lowest-effort surface and are frequently the *only* contractually permitted machine-readable surface (see BiblioCommons in §4).
- **Embedded ticketing subdomains and storefronts.** Many venues hand off to a ticketing platform on a subdomain or path (`tickets.example.com`, Shopify `/products.json`, a Red61/Eventotron storefront, an Eventbrite/See Tickets embed). A ticketing storefront often has server-rendered listings or a JSON endpoint even when the venue's own WordPress RSS returns nothing.
- **CDN-hosted data files.** Static JSON/CSV dropped on a CDN (`cdn.example.com/data/events.json`, an S3/Cloudfront bucket, a Localist-generated static CSV). Look for these in the Network tab's `Fetch/XHR` and in `<script src>`/`fetch()` references in the HTML.
- **App-state JSON embedded in initial HTML.** `__NEXT_DATA__` (Next.js), `window.__INITIAL_STATE__`, `window.__NUXT__`, `window.__APOLLO_STATE__`, Gatsby `pageContext`, Remix `__remixContext`. These are baked into the server response and are fetchable with curl even though they look like a JS app.
- **Sitemaps.** `/sitemap.xml` and nested sitemaps frequently enumerate every event detail URL, giving you a complete crawl list when no API or feed exists.
- **`robots.txt`.** Names disallowed paths (which often *reveal* an API or feed path), and points to sitemaps. Read it both for discovery and for compliance.
- **Mobile app / partner API hosts.** A separate API host the site's own mobile app or JS frontend calls (visible in `Fetch/XHR`). Often the cleanest Tier 1 source on the whole domain.
- **Third-party catalogue / aggregator subdomains.** A library's BiblioCommons subdomain, a university's Localist subdomain, a city's third-party calendar. **Critical:** if the third-party subdomain blocks you, the institution's *own* domain (or the third party's RSS feed) may be fully open. Never let a blocked subdomain condemn the source.

---

# 2. DEVTOOLS INSPECTION PROTOCOL (Chrome-specific)

Run this exact sequence on each surface in Chrome. Open DevTools with **F12** (or **Cmd+Option+I** on macOS). Before doing anything else, open the **Network** panel and check **Preserve log** (so navigations don't wipe the request list) and **Disable cache**.

**Step 1 — Capture the document response.** With the Network panel open and recording, reload the page. Click the **Doc** filter tab. Click the top (main document) request. Open the **Response** tab (the raw server HTML, *not* the live Elements DOM). This is what curl would see.
- Search the Response (Cmd+F inside the Response tab) for `application/ld+json`, `__NEXT_DATA__`, `__INITIAL_STATE__`, `__NUXT__`, and a `{` near event-looking text. If the event title/date/venue text is present here, the page is server-rendered and statically fetchable.
- **App-state multi-array deduplication:** when `__NEXT_DATA__` or a similar blob is present, a single page load frequently carries the same events spread across multiple named arrays (e.g., `eventsInLocation`, `todayEvents`, `thisWeekendEvents`, category-specific arrays). Deduplicate by event ID before counting yield — naive item count will overstate volume significantly. The integration code must also merge all arrays before deduplication, not just parse the first one it finds.
- **Decisive CSR test:** if the Response body is essentially an empty shell — a `<div id="root">` or `<div id="app">` with no event text and just script tags — the content is client-side rendered. That does *not* immediately mean DROP; it means the data is loaded by a subsequent request you must find in Step 2.

**Step 2 — Hunt the data API in Fetch/XHR.** Click the **Fetch/XHR** filter tab. Reload. To cut noise, type `mime-type:application/json` in the filter box. Now interact with the page the way a user would: click **page 2** of pagination, apply a **category filter**, run a **search**, click a **venue**. Each action may fire the data request that wasn't sent on initial load.
- Click each promising request (anything under `/api/`, `/wp-json/`, `/api/2/`, `/jsonapi`, `/graphql`, or ending `.json`). Open **Preview** for a formatted tree and **Response** for the raw body. Open **Payload** to see what parameters the page sent (these become your filter/pagination knobs).
- When you find a JSON response containing event fields, right-click → **Copy → Copy as cURL**. Re-run that cURL in a clean terminal (no browser cookies). If it still returns the data, you have a headless-free Tier 1 source. If it only works with a session cookie or nonce, note that as a possible auth dependency (verify per §4).
- **Cloudflare / anti-bot blocking:** if a promising endpoint returns `403` or a Cloudflare challenge page to the bare cURL, re-run with a full browser-like UA and common headers before concluding it is auth-gated: `curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -H "Accept: application/json" -H "Referer: https://DOMAIN/"`. Many Cloudflare configurations pass on browser-like headers alone — this is a passability check, not an auth bypass. If it passes, the source is Tier 1; if it still blocks, note the Cloudflare gate in the documentation template and treat as a production reliability caveat, not a DROP (the data is accessible; the question is whether the weekly cron can replicate the header set reliably).

**Step 3 — Read response headers for hidden-API signals.** On the main Doc request, open **Headers → Response Headers**. These headers are CMS tells:
- `Link: <https://example.com/wp-json/>; rel="https://api.w.org/"` — WordPress REST API is live; the href is your API root. (Without pretty permalinks it appears as `?rest_route=/`.)
- `X-Generator: Drupal 10` — Drupal; probe `/jsonapi` and Views REST exports.
- `X-Powered-By: PHP/8.x` — PHP CMS (WordPress/Drupal/Joomla); narrow with the generator meta tag.
- `X-TEC-Total` / `X-TEC-TotalPages` on a `/wp-json/tribe/...` response — The Events Calendar REST API, with total counts for completeness evidence.
- `X-WP-Total` / `X-WP-TotalPages` — WordPress core REST collection, total item and page counts.
- `Server`, `Set-Cookie` names (e.g., a `wordpress_` cookie, a Shopify `_shopify_` cookie) — corroborating platform tells.
- **Check headers on non-obvious intermediate pages, not just the homepage.** The most useful API-discovery header may appear on the events landing page, a category page, or even an individual event detail page — not the root document. `X-Tec-Api-Root` (The Events Calendar) is a real-world example: it appeared on `/events/` but not necessarily on the homepage. Run the Step 3 header check on each surface in §1's checklist, not just the first Doc request.

**Step 4 — Confirm JSON-LD in Elements/Sources.** In the **Elements** panel, Cmd+F and search `ld+json`; expand each `<script type="application/ld+json">` and confirm `"@type": "Event"` with `name`, `startDate`, and a `location`. Cross-check against the **Response** body from Step 1 — JSON-LD that appears in Elements but *not* in the raw Response was injected by JavaScript and is **not** statically fetchable (it would need headless; treat as Tier 5 for that surface).

**Step 5 — Adjudicate.** Confirmed usable data = a request whose **Response** body (reproducible via Copy-as-cURL without browser session state) contains, per event, the title, a parseable date/time, a location (city minimum), and a per-event URL. "Something returned" — a `200` with an empty array, an HTML error page served with a JSON content-type, or data that only renders in the live DOM but is absent from the raw Response — is **not** confirmation.

---

# 3. BLIND PROBE SEQUENCE

Run these with `curl` before opening a browser. Use `curl -sSL -A "Mozilla/5.0"` to follow redirects and send a normal UA; add `-I` for headers-only HEAD requests. Always inspect what comes back — a login redirect, an empty array, and a populated payload are three different verdicts.

**Universal first pass (any domain):**
- `curl -sI https://DOMAIN/` — read `Link`, `X-Generator`, `X-Powered-By`, `Server`, `Set-Cookie` for the CMS fingerprint.
- `curl -sL https://DOMAIN/ | grep -i 'name="generator"'` — generator meta tag (`WordPress 6.x`, `Joomla!`, `Drupal 10`, `Ghost`).
- `curl -sL https://DOMAIN/robots.txt` and `…/sitemap.xml` — disallowed paths and event URL enumeration.
- Grep the homepage HTML for `application/ld+json`, `__NEXT_DATA__`, `__INITIAL_STATE__`, `__NUXT__`, `/wp-content/`, `cdn.shopify.com`, `Drupal.settings`.
- Common feed guesses: `/feed`, `/feed/`, `/rss`, `/atom.xml`, `/events/feed`, `/events.ics`, `/?ical=1`.

**WordPress (fingerprint: `/wp-content/` assets, `wp-json` Link header, `wordpress_` cookies):**
- REST discovery: `GET /wp-json/` → lists `namespaces`. Core posts: `/wp-json/wp/v2/posts`. Collections return `X-WP-Total`/`X-WP-TotalPages`.
- **The Events Calendar / Tribe Events:** `GET /wp-json/tribe/events/v1/events` (add `?per_page=50&page=1&start_date=YYYY-MM-DD`). Self-documenting schema at `/wp-json/tribe/events/v1/doc`. Single event `/wp-json/tribe/events/v1/events/{id}`; venues `/wp-json/tribe/events/v1/venues`. The response body carries `events[]`, `rest_url`, `total`, `total_pages`, and (when more pages exist) `next_rest_url`/`previous_rest_url` — confirmed by the TEC knowledgebase sample response. Geo: events carry venue address; filter by `venue`, `categories`, `tags`. **iCal (Tier 4 fallback):** `/events/list/?ical=1` and custom export `/events/list/?ical=1&custom=1&start_date=YYYY-MM-DD`; webcal form `?post_type=tribe_events&ical=1&eventDisplay=list`. Each event detail page also emits JSON-LD `@type: Event`. Watch the auth trap: an empty `{"total":0,...}` body can mean "authentication required," not "no events."
- **Events Manager:** main iCal feed at `/events.ics` or `/?ical=1` (equivalent to its RSS feed).
- **WP Event Manager (with REST API addon `wpem-rest-api`):** namespace under `/wp-json/wpem/`; data API for events. Some custom builds expose `/wp-json/wpevents/v1/events`. Note the official addon's events read can be tied to an API key for app use — verify it returns data unauthenticated before relying on it.
- **admin-ajax fallback:** legacy plugins push list data through `POST /wp-admin/admin-ajax.php` with an `action` param; watch for it in XHR if no REST route exists.

**Squarespace (fingerprint: `static1.squarespace.com` assets, `Squarespace` in source):**
- Append `?format=json` or `?format=json-pretty` to **any** collection URL, including the events page: `/events/?format=json-pretty`. Returns `collection` + `items[]` with event fields. The events list feed is typically `/calendar/?view=list&format=json` (or `/events/?view=list&format=json`).
- Caveats: paginates ~20 items with a `pagination` offset (loop it); responses are heavy (include `website`, `websiteSettings`, etc.); and Squarespace's own developer documentation warns that "Using `?format=json-pretty` is not static and should not be used as an alternative to our APIs." Treat it as Tier 3 (app-state JSON) and re-verify on each run.

**Wix (fingerprint: `static.wixstatic.com`, `wix-warmup-data`, `X-Wix-*` headers):**
- Wix Events data is served through internal `/_api/...` endpoints the page calls at runtime (visible only in XHR); there is no stable, documented public REST path for an arbitrary site without the site owner's API keys/OAuth. Treat Wix as **likely Tier 5 / DROP** unless the events page itself is server-rendered or emits JSON-LD — confirm via the Step-1 Response test. Check for an embedded `wix-warmup-data` JSON blob in the initial HTML as the one static-fetch escape hatch.

**Webflow (fingerprint: `assets.website-files.com`/`*.webflow.io`, `w-dyn-item`/`w-dyn-list` classes, `data-wf-` attributes):**
- Webflow CMS lists are **server-rendered into the static HTML** as `.w-dyn-list` → `.w-dyn-item` collection items — scrape these directly (Tier 4), and read any CMS data bound into `data-*` attributes. The Data API (`api.webflow.com`) requires an API token (DROP under no-auth), so do **not** rely on it; the published HTML is the open surface. Check event detail pages for hand-added JSON-LD.

**Shopify (fingerprint: `cdn.shopify.com`, `/cart.js`, Shopify cookies):**
- `GET /products.json?limit=250&page=N` and `GET /collections/all/products.json` — public, no auth, paginates 250/page (events sold as products appear here). Collection-scoped: `/collections/{handle}/products.json`. Per-product: `/products/{handle}.json`. Each product page also embeds JSON-LD. Some stores disable `/products.json` (404) — fall back to server-rendered `/collections/...` HTML or the `.myshopify.com` subdomain. Note: currency is not in the JSON; date/venue live in product metafields or the description, so confirm the pipeline fields are actually present before PASS.

**BiblioCommons (fingerprint: `*.bibliocommons.com` subdomain, "Powered by BiblioCommons" footer, NERF version string):**
- Public events HTML at `https://{library}.bibliocommons.com/v2/events` (filterable `?locations={code}&page=N`) is **fully server-rendered** — title, date, location, per-event `/v2/events/{id}` URL, and pagination are all in the raw HTML (not a headless DROP).
- **However, the BiblioCommons Terms of Use prohibit automated HTML harvesting.** The terms (e.g., `surrey.bibliocommons.com/info/terms`) bar users from "use any automated system to harvest or capture any BiblioCommons Content … from the BiblioCommons Service, except as may be specifically permitted using RSS/XML feeds." The compliant PASS path is therefore the **public RSS feed `https://{library}.bibliocommons.com/events/rss/all`** — no API key, parseable XML with `title`, `link`, `start_date`, `end_date`, `location`, audience category. (Community tooling reports the feed window is capped at roughly the next 6 months / 2000 events and refreshes about hourly; treat those exact figures as unconfirmed by an official BiblioCommons source and verify against the live feed.)
- The official Events API `https://api2.bibliocommons.com/v1/{LIBRARY_ID}/events` requires a private `x-api-key` issued only to customer libraries → **DROP under the no-partnership constraint.** This is the canonical false-negative trap: the API is gated, but the RSS feed on the same domain is wide open.

**Red61 (festival/venue ticketing, fingerprint: VIA endpoints, Edinburgh Fringe–style storefronts):**
- Red61's "VIA" API is a licensed integration (API licence + dictionary, partner-issued endpoint and password) → **DROP under no-partnership.** The open surface is the **white-label web sales storefront**: check whether the hosted storefront pages are server-rendered (scrape Tier 4) or emit JSON-LD, and whether the festival's own site pulls a static feed. Do not pursue the VIA API.

**Drupal (fingerprint: `X-Generator: Drupal`, `Drupal.settings`, `/sites/default/files/`, `X-Drupal-Cache`):**
- **JSON:API (core, often on by default):** `GET /jsonapi` lists resources; events as a content type: `/jsonapi/node/event` (filter `?filter[...]`, paginate `?page[offset]=0&page[limit]=50`). Standardized JSON:API envelope with `data[]` and `links`.
- **Views REST export:** a site-defined path returning JSON, commonly `/api/...` or `/rest/...` (e.g., `/api/events`, `/api/v1/events`) — discover via sitemap/robots or by watching XHR. The **JSON:API Views** module exposes `/jsonapi/views/{viewId}/{displayId}`.
- Core REST module endpoints (`?_format=json`) on individual nodes: `/node/{id}?_format=json`.

**Localist (universities & municipalities, fingerprint: `*.localist.com` or a campus calendar subdomain, "Powered by Localist"):**
- **REST/JSON (Tier 1, public, read-only, no key for public data):** `GET https://{calendar-domain}/api/2/events` → JSON. Filters: `?days=N`, `?start=YYYY-MM-DD&end=YYYY-MM-DD`, `?group_id=`, `?venue_id=`, `?type[]=`, `&pp=N`. Per the Localist/Concept3D help docs, "Calls will pull 10 items per page by default, but can be increased to up to 100 per page," and "The maximum date range that the API call pull from is 370 days from today or the start date you specify." Filter IDs enumerated at `/api/2/events/filters`. The current API version resolves at `/api/2/`.
- **iCal & RSS:** `.ics` and RSS feeds are available throughout the platform via subscribe URLs (the ICS/RSS feed on any filtered results page). **CSV** is generatable via the API as a static file.
- Geo by design: `venue_id`/`group_id` give clean regional filtering.

**Joomla (fingerprint: `generator` = `Joomla!`, `/media/jui/`, `option=com_` URL params):**
- **JEvents:** iCal export via the list view with `?ical=1` (events URL slug + `list/`); advanced exports add `&custom=1&year=` / `&start_date=` / `&category=`. JEvents also outputs **JSON-LD** into the page `<head>` per event. Components reachable via `index.php?option=com_jevents&...`.
- **JCal Pro / other:** look for `option=com_jcalpro` and an `.ics` export from the calendar view.
- No universal Joomla REST for events; the iCal/JSON-LD surfaces are the reliable static paths.

**Social platforms (Facebook Events, Instagram, Meetup per-group, Eventbrite organizer pages):**
- **Login-walled social platforms (Facebook Events, Instagram):** all event data is behind authentication — DevTools will show API calls that require session tokens or OAuth. These are **DROP under the no-auth constraint**. Events from these platforms may enter the pipeline via a **manual intake path** (e.g., a weekly editor submission form or a watched folder) — record this in the documentation template rather than leaving the source as an unexplained gap. Do not attempt to replicate session tokens or scrape logged-in views.
- **Meetup — geo-discovery surface vs. per-group iCal:** the per-group iCal export (`meetup.com/{groupname}/events/ical/`) is capped at ~10 events and is the obvious-but-wrong surface. The search/discovery page (`meetup.com/find/{location}/`) carries a `__NEXT_DATA__` blob with multiple overlapping event arrays (Tier 3) — typically 30–70 unique events after deduplication, spanning a 3-week forward window. Always probe the discovery page in addition to the per-group surface before issuing any verdict on Meetup.
- **Eventbrite organizer pages** (`eventbrite.com/o/{organizer-slug}/`) are an individual-organizer surface — useful for specific venues but narrow in scope. The platform-wide geographic discovery endpoint (`eventbrite.com/d/{country}--{city}/all-events/`, internal `city-browse` API) is the higher-yield surface for a metro-level pipeline. Probe both.

**Aggregators as geo-discovery sources (Eventbrite, AllEvents, Bandsintown, Songkick):**
Some platforms are more useful as *geographic event aggregators* than as individual venue sources — their city-level search surfaces return events from many venues in a single call, making them higher-leverage than probing each venue site individually. This is a distinct integration pattern:
- The relevant surface is the platform's **city/region search or discovery page**, not an organizer or venue profile.
- DevTools on the search/discovery page will typically reveal a direct JSON/REST endpoint parameterized by city or geo-coordinates — this is a Tier 1 win regardless of whether the platform has a documented public API.
- Yield is much higher (hundreds of events per call) but geo-filtering is required downstream, since the platform's city-level granularity may be broader than the pipeline's target region (e.g., Eventbrite's York Region place_id returns events across the whole region, not just Vaughan).
- **Document the discovery-page URL and the geo parameter separately from the CMS-probe workflow** — this pattern doesn't follow the standard surface checklist (there's no "primary events page for a venue") and should be evaluated as its own source type.

For **every** CMS: the signal that identifies it (header/meta/asset path) determines which endpoints to probe, and the response when data is present is a populated JSON/XML/iCal body carrying the four pipeline fields — not a `200` with an empty array.

---

# 4. HARD EVIDENCE STANDARDS

## PASS verdict — confirmed and production-ready

A PASS requires **all** of the following, each evidenced with a captured sample, not asserted:

- **Required fields present in the response body:** event **title**; a machine-parseable **date/time** (ISO 8601 preferred, e.g., `2026-07-21T19:00-05:00`; a date-only value is acceptable if time is genuinely absent); a **location** with **city at minimum** (street address preferred); and a per-event **URL**. Paste a real sample record showing all four.
- **Geo-filter confirmability:** either (a) location data is present in the machine-readable output (a `location`/`venue` object with city or address, or lat/lng), or (b) the source is region-specific by design (a single-metro venue/library/municipal calendar). Show the exact field or the exact filter parameter (e.g., Localist `venue_id`, Tribe `categories`, a city-scoped subdomain) you will use to filter to the metro.
- **Volume / yield signal:** a credible non-trivial count of upcoming events. Capture the total — `total`/`total_pages` (Tribe), `X-WP-Total`, the RSS item count, the Localist result count, or a counted scrape of page 1. A feed returning a handful of stale or far-future-only items is a HOLD, not a PASS.
- **Pagination / completeness evidence:** demonstrate you can retrieve the full set, not just page 1. Capture the pagination mechanism working — `next_rest_url`/`page=2` (Tribe/WordPress), `page[offset]` (JSON:API), `&pp=&page=` (Localist), the RSS feed window. Note any cap (Localist 370-day; BiblioCommons RSS window) so the newsletter window is known to be covered.
- **Structural stability for a weekly fetch:** the source is one of (in order of preference) a documented REST/JSON API (Tier 1), a schema.org JSON-LD block in the *raw* server HTML (Tier 2), an app-state JSON blob in the raw HTML (Tier 3), or server-rendered HTML with stable class/structure (Tier 4). Data must persist long enough for a weekly cron (not published-then-deleted within hours). No headless browser required at any point.
- **Constraint compliance:** reproducible via plain HTTP (Copy-as-cURL works without browser session state); no authentication, API key, or partnership agreement required; and not contractually prohibited (check Terms of Use — e.g., prefer the BiblioCommons RSS feed over HTML harvesting).

## DROP verdict — required negative evidence

A DROP requires **specific, documented negative evidence at each tier**, not "we couldn't find anything":

- **Exhaustion of all surfaces (per §1 and §6):** a completed checklist showing each surface type was probed with the method attempted and the literal result. "Events page is a JS widget" alone is never sufficient.
- **Negative signal at each tier, captured:**
  - Tier 1: API roots probed (`/wp-json/`, `/api/2/`, `/jsonapi`, `/api/`, `/graphql`) and returned 404/empty/irrelevant — paste the responses.
  - Tier 2: event detail pages contain no `@type: Event` JSON-LD in the **raw** Response (not just absent from the live DOM).
  - Tier 3: no `__NEXT_DATA__`/`__INITIAL_STATE__`/`__NUXT__`/warmup blob with event data in the raw HTML.
  - Tier 4: server-rendered HTML has no stable, parseable event structure (or HTML harvesting is contractually prohibited and no feed exists).
  - Feeds: RSS/Atom/iCal paths probed and absent or empty.
- **Headless-dependency confirmation:** prove the data exists only after JS execution — the raw **Doc Response** is an empty `#root`/`#app` shell, the event content appears only in the live Elements DOM, and the XHR that would supply it either doesn't exist, isn't reproducible via cURL, or itself requires a browser-only token. Disabling JavaScript (or a curl fetch) yields no event data. This is the only basis for a Tier 5 DROP.
- **Authentication-required confirmation (vs. a default login redirect):** confirm the endpoint genuinely needs auth, not that you hit a generic login page. Evidence: the documented endpoint returns `401`/`403` or an empty payload *with an explicit auth context* — for example, The Events Calendar documents that an attendees query "without authentication, a site with attendees will still return" `{"rest_url":".../attendees/","total":0,"total_pages":0,"attendees":[]}`, and BiblioCommons' `api2` requires a private `x-api-key`. Distinguish this from a `302` to `/login` that a different surface (RSS/public page) bypasses entirely. If any unauthenticated surface on the domain yields the data, it is **not** a DROP.
- **Ephemeral-content confirmation:** demonstrate instability across two fetches spaced apart — content present at fetch 1 is gone at fetch 2 within hours, or the feed only ever shows a rolling few-hour window with no durable event records. A stable but capped feed is NOT ephemeral (it's a PASS with a noted window).
- **"Argued past the check" anti-pattern — the single most common source of false negatives:** a plausible-sounding reason for *why* a surface would be a dead end is not the same as evidence that the surface *is* a dead end. Examples: "this platform caps iCal exports at 10 events, so DevTools won't help" (wrong — a different surface on the same domain may have no cap); "posts are ephemeral, so even if there's an API the content won't be there" (wrong — this was argued about a news/RSS layer while the ticketing storefront had persistent data all along). A DROP rationale is only valid if it describes the result of *running the check*, not the result of *reasoning about what the check would find*. If the documentation template's "Surfaces Checked" section has a line reading "not checked — expected to be a dead end," the DROP is invalid.

**HOLD** is the correct verdict when a surface is promising but unconfirmed (e.g., a JSON endpoint found but pagination not yet verified, or a feed with suspiciously low yield) — never silently DROP a HOLD.

---

# 5. DOCUMENTATION TEMPLATE

Fill this in for every source before recording a verdict. It is designed to be completed live during the probe. Copy the block per source.

```markdown
## Source Evaluation: [Source Name]

### Source Metadata
- Source name:
- Primary URL:
- Domain / subdomains in scope:
- Metro region(s) this source covers:
- Date of evaluation:
- Evaluator:

### Platform / CMS Identification
- CMS / platform (and how identified — header / generator meta / asset path / cookie):
- Version (if exposed):
- Theme/plugin/module relevant to events (e.g., The Events Calendar, Localist, JEvents):

### Surfaces Checked
(One entry per surface; record METHOD attempted and literal RESULT for each.)
- Homepage / root: method → result
- Primary events/calendar page: method → result
- Search / discovery page: method → result
- Category / tag page: method → result
- Event detail page(s): method → result
- Organizer / venue profile page: method → result
- API root(s) probed (list exact paths): method → result
- Feed paths probed (RSS / Atom / iCal — list exact paths): method → result
- App-state JSON in raw HTML (__NEXT_DATA__ etc.): method → result
- Ticketing subdomain / storefront: method → result
- CDN-hosted data files: method → result
- Sitemap / robots.txt: method → result
- Third-party catalogue/aggregator subdomain: method → result
- Other surfaces:

### Method Found (the chosen integration)
- Tier (1–5):
- Exact endpoint / path / URL:
- Request details (params, headers, pagination knobs):
- Sample response — required fields present (paste a real record):
  - title:
  - date/time:
  - location (city / address):
  - event URL:
- Reproducible via plain cURL without browser session? (Y/N + note):

### Yield Estimate
- Approx. event volume per week / per fetch window:
- Total available (from total_pages / item count / counted):
- Geo-coverage and exact geo-filter mechanism (field or parameter):
- Known caps / windows (e.g., 370 days, 6 months, first 1000):

### Tier Classification + Justification
- Assigned tier and why this tier (not a higher or lower one):

### Verdict
- [ ] PASS   [ ] DROP   [ ] HOLD

### Verdict Rationale
(For PASS: which fields/volume/pagination/geo/stability/compliance criteria were met, with evidence.
 For DROP: the per-tier negative evidence and which exhaustion/headless/auth/ephemeral standard was satisfied.
 For HOLD: exactly what is unconfirmed and what would resolve it.)

### Revision Triggers
(What specific change forces re-evaluation — e.g., platform migration off WordPress; The Events Calendar plugin added/removed; switch to a Next.js/React headless frontend; layout/class redesign of the scraped HTML; feed cap change; Terms-of-Use change; API key newly required.)

### Evaluator Notes
(Anything that didn't fit above — TOU caveats, rate limits, redirect quirks, partial JSON-LD, etc.)
```

---

# 6. PROOF-OF-EXHAUSTION STANDARD

A DROP is only bulletproof when the following minimum bar is met and documented. Anything short of this is a methodology miss waiting to surface as a false negative.

- **Minimum surface count: at least 8 distinct surface types** from §1 must be probed and recorded, and these **must** include — non-negotiably — the homepage/root, the primary events page, at least one **event detail page**, at least one **search/category** page, the **API roots** (`/wp-json/`, `/api/2/`, `/jsonapi`, `/api/`, `/graphql`), the **feed paths** (RSS/Atom/iCal), and any **third-party/ticketing subdomain** in play. A DROP that checked only "the events page" is invalid on its face.
- **Minimum method diversity: at least 3 of the 5 tiers must have been actively attempted** with captured negative results — concretely, you must have (1) probed for a Tier 1 API, (2) inspected the raw HTML for Tier 2 JSON-LD *and/or* Tier 3 app-state JSON, and (3) evaluated Tier 4 server-rendered HTML (and feeds). You cannot jump from "no obvious API" to DROP.
- **Mandatory CMS-identification step:** you **must** positively identify the platform (or positively establish it is bespoke/unidentifiable after checking generator meta, headers, asset paths, and cookies) **before** a DROP is permitted. CMS identity unlocks specific probe paths — declaring a DROP without knowing whether the site is WordPress (→ `/wp-json/tribe/...`), Localist (→ `/api/2/events`), Drupal (→ `/jsonapi`), or BiblioCommons (→ `/events/rss/all`) means you have not actually finished probing.
- **A completed exhaustion checklist looks like:** the filled §5 "Surfaces Checked" block with a literal method+result on every line; the platform named with its evidence; the per-tier negative captures from §4's DROP standard (API 404s/empties, no raw-HTML JSON-LD, no app-state blob, no parseable HTML/feed); and, where the DROP rests on headless-dependency, the empty-shell Response capture plus the JS-disabled/cURL confirmation; where it rests on auth, the explicit auth-context capture plus confirmation that no public surface bypasses it; where it rests on ephemerality, the two-fetch instability capture.
- **Distinguishing "I checked everything" from "I checked everything accessible without headless":** state this explicitly in the rationale. The DROP is a statement about **static-fetchability under the hard constraints** (no headless, no auth/partnership, weekly-stable, contractually permitted) — **not** a claim that the site has no event data. A site can be rich with events and still be a legitimate DROP because the only access path is a headless-rendered SPA, a partner-gated API, or contractually prohibited HTML harvesting. Naming which constraint triggered the DROP (and noting that the data exists but is out of reach) is what makes the verdict honest and the revision trigger actionable — if the constraint changes (e.g., headless becomes allowed, or a key is obtained), the source returns to evaluation.

## Recommendations

- **Stage the probe in the blind-first order: curl pass → CMS identification → CMS-specific endpoint probe → DevTools for anything unresolved.** This catches the high-value Tier 1/2 sources (REST APIs, RSS/iCal, JSON-LD) before you ever spend time in the browser, and it forces the mandatory CMS-ID step early. The threshold to escalate to DevTools: only when the blind probe leaves the four pipeline fields unconfirmed.
- **Default to the feed or API tier over HTML scraping wherever both exist**, even if the HTML scrape looks easy — Tier 1/2 sources survive redesigns that break Tier 4, and (as with BiblioCommons) the feed is often the only contractually clean path.
- **Treat any single blocked or JS-only surface as a HOLD, never a DROP, until §6's minimum bar (8 surfaces, 3 tiers, CMS identified) is met.** The whole methodology exists to prevent the one-dead-surface false negative.
- **Record revision triggers for every PASS, not just DROPs** — a PASS source that migrates from WordPress to a headless React frontend, or whose plugin is removed, silently becomes a broken feed; the trigger list is what makes the weekly pipeline self-auditing.
- **Re-run a source's evaluation when:** the weekly fetch yield drops sharply or to zero; a `Link`/`X-Generator` header or generator meta tag changes; a previously-populated endpoint starts returning empty arrays or 401/403; or the source's Terms of Use change. Any of these flips the verdict back to HOLD pending re-probe.

## Caveats

- **Platform endpoints evolve.** Plugin and platform versions change paths and behavior; the documented paths here (e.g., Tribe `v1`, Localist `api/2`, BiblioCommons `api2 v1`) are current but version-bound — always confirm against the live `/wp-json/`, `/api/2/`, or `/jsonapi` discovery root rather than assuming.
- **Squarespace `?format=json` is explicitly disclaimed by Squarespace as non-static** and should be treated as a Tier 3 convenience that can change without notice — re-verify each run.
- **Server-rendered does not mean permitted.** Technical fetchability and contractual permission are separate axes; a DROP can be driven purely by Terms of Use even when the data is trivially scrapable, and a PASS must clear both.
- **Rate limits and anti-bot layers affect production reliability even on a confirmed PASS.** Localist's API terms ask callers to keep requests under roughly one per second; Shopify storefronts sit behind Cloudflare and return HTTP 429 under load; community BiblioCommons tooling references a ~5-requests-per-second API limit (not confirmed in an official BiblioCommons doc). Note observed limits per source so the weekly cron stays within bounds.
- **Wix and Red61 are the most likely legitimate DROPs** under the hard constraints (Wix events typically need internal `/_api` calls or owner keys; Red61's VIA API is partner-licensed), but per §6 they still require the full exhaustion check — confirm the public storefront/HTML/JSON-LD surfaces first.
- **The BiblioCommons RSS window figures (≈6 months / 2000 events, hourly refresh) come from community tooling, not an official BiblioCommons specification** — verify the live feed's actual horizon before relying on it to cover the newsletter window.