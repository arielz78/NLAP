# NLAP Project Guide
*Last updated: 2026-07-09*

A single reference for how this project is organized and how to operate within it.

---

## What This Is

An automation pipeline that turns raw event data into a ready-to-publish weekly newsletter for a Vaughan-area client. The pipeline ingests events, classifies them, allocates them to newsletter sections, generates blurbs, and exports HTML for paste into Beehiiv.

**Client:** Vaughan Brief (weekly, publishes Thursdays)
**Stack:** Node.js, Airtable, n8n, OpenAI, Beehiiv
**Owner:** Ariel (solo)

---

## Repository Layout

Top-level folders (the durable map — update this table when a top-level folder is added or removed):

| Folder | What's in it |
|---|---|
| `scripts/` | Main Node.js codebase — pipeline (R1–R4) + health-checks |
| `workflows/` | n8n workflow JSON (R1, R2) |
| `r6_eval/` | R6 scorer-eval Python package (pair collector, scorers, grader) + own venv |
| `eval/` | R6/R7 evaluation *data + analysis tools* (click-join, ambiguous-case sampler) |
| `docs/` | Documentation. Subfolders: `r5\|r6\|r7/` (per-release scope), `archive/`, `client_prompts/` |
| `data/` | Data artifacts — Beehiiv issue history, tracking output |
| `output/` | Exported Beehiiv HTML snippets per issue |
| `test_runs/` | Prompt A/B test output captures |
| `logs/` | Frozen per-release build history + Website_Log |
| `meetings/` | Dated client meeting notes (gitignored / private) |
| `NA/` | Business / portfolio docs — not pipeline code |
| `summer/` | Summer 2026 personal layer — plan + learning positions (gitignored / private) |
| `bwna-web/` | Website build — separate sub-project |

**Trap to know:** `r6_eval/` = R6 *tooling* (a Python package); `eval/` = *datasets + one-off analysis*. They are not the same thing.

> **Moving a top-level folder breaks code.** Scripts anchor to relative paths (`__dirname/../data`, `../NLAP_Airtable.env`, sibling `require("./x.js")`). If you relocate or rename a folder, fix the path literals in `scripts/` in the same change — don't just edit this table.

---

## Pipeline Stages

| Stage | Tool | What it does |
|-------|------|--------------|
| R1 | n8n | Ingests events from RSS + Eventbrite. Deduplicates. Writes to Candidates table. |
| R2 | n8n | *(dead)* Was meant to classify each candidate into a section via GPT. Unreliable / effectively unused — the reason **R7** (a trained section classifier) exists. |
| R3 | Node.js | Allocates approved candidates to newsletter issues. Enforces quotas, date windows, venue diversity. |
| R4 | Node.js | Generates blurbs per IssueItem. Exports 5 HTML snippets for Beehiiv. |
| R5+ | Node.js & n8n | Post-MVP: source expansion (R5, done), scoring (R6), section classifier (R7, active), handoff (R8). |

R1, R3, R4 are complete and stable. R2 is dead (see R7). R5 is closed. R6–R8 are the active roadmap.

---

## Key Files

| File | What it is |
|------|------------|
| `docs/NLAP_PostMVP_Roadmap_v3.md` | Original week-by-week plan for R5–R8. **Frozen intent, not status** — read for the plan, not where things stand. |
| `docs/README.md` | The fact map — the maintained index of *which doc is the home for each fact*. Read before deciding where something goes. |
| `docs/Decision_Log.md` | Every significant architectural / editorial decision, with reasoning. Read before changing anything structural. |
| Active release Scope doc (`docs/r{N}/R{N}_Scope.md`) | Current release status ("where are we"). Authoritative for status, not the roadmap. |
| `Execution_Log.md` | Chronological session journal — what ran, what broke, next step. |
| `scripts/connectAirtable.js` | Fetches Issues/Candidates, runs allocator, writes IssueItems (R3) |
| `scripts/buildIssues.js` | Allocation logic — pure function, no Airtable dependency |
| `scripts/generateBlurbs.js` | Generates DisplayTitle, Description, CTA per IssueItem via GPT (R4) |
| `scripts/pushToBeehiiv.js` | Exports 5 HTML snippets for paste into Beehiiv (R4) |

*Full script index (many scripts overlap — check before writing a new one) lives in `CLAUDE.md`.*

---

## How Work Is Tracked

| What | Where |
|------|-------|
| Session journal + next step | `Execution_Log.md` |
| Current release status | active release Scope doc's Status Snapshot (`docs/r{N}/R{N}_Scope.md`) |
| Architectural decisions | `docs/Decision_Log.md` |
| Open debt / experiments | GitHub Issues — [arielz78/NLAP](https://github.com/arielz78/NLAP/issues) |
| Release planning (frozen intent) | `docs/NLAP_PostMVP_Roadmap_v3.md` |
| Past release history | `logs/` |
| Client meeting notes | `meetings/` |
| Which doc is the home for what | `docs/README.md` (the fact map) |

---

## GitHub Issues Setup

Labels map to releases: `r5` `r6` `r7` `r8` `prerequisite` `spike`

Two additional labels distinguish work type:
- `roadmap` — planned release work (what we're building next)
- `debt` — unplanned open items (deferred fixes, improvements)

Milestones: Prerequisite, R5, R6, R7, R8. Every issue gets a release milestone at creation — the milestone (not just the `r{N}` label) is the accounting unit for the release sign-off gate.

---

## End of Session

Run **`/wrap`**. It appends `Execution_Log.md` + `CHANGELOG.md` automatically, then walks the conditional-homes checklist *for you* — proposing which maintained docs changed (Decision_Log, source sheet, metrics log, GitHub issues) for a yes/no confirm. You react; it does the scanning.

Architectural decisions still land in `docs/Decision_Log.md` (the "why," once — the journal points to it).

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
