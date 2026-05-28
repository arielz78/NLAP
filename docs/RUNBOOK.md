# NLAP Script Runbook

This document explains how the newsletter automation pipeline works, the order scripts run in, and what to do when something goes wrong.

---

## How the Pipeline Works

Every week, four scripts run in sequence to go from a pool of raw event candidates to a finished newsletter ready to paste into Beehiiv. Think of it as an assembly line — each script hands its output to the next.

There are two roles in the pipeline: **deciding** and **executing**.

- `buildIssues.js` is the decision-maker. It never touches Airtable. It takes candidate data as plain arrays and figures out which event goes in which section, slot, and issue date.
- `connectAirtable.js` is the executor. It fetches everything from Airtable, hands it to `buildIssues.js`, then writes the results back.

The reason they're separate: if the decision logic changes (e.g. new quota rules), you only touch `buildIssues.js`. If the data source changes (e.g. switching from Airtable to a database), you only touch `connectAirtable.js`. Neither script needs to know how the other works.

```
Airtable Candidates
       ↓
connectAirtable.js     ← fetches candidates + locked items from Airtable,
       ↓                  passes them as plain arrays to buildIssues.js
  buildIssues.js       ← pure decision logic, no Airtable:
       ↓                  - sets the date window (IssueDate+1 → IssueDate+10)
       ↓                  - enforces section quotas (5 slots per section)
       ↓                  - ranks by score, applies venue diversity rules
       ↓                  - respects locked slots
       ↓                  returns a plan: which event → which section/slot/date
connectAirtable.js     ← takes that plan and writes IssueItems to Airtable
       ↓
generateBlurbs.js      ← for a given issue date, calls GPT to write
       ↓                  DisplayTitle, Description, CTA per IssueItem,
       ↓                  writes copy back to Airtable
 pushToBeehiiv.js      ← fetches IssueItems with blurbs, renders HTML,
                          outputs one file with 5 sections for Beehiiv
```

---

## Script Overview

### 1. `buildIssues.js` (R3 — Allocation Logic)

**What it does:** This is the brain of the pipeline. It takes the list of approved event candidates and figures out which event goes in which section and slot for each upcoming issue. It does not touch Airtable at all — it's purely a decision-making script.

**Rules it enforces:**
- Each section has a quota (e.g. For Families: 5 events per issue)
- Events are ranked by score — higher score gets placed first
- No venue can appear more than once in the same section in the same issue
- Events must fall within the correct date window for each issue (the 10 days after publish date)
- Locked events (manually pinned by the editor) are respected and never overwritten

**Input:** Approved Candidates from Airtable + any locked IssueItems  
**Output:** A planned list of IssueItems (not yet written to Airtable)

---

### 2. `connectAirtable.js` (R3 — Airtable Read/Write)

**What it does:** This script is the bridge between the allocation logic and Airtable. It fetches the data `buildIssues.js` needs, runs it, then writes the results back to Airtable.

**Steps it runs:**
1. Fetches upcoming Issues records from Airtable
2. Fetches approved Candidates from Airtable
3. Fetches existing IssueItems (to find locked ones)
4. Deletes all unlocked IssueItems (clears the slate for re-allocation)
5. Runs `buildIssues.js` with the fetched data
6. Writes the new IssueItems back to Airtable
7. Writes a SelectionNotes summary to each Issue record

**Input:** Live Airtable data  
**Output:** Populated IssueItems table in Airtable

---

### 3. `generateBlurbs.js` (R4 — Copy Generation)

**What it does:** For a given issue date, this script takes each IssueItem and writes the newsletter copy — a display title, a 10-word description, and a call-to-action. It uses GPT to generate the copy in the Vaughan Brief's voice and style, then writes it back to Airtable.

**Run it like:** `node scripts/generateBlurbs.js 2026-05-29`  
Add `--dry-run` to preview output without writing to Airtable.

**Input:** IssueItems for a specific date (must already exist from R3)  
**Output:** DisplayTitle, Description, and CTA fields filled in on each IssueItem in Airtable

---

### 4. `pushToBeehiiv.js` (R4 — HTML Export)

**What it does:** The final step. For a given issue date, this script takes all IssueItems with their blurbs and renders them into formatted HTML — one block per section. The output is a `.html` file you open, then copy each section into the matching Beehiiv HTML block.

**Run it like:** `node scripts/pushToBeehiiv.js 2026-05-29`  
Add `--dry-run` to print the HTML to the terminal without saving a file.

**Input:** IssueItems with blurbs for a specific date (must already exist from R3 + R4a)  
**Output:** `output/YYYY-MM-DD_beehiiv.html` — 5 sections, one per Beehiiv HTML block

---

## Glossary

Terms used throughout this document and in Airtable.

