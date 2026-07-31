# NLAP Decision Log
*Last updated: 2026-06-22*

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

### 2026-07-09 amendment — Step-2 curation never ran; the assumed R6 label source is empty

Measured on the live base (Candidates `StatusLastModified`, confirmed scoped to `Status` only): of **122** ever-`Approved` records, only **~20 are genuine editor approvals** (15 For Couples / 4 For Families / 1 Golden Age, all in a single 2026-05-28→31 window). The rest are bulk/scripted tinker-era writes (identical-second timestamps). The `Featured` status, `Featured in NL`, and `Reviewed by Human` fields are **dead/unused**.

Consequences for the data-mapping above — the "eventual relationship" flagged under *What was not changed* now has data (Step-2 pick volume ≈ 0):

- **The "Quality picks → IssueItems → R6 backtest" row never materialized.** Step-2 curation (R3-Eligible) was never performed. **`IssueItems`** order is pure earliest-date sort (Score_Final unimplemented — §6/§28). This does **not** extend to **`issue_history.json`** *(corrected 2026-07-12 — see note below)*: it is the editor's actual published record (77 issues, 2025-01-16 → 2026-07-02, the majority hand-built in Beehiiv before the allocator existed), so it carries editorial **selection + within-section slot ordering** — not a date sort. What it lacks is a **reject pool** (events the editor saw and passed over), so it validates the *ordering* of already-picked events but not *selection* against alternatives — the basis §59 uses to build the R6 eval label from `issue_history` slot + clicks.
- **Any consumer of editor labels must gate on `StatusLastModified` ≥ 2026-05-28** *and* recognize the clean editorial-*selection* signal is only ~20 approvals. Step-1 approvals are segment-correctness decisions, not rankings. This applies to **R7 training** (do not trust raw `Status=Approved` — most are non-editorial bulk writes) and to any **client-#2 base clone**.
- **R6 therefore elicits editor preference via forced-choice pairs**, not by mining history. The R6-specific architecture decision (incl. the §4.1 backtest-target drop) homes in `docs/r6/R6_Scope.md`; this amendment records only the durable, cross-release provenance fact.

**2026-07-12 correction + reject-pool measurement.** The original first bullet conflated `IssueItems` (allocator output, genuinely earliest-date) with `issue_history.json` (the published Beehiiv record, editorial and predating the allocator by ~15 months) — only the `IssueItems` half was ever earliest-date. Separately, a small genuine **selection** signal *does* exist in Airtable, recovered by scoping `Status` changes to the actual curation session (not the whole approval history): the clean editorial work was **3 clustered days — 2026-05-28 (11 approve / 7 reject), 05-30 (5/5), 05-31 (4/2)** = **~20 approvals + ~14 rejects**. Unlike the Apr-11 bulk-enrichment rejects (B2B/civic eligibility junk), the session-day rejects are valid consumer events the editor passed over (paint night, Bachata festival, Gluten Free Garage, etc.) — real keep-vs-reject signal. **Usable as a directional R6 selection check (does a score rank the ~20 keeps above the ~14 passes, within segment?), too small (N≈34) to train on.** Parked in `docs/r6/R6_Scope.md`. Field landmine: the column is literally `StatusLastModified ` **with a trailing space** — querying the clean name 422s (GH issue filed).

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

### Amendments 2026-06-04 — signal audit + live-data findings

A first-principles signal audit plus a 484-record live-Candidates audit collapsed the R6 signal set. **Core principle established: a signal is inert if it does not vary between two candidates competing for the same slot.** Under hard per-segment quotas with no cross-segment competition (`buildIssues.js` fills each section from its own pool), any signal constant within a segment cannot change which candidates are picked. This is the test that now governs all signal inclusion.

