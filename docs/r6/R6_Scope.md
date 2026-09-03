# R6 Scope — Editorial Ranking

**Owner:** Ariel
**Status:** DRAFT v2 (2026-09-03) — direction set; implementation deferred behind the delivery-critical R8 path
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md` Release 6 is frozen intent. This document supersedes it for current R6 direction.
**Read order:** this doc → `docs/Decision_Log.md` §87 → `docs/r7/R7_Scope.md` → `docs/r8/R8_Scope.md`

R6 work resumes in `logs/R6_Log.md`. Remaining R7 closeout stays in `Execution_Log.md`.

This scope follows `docs/README.md`'s progressive-specification rule: it records the stable direction,
current evidence and next gate. Schemas, thresholds, feature lists and implementation choices are added
only when evidence resolves them and the next build step requires them.

---

## 0. Status snapshot (2026-09-03)

R6 has resumed at architecture-definition stage while R8 carries the immediate editor-delivery work.
No production R6 scorer, enrichment harness or ranking writer exists.

The original July draft is superseded by later repo and editor evidence:

- `Score_Final` is an Airtable formula equal to `Score_Manual`, so the API cannot write it. Populated
  `Score_Manual` values are zero; null/zero scores leave `buildIssues.js` ordering candidates by its
  earliest-start-date tie-break. R6 must bypass this field or explicitly migrate its Airtable type.
- R7's live read supports a reversible viability ordering and soft section affinity, not hard exclusion
  or exact editorial ranking: ROC AUC 0.8242; 62.3% exact section agreement; 77.9% with Couples/Golden
  flexibility. Metric provenance remains in `NA/Vaughan_Metrics_Log.md`.
- Historical published issues and clicks cover selected events, not the rejected weekly pool. They can
  grade or inform already-published ordering but cannot supply unbiased selection labels.
- `models/ranking/` remains offline scaffolding. `fetchAllEventsDescriptions.js` proves that event-detail
  recovery can add source data, but it is not wired into R1.
- R8 is the first reliable path for capturing the displayed choice set and deliberate editor replacements
  that a future learned ranker needs.

**Current gate:** secure R8's W1/W6/W7/W9 delivery path. R6 implementation starts afterward with one
bounded, read-only enrichment-pool experiment.

---

## 1. Outcome and boundary

R6 answers:

> Given this week's viable candidates, which events deserve the editor's attention in each section?

The system boundary is:

```text
R1 upsert/candidate records
    ↓
R7 reversible viability + section affinities
    ↓
R6 relative editorial ordering per section
    ↓
allocator / W9 assembly operations
    ↓