| Term | Meaning |
|------|---------|
| **Candidate** | One event from one source. Lives in the Candidates table. Every ingested event becomes one Candidate. |
| **IssueItem** | One allocated slot in one issue. Lives in the IssueItems table. Has a section, slot number, links to a Candidate and an Issue, and holds the DisplayTitle, Description, and CTA. |
| **Issue** | One newsletter date. Lives in the Issues table. Created manually before each R3 run. |
| **IssueDate** | The Thursday publish date. The date window for events is IssueDate+1 through IssueDate+10. |
| **Section** | One of the 5 newsletter segments: For Families, For Couples, For Golden Age Readers, Local Aroma, Trust Me Recipe. |
| **Slot** | The numbered position within a section (1–5). Trust Me Recipe is 1–2. |
| **Lock** | A checkbox on IssueItems. When checked, the slot and blurb are protected — R3 won't reassign the slot and R4 won't regenerate the blurb on the next run. |
| **SegmentSuggested** | The section R2 (classification) assigned to a Candidate. |
| **NeedsReview** | A flag on Candidates. If true, the event is excluded from allocation — it needs a human to look at it first. |
| **Score_Final** | A ranking score on Candidates used by R3 to decide which events get placed first. Higher score = placed first. |
| **R2Status** | Lifecycle field on Candidates: Pending (not yet classified) / Enriched (classified) / NeedsReview (low confidence) / Failed. |
| **UniqueEventID** | The deduplication key for events: `lowercase(title)\|YYYY-MM-DD`. Prevents the same event from being ingested twice. |
| **R1 / R2 / R3 / R4** | The four pipeline stages: ingestion / classification / allocation / copywriting + export. |

---

## Airtable Data Model

There are three tables that matter for running the pipeline day-to-day.

### Candidates
Every ingested event becomes one Candidate row. This is the central working table.

| Field | What it's for |
|-------|--------------|
| `Event Title` | The event name |
| `Start Date` | When the event starts — used by R3 to match events to the right issue window |
| `URL` | The event link — required for eligibility and used in the newsletter blurbs |
| `City` | Vaughan / Richmond Hill / Markham |
| `LocationName` | The venue name — used to enforce the one-venue-per-section rule |
| `DescriptionRaw` | The source's description — R4 uses this to generate blurbs |
| `Status` | New / Approved / Rejected / Featured. R3 only allocates Approved records. Rejected = soft delete — records are never removed |
| `SegmentSuggested` | The section R2 assigned this event to |
| `NeedsReview` | If true, R3 skips this event until a human reviews and clears it |
| `Score_Final` | Ranking score — higher score gets placed first in R3 |
| `LLM_Rationale` | Why the classifier picked the segment — useful for auditing classification decisions |

### Issues
One row per newsletter issue. Created manually in Airtable before each R3 run.

| Field | What it's for |
|-------|--------------|
| `IssueDate` | The Thursday publish date |
| `Status` | Planned / Draft / Sent |
| `SelectionNotes` | Written by R3 after allocation — flags any sections that didn't reach quota |

### IssueItems
One row per allocated slot. R3 writes these; R4 fills in the blurbs.

| Field | What it's for |
|-------|--------------|
| `Section` | Which newsletter section this slot belongs to |
| `Slot` | Position within the section (1–5) |
| `Issue` | Link to the Issues record |
| `Candidate` | Link to the Candidates record |
| `CandidateURL` | The event link — what the blurb title and CTA link to |
| `CandidateStartDate` | The event start date — visible here so you don't have to click through to the Candidate |
| `DisplayTitle` | The blurb headline generated by R4 |
| `Description` | The 10-word event description generated by R4 |
| `CTA` | The call-to-action link text generated by R4 |
| `Lock` | Checked = slot and blurb are protected from reruns |
| `Notes` | R4 writes validation warnings here if a blurb didn't meet word count or CTA rules |

### Key Airtable Views

| View | Table | What it shows |
|------|-------|--------------|
| `R3 - Eligible for Scheduling` | Candidates | Events R3 can allocate — Status = Approved, NeedsReview = false, has Start Date and URL |
| `R2 - NeedsReview` | Candidates | Events flagged for human review — check here regularly and clear or reject |
| `R2 - To Enrich` | Candidates | Events not yet classified — R2's input queue |

---

## Client Funnel — Weekly Review

*This is what the editor does each week, in Airtable, after R1 and R2 have run. Cadence: weekly on Fridays (confirmed 2026-05-28).*

**The funnel has two distinct stages with two distinct decisions. Don't conflate them.**

- **Step 1 (`R2 - Enriched`):** Is the SEGMENT label correct?
- **Step 2 (`R3 - Eligible for Scheduling`):** Is the EVENT good enough to go in the next issue?

Quality judgment does not happen at Step 1. Segment correctness does not happen at Step 2.

### Step 1 — `R2 - Enriched` view: segment correctness

Events the classifier confidently labeled. Your only question here: **is `SegmentSuggested` right?**

