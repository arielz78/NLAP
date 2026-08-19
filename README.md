# NLAP

NLAP is the production workflow for Vaughan Brief, a weekly local-events newsletter serving
approximately 13,000 subscribers. It collects event listings from multiple sources, normalizes and
deduplicates them, assembles a constrained editorial slate, generates newsletter copy, and exports
HTML for final review in Beehiiv.

The workflow has run weekly for several months. Selection remains editor-controlled: automated
components prepare and propose each issue, and the editor approves what is published.

**Stack:** Node.js, Python, n8n, Airtable, OpenAI, Beehiiv

## Architecture

```text
Event sources
    -> n8n ingestion, normalization, and deduplication
    -> Airtable Candidates
    -> Node.js allocation
    -> OpenAI-assisted copy generation
    -> Beehiiv-ready HTML
    -> editor review and publication
```

Responsibilities are split by system:

| System | Owns |
|---|---|
| n8n | Source ingestion, normalization to a common schema, deduplication |
| Airtable | Operational state, candidate records, and editorial decisions |
| Node.js | Allocation, copy generation, and publishing preparation |
| Python | Offline model development and evaluation |
| Beehiiv | Publication surface |

Allocation logic is isolated from Airtable access.
[`scripts/buildIssues.js`](scripts/buildIssues.js) receives plain records and returns proposed
assignments; [`scripts/connectAirtable.js`](scripts/connectAirtable.js) owns reads, writes, and the
preservation of locked editor selections. The allocator can therefore be exercised without live
state.

## Selection Behavior

Eligible candidates are ordered by `Score_Final`, then assigned greedily while the following
constraints are enforced:

- **Issue window** — an event is eligible for an issue only if it starts between `IssueDate+1` and
  `IssueDate+10` inclusive.
- **Section capacity** — each section has a maximum number of slots per issue. Sections may finish
  under capacity when the candidate pool cannot satisfy the remaining constraints.
- **Venue diversity** — at most one event per venue per section per issue, so a single active venue
  cannot fill a section. Candidates with no venue recorded are always permitted.
- **Cross-issue uniqueness** — within one planning run, a candidate can be assigned to at most one
  upcoming issue.
- **Editor locks** — an assignment the editor has locked is preserved across reruns, and its slot is
  excluded from reallocation.

Ordering supplies preference; the allocator applies the constraints to each new assignment while
preserving locked editorial overrides. It is a greedy assignment pass, not an optimizer, and makes
no claim of global optimality.

## Production Safety

- Reruns rebuild unlocked assignments while preserving editor-locked IssueItems.
- Copy generation and HTML export support `--dry-run`.
- Offline model scoring and evaluation do not write to production Candidates or IssueItems.
- Post-run checks inspect candidate depth, ingestion rejections, cross-source overlap, stale intake,
  and unexpected changes to editor-controlled state.
- Reruns are not transactional. If an Airtable write fails partway, the runbook documents how to
  identify and remove partially created records before retrying.

## Component Status

| Component | Status | Notes |
|---|---|---|
| Ingestion and deduplication | Live | Runs in n8n |
| Allocation | Live | Editor locks preserved on rerun |
| Copy generation and HTML export | Live | Publication remains manual |
| Relevance gate | Offline validation | No production writes |
| Section suggestion | Offline validation | Original classifier retired |
| Candidate ranking | Deferred | Depends on validation results |

Historical non-publication cannot be treated as a clean rejection label: it combines events that
were unsuitable with events that were viable but outcompeted that week under section capacity.
Training on that target would reproduce weekly scarcity rather than editorial relevance. The
replacement gate is therefore evaluated against separately collected editor judgments and a
disjoint audit of live candidates, covering both accepted and rejected events, before it can affect
production.

## Running the Pipeline

Credentials are loaded from `NLAP_Airtable.env`, which is not committed.

```bash
npm install

# Allocate candidates to upcoming issues
node scripts/connectAirtable.js

# Generate newsletter copy for an issue (issue date, YYYY-MM-DD)
node scripts/generateBlurbs.js YYYY-MM-DD

# Export Beehiiv HTML for an issue
node scripts/pushToBeehiiv.js YYYY-MM-DD
```

`generateBlurbs.js` and `pushToBeehiiv.js` accept `--dry-run`. Ingestion runs in n8n from the
workflow definitions under `workflows/`.

## Tests

```bash
npm test
```

This runs the allocator self-test in [`scripts/buildIssues.js`](scripts/buildIssues.js), which
covers the selection constraints above: section capacity, issue windows, venue diversity,
cross-issue uniqueness, and lock and slot preservation. It exercises the allocation layer only —
Airtable I/O, ingestion, and partial-write recovery are not covered.

Post-run health checks inspect live Airtable data without modifying it and write local tracking
snapshots:

```bash
node scripts/postRunChecks.js
```

## Documentation

- **Operations:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — script order, data model, failure handling
- **Allocation:** [`scripts/buildIssues.js`](scripts/buildIssues.js) — selection logic and self-test
- **Model development:** [`models/README.md`](models/README.md) — offline evaluation work
- **Current release:** [`docs/r7/R7_Scope.md`](docs/r7/R7_Scope.md) — active scope and status
- **Architecture decisions:** [`docs/Decision_Log.md`](docs/Decision_Log.md)
- **Source integrations:** [`docs/source_decision_sheet.md`](docs/source_decision_sheet.md)

## Repository Layout

| Path | Contents |
|---|---|
| `scripts/` | Node.js pipeline, integration tools, and health checks |
| `workflows/` | n8n workflow definitions |
| `models/` | Python model development and evaluation code |
| `docs/` | Runbook, decisions, roadmap, and release-working documents |
| `logs/` | Frozen release history |
| `data/` | Local data and tracking artifacts; some contents are gitignored |
| `output/` | Generated Beehiiv HTML; gitignored |
| `test_runs/` | Prompt-test output captures; gitignored |

Model folders are named for the problem they solve: `models/sectioning/` holds classification and
relevance-gate work, and `models/ranking/` holds the deferred ranking work.
