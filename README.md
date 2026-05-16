# NLAP Project Guide
*Last updated: 2026-05-15*

A single reference for how this project is organized and how to operate within it.

---

## What This Is

An automation pipeline that turns raw event data into a ready-to-publish weekly newsletter for a Vaughan-area client. The pipeline ingests events, classifies them, allocates them to newsletter sections, generates blurbs, and exports HTML for paste into Beehiiv.

**Client:** Vaughan Brief (weekly, publishes Thursdays)
**Stack:** Node.js, Airtable, n8n, OpenAI, Beehiiv
**Team:** Ariel (lead), Nathan (collaborator)

---

## Pipeline Stages

| Stage | Tool | What it does |
|-------|------|--------------|
| R1 | n8n | Ingests events from RSS + Eventbrite. Deduplicates. Writes to Candidates table. |
| R2 | n8n | Classifies each candidate into a segment using GPT-4o. Flags low-confidence records. |
| R3 | Node.js | Allocates approved candidates to newsletter issues. Enforces quotas, date windows, venue diversity. |
| R4 | Node.js | Generates blurbs per IssueItem. Exports 5 HTML snippets for Beehiiv. |
| R5–R8 | Node.js | Post-MVP: source expansion, scoring, classification quality, handoff. |

R1–R4 are complete and stable. R5–R8 are the active roadmap.

---

## Key Files

| File | What it is |
|------|------------|
| `docs/NLAP_PostMVP_Roadmap.txt` | Week-by-week plan for R5–R8. Start here to understand what we're building. |
| `docs/Decision_Log.md` | Every significant architectural and editorial decision, with reasoning. Read this before changing anything structural. |
| `scripts/connectAirtable.js` | Fetches Issues/Candidates, runs allocator, writes IssueItems (R3) |
| `scripts/buildIssues.js` | Allocation logic — pure function, no Airtable dependency |
| `scripts/generateBlurbs.js` | Generates DisplayTitle, Description, CTA per IssueItem via GPT (R4) |
| `scripts/pushToBeehiiv.js` | Exports 5 HTML snippets for paste into Beehiiv (R4) |
| `workflows/` | n8n workflow JSON files for R1 and R2 |
| `.github/ISSUE_TEMPLATE/debt.md` | Template for new GitHub issues |

---

## How Work Is Tracked

| What | Where |
|------|-------|
| Open debt items | GitHub Issues — [arielz78/NLAP](https://github.com/arielz78/NLAP/issues) |
| Release planning | `docs/NLAP_PostMVP_Roadmap.txt` |
| Architectural decisions | `docs/Decision_Log.md` |
| Past release history | `logs/` (R1_R2_Log.md, R3_Log.md, R4_Log.md) |
| Client meeting notes | `meetings/` |

---

## GitHub Issues Setup

Labels map to releases: `r5` `r6` `r7` `r8` `prerequisite` `spike`

Two additional labels distinguish work type:
- `roadmap` — planned release work (what we're building next)
- `debt` — unplanned open items (deferred fixes, improvements)

Milestones: Prerequisite, R5, R6, R7, R8

**R5 issues** are assigned to Nathan. **R6+ issues** are assigned to Ariel.

**After every work session:**
- Close any Issues you finished
- Leave a comment with what you did and any decisions made
- If you hit a blocker, comment on the Issue and drop a note in `#pipeline`
- If the decision was architectural, also add it to `docs/Decision_Log.md`

---

## Log + Handoff Format

**`#run-logs` (after every pipeline run):**
```
Date: YYYY-MM-DD
Scripts run: [e.g. connectAirtable.js → generateBlurbs.js]
Result: [e.g. 25 IssueItems written, 3 NeedsReview flagged]
Errors: [none / describe if any]
```

**`#handoffs` (end of every work session):**
```
What ran / was built: [1 line]
What's open: [1–2 lines]
What the other person needs to do next: [1 line]
```

**`docs/Decision_Log.md` (architectural decisions only):**
New section per decision. Include: what was decided, why, and what was ruled out. Not for routine fixes or config changes.

---

## Discord Channels

| Channel | Purpose |
|---------|---------|
| `#general` | Async check-ins, random |
| `#pipeline` | All NLAP technical discussion, PR links, debt decisions |
| `#run-logs` | Paste script output after every run |
| `#client` | Meeting notes, client requests, client-facing context |
| `#decisions` | Log decisions as they're made — keep it brief and searchable |
| `#handoffs` | End-of-session 3-line drop: what ran, what's open, what needs the other person |
| `#website` | Parked until the NA site kicks off |

---

## Running the Pipeline

Credentials live in `NLAP_Airtable.env` one level above the scripts folder. Scripts load it via dotenv.

```bash
# R3 — allocate candidates to an issue
node scripts/connectAirtable.js

# R4 — generate blurbs
node scripts/generateBlurbs.js

# R4 — export HTML for Beehiiv
node scripts/pushToBeehiiv.js
```

R1 and R2 run inside n8n — import the workflow JSON files from `workflows/`.