| Action | When to use it |
|---|---|
| **Approve** | Segment is correct (either originally, or after you fixed it). |
| **Fix segment → Approve** | Segment is wrong but the event fits another segment — change `SegmentSuggested` to the right one, then Approve. |
| **Reject** | Segment is wrong and not worth fixing, OR the event is junk (B2B, civic, out of area, irrelevant). |
| **Leave alone** | Undecided. Stays in the queue. |

You are NOT deciding whether the event belongs in the newsletter at this stage. That decision happens at Step 2. Speed matters — one-click decisions, don't deliberate.

### Step 2 — `R3 - Eligible for Scheduling` view: pick events for the next issue

Filter: `Status = Approved`, Start Date ≥ today. Grouped by segment.

This is where editorial judgment lives. From the approved pool, pick the events you actually want in the next issue, section by section against the quotas (5 per main section, 1–2 for Trust Me Recipe).

Whether an event was "good" is revealed automatically by what you pick here and what ultimately publishes in Beehiiv — no quality flag to set.

### Step 3 (optional) — `R2 - NeedsReview` view

Events the classifier wasn't confident about — missing fields, ambiguous segment, low confidence.

Same logic as Step 1: fix the segment if you can, then Approve. Otherwise Reject. Skipping is fine — these are bonus pool depth, not required.

### What's tracked automatically (no editor action needed)

- The pool the editor reviewed each week (snapshot captured at every pipeline run)
- When each Approve / Reject decision was made (via `StatusLastModified` field)
- Segment edits — when `SegmentSuggested` is changed from R2's original value, the diff is the training signal for the R7 improved classifier
- Which approved events were picked for an issue (via IssueItems table)
- Which picked events actually made it into the published Beehiiv issue (matched post-publish by URL — no tagging required from editor)

---

## Rules the Pipeline Enforces

These are the editorial rules baked into the allocation logic. If you want to change any of them, speak to the developer — they require a code change.

| Rule | Detail |
|------|--------|
| **Date window** | Events must start between IssueDate+1 and IssueDate+10 inclusive. An April 9 issue covers events April 10–19. |
| **Section quotas** | For Families, For Couples, For Golden Age Readers, Local Aroma: 5 events each. Trust Me Recipe: 1–2, manual only — never auto-allocated. |
| **Score ranking** | Higher Score_Final gets placed first. Ties broken by earliest Start Date. |
| **Venue diversity** | Maximum 1 event per venue per section per issue. A venue can appear in multiple sections but not twice in the same section. Blank venue always passes through. |
| **Lock protection** | Locked IssueItems are never reassigned (R3) and their blurbs are never regenerated (R4). |
| **Past issues untouched** | R3 only allocates to issues with IssueDate on or after today. Past IssueItems are never modified or deleted. |
| **Editorial overrides sticky** | R1 never overwrites a Status of Approved, Rejected, or Featured. Manual decisions are permanent unless you change them yourself. |

---

## Error Reference

When a script exits with an error message, find it below and follow the fix steps.

---

### buildIssues.js

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid date input: <value>` | A Candidate record has a blank or malformed Start Date field | Go to Airtable → Candidates → find the record with the bad Start Date → fill it in → re-run |

---

### connectAirtable.js

| Error | Cause | Fix |
|-------|-------|-----|
| `Duplicate IssueDate in Issues table: YYYY-MM-DD` | Two rows in the Issues table share the same date | Go to Airtable → Issues table → find and delete the duplicate row for that date → re-run |
| `Batch N failed. X records already created.` | An Airtable write batch failed mid-way through creating IssueItems | Check Airtable — X records were written before the failure. Delete those records, fix the underlying issue (check Airtable status), then re-run |
| `Airtable rate limit hit on /... — out of retries` | Script made too many API calls too fast; Airtable blocked it after 3 retries | Wait 30 seconds and re-run. If it keeps happening, check if another script is running at the same time |

---

### generateBlurbs.js

| Error | Cause | Fix |
|-------|-------|-----|
| *(more to come)* | | |

---

### pushToBeehiiv.js

| Error | Cause | Fix |
|-------|-------|-----|
| `Execution stopped: missing blurbs on one or more IssueItems` | One or more IssueItems are missing DisplayTitle, Description, or CTA | Run `node scripts/generateBlurbs.js YYYY-MM-DD` first, then re-run pushToBeehiiv.js |
| `Multiple Issues records found for date: YYYY-MM-DD` | Two rows in the Issues table share the same date | Go to Airtable → Issues table → find and delete the duplicate row for that date → re-run |
| `No issue found for date: YYYY-MM-DD` | No Issues record exists for the date you passed in | Check the date argument is correct and that the Issues table has a row for that date |
| `Airtable rate limit hit on /... — out of retries` | Script made too many API calls too fast; Airtable blocked it after 3 retries | Wait 30 seconds and re-run. If it keeps happening, check if another script is running at the same time |
