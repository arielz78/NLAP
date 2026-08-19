# NLAP

NLAP is the production workflow for Vaughan Brief, a weekly local-events newsletter with
approximately 13,000 subscribers. It ingests event data, normalizes and filters candidates,
allocates events under editorial constraints, generates newsletter copy, and exports HTML for
Beehiiv. The editor reviews the final selections before publication.

**Stack:** Node.js, Python, n8n, Airtable, OpenAI, Beehiiv

## How It Works

```text
Event sources
    -> n8n ingestion, normalization, and deduplication
    -> Airtable Candidates
    -> Node.js allocation
    -> OpenAI-assisted copy generation
    -> Beehiiv-ready HTML
    -> editor review and publication
```

The live workflow collects events from multiple sources, converts them into one consistent format,
and stores them in Airtable. A Node.js allocator selects eligible events under the newsletter's date,
quota, venue, and editor-lock rules. OpenAI generates constrained copy for the selected events, and
the final output is exported as HTML for the editor to review in Beehiiv.

The planned decision path, contingent on the current validation work, is:

```text
Ingestion
    -> hard-rule filtering
    -> relevance gate: should this event remain eligible?
    -> section classification: which audience section fits best?
    -> interim ranking: P(include) x P(section)
    -> constrained allocation
    -> editor review
```

The gate removes permanently unsuitable candidates, classification suggests a section, ranking
orders the viable candidates for the week, and the allocator applies final issue constraints. The
editor remains responsible for the published selection.

## Current Status

- Event ingestion, allocation, copy generation, and HTML export are live.
- The original automated section classifier has been retired, although some of its Airtable fields
  remain in use temporarily.
- A replacement relevance filter and section-suggestion model are being validated offline. They do
  not write to the live workflow.
- Candidate ranking work is deferred until that validation is complete.

Detailed current status lives in the
[`active release scope`](docs/r7/R7_Scope.md#status-snapshot-2026-08-01).

## Where to Look

| Time | Start here |
|---|---|
| 2 minutes | The diagram above and Current Status |
| 5 minutes | [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for the operational architecture |
| 10 minutes | [`scripts/buildIssues.js`](scripts/buildIssues.js) for the pure decision layer |

## Repository Terminology

| Term | Meaning |
|---|---|
| Candidate | One normalized event available for review or allocation |
| Issue | One weekly newsletter edition |
| IssueItem | One event assigned to a specific section and slot in an Issue |
| Section | One of the newsletter's audience or content categories |
| Lock | An editor-controlled flag that prevents an assigned item from being changed on rerun |

## Pipeline Components

| Stage | Tool | Function |
|---|---|---|
| Ingestion | n8n | Ingests event sources, normalizes records, deduplicates them, and writes Candidates to Airtable. |
| Allocation | Node.js | Allocates eligible Candidates to issues under date-window, quota, venue-diversity, and lock rules. |
| Copy generation | Node.js + OpenAI | Generates constrained newsletter copy and exports five Beehiiv HTML sections. |
| Model validation | Python + Airtable | Evaluates a relevance gate and section model against frozen data and blind editor rulings. Not live. |

The allocation rules are implemented as a pure function in
[`scripts/buildIssues.js`](scripts/buildIssues.js). Airtable reads and writes remain in
[`scripts/connectAirtable.js`](scripts/connectAirtable.js), so the decision logic can be tested
without live state.

## Operational Behavior

- Reruns preserve editor-locked IssueItems.
- Allocation enforces issue windows, section quotas, and one venue per section.
- Copy generation supports dry runs and validates required output before publication.
- Post-run checks report candidate depth, cross-source overlap, rejections, stale intake, and
  unexpected changes to editor-controlled state.
- Model experiments remain read-only until their release checks are complete.

## Current Measurements

- Ingestion runtime: approximately 14 minutes reduced to 35 seconds.
- Typical Sunday-to-issue window after source expansion: approximately 310 eligible listings.
- Frozen 2026-08-13 window: 321 listings representing 225 distinct event series.
- Client-reported baseline: approximately 4 hours and 100 events reviewed per issue. Post-handoff
  time savings have not yet been measured.

Definitions, provenance, and caveats are maintained in
[`NA/Vaughan_Metrics_Log.md`](NA/Vaughan_Metrics_Log.md).

## Running the Pipeline

Credentials are loaded from `NLAP_Airtable.env`, which is not committed.

```bash
# Allocate candidates to an issue
node scripts/connectAirtable.js

# Generate newsletter copy for an issue
node scripts/generateBlurbs.js 2026-05-29

# Export Beehiiv HTML for an issue
node scripts/pushToBeehiiv.js 2026-05-29
```

`generateBlurbs.js` and `pushToBeehiiv.js` also accept `--dry-run`. Ingestion runs in n8n from the workflow
definition under `workflows/`.

See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for script order, the Airtable data model, field definitions,
and failure handling.

## Key Files

| File | Purpose |
|---|---|
| [`scripts/buildIssues.js`](scripts/buildIssues.js) | Pure allocation logic and allocator checks |
| [`scripts/connectAirtable.js`](scripts/connectAirtable.js) | Airtable reads, allocation execution, and IssueItem writes |
| [`scripts/generateBlurbs.js`](scripts/generateBlurbs.js) | Newsletter copy generation and output validation |
| [`scripts/pushToBeehiiv.js`](scripts/pushToBeehiiv.js) | Beehiiv HTML export |
| [`scripts/postRunChecks.js`](scripts/postRunChecks.js) | Post-ingestion health-check runner |
| [`models/sectioning/gate_step4a.py`](models/sectioning/gate_step4a.py) | Relevance-gate evaluation |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Operational reference |
| [`docs/r7/R7_Scope.md`](docs/r7/R7_Scope.md) | Active release status and validation contract |
| [`docs/Decision_Log.md`](docs/Decision_Log.md) | Architectural and editorial decisions |

## Project Documentation

| Information | Source |
|---|---|
| Current release status | Active release Scope document |
| Architectural decisions | [`docs/Decision_Log.md`](docs/Decision_Log.md) |
| Original release plan | [`docs/NLAP_PostMVP_Roadmap_v3.md`](docs/NLAP_PostMVP_Roadmap_v3.md) |
| Document ownership and update rules | [`docs/README.md`](docs/README.md) |
| Historical release logs | [`logs/`](logs/) |
| Metrics | [`NA/Vaughan_Metrics_Log.md`](NA/Vaughan_Metrics_Log.md) |

The roadmap records original intent. Once a release starts, its Scope document is authoritative for
status.

## Repository Layout

| Path | Contents |
|---|---|
| `scripts/` | Node.js pipeline, integration tools, and health checks |
| `workflows/` | n8n workflow definitions |
| `models/` | Python model building and evaluation code |
| `docs/` | Runbook, decisions, roadmap, and release-working documents |
| `logs/` | Frozen release history |
| `data/` | Local data and tracking artifacts; some contents are gitignored |
| `output/` | Generated Beehiiv HTML; gitignored |
| `test_runs/` | Prompt-test output captures; gitignored |

Model folders are named for the problem they solve: `models/sectioning/` contains classification
and relevance-gate work, while `models/ranking/` contains the deferred ranking work.
