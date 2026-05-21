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