| Finding | What changed |
|---|---|
| **Segment click weight inert** | CUT. Constant within a segment ⇒ identical within-segment ranking ⇒ same picks. A per-segment weight adds the same constant to every event in the section and moves no decision. |
| **Live pool ~93% Eventbrite monoculture; `Source` + `LocationName` 0% populated** (484-record audit) | Source prior and venue recurrence cannot discriminate on the current pool. Both **blocked until R5** diversifies sourcing AND `LocationName` is populated at ingestion (new R5 dependency). |
| **Recency dropped** (client: dates don't matter, only quality) | Removed from the formula; the date window remains an eligibility filter only. See §30. |
| **Featured/locked-by-editor** | CUT — label leakage ("featured" is the outcome being predicted; "locked" is already removed from the pool by the allocator). Durable intent re-keyed to venue recurrence. |
| **Source ≠ venue** | They diverge at aggregators (the majority + highest-click, FB = 58% per §18). Venue recurrence is the real signal for aggregator-sourced events but needs a clean venue key the current data lacks. Salvage: client-curated trusted-venue boost, matched on `Event Title`. |
| **SegmentConfidence** | Confirmed NOT a ranking signal — it is a pre-ranking **gate** (low confidence → NeedsReview), distinct from the quality floor (low score → empty slot). Two floors, two stages. |

**Net effect on v1:** with recency dropped, source inert, and venue blocked, the current pool has **zero working scoring signals**. R6 is gated on R5 (pool diversity + `LocationName` population) plus the incoming client venue list. No scorer is built until R5 lands.

**Method-fit shift — formula vs LLM picker:** the client's "only quality matters" is fuzzy editorial judgment, which a weighted-rule formula captures poorly. With the structured signals gutted, an **LLM/hybrid picker** (deterministic numerics as context + LLM for the qualitative pick + editor approval + logged rationale) becomes the leading candidate over the rule formula. This does not reverse the rules-not-live-model decision for a *structured* path — it reopens whether R6 should be a structured scorer at all. Because R7 (trained classifier) already carries the ML-rigor portfolio load, R6 is free to optimize for product fit. **Decision deferred to post-R5**, evaluated against a real diversified pool.

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

---

## 32. R5-W1 Source Gate and Facebook Framing

**Decision: proceed to W2 with TRCA, Markham BiblioCommons, McMichael, and Meetup as the four source branches; keep Facebook for W3 manual intake.**

*Decided 2026-06-04 from R5-W1 last-7-issue audit. See `docs/r5/R5-W1_revised.md` and `docs/r5/R5_W1_analysis_last7.md`.*

### What changed

The R5-W1 source audit now uses an explicit last-7-issue domain tally rather than an asserted manual summary. In that slice, Facebook accounts for 85 of 383 raw placements (22.2%), while the earlier clicks analysis found Facebook accounts for 58% of event clicks. This changes the W3 framing: Facebook is not necessarily the majority volume source in recent issues, but it is high-click inventory. The manual intake path is still required because missing Facebook submissions likely removes high-value events, not merely a large count of events.

### Source decisions

- **TRCA / Black Creek:** proceed. `calendar.trca.ca` produced 23 placements across Families, Couples, and Golden Age in the last 7 issues. Prefer iCal if available; fall back to JSON-LD per event page.
- **Markham BiblioCommons:** proceed. 23 placements, mostly Golden Age. Use per-event iCal rather than an undocumented API as the first implementation method.
- **McMichael:** proceed. Last-7 volume is lower, but the clicks analysis shows strong average clicks on a small sample. Use as a source-selection signal only; do not create a source-specific scoring weight until sample size is larger.
- **Meetup:** proceed, but configure from concrete group feeds rather than the global seniors search page. Last-7 Meetup placements were in For Couples, not Golden Age, so senior-specific Meetup coverage requires a separate curated group list.

### Config decision

The R5 config must be tenant-shaped, not just a Vaughan source list. Required fields are `airtableBaseId`, `beehiivPubId`, `segments`, `sources`, `geography`, `quotas`, `scoringWeights`, and `prompts`. Geography is closed: Markham and Richmond Hill are included alongside Vaughan. The idempotency key remains `title|date`.

### Remaining blocker

The published URL to Airtable Candidates.URL cross-reference (analysis 4) remains blocked until a current Candidates snapshot or Airtable credentials are available. W2 source-branch work can start after the W1 check-in, but this data-quality check should be completed before relying on historical match rates for scoring or PI claims. **Note (2026-06-04, Ariel): superseded in substance by the 484-record live audit — pool is ~93% Eventbrite, `LocationName`/`Source` 0% populated. Analysis 4 is low-value to chase and is not a W2 blocker.**

---

## 33. Config Lives in n8n Set Node for R5 — JSON File Is a Snapshot, Not a Live Consumer

**Decision: for R5, the newsletter config is canonical in an n8n Set node at the top of R1. The committed `vaughan` JSON file is a version-tracked snapshot/seed, not read by any runtime in R5. Script-side `--newsletter` file loading is an R8 concern.**

*Decided 2026-06-04, Ariel. Reconciles §15 and the R5_Scope W2 section, which described different multi-tenant config mechanisms.*

### The contradiction this resolves

- **§15** describes config as a file at `/newsletters/{name}.json`, loaded by scripts via a `--newsletter` flag.
- **R5_Scope W2** describes config as an n8n Set node, *no JSON file needed now*, with Mississauga getting a cloned workflow at R8.

These are not two phrasings of one plan — they describe two different mechanisms. They are not actually in conflict once split by runtime: the pipeline is heterogeneous. **§15 describes the Node.js script half (R3/R4), which reads files and takes flags naturally. W2 describes the n8n half (R1/R2), which cannot read a file on disk or take a flag and is natively configured by a Set node.** Each doc spoke as if its mechanism covered the whole pipeline; neither does.

### Resolution

- **R5 is entirely n8n work.** The only runtime consumer of config in R5 is the n8n Set node. The R3/R4 scripts keep Vaughan hardcoded until R8 — out of scope to change now.
- **The JSON file (`vaughan.r5-w1.config.json`, in `docs/r5/`) is the spec and the R8 seed.** It pins down the portable schema shape (the *keys*) and is what script-side multi-tenancy will load at R8. It is read by nothing in R5.

### Sync direction — n8n is canonical, file is the snapshot

Both the Set node and the file exist, so they can drift. The sync flows **n8n → file**, never file → n8n:

- Edit the Set node (the only thing that runs), then commit an updated copy of the JSON file in the same change.
- If the export-to-file step is forgotten, only the *reference* is stale — nothing live breaks.
- The inverse (edit file, copy to n8n) is rejected: forgetting the copy means n8n silently ships a stale config on Thursday.

No automated sync (HTTP-fetch-from-git) is built. At 2 newsletters with rarely-changing config, that adds a live-pipeline failure mode to save a hand-copy that happens a handful of times. Revisit only at newsletter #5+.

### Portable asset

The reusable contract is the config **schema shape** — the key set (`airtableBaseId`, `beehiivPubId`, `geography`, `segments`, `quotas`, `sources`, `scoringWeights`, `prompts`). Mississauga reuses the keys verbatim with different values. Invest in the keys being right and complete; the values are Vaughan-specific.

---

## 35. AllEvents Vaughan — Direct JSON-LD Branch + W2c Coupling

**Decision: AllEvents Vaughan is integrated as a direct JSON-LD branch fetching `allevents.in/vaughan-on/all`, paginating via `rel="next"` dynamically. This branch ships in the same slice as the W2c geo-filter — never before it.**

*Decided 2026-06-06, Ariel. From source probe + gutcheck + pro-approach.*

### Integration path

1. Fetch `https://allevents.in/vaughan-on/all` (server-side rendered React — no browser needed)
2. Extract `<script type="application/ld+json">` blocks, find items where `@type = "Event"`
3. Fields: `name` (title), `startDate` (clean YYYY-MM-DD), `url`, `location.name`, `addressLocality`
4. Follow `<link rel="next">` to subsequent pages until absent — currently 3 pages / 135 events, but do not hardcode; page count fluctuates seasonally
5. Normalize to pipeline schema, connect to Merge

JSON-LD completeness confirmed: 45 JSON-LD events vs 50 card divs per page — gap of 5 = embedded ad cards (confirmed via class inspection). No real events are missed.

### Why coupled with W2c

AllEvents labels many Toronto-area events as `addressLocality = "Vaughan"` (e.g. "Puppy Yoga IN TORONTO", "JEY ONE TORONTO CANADA"). Unlike TRCA and McMichael (venue-specific sources with known locations), AllEvents is a broad aggregator where mislabeling is structural. Building this branch without the geo-filter would actively flood the pool with non-Vaughan events — the opposite of R5's goal.

TRCA and McMichael can ship before W2c because they're venue-specific and geography is implicit. AllEvents cannot.

### Dedup risk (post-build check, not pre-build blocker)

AllEvents aggregates from Eventbrite. Same event may appear in both branches with slightly different titles → different UniqueEventID → two records. Cannot quantify before a real run. After the first run: query Airtable for candidates on the same date with similar titles. If overlap is small, ignore. If large, add a title normalization step.

### Portable asset

The JSON-LD extraction + rel="next" pagination pattern is identical to TRCA's multi-page scrape and is reusable for any source that exposes Event schema on server-rendered HTML. Mississauga may have a similar AllEvents page (`allevents.in/mississauga-on/all`) — same branch structure, different URL, same code.

---

## 36. RSS Branch Strategy — Retire in Favour of Direct Branches

**Decision: the existing Inoreader RSS branch is retired. Direct source branches (TRCA, McMichael, AllEvents, and future additions) replace it. CityPlayhouse is dropped — no viable endpoint exists.**

*Decided 2026-06-06, Ariel. From RSS content inspection + source probes.*

### Why RSS can't be fixed

The RSS date parsing bug (#58) made fixing the RSS branch the obvious path. Live content inspection showed fixing it is not viable for the sources that matter:

- **AllEvents.in** — description is completely empty in the RSS feed. No event date present at all. #58 can't be applied to data that doesn't exist.
- **Eventbrite** — already handled by the direct Eventbrite API branch. Redundant in RSS; no additional value.
- **Tickets Playhouse (CityPlayhouse)** — WordPress site publishes posts per show and then deletes them. Inoreader cached 13 items; the live feed returns 0. Even if the date format ("June 27, 2026" in description text) were parseable, the feed is unreliable by design.

Fixing #58 would only help Tickets Playhouse (17 items, unreliable source). Not worth a fragile HTML-parsing solution.

### Why direct branches are better for event pipelines specifically

RSS `isoDate` is the feed publication date, not the event start date. For news articles these are the same; for events they diverge by weeks or months. Every event-focused source requires either: (a) a structured endpoint with a real `startDate` field, or (b) date extraction from HTML description text (fragile, per-source, breaks silently). Direct branches solve the problem at the source — JSON-LD, iCal, and API responses all carry real event dates.

### What happens to the RSS branch

Disable it after direct branches are verified over 3 runs and the pool is healthy without it. Do not delete it — the n8n nodes remain for reference. The Inoreader subscriptions can stay as a monitoring layer (Inoreader shows when a source goes stale), but the pipeline reads around it.

### Portable asset

The pattern — probe each source for a structured endpoint, build a direct branch per source — is the reusable asset for Mississauga and future clients. Each adapter is a pure function: `raw source → canonical Candidates record`. The RSS aggregation approach was a shortcut that assumed event dates would be in standard RSS fields; at this domain they aren't.

---

## 37. R5 Pool Metric — New+Approved, Not Approved Alone

**Decision: the R5 pool growth metric is New+Approved (pipeline-processed candidates not rejected). Approved alone is not a valid growth metric for R5. Per-issue in-window depth is the real floor metric.**

*Decided 2026-06-06, Ariel. From snapshot analysis post-W2a.*

### Why Approved is the wrong metric for R5

R5's job is source expansion — adding events to the pipeline. Approved is the client's editorial decision: the client manually reviews New candidates and marks them Approved when they're good enough for the newsletter. Approved lags the real pool by however long it takes the client to review, and it reflects editorial quality judgment (R7's job) not ingestion volume (R5's job). Using Approved to measure R5 success means the metric is partially controlled by when the client has time to review — outside R5's scope.

**New+Approved = all pipeline-processed candidates that haven't been rejected** — this is what the pipeline actually produced and what R3 can potentially allocate from.

### The per-issue depth finding

After W2a (TRCA + McMichael live): 525 New+Approved total, 160 in-window across all future issues. But per-issue depth is only ~70 — 90 of the 160 in-window candidates are for future issues (a month out), not the immediate next issue. 70 is below the 3:1 floor of 75 per issue.

This reframes the remaining R5 work: the goal is not just total pool growth but ensuring each individual issue has ≥75 in-window candidates. AllEvents (135 events per run, refreshed weekly) directly targets this because it carries near-term upcoming events.

### What this changes

- `NA/Vaughan_Metrics_Log.md` pool baseline updated to New+Approved (388 at R5 start, not 103 Approved).
- R5 milestone snapshot table tracks New+Approved over time, not just Approved.
- Success criterion is per-issue in-window depth ≥75 (3:1 ratio), not total pool size.

### What doesn't change

The roadmap's "Approved ≥ 75" success line is superseded in practice — the real criterion is per-issue in-window depth. The Approved count remains tracked as a secondary metric and as the editorial signal for R6 scoring quality.

---

## 34. n8n Source Branch Pattern — No Loop Nodes at Small Scale

**Decision: for source branches ingesting from scraped/paginated sources at newsletter scale (~2–50 pages, ~10–150 events), do not use Loop Over Items nodes. Let n8n's native item processing handle sequencing.**

*Decided 2026-06-05, Ariel. Emerged from building the TRCA branch in R1-W2a.*

### The problem loops caused

The TRCA branch initially used two nested Loop Over Items nodes — one to process listing pages, one to process each listing page's HTML before slug extraction. This caused the downstream pipeline (Clean/Filter → Sort → Make UniqueEventID → Validity Filter → DateWindow → Upsert Candidates) to fire once per listing page (3 times) instead of once per workflow execution. All downstream item counts were inflated and the upsert ran 3 separate times unnecessarily.

### Why loops weren't needed

n8n processes items sequentially by default when a node receives multiple items. When Code in JavaScript1 outputs 3 page URL items, HTTP Request automatically runs 3 times — once per item — without explicit loop control. The loop nodes were adding explicit "one at a time" control on top of behavior that was already happening natively, with the side effect of re-triggering downstream nodes per iteration.

### When to use loops

Loop Over Items nodes are warranted when:
- Hitting a rate-limited API with an explicit request ceiling (e.g. OpenAI, Twitter)
- The downstream chain must not fire until all iterations are fully complete AND n8n's native batching doesn't guarantee that
- Batch size needs to be explicitly controlled (e.g. send exactly 10 at a time)

At newsletter scale with scraped sources (TRCA: 3 pages, ~30 events; McMichael: 1 iCal endpoint), none of these apply.

### Portable asset

All future source branches follow the same pattern: source node outputs N items → HTTP Request runs N times automatically → Code node processes all N results → Merge → existing downstream path. No loop nodes unless a rate-limit or batch-control requirement is explicitly identified.

---

## 38. Source Probe Methodology — DevTools-First (2026-06-06)

**Decision: all future source probes start with Chrome DevTools network inspection before any blind endpoint probing.**

*Decided 2026-06-06, Ariel. Emerged from source probe session where three sources were initially assessed as DROP or headless-browser-only, then confirmed fully automatable once DevTools was applied.*

### What went wrong

visitvaughan.ca, unionville.ca, and VPL were all probed by guessing common endpoint patterns (RSS paths, WP REST API, JSON-LD, iCal). All three returned dead ends. The correct data endpoints were only found after opening Chrome DevTools → Network tab → inspecting what the page actually requests on load. visitvaughan.ca and unionville.ca both use WordPress `admin-ajax.php` with plugin-specific action parameters (`haven_calendar`, `load_upcoming_events`) that are invisible to blind probing. VPL's events are server-side rendered HTML — dismissed as a client-side SPA because the BiblioCommons subdomain (which IS a SPA) was probed instead of the correct `vaughanpl.info` domain.

### The correct probe order

1. **DevTools first** — Network → Fetch/XHR → reload → find the data call → Payload tab → replicate as direct POST/GET
2. **Check main HTML document** — Network → Doc → first request → Response tab — catches server-rendered pages
3. Only then: blind probing (RSS paths, WP REST API, JSON-LD, iCal, admin-ajax patterns)
4. Headless browser is last resort, only after all above are confirmed dead ends

### Why this matters

Three false DROP verdicts in one session from the same root cause. The correct signal is always in the network traffic — what the browser actually fetches is the ground truth, not what we guess an endpoint might be. Two minutes in DevTools replaces 30 minutes of blind probing.

### Applies to

All future source probes for R5 remaining sources and Mississauga onboarding. Previously dropped sources (CityPlayhouse, Markham BiblioCommons, Meetup) to be re-verified via DevTools before drops are finalized — DevTools was not applied to all of them at time of original assessment.

---

## 39. UniqueEventID Normalization — Centralized, Resolved and Shipped (2026-06-07)

**RESOLVED same day — see "Resolution" section below for the final decision, what shipped, and why the original recommended path was overturned by new evidence.**

**Original framing (superseded — kept for context):** While fixing a McMichael duplicate-record bug, discovered that title-text normalization for `UniqueEventID` computation should be centralized in the shared `Make UniqueEventID` node (the one chokepoint every source branch funnels through after `Merge`) rather than duplicated per-branch. But auditing the existing 634-record `Candidates` table before shipping that change revealed the dataset is *already* inconsistent: 16 records (from Eventbrite/RSS) store curly-quote `UniqueEventID`s, while McMichael's iCal-derived records use straight ASCII quotes — both computed under the current `norm()`, which has never normalized quote characters, just preserved whatever each source's raw text contained.

*Surfaced 2026-06-07, Ariel + Claude. Emerged from the McMichael REST API migration (iCal → Tribe REST API) duplicate-bug investigation.*

### Why this blocks a simple centralized fix

Any single normalization direction for the shared node breaks *something* already live:
- **Straighten to ASCII:** breaks the 16 existing curly-quote records — several have future dates and will likely be re-fetched by their source feeds in upcoming runs, generating real (not theoretical) duplicates.
- **Decode to curly Unicode:** re-breaks the 4 known McMichael "Les Chefs/Racines" records that were just manually reconciled to straight quotes during this session's fix.

There is no normalization rule that's consistent with 100% of what's already in the table — the inconsistency predates this investigation and was invisible until a source migration (McMichael) produced text that collided with it.

### What this means going forward

- `UniqueEventID` matching has an implicit precondition that was never documented: title text must be normalized to match *whatever convention already exists* for that specific data — not to some abstract "more correct" typographic form. Decoding HTML entities to their typographically "correct" curly Unicode equivalents is *not* automatically the right choice; it depends on what's already stored.
- This is a genuine blast-radius problem for a live system: `UniqueEventID` is the matching key for `Candidates` *and* `Historical` *and* potentially `IssueItems` linkages. A centralized normalization change is exactly the kind of shared-infrastructure edit that needs a reconciliation plan first, not a quick fix — confirmed by finding 16 records that would have silently broken had the originally-drafted "straighten everything" version shipped.

### Recommended path (not yet executed)

Manually reconcile the 4 known McMichael records to curly-quote form (smaller, single-source, fully known cleanup) so the dataset converges toward the direction with more existing precedent (16 > 4), *then* centralize entity-decoding-to-curly-Unicode in `Make UniqueEventID`. Resume and finalize next session — see `Execution_Log.md` 2026-06-07 entry for full investigation detail.

---

### Resolution (same day, 2026-06-07 — overturns the recommended path above)

**The "16 > 4, converge toward curly" framing was based on an incomplete signal and turned out to be wrong.** Before implementing it, ran the obvious follow-up check: is the curly-vs-straight split *correlated with source* (a real per-source convention worth preserving), or is it random noise?

**Audit method:** grouped all 634 `Candidates` records' `UniqueEventID`s by source domain (via the `URL` field — `Source` itself is 0% populated, a known gap from the 2026-06-04 pool audit). Result: **both curly and straight quotes appear within the same domain** — including within McMichael itself (4 straight, 4 curly, same source, same ingestion path). Eventbrite.ca, eventbrite.com, and allevents.in show the identical mixed pattern.

**Conclusion: there is no existing convention to preserve.** The variation is per-title, not per-source — it traces back to how individual event organizers typed their own titles (smart-quote-enabled editor vs. plain ASCII vs. which HTML entity their CMS happened to encode), not to any system-level choice any of our sources made. The "16 vs. 4" framing made it look like two sources disagreed; in reality the *entire dataset* has always disagreed with itself, title by title, invisibly, until McMichael's REST migration produced a text that collided with it.

**Decision shipped:** Canonicalize everything to **straight ASCII** — simpler, plain-ASCII, and the form the rest of the pipeline already assumes by default. No source-aware logic needed (there's no source signal to key off).

**What was built — one shared canonicalization function, applied identically in both places that compute `UniqueEventID`:**
1. Decode HTML entities (`&#8217;`, `&amp;`, etc. → literal characters) — generalizes the fix already proven necessary for McMichael to every branch.
2. Map curly quotes/em-dash/en-dash/minus/non-breaking-space/ellipsis → ASCII straight equivalents (an explicit, bounded equivalence table — not a general Unicode detector).
3. Apply Unicode NFC normalization (collapses precomposed vs. combining-character variants, e.g. "Café" stored two different byte-equivalent ways — handles accented titles, e.g. French-language McMichael events, for free).
4. Lowercase, trim, collapse whitespace (existing behavior, preserved).

Tagged `NORMALIZATION_VERSION: v2 (2026-06-07)` as an inline comment in both locations, with an explicit note that any future change to this logic requires re-running the backfill script across the full table — establishing the versioning discipline for whoever (Nathan, future Ariel, Mississauga build) touches this next.

**Where it lives (the contract, made explicit and centralized for the first time):**
- `workflows/NLAP R1.json` → `Make UniqueEventID` node, `norm()` function — the live, runtime computation every branch funnels through after `Merge`.
- `scripts/updateUniqueEventIDs.js` → `computeUniqueEventID()` — the one-time backfill tool, now required to compute *byte-identical* output to the live node (this was a real, separate bug found mid-fix: the script's old version didn't collapse internal whitespace the way the node did — a second silent-drift risk in the same family, fixed in the same pass).

**Backfill executed:** ran `updateUniqueEventIDs.js` against all 634 live `Candidates` records. **82 updated, 552 already correct (no-op, as expected for ASCII-only titles), 0 errors.** Post-run audit found 19 duplicate-ID groups — verified these are **pre-existing duplicates from before the `UniqueEventID` system existed** (plain-ASCII titles, dated March–April 2026, mostly already `Status = Rejected` per the existing manual dedup protocol in §3) — confirmed unrelated to and untouched by this migration. Zero new collisions created.

**Why this is the right level of engineering (method-fit note):** explicitly did *not* build a general Unicode-look-alike detector or attempt NFKC-level compatibility normalization — both would be solving for character classes that don't exist in this dataset today (the "more sophisticated than the problem warrants" trap). The bounded equivalence table covers exactly what's live now (quotes, dashes, the McMichael entity pattern); NFC is the one "free" standard-library addition that costs nothing and closes an entire adjacent bug class (combining-character variants) without inventing anything bespoke. Future variants get caught by the same forensic method that found this one — codepoint-level diffing the moment a near-duplicate's IDs don't match — not by pre-emptive enumeration.

**Transferability:** the *contract* (normalize-before-compare, one shared chokepoint, explicit version tag, mandatory full-table backfill on any change) is the portable asset for Mississauga — the specific equivalence table is Vaughan-data-specific and will need its own audit pass against whatever CMS quirks Mississauga's sources carry.

---

## 40. Integration Tier Ranking — Ranking Source Integration Paths by Transferability, Not Just Ease (2026-06-07)

**Decision: when evaluating a confirmed integration path for a source, rank it on a 5-tier scale that weighs *transferability to a second client* as a separate axis from *raw build effort* — not just "does it work."**

*Decided 2026-06-07, Ariel + Claude. Emerged directly from re-running §38 (DevTools-First) properly on Meetup and CityPlayhouse — both flipped from DROP to PASS, but landed on a different tier than AllEvents/TRCA despite looking like comparably "clean" wins.*

### What prompted this

Re-verifying the three previously-dropped sources (per §38's "applies to" note) surfaced two real overturns: Meetup's search/discovery page embeds 37 structured events in its `__NEXT_DATA__` Next.js hydration payload, and CityPlayhouse's ticketing storefront embeds a Red61 calendar JSON blob with exact showtimes. Both are clean, single-fetch, no-headless-browser paths — mechanically in the same "good outcome" bucket as TRCA's JSON-LD or AllEvents' direct API.

But describing them as "the same tier" (which is what happened in-conversation, initially) was imprecise and would have mis-set build-cost expectations. AllEvents' API and TRCA's JSON-LD produce *reusable* integration code — an API client pattern or a schema.org parser will very likely work, or need only minor changes, on a structurally similar source for the next client (Mississauga, future newsletters). Meetup's `__NEXT_DATA__` and CityPlayhouse's Red61 blob are *bespoke* — every framework/platform embeds its hydration state in its own non-standard shape, so the parser written for one won't transfer to the next, no matter how clean the individual integration looks.

### The five tiers (full detail and source mapping in `docs/source_decision_sheet.md` → "Integration Tier Ranking")

1. **Direct JSON/REST API** — purpose-built endpoint, structured response, you control pagination/filters (AllEvents, McMichael, visitvaughan.ca, Eventbrite)
2. **JSON-LD** — `schema.org` standard markup; parsing code is standardized and transfers across any site using it (TRCA)
3. **Embedded app-state JSON** — framework-specific hydration blobs (`__NEXT_DATA__`, Red61 calendar JSON); mechanically clean but bespoke per framework, doesn't transfer (Meetup, CityPlayhouse)
4. **HTML-card scraping via ajax/admin endpoints** — functional, zero infrastructure, fragile to redesigns, fully bespoke (unionville.ca, VPL)
5. **Headless browser required** — worst tier, worse than scraping (Markham BiblioCommons — `initial_state: null`, confirmed nothing is server-rendered or pre-fetched)

### Why this matters

Tiers 1–2 are where reusable integration code lives — time spent there pays down scoping cost for the *next* client. Tiers 3–4 are where you're budgeting one-off, source-specific build time every single time, regardless of how clean any individual integration looks in isolation. Without this distinction, "found a working path" reads as a uniform win — which would understate the real cost of building and maintaining Meetup- and CityPlayhouse-shaped integrations relative to AllEvents- or TRCA-shaped ones, and overstate how much of that work transfers to Mississauga.

### Applies to

W2c source-build prioritization (weigh tier-1/2 sources' transferability payoff against tier-3 sources' real-but-bespoke yield when sequencing build order), and all future source evaluation for Mississauga onboarding and beyond — this is now the standard lens for "is this integration path actually as good as it looks," layered on top of §38's "how do you find the path" methodology.

---

## 41. Upsert Ownership Contract — R1 Never Writes Editor- or R2-Owned Fields (2026-06-10)

**Decision: the R1 Upsert writes ingestion facts only. Editor-owned fields (Status, Score_Manual) and R2-owned fields (SegmentConfidence) are never in the Upsert mapping. Create-time defaults (Status = New) are set by an Airtable automation that fires on record creation — structurally incapable of touching an existing record.**

*Decided 2026-06-10, Ariel + Claude. Prompted by a live bug found via gutcheck during W2c pre-build work.*

### What prompted this

The Upsert mapping had hardcoded `Status: "New"`, `Score_Manual: 0`, and `SegmentConfidence: 0` since the workflow was first built. n8n's Airtable upsert writes **all mapped fields on match**, not just on create — so every record a source re-fetched had the editor's Status silently reset to New on every R1 run, manual scores zeroed, and R2's computed confidence wiped. Proven live: an Approved McMichael record flipped back to New after a single R1 run.

The bug was latent for months because the conditions to observe it barely existed: Eventbrite's feed rolls (old approved events stop appearing, so they were never re-matched), and the stable re-fetched branches (McMichael, TRCA) only went live the week of 2026-06-05 — with zero of their records yet Approved. The first weeks of W2c source expansion would have turned a latent bug into weekly erasure of the editorial layer — which is also the exact hard signal R6 scoring trains on (locked/featured/approved as ground truth).

### The fix

1. **Removed** Status, Score_Manual, SegmentConfidence from the Upsert mapping. R1 now maps only: Event Title, City, URL, Start Date, End Date, DescriptionRaw, UniqueEventID, Last Auto Update, LocationName, Source.
2. **Airtable automation** ("when record is created in Candidates → update record → Status = New") supplies the create-time default. Built and tested in the Airtable UI, turned on.

Considered and rejected: a split create/update path in n8n (IF-on-existence routing to separate Create and Update nodes). Correct semantics, but an extra table scan per run and more nodes for a junior contributor to misread — the one-action automation gets create-only semantics structurally, and lives next to the data where the editor can see it. Revisit only if Airtable automation run quotas become a problem.

### The contract (the portable part)

**R1 owns ingestion facts. The editor owns judgment (Status, Score_Manual). R2 owns enrichment (SegmentConfidence, SegmentSuggested, R2Status).** No pipeline write path touches another owner's fields on update. Any future field added to the Upsert mapping must answer "who owns this on update?" first — if the answer isn't "R1," it doesn't go in the mapping.

### Applies to

Every current and future R1 source branch, the Mississauga base clone at R8-W10 (replicate the automation per base), and any new write path Nathan builds. Residual cleanup tracked in Execution_Log: confirm the automation fires on the first new-record batch; audit Enriched records with zeroed SegmentConfidence from past clobber runs and re-run R2 on them.

**2026-06-11 amendment:** Workflow inspection confirmed the original fix was partial — only `Status` had been removed; `Score_Manual: 0` and `SegmentConfidence: 0` were still actively mapped. Both removed this session. 64 in-window Enriched records with SegmentConfidence=0 identified and reset to Pending; R2 re-pass completed.

---

## 42. R1 City Capture — Aggregator Sources Write Real Venue City; Geo-scope Is Downstream (2026-06-11)

**Decision: R1 captures whatever city the source reports for each event's venue. R1 does not filter by geography. Geo-scope policy (what counts as in-scope for a given newsletter) lives downstream — in editorial views, allocation logic, or explicit editor action — not in the ingestion layer.**

*Decided 2026-06-11, Ariel + Claude. Prompted by discovering BucketMaker was hardcoding no city at all, causing Eventbrite's full York Region feed to stamp every event as Vaughan.*

### What prompted this

Eventbrite's feed returns events across York Region, not just Vaughan. BucketMaker was emitting no `city` field, so all events fell through to the `|| 'Vaughan'` fallback. Run 407 city distribution (when real venue cities were read): Vaughan 27, Markham 16, Richmond Hill 11, blank/online 8, out-of-scope ~22 (Toronto, Newmarket, Georgina, Stouffville, others). All out-of-scope events had been entering the pool labeled Vaughan — inflating apparent pool depth and contaminating editorial views.

### The fix

BucketMaker now reads `primary_venue.address.city` and emits it as `city`. The `|| 'Vaughan'` fallback in `Make UniqueEventID` handles blank/online events. No filtering applied in R1 — out-of-scope cities now enter Airtable labeled correctly rather than hidden as Vaughan. Editor decision on blank/online events (8 per run) documented in `meetings/2026-06-11.md`, parked pending client sign-off.

### Why no in-branch geo-filter

Baking a Vaughan/Markham/RH include-list into any aggregator branch makes the filter a hidden pipeline assumption the editor can't see or override. The VB coverage area already expanded once (to include Markham and Richmond Hill). Filtering in R1 means every future coverage change requires a code change. Filtering downstream (Airtable views, allocation) is reversible and visible without touching the pipeline.

### Applies to

All aggregator source branches: Eventbrite (implemented), AllEvents, Meetup, CityPlayhouse, and any future multi-city aggregator. Single-venue sources (McMichael, TRCA Kortright, Black Creek) hardcode city — this rule only applies where the source itself spans multiple cities.

---

## 43. R1 Write Path — Retire Historical Table, Batch the Upsert, Dedup at `title|date` (2026-06-15)

**Decision: the R1 write path is `DateWindow → dedup-by-UniqueEventID → batched HTTP upsert`. The separate `Historical` table is retired. The `title|date` dedup key is kept coarse on purpose — same-day recurring sessions of one program collapse to a single record, and that is accepted.**

*Decided 2026-06-15, Ariel + Claude. Prompted by R1 runtime hitting ~14 min; root-caused to the Airtable write path, not table size.*

### What changed and why

- **Historical table retired.** The `Create Historical` node re-wrote every in-window `UniqueEventID` to a second table each run, but nothing read it — create-vs-update is decided by `Upsert Candidates` matching `UniqueEventID` against Candidates itself, not by a Historical lookup. Its IDs were a strict subset of Candidates, so deletion lost nothing. (Its only future use — a survivor ledger after a purge — is moot: we are **not** purging. Accumulation is free; `DateWindow` caps writes regardless of table size.)
- **Batched upsert.** n8n's Airtable node upserts one record per API call (n8n limitation, not Airtable). Replaced with a Code node chunking 10s → HTTP Request to Airtable's `performUpsert` endpoint. ~1,320 calls → ~55; runtime 14 min → ~35 s.
- **Intra-run dedup.** Required — the batch endpoint rejects updating the same record twice in one request, and the fetch stream contains same-key records. Dedup-by-`UniqueEventID` (last-wins) before chunking.

### Why the `title|date` key stays coarse

Investigated the 114 same-key collapses on a 659-record run: 38 cross-source (AllEvents↔Eventbrite, same event two platforms — correct) and 76 same-source BiblioCommons (one program — Storytime/Mini-Makers — across branches/times same day). The 76 are distinct sessions, but collapsing them is right for a curated newsletter (you'd never run six identical storytimes; one per program per day survives). **Adding venue/time to the key to preserve them would break the cross-source dedup** — the coarse key serves the more valuable goal. Dedup resolution should match the publication's resolution; a real-time events app would key finer.

---

## 44. Pipeline Observability — Post-R1 Health-Check Suite + Integrity Gate; One Source of Truth Per Fact (2026-06-16)

**Decision: every R1 run is followed by a four-check health suite (`scripts/postRunChecks.js`: snapshot → integrity → overlap → depth). The integrity check is the load-bearing one — it diffs consecutive snapshots and fails on the two corruption signatures no legitimate flow produces (a Candidate `Approved → New`/blank, or a `Lock=true` IssueItem losing its lock or vanishing). Separately: each fact in the doc system has exactly one maintained home; everything else points to it.**

*Decided 2026-06-16, Ariel + Claude. Prompted by a gutcheck of the project's own tracking practice during B4/B5 prep.*

### Why a monitoring layer now

The pipeline already had three useful checks (snapshot, overlap, depth) but none guarded the one failure mode that is effectively **irreversible**: silent overwrite of an editor's decision. §41 (the upsert-reset bug) proved that class is real and can sit latent for months — and the editorial signal it corrupts is also the R6/R7 training ground truth, so the damage compounds downstream. The integrity check is a targeted regression guard aimed exactly at that class, written for near-zero false positives (it ignores legitimate transitions like `New → Approved` and `Approved → Rejected`). A scheduler running it silently would be theater — the value is the alarm reaching a human, so a failure exits nonzero and (when wired) notifies; for now it runs by hand and the console is the alarm.

**Scope/altitude:** this is data-reliability *hygiene* on a small production pipeline, not a platform. ~150-line scripts hitting the API and diffing JSON. The judgment (aim the guard at the irreversible asset) is the point, not the code. Trigger stays by-hand while R1 is manual/dev; auto-firing is deferred to when R1 goes scheduled (GitHub #62), and the suite living *inside* the pipeline for handoff is an R8 question (#61).

### Why one-source-of-truth, and the rule

The same fact (R5 status, success metric, source count) lived in the roadmap *and* R5_Scope *and* Decision_Log — and they had silently drifted out of agreement, because copied facts drift by default. **Rule: release-level *status* lives only in the active Scope doc's Status Snapshot; `Execution_Log.md` is the chronological per-session log and does not restate status; the roadmap is frozen intent. On conflict, the Scope snapshot wins for status, Decision_Log wins for decisions.** The roadmap got a stale-redirect banner and `/start` was repointed at the snapshot, so the entry ritual and the source of truth no longer diverge.

---

## 45. Doc Organization — Three-Type Model by Durability; Per-Section Roadmap Freeze; /wrap Runs the Update Checklist (2026-06-16)

**Decision: organize docs by *durability*, not by release or by lifecycle-type. Every doc is one of three types — Living reference (update forever, `docs/` top level + `NA/`), Release-working (maintained during a release, frozen to `logs/` at close, `docs/r{N}/`), or Frozen record (never updated, `docs/archive/` + `logs/` + `meetings/`). Type is a header label, not a folder; placement is by durability. The roadmap freezes *per release-section* (a section freezes the moment its release gets a Scope doc), not all at once. `docs/README.md` is the canonical index of every fact's home + update-trigger. And `/wrap` runs the conditional-update checklist *for the user* — the agent scans the session and proposes which homes changed; the user only confirms.**

*Decided 2026-06-16, Ariel + Claude. Direct continuation of §44 — that entry stated the one-home rule; this one fixes the structure that kept violating it and removes the human cost of following it. Reached by walking the whole repo, not just `docs/`.*

### Why durability, not type, is the folder axis

The recurring drift (§44) had a structural cause: durable docs (the source register, the scrape blueprint) were filed under `docs/r5/`, so they *looked* R5-scoped even though sources and scrape methodology outlive every release. Organizing by **type** instead — a `frozen/` folder, a `working/` folder — fails for a subtler reason: type is a *lifecycle stage* (working → frozen) that changes at every release close, so a type-folder just relocates the re-filing churn rather than removing it. Durability is intrinsic and permanent, so a durability layout never needs re-filing. Executed: `source_decision_sheet.md` and `scrape_blueprint.md` (was `R5_ScrapeBlueprint.md` — the prefix lied about its lifecycle) moved up to `docs/`; the dead `NLAP_Roadmap_v2.txt` archived; `roadmap_v3.md` kept in `docs/` because R6–R8 are still live plan.

### Why the roadmap freezes per-section

`roadmap_v3.md` is mixed-maturity: its R5 section is superseded (read R5_Scope for status) but R6–R8 are not yet started and have no Scope doc, so the roadmap *is* their source of truth. Archiving the whole file would bury a live plan; band-aiding it with a global "stale" banner (the §44 stopgap) invites the next drift. Resolution: a section is live intent until its release opens, then frozen the moment that release gets a Scope doc. The file retires to `archive/` only post-R8 once every section is consumed.

### Why /wrap runs the checklist (the real cost was decision fatigue, not writes)

The felt burden was never the few lines of writing — it was the per-session mental scan ("do I update this one? this one?"). The fix is to encode the checklist in the routine, not the human's head (same principle as a PR template or definition-of-done). `/wrap` now appends the journal + changelog automatically, then *proposes* updates for each conditional home (Decision_Log, source sheet, metrics log, issues); the user reacts yes/no instead of generating the list. Two write-once patterns ride along: a decision's rationale homes in Decision_Log and the journal only points at it; a metric's number homes in `Vaughan_Metrics_Log.md` and the portfolio case study renders from it — never authored twice.

**Scope/altitude:** doc-organization hygiene on a solo ~25-doc project, not a knowledge-management system. The whole change is 3 file moves, 1 archive folder, 1 index, 2 rule edits, and a `/wrap` upgrade — proportionate only because the drift pain was real and the moves are cheap. The 80/20 that carries the weight is the one-home rule (§44) plus the conditional-checklist offload; the folder layout is the supporting polish.

---

## 46. Deduplication Scope — Exact-Key Only on the Write Path; Fuzzy Stays Report-Only; Featured-Dupe Is the Human Backstop (2026-06-17)

**Decision: the pipeline's only deduplication is the exact `norm(title)|date` upsert key, and it stays that way. Fuzzy/similarity matching (token Jaccard, venue+date) lives only in `overlapAudit.js` as a read-only advisory report — it never gates a write, merges a record, or drops a candidate. Cross-source duplicates that slip the exact key (divergent titles, ±1-day timezone rollover) are accepted into the pool and caught downstream by the editor (human-in-loop) plus the max-1-venue-per-section rule. No fuzzy-suppression layer and no duplication metric are built now; both are deferred until the *featured*-dupe rate — dupes reaching the 25 newsletter slots, not the candidate pool — is measured post-ship and proves to matter.**

*Decided 2026-06-17, Ariel + Claude. Surfaced while evaluating B4/visitvaughan, a curated aggregator that re-lists ~10 events/run already in the pool — forcing the question of whether to build cross-source dedup.*

### Why fuzzy never touches the write path

The exact key is the *conservative* choice: it can never falsely merge two genuinely distinct events (e.g. "LEGO Trophy at Staples #155" vs "#57") and can never silently overwrite an editor-approved row. A fuzzy key strong enough to catch divergent-title dupes would also start collapsing real distinct events — unacceptable on the upsert, where the failure mode is irreversible corruption of editorial signal (the §41 class, which is also R6/R7 ground truth). So fuzzy is demoted to an advisory report a human reviews. If active prevention is ever wanted, its safe home is **allocation (R3)** — which *chooses among* candidates rather than destroying records — not the upsert. Confirmed empirically this session: the venue+date pass runs ~50% false-positive (one "Private tour" record matched every same-day McMichael tour on the word "tour"), so it could only ever be advisory, never auto-action.

### Why featured-dupe, not pool-dupe, is the metric that gates any future work

A duplicate sitting in the ~1,257-candidate pool costs nothing — it's inert unless it reaches one of the 25 featured slots, the only place a dupe is a real editorial failure, and between editor review and the venue cap few would. The exact key's actual job is **idempotency** (re-running R1 doesn't double-insert), which it does perfectly — catching cross-source re-lists was never its purpose. Building fuzzy suppression or a bespoke duplication metric before the newsletter has shipped a full editorial cycle is solving a problem that may never reach the reader: over-engineering against a zero baseline. The right trigger is the editor's swap-out/override actions once live (signal auto-captured from work already happening), not new machinery now.

---

## 47. Audit Source Identity — Provenance (Stamped `Source` Field) Over URL-Derivation; Link-Out Sources Break the URL Heuristic (2026-06-20)

**Decision: in `overlapAudit.js`, a record's source is its *provenance* — the `Source` field stamped by the ingesting normalize node — with URL-domain derivation kept only as the fallback for legacy rows whose `Source` is blank. This overturns the prior "URL = ground truth, the Source field is unreliable" rationale, which held only while every source's event URLs pointed back to its own domain.**

*Decided 2026-06-20, Ariel + Claude. Surfaced building B5/unionville — the first link-out source.*

### Why the URL heuristic broke

The original audit derived source from the URL domain because the legacy `Source` field was blank on ~half the pool. That worked only because every source self-referenced: an Eventbrite event links to eventbrite.com, a Visit Vaughan event to its own product page. Unionville is a curated link-out board — its events link to the real host (Varley, PerfectMind, forms.gle, even eventbrite.ca), never unionville.ca. URL-derivation therefore (a) scattered Unionville across `(unknown)` and the linked domains, making its per-source tally meaningless, and worse (b) degraded cross-source detection: a unionville→eventbrite.ca event was mislabeled "Eventbrite", so a genuine cross-source re-list collapsed into a same-source pair and went uncounted.

### Why provenance is the right ground truth now

The `Source` field is no longer unreliable — every live normalize node sets it deterministically (`Unionville`, `Visit Vaughan`, etc.), so provenance is both accurate and exactly what the audit needs to answer: "which feed contributed this row, and does it duplicate another feed's row?" `canonicalSource()` normalizes the field string to the canonical keys `sourceFromUrl` returns and only falls back to URL-derivation when the field is blank (legacy rows), so a single source never splits across two buckets. Verified this session: Unionville resolved to 11 total / 1 dupe / 10 unique, `(unknown)` 13→3, Eventbrite 583→582 (the mislabeled link-out row moved to its true home).

---

## 48. Open-Work Tracking — Journal Narrates, Issues Track, Carry-Forward Enforced at /wrap; Reference Docs Hold State Not History (2026-06-20)

**Decision: open work lives in GitHub Issues (the tracker with open/closed state), `Execution_Log.md` stays a chronological narrative, and `/wrap` gains a carry-forward gate (new step 3) that forces every prior "Next" item to a disposition — done, has-an-issue, or dropped-with-reason — so nothing survives as untracked prose two sessions running. Corollary: a living reference doc records *current state*, never a graveyard of considered-and-rejected options.**

*Decided 2026-06-20, Ariel + Claude. Direct continuation of §44/§45 — those fixed where *facts* live; this fixes where *open work* lives. Prompted by the recurring pain of "Next" items silently falling off across chat handoffs and never getting redone.*

### Why the journal kept losing work

Open work was being tracked in an append-only journal, which has no closed-state — so items rotted in the "Next" blob, got re-summarized lossily at each handoff, and silently dropped. That's a structural mismatch (journal used as task tracker), not a discipline failure; a session-start hook that re-injects the blob treats the read end while the leak is at the write end (where an unresolved item gets copied forward instead of closed). The pro model resolves it: journal narrates, an issue tracker holds open/closed state, and Definition-of-Done is enforced at the boundary rather than remembered. The proportionate version for a solo 2-newsletter project is a four-line `/wrap` step plus the issues that already exist — not new infrastructure. It is an instruction, not a deterministic guarantee; escalate to a hook only if it observably still leaks.

### Why reference docs don't record the rejection

The client-source reconciliation this session deliberately wrote *nothing* to the Source Register. Recording 14 self-evidently out-of-scope drops (spas, cooking classes, redundant aggregators) would bloat a lean reference doc with history that belongs in the log — and the non-obvious calls (Meetup deferred, Richmond Hill on hold, aggregators redundant) are already in the Register as current state. A reference doc answers "what is true now," not "what did we consider." The reconciliation's value was the *act of checking* (nothing hidden, export stale, the "10 websites" note stale) — an event, which goes in the journal.


## 49. Facebook Manual Intake — AI-Assisted Extraction at the Client's Edge, n8n as the 10th Adapter, Linkless-Through with Editor Link-at-Selection (2026-06-21)

**Decision: Facebook intake is a manual, AI-assisted path that feeds the *automated* pipeline, not the client's parallel manual assembly. The client screenshots the FB events feed; a fork of the extraction prompt (`VB_FACEBOOK_INTAKE`, no scoring/blurbs) turns it into one tab-separated table; the client pastes it into an Airtable form (`FacebookIntake`); an n8n adapter branch (the 10th Merge input) parses it into the canonical intermediate shape so `Make UniqueEventID`/validity/window/dedup/upsert treat it identically to every automated source. Facebook events are allowed into the candidate pool WITHOUT a URL (a `Source=Facebook` exception to the no-link drop); the editor adds the link only for the ~4 events actually featured, at selection, backed by a pre-publish blank-link guard. The vision/extraction step — and any future link harvesting — stays on the client's edge (their ChatGPT / browser), never self-hosted.**

*Decided 2026-06-21, Ariel + Claude. The last R5 sign-off item (#35). DOM-extractor alternative deferred to spike #67.*

### Why manual is the legitimate path, not a fallback

Automated Facebook event ingestion is genuinely closed — the public events Graph API was deprecated years ago, and scraping the logged-in feed is a TOS/fragility liability. So "manual + AI-assist" isn't settling; it's the correct path. The standard pro pattern follows: a structured intake form → validation → idempotent upsert, with multimodal extraction (screenshot → vision) pushed to the *client's own* ChatGPT so we never own the vision cost, accuracy, or an upload UI.

### Why n8n adapter, not Airtable-native or a separate Node script

The pipeline is a pipeline because every source emits the same canonical object and the shared back-half owns scoring/blurbs/window/dedup for all of them. Making Facebook the 10th adapter (emitting the intermediate shape, inheriting the existing `title|date` upsert) satisfies W3's acceptance criterion — "processed identically to automated sources" — literally, and inherits idempotency for free. An Airtable-automation or standalone Node parser would fork the transform logic into a second engine and give Facebook special-case behaviour — the redundancy smell. The raw `FacebookIntake` table is a quarantine zone (unvalidated client paste never writes straight to the production pool); the parser is the boundary.

### Why linkless-through, and why the link is grabbed at selection

A feed screenshot structurally carries no event URLs, and FB event IDs (`facebook.com/events/{opaque-id}`) are not derivable from title/date/venue — you can only read the real `href` from the page DOM, which the screenshot discards. But a link is only *used* on the ~25 featured slots, never on the ~1,250-event pool. So requiring a URL at intake is friction in the wrong place: it would force the client to click into ~13 events weekly, ~9 of which never get featured. Deferring the link to selection means the editor grabs ~4 links/week, all on events actually shipping — the minimal, in-flow version. The pre-publish guard converts "editor forgot the link" from a silent failure into a caught one.

### Why the DOM-extractor is deferred (method-fit at n=1)

The technically superior fix — a client-side bookmarklet that reads the live DOM and outputs title+date+venue+link in one click — is real but carries ongoing maintenance (FB breaks its markup constantly). For one client, weekly, ~4 featured FB events, babysitting a scraper to save ~4 link-copies/week is more engineering than the problem warrants. Scale is the trigger to build it (it amortizes across clients/cities), the same logic that keeps the vision step on the client's ChatGPT rather than self-hosted. Captured as spike #67.


## 50. Facebook Extraction — Validated Offline; Parser-Tolerance Over Prompt-Strictness; ~17% Title-Misread Accepted Behind the Editor Backstop (2026-06-22)

**Decision: format-level nondeterminism from the AI extraction step is handled in the parser (tolerate trailing-tab over/under-count, fail loudly only on non-empty overflow), NOT by ever-stricter prompt rules; and the LLM path ships at a measured ~17% proper-noun title-misread rate because the editor reads every featured event's title at blurb-time, so the only silent-error class is caught where it matters. The DOM-extractor (#67) stays the escalation, triggered by scale or any automated title consumer.**

*Decided 2026-06-22, Ariel + Claude. Refines §49 with the offline-validation outcome (#35). Study: 3 screenshots × 2 runs, GPT-5.5 medium, graded via `scripts/gradeFacebookIntake.js`.*

### Why tolerance in the parser, not strictness in the prompt

A prompt rule ("end every row with a trailing tab") is a nudge an LLM obeys probabilistically — and the first version of that rule *induced* the opposite failure (an extra trailing tab → 7 columns → whole-row rejection) on 1 of 6 runs. Chasing whitespace with prompt text is whack-a-mole. The boundary the data crosses is the parser, so the guarantee belongs there: reconcile any row to exactly 6 fields by trimming *empty* overflow and padding shortfalls, while a non-empty 7th cell (real corruption) still fails loudly. The prompt rule remains as a cheap nudge; the parser is the contract.

### Why ~17% title-misread is acceptable here (and where it isn't)

Screenshot OCR misreads proper nouns — measured at 3/18 titles on the labeled sample (VTHCO→VTHO, Sandusk→Sandbox, Ramblin'Soul→Ramblin'Lou). These are *silent*: they parse clean and the structural grader passes them; only a hand-labeled accuracy diff catches them. They are tolerable because a wrong title on the ~1,250-event pool costs nothing and the ~4 featured FB events pass under the editor's eye at blurb-time — the human-in-loop is the real backstop. The corollary is the hard limit: the title field must NOT feed any automated consumer (cross-source dedup, auto-publish). That, or volume, is the trigger to build #67 — the DOM carries the true text the screenshot has already thrown away.


## 51. Multi-Source Collision → Richest-Wins Golden Record; Source Is Provenance, Not (Yet) a Scoring Signal; Facebook's Marginal Value Is Unmeasured and Gated to R6-W4 (2026-06-22)

**Decision: when ≥2 sources carry the same event (same `title|date`), the surviving record is the *richest* one (has a URL / more complete fields) — not the last in Merge order. `Source` becomes provenance metadata only; it is NOT used as a scoring signal until R6-W4's backtest proves it earns its place. The R6 scoring signal is event *content/intrinsic features* (venue, category, segment, title text), which are dedup-stable, not `Source`, which is dedup-dependent. §18's "Facebook = 58% of clicks" is treated as contaminated by the client's pre-pipeline sourcing and is NOT carried forward; Facebook's true marginal value under broad sourcing is measured once, in R6-W4, with an explicit keep/kill criterion (#69). Facebook intake ships as-is for R5 sign-off regardless.**

*Decided 2026-06-22, Ariel + Claude. Surfaced by W3 (#35) once the Clean/Filter fix let Facebook events flow and they collided with AllEvents. Extends §49/§50.*

### Why this is a pipeline-wide survivorship problem, not a Facebook bug

This is textbook entity-resolution + survivorship: N records refer to one real-world event; which field values survive into the golden record. It had been resolved *by accident* — Merge input order (last-wins), so Facebook (input 9) clobbered the `Source` of any colliding AllEvents record while the linkless FB record's empty URL left the existing AllEvents URL in place (or, in a same-run first-encounter, lost the URL entirely). It applies to every aggregator, not just FB — several of our sources (notably AllEvents) themselves aggregate from Facebook and from each other, so cross-source overlap is common (observed live: ~8 of 17 FB events in the shotC test collided with AllEvents). The fix is one comparator in `Build Upsert Batches`: prefer the URL-bearing / more-complete record, never let a linkless record overwrite an existing `Source`/`URL`. Implementation tracked in #70 — it mutates the shared dedup for ALL sources and ships Thursday, so it requires a before/after per-source count diff and must never touch `Lock=true` rows.

### Why Source is provenance, not a scoring signal (yet)

Intrinsic features (venue, category, segment, title text) are properties of the *event* — identical no matter which source won the collision (dedup-stable). `Source` is an artifact of the survivorship rule (dedup-dependent), so using it as a scoring signal couples scoring to pipeline mechanics. The roadmap already half-knows this: the 2026-06-04 R6 amendment flags `Source` as INERT until populated/clean, and R6-W4 already plans to backtest whether scoring signals beat a trivial sort and "simplify if not." So we do NOT pre-decide Source's fate — we make it *clean* (richest-wins) so R6-W4 can test it fairly. Useful byproduct: with richest-wins, `Source = Facebook` ⟺ "Facebook-exclusive event," which is the exact attribution signal the retrospective needs, for free.

### Why Facebook's value must be re-measured (and the thin-data corollary)

The 58% was measured when the client pulled ~28 events/week with Facebook as his primary channel — it reflects his old sourcing mix, not Facebook's marginal value now that broad aggregator coverage exists. Under richest-wins, the only events left tagged `Source=Facebook` are the data-thin exclusives (no URL, no description), which are structurally disadvantaged for any content-based scorer — risking the R6 quality floor silently dropping click-rich-but-text-poor FB events before the editor sees them. Mitigation if the retrospective proves FB-exclusive events valuable: a floor-exemption (same shape as linkless-through) so they always reach the editor; and/or the #67 DOM-extractor, which removes the thinness at source. None of this is built now — at ~4 featured FB events/issue, editor-backfill at selection already covers it (method-fit at n=1). The triggers to escalate are scale, a second FB-heavy client, or the retrospective showing the exclusives are click-rich.

### What ships for R5 vs. what's deferred

R5: Facebook intake ships as-is (it's built; it's the sign-off gate). Richest-wins is a data-quality fix the live pipeline needs regardless (#70). Deferred to R6-W4: the Facebook keep/kill retrospective (#69) — metric is per-event click rate of FB-exclusive *featured* events vs aggregator-sourced featured events; directional go/no-go only (editor-championing + grassroots skew are confounds), folded into the already-scheduled clicks analysis, not a standalone project.

### Refinement (2026-06-23): the "more complete fields" comparator, made concrete (#70 build)

"Richest" above is made concrete as a **source-agnostic ordered comparator** in `Build Upsert Batches`, not a URL-only rule:
1. **URL present beats URL absent** — primary. Cleanly demotes every linkless record and preserves the featured-link path.
2. **Tie → longer `DescriptionRaw` wins** — serves the R6 *content* scorer (which §51 commits to as the scoring signal). This tier only fires between **aggregators that both carry a URL** (Eventbrite/AllEvents/RSS/McMichael), never for Facebook.
3. **Tie → last in Merge order** — harmless fallback, preserves prior behaviour.

**Why description is a tier but never decides a Facebook collision:** the FB intake schema (`docs/client_prompts/4_VB_FACEBOOK_INTAKE_v1.md`) is six columns — `Title StartDate EndDate LocationName City Link` — with **no Description field at all**. An FB record is therefore structurally thin on *both* URL and description; it loses every collision on tier 1 alone. The "FB has a rich description the aggregator lacks" conflict cannot occur — the data model forecloses it. So FB's surviving count is always the floor, which is the intended byproduct: `Source=Facebook` ⟺ FB-exclusive (the signal #69 needs), for free.

**DoD read (asymmetry to respect):** the before/after per-source count diff is the safety gate (mutates shared dedup for all sources, ships Thursday). A **drop in FB count is expected and correct** (collisions reattributed to richer aggregators); the red flags are an *aggregator* losing records, or FB collapsing to ~zero. Never overwrite `Lock=true` rows. Comparator never references `sourceCanonical` (the portability rule — transfers to client #2 unchanged).

### Follow-on (2026-06-23): AllEvents `DescriptionRaw` was polluted — source cleanup self-heals the comparator + a metadata-extraction substrate (#72)

Building #70 surfaced that **AllEvents was the worst record winning EB↔AllEvents collisions** — the comparator's tier-2 "longer `DescriptionRaw`" was being gamed because AllEvents Normalize *concatenated* `AllEvents Categories/Organizer/Score` into `DescriptionRaw` (the API has **no description field**). So a 144-char metadata blob beat Eventbrite's real 100-char description, surrendering the primary `eventbrite.ca` link for a secondhand `allevents.in` relisting. The blob also poisoned the R6 content-scoring signal §51 commits to.

**Resolution (this is R5 substrate, not R6 — building clean data ≠ scoring it):**
- **Extraction, not blob:** the AllEvents API already returns `categories`/`organizer.name`/`score` as discrete fields; the normalize nodes (all 3, per-city — kept byte-identical) now emit `Organizer` / `SourceScore` / `SourceCategories` and leave `DescriptionRaw` empty. New Candidates fields added (source-agnostic names, not "AllEvents…", per portability). `Clean/Filter`'s allowlist had to carry the new keys or they'd be dropped before `Build Upsert` (hidden pipeline contract).
- **The comparator self-healed:** with `DescriptionRaw` empty, tier-2 makes Eventbrite (any real-description source) win automatically — **no source-tier coupling needed.** Verified live: EB↔AllEvents collisions flipped 0→31 Eventbrite wins. The "survivorship problem" was mostly a "we polluted the field we compare on" problem.
- **Field-level merge (justified here, not for FB):** record-level richest-wins picks EB's record, but `Organizer`/`SourceScore`/`SourceCategories` are only set by AllEvents, which now *loses*. So those specific fields are overlaid (best-of-each by presence, source-agnostic) onto the winner — substrate completeness so R6-W4 can backtest them. This is the field-level case #70's DoD said to build "only if an aggregator fills a field others leave blank" — true for AllEvents, false for FB.
- **Backfill required (the empty-omit trap):** the upsert omits empty values, so it can never blank the old blob on existing rows. `scripts/backfillAllEventsDescription.js` (idempotent, PATCH = partial update) blanked `DescriptionRaw` on 487 rows, recovering metadata into the new fields for the 165 not re-ingested. R6 scoring fate of `SourceScore`/`SourceCategories`/`Organizer` stays deferred to R6-W4; `Organizer` has a clear consumer in #65.

---

## 52. Online / Blank-Venue Events — KEEP in the Pool (reverses the June 11 drop recommendation) (2026-06-24)

The June 11 client meeting prep recommended **dropping** Eventbrite online / blank-venue events ("online events don't fit a neighbourhood newsletter"). At the June 24 meeting the client overruled that: online events — Eventbrite and in general — **can be included**. So the standing decision is now **KEEP**, not drop.

**Why this is the client's call, not ours.** "Fit" here is editorial taste, not a technical property — the same class of judgment as the trusted-venue list and the big-event policy. We proposed drop on a plausible-sounding heuristic ("neighbourhood = physical"); the client, who owns the editorial voice, knows his readers will click some online events (virtual classes, livestreamed talks). When the call is taste and the client states a preference, the client wins — we don't re-litigate it on our heuristic.

**Pipeline consequence:** any filter that currently drops or special-cases online / blank-venue / blank-city events (the #59 geo-leakage handling) must let them through. Blank `City` is already allowed through elsewhere (FB intake, §51 linkless-through) — this aligns the geo filter with that. Tracked as a build issue.

**Refinement 2026-06-25 (#81 implementation) — "KEEP" is source-aware, not blanket.** Implementing #81 showed the blanket "let all online/blank-venue through" is too blunt: applied globally it admits the opposite of what the client meant. Two sources carry venueless events with inverted value — BiblioCommons (87 local Markham library virtual programs: Yoga for Older Adults, Retirement Planning — KEEP) vs Eventbrite (72/224 foreign-language/B2B global webinars silently stamped `City='Vaughan'` — DROP). The governing rule: **trust a venueless event only from a source that is itself locally anchored.** A blank venue from the Markham library feed = local online program; a blank venue from Eventbrite's global city-browse = no geographic anchor. So §52's pipeline consequence is amended: keep online events from locally-anchored sources (tag `City='Online'`), drop venueless events from unanchored aggregators. Salvaging the ~6 genuinely-local Eventbrite online events is a content-classification problem (consumer-vs-B2B, foreign-language) deferred to R7 — not faked with hand-rules now. The Eventbrite named-out-of-range-city leak + blank-Source historical tail are the remaining geo-leakage deliverable under #59.

**Close 2026-06-25 (#59 done).** The Eventbrite named-out-of-range leak is fixed by giving `Eventbrite Normalize` the same strict `CITY_MAP` allowlist as AllEvents (drop unmapped venue city) — same anchored-source logic: Eventbrite's global city-browse gives no locality guarantee, so only covered municipalities pass. **The #41 language filter is deliberately not built — the allowlist subsumes it.** A foreign event carries a foreign venue city → already dropped by the allowlist; a separate language filter would misfire on #41's own requirement that a *legitimately-local* non-English event must pass. Distinguishing the residual case (foreign-language event with a covered venue city) is a content-classification problem → R7, not hand-rules. The blank-`Source` historical tail is *not* a geo hole (the purge keys on URL ground truth, not the stored Source field) → deferred to R6-W4 (#69): backfill Source from URL only if the backtest proves Source earns a scoring weight (§51).

## 53. Big-Event Editorial Policy — De-dupe by Date, Not by Event Name (2026-06-24)

Client rule for big multi-listing events (festivals, ribfests): include multiple listings only if they are genuinely *different events*; **same-date duplicates → exclude; different-date listings of the same big event → OK to include.** This largely *confirms* the existing `title|date` UniqueEventID behaviour (different date ⟹ different key ⟹ kept) rather than changing it. Residual gap (manual, not automatable): the same big event listed under *different titles* on the *same date* across sources won't collide on `title|date`, so the editor remains the backstop for that case. No pipeline change required — editorial confirmation only.

## 54. Newly-Discovered Field Triage — Real Field vs DescriptionRaw vs Skip, Decided by Clean-and-Cheap vs Needs-Parsing (2026-07-03)

**Decision: when a source-inventory sweep (#63-class work) surfaces a field the pipeline doesn't currently capture, triage it by two questions, in order — (1) is it cheap (already in the fetched payload, zero extra calls)? if no, skip; (2) if cheap, is its format clean and unambiguous (numeric/boolean/enum, no parsing judgment call)? clean → a real Airtable field, using a shared column name across sources when the semantics genuinely match (not source-driven naming); ambiguous or inconsistent-looking → fold into `DescriptionRaw` with a labeled prefix instead of inventing a typed column for a format that isn't confirmed stable.**

*Decided 2026-07-03, Ariel + Claude, while scoping #84 (R6-substrate field capture) off the #63 sweep findings.*

**Why this needed to be a rule, not a case-by-case call.** The #63 sweep and the same-session re-check of 4 already-audited sources (AllEvents, VPL, B4, B5) turned up ~20 candidate fields across 8 sources. Triaging them one at a time on vibes would have produced inconsistent outcomes — e.g. an early pass judged Pinot's `price` and TRCA's `ticket_price` as "messy text, defer to DescriptionRaw," but checking the *full* sample (not just the first item) showed both are actually clean and consistent (`"$NN per guest"`; a `Free`/`Paid` enum) and belong as real fields instead. The rule exists so the next field-inventory sweep doesn't re-derive this same judgment call from scratch, and so two people (or the same person, months apart) reach the same triage on the same evidence.

**Why shared field names across sources, not one column per source.** A field like "is this sold out" means the same thing whether it comes from Eventbrite's `is_sold_out` boolean, BiblioCommons' `is_full`, or a derived `remainingSpaces <= 0` on Chef Upstairs — collapsing them into one `IsSoldOut` column is real reuse, not premature abstraction, because the semantics actually match. This is the same principle as the existing `SourceCategories` field (already shared across AllEvents/Eventbrite/BiblioCommons) — extended here rather than invented fresh.

**What this does NOT decide.** Whether any of these fields ever become an R6 scoring input is a separate, later decision (R6's formula-vs-LLM choice). This triage only decides whether the field survives ingestion at all — consistent with the R6-Substrate Lens (§28 amendment) principle that substrate capture and substrate *use* are different questions, and the first one is cheap enough to not wait on the second.

**Addendum (2026-07-03, same day, before #84 execution) — cheap-and-clean is necessary but not sufficient; added a consumer/reuse filter.** Ariel flagged before building that the locked 8-field schema was never asked "is this actually worth adding," only "is it cheap and clean" — correct catch. Re-reviewed each field against a second question: does it have a plausible cross-source consumer or reader/editor-facing value on its own, independent of whether R6 ever scores on it? Result: **trimmed 8 → 3** (`IsSoldOut`, `CostRaw`, `SourceCategories` extension kept; `SpacesRemaining`, `Capacity`, `BookingCount`, `SourceTags`, `SourceLanguage` cut). The cut fields shared a pattern the cheap/clean test alone couldn't catch: single-source (mostly Chef Upstairs, one low-volume venue), no stated consumer, and in one case (`SpacesRemaining`) redundant with a kept field (`IsSoldOut` is derived from it — once you have the boolean, the raw number has no independent use). This is the same premature-structuring failure mode CLAUDE.md's no-speculative-abstraction rule targets, just applied to Airtable schema instead of code — "already in the payload" made it feel free, but schema surface area, two allowlist-gate edits, and long-term maintenance are real costs even when the HTTP call is zero-marginal. **Revised rule: capture-cheap is the *filter*, not the *decision* — a field only gets built if it also clears "who reads this and why" (even a plausible pre-R6 reader/editor use, not just a future R6 hypothetical).** Full before/after schema in the #84 plan doc.

**Second addendum (2026-07-03, mid-#84 execution) — a signal whose only consumer is include/exclude is a filter, not a field.** Building `IsSoldOut` for Chef Upstairs surfaced that its Normalize node already drops sold-out occurrences (`if(ev.bookedOut===true) continue`) — a captured boolean would be constant (`false`) on every surviving record, since the true case never reaches output. Generalizing: `IsSoldOut`'s only possible use is "should this event be shown to a reader at all" — there's no editorial nuance where a sold-out event gets featured (unlike `CostRaw`, where free-vs-paid is real display info). A boolean whose only downstream use is a drop decision belongs in the filter logic, not the schema. **Revised further: dropped `IsSoldOut` as a column entirely** and extended the existing Chef Upstairs pattern to Eventbrite (`ticket_availability.is_sold_out`) and BiblioCommons (`bc:registration_info.is_full`) as hard drops at ingestion. Net #84 schema: 3 fields → 2 (`CostRaw`, `SourceCategories` extension); the "capture vs. filter" question is now a standing second test alongside "capture vs. consumer" for any future field-inventory sweep.

## 55. Ingestion-Rejection Observability — Durable File + Existing Check-Suite/Discord Convention, Not a New Airtable Table (2026-07-04)

The #7/#34 schema validator was found to silently drop records (missing title/link/date) with no count or reason recorded anywhere — a real gap against the Scope doc's own "no silent data loss" criterion, and the same failure class as #58 (RSS date bug, undetected for months). First fix attempt (`console.log`) proved useless for an unattended pipeline — n8n only streams Code-node console output to a live browser DevTools session, not to any retrievable log. **Decision: persist rejection counts + per-record detail to a durable local file (`data/tracking/ingestion_rejections.jsonl`), read by a new script (`rejectionCheck.js`) added as the 6th check in the existing `postRunChecks.js` suite, riding the suite's existing `postDiscord()` webhook.**

**Why not a new Airtable table (the first fallback considered).** No precedent for logging to Airtable in this project — Airtable holds editorial/candidate data, and `CLAUDE.md`'s own "What Goes Where" table already names `data/tracking/` as the home for health-check output. The retired `Historical` table is also a cautionary example against adding new tables casually. Using the file-based convention already established by `snapshotCandidates.js` was more consistent, not less capable.

**Why not a new alerting system.** No baseline exists yet for "normal" rejection volume per source/reason (same reasoning the per-source expected-count check already uses — needs ~5 runs before a threshold is meaningful). The existing `postDiscord()` primitive in `postRunChecks.js` already generalizes to this case with zero new infrastructure — building a dedicated logging/alerting framework for a 2-newsletter system would be solving a scale problem that doesn't exist yet.

**Infra note:** required recreating the `n8n` Docker container with `NODE_FUNCTION_ALLOW_BUILTIN=fs` (Code nodes are sandboxed from `fs` by default) and a new bind mount into `/data/tracking`. Verified the recreate preserved all workflow/credential data (same named volume, `n8n_n8n_data`).

## 56. Geo/City-Constant Extraction Deferred to R6, Bundled with Scoring-Config-Drive Work (2026-07-04)

The R5 reusability audit (standing gate, `R5_Scope.md`) found the newsletter config file was a stale, unwired W1 snapshot, and the real config — geo/city constants (`Vaughan`, `Markham`, `Richmond Hill`, etc.) — is hardcoded inline across 17 Code nodes in the live workflow, not centralized. `airtableBaseId`/`beehiivPubId` are already clean (n8n credentials, not hardcoded).

**Decision: don't extract now; defer to R6, bundled with the scoring-weights config-drive work R6 already has scoped on several of the same nodes.** Extracting now would mean guessing the config's shape before R6 decides formula-vs-LLM scoring (weights vs. prompts/eval-sets have different config shapes) — risking doing the wiring twice. Building full swap-infrastructure also has no current consumer (Mississauga isn't scheduled; that's R8). The corrected config file is marked `_status: SNAPSHOT ONLY` so it isn't mistaken for wired-up going forward.

## 57. Release-Log Split Timing — Early/Practical, Not Strictly "At Formal Close" (2026-07-04)

**Decision: `Execution_Log.md` was split into `logs/R5_Log.md` the day R6 planning began, before R5's own milestone-completeness gate (#82, #86) actually closed.** The documented convention (`docs/README.md`) says archival happens "at release close." Deviated because R5's *build* work was fully done — only closure bookkeeping (#82, #86) remained — and splitting at today's clean temporal boundary is objectively lower-effort and lower-error than deferring the split until an unknown future date, by which point R6 entries would already be interleaved in the same file, making the eventual cut require manually sifting a large mixed-content log instead of a clean cut.

**Standing rule this sets for future release transitions:** when a release's substantive build work is done and only closure/bookkeeping items remain, the log split may happen early, at the practical boundary, rather than waiting for literal formal close — *provided* the still-open closure items (here, #82 and #86) get logged directly into the new archive file when they actually happen, not into the fresh live log. This avoids the split ever costing extra sifting work, which was the whole point of doing it this way.

**Amendment (2026-07-11) — the rule also covers a *paused, not closed* release.** When a release is **deferred mid-flight** (build unfinished) because another release must go first — as R6 was, behind R7 (§61) — its sessions are carved out of `Execution_Log.md` into `logs/R{N}_Log.md` on the same practical-boundary logic, *even though its build isn't done*. This extends the original rule (which assumed "build done, only closure remains") to the deferral case: the trigger for the split is **"no longer the active release,"** not "resolved." The paused release **resumes logging in its own archive file** when it reopens (same as the closure-item rule above), and the file is marked *paused-not-closed* so its staleness isn't mistaken for completion. `Execution_Log.md` always holds exactly the active release (+ release-neutral sessions). Where the two logs meet — the crossover day that did both releases' work (here 2026-07-09) — carries a bidirectional **↔ seam** pointer: at the *end* of the paused release's log (its newest entry) and the *beginning* of the live log (its oldest), so the hand-off is visible from either side.

## 58. R6 Scope-Doc Drafting Pipeline — Tool Roles, What Got Cut, and Why (2026-07-04)

**Decision: R6's scope doc gets drafted by Fable (has live repo/tool access in this harness, positioned for "hardest and longest-running tasks"), critiqued by a single focused Opus pass (not a multi-model ensemble), with no dedicated Research Mode pass — in that order, and issues get opened only after the doc is finalized, not before.**

**Why Fable drafts, not critiques.** Generation needs live repo fidelity (matching `R5_Scope.md`'s actual conventions, reading the actual roadmap/Decision_Log/issues) — Opus's tool access made it the natural drafter for R5. Once confirmed Fable has the same tool access in this harness, the same logic applies to it, and its stated strength ("hardest/longest-running tasks") fits R6 specifically, since R6 carries the most unresolved method-fit uncertainty of the remaining releases.

**Why no dedicated Research Mode pass.** Gutcheck-derived: the roadmap's own PRE-R6 ADDENDUM (2026-06-30, reinforced 2026-07-02 from a real client meeting) already *is* the research-pass output — problem classification (small-scale editorial ranking, not web-scale recommender), the reference-class trap named explicitly, industry principles that scale down, hard constraints. A fresh Research Mode session would very likely reproduce this conclusion, not extend it — real risk of spending scarce Fable-window time (access ends 2026-07-07) re-deriving an already-answered question. The doc's own "heavier methods deliberately not used, and why" section gets written by Fable directly from the addendum's existing reasoning, not from new research.

**Why one critique pass, not the R5-style multi-LLM ensemble.** R5's incognito-LLM critique loop earned its keep because R5's open risks were architectural (unproven source integration methods, unverified substrate assumptions). R6's core open question (formula vs. LLM-hybrid) is resolved empirically, by backtesting against `issue_history.json`, not by soliciting more model opinions on it. The one concrete residual risk a critique pass *should* catch — Fable's draft accidentally reintroducing a signal already explicitly cut (recency/date-proximity, slot-position, segment click weight) — is a checklist match a single reviewer catches as reliably as an ensemble, at much lower cost.

**Why scope doc before issues, reversing the initially-assumed order.** The roadmap's actual instruction ("before starting R6: open GitHub issues for each W4/W5 item... before any build work") gates **build**, not doc drafting. Issues get opened from the finalized `docs/r6/R6_Scope.md`, not speculatively before it exists — same pattern R5 actually followed (#77-#84 opened against an existing Scope doc, not ahead of one).

## 59. R6 Click-Based Eval Label — Within-Section Percentile from Implicit Feedback, Slot as Covariate Not Debiased (2026-07-06)

**Decision:** The R6 offline eval label is the **within-section-within-issue percentile of an event's Verified Unique Clicks**, built by record-linkage of the Beehiiv click CSV to `issue_history.json` (`scripts/joinClicksData.js`).

**Why within-section percentile.** R6 fills fixed per-section quotas — it always ranks *within* a section, never across. So the label must mirror that decision unit. Percentile (not a click-ratio) is outlier-robust and, by ranking only within section-within-issue, it cancels every issue-level confound (subject line, send day, holiday, list growth) *by construction* and never compares across sections that have different baseline click rates. Verified Unique (not Total) is the cleaner engagement signal; Total is kept only as a diagnostic, not blended.

**Why slot is carried but not debiased.** The measured slot gradient (mean percentile 0.60→0.43 across slots 1–5) is real but confounded — the editor chose the order and likely placed the best event first, so the gradient is part position-effect and part genuine quality. These can't be separated from historical data. Debiasing (inverse-propensity weighting / click models) would destroy real signal if the gradient is mostly editorial, and is overkill at 13k subs / 5 slots. So slot is carried as a covariate for the downstream eval to control for if it chooses — the choice is not baked into the label.

**Scope guard.** This validates the *ordering* of already-picked events, not *selection* — no historical reject pool exists (see 2026-07-04 parked finding). It is a directional check; **selection is validated forward via swap-rate, which remains R6's real gate.** A green backtest here is not sufficient to ship a formula.

**Deferred (documented, not issue-tracked per §58).** Recovering the ~103 recurring-event picks lost to `utm_campaign`≠`slug` namespace mismatch (map `campaign→date` via `posts_by_date.csv`, then `date→slug`) — a known systematic bias (recurring/popular venues under-represented). Revisit only if the directional check proves too noisy or R6 needs the recurring-venue signal validated; decided at R6_Scope, not before.

**Refinement 2026-07-07 (human-review pass) — percentile kept over plain rank, for a non-obvious reason.** At fixed 5-event sections, percentile carries the *same* information as plain rank 1–5 (only 5 possible values) and would be pure decoration — the tempting "rigor for appearance" trap. It's kept because **section size actually varies: 39 of 169 groups have 4 matched events, not 5** — 36 from coverage gaps (a 5-event section where one event didn't join a click row), 3 genuinely short. Rank-3-of-4 ≠ rank-3-of-5, so raw rank isn't comparable across groups when the 806 records are pooled for the downstream eval; percentile-over-n is. Since coverage never reaches 100%, this size variation is permanent, so the normalization is doing real work, not decoration. Accepted wart: the mid-rank convention caps the best event at 0.9 (5-group) / 0.875 (4-group), not 1.0 — kept because mid-rank centres each group at ~0.5, which is what makes different-sized groups comparable. Secondary caveat: dropping one of five events shifts the surviving four's percentiles (missing top-clicker nudges them up, missing dud nudges them down) — minor, concentrated in the least-covered early-2025 rows.

---

## 60. R6 Eval-Set Maturation Cutoff — Measured 7-Day Plateau (Lowered from 14); Set Frozen & Committed (2026-07-07)

**Decision:** The maturation exclusion threshold in `joinClicksData.js` (`MATURATION_MIN_AGE_DAYS`) is **7 days**, down from a guessed 14. Issues younger than this at the CSV export date are excluded from the eval set because their clicks haven't settled. The resulting set is **frozen** as `models/ranking/click_join/click_join_FROZEN_2026-07-07.{json,csv,txt}` (924 records, 85.8% coverage) and **committed to version control**. Extends §59.

**Why 7, and why measured not guessed.** A two-snapshot diff (May-13 vs Jul-7 exports of the *same* issues) showed clicks grew **<0.5%** for any issue already ≥7 days old at the May export. Beehiiv clicks are front-loaded — subscribers open within days and never return to an old issue — so an issue's click total is effectively final within a week. The prior 14-day value was a conservative guess; the measurement retires it and admits the 12-day Canada Day issue (+15 records) that 14 needlessly excluded. **Recorded edge:** the diff proves no growth *after* day 7, not that growth *stops by* day 7 (days 0–7 unobserved). The floor is safe for issues comfortably past it, but a future refresh admitting a *just*-7-day issue rests on an unmeasured assumption — bump if in doubt.

**Why absolute click levels were NOT used to judge maturation.** The tempting shortcut — "does the young issue's click level look normal vs older issues?" — is invalid: mean VUC swings 10→80 across issues *independent of age* (season, subscriber count, content). A low-season issue would look immature when it isn't. Only the same-issue two-snapshot diff isolates maturation from those confounds. (Method-fit note: this is the right tool; a single-snapshot age curve is confounded and would have misled.)

**Why the frozen set is committed despite living under a gitignored tree.** The join *output* is PII-free — stripped URLs + aggregate click counts + percentiles only, verified 0 `_bhlid` / 0 emails — even though the raw source CSV (which stays in gitignored `data/`) carries subscriber tokens. A load-bearing R6 dependency should not survive as a single unbacked laptop copy, so it was relocated out of `data/` to committable `models/ranking/click_join/` (`eval/` at the time; moved by #89) rather than force-added in place (no tracked file hiding in an ignored dir). It grades *ordering*, not *selection* (§59) — a floor check; forward swap-rate remains R6's real gate.

---

## 61. R6↔R7 Reorder — Build the Section Classifier (R7-W6) Before Completing R6; Roadmap's R6→R7 Order Overridden (2026-07-09)

**Decision:** R7's offline section classifier (R7-W6: train + evaluate) is built **before** R6's scaled pair collection resumes. R6's within-section scorer has a hard dependency on reliable section assignment, and the step that provides it (R2 enrichment) is dead — so R7 is a prerequisite, not a follow-on. R7-W7 (deploying into the live n8n/R2 pipeline) is **deferred** until after R6's pairs confirm what the sectioner needs. The R7 *architecture* pick (representation, model head, LLM role) stays open, homed in `docs/r7/R7_Scope.md` pending critique — this entry records only the sequencing, decided independently of that pick.

**Why the order inverts.** R6 ranks *within* a section; it can't be built or evaluated against a pool that isn't reliably sectioned. After an R1 run the fresh future-event pool (~1,045 events) is 100% `Pending`/unsectioned, and the only `Enriched` cohort is stale pre-R5 legacy (venue 24% / source 22%, sections from the same dead R2). The pair generator correctly returned ~0 eligible — it surfaced the missing dependency, not a bug. The roadmap sequenced R6→R7 on the silent assumption R2 sectioning worked; it doesn't.

**Why R7, not a bootleg sectioner inside R6.** The only field R6/its pairs need from R2 is the section label — title/description/venue/source are all raw R1 data. A throwaway sectioner in `models/ranking` would duplicate R7's deliverable at lower quality and risk bucketing eval pairs differently than production sections them (eval/serve skew). R7's supervised classifier is the real artifact, its ~2,729 historical `(title,section)` labels already exist, and building it now sections the pool properly *and* ships a release deliverable. Feasibility measured before committing: ~80% reproduction of historical placements (optimistic ceiling on edited titles; real gate = raw-title agreement) — learnable, not noise.

**Why W7 (deploy) is deferred.** Deploying mutates production sectioning and isn't needed to unblock R6 — R6 only needs the classifier offline to section a pool it reads. Deferring avoids wiring production around assumptions R6's pair data may overturn.

**Supersedes:** the roadmap's R6→R7 ordering (roadmap stays frozen; this is the authoritative override per the source-of-truth rule).

---

## 62. R7-W6 Scope & Validation Strategy — 3-Class Set, URL-Join Rebuild Killed, 3-Probe Transfer Sequence (2026-07-12–07-15)

**Decision:** R7's classifier trains on a 3-class set (Families/Couples/Golden, n=1,126) with Local Aroma permanently excluded — a scope fact, not a tuning choice, since Local Aroma arrives via a separate intake the classifier never sees in production. Validation drops the originally-planned URL-join raw-title training rebuild and replaces it with a 3-probe transfer sequence (Probe B vocabulary overlap → Probe A 69-pair raw kill-check → editor-150 hand-labeled agreement), because published (`issue_history`) and scraped (`Candidates`) are two independent samples, not the same events twice.

**Why the URL-join rebuild died.** The premise was that published events and their raw candidate-pool source records could be joined by URL to build a raw-text training set. That assumes the client already uses the pipeline for selection — they don't yet (that's R8). Exact-URL join yields only 69 pairs / 45 distinct titles against a temporal hole and venue-vs-deep-link form mismatches — not enough to train on, and biased toward whatever happens to be easy to match. Kept only as a small, civic-skewed transfer test, not a training source.

**Why the 3-probe sequence instead.** If the two corpora can't be joined, the only way to validate that a classifier trained on published (edited) titles will work on raw (unedited) candidates is to test transfer directly: does the trained model's vocabulary survive contact with raw text (Probe B, pre-build, can kill early); does it agree with the tiny raw-title kill-check (Probe A, directional only); does the editor agree with its raw-text predictions on a real hand-labeled sample (editor-150, the actual post-build gate). Corpus frozen at `published_titles.json` (1,126) / `raw_candidate_titles.json` (1,805 unique) to keep provenance stable across the whole sequence.

---

## 63. R7-W6 Feature Set v1 — Title+Description+SourceCategories; Source-Prior and Deterministic Routing Both Killed by the Editor's Rulings (2026-07-13–07-16)

**Decision:** R7 v1's feature set is title + description (with dropout, ~47% missing on the production-relevant post-R5 pool) + SourceCategories (treated as a bag-of-tokens, TF-IDF-native). Two originally-planned rescue mechanisms for signal-dead, title-only sources — a targeted source-prior lookup table and deterministic source-based routing — were both killed on 2026-07-16 by the editor's own rulings, not by data volume.

**Why description stays despite ~47% missingness.** Including description adds ~7 points (70%→77% 3-class CV), and the model needs to survive the roughly half of production candidates that lack it regardless — dropping description to dodge the missingness would throw away real signal for the half of candidates that do have it.

**Why the source-prior and routing killed.** Both were scoped narrowly to three signal-dead, title-only single-venue sources (PinotsPalette, RichmondHill, Facebook) on the theory that a fixed source almost always maps to one section. Asking the editor directly killed the premise: he ruled all three "varies" — a prior or a routing rule can only output one section with certainty, and he gave rates, not certainties. Zero valid instances survive; the lookup table has no rows to populate. Consequence: nothing is hardcoded, nothing is dropped from train/eval — the full 1,126 rows go to the model unmodified, no accuracy adjustment needed.

**Open, not decided:** whether `source` becomes a classifier *feature* (append the slug to the text; TF-IDF tokenizes it for free) — the editor separately handed over real per-source rates a feature could hold (VPL/BiblioCommons ~90% not-Couples, PinotsPalette 0/33 Families) that a prior/rule couldn't express. Explicitly deferred to a CV comparison (with vs. without the token, watching for source-as-shortcut in the confusion matrix), not decided by argument — still open as of 2026-07-20.

---

## 64. R7-W6 Abstention Design — C/G Boundary Confirmed Genuinely Fuzzy; Flex-Flag Spans R7→R6 (2026-07-12–07-16)

**Decision:** Abstention on the Couples/Golden boundary is load-bearing, not a fallback bolted on later — confirmed by a blind editor re-ruling of the 15 tightest C/G boundary cases, agreeing with his own original placements 12/15 (~80%, held loosely, n=15, wide CI). Low-margin C/G predictions get a "flex" flag emitted by R7 and resolved downstream by R6/the allocator (whichever section is short that week) — R7 never resolves the ambiguity itself, R6 consumes the flag.

**Why the split (R7 emits, R6 consumes).** Scarcity resolves ambiguity for free at the allocator stage — a flex-flagged event just fills whichever section needs it that week — so building resolution logic into the classifier would duplicate work R6 already does and couples two releases that don't need to be coupled. Two independent dials keep the design honest: margin threshold tunes flex *volume*, editor-150 checks flex *quality* (true dual-fit events vs. the model just being confused) — different failure modes, one number can't stand in for both.

**Why PinotsPalette confirmed the design rather than needing a special case.** 33 PinotsPalette events split 16 Couples / 17 Golden / 0 Families with the *identical* title rotating between sections — the editor confirmed directly ("it's for both"). The flex-flag design absorbs this for free: identical text with conflicting labels teaches the model ~50/50, produces low margin, triggers abstention, the allocator resolves it — no PinotsPalette-specific logic needed. Held loosely: ~30 of the 33 rows are sponsor-era contract rotation rather than genuine editorial judgment (post-sponsor n=3); whether to keep those sponsor rows in training is still open — leaning keep, since abstention is the correct behavior for events shaped this way at serve time regardless of *why* they rotated, and at 3% of rows the CV number can't move meaningfully either way.

---

## 65. R7-W6 Evaluation Methodology — Gates Pre-Registered Before Data; Labeling Deck Uses Two Un-Poolable Draws (2026-07-16–07-18)

**Decision:** R7's transfer-probe pass/kill thresholds (Gate 1 weighted coverage ≥85% pass / <70% kill / 70–85% marginal; Gate 2 event blindness >20% kill; Gate 3 horse-race ≥5pt embeddings margin to justify a representation switch) were locked on 2026-07-16, before Probe B was run — specifically so a marginal number couldn't be argued past the line after the fact. Separately, the 400-row editor-labeling deck was built from two structurally different draws — a representative sample (mirrors production, used as the accuracy gate) and an uncertainty-weighted sample (deliberately the model's lowest-margin cases, used for training) — that are never pooled.

**Why pre-register.** Thresholds set after seeing the data get rationalized — "74% is basically fine." Locking the numbers first, against a derived rationale (Gate 2's 20% traces to a specific auto-coverage target and an estimated margin-abstention budget, not a round number), removes that degree of freedom before it can be used.

**Why two draws, never one.** A gate has to estimate real production behavior, so it must mirror production's actual distribution. Training wants maximum information per label, so it wants the boundary — the hardest, most ambiguous cases, which are by construction *not* representative. One sample can't simultaneously mirror a distribution and concentrate in its tail; that's structural, not a budgeting problem. If a project needs both a fair accuracy read and efficient training data, it has to draw twice and keep the two separate for scoring — the same principle later required the 2026-07-20 seam test to score the deck's two labeling batches separately.

---

## 66. R7 Two-Stage Scope — Include/Reject Filter Added Ahead of the Section Classifier; Gate Redefined Over Includable Events Only (2026-07-19)

**Decision:** R7 is no longer a single-stage section classifier. A structured criteria-elicitation call with the editor (26 fresh proxy events, never seen by him before) established that his rejection rate replicates almost exactly outside the labeled 400 (13/26 = 50% vs. 48.5% on the 400) and resolves to at least six distinct mechanisms (narrow appeal, cultural-tie-in-nightlife, age/vibe mismatch, audience-feedback history, B2B, tone/positivity, insufficient info) — not editor error, not label noise, not reverse-engineerable from topic alone. R7 gains a named include/reject filter stage ahead of the section classifier, and the classifier's own accuracy gate is redefined to score only over events the editor would actually include (None rows drop out of the denominator).

**Why this isn't scope drift.** The original R7 design assumed "None" was either noise or a simple topic filter that fell out of the section classifier's own confidence. The elicitation call closed that question directly, using fresh proxy events specifically so the editor couldn't defend or reverse a past call — he ruled cold, then was challenged, and the same rule ("cultural ties in nightlife = reject, generic party = fine") surfaced unprompted on a genuine split pair (Russian Party → None, Secret Saturdays → Couples, same venue and night). That's a real, stable editorial criterion the pipeline has never implemented — R2's `isBusinessy` is the only prior attempt and is dead code.

**Why the gate had to be redefined.** Scoring section accuracy against the full label set (including None rows the classifier structurally can't predict) conflates two different failures: getting the section wrong, and correctly recognizing an event the editor would never run at all. Restricting the denominator to includable events isolates the question the classifier is actually built to answer.

---

## 67. R7 Vectorizer — Drop TF-IDF, Pursue Embeddings; LLM Fallback Deliberately Left Undecided (2026-07-20)

**Decision:** TF-IDF is dropped as R7's vectorizer. The embeddings track (previously scoped as a comparative horse-race, `R7_Scope.md` §3 Step 3) becomes the primary path, not a comparison. Separately: whether the low-confidence tail falls back to an LLM, stays fully manual, or something else is deliberately left undecided.

**Why TF-IDF is out.** Gate 1 read at N=500 first (81.9%, marginal) — but that N only held ~44–45% of any class's total `|coef_|` weight, an optimistic partial sample. Read at the only unbiased N (full 2,692-word vocabulary): 68.2% minimum-class coverage, below the kill line for all three classes. A generosity check (75% cumulative weight) made the case stronger, not weaker — reaching it needs ~45–47% of the entire vocabulary, still only 73.9–75.6% coverage there. Weight is genuinely diffuse, consistent with the already-known overfitting signature (98.57% train vs 78.68% CV, Decision_Log §63's feature-set context).

**Why embeddings specifically.** TF-IDF's failure is exact-token matching against a fixed vocabulary. Embeddings work off semantic similarity — the direct fix for that failure, not a general accuracy play. (Count/Hashing vectorizers share TF-IDF's problem; char n-grams only fix typos.)

**Why LLM fallback stays open.** R2's LLM classification wasn't good in production, but that's evidence about one implementation, not the method — never examined for why. Ruling it out now would over-read a single data point.

**Also found, not yet acted on:** the confident band (margin>0.5) covers only ~18–24% of a representative sample, well short of the ≥70% auto-coverage the original hybrid design assumed — a real input to how big an embeddings win needs to be before it's worth shipping.

---

## 68. R7 Embedding Provider — OpenAI API (`text-embedding-3-small` primary, `-large` as agreement check); Chosen on Serve-Time Compatibility, Not Cost (2026-07-21)

**Decision:** R7's embeddings come from OpenAI's API — `text-embedding-3-small` (1,536-dim) as the primary representation, `text-embedding-3-large` (3,072-dim) embedded alongside it as an agreement check rather than a competitor. Local open-weight embeddings (sentence-transformers) were considered and rejected for v1. Both corpora are cached to disk with a SHA-256 of the input text; `models/sectioning/embed_corpus.py` is the one entry point.

**Why the API and not local.** §1 settles the serve path as *"offline train in Python → versioned artifact → score in Node, no model server."* A TF-IDF vectorizer survives that trivially — it is a vocabulary list and a weight per word, reimplementable in ~30 lines of JS. An embedding model cannot be: producing a vector requires running the network, so a local model forces either a long-running Python service Node calls over HTTP, or reopening a settled architecture decision. The API is the same architecture with someone else operating it. This sharpens §3 Step 4's 07-16 softening, which correctly noted API embeddings *"add no new dependency kind"* — the build path already calls an LLM API every issue.

**Why cost decided nothing.** Measured, not assumed: 26,414 billing tokens for the full 1,126-row corpus — **$0.000528** on `-small`, $0.003434 on `-large`, $0.00396 for both. Projected forward, an LLM-only classification path costs ~$2.49/yr against ~$1.95/yr for the hybrid — a **$0.54/yr** difference requiring ~180× current volume to reach $100/yr. Where two options are both effectively free, the dollar column must not decide; the visible cost is negligible and the invisible ones (operational surface, a component that can be *down* rather than merely broken) are not. This pipeline currently has zero always-on components.

**The residual cost, accepted knowingly.** The fit is now coupled to a third-party model's lifetime — provider deprecation means re-embed and retrain — and raw event text leaves the machine (acceptable: the events are public listings). Mitigated by caching, so a live dependency becomes a one-time cost, and by the manifest, so any re-embed is verifiable against the original corpus hash.

**Why `-large` is an agreement check, not a contender.** The interesting result is not which wins. Two representations of very different width landing inside fold noise (~±2–3 pts at n=1,126) is the strongest available evidence that **77% was the task's ceiling rather than TF-IDF's** — the question §3 Step 3's voided horse-race was actually asking. A win for `-large` would instead say the representation still had room.

**Unexpected second use.** The same 1,126 cached vectors are a retrieval index: nearest-neighbour lookup against them is cosine similarity in numpy, no API call and no new infrastructure. That makes dynamic few-shot example selection ("RAG") nearly free if the LLM fallback ever needs it, and makes k-NN available as a zero-cost baseline. Noted, not built.

---

## 69. R7 Transfer Measurement — Train on Edited, Score the Raw Deck; Replaces Probe B's Vocabulary Instrument, Which Embeddings Make Unrunnable (2026-07-21)

**Decision:** R7's transfer question — does a classifier trained on edited published text work on raw scraped candidates — is answered by training on the 1,126 published events and scoring the 400 editor-labeled raw deck rows directly. This replaces the Probe B vocabulary-overlap instrument. Read as **per-class recall plus confusion plus margin bands**, scored pre/post-call separately, never a single pooled accuracy number.

**Why the old instrument is gone, not merely superseded.** Gates 1 and 2 are both token-presence tests: Gate 1 asks whether the model's top-weighted *words* appear in the raw pool, Gate 2 counts events containing zero *learned tokens*. Embeddings have no vocabulary and no tokens to look up — every event yields a vector whether or not its words were ever seen. The gates are not merely uninformative here, they are undefined. Killing TF-IDF therefore also destroyed the only transfer instrument R7 had, and until this decision the embeddings track had **no way to detect train/serve degradation at all** — a worse position than TF-IDF was in, since TF-IDF at least had a gate that could kill it.

**Why the replacement is better than what it replaces.** Probe B measured transfer *by proxy* — do the words survive? The deck test measures it *directly* — does accuracy survive? Same question, one fewer inferential step, and it works for any representation rather than only sparse ones. It also runs on data already collected: 400 raw candidates labeled by the editor, with an answer key.

**Why the measurement is needed at all — the gap, quantified.** Published events average **105 characters**, raw candidates **340**. The published `description` is the editor's finished newsletter blurb; the raw `desc` is scraped venue prose. These are different genres, and only one exists at serve time. CV is published-vs-published and is structurally blind to the difference, so a strong CV number is not evidence of production performance.

**Two constraints on how it is run.** (1) **No `max_prob < threshold → None` rule.** Margin measures *section ambiguity*, not *includability* — measured 07-19/07-20: thin text predicts junk rather than difficulty, and what breaks the confident band is junk entering it, not section confusion. A confidently-classified B2B conference is still not includable. §66's two-stage design exists precisely because one threshold cannot do both jobs; rebuilding it here would re-adopt the rejected design. (2) **The seam holds.** Batches 1–2 and batch 3 diverge 39.3% vs 57.3% on gate-slice None-rate; any train/test or threshold-tuning split must respect the batch boundary or it tunes on one instrument and tests on another.

**Origin note:** proposed by ChatGPT during a 07-21 cross-model check, adopted after correcting the two points above. Recorded because the idea's source is not the point — it filled a hole opened by §67 that neither Ariel nor Claude had noticed for a full session.

## 70. R7 Scoring Text — Score-Time Recipe Must Equal Serve-Time Recipe; SourceCategories Excluded from the W6 Embedded Text (2026-07-21)

**Decision:** the §69 transfer test embeds the **serve-time text recipe** — `title + clean(DescriptionRaw)`-shaped candidate text — never the deck's display text; and **SourceCategories stays out of the W6 embedded text**, re-entering only through a pre-registered ablation (with-cats vs without-cats, switch rule frozen in `R7_Scope.md` §3 before any result).

**Why the invariant exists.** The labeling deck's `Details` field was built for editor readability (`classifier2give2editor.py`: HTML-strip, boilerplate-drop, 300-char cap; SourceCategories never shown) — Ariel caught that this display text is *not* what production feeds the classifier. The editor's labels survive regardless (a label is ground truth about the *event*, not about its text encoding), but an eval number transfers to production only if the classifier is scored on the text production will hand it. Score on the pretty text and the transfer test measures a pipeline that doesn't exist. Whatever cleaning the recipe includes thereby becomes **serve-time code**, not deck-prep code.

**Why cats are excluded rather than included.** The training corpus is published newsletter blurbs, which carry no SourceCategories — the field literally cannot appear in train-side text. For a vocabulary model that would end the argument; for embeddings it doesn't (appending "kids, Summer Camp" moves the serve vector toward semantic regions the head learned from family-ish blurbs — signal can transfer without ever appearing in training; Ariel's counter, and correct). Measured 07-21: 43% of the raw pool and 48% of deck rows carry cats, they are *not* AllEvents-only, and the values are mostly class-relevant rather than junk. So inclusion is genuinely undecidable by argument — which is exactly why it is settled by a pre-registered ablation instead of by taste, and why the default (exclusion) is the arm that doesn't widen the train/serve gap.

**Consequence for §1.** The feature-set-v1 line (07-13: title + description + SourceCategories + source-prior) predates the URL-join kill and assumed raw-candidate training text; it is partially rotted and owes a date-stamped amendment pointing here.

## 71. R7-W6 Representation Pick — Large Chosen, Small Eliminated on the Internal CV Screen; Inverts §68 (2026-07-22)

**Decision:** `text-embedding-3-large` is the W6 representation. `text-embedding-3-small` is eliminated. This inverts §68, which made small primary (on serve-time cost/compatibility) with large as a mere agreement check.

**What forced it.** 5-fold cross-validated per-class recall on the 1,126-event published corpus (the internal screen, not the transfer gate): **min-class recall — large 0.774, small 0.747.** The frozen §3 bar is ≥0.75 min-class. Small fails it on the *easier* internal measurement, and transfer to the raw distribution only degrades from there — so small cannot recover and is dead. Large clears the screen (+2.4pp over the bar) and carries forward.

**Why this is a screen, not the gate.** The §3 ≥0.75 bar is defined over the *gate slice* (editor-labeled raw). The internal CV measures self-consistency on published training text — a necessary pre-check (a model that can't clear the bar on its own distribution certainly won't on the shifted one), not the release gate. Large's thin margin (0.774 vs 0.75) means the transfer test remains load-bearing and is the next gate.

**Cost is moot, not overridden.** §68 chose small partly on serve-cost (large ~6× per token). At newsletter volume that difference is pennies, and a model under its own recall gate isn't a cheaper option — it's a failing one. So the cost logic of §68 does not survive contact with the recall result.

**Anti-scope note (what did *not* become new decisions).** The session re-derived, but did not re-decide: the cats train/serve asymmetry and score=serve recipe invariant (§70, already measured 43%), the flex-vs-None two-signal read and fuzzy C/G boundary (§64), and the deploy lifecycle (standard practice). The `clean()` 300-char truncation Ariel feared was audited to *display-only* (editor deck), zero model effect — consistent with §70. One decision, not four; the design held.

---

## 72. R7-W6 Release Gates Pre-Registered — Min-Class Recall ≥75% + Coverage ≥60% + Cats-Ablation Switch + Exit Table (2026-07-21)

**Decision:** the pass/fail contract for W6 — the bars the transfer test scores against — was pre-registered before any embeddings fit, CV, or transfer number was seen (Ariel's sign-off; derivation walked in-session, Execution_Log 07-21 session 2). *(Recorded as its own entry 2026-07-24 — it had been living only in `R7_Scope.md`'s results log, homeless in Decision_Log; §65 covered the earlier, now-dead representation gates (Gate 1/2/3), not these release bars. Promoting it out of the Scope doc was part of the 07-24 slim.)*

- **Recall bar: min per-class recall ≥ 75%**, gate slice, includable events only. Report raw fractions, not just percentages (Golden n=21 → 16/21; one event ≈ 5 pts of recall). Anchors: ceiling = editor self-consistency ~89% on both-included repeats (n=18, CI ~67–97); floor = 70% is the Gate 1 kill-line convention; precedent = the old (void) Gate 3's 75% floor.
- **Coverage bar (#98): ≥ 60% of includable gate events committed** (margin ≥ τ). Denominator is includable events only — abstaining on None-labeled events is correct behavior and excluded. TF-IDF's 18–24% confident band was known-too-thin; 50% was the derivation midpoint, raised to 60 on Ariel's editorial anchor (the system's purpose is killing the sorting work, not assisting with half of it). A floor, not a forecast — the model ships at whatever coverage it achieves ≥ 60.
- **Cats-ablation switch rule:** with-cats replaces without-cats only if min per-class recall improves by ≥ 10 points (≥ 2 events) with no class degrading. Forced by resolution arithmetic (per-class n = 20–46 → noise ≈ ±2 events); anything finer reads static.
- **Exit table (the bars' meaning):** both pass → ship to R6 (close-sequence Step 5). One fails → one iteration cycle (recipe/τ), re-run once. Both fail, or a second miss → embeddings don't transfer; reopen the LLM-primary path (§67, deliberately left undecided; horse-raced at the close-sequence gpt-5.4-nano step, under the roadmap's May decision rule).
- **CV on the 1,126 is a sanity check only** — no bar attaches; it cannot pass or fail the release. It picked large-over-small (§71) and confirms the representation isn't broken, nothing more.

**Why pre-register.** Thresholds set after seeing the data get rationalized ("74% is basically fine"). Locking the numbers first — against a derived rationale, not round numbers — removes that degree of freedom before it can be used. Same principle as §65's representation gates; this entry is the *release* version of it.

**Caveat carried forward (2026-07-24).** Both the recall and coverage bars are defined over the include/None split, and "None" is still undefined (conflates fails-criteria vs fine-but-outranked — `R7_Scope.md` §1 problem #3). Resolving that definition may revise these denominators; the bars are locked as *values*, not as immune to the definitional fix.

---

## 73. R7-W6 Embedding Provider Swapped to `voyage-4-large` @2048d — Availability, Not Quality; Amends §71's Model, Not Its Finding (2026-07-25)

**Decision:** the W6 representation is `voyage-4-large` at `output_dimension=2048`, `input_type=None`, replacing `text-embedding-3-large`. This **amends the model named in §71, not the finding §71 made** — that a higher-capacity representation beats a smaller one on the internal CV screen still holds, and `text-embedding-3-small` stays eliminated.

**Why the swap — and what it is explicitly not.** It is **not** a quality upgrade and **not** a cost saving. It is dependency removal on the one pipeline leg where the swap is free: Voyage grants 200M free tokens with no expiry, a full re-embed of all three corpora is ~42K tokens, so the embedding leg now costs nothing and consumes no OpenAI credit. That is the entire case.

**The benchmark that had to clear first** (`models/sectioning/eval/voyage_probe.py`, kept in-repo so this entry is falsifiable — it re-runs both existing tests verbatim with the representation as the only variable, reading the OpenAI baselines live from the cached matrices):

| min-class recall | OpenAI 3072d | Voyage 1024d | Voyage 2048d |
|---|---|---|---|
| Internal CV (n=1,126) | **0.774** | 0.728 | 0.744 |
| Transfer gate (n=77) | 0.611 | 0.615 | **0.667** |

**Read: performance-neutral, and 2048d is the condition of the swap.** The two tests disagree, so the question is which resolves a difference this size. CV at n=1,126 says OpenAI is ahead by 3 points min-class. Transfer at n=77 deduped includables — **one event ≈ 4 points** — cannot resolve a 5.6-point gap at all; Voyage's entire transfer "win" is 1–2 events. 1024d was rejected outright (loses 4.6 points of CV); 2048d halves that, and the 4-series is Matryoshka, so 2048 is a strictly wider view of the same space rather than a different model.

**Integrity caveat — the transfer number is not claimed as a gain.** Both arms were seen before the choice was made, so treating 0.611 → 0.667 as an improvement would be post-hoc selection on the eval set. That is precisely what §72's pre-registration and `transfer_test.py`'s four blind pre-commitments exist to prevent, and the caveat is duplicated in that file's docstring so it sits next to the guard it protects. The §3 bars, the §72 gates, and the head's hyperparameters are all unchanged; only X changed.

**Why the obvious rationale is wrong, recorded so it isn't re-derived.** "Conserve OpenAI credits" does not hold: a full re-embed is **half a cent** on `text-embedding-3-large`, and the content-hash cache re-runs it only when the corpus changes. The OpenAI bill is `generateBlurbs.js` on gpt-5.4-nano, and **Voyage sells no chat endpoint** — this swap does not touch it. Equally, "voyage-4-large is the better model" is true on MTEB-style *retrieval* and does not transfer to fitting a linear head on 1,126 labeled rows against an ~89% human ceiling. Consistent with the 07-24 fresh-lens read: the 3-class classifier is at its label-noise ceiling, so the backbone is not what's limiting.

**Reversibility + the new failure mode.** `embed_corpus.py` dispatches on model-name prefix, so `--model text-embedding-3-large` restores the OpenAI path; the old matrices are retained locally as the baseline. The cost is that `input_type` and `VOYAGE_DIM` are now duplicated across four call sites (`embed_corpus`, `transfer_test`, `live_demo_30`, `cv_embeddings`) under the same copy-don't-import discipline as `clean()` — but with a worse failure mode: a mismatch fits the head in one space and serves it in another, **silently**, with no exception raised.

---

## 74. R7-W6 Reframed — Ship a Reject Gate, Not a Section Classifier; Supersedes the §72 Min-Class Exit Table as the Release Gate (2026-07-25)

**Decision:** W6 pivots from *"ship a section classifier with min per-class recall ≥ 0.75"* to *"build a binary include/None **reject gate** and run the existing section classifier suggest-only behind it."* The gate outputs a calibrated `P(include)` tuned to **≥ 0.98 keeper recall**, and that same score doubles as the interim ranking signal (`final = P(include) × P(section)`), which is why R7 and R6 now feed each other. The **release bar changes**: min-class recall is retired as the headline (kept only as an internal diagnostic) in favour of **keeper recall ≥ 0.98 + editor-effort** (swaps ≤ 2–3 of 15, review < 15 min). This supersedes the §72 exit table *as the pass/fail contract* — §72's pre-registration discipline stands, the metric it gated does not. Full plan: `docs/r7/R7_Scope.md`.

**Why the classifier was the wrong deliverable.** The training population ≠ the serving population: the classifier learned on 1,126 *published* events (all winners) and is deployed on ~720 raw scraped candidates/week that are ~98% junk. The training corpus has **zero negatives**, so the model structurally cannot learn to reject — it confidently sections junk because "reject" is not a concept it owns. A 30-event live demo *with* the editor decomposed the failures by stage: the **classifier owns ~3 of ~19; the filter owns ~12, ranking ~4.** W6 spent the release improving the stage that owns the fewest failures.

**Why now, and why it's de-risked rather than a pivot-on-a-whim.** The reframe was validated three independent ways (the stage-decomposition demo, the per-source None-rate read, the transfer diagnostics) and then re-derived by **three outside LLM reviews** — an un-anchored Fable review (walled off from our docs, so it could not inherit the diagnosis), ChatGPT, and a second Claude review — which converged on the same spine: build the gate, don't touch the classifier or embeddings, retire min-class recall, don't chase Golden. Convergence from a lens that never saw our conclusions is the strongest evidence the release has produced.

**What the reframe kills.** The **τ-abstention path is dead**: confidence cannot do reject work — None vs includable confidence distributions are near-identical (medians 0.52 / 0.57), and a dedicated binary gate is ~7× more keeper-efficient at the same junk removal (Fable measured AUC 0.823 on the 416, text-only). The **transfer test / min-class exit table** is therefore moot as the gate — it measured section accuracy on a population that doesn't exist in production. The unresolved 0.61 provenance and the τ-calibration fork die with it.

**Two decisions deliberately left to experiment, not decided here** (recorded so they aren't mistaken for settled): **(A)** whether the gate trains on split labels — the 225 None must be split into *ineligible* (permanent → gate negatives) vs *outcompeted* (fine-but-lost-its-slot → R6 ranker data), because training on the merged pile teaches permanent rejection of good events; resolved by the editor None-split. **(B)** cheap ranker (gate score used twice) vs a real Bradley-Terry ranker — an R6 decision, resolved by the centroid-baseline recall@30, and it does not block W6.

**Scope-boundary note.** This does not resurrect the reject filter as a W6 build in the old §66 sense — it *is* §66's include/reject stage, now promoted to the release's primary deliverable because the evidence says that is where the value sits. W7 (live deploy) and the BT ranker (R6) remain deferred.

**Amendment (2026-07-26) — the population claim is corrected; the decision stands.** This entry states the serving pool is "~98% junk" and cites a ~2% keep rate. That number is a **slot rate**, not a junk rate: 15 published / ~720 in a window conflates *ineligible* events with *eligible-but-outcompeted* ones, because 5-per-section is a hard quota. The measured eligibility rate from the deck's representative slice is **~46.5%** (n=114, CI ±9; batches 1–2 independently 38.6% None). The reframe's **conclusion is unaffected** — the reject gate is still the missing stage, and ~53% ineligible is still a large removable chunk that nothing implements today. What changes is the arithmetic downstream: at the measured operating point (0.95 keeper recall / 43% junk rejection) a gate leaves **~537 events** for the ranker, and even a *perfect* gate leaves ~335 for 15 slots — so **ranking is load-bearing inside W6 rather than deferrable to R6**, and fork (B) no longer defers cleanly. Separately, the **≥0.98 keeper-recall bar has no measurement behind it** — the fresh-lens review prescribed 0.95, and only 0.95→43% / 0.90→55% are measured — and it was set against an assumed *scarcity* of keepers that does not exist at ~335 eligible per window. The resulting scope and operating-point questions are **open, not decided here.**

---

## 75. The None-Split Taxonomy Is Four-Way, and "Breadth" Becomes a Documented Editorial Criterion Evaluated at the Gate Rather Than at Stage 0 (2026-07-27)

**Decision:** `NoneType` splits four ways — **`Rule-break` · `Wrong fit` · `Outcompeted` · `Ambiguous`** — each mapping to exactly one consumer (Stage 0 / the gate / R6's ranker / excluded from both). Separately, the Brief's **breadth criterion** is adopted as a written editorial rule and evaluated **inside the gate**, not as a Stage-0 delete rule. Resolves the taxonomy fork left open by the 2026-07-26 audit; `NeededLink` is retired under the same decision. Implementation: `docs/r7/R7_None_Split_Labelling_Plan.md`.

**Why four rather than three with redefined boundaries.** The editor's first 12 rows showed he rejects four ways, not three: *breaks a rule* · *"not audience fit / too niche"* · *lost its slot this week* · *can't tell*. The second had no home and was leaking into **both** `Ineligible` and `Outcompeted`, poisoning the gate's negatives and the ranker's positives simultaneously. Four buckets put the load on the field he fills 12/12 (`NoneType`) and off the one he fills 0/12 (`NoneReason`), and collapse the reason-code ask from every row to rule-break rows only. The three-way fallback would bet the Stage-0 coverage number on a field already being ignored.

**Why the first 12 are a pilot, not a loss.** "Never change an instrument mid-run" is a rule written for row 150, not row 12; here the cost of changing is ~2 rows of comparability, because 10 of the 12 carry reasoning clear enough to remap ourselves for a two-minute confirm. Every row completed before the change makes the change more expensive, so the choice was now or never.

**The breadth criterion — new, and editorial rather than technical.** The Brief requires an event to appeal *across* communities rather than single one out ("Russian party", "Muslim food court"). This has governed selection for 15 months and had **never been written down** — CLAUDE.md's reject list names only B2B / civic / prof-dev / non-GTA. Three of the editor's four `Ineligible` rows are breadth rejections that break no written rule, and his frozen 07-18 notes ("*too niche. has to appeal to multiple communities*") show the criterion pre-dates our instrument. Articulating it is plausibly this labelling exercise's largest editorial output.

**Why breadth sits at the gate and not in Stage 0 — the measured reason.** Stage 0 hard-deletes, so it may act only on **facts** (geography, language, date, domain); a deleted keeper is invisible and unrecoverable. Breadth requires reading the event: *Italian Festival* is open and a keeper, *Shabbat Korach* is single-community and a reject — same keyword class, opposite verdicts. A religion/nationality regex separates them at only **1.7×** (9.3% of Nones vs 5.5% of includables, n=396) and would have deleted ten measured keepers including *Vaughan Asian Festival* and *Soul Food Caribbean Festival*. Raw-pool prevalence is 6.2% (112/1,805), so the pool is not disproportionately single-vertical either. Breadth is therefore **evidence a model weighs, never a rule that deletes** — and the flag is **parked entirely** until the gate's confusion matrix shows it is needed, because on 456 labelled rows against ~2,048 features the model is already 4.5× overdrawn on its feature budget and each added column is a fresh chance to overfit. The distinction the criterion actually turns on — *culturally themed and open* vs *single-community exclusive* — is semantic, which is what an embedding may carry and a regex provably cannot.

**Also settled here: `NeededLink` is retired.** It asked an editor habituated to opening every link for 15 months to self-report whether the link *changed* his answer — a counterfactual about his own reasoning, which measures habit rather than necessity (it correlated with nothing: ticked on both real-prose rows, blank on 5 of 7 metadata-only rows). Replaced by **live, text-first labelling of all remaining rows across 3–4 sittings**, with a free-text `LinkGave` recording what the link added. That converts a self-report into an observed behaviour, and — the reason it beats the cheaper LLM-based ceiling estimate — it names the missing **feature** rather than merely sizing the gap.

---

## 76. Stage 0 Deletes on Provenance and Record Facts Only — Content Rules Route to the Gate as Score, and a Missing Field Is Never Grounds to Reject (2026-07-27)

**Decision:** CLAUDE.md's four written reject rules are **not one homogeneous set** and must not all route to Stage 0. **Non-GTA, not-English and not-an-event are *record facts* and may hard-delete. B2B, professional development and civic are *content judgments* and may not** — they route to the gate as training signal, where a wrong call costs rank rather than existence. Separately, Stage 0 rejects only on **positive** evidence: a missing or malformed field is never grounds to delete. Extends §75's "Stage 0 acts only on facts" from a principle into a rule-by-rule assignment. Implementation: the #109 guard in `workflows/NLAP R1.json`; sizing consequences in `R7_Scope` Step 3.

**Why the split is forced by measurement rather than chosen.** The two groups have measured precisions an order of magnitude apart, on the same 239 rows. The **content** rules were scanned by keyword at **78% strict precision**, and every false positive is one failure mode — *a rule word appearing as content rather than as the event's nature* (*Leonid & Friends* matched "Chicago" and is a tribute band; an author talk matched "Georgia", the novel's setting; a consumer sports clinic matched "Training"). The **record-fact** rule was tested the same day at production scale and returned **51 of 396 with zero false positives**, because it reads a structured address field rather than interpreting prose. A stage that hard-deletes needs precision, not recall — a deleted keeper is invisible and unrecoverable — and 78% is nowhere near that bar while an address test clears it outright.

**The consequence nobody had priced: Stage 0 is much smaller than the scan implied.** The 41 flags are prof-dev 27 · B2B 15 · non-GTA 7. Under this decision **the first two do not belong to Stage 0 at all**, so Stage 0's deterministic yield is roughly the geography rules plus foreign domains, language and date-window — and #109 just banked its single largest component. Any Step-3 sizing that counted all 41 was counting the gate's work as Stage 0's.

**Why this does not weaken the filter.** The content rules still get enforced; they get enforced *by the model instead of by a regex*, and the enforcement is a low score rather than a deletion. Since the editor only ever sees the top few per section, a B2B webinar at rank 600 and a deleted B2B webinar produce identical output — but only one of them is recoverable when the call was wrong, and only one keeps generating labels. **(This is also the argument for Fork B's "hard-kill on facts, never on scores," which remains OPEN and Ariel's — this entry settles what Stage 0 may delete, not whether the gate deletes at all.)**

**The escape hatch that recovers most of the lost volume: provenance rules.** `organizer = AdeptSkil` is a **fact about the record**, not a reading of the text, so a repeat-offender organizer emitting near-identical templated listings *can* be deleted deterministically without content interpretation. That single organizer is 18 of the 32 true rule-breaks in the 239 and ~13% of the editor's remaining workload. The generalizable form: **delete on who published it, never on what it says.**

**Why absence is not evidence.** The #109 guard rejects on positive foreign markers (`, GA` / `USA` / `United States`) and passes anything it cannot classify, even though `venue.full_address` is populated on **390 of 390** live records and a "must contain Canada" rule would work today. The asymmetry is the reason: if AllEvents changes its address format, a positive-evidence rule leaks a few rows while an absence-based rule silently deletes an entire source — ~40% of production — with no error and no alarm. The same logic forbids "no description → drop", which the 07-27 measurements had already killed empirically (blank rows are **48.3%** includable against a 46% base). **A field we failed to collect is a fact about our pipeline, not about the event.**

**One trap this decision bakes in, recorded so it is not rediscovered:** the guard needs a `!DOMESTIC_ADDRESS` clause because **`, CA` is simultaneously California and Canada.** A foreign-marker list that looks obviously correct will delete Ontario events without it.

**Corollary for the gate's training set (added 2026-07-27 evening; retracts an earlier read).** A deck row whose *only* defect is a record fact handled upstream — the 3 non-GTA rows carrying a positive editor label — **keeps both its labels and stays in the gate's training set.** An earlier resolution called them "label noise in the gate's positive class" and proposed excluding them from the gate; that applied pre-§76 logic to a post-§76 architecture. Once geography is removed at ingestion (#109), **a foreign event never reaches the gate, so the gate is never asked the geography question.** The only question its label answers is *"is this content newsletter-eligible?"* — and for a community yard sale the answer is genuinely yes. The model learns "yard-sale-like text → include," which is correct for the Vaughan yard sale it will actually see. **The risk runs the other way, and it is the one to guard.** A foreign row sitting in the gate's *negative* pile teaches it to reject good content for a reason absent from the features; the four-way instrument prevents this only if such rows are tagged `Rule-break` (→ Stage 0) rather than `Wrong fit` (→ the gate). **Generalized: a row's label is valid for a stage iff the defect that would invalidate it belongs to a different stage.** Revisit only if deck re-detection via `full_address` returns a large count — 3 of 211 is a distribution question not worth pre-deciding.

**Amendment (2026-07-28) — not-English and not-an-event are REMOVED from Stage 0's deletable set.** This entry assigned three rules to the record-fact side: *non-GTA, not-English and not-an-event*. Two of those are wrong on this entry's own test. **Not-English is a content judgment, not a record fact.** The question a language rule actually asks is *"can my readers use this listing?"* — and the live pool holds `Photography 101 攝影基礎班` at a Richmond Hill church while the deck holds `Hebrew Storytime / שעת סיפור בעברית`, both plausibly legitimate local events whose *listing* happens not to be in English. Detecting the script is trivially a fact; concluding the event should be deleted is not, and it is the conclusion that hard-deletes. Routed to the gate, with the editor's own rule for it now a TBD-from-editor question. **Not-an-event fails a different test — low yield, and not deterministically decidable.** Its real targets (sign-up forms, sponsor ads, donation drives) are content readings wearing a structural costume, and the scan surfaces four rows in 239. Dropped from Stage 0 scope rather than routed. **Net: Stage 0's deterministic set is geography, date-window and provenance/domain rules — smaller again than §76 left it.** The direction of every correction to this step has been the same, which is itself the signal: *the deletable set shrinks every time it is measured.*

---

## 77. The None-Split Instrument Collapses to a Single Multiselect Field, and Routing Moves From the Editor's Answer Into Our Code (2026-07-28)

**Decision:** `NoneType` is **deleted**. `NoneReason` becomes a **single 6-option multiselect** — `non-GTA` · `B2B / professional` · `civic` · `wrong fit / not our audience` · `outcompeted` · `can't tell` — and the editor ticks every option that applies. Routing to Stage 0 / the gate / R6's ranker is **derived from the ticks in a written priority order**, not read off a bucket he chose. Supersedes §75's four-way `NoneType` as the *instrument*; §75's four-way *taxonomy of rejection reasons* is unchanged and still describes how the editor rejects. Applied to the live base 2026-07-28. Implementation: `docs/r7/R7_None_Split_Labelling_Plan.md` §0.

**Why the two-field design was wrong, and it is the same error twice.** The four-way `NoneType` **forced a single answer where a row often has more than one thing wrong with it** — a Savannah business webinar is non-GTA *and* B2B, and the instrument made the editor pick. That is precisely the failure the pilot exposed in the three-way instrument (a rejection reason with no home), relocated one level up rather than removed. The tell was that both of the pilot's *contested* rows — *GODfidence Conference* (breadth vs B2B) and *Zumba Instructor Training* (a professional-development fact against a popularity verdict) — were contested **only because one bucket had to win.** Under multiselect both are ticked and neither needs adjudicating.

**What this dissolves rather than answers.** The `Rule-break` definitional question — *does the bucket mean "a written rule applies" or "a written rule is why I rejected it"?* — had been the deepest item on the board, blocking the field descriptions, which blocked the respec, which blocked the sittings. **It has no answer under this design because it has no referent:** both facts are recorded, and the routing order decides the consequence. A question that only exists because of a forced choice disappears with the forced choice.

**Why §76 made the old design untenable.** §76 sent content rules (B2B, civic, prof-dev) to the gate and record facts to Stage 0. That **broke `NoneType`'s one-bucket-one-consumer property**, which was §75's entire justification for four-way: `Rule-break` now split across two stages. A bucket that no longer maps to a consumer is doing no work.

**Why routing belongs in code and not in the instrument.** Asking the editor which *stage* should handle a row asks him to hold our architecture in his head while judging events. The priority order does it instead: **`non-GTA` → Stage 0** (facts act first — the row is deletable regardless of what else is ticked) · **`can't tell`** → excluded · **`wrong fit` / `B2B / professional` / `civic`** → the gate's negatives · **`outcompeted` alone** → R6's ranker, withheld from the gate. **`outcompeted` ranks last deliberately:** it is the weakest claim and the most damaging if wrong (§75 withholds it from the gate because it is a property of the week, not the event), so anything else ticked beats it and a confused double-tick **fails safe — into the gate, never out of it.**

**A correction to §75's stated reasoning, which does not change its decision.** §75 argued four-way "puts the load on the field he fills 12/12 and off the one he fills 0/12." **That argument is withdrawn.** The 0/12 was a **UI affordance failure** — Airtable multiselects require clicking a `+` the editor never saw — measured this session at **0 of 456 records**, i.e. nobody has ever used the field, for any row, in any batch. `NoneReason` was untested, not rejected. The surviving argument for moving routing into a required single-click field is different and weaker: **a blank second field fails silently**, routing nothing, with no error.

**Two options were drafted and cut, both for the same reason.** `outside window` cannot fire — the deck was drawn from candidates R1's `DateWindow` node had already filtered — and more fundamentally **a date is a record fact the machine knows exactly, so asking a human to tick it violates §76's own rule that record facts are detected, never asked.** `non-GTA` survives that test only as a *fallback*: the deck predates the #109 guard, non-AllEvents sources expose no address field, and the editor may notice "Savannah" while reading, so his tick can add information the machine lacks. A date never can. **B2B and prof-dev were merged** into one option because they co-occur (8 of 41 scan flags are multi-rule, mostly this pair), the 2026-07-27 adjacency ruling treats them identically, the editor's own reasoning conflates them, and Step 4's un-park diagnostic already reports them as **one** stratum. `civic` stayed separate — council meetings and zoning are neither commerce nor careers, and folding them in reproduces the incoherent `WrongType - B2B/civic/prof-dev` grab-bag the editor never used.

**The cost, stated plainly:** this is the **third instrument in three days**. The first change was the pilot doing its job — it was driven by editor data that did not exist when the three-way instrument was designed. This one was not: every fact needed to see it was available on 2026-07-27. **The rule going forward is that instrument changes are justified by new data, not by better reading of old data** — and at 12 of 239 rows labelled, the remapping cost is ~2 rows of comparability, which is why now was still cheaper than never.

---

## 78. Fork B Resolved by the Deployment Target, Not by a Decision (2026-07-28)

**Decision:** the gate **scores and sorts; it never deletes.** Fork B is closed — not by weighing the trade-off, but because the architecture had already foreclosed one branch. The gate deploys into **R2** (`R7_Scope.md:199`), which runs *after* R1 has upserted the Candidate; by the time the gate scores anything, the record exists. "Don't write it" is available only to **Stage 0**, which lives in R1 and acts on facts (§76). Deleting at the gate would mean actively deleting a row R1 had just written — something nothing in the stack does, and strictly worse than setting a status, since a status is reversible and a delete is not.

**What this changes downstream.** Pin (1) `RECALL_DIAL` in `gate_step4a.py` stops being a kill threshold and becomes a **reporting-and-alarm commitment**: at the chosen recall we report, we alarm, and we set the auto-accept band — but nothing is destroyed at that boundary. This satisfies the §Appendix blind-pass catch (*"never hard-drop; weekly reject-rate alarm; one-click editor rescue"*) **by construction rather than by discipline**, which is the stronger form. It also means Step 4a is measuring *"how good is this score"* rather than *"where is the kill line"* — the reframe proposed on 2026-07-27 and left undecided, now forced rather than chosen.

**The one thing that would reopen it.** Putting the gate in **R1** instead. §68/§71's stack is a logistic head "scored in Node from a JSON artifact," so it *could* run in an n8n Code node — but that would mean an embedding API call per candidate at ingestion, inside the workflow that broke on 2026-07-27. Rejected on blast radius, not on capability. If that ever changes, this entry is void.

**The lesson is about board hygiene, not architecture.** This question led the immediate-next-action line for **four consecutive sessions** as *"Ariel's call, unresolved,"* and it was never a call. **Before pricing a trade-off, check whether the deployment target has already eliminated one side of it.** The cost of not checking was four sessions carrying a decision-shaped hole where a ten-second inspection belonged — a sibling of the `Rule-break` question §77 dissolved, and of the world-vs-instrument table in `R7_Scope`: in all three cases the question was an artifact of how we had framed it, not a fact about the problem.

---

## 79. One Text Recipe, Applied at Score Time, Raw Preserved in the Store (2026-07-28)

**Decision:** `clean()` has **exactly one definition** — `models/sectioning/text_recipe.py` — and it is applied **on read at score time, never at ingestion**. R1 continues to store `DescriptionRaw` raw. The four byte-identical copies (`transfer_test.py`, `live_demo_30.py`, `eval/voyage_probe.py`, `classifier2give2editor.py`) now import it; verified byte-identical across all 1,805 corpus rows *before* the move, so no cached embedding changes.

**Why this was load-bearing rather than tidying.** §70's invariant is `score-time recipe == serve-time recipe`. The audit that prompted this found something the invariant's wording hides: **`clean()` is not in R1 — it is nowhere in the pipeline at all.** R1 does per-source normalization (entity decoding, HTML stripping) and writes the result raw; there is no cleaning step and no char cap anywhere in the workflow. So the invariant has never been *violated* only because **one side of it does not exist yet.** It is a claim in a document, not a property of the system. W7 must build the serve side, and with four copies that port is a guess about which one was current. One definition makes it a port.

**Why on read and not at ingestion.** Cleaning in R1 would overwrite `DescriptionRaw` irreversibly, and **every rule in the recipe is a judgment that may prove wrong** — two `BOILER` entries strip bare `online` and `in person` lines, which are noise for a section classifier and plausibly load-bearing for a reject gate. **Raw in the store, recipe on read** keeps all of it reversible, and is the same asymmetry §76 encodes for Stage 0: act irreversibly only on facts.

**What four copies were hiding.** `classifier2give2editor.py` hardcoded `[:300]` instead of referencing the `DESC_CHAR_CAP` knob — the one file that would have silently kept the old cap through arm 2's sweep, producing a comparison where one arm quietly didn't move. **Four copies agreeing by luck is not an invariant.** Separately, `build_ambiguous_sections.py` has a `clean()` that is an *unrelated function sharing the name* (it strips leading emoji from titles); it is not part of the recipe and was left alone. A name collision inside the same package is its own small trap.

**What ships into this file next, and when.** The two AllEvents detail-page artifacts — the title duplicated at the head (106/111 recovered records) and a trailing nav block that pastes **other events' titles and cities** into the row (*"The Jury Experience : Meurtre au large | Quebec in Quebec"* inside a Markham row) — are **not** stripped yet. They cannot appear in production today because R1 does not fetch detail pages. They enter `text_recipe.py` **in the same change that wires that fetch into R1**, so the recipe never leads or lags the data it describes. Note the second artifact is not boilerplate a model should learn to ignore: it is *wrong information*, and a mean-pooled 2048-d vector has no way to discount it.

---

## 80. Machine-Applied Labels Stay Permanently Distinguishable From Editor-Authored Ones (2026-07-28)

**Decision:** anything we fill into the labelling deck carries a **permanent marker**, and the marker's strength matches the evidence behind it. Two fields, deliberately not one:

- **`OutsideGTA`** (checkbox) — *we ticked `NoneReason` for you*. Applied **only from a record fact**; currently the #109 address re-detect, which read each event's venue address off its own detail page. 14 rows. The address we read is quoted in `NoneReasoning` on every row so the claim is checkable without leaving the row.
- **`PreMarked`** (multiselect: `b2b / prof-dev` · `civic` · `non-GTA`) — *a keyword scan suspects this*. **Writes no label.** 78% precision stated plainly in the field description. 46 rows.

Both survive into the training set, so any fit can stratify on or exclude machine-touched rows.

**Why two fields rather than one confidence score.** The difference is **kind, not degree**. An address is a fact the editor cannot know better than we can. A keyword match is a guess whose false positives all share one failure mode — **a rule word appearing as content rather than as the event's nature** (*Leonid & Friends* matched "Chicago" and is a tribute band; an author talk matched "Georgia," the novel's setting; both came through on schedule this session). Collapsing the two onto one scale would let a 78% guess inherit a fact's authority, which is exactly the error §76 forbids at the stage level, reproduced at the field level.

**The cost, named rather than waved at.** A visible hint **anchors the editor**, and roughly 1 in 5 hints is wrong. Accepted, because he touches every row regardless and the field says out loud that it is a guess — but the consequence is real: **his labels on flagged rows are no longer fully independent of ours.** That is why the marker is permanent rather than a temporary sort key. A future analysis that finds the flagged stratum unusually clean must consider that we told him the answer first.

**The generalizable rule:** *pre-sort on suspicion, pre-fill only on facts, and never let the two share a column.* The 2026-07-27 call was "pre-sort, don't pre-label"; this refines it — pre-labelling **is** allowed, but only where the evidence is a record fact, and it must be labelled as ours forever.

---

## 81. Listing Language Never Decides Eligibility Alone; Cultural Breadth Turns on Cross-Community Appeal, With Lunar New Year an Explicit Accepted Case (2026-07-29)

**Decision:** A listing being partly or fully in another language is neither an automatic rejection nor, by itself, grounds for `can't tell`. The event is judged from the rest of its content, using the link or translation when needed. Separately, association with one cultural or religious community does not automatically make an event too narrow: Lunar New Year is an explicit accepted case because its appeal crosses communities. This refines §75's breadth criterion and closes §76's TBD-from-editor language policy.

**Why:** The first live None-split sitting exposed a conflation between *the editor cannot immediately read the listing* and *the event itself lacks enough information*. Those are different conditions. It also confirmed that cultural theme and audience exclusivity are not synonyms: the operative question is whether the broader readership would use the event.

**Operational consequence:** `can't tell` is used only when the event remains genuinely indeterminate after the available text and necessary link check. Language and cultural keywords never become Stage-0 delete rules. Lunar New Year is an editorial positive exception, not evidence that every culturally specific event passes the breadth test.

---

## 82. The Editor Sample Is The Gate's Disagreement Set, Not A Designed Sample (2026-07-30)

**Decision:** the positive-class audit is sourced from the gate's own highest-confidence errors after a diagnostic Step 4a run, not from a stratified sample designed before the model exists. Step 4a runs on current labels and is explicitly **diagnostic** — it bounds Fork C and locates label errors; it does not set the release bar.

**Why the designed sample was cancelled.** Three instruments were proposed and each was tested before it was built. A breadth keyword scan finds 8 of 211 with ~78% precision — no rule isolates the contamination. A published-history control arm joins on 2 of 211 — the §62 join failure again. And a 20–50 row "would you run this?" pass sits under a **15–25% noise floor** set by the editor's own 75–82.5% self-agreement, so the null and the finding are the same number. **The instrument could not detect what it was built for.**

**Why disagreement-based sampling beats it.** Contaminated positives are *self-revealing*: a single-community event sitting in a section pile resembles the breadth violations in the negative pile, so the gate scores it low and it surfaces as a false negative without anyone guessing which rows to check. The model samples at the decision boundary — where a label error actually moves the operating point — and it **ranks** the errors, so the sitting starts with the rows that move the number most. A uniform sample spends editor time on easy rows that decide nothing.

**What it costs, named rather than discovered.** This pass of Step 4a is measured against a positive class known to be unaudited, so its curve **bounds** the answer and cannot set the bar. The bar is set on the re-fit after the disagreement sitting.

**The question framing is part of the decision.** The sitting asks *"is there a reason you'd never run this?"* — a rule question — not *"would you run this?"*, which is a preference question and therefore the `outcompeted` variable wearing a different hat. Rules have higher self-agreement than preferences; that difference is the only thing lifting the signal above the noise floor.

**Generalized:** do not buy human labels before the model says where it is confused. The corollary is the one that bites — when the instrument's expected null equals its expected finding, the instrument is not cheap, it is worthless, and that is checkable before it is built.

---

## 83. `outcompeted` Is an Impure Label That Absorbed Permanent Audience-Fit Rejections (2026-07-30)

**Decision:** the 69 rows carrying `outcompeted` alone stay **withheld from the gate** — not because §77's rationale was validated, but because the label is impure. The remaining 49 are **scheduled to be relabelled** in one blind sitting before Step 4a — not yet run — under a written contract: *eligible regardless of the week* keeps `outcompeted`; *permanent audience/content rejection* becomes the applicable permanent reason or `wrong fit`; *unclear* becomes `can't tell`; a permanent reason already ticked alongside `outcompeted` wins, per §77.

**Why.** A 20-row blind sitting on deliberately hard cases returned **10 eligible / 7 permanent-reject / 1 unclear**. Seven permanent rejections is impurity, full stop. The *mechanism* is the finding: the editor rejects on **audience-demographic fit** — a permanent property of the event against the readership — and never once reasoned about competition, on any row but one. Rejections read *"demographic is 75% women AND 30-65"*, *"older women probably don't listen to Afrobeats"*, *"not an age range of old people or like our demographic"*; the accepts run the same axis (*"exactly what older women like"*). That is `wrong fit` — a gate **negative** — living inside a label routed to R6.

**His own definition, unprompted, is the confirmation.** *"In comparison for other events but it's not that I would pick it up for the top 15."* There is no counterfactual in it — no *"I'd run it in a quieter week"*, which is the entire basis of the gate-positive case. And **"top 15" is a slot statement**: 3 sections × 5 is a hard quota, and an event misses it whether it is ineligible *or* eligible-but-beaten. That is §74's amendment — the "~2% keep rate" slot-vs-junk conflation — recurring one level down, in a label instead of a metric. **Anything anchored to "the 15" inherits the error.**

**What this corrects in §77 without changing it.** §77 withholds `outcompeted` because it is "a property of the week, not the event." The sitting shows that is frequently false. The routing *action* survives; its *justification* does not. The distinction is not pedantic: after relabelling, genuinely eligible rows may become gate-positive while still serving R6 as ranking evidence, which §77's stated reasoning would forbid.

**The one true instance, recorded because it inverted the prediction.** r423 was flagged pre-sitting as the clearest contamination in the sheet, on the strength of its original *"this is a party, so outcompeted."* Blind, the editor said *"every once in a while on a quiet week this would be included but not every week"* — the counterfactual clause, and the only unambiguous `outcompeted` in twenty rows. **The row predicted to be worst was the only clean one.** Blind re-elicitation earned its cost on this row alone.

**What the sitting cannot do, stated because it was briefly claimed otherwise.** The sample was *deliberately discriminative* — chosen to detect impurity, not to measure it. It proves the pile is mixed; it estimates **no** proportion. Any "X% of the 69 are positive" claim is unsupported, and one was published and withdrawn the same session.

**The generalizable rule:** *a label whose meaning is never written down will be filled with whatever the labeller finds convenient.* `outcompeted` shipped as an option in a multiselect with no one-sentence definition in its Airtable field description. §77 wrote a precise priority order for how the ticks **route** and never wrote what they **mean** to the person ticking them. Recovering that sentence cost a live editor sitting; writing it would have cost two minutes. **Every option in an editor-facing field gets its definition in the field description, at creation.**
