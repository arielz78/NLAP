# NLAP

NLAP is the production workflow for Vaughan Brief, a weekly local-events newsletter serving
approximately 13,000 subscribers. It collects event listings from multiple sources, normalizes and
deduplicates them, assembles a constrained editorial slate, generates newsletter copy, and exports
HTML for final review in Beehiiv.

The workflow is designed, built, and operated by one person. An early version of the ingestion and
allocation stages has run weekly since December 2025; the components around them have been added
and substantially rebuilt since, and reached production at different times. See
[Component Status](#component-status). Ingestion, allocation, copy generation and export are live;
the models order candidates and ranking work is still in progress. Selection remains
editor-controlled: automated components prepare and propose each issue, and the editor approves what
is published.

**Stack:** Node.js, Python, n8n, Airtable, OpenAI, Beehiiv

## At a Glance

NLAP runs against a real weekly publication, so it can be measured at three levels: the scale it
operates at, what the engineering work changed, and how well the models actually do. The sections
below explain how each of these was built and evaluated.

| | |
|---|---|
| **Production** | |
| Third-party sources ingested | 13 |
| Subscribers | ~13,000 |
| Candidates per week | 300–400 |
| Manual review load before shortlisting | ~100 events/issue |
| **Engineering** | |
| Ingestion runtime | ~14 min → 35 s |
| Airtable write calls per run | ~1,320 → 55 |
| **Model evaluation** | |
| Editor labels collected | 456 |
| Gate AUC, grouped 5-fold cross-validation | 0.856 (n=165) |
| Gate AUC on a fresh live sample, held out entirely | 0.824 (n=80) |
| Editor agreement with his own earlier ruling | 82.5% |

The runtime and write-call reductions come from batched upserts, in-run deduplication, and removing
redundant writes.

The evaluation counts are smaller than the label count because not every ruling is usable for every
question: of 456 rulings, 365 are used to fit the model and 165 form the slice where the
include-or-reject question is cleanly defined. The live test is a separate 80 rulings the model
never saw.

The last row limits the other two. Shown the same events a second time, the editor answered
differently about a fifth of the time, so the model is being scored against a target that moves on
its own and the gap between 0.824 and 1.0 is not all model error. How that was measured is in
[The Models](#the-models).

## The Problem

Vaughan Brief publishes every Thursday, whether or not the work got done. Assembling one issue took
four to five hours by hand: searching venue sites, library calendars, municipal listings and
Facebook, resolving the same event listed under different names on different sites, judging what was
worth running, and writing copy for each pick.

There is no authoritative database of what is happening in Vaughan. Events are scattered across
dozens of independently maintained sources (some structured calendars, some individual pages, some
announced only on social media) under inconsistent names, with dates that change and pages that
disappear. Discovery is not a search problem. It is an ingestion problem.

The first attempt was to hand the job to a language model. It handled the writing. It failed at the
rest, in six ways.

### Missed events, invisibly

- A model can only choose among events it has been shown. Asked to find the week's events, it
  returned a plausible subset while omitting real ones.
- Nothing in the output marks an omission, so a missed event looks identical to a quiet week.
  Removing a bad event takes seconds; catching a missing one requires already knowing it exists.

### Skew toward the well-indexed

- Results leaned toward venues with marketing behind them. Library branches, community centres and
  small organisers, the listings a local brief exists to carry, were least likely to surface.
- The failure is compositional rather than numerical. A full slate can still be the wrong slate.

### Invented details

- Start times, ticket prices, addresses, and occasionally the event itself. Recurring events are the
  common case: the model reproduces a prior instance, correctly formatted and entirely wrong.
- A missing event weakens an issue. A wrong start time sends a reader to a locked door.

### Non-reproducible output

- The same request produced a different slate on a second run, and a result that cannot be
  reproduced cannot be checked, corrected, or improved on.
- It removes the only useful recovery path. A failed run cannot be repeated and repaired, only
  replaced with a different issue.

### Rules not enforced

- Section quotas, a ten-day issue window, one venue per section, no repeats across issues, and
  excluded categories are constraints, not preferences. Stating them in a prompt does not make them
  binding.
- They are partially applied, dropped on long inputs, or reinterpreted between runs, and a violation
  does not make the output look wrong.

### No durable state

- Each issue rebuilt knowledge that should have persisted: which sources had been checked, which
  venue had already run, which listing duplicated another, which source was unreliable.
- History can be supplied in a prompt, but correctness then depends on supplying it completely and
  consistently every week.

None of these failures announce themselves in the output. Detecting them means redoing the work the
system was meant to eliminate: searching the sources again, verifying the facts again, checking the
history again. The editorial burden is not removed. It turns the editor into its auditor.

Each failure determined a piece of the design:

| Failure | What it forced |
|---|---|
| Missed events, invisibly | Every event found is stored, so the full pool can be inspected and counted |
| Coverage skewed to well-indexed venues | Every run visits every source on a fixed list |
| The same event under three names | Exact title-and-date matches collapse to one record; near-duplicates are flagged for review, not merged automatically |
| Invented or stale details | Every factual field comes from a fetched page; the model only turns those fields into copy |
| A different answer each run | The same candidates, scores, locks and issue dates produce the same allocation |
| Rules not reliably held | The rules are enforced in code, so an invalid issue cannot be built |
| No durable state between issues | Past issues and past candidates are stored and can be queried |

The language model retains the task it is reliable at: writing copy from fields already fetched,
once the slate is decided.

## Approach

The two halves of the job have different requirements, so they are built differently.

### Knowing what exists is an engineering problem

- Every source on a fixed list is ingested and normalized to one schema on every run. Runs are
  triggered manually today; moving to a schedule is open work.
- Listings with the same normalized title and date collapse to one record. Near-duplicates that do
  not match exactly are flagged for review rather than merged, because a wrong merge destroys a
  real event.
- The full candidate pool is stored, so it can be inspected, counted, and checked against what the
  sources actually published.
- Events rejected at ingestion are logged rather than dropped, though that logging is currently
  broken and being repaired.

### Choosing what runs is an editorial problem

- The constraints the editor works under are written into the code, so an issue that breaks one
  cannot be produced.
- Candidates are ordered by score and placed within those constraints, rather than by asking a
  general-purpose language model to pick.
- Decisions the editor locks are preserved across reruns.

Solving the first problem created a second one. The pool is now 300 to 400 events a week, which no
editor can read. Something has to reduce it, and the only real question is what.

### Separating relevance from section fit

Originally one model did this. It read each event and assigned a section, and when it was not
confident it flagged the event for a human to look at. That review queue grew to 226 events.

Reading through them showed the problem was not the model. Only about 14 were genuinely hard to
place between sections. The rest were business events, non-GTA listings and professional
development, none of which belong in the newsletter at all. There was no step that could reject an
event, so "this should not be here" had nowhere to go and came out as low confidence instead.

The fix was a separate question, not a better classifier. One model scores whether an event is worth
running at all, and a second scores which section it fits.

- **The viability gate** scores how likely the editor is to run an event. Most of the pool scores
  low: business events, non-GTA listings, professional development.
- **The section classifier** scores fit against each of the three sections.

Multiplying the two scores ranks each surviving event against a specific section, and the editor
receives a shortlist per section instead of the whole pool. Both models are described in
[The Models](#the-models).

The models only order candidates. The full pool stays intact and inspectable behind the shortlist.

## Architecture

```text
Event sources
    -> n8n ingestion, normalization, and deduplication      (run on demand)
    -> Airtable Candidates                                  (the full pool, stored)
    -> scoring: viability x section fit                     (run on demand)
    -> Node.js allocation under constraints
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
| Python | Model development, evaluation, and weekly scoring |
| Beehiiv | Publication surface |

The code that decides an issue never touches Airtable.
[`scripts/buildIssues.js`](scripts/buildIssues.js) takes plain records in and returns proposed
assignments out. [`scripts/connectAirtable.js`](scripts/connectAirtable.js) does all the reading and
writing, and is the only place that knows how to preserve a locked editor selection. The allocator
can therefore be tested on its own, without a live database.

## Selection Behavior

The allocator fills each issue one slot at a time, taking the highest-ranked remaining candidate
that satisfies all constraints. It does not search every possible combination for the globally best
slate.

The constraints:

- **Issue window:** an event is eligible for an issue only if it starts between `IssueDate+1` and
  `IssueDate+10` inclusive.
- **Section capacity:** each section has a maximum number of slots per issue. Sections may finish
  under capacity when the candidate pool cannot satisfy the remaining constraints.
- **Venue diversity:** at most one event per venue per section per issue, so a single active venue
  cannot fill a section. Candidates with no venue recorded are always permitted.
- **Cross-issue uniqueness:** a candidate can appear only once across issues planned in the same
  run. Previously published events are not yet excluded automatically.
- **Editor locks:** an assignment the editor has locked is preserved across reruns, and its slot is
  excluded from reallocation.

Ordering decides what is preferred. The constraints decide what is allowed.

## Production Safety

- Re-running rebuilds the unlocked picks and leaves anything the editor locked untouched.
- Copy generation and HTML export both support `--dry-run`.
- Model scoring proposes an ordering and never writes to live candidates or issues. Evaluation runs
  entirely offline.

### Post-run observability

After ingestion, one command runs six checks covering candidate snapshots, editor-state integrity,
duplicate risk, per-issue pool depth, stale Facebook intake, and records rejected before storage.

The duplicate audit goes beyond exact `title|date` identifiers. It compares normalized titles using
token-set Jaccard and containment across nearby dates, with venue-and-date matching as a
supplementary signal. Fuzzy matches are review-only: they never merge or delete records, because a
false positive would destroy a valid event.

The checks found and removed 20 duplicate records left by an earlier identifier migration. They also
showed that nearly half of one new source's listings were already covered elsewhere, allowing the
source to be evaluated on the unique events it actually added.

Known gaps remain: rejection-log freshness and per-source liveness are not yet enforced reliably.

Pipeline writes are not transactional. If an Airtable write fails partway through, the runbook
explains how to identify and remove the partially created records before retrying.

## The Models

The modeling layer separates two questions:

- **Viability:** could this event be suitable for Vaughan Brief?
- **Section fit:** does it belong in Families, Couples, or Golden Age?

The two scores can be combined to order candidates within each section. The models never publish or
delete events, and the editor retains final control.

### Labels and evaluation

Publication history is not a valid rejection label. An event that did not run may have been
unsuitable, or it may simply have lost a limited slot to a stronger event that week.

Instead, the editor gave 456 rulings on events drawn from the real candidate pool without seeing
model predictions. Forty events appeared twice accidentally; the editor made the same
include-or-reject decision 82.5% of the time, providing a useful measure of how much the target
itself varies.

Each event is represented by a semantic text embedding, and logistic regression predicts the
editor's ruling. Recurring versions of the same event are grouped during evaluation so near-identical
listings cannot leak between training and validation.

| Evaluation | Result |
|---|---:|
| Grouped cross-validation | 0.856 AUC on 165 events |
| Blinded fresh-week test | 0.824 AUC on 80 clean rulings |

In the fresh-week test, the share of events judged eligible rose from 47.1% in the lowest score
group to 100% in the top two groups. This supports using the model as a reversible ordering
signal, not as an automatic rejection threshold or publication decision.

Under the intended production rules, including flexible placement between Couples and Golden
Age, the section classifier agreed with the editor 77.9% of the time.

### Why embeddings replaced TF-IDF

The first section classifier used TF-IDF trained on past published issues. A transfer check on fresh
candidate descriptions found only 68.2% weighted vocabulary coverage for its weakest section,
showing that it relied too heavily on wording it had already seen.

It was retired before production and replaced with semantic embeddings. Later live testing showed
that sectioning was not the main bottleneck, which shifted the release toward viability scoring and
downstream ranking rather than further classifier tuning.

### Why clicks are not the target

Fifteen months of click history produced 924 graded picks across 71 issues. A power analysis showed
that this dataset could detect only large changes in engagement, so clicks serve as a regression
guardrail rather than the optimization target.

Editor overrides provide the better-powered signal. The planned console records submitted swaps:
when the system suggests one event and the editor replaces it with another under the same weekly
constraints, that produces the direct preference evidence a true ranker needs.

## Component Status

| Component | Status | Notes |
|---|---|---|
| Ingestion and deduplication | Live | Runs in n8n |
| Allocation | Live | Editor locks preserved on rerun |
| Copy generation and HTML export | Live | Publication remains manual |
| Relevance gate | Validated | Operator-run, read-only; produces a reversible ordering signal |
| Section suggestion | Validated directionally | Intended as a suggestion with editorial override |
| Candidate re-ranking | In progress | Production design not settled |

## Running It

This repository documents a client-specific production system. The allocator and the offline
evaluation tools can be exercised locally; end-to-end operation requires a configured Airtable base,
an n8n instance, and external-service credentials.

### Local verification

```bash
npm install
npm test
```

`npm test` runs the allocator self-test in [`scripts/buildIssues.js`](scripts/buildIssues.js),
covering section capacity, issue windows, venue diversity, cross-issue uniqueness, and lock and slot
preservation. It exercises the allocation layer only. Airtable I/O, ingestion, and partial-write
recovery are not covered.

This is the only part of the system that runs without credentials.

### Production operator workflow

⚠️ **`connectAirtable.js` changes live state.** It deletes and rebuilds unlocked IssueItems on
current and future issues. Locked rows are preserved, unlocked ones are not.

```bash
# Allocate candidates to upcoming issues — WRITES TO AIRTABLE
node scripts/connectAirtable.js

# Generate newsletter copy for an issue (issue date, YYYY-MM-DD)
node scripts/generateBlurbs.js YYYY-MM-DD

# Export Beehiiv HTML for an issue
node scripts/pushToBeehiiv.js YYYY-MM-DD
```

`generateBlurbs.js` and `pushToBeehiiv.js` accept `--dry-run`.

Read-only health checks, safe to run at any time:

```bash
node scripts/postRunChecks.js
```

Credentials come from `NLAP_Airtable.env`, which is not committed. The core variables are
`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, and `OPENAI_API_KEY`.

Ingestion runs in n8n. The definitions under `workflows/` are workflow definitions requiring
instance-specific configuration, not turnkey imports. See
[`docs/airtable_schema.txt`](docs/airtable_schema.txt) for the data model and
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) for operating order and failure handling.

## Documentation

- **Operations:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md), script order, data model, failure handling
- **Allocation:** [`scripts/buildIssues.js`](scripts/buildIssues.js), selection logic and self-test
- **Model development:** [`models/README.md`](models/README.md), offline evaluation work
- **Current release:** [`docs/r8/R8_Scope.md`](docs/r8/R8_Scope.md), active scope and status
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

Generated locally and not tracked:

| Path | Contents |
|---|---|
| `data/` | Snapshots and tracking artifacts |
| `output/` | Generated Beehiiv HTML |
| `test_runs/` | Prompt-test output captures |

Model folders are named for the problem they solve: `models/sectioning/` holds classification and
relevance-gate work, and `models/ranking/` holds the deferred ranking work.
