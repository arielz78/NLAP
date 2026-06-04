# NLAP Decision Log
*Last updated: 2026-06-04*

This document records the reasoning behind every significant design and editorial decision in the pipeline. It is intended to be read by anyone who needs to understand not just what the system does, but why it works the way it does — including future collaborators (Nate) and future-you after time away.

---

## 1. Pipeline Overview

The Vaughan Brief is a weekly newsletter covering local events in the Vaughan/Richmond Hill/Markham area. The audience is roughly 75% women, ages 35–60. The most popular section is For Families.

The automation pipeline handles the full process from event discovery to draft newsletter content:

| Stage | Tool | What it does |
|-------|------|--------------|
| **R1** | n8n | Ingests events from RSS feeds and Eventbrite. Deduplicates. Writes to Candidates table. |
| **R2** | n8n | Classifies each candidate into a segment using GPT-4o. Flags low-confidence records for human review. |
| **R3** | Node.js | Allocates approved candidates to newsletter issues. Enforces quotas, date windows, venue diversity. Writes IssueItems. |
| **R4** | Node.js | Generates blurbs (DisplayTitle, Description, CTA) per IssueItem using gpt-5.4-nano. Exports 5 HTML snippets for paste into Beehiiv. |
| **R5–R8** | Node.js | Post-MVP: source expansion, scoring, classification quality, handoff. See NLAP_PostMVP_Roadmap.txt. |

R1 and R2 are in n8n because they're straightforward data pipelines (fetch → transform → write). R3 was moved to Node.js because the allocation logic — date windowing, quotas, venue diversity, slot-aware reruns — is complex enough that n8n's node-based flow would be harder to reason about and test than plain code.

---

## 2. Data Model

### Candidates table
The central working table. Every event that enters the pipeline becomes a Candidate record.

Key fields:
- **UniqueEventID** — primary deduplication key. Format: `lowercase(title)|YYYY-MM-DD`. Used by R1's upsert node to prevent the same event from being ingested twice.
- **Status** — `New` (just ingested), `Approved` (eligible for allocation), `Rejected` (excluded permanently). R1 only sets `Status = New` on insert; it never overwrites an existing Approved or Rejected status. This protects manual editorial decisions from being reset by reruns. **`Status = Rejected` is the functional equivalent of deletion** — records are never actually deleted from Airtable. Rejecting a record permanently excludes it from all views and allocation.
- **R2Status** — `Pending` (not yet classified), `Enriched` (classified successfully), `NeedsReview` (low confidence, needs human triage).
- **SegmentSuggested** — the segment assigned by R2 classification.
- **LLM_Rationale** — the reasoning GPT-4o provided when assigning a segment. Useful for understanding why a record was classified a certain way, and for auditing misclassifications over time. If filled, it means it went through MAM (message a model) node in R2 n8n run. If empty, event was classified based on keyword match.
- **Score_Final** — intended for ranking candidates within each segment. **Not yet implemented** — all records currently have 0 or null. See section 6.
- **NeedsReview** — boolean. Set to true when R2 confidence < 0.5 OR when R2 cannot assign a segment at all. Marks records that require human judgment before they can be allocated.
- **Last Auto Update** — timestamp written by R1 on every upsert. Sort Candidates by this field descending to see exactly which records the most recent R1 run touched. If the count is lower than expected, records were dropped before reaching the upsert — either failed the Validity Filter (missing URL or date) or fell outside the 30-day DateWindow. Dropped records mean R1 fetched them from the source but could not write them to Airtable, so the candidate pool is smaller than the source actually contains. Was not populated before 2026-05-20.
- **Lock** — on IssueItems (not Candidates). See section 5.

### Important: the pipeline is append-based
Records are never deleted — only created or updated. If you delete a Candidate record and rerun R1, R1 will re-ingest the event as a brand new record with `Status = New`, losing any classification or editorial decisions that were on the deleted record. **Do not delete Candidates.** Use `Status = Rejected` instead.

### Issues table
One record per newsletter issue. Created manually in Airtable before each R3 run.

Fields: IssueDate (Thursday), City, Status, SelectionNotes (written by R3 after allocation — shows quota fill per section).

### IssueItems table
One record per allocated event slot. Output of R3, input to R4.

Each IssueItem links to one Issue and one Candidate. Also stores denormalized fields (CandidateStartDate, CandidateURL) for quick reference without clicking through to the Candidate.

---

## 3. Deduplication

**Decision: deduplicate on UniqueEventID (`title|date`), not URL.**

Early versions matched on URL. This failed because the same real-world event can appear with different URLs (e.g. Eventbrite `.com` vs `.ca` domains, different tracking parameters, reshared links). Matching on URL caused genuine duplicates to slip through and created records for the same event that could both be allocated.

UniqueEventID was introduced as `title|date|source`, then simplified to `title|date` in April 2026 when we confirmed source added no deduplication value and was inconsistently populated. The migration script (`updateUniqueEventIDs.js`) updated all 189 existing records.

**Limitation:** UniqueEventID is case-insensitive (`lowercase(title)`) but doesn't account for minor title variations (e.g. "Vaughan Spring Fair" vs "The Vaughan Spring Fair"). Pre-existing duplicates from before the UniqueEventID system existed were cleaned manually. New ingestion should not create new duplicates.

**Manual duplicate resolution protocol:** When two records represent the same real-world event:
- Correct date wins (use the actual event date, not the publish/creation date)
- Richest content wins (keep the record with the most complete description)
- Set `Status = Rejected` on the losing record — do not delete it

---

## 4. R2 Classification

### Segments
There are 4 auto-classified segments:
- **For Families** — family-friendly events, activities for kids with parents
- **For Couples** — date-night experiences, adult activities for two
- **For Golden Age Readers** — seniors-focused programming
- **Local Aroma** — food/drink experiences, including hands-on cooking or tasting classes at a venue

**Trust Me Recipe is never auto-classified.** It's a curated recipe section — not an event. It was removed from the classifier entirely and is always allocated manually.

### R2 internal flow
R2 does not send every record to GPT-4o. The flow is:

1. Search Records node fetches all Candidates where `R2Status = Pending` — this is the complete reprocessing guard. Any record R2 has already touched (Enriched or NeedsReview) will never be reprocessed on rerun.
2. Rules-based classification node evaluates each record using keyword logic. High-confidence matches exit here — R2Status set to Enriched, no LLM call made.
3. Low-confidence records (or unknown segment) are passed to GPT-4o for classification.
4. LLM either upgrades to Enriched or marks as NeedsReview based on the 0.5 confidence threshold.

This means GPT-4o is only called for ambiguous records, keeping costs down.

