# NLAP Decision Log
*Last updated: 2026-05-20*

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
| Quality metric thresholds | Structure agreed (section 16); targets deferred | 2–3 live issues of data |
| Multi-tenant base architecture | base-per-newsletter recommended (section 15) | Confirmation from Nathan (post-MVP prerequisite #6) |

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

**Status:** recommendation confirmed 2026-05-10. Pending final sign-off from Nathan (post-MVP prerequisite #6) before R5-W2 builds on it.

---

## 16. Quality Metrics

**Decision: editor acceptance rate without modification is the primary quality metric.**

*Defined 2026-05-10.*

**Primary metric:** blurbs published as-is vs. blurbs edited before export. Directly reflects whether the pipeline is producing output the editor trusts without intervention.

**Guardrails (secondary):**
- CTR doesn't materially drop issue-over-issue
- NeedsReview rate stays bounded below an agreed X%

**Threshold targets:** deferred until 2–3 live issues of data exist. The metric structure is agreed; the specific thresholds are not.

**Why this metric:** scoring is unfalsifiable without an agreed measurement of quality. Editor acceptance rate is directly observable at runtime via the manual override audit trail (R8-W8) and requires no additional instrumentation.

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

