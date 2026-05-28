# R5 Scope

**Owner:** Nathan  
**Deadline:** June 4  
**Roadmap:** `docs/NLAP_PostMVP_Roadmap.md`

**Read order:** this doc → `docs/source_decision_sheet.md` → roadmap (only if you need full release context).

**Tracking:** Tasks live in GitHub Issues #33 (W1), #34 (W2), #35 (W3). Close them as you go.

**Gates:**
- W1 must be reviewed with Ariel before W2 starts.
- The 3-vs-4 sources decision is a W1 → W2 handoff (see W1 task 4).

---

## W1 — Source Audit + Newsletter Config Design

**Effort:** ~3h  
**Prereq:** None  
**Blocks:** W2

---

### Context

Determines what gets built in W2. Cannot start W2 without W1 reviewed and signed off by Ariel.

---

### Tasks

1. **Tally:** Across the last 7 Vaughan issues, count events by source. Confirm Facebook % and which non-Facebook sources dominate. Source: Beehiiv archive or client's sent issues.

2. **Cross-reference two inputs:**
   - `docs/source_decision_sheet.md` — Ariel's audit of candidate URLs the client uses
   - Beehiiv clicks data (already analyzed 2026-05-13, see `data/beehiiv/clicks_analysis_2026-05-13.md`) — for which sources actually drive engagement

3. **Probe each non-Facebook source** for integration method, in priority order (same priority that applies in W2):
   1. iCal endpoint
   2. Undocumented API (browser dev tools → Network → XHR/Fetch)
   3. JSON-LD in HTML (`<script type="application/ld+json">`)
   4. HTML scraping (last resort — fragile)

4. **Pick 2–4 sources to integrate.** Decision rule:
   - 4 sources if all have iCal or undocumented API
   - 3 sources if any require HTML scraping
   - Document method + endpoint per source
   - Gate this decision with Ariel before W2

5. **Newsletter config:** Design how Vaughan-specific config (segments, geography Markham/RH/Vaughan, quotas, active sources) lives in R1 — Set node at top of workflow. No JSON config file, no `--newsletter` flag. Mississauga gets a cloned workflow at R8.

---

### Done When

- Source tally complete (counts per source from 7 issues)
- 2–4 sources picked with method + endpoint documented
- Vaughan config structure agreed with Ariel before W2 starts

**Tracked in:** #33

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

**Tracked in:** #34

---

## W3 — Facebook Manual Intake + Candidate Pool Checks

**Effort:** ~3h  
**Prereq:** W2 source branches live (so the intake handler can merge into the same Candidates upsert)

---

### Context

Facebook is 58% of click volume (Decision_Log § 18, `data/beehiiv/clicks_analysis_2026-05-13.md`). Automation is ruled out — TOS risk, so manual intake is the path. This week makes that intake idempotent and reliable, and adds the safety checks that catch pool problems before R3 allocation runs.

---

### Tasks

1. **Pick intake format.** Options: Airtable form (client fills weekly) or watched folder + CSV drop. Default to **Airtable form** unless reason to do otherwise — easier to validate at intake, no file-system dependency, no extra infra for client.

2. **Build intake handler.** Reads the drop zone, maps each entry to canonical Candidates schema (Title, StartDate, EndDate optional, Link, LocationName, City, Source = `"Facebook"`). Upserts via UniqueEventID (`title|date` format — see CLAUDE.md Data Rules).

3. **Test idempotency.** Submit same record twice → confirm no duplicate.

4. **Test with real sample.** Pull 3–5 sample Facebook events client has submitted before. Confirm they flow through R2 classification correctly.

5. **Pre-R3 pool count check.** Before R3 allocation runs, hard-flag if eligible candidates < minimum viable threshold. Threshold: 75 (rationale in task 7).

6. **Facebook 0-submission detection.** In each run, count Facebook records. If 0 and 8+ days since last Facebook submission, flag in run log.

7. **Candidate-to-slot ratio gate.** 25 slots total (5 segments × 5). If eligible pool < 75 (3:1 ratio), flag as go/no-go before R6 — scoring is cosmetic at low pool sizes.

---

### Reliability note (context, not a task)

Facebook drives 58% of click volume. If the client misses a weekly submission, the affected issue loses more than half its click potential. The 0-submission check catches misses after the fact — earlier signal is a future improvement, not in scope for R5.

---

### Done When

- Client can submit Facebook events manually; pipeline processes them identically to automated sources
- Idempotency confirmed (rerun does not duplicate)
- Pool count, Facebook 0-submission, and candidate-to-slot ratio checks all in place and tested

**Tracked in:** #35