### Why GPT-4o at temperature 0.2
Classification requires consistent, rule-following behavior, not creativity. Low temperature reduces variance. GPT-4o was chosen over GPT-4o-mini because the classification quality difference was meaningful for this use case (debt item #13 tracks a future evaluation of GPT-4o-mini).

### NeedsReview threshold
If R2 classification confidence < 0.5 **or if R2 cannot assign a segment at all (null segment)**, the record is flagged as NeedsReview = true. These records are held out of the eligible pool until a human reviews them.

**NeedsReview is a permanent queue, not a transient state.** After each R2 run, work through two queues in order:

**Queue 1 — R2 - To Enrich** (R2Status = Pending): Run R2. These are unprocessed records. R2 will classify them and move them out of this queue.

**Queue 2 — R2 - NeedsReview** (R2Status = NeedsReview, low confidence): Manually triage each record:
- Junk / B2B / non-GTA → set `Status = Rejected`
- Good event, segment is correct → set `Status = Approved`, `R2Status = Enriched`, uncheck NeedsReview
- Good event, segment is wrong → correct SegmentSuggested manually, then set `Status = Approved`, `R2Status = Enriched`, uncheck NeedsReview
- Unsure, want R2 to retry → reset `R2Status = Pending` (R2 will re-classify on next run)

**Open reconsideration (deferred):** Once 4–6 weeks of data exists, review the NeedsReview false negative rate. If the queue is mostly junk, replace manual review with auto-reject (Status = Rejected when confidence < 0.5 in the LLM Update Node).

### B2B / civic / non-GTA events
**Decision: reject all, no exceptions.** Confirmed in client meeting April 3, 2026. Rationale: the newsletter audience is consumers looking for personal activities, not professionals or community stakeholders. Including civic/B2B events would dilute editorial trust and segment coherence.

---

## 5. R3 Allocation

### Date window
**Each issue covers events starting IssueDate+1 through IssueDate+10 (inclusive).**

Example: April 9 issue → events starting April 10–19.

Rationale: events starting on the publish day itself (Thursday) give readers no time to plan. The 10-day window gives sufficient lead time while keeping content relevant and not too far out. Confirmed with client April 3, 2026.

**Edge case — recurring events (Debt #8):** RSS feeds publish the series start date as the event date. If a recurring event started months ago, its start date falls outside the window and R3 won't place it — even if the event is still actively running. Fix (not yet implemented): use EndDate to gate expiry when EndDate is present, rather than StartDate.

### Quotas
| Section | Slots |
|---------|-------|
| For Families | 5 |
| For Couples | 5 |
| For Golden Age Readers | 5 |
| Local Aroma | 5 |
| Trust Me Recipe | 1–2 (manual only) |

Trust Me Recipe is never auto-allocated. Its slots are filled manually by the editor.

### Candidate selection order
Within each section/issue, candidates are ranked by **Score_Final descending**. Ties are broken by **Start Date ascending** (sooner start = more urgent to feature).

**Current state:** Score_Final is not implemented. All values are 0 or null. Effective sort is therefore earliest Start Date within the window. This is the live behavior as of April 2026.

### Venue diversity
**Max 1 appearance per venue per section per issue.** A blank LocationName always passes through (no venue = no conflict). Confirmed with client April 3, 2026. Rationale: if the same venue appears 5 times in For Couples, the section reads as an ad, not a curated list.

### Lock mechanism
Each IssueItem has a `Lock` checkbox field. A single checkbox protects the entire record from reruns across both R3 and R4.

**R3 — Slot assignment (`connectAirtable.js`)**
- Lock = false: R3 owns this slot. On every rerun, all unlocked IssueItems are deleted and reallocated fresh.
- Lock = true: R3 skips this slot entirely — the event assignment survives all reruns.

**R4 — Blurb generation (`generateBlurbs.js`)**
- Lock = false: R4 overwrites DisplayTitle, Description, and CTA on every run.
- Lock = true: R4 skips this item entirely — not sent to the LLM, not written to Airtable.

**When to lock:** After editorial review, once you've confirmed the slot assignment and are happy with the blurb. Lock protects both.

**R3 rerun behavior (as of April 12, 2026 fix):** On each run, the script deletes all unlocked IssueItems, then runs the allocator with only locked items as the starting state, then writes a fresh batch. Before this fix, the script tried to seed slot counters from existing items — this was fragile and caused duplicate entries when IssueDate mapping failed.

**Past issue preservation:** R3 only allocates to Issues where IssueDate >= today. Past issues are excluded from `fetchIssues()` entirely. Past issue IssueItems are also invisible to R3 — `fetchExistingIssueItems()` skips any IssueItem whose linked Issue is not in the current issue map. This means past IssueItems are never deleted and never reallocated, regardless of their Lock status. They are preserved as-is for historical reference.

### No-allocation fallback
If a section can't fill its quota (not enough eligible candidates), R3 writes a SelectionNotes message to the Issues record flagging which sections are under-quota and by how much. There's no automatic fallback behavior — the editor reviews and decides whether to pull from outside the window or hold the slot.

---

## 6. Score_Final

Score_Final ranks candidates by quality within each segment — so the best events get allocated first, not just the earliest ones.

**Status as of 2026-05-10:** Not yet implemented. All records have Score_Final = 0 or null. Effective sort is earliest Start Date within the window. Implementation planned for R6 in the post-MVP roadmap.

**Prerequisite — offline backtest (R6-W4):** Before implementing scoring, run an offline backtest: what would earliest-date sort have picked vs what got featured vs what got clicks vs what editors locked. If scoring doesn't beat the trivial sort, simplify the formula before shipping.

**Signal hierarchy (editorial actions strongest; clicks weaker because exposure-biased):**
1. Locked/featured by editor (hard signal)
2. Repeat historical inclusion (same venue/organizer appeared in past issues)
3. SegmentConfidence (from R2 classification)
4. Recency fit (days between event start and issue date — 3–10 days = highest)
5. Source quality defaults (from config — Eventbrite = high, RSS = medium, manual Facebook intake = medium)
6. Segment click weight (set to 1.0 neutral until Beehiiv clicks CSV analysis produces real weights in R6-W4)

**Quality floor:** Score_Final must exceed 0.4 for auto-allocation. Records below threshold leave the slot empty rather than filling it with junk.

**SegmentConfidence floor:** Records below threshold go to NeedsReview instead of R3. Threshold value set from the R2 eval distribution (post-MVP prerequisite #1), not hardcoded at 0.6.

**Date spread constraint:** If all 5 slots in a section fall within the same 3-day window, R3 forces at least one slot from a different part of the issue window.

**ScoreSignalCount:** A field (0–5) tracking how many signals fired per candidate, for editorial transparency.

**Score_Final backfill:** Old records with Score_Final = 0 need a backfill pass after scoring is implemented; otherwise they silently sink to the bottom of the sort.

---

## 7. Airtable Views and Their Purpose

| View | Table | Filter | Purpose |
|------|-------|--------|---------|
| R2 - To Enrich | Candidates | R2Status = Pending | Input queue for R2. Run R2 against this view. |
| R2 - NeedsReview | Candidates | R2Status = NeedsReview, Status ≠ Rejected, Start Date > today | Human triage queue. Review and either approve, reject, or re-classify. |
| R3 - Eligible for Scheduling | Candidates | Status = Approved, NeedsReview = false, Start Date present and >= today, URL present | Sole input pool for R3. A candidate must pass all four filters to be allocatable. |

**Why `Status ≠ Rejected` on the NeedsReview view:** rejected records cluttered the triage queue and had no actionable value — the decision is already made.

**Why `Start Date > today` on the NeedsReview view:** expired events can never be allocated regardless of how they're classified. Triaging them is wasted effort.

**Why `Start Date >= today` and `URL present` on the Eligible view:** expired events can never be meaningfully featured (readers can't attend). Events without a URL can't be linked in the newsletter — including them would require manual intervention on every slot.

---

## 8. Weekly Operational Flow (overview)

1. **Run R1** — new events ingested, Status = New
2. **Run R2** — R2 - To Enrich view processed; records become Enriched or NeedsReview
3. **Triage R2 - NeedsReview** — manually review low-confidence records; reject junk, approve good events (see section 4 for full triage flow)
4. **Create upcoming Issue dates in Airtable** — manually add the next 3 Thursdays to the Issues table if not already present (IssueDate + City: Vaughan). R3 will only allocate to issues that exist in this table. (Debt #15 will automate this.)
5. **Run R3** — eligible candidates allocated to upcoming issues; IssueItems written
6. **Review IssueItems** — check SelectionNotes for under-quota sections; manually add Trust Me Recipe; lock any slots you've confirmed
7. **Run R4 (generateBlurbs.js)** — blurbs generated for all IssueItems; DisplayTitle, Description, CTA written to Airtable
8. **Editorial review in Airtable** — open IssueItems view, review and edit blurbs directly in Airtable
9. **Run pushToBeehiiv.js** — exports 5 HTML snippets, one per section
10. **Paste into Beehiiv** — paste each snippet into its HTML block; swap section images via native image widget; publish

Full SOP (step-by-step with edge cases) is a separate document — not yet written. Prerequisite: this decision log reviewed and approved.

---

## 9. Open Decisions

| Decision | Current state | What's needed to resolve |
|----------|--------------|--------------------------|
| Score_Final implementation | Planned for R6 (post-MVP); sort currently falls back to earliest start date | Offline backtest in R6-W4 first; then implement |
| NeedsReview auto-reject | Manual queue | 4–6 weeks of data to evaluate false negative rate |
| GPT-5-mini for R2 | Using GPT-4o | Test on 20 records in R6-W4 (Debt #13) |
| Issues table auto-creation | Manual | Planned for R8-W8 (Debt #15) |
| SegmentConfidence floor threshold | Mechanism designed (section 6); value TBD | R2 eval distribution (post-MVP prerequisite #1) |
| Quality metric definition (prereq #5) | Closed 2026-05-27 — see §16 | — |
| R6 regression role | Closed 2026-05-29 — regression is one-time weight-input analysis (R6-W4), NOT live model in production path. Backtest on frozen eval set is the validation step. See §28. | Closed. |
| R7 implementation mechanism | Confirmed 2026-05-28 — LinearSVC + TF-IDF on 2,729 Beehiiv labels. LLM as fallback. See §17. | Closed. |
| NLAP end-state intent (NLAP-only event source) | Closed 2026-05-28 — "mostly NLAP, one-offs from elsewhere." See §26. | — |
| Editor workflow (segment vs quality decoupling) | Closed 2026-05-28 — see §27 | — |
| Relationship between Step 2 editor picks and R3 script output | Open. Picks at R3-Eligible may inform Locks on R3-allocated IssueItems, may bypass R3 entirely, or may run in parallel. | Wait for R6 to ship and pick volume to be observable. |
| Multi-tenant base architecture | base-per-newsletter confirmed (section 15) | Closed 2026-05-20 |

---

## 10. R4 Output Format & Beehiiv Integration

### Blurb components (confirmed 2026-04-13)
R4 generates 3 separate components per IssueItem, stored as distinct Airtable fields:
- **DisplayTitle** — emoji + creative ~6-word title in Title Case. NOT the original event name verbatim. Rephrased to be engaging and specific. May use em dash for urgency or context (e.g. "– Last Chance", "– Free Admission"). Example: "🍁 Canada's Largest Maple Syrup Festival – Last Chance"
- **Description** — 10-word factual description (9–11 acceptable)
- **CTA** — unique 2–3 word call to action

`NewsletterBlurb` (a combined single-field preview) was initially written alongside the 3 components but removed on 2026-04-13 — it was redundant, went stale when components were manually edited in Airtable, and `pushToBeehiiv.js` reads the 3 fields directly. The 3 component fields are now the sole output.

### Output target
**Airtable is the editing layer.** Client reviews and edits blurbs (DisplayTitle, Description, CTA) directly in a clean IssueItems view before export. `pushToBeehiiv.js` reads those fields and renders the final HTML. CSV/Word export (originally R4-W10) is cancelled.

### Rerun cadence
Client runs the pipeline 2-3x per issue cycle: one planning run ~1 week out, one pre-publish run a few days before send. This makes blurb overwrite on rerun a real risk — all edits must happen in Airtable before the final export run. **Blurb lock implemented 2026-05-09:** the existing `Lock` checkbox on IssueItems now also protects blurbs — locked items are skipped by `generateBlurbs.js` entirely.

### Client's previous manual workflow (replaced by automation)
Client manually selected events → pasted into ChatGPT with a fixed system prompt → received all ~21 blurbs → manually pasted into a Beehiiv preset template. The automation now handles this end-to-end.

---

## 11. R4-W10 Export Format (pushToBeehiiv.js)

**Decision: 5 separate HTML snippets (one per section), each pasted into its own Beehiiv HTML block. RESOLVED 2026-05-08.**

### Why not one monolithic HTML file
Beehiiv HTML blocks are black boxes — once pasted, you cannot insert native Beehiiv blocks (images, polls, spotlight, ads) inside them. A single file traps all content in one uneditable unit. Splitting by section lets the client place native Beehiiv blocks between sections, preserving full editorial control over structure.

### Image approach — RESOLVED (2026-05-08)
**Decision: images are handled via native Beehiiv image widget, not `<img>` tags inside the HTML snippet.**

Testing confirmed (Test 1a, 2026-05-08): a native Beehiiv image widget placed above an HTML block renders correctly. The client adds the image widget manually above each section's HTML block and swaps the image there each week.

`<img>` tags inside Beehiiv HTML blocks were not tested (Test 1b) — Test 1a is the simpler and more reliable approach. All image URL logic has been removed from `pushToBeehiiv.js`. The 11 ImageURL fields created in Airtable (ImageURL_Families, etc.) are left in place — harmless to keep, destructive to remove.

`LocalAromaTheme` was also dropped — never confirmed with client. Can be added later if requested.

### Confirmed client workflow (2026-05-08)
1. Run `generateBlurbs.js` — AI fills DisplayTitle, Description, CTA in Airtable
2. Client reviews and edits blurbs in a clean Airtable IssueItems view (to be built)
3. Run `pushToBeehiiv.js` — generates 5 HTML snippets
4. Client pastes each snippet into its corresponding Beehiiv HTML block
5. Client swaps section image via native Beehiiv image widget above each block

**Critical constraint:** all edits must happen in Airtable before the final export. Any text edited directly in Beehiiv after pasting will be overwritten the next time `pushToBeehiiv.js` is run. Client confirmed and accepted this on 2026-05-08.

### What the client handles manually in Beehiiv (pipeline out of scope)
- Section images (swapped via native image widget each week)
- Community spotlight block (manually curated weekly, no pipeline data source)
- Paid ad block (sponsor changes weekly, no pipeline data source)
- Polls (community vote changes weekly; "Did you like today's issue?" is permanent)

### Why plain text export was ruled out
Client currently fills Beehiiv fields manually one by one from ChatGPT output. HTML export replaces that entirely — client pastes once per section instead of re-entering every field.

---

## 12. R4 Copywriting

### How R4 works

R4 is a single script (`scripts/generateBlurbs.js`) run manually per issue date:

```
node scripts/generateBlurbs.js YYYY-MM-DD [--dry-run]
```

**Flow:**
1. Fetches all IssueItems for the target issue (JS filter on linked Issue record ID — Airtable formula filtering doesn't work on linked fields)
2. Fetches each linked Candidate record to get Event Title, DescriptionRaw, and City
3. Sends all items in a single LLM call (one prompt per issue, not per item) — more efficient and allows the model to enforce CTA uniqueness across the full list
4. Validates each blurb: word count 9–11, CTA is 2–3 words, no duplicate CTAs across the issue
5. Writes `DisplayTitle`, `Description`, and `CTA` back to each IssueItem. If a blurb fails validation, writes the flag reason to the `Notes` field (e.g. `⚠️ CTA_DUPLICATE`, `⚠️ WORD_COUNT:12/10`)

**Blurb components** (3 fields per IssueItem):
```
DisplayTitle  — 🎭 Creative Six-Word Title – Em Dash Optional
Description   — Ten-word factual description of this specific event
CTA           — Book Now
```

**Dry run flag:** `--dry-run` prints all blurbs to console without writing to Airtable. Use this to review output before committing.

**Reruns:** running R4 again on the same issue overwrites existing blurbs for unlocked items. **Lock = true protects blurbs** — locked IssueItems are skipped entirely by `generateBlurbs.js` (not sent to the LLM, not written). Lock an item in Airtable after you're happy with its blurb to protect it from reruns.

### Prompt design

- Single system prompt establishes tone: warm, community-focused, never salesy, factual descriptions only
- All events sent in one user prompt — model sees the full list and can ensure CTA uniqueness
- Temperature 0.3 — low enough for consistent formatting, not so low it becomes repetitive
- `response_format: { type: 'json_object' }` enforces structured JSON output
- Description is capped at 600 chars of DescriptionRaw per event to stay within token limits

### Validation rules
| Check | Rule | Flag |
|-------|------|------|
| Word count | 9–11 words (target 10) | `WORD_COUNT:N/10` |
| CTA length | 2–3 words | `CTA_LENGTH:N` |
| CTA uniqueness | No two blurbs in same issue can share a CTA | `CTA_DUPLICATE` |

Flagged blurbs are still written to Airtable — the editor fixes them manually.

---

## 13. R4 Model Selection

**Decision: gpt-5.4-nano at temperature 0.3.**

Three models were tested on a 14-item dry run (Apr 16 issue):

| Model | Word count violations | CTA duplicates | Notes |
|-------|----------------------|----------------|-------|
| GPT-4o | 8/14 | 2 | Baseline |
| gpt-5-nano-2025-08-07 | N/A | N/A | Reasoning model — all 2500 tokens consumed by internal reasoning, 0 output |
| gpt-5.4-nano | 0/14 | 2 | Best quality, lower cost |

gpt-5-nano-2025-08-07 was ruled out immediately: it's a reasoning model that burns its entire token budget on chain-of-thought before generating output. At 2500 tokens, nothing is returned. It would require ~16k tokens to function, making it more expensive despite lower per-token pricing.

gpt-5.4-nano outperformed GPT-4o on word count adherence (0 violations vs 8) and costs ~$0.003/run vs ~$0.025/run for GPT-4o. CTA duplicates were the same on both — this is a prompt constraint issue, not a model capability issue.

---

## 14. R3 Slot Seeding: Gap-Finding vs Count-Based

**Decision: allocate by finding the lowest available slot number, not by incrementing a counter.**

Original approach: seed a counter per section per issue by counting locked assignments (`slotCounter[section]++`). New slot number = counter after increment.

**Failure mode:** if locked slots are non-contiguous (e.g. Slots 1, 2, 3, 5 locked — Slot 4 deleted), the counter reaches 4 and assigns Slot 5, which is already occupied. Result: two IssueItems with the same section/slot in Airtable.

**Fix:** replaced counter with a `filledSlots` Set per section per issue. When allocating, find the lowest integer from 1 to max not already in the set. This correctly fills gaps regardless of which specific slots are locked.

This scenario occurs in practice when an editor locks most slots, deletes one (to swap an event), and reruns R3 to fill the gap.

---

## 15. Multi-Tenant Architecture

**Decision: base-per-newsletter. One Airtable base per newsletter client.**

Two options considered:
- **base-per-newsletter:** each newsletter gets its own Airtable base
- **single-base-with-Newsletter-field:** all newsletters share one base, records tagged by newsletter

Base-per-newsletter chosen because:
- Isolation: no risk of cross-newsletter data leaking into each other's views, allocations, or few-shot examples
- No record-limit ceiling: a shared base would hit Airtable row limits faster as newsletters scale
- Cleaner permissions: each base can be shared with its newsletter's stakeholders independently

**Implementation:** Each newsletter has a config file at `/newsletters/{name}.json` (e.g. `vaughan.json`, `mississauga.json`). Config contains: airtableBaseId, beehiivPubId, segments, sources, geography, quotas, scoringWeights, prompts. Scripts accept a `--newsletter=vaughan` flag, load the config, and filter every query through it. Adding a new newsletter = creating a config file, no code changes required.

**Status:** closed 2026-05-20. Base-per-newsletter confirmed with Nathan. Mississauga base cloned from Vaughan schema at R8-W10 (not earlier — schema must be stable first).

---

## 16. Quality Metrics

**Decision: quality metric is two things, owned by two releases. Prereq #5 closed 2026-05-27.**

*Reframed 2026-05-27. Superseded the 2026-05-10 framing (editor acceptance rate as primary), which is preserved below as background.*

### Quality metric is two distinct problems

The original framing conflated two different things under one label. They have different mechanisms, different data, and live in different releases:

| Stage | Metric | Owned by | How it's measured |
|---|---|---|---|
| **Selection quality** — did the system pick the right events? | R6 backtest result | R6 | Offline: do score-ranked picks correlate with actual clicks better than earliest-date sort, on the frozen R6 eval set? |
| **Classification quality** — did the system assign the right segment? | NeedsReview rate + classification accuracy on frozen R7 eval set | R7 | NeedsReview rate drops below pre-R7 baseline AND classification accuracy ≥ current LLM baseline (no regression) |

CTOR is the **post-launch outcome metric** (3-month rolling average against the §20 baseline). It is **not the development signal** — too lagging, too confounded by subject lines (which §20 confirms are statistically independent of CTOR drivers).

### Prereq #5 close — the one-sentence definition

> **R6 success = scored picks correlate with clicks better than earliest-date sort, validated by offline backtest on the frozen R6 eval set (R6-W4 step 0, locked in `data/beehiiv/r6_eval_set.md`). CTOR is the post-launch outcome metric, not the development metric.**

### Why this closes without client agreement

The original framing required the client's behavior (`EditedByClient` checkbox usage) for the metric to produce data. That made it a client-agreement problem, not just a methodology problem. The new framing measures the score against clicks on past issues — a methodology decision that requires no behavior change from the client.

### Why the original acceptance-rate framing was killed

Confirmed at 2026-05-14 client meeting: client edits every AI-generated blurb regardless of quality, as a habit (voice/tone control), not as a reaction to bad copy. Acceptance rate would always be ~0% — unfalsifiable as a signal. The `EditedByClient` field remains in R8-W8 scope as cheap insurance (one checkbox, zero code) in case the pattern changes post-handoff. See §21.

### Original 2026-05-10 framing (preserved for history)

The earlier proposal was: editor acceptance rate (blurbs published as-is vs. edited) as primary, with CTR and NeedsReview as guardrails. Defended as: scoring is unfalsifiable without an agreed measurement of quality, and acceptance rate is observable at runtime via the manual override audit trail (R8-W8) with no additional instrumentation. Killed 2026-05-27 because the metric assumed the editor would only edit when quality was low — observed behavior shows he edits universally.

---

## 17. R7 Few-Shot Classification

**Decision: dynamic few-shot selection at runtime. No RAG.**

*Defined 2026-05-10.*

**Mechanism:** at the start of each R2 run, query IssueItems for the last locked/approved records per segment, sorted by click performance then date descending. Use these as classification examples in the R2 prompt. Examples auto-refresh as more issues accumulate — no manual curation, no staleness.

**Example structure per segment:** 2–4 canonical examples + 2–3 hard negatives (boundary cases that are plausibly similar but don't belong). A "What to Avoid" section per segment is built from LLM_Rationale on past misclassifications.

**Newsletter scoping:** few-shot queries filter by newsletter field. Mississauga examples cannot contaminate Vaughan classification and vice versa.

**Why not RAG:** the full set of examples across all segments fits in context per run at this scale. RAG adds infrastructure complexity without benefit for 2 newsletters.

**Eval infrastructure:**
- **Frozen eval set:** 15 high-confidence + 15 ambiguous examples per segment from Vaughan history. Permanent regression benchmark — every prompt or model change is replayed against it before shipping. Mississauga examples added once those issues exist.
- **Prompt versioning:** R2 prompt versions stored in a versioned file with dates. Regressions are rollback-able without guessing what changed.

### Implementation mechanism — CONFIRMED 2026-05-28 (was open, gated on #52)

Beehiiv parseability spike (#52) returned GO. 2,729 `(section, url)` pairs extracted across 72 issues via `scripts/fetchBeehiivHistory.js` → `data/beehiiv/issue_history.json`. Labels are editor ground-truth (the editor placed each event in its section).

**R7 path confirmed: LinearSVC + TF-IDF classifier trained on historical Beehiiv labels, LLM as low-confidence fallback.**

- ~2,700 labeled examples across 4 segments — sufficient for a real classifier at this scale
- Removes OpenAI dependency from the classification step entirely
- LLM retained for: low-confidence fallback, rationale generation (LLM_Rationale field), NeedsReview explanation
- Classifier retrains periodically as `issue_history.json` accumulates new issues
- Decision finalised at R7 scoping.

### Amendments 2026-05-29 — from external LLM review

External review (Claude.ai + ChatGPT) surfaced four execution-level fixes the original spec missed. None challenge the classifier path — all sharpen its execution:

1. **Train/serve feature skew (Claude CRITICAL).** Original spec trained on editor-final DisplayTitle ("🍁 Canada's Largest Maple Syrup Festival – Last Chance" — 6-word polished marketing copy). But at inference R2 classifies on the *raw* ingested title (e.g. "Spring Fair Richmond Hill Family Event Games Food Trucks Vendors"). Different distributions. Eval on the DisplayTitle pool would look great, production would degrade silently. **Fix:** train AND evaluate on `Candidates.Title` + `Candidates.DescriptionRaw` (the actual R2 input). For events without a Candidates match (pre-pipeline issues), accept they're a weaker label source and flag — don't mix them in unflagged.

2. **Title-only features underdetermine 4-way segments (Claude MAJOR).** "Jazz Night at the Vineyard" is plausibly Couples / Local Aroma / Golden Age depending on framing. DescriptionRaw is available and would help materially. **Fix:** include both Title and DescriptionRaw in the TF-IDF feature space.

3. **Class imbalance will tank minority-segment recall (Claude MAJOR).** Families is the most popular section (§1), so labels are imbalanced. LinearSVC defaults will favor Families and report high overall accuracy while quietly failing on the smaller segments. **Fix:** `class_weight='balanced'` AND report per-segment recall as the headline metric, not just accuracy.

4. **LinearSVC margins are not probabilities (both reviewers).** The "tune confidence threshold" plan in R7-W6 assumes the margin is interpretable as confidence. It isn't. **Fix:** wrap with `CalibratedClassifierCV` (Platt scaling) on held-out data before the threshold means anything. Otherwise the LLM-fallback gating is thresholding on an arbitrary scale.

5. **Parser correctness ≠ parser extractability (Claude MAJOR).** #52 confirmed the parser pulls SOMETHING from all 72 issues. It did NOT confirm the parser pulls the RIGHT things across template eras (Beehiiv may have changed email templates over the 15-month history). Slot position and section attribution could be wrong on older issues without anyone noticing. **Fix:** hand-check a stratified sample (early/mid/recent issues) before trusting the 2,729 labels or the slot feature. Filed as issue #54.

6. **Retraining trigger will rarely fire at this volume (Claude MINOR).** ~5 events/segment/issue × a high-accuracy classifier = editor-corrected examples accumulate over months, not weeks. **Fix:** ship v1 as a static model; don't represent it as a self-improving loop in the case study until the data shows otherwise.

What didn't change: classifier path itself, LLM-fallback architecture, frozen eval set discipline, model versioning.

### Amendments 2026-06-02 — Issue #54 stratified parser audit closed

Full 9-issue stratified correctness audit completed (3 issues × 3 eras: 2025 Q1-Q2, 2025 Q3-Q4, 2026 Q1-Q2). Verdict: labels are trustworthy for R6 and R7, with the following scoping rules and caveats.

**Section exclusions (permanent):**
- Trust Me Recipe and Local Aroma excluded from R6/R7 training entirely. These are editorial sections (a recipe and a restaurant pick), not events. Including them in an event classifier would corrupt it.

**Data range restrictions:**
- For Golden Age Readers: use March 2025 onward only. The section did not exist in the Beehiiv template before that — "Listen by Yourself" was used instead. Labels before March 2025 do not exist.
- For Families, For Couples: full 72-issue range safe. Jan-Feb 2025 labels are the least-audited subset (one sample only in the early-era audit) — check this cohort first if early-era backtest results look off.
- Trust Me Recipe: did not appear in the template until January 2026. Excluded regardless (see above).

**Parser fixes applied (2026-06-02):**
- Added `_bhiiv=opp_` to `SKIP_PATTERNS` — Beehiiv ad/partner links were slipping through into event sections. Issues #55 closed.
- Added `<strong>` tag fallback in `parseIssue` section-detection loop alongside `<b>`. Existing `issue_history.json` unaffected (API returned `<b>` when the script ran). Protects against silent zero-extraction if API changes tag format. Issue #56 closed.

**Template-era finding:** No section mis-attribution or `<b>` tag pattern failures found across any era for the three event sections. Section schema changed in early 2025 (Golden Age and Trust Me Recipe absent) but this is a structural gap, not a parser error.

---

## 18. Facebook Automation

**Decision: Facebook automation is out of scope. Manual intake is the confirmed path.**

*Confirmed 2026-05-10.*

Facebook represents ~70% of the client's original event sources. Automated scraping was evaluated and ruled out:
- **TOS risk:** scraping Facebook violates their terms of service
- **Fragility:** Facebook's DOM changes frequently; scrapers break silently and without warning

**Manual intake path:** client submits Facebook events weekly via a structured CSV drop or Airtable form. The pipeline ingests these identically to automated sources — same Candidates schema, same UniqueEventID deduplication. No special handling downstream.

**Reliability risk (added 2026-05-13):** 15-month Beehiiv clicks analysis showed Facebook events drive **58% of all event clicks**. If weekly manual submission slips, the affected issue loses more than half its potential click volume. R5-W3 includes a 0-submission detection check (8+ days since last Facebook submission flags in run log), but that catches misses after the fact. Worth raising at client meetings as an operational reliability question — confirm a backup path exists if the client can't get to weekly submissions one week.

---

## 19. Beehiiv Clicks Data — Granularity, Attribution, Scoring Metric

**Decision: clicks attribution and scoring metric are locked.**

*Confirmed 2026-05-13, from analysis of 15-month Beehiiv export (71 issues, 6,901 link rows). Full analysis preserved in `data/beehiiv/clicks_analysis_2026-05-13.md`.*

**Granularity:** Link-level. One row per unique URL across all posts, deduped via UTM parameters. The same URL appearing in multiple issues produces a separate row per issue appearance. This is the best-case data shape for R6 — it enables segment-level click attribution.

**Scoring metric:** `Verified Unique Clicks`. Bot-filtered by Beehiiv and deduplicated to one count per subscriber per URL. `Verified Total Clicks` is also present but runs slightly higher due to repeat clicks from the same subscriber — not the right signal for ranking. Web clicks (~1.7% of traffic) are ignored entirely.

**Attribution path for R6 scoring:**
1. Take `Full URL` from the clicks CSV.
2. Strip UTM parameters down to the base URL.
3. Match against `IssueItems.CandidateURL` (exact match).
4. From the matched IssueItem, derive `Section` and `Issue` — gives segment and date attribution.

For pre-pipeline issues, the fallback path is parsing `utm_campaign` slug from `Full URL` and joining against the Issues table by date. This is fuzzier and only used if pre-pipeline historical data is genuinely needed (probably not — pipeline-era data + forward-looking accumulation is sufficient).

**Segment-level click weights are not yet computed.** Domain-based inference was tried and ruled out (~30% misclassification rate; Facebook URLs are opaque). The path is a manual URL tagging exercise — top 50 clicked URLs cross-referenced against Beehiiv issue archives by the client (~2–3h). See `meetings/2026-05-14.md` Talking Point A.

---

## 20. CTOR Baseline as Quality Guardrail

**Decision: CTOR baseline locked at avg 10.35%, median 9.70%, internal ceiling ~12%, floor ~7–8%.**

*Confirmed 2026-05-13, from 71-issue Beehiiv posts export.*

This is the operational definition of "CTR doesn't materially drop issue-over-issue" — one of the guardrails proposed in prerequisite #5 (quality metric). Without a concrete number, "materially drop" is subjective and unfalsifiable.

**Numbers in detail:**
- Full 71-issue average: **10.35%**
- Median: **9.70%**
- Issues above 12% (the realistic ceiling): 17 of 71
- Issues below 8% (the floor): 16 of 71
- Range: 0% (broken issues) to 22.6%

**Trend over time:** CTOR declined from 13.6% in the first cohort (Feb–Jul 2025) to 8.4% in the most recent cohort (Dec 2025–May 2026). Likely list-fatigue effect from 7.5x list growth (more passive subscribers diluting engaged ones), not a content quality regression. Treat the current ~8.5% as the realistic operating floor and 12% as the achievable ceiling on any given issue.

**Critical adjacent finding:** Open rate and CTOR are statistically independent (Pearson correlation -0.13). Subject lines drive opens; event quality drives clicks. R6 scoring affects clicks, not opens. Don't conflate the two when evaluating R6's impact.

**How this informs R6 evaluation:**
- After R6 ships, monitor CTOR per issue against the locked baseline.
- A drop below ~8% on multiple consecutive issues is a regression signal — investigate.
- A move above the 12% ceiling on multiple issues is the success signal we're aiming for.
- Open rate fluctuations are not R6's responsibility and should not be attributed to scoring changes.

---

## 21. Blurb Acceptance Rate — Tracking Mechanism

**Decision: track blurb acceptance rate via `EditedByClient` checkbox on IssueItems.**

*Added 2026-05-13. To be implemented in R8-W8 alongside the clean IssueItems view build.*

**Problem:** blurb acceptance rate (% of AI-generated blurbs published without modification) is the primary editorial quality metric for the case study and for future client pitches. Without an explicit tracking field, it's unverifiable — would require manually diffing exported blurbs against live Beehiiv posts each week.

**Decision:** add a single checkbox field `EditedByClient` to IssueItems in Airtable. Client checks it when they change a blurb during their weekly review. Acceptance rate = (total IssueItems − EditedByClient checked) / total IssueItems per issue.

**Why this approach:**
- Zero code, one field — nothing to build or maintain in the pipeline itself
- Client-side habit is minimal: one checkbox per edited blurb during the review they're already doing
- Field lives in the IssueItems view the client is using anyway — no context switch
- Produces a timestamped, queryable record anyone can inspect (Airtable)

**Implementation timing:** R8-W8. Add the field when building the clean IssueItems view so the client learns both in one walkthrough session.

**Client framing:** "If you change a blurb, just check this box — it helps me track quality over time." One sentence. Doesn't feel like reporting.

### Status update 2026-05-27

The metric this field was built to support (blurb acceptance rate as primary quality KPI) is dead — see §16 for the reframe. Client confirmed at 2026-05-14 meeting that he edits every blurb regardless of quality, so acceptance rate is unfalsifiable.

**The field still ships in R8-W8** as cheap insurance: one Airtable checkbox, zero code, near-zero client overhead. If the editing pattern shifts post-handoff (e.g. client stops editing blurbs he agrees with), the data starts producing signal automatically — no retroactive build needed. The cost of having it is near-zero; the cost of not having it if it becomes useful is rebuilding habit + losing months of data. Asymmetric trade favors keeping the field.

It is no longer the primary quality metric. R6 backtest result is. See §16.

---

## 23. ExecutionLog Airtable Table — Not Building

**Decision: close #18. No ExecutionLog Airtable table.**

*Decided 2026-05-21.*

**What was proposed:** a dedicated Airtable table to log each script run — errors, 429s, batch counts — so failures are visible without terminal access.

**Why not building it:** client runs scripts locally on their own machine. Terminal output is immediate and sufficient. The only scenario where a centralized log adds value is a managed service model where NA runs scripts remotely on a server on the client's behalf — that's not the current architecture and not the planned direction.

Multi-tenant doesn't change this: each newsletter client has their own base and runs their own scripts locally. There's no centralized server to aggregate from.

If NA ever shifts to a managed service model, server-side logging (stdout to file or a logging service) is the right tool — not an Airtable table.

---

## 22. R2 GPT-4o Failure Behavior

**Decision: retry-once-then-flag. Not skip-and-flag.**

*Implemented 2026-05-20. Prereq #3 (Debt #25).*

**What changed:** Three settings added to the "Message a model" node in the R2 n8n workflow: `retryOnFail: true`, `maxTries: 2`, `waitBetweenTries: 5000ms`, and `onError: continueRegularOutput`.

**Why retry-once:** GPT-4o API failures are usually transient (rate limits, timeouts). A single retry with a 5-second wait resolves the majority of these without human intervention. Two total attempts is the right balance — more retries add latency across a full batch run without meaningfully improving success rate.

**Why continueRegularOutput:** without this, a persistent GPT failure halts the entire workflow and the item is never written back to Airtable. The failure is invisible unless you check n8n execution logs manually. With `continueRegularOutput`, the failed item flows downstream to Parse LLM Response, which catches the null output and writes an explicit error to the record.

**Possible outcomes and what they mean in Airtable:**

| Situation | NeedsReview | LLM_ParseError | R2Status |
|-----------|-------------|----------------|----------|
| GPT succeeds, confidence ≥ 0.5 | false | blank | Enriched |
| GPT succeeds, confidence < 0.5 | true | blank | NeedsReview |
| GPT returns null or invalid segment | true | "Invalid or empty segment: null" | NeedsReview |
| GPT fails after both attempts | true | "No usable output from model" | NeedsReview |

A blank `LLM_ParseError` means the LLM ran cleanly. A populated `LLM_ParseError` tells you exactly what went wrong without touching n8n. All failure cases land in the `R2 - NeedsReview` Airtable view for human triage.

---

## 24. R3 NeedsReview Gate Removal

**Decision: R3 trusts `Status = Approved` as full editorial signoff. The `NeedsReview` boolean no longer gates R3 eligibility.**

*Changed 2026-05-27.*

### What changed

- [buildIssues.js](../scripts/buildIssues.js) line 54 (`if (item.NeedsReview !== false) return false`) dropped. Eligibility now requires only `Status = Approved`, present Start Date, future date, URL.
- `R3 - Eligible for Scheduling` Airtable view filter — `NeedsReview unchecked` condition removed for the same reason.
- Test fixture `BAD3` (NeedsReview-true) and its assertion in `runTests()` removed accordingly. Tests pass.

### Why

The boolean was a redundant safety net. The funnel already routes events that R2 was uncertain about into the `R2 - NeedsReview` view for triage. If the editor reviews one of those and decides to use it, setting `Status = Approved` is the explicit "I've reviewed this, use it" signal. The additional requirement to also uncheck the boolean meant rescues required two clicks (plus often a segment fix when R2 returned null segment), which contradicts the "as simple as possible" client constraint.

### What stays the same

- The `NeedsReview` boolean is still set by R1 and R2 n8n workflows.
- The `R2 - NeedsReview` view still surfaces flagged events for triage.
- The boolean remains useful as a historical R7 quality signal — "which records did R2 originally fail on" is information we want to preserve for measuring R7 improvements.

### Schema redundancy noted (deferred refactor)

The `NeedsReview` concept now lives in three places: `R2Status` single-select value, `NeedsReview` boolean, and (previously) `Status = "Needs Review"` in the workflow dropdown. The Status dropdown value was removed 2026-05-27. The remaining boolean ↔ R2Status redundancy is a future schema cleanup — not urgent because both are set together by R2 and consistent in practice. Filed informally; not worth its own issue at current scale.

---

## 25. Picks Tracking via Beehiiv URL Match

**Decision: capture "what the editor actually published" by reading the published Beehiiv issue HTML and matching URLs back to Candidates. Script-side, post-publish, zero client overhead.**

*Decided 2026-05-27.*

### Why this is the right capture mechanism

The two viable alternatives:

| Approach | Client overhead | Catches manually-sourced events too? |
|---|---|---|
| Editor tags `Featured` / `Used` on each published Candidate | one click per published event per week — adds up | No |
| **URL match from Beehiiv HTML** | **zero** | **Yes — unmatched URLs = manually-sourced slots** |

URL match wins on both axes: honors the "as simple as possible" client constraint, and surfaces the bonus signal of which slots NLAP did *not* supply (manual sourcing share). That second signal is load-bearing if NLAP's end-state is supplementary (see §26); it's transition tracking if end-state is NLAP-only.

### What the script does

For each published issue: fetch Beehiiv HTML, extract `(URL, section)` per event slot, match against `Candidates.URL`. Matched → known NLAP supply. Unmatched → manually-sourced slot.

### What gets written back to Airtable

Deferred until the script is built. Three options surfaced; decision postponed until the script lands:
- Update existing `IssueItems` records with a `Published` flag (delta between "R3 picked it" and "editor actually published it" = his overrides — strongest signal for R6 backtest)
- Add a `PublishedInIssues` link field on Candidates (symmetric with other Candidate fields)
- Separate `PublishedItems` table (rejected — duplicates `IssueItems` structure for no gain)

Pick when script is built. Default lean: option A.

### Gates

- ~~Beehiiv parseability spike (#52)~~ — **GO confirmed 2026-05-28.** 2,729 `(section, url)` pairs across 72 issues. `scripts/fetchBeehiivHistory.js` is the extraction script.
- URL-match script is now unblocked — ~1–2 days to build.

### Relation to existing IssueItems flow

R3's `IssueItems` represent the script's *picks* (currently earliest-date sort, will become Score_Final-ranked). The URL-match capture is the editor's *actual choices*. The two diverge when the editor swaps events before publishing — which the client confirmed 2026-05-27 he does, because NLAP is currently supplementary (see §26).

---

## 26. NLAP End-State Intent — Mostly NLAP, One-Offs Allowed

**Decision (confirmed 2026-05-28 client meeting): once scoring (R6) + classification (R7) ship, NLAP becomes the client's *primary* event-finding workflow. The client expects to source the bulk of each issue through the pipeline but reserves the option to add one-off events from elsewhere. Facebook intake covers what R1 can't ingest.**

*Surfaced 2026-05-27, confirmed 2026-05-28 (Q7 in `meetings/2026-05-28.md`).*

### What the client actually said

"Mostly NLAP — one-offs would use something else, but mostly NLAP." Softer than the §26 PENDING framing of "NLAP becomes your only workflow." Directionally aligned but with a non-zero unmatched-share floor expected to persist.

### Why this matters

It shapes which success metric carries durable weight after R8. Client's actual answer ("mostly NLAP, one-offs from elsewhere") lands between the two poles originally framed:

- **Pure NLAP-only end-state:** "% of issue NLAP-supplied" trends to 100% by design — pure transition tracker, not a durable KPI.
- **Pure parallel sourcing:** supply-share stays load-bearing as a durable KPI indefinitely.
- **Client's actual position (confirmed 2026-05-28):** supply-share is partially durable — expect it to stabilize at a high-but-not-100% level (one-off share is the floor). Worth tracking, but the primary durable metrics remain CTOR (vs §20 baseline), editorial time saved (vs the 4-hour baseline captured 2026-05-14), and pipeline reliability.

### What this means for downstream design

The URL-match script (§25) is moderately load-bearing — its unmatched-URL signal becomes the durable "one-off rate" tracker. Not the headline metric, but worth keeping clean. NLAP positioning lands at "your primary sourcing workflow" rather than "your only sourcing workflow."

R7 scoping and R6 success line remain valid as previously framed — those choices were made assuming high NLAP share, which the confirmed answer supports.

---

## 27. Editor Workflow — Segment vs Quality Decoupling

**Decision: the editor's weekly review is split into two stages with two distinct decisions. Step 1 (R2-Enriched + R2-NeedsReview) is segment correctness only. Step 2 (R3-Eligible for Scheduling) is quality / "should this be in the next issue."**

*Confirmed at 2026-05-28 client meeting.*

### What the editor does (operational protocol)

**Step 1 — R2-Enriched and R2-NeedsReview (both views, same logic):**

| Situation | Action |
|---|---|
| `SegmentSuggested` is correct | Approve |
| `SegmentSuggested` is wrong but event is good | **Fix the dropdown to the right segment, then Approve** |
| Event is junk (B2B, civic, out of area, irrelevant) or segment is wrong and unfixable | Reject |
| Unsure | Leave alone |

The editor is NOT deciding whether the event belongs in the newsletter at Step 1. That decision is deferred to Step 2.

**Step 2 — R3-Eligible for Scheduling (Candidates filtered Status=Approved, Start Date ≥ today, grouped by segment):**

Editor curates the next issue from the approved pool, section by section against quotas (5 per main section, 1–2 for Trust Me Recipe). This is where editorial quality judgment lives.

### Why decoupled

Conflating "is the segment right?" with "is this newsletter-worthy?" loses signal in both directions:
- An approve based on quality intent silently confirms a wrong segment — corrupts R7 training data.
- A reject based on wrong segment throws away a potentially good event — and the rejection looks identical in the data to "event is junk," so R6 can't distinguish.

Splitting them produces clean signals at each stage and matches the editor's actual cognitive flow (judging segment label is fast; judging "is this issue-worthy" requires comparing against other events in the pool).

### Why "fix the segment" is operationally necessary

R3-Eligible is grouped by segment. If a "For Couples"-worthy event is mislabeled "Local Aroma" and approved without correction, it lands in the Local Aroma pile at Step 2. When the editor curates For Couples, the event is invisible — effectively lost for the issue it was meant for. The correction is a 2-second dropdown change; the cost of skipping it is missing good events at Step 2.

### What this implies for the data we collect

Three signals captured automatically with no editor overhead beyond the workflow above:

| Signal | Source | Used by |
|---|---|---|
| `(event text → confirmed segment)` labels | Every approve | R7 classifier training |
| Segment corrections (R2's original `SegmentSuggested` vs final after edit) | Diff on approved records | R7 — highest-value training signal (model was wrong, here's the right answer) |
| Quality picks | Step 2 — IssueItems records created from R3-Eligible | R6 scoring backtest |

Rejects are operationally useful (clear the queue, exclude junk from future runs) but not training-data-load-bearing for either R6 or R7. R7 is multi-class — segment negatives come implicitly from other segments' positives. R6 only sees the approved pool. A "newsletter-worthy classifier" that would need clean reject data is not on the roadmap.

### NeedsReview promoted from optional to part of weekly loop

The 2026-05-27 framing left NeedsReview rescue as "optional — skipping is fine." Client confirmed 2026-05-28 he will work both views (R2-Enriched and R2-NeedsReview) every cycle using the same Step 1 logic. NeedsReview rescues are *especially* high-value as R7 training data — they're the cases where R2 was uncertain, so editor corrections on those records target exactly what the classifier needs to learn.

### Why no extra editor tracking fields are needed (no comment box, no quality flag)

Every manual editor capture step is a tax that fails silently the first busy week. The 4-stage quality funnel — approved → picked → published (Beehiiv URL match, §25) → clicked — captures everything R6 and R7 need without any new editor inputs. Adding fields now is premature; the next 4 weeks of real editor data will tell us if auto-capture is sufficient. If not, add then. Asymmetry favors waiting.

### What changes in documented behavior

- RUNBOOK §Client Funnel updated 2026-05-28 to reflect this protocol (two-stage, fix-and-approve, NeedsReview as part of weekly loop).
- §4 R2 Classification triage steps (lines 105–110) and §8 Weekly Operational Flow step 3 remain accurate for the underlying mechanics — the segment-vs-quality decoupling layered on top is the new editorial framing.
- StatusLastModified field (added 2026-05-27) is the time cutoff between tinker-era and clean editorial data. This decision (§27) is the rules-in-force record for what "clean editorial" *means* from 2026-05-28 onward. Together they answer "what data is trustworthy and under what rules" — the provenance pair needed before R6 backtest.

### What was not changed

R3 (the script) still runs unchanged — it allocates approved candidates to IssueItems by current logic (earliest-date sort until R6 ships). Step 2 (editor curation at R3-Eligible) is an *editorial* layer on top of the candidate pool, not a replacement for the R3 allocation script. The eventual relationship between editor picks at Step 2 and R3 script output is a downstream design question — picks may inform Locks on R3-allocated IssueItems, or may bypass R3 entirely with manual IssueItems creation. Decision deferred until R6 lands and pick volume is observable.

---

## 28. R6 Regression Role — Weight-Input, Not Live Model

**Decision: regression on historical events runs once in R6-W4 to inform rule weight ratios. Rules — not the regression model — score candidates in production. Backtest on the frozen eval set validates the rule formula.**

*Decided 2026-05-29. Closes the Decision_Log §9 "Option C" framing, which described regression as a post-R6-W5 validation step (it isn't — backtest is).*

### Three architectures considered

| Architecture | Description | Verdict |
|---|---|---|
| **A. Live regression model** | Trained model predicts Score_Final for every new candidate at R2 time. Model IS the scoring engine. | Rejected. |
| **B. One-time fit + rules in production** | Regression runs once, coefficients translate to hand-tuned rule weights, rules score candidates. | **Chosen.** |
| **C. Periodic retune** | Same as B but re-run regression every quarter on accumulated data, update rule weights if coefficients shifted meaningfully. | Deferred. Build only if post-launch evidence shows drift. |

### Why B and not A

1. **Tautology.** Past events were chosen by editor judgment + earliest-date sort. A model fit to that history learns to predict editor-chosen events that got clicked — not to identify events the editor *would have* picked if presented with all options. Rules don't have this problem; they're explicit, not fit.

2. **Slot-position confounding.** Slot 1 outperforms slot 5 regardless of event quality. A regression model without careful slot controls bakes slot-position dominance into Score_Final — every prediction effectively says "this event would do well if placed at slot 1." Rules can apply slot-position-prior as one signal among many, weighted explicitly.

3. **Client trust.** Editor edits every blurb because he wants control (see §16). A rule formula he can read and adjust ("recency is weighted 3x source quality") matches that disposition. A black-box model that outputs Score=0.73 conflicts with it.

4. **Transferability.** Mississauga inherits the rule formula with one config change (base-per-newsletter, §15). Live model architecture needs a new training set + retrain per newsletter, doubling operational cost across the portfolio.

5. **Method fit.** Six features × ~2,500 events is real regression territory (~400 records per coefficient, well outside overfit zone). But the deliverable — ranking candidates within a 4-section newsletter where the editor makes the final call — is a rule problem, not an ML inference problem. Judgment of when *not* to use the fancy method matters as much as knowing the method.

### What this looks like in practice

**Amended 2026-05-29 after external review (Claude.ai + ChatGPT):** the original "fit regression first, read magnitudes" plan was statistically fragile (eval leakage, raw-coefficient interpretation, slot-position circularity, log-clicks vs logistic spaces). Replaced with hand-set v1 + regression as fallback. See "Amendments" subsection below for full reasoning.

**Design loop (one-time, R6-W4) — REVISED:**

1. **Build feature matrix** from `issue_history.json` + clicks CSV + Candidates: section, source domain, repeat inclusion, date proximity, source quality (and segment as control). Exclude slot position from candidate features — it's the dominant confound, not a content signal (see Amendments). ~2,500 events. **Exclude the frozen R6 eval-set issues from this feature matrix** — otherwise regression weights are tuned on the same issues you later "validate" against, which is the cherry-picking trap eval-freeze was built to prevent.
2. **Ship v1 with hand-set weights** based on documented domain knowledge: §18 (FB = 58% clicks), §20 (Families most popular, CTOR baseline), §10 (R4 client behavior), domain priors on recency/source quality. **Normalize each signal to [0,1] and have weights sum to 1** so the quality floor (0.4) has interpretable meaning.
3. **Backtest the hand-set v1 formula** against the frozen eval set (R6-W5). If picks correlate with clicks better than earliest-date sort → done, regression not needed.
4. **Only if backtest fails:** fit regression as refinement. Standardize features (z-score) before fitting; report partial-dependence or permutation importance, not raw magnitudes. Pick one model family (linear-on-log-clicks OR logistic) and stay there — coefficient spaces don't transfer. Use slot-position interaction terms (or per-slot subgroups) as a confound control, never as a candidate scoring feature. Document the translation explicitly (which coefficient produced which weight, what controls applied).

**Production loop (every R3 run, post-R6):**
- R2 computes Score_Final using the hardcoded rule formula on stored features.
- R3 sorts by Score_Final, picks top N per section.
- R3-Eligible Airtable view also sorts by Score_Final (see §29 — both auto-allocation and Step 2 curation consume the same ranking).
- No regression call, no model load — pure arithmetic on stored features.

**What the "backtest" actually is — REVISED 2026-05-29:**

A strict pre/post backtest ("would the formula have beaten earliest-date sort?") is not achievable on pre-pipeline data. The client didn't use NLAP blindly — he mixed pipeline picks, manual sourcing, and ChatGPT across the 15-month history inconsistently. The candidate pool before April 2026 is unrecoverable. And A/B testing (alternating scored vs unscored weeks) is not viable — you don't deliberately ship worse issues for a control group on a 13k-subscriber newsletter.

**What you CAN do instead — two-phase validation:**

**Phase 1 — Pre-launch signal correlation check (R6-W4/W5):**
- Take post-pipeline issues only (April 2026+, ~7 issues where R1 candidate pool is known)
- Score those candidates retroactively using the hand-set v1 formula
- Check: within each issue, do higher-scored candidates correlate with more clicks?
- This is a **smell test**, not a validation. It tells you the signals point in the right direction. It does not prove the formula beats any alternative.
- If signals don't correlate at all → formula is wrong, revisit weights before shipping.

**Phase 2 — Post-launch editorial override rate (4–6 issues after R6 ships):**
- URL-match script (§25, gated on #54) captures what the editor actually published vs what R3 picked
- **Swap rate = % of R6 picks the editor kept without overriding.** This is the real success metric.
- Swap rate rising over time = editor trusts the formula and is doing less manual sourcing
- Clicks on kept picks vs swapped picks = secondary signal (does R6's taste match reader taste?)
- This data accumulates from normal operation — no experiment needed

**Why swap rate, not CTOR:**
R6's primary job is **editorial time savings**, not click optimization. The client's problem was 4h/week sourcing burden (§client meeting 2026-05-14). R6 succeeds if the editor spends less time overriding picks and less time sourcing manually — that's observable via swap rate. CTOR is too confounded (subject lines, seasonality, list fatigue per §20) to be a clean R6 signal.

**Why clicks data still matters (just not as optimization target):**
Clicks inform the scoring weights — which types of events readers engage with, which sources produce higher-quality candidates, which segments are underperforming. Used as a **design input** for weights, not as the success KPI. The distinction matters for portfolio framing.

**Post-launch guardrails:**
- CTOR tracked as a trend guardrail (per §20 fatigue-adjusted band, not absolute 10.35% bar)
- If swap rate is consistently high (>50% overrides) → formula needs weight adjustment
- If swap rate is consistently low (<20% overrides) → formula is earning editorial trust

### When to revisit (Option C trigger)

Run regression against accumulated post-pipeline data only if:
- Swap rate stays high after 3+ months (formula not earning trust), AND
- Signal correlation check (Phase 1) suggested weights were directionally off

Not pre-emptively. Not on a fixed cadence. Trigger-based only.

### Honest portfolio framing — REVISED 2026-05-29

**What R6 actually is:** an editorial surfacing tool — surfaces highest-quality candidates at the top of the pool so the editor spends less time on discovery and more time on judgment. Click data informs the weights; swap rate validates the formula.

**Two-phase framing:**

> *Phase 1 (pre-launch): signal correlation check on post-pipeline issues — do higher-scored candidates correlate with more clicks within each issue? Sanity check, not validation.*
>
> *Phase 2 (post-launch, in progress): editorial override rate tracked via URL-match attribution across post-pipeline issues. Primary success metric: swap rate — % of R6 picks the editor kept without overriding. Secondary: clicks on kept vs swapped picks once N issues accumulate.*

**What this signals to a technical audience:**

- You understand the difference between observational correlation and causal validation
- You know when A/B testing isn't viable and what to do instead
- You built the data collection infrastructure (URL-match, snapshots) before claiming the metric
- You didn't oversell "click optimization" on data that can't support that claim

That framing is more defensible AND more impressive than "we optimized CTR" — because it shows methodology literacy, not just method application.

### Amendments 2026-05-29 — from external LLM review

Findings that materially changed §28:

| Finding | Source | What changed |
|---|---|---|
| Eval-set leakage in regression | Claude.ai CRITICAL | Design loop step 1 now explicitly excludes frozen eval issues from regression feature matrix |
| Score_Final scale undefined → 0.4 floor uninterpretable | Claude.ai MAJOR | Design loop step 2: signals normalized to [0,1], weights sum to 1 |
| Slot-position used as both confound AND scoring signal | Claude.ai MAJOR | Slot-position removed from candidate scoring features. Used only as confound control in regression. R6-W4 step 3 (roadmap) also updated. |
| §20 vs §28 CTOR contradiction | Claude.ai MAJOR | Post-launch validation rewritten — backtest is success signal (per §16), CTOR is trend guardrail vs §20's fatigue-adjusted band, not absolute number |
| Regression learns exposure bias even with controls | ChatGPT MAJOR | Reframed regression as fallback for refinement, not primary path. Hand-set v1 + backtest first. |
| Eval set of 10–15 too small | ChatGPT MAJOR | Bootstrap confidence intervals added to backtest methodology |
| Raw-magnitude coefficient reading is statistically unsound | Claude.ai MAJOR | Design loop step 4: standardize features (z-score), report partial-dependence or permutation importance |
| Coefficient spaces don't transfer across model families | Claude.ai MAJOR | Design loop step 4: pick one model family (linear-on-log-clicks OR logistic), stay there |

What didn't change: the rules-not-live-model decision itself. Both reviewers independently validated §28's core architectural choice. The amendments are about *how to do the regression correctly* if it's needed, not whether to ship a model.

---

## 29. Score_Final Flow — Sorts the Pool, Doesn't Replace the Editor

**Decision: Score_Final ranks events within each segment. Both R3 auto-allocation AND the editor's Step 2 curation view consume the same ranking. R6 is a pool sorter, not an auto-decision maker.**

*Decided 2026-05-29. Closes the §27 open question and the Decision_Log §9 row "Relationship between Step 2 editor picks and R3 script output."*

### What was ambiguous

§27 documented the two-stage editor workflow (Step 1 = segment correctness, Step 2 = quality pick) but explicitly left open: "the eventual relationship between Step 2 editor picks and R3 script output is a downstream design question — picks may inform Locks on R3-allocated IssueItems, or may bypass R3 entirely, or run in parallel."

External review (Claude.ai MAJOR) flagged this must be resolved before R6 implementation, because:
- If Score_Final feeds R3 auto-allocation only: the editor routes around it via manual swaps (§25), and the R6 build effort is wasted on a path that's not the load-bearing one.
- If Score_Final sorts the Step 2 curation view: editor sees ranked candidates first, picks from a sorted pool → R6 directly improves the work the editor actually does.

### Resolution

**Score_Final is computed per candidate at R2 time. Both consumers use it:**

| Consumer | How it uses Score_Final |
|---|---|
| **R3 auto-allocation** (unchanged behavior) | Sorts candidates by Score_Final desc within each section, picks top N per quota. Writes IssueItems. Editor can override via Lock + swap. |
| **R3-Eligible Airtable view** (new behavior) | Sorts candidates by Score_Final desc within each segment so editor sees the highest-ranked events first when curating Step 2. The pool itself stays unchanged (Status = Approved, Start Date >= today); only display order changes. |

Both consume the same numeric ranking. R6 work serves both surfaces with one formula.

### Why this is the right resolution

1. **Matches confirmed editor workflow.** §27 confirmed the editor curates Step 2 manually. R6 sorting the Step 2 view directly improves the work he actually does — best events float to the top, less scrolling/searching to identify quality picks.

2. **Auto-allocation still has value.** Editor doesn't curate from scratch every week; he reviews R3's picks first, then overrides where needed. Better R3 picks = fewer overrides = less manual work, even if it's not zero.

3. **Symmetric data leverage.** Same `(features, clicks)` history informs both R3's pick quality and the Step 2 view's sort order. One formula, two surfaces. No special-case logic.

4. **Doesn't require a new mechanism.** Sorting an Airtable view by a field that already exists is a 30-second change, not a build. No new pipeline component, no new failure surface.

### What changes in implementation

R6-W5 deliverables (roadmap) implicitly assumed R3 auto-allocation was the only consumer. Explicit additions:
- R3-Eligible Airtable view sort order: change from Start Date asc to Score_Final desc, then Start Date asc as tiebreaker.
- Document in RUNBOOK §Client Funnel that the Step 2 view is sorted by quality score, not chronologically.

### What doesn't change

- R3 script behavior — still allocates by Score_Final → Start Date as already designed.
- Editor's Lock + override capability — unchanged.
- The §25 URL-match script — still captures editor's actual published picks (so we know when overrides happened and which events were sourced manually).

### Open follow-up (deferred, not load-bearing)

Whether Step 2 picks should automatically Lock corresponding IssueItems is a separate UX question — answer probably yes (so a re-run of R3 doesn't undo the editor's curation), but the mechanism (Airtable automation? Manual checkbox? New script?) is deferrable until R6 ships and editor pick volume is observable.

---

## 30. Recency / Date-Proximity Dropped from Scoring Formula

**Decision: drop date-proximity entirely from Score_Final. Within the eligibility window (IssueDate+1 through IssueDate+10), all days are treated equally.**

*Decided 2026-06-04, client meeting.*

### What was open

R6 scoring design had "Recency fit: days between event start and issue date" as a candidate signal. Three shapes were on the table: CURVE (day 3–4 peak), THRESHOLD (minimum notice cutoff), SPREAD (distribution preference, not a score signal).

### What the client said

Client confirmed dates don't matter to readers — only event quality. No preference for imminent vs. later events within the 10-day window.

### Data check

Attempted to verify against historical click data. Finding: the historical data cannot support this analysis. `issue_history.json` stores event URLs but not event dates. Pre-pipeline issues were built manually in Beehiiv with no IssueItems in Airtable, so EventDate cannot be reconstructed. The data to test date-proximity effects doesn't exist yet; it will accumulate after 10–15 live pipeline issues.

### Resolution

Drop recency from the formula. The date window still gates eligibility — events must fall within IssueDate+1 through IssueDate+10 — but within that window proximity has no effect on Score_Final. If 10–15 post-pipeline issues accumulate and proximity shows a detectable signal, revisit then.

---

## 31. Local Aroma and Trust Me Recipe — Parked

**Decision: no automation scope for Local Aroma or Trust Me Recipe at this time.**

*Decided 2026-06-04, client meeting.*

Both sections were on the agenda as potential candidates for blurb generation (Option A), intake structure (Option B), or full discovery automation (Option C). Client confirmed both sections are parked — no build work on either. They remain manual indefinitely until client raises them again.

