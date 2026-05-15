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

MD