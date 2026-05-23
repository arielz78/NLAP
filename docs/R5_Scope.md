# R5 Scope

**Owner:** Nathan  
**Deadline:** June 4  
**Roadmap:** `docs/NLAP_PostMVP_Roadmap.md`

W1 and W3 scopes coming. This doc currently covers W2 only.

---

## W2 — Source Integration + Multi-Tenant Plumbing + Integrity Guards

**Effort:** ~5h  
**Prereq:** W1 source audit complete and reviewed with Ariel before starting

---

## Context

All source ingestion stays in n8n (R1 workflow). New sources are added as additional branches — not Node.js scripts. Use native n8n nodes where available, Code nodes for anything without a native integration.

Read the updated R1 workflow and GitHub issue #34 before starting.

---

## Source Integration

### Priority order per source

Probe each source in this order. Stop at the first method that works.

1. **iCal** — HTTP Request node to `.ics` URL. Easiest. If the site has it, done in under an hour.
2. **Undocumented API** — Open browser dev tools → Network tab → filter XHR/Fetch → load the events page and watch what API calls the site makes. If you find a JSON endpoint, use that URL directly in n8n via HTTP Request node. Reference: see how Eventbrite is implemented in the current R1 workflow — same pattern.
3. **JSON-LD embedded in HTML** — Many event sites embed structured data in `<script type="application/ld+json">` tags. HTTP Request + Code node to extract.
4. **HTML scraping** — Last resort. Fragile, breaks on redesigns. Only use if nothing else works.

### How many sources

- **4 sources** if W1 confirms all have iCal or undocumented API endpoints
- **3 sources** if any require HTML scraping — don't let one hard source eat the budget

Gate this decision with Ariel after W1 before starting W2.

### Implementation

Each new source is a separate branch in R1, merging into the existing Candidates upsert node. Structure:

```
[Source Trigger] → [Fetch Events] → [Normalize to Candidates Schema] → [Merge]
```

Map all sources to the canonical Candidates schema before the merge node. Fields required: Title, StartDate, EndDate (if available), Link, LocationName, City, Source.

---

## Newsletter Config Scoping

Add Vaughan config to R1 as a Set node at the top of the workflow. Config covers: segments, geography (Markham / Richmond Hill / Vaughan), quotas, active sources. Mississauga gets its own workflow clone at R8 — no flag or JSON file needed now.

---

## Integrity Guards

### Recurring events (Debt #8)
Use EndDate to gate expiry when EndDate is present, rather than StartDate. Prevents active recurring events from falling outside the date window.

### Source normalization (Debt #5)
Add a Set or Code node that maps domain → readable source name (e.g. `inoreader.com` → `McMichael RSS`). Consistent naming feeds into R6 scoring weights.

### Pre-R2 schema validator
Hard-reject records missing StartDate, Link, or Title before they hit R2. Write typed rejection reasons to execution log output:
- `MISSING_DATE`
- `MISSING_LINK`
- `MISSING_TITLE`

### Airtable retry
Confirm the R1 n8n upsert node has retry enabled. The Node.js scripts already have Retry-After header backoff (added 2026-05-21) — make sure the n8n side matches.

---

## Done When

- 3–4 new sources live as branches in R1 n8n workflow
- All new sources map to canonical Candidates schema
- Newsletter config scoped in R1 Set node (Vaughan only)
- Recurring events no longer dropped incorrectly
- Source names consistent across all records
- Invalid records rejected with typed reasons at ingestion
- Rerun does not duplicate (idempotency confirmed)
- New candidates flow through R2 classification correctly