R8 review + deliberate decision capture
```

Responsibilities remain distinct:

| Component | Owns |
|---|---|
| R1 upsert | Exact-key identity and richest-record survivorship under Decision Log §51 / #70 |
| R7 | Broad viability ordering and section affinities, including Couples/Golden flexibility |
| R6 | Relative weekly editorial ordering and supporting evidence |
| Allocator / W9 | Five-event section construction, issue rules, alternatives and replacement assessment |
| R8 | Editor interaction, submission and decision provenance |

R6's directional output is a versioned, section-aware **`RankedPool`**. The name and boundary are settled;
its exact schema is deliberately deferred until the first consumer contract is built. It is not a single
global scalar and it is not the current `Score_Final` formula.

Clicks remain secondary evidence and a monitoring guardrail, not the primary selection target. Historical
clicks are selection-biased and confounded by copy and position; they do not reveal how unpublished events
would have performed.

---

## 2. Enrichment-pool direction

R7 runs cheaply over the complete in-window pool. R6 may spend more work on a smaller high-recall
enrichment pool.

That pool must not be a strict top-N route that loses known section ambiguity. Its eventual construction
must include:

- strong candidates for each of the three event sections;
- Couples/Golden boundary or flex candidates; and
- other high-viability candidates whose section assignment is uncertain.

`M` is the number of candidates R6 investigates deeply. It is not yet chosen. The first experiment compares
candidate depths and chooses the smallest depth that preserves editor-selected-event coverage, boundary
coverage and enough feasible choice after issue rules, while measuring URL count, useful enrichment,
runtime and cost. If the first batch is insufficient, the implementation may expand into the next batch.

`K`, the number of alternatives R8 initially displays, is a separate product choice learned from editor use.

`TODO(ariel):` choose production `M` only after the experiment exposes the coverage/cost curve. No value in
this draft is a production commitment.

---

## 3. Detail recovery and LLM role

The first R6 experiment tests whether supplied event-detail URLs recover information that source listing
endpoints omitted. The directional escalation is ordinary fetch/source adapter first, browser execution
when the page requires it, and wider web search only as a verified fallback. Successful HTTP retrieval is
not sufficient; the experiment must distinguish correct, useful event enrichment from boilerplate,
outdated content and wrong-event matches.

If deterministic detail recovery proves valuable for a known source, its production home is upstream so
R7 and R6 consume the same complete record. The R6 experiment is allowed to test it read-only before that
production rehoming is justified.

The LLM's initial role is bounded: interpret retrieved evidence into inspectable editorial features and
confidence, with provenance. Routine fetching is orchestrated by code. The LLM does not silently enforce
issue constraints, invent post-hoc explanations or decide that a source claim exists without evidence.

The exact feature schema, tool interface, rubric and model choice remain open until this experiment shows
which recovered information changes the editor-facing ordering.

---

## 4. Allocator / W9 handoff

R6 ranks; it does not independently construct the final slate.

The allocator and W9 are one logical assembly boundary. They consume the ordered pool and return the
collective five-event set per section, section-level alternatives, and the result of assessing a proposed
alternative against a selected event: `clean`, `override` or `unavailable`, with a reason.

This is a target boundary, not a claim that a new assembly component already exists. Today,
`buildIssues.js` remains the sole production planner and returns selected picks only.

Migration invariant:

1. Before cutover, `buildIssues.js` remains the only planner allowed to control production `IssueItems`.
2. Any replacement assembly implementation runs read-only against identical inputs and records slate diffs.
3. At cutover, `connectAirtable.js` invokes exactly one planner.
4. The legacy planner is retired or becomes a thin wrapper around the shared implementation.

Two planners must never write competing, plausible slates from the same pool.

---

## 5. Evidence gates and next action

The R6 build unfolds only as evidence makes the next layer necessary:

1. **After R8's delivery-critical path is secure:** freeze the minimum `RankedPool` → assembly handoff needed
   by the first read-only run.
2. **Run one enrichment-pool experiment:** compare candidate depth, Couples/Golden boundary coverage,
   information recovered, ordering changes, runtime and cost.
3. **Choose only the next required implementation:** rubric-based ordering, an LLM comparison, or neither,
   based on the observed value of enrichment.
4. **Shadow through R8:** capture which surfaced events the editor selects, replaces or asks to find elsewhere.
5. **Consider learned relative preference later:** only qualifying R8 submissions may supply labels; undone,
   broken-listing, stale or unclassified interactions do not.

No numeric production target, permanent scorer, or learned-model activation rule is authorized by this
draft.

---

## 6. Explicitly out of the current gate

- Editing production R1/R2 or Airtable during the read-only experiment.
- Treating `Score_Final` as a writable model output.
- Hard-deleting candidates from an uncalibrated live score.
- Training an end-to-end slate model.
- Treating published clicks as counterfactual selection labels.
- Duplicating exact-key or richest-record logic inside R6/R7.
- Specifying R8 presentation mechanics.
- Freezing schemas, feature inventories, weights or thresholds before their consumer/evidence exists.

---

## 7. Standing release gates

- **Milestone completeness:** every R6-milestone issue is closed or deferred with disposition; no
  unmilestoned orphan remains.
- **Reusability/config:** no new Vaughan-specific ranking, enrichment or policy logic lives outside the
  appropriate configuration boundary.
- **Shared-node prerequisite:** satisfy #82 before R6 changes shared pipeline nodes.
