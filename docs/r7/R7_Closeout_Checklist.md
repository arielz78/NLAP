# R7-W6 Closeout Checklist

**Audited:** 2026-08-27

**Purpose:** One bounded inventory for closing R7-W6 without repeatedly reopening the roadmap, issue milestone, or historical worksheets.

**Status authority:** `R7_Scope.md` remains the source of truth for release status. This file is the closeout worklist.

## Boundary

R7-W6 proves and closes the model work. R6 owns weekly ranking. Ariel's current direction is to move the former R7-W7 production deployment and model-lifecycle tranche into R8, where the R7 signals, R6 ranking, allocator, and editor console are integrated. That move still needs to be recorded in the Decision Log before R7 closes.

The upcoming ranked-week prototype is R6 work. It is not an R7 close requirement.

## Closeout order

### 1. Settle the three remaining W6 decisions

- [ ] **Fork C:** record the V1 ship boundary. Current supported resolution: R7 supplies reversible viability and section signals; R6 owns weekly relative ranking; the allocator applies final-list constraints; the editor retains final selection.
- [ ] **Step 4c:** either adjudicate only the error rows made consequential by the live evidence, or explicitly defer the remaining worksheet. The numerical run is complete; all 35 worksheet rows remain unadjudicated.
- [ ] **#108:** either run the frozen 300-character AllEvents backfill arm or explicitly defer it as an enrichment experiment that does not change V1.

### 2. Record the former W7 tranche as moved to R8

- [ ] Add the cross-release decision to `Decision_Log.md`.
- [ ] Remove W7 from the definition of R7 completion rather than leaving it ambiguously deferred.
- [ ] Ensure the future R8 scope inherits:
  - classifier/gate deployment into R2;
  - the production bypass/fallback contract;
  - `LLM_Rationale` behavior;
  - a 20-record production-path test;
  - replay of a frozen evaluation set through production;
  - frozen model/evaluation versions and rollback metadata;
  - retraining cadence or trigger;
  - post-deployment NeedsReview measurement;
  - proof that model behavior survives the production path.

These were roadmap promises, but they are integration/lifecycle work rather than unfinished model-validity work. Until the move is recorded canonically, they remain unresolved—not silently complete.

### 3. Disposition every open R7 milestone issue

The milestone had 15 open issues at the 2026-08-27 audit. Each must be closed or moved with an explicit disposition.

- [ ] **#123 — audience narrowness blind spot:** accept, defer, or investigate the measured 0/14 rejection result.
- [ ] **#108 — AllEvents descriptions:** resolve with the W6 decision above.
- [ ] **#105 — weak-class improvement backlog:** disposition after the live transfer result; C/G flexibility now dominates the interpretation.
- [ ] **#26 — misclassification tracking:** close as superseded or move to production monitoring.
- [ ] **#94 — content-based reject stage:** distinguish offline-built from production-live, then close or move to R8.
- [ ] **#129 — pre-#109 AllEvents geography:** R7 annotation is complete; move or defer the non-blocking backfill/representation residue.
- [ ] **#101 — frozen evaluation set and model versioning:** move to R8 lifecycle work.
- [ ] **#111 — ingestion rejection logging:** move restoration to R8 production integration.
- [ ] **#126 — destructive-path tests for `pushDeck.js`:** retain as deferred non-blocking debt outside the R7 close gate.
- [ ] **#99 — authorship-override review:** close, defer, or rehome the historical process debt.
- [ ] **#97 — old R7 figure mismatch:** close as historical; prevent the obsolete figures from entering current materials.
- [ ] **#106 — aggregator-shifted old gate slice:** close as historical or rescope outside R7.
- [ ] **#92 — Source-field issue:** rehome the remaining data-quality concern; its original R7 source-prior motivation is obsolete.
- [ ] **#114 — Facebook intake silence:** rehome as client/source operations work.
- [ ] **#100 — session-focus system:** remove from the R7 product milestone.

### 4. Resolve the small experimental residues

- [ ] Record that LLM fallback is not required for V1; preserve it only if R8 still needs the question.
- [ ] Close or defer `source` as a model feature; current R7 evidence does not require it.
- [ ] Close or defer the Pinot's sponsor-era training-row question; do not create cleanup unless it changes the flex policy or a measured result.
- [ ] Decide whether the 11 outcompeted rows outside the model set receive optional cleanup.
- [ ] Keep `r220` withheld unless language adjudication is actually performed.
- [ ] State that the old “no more than 2–3 swaps” product target was not measured; do not claim it passed.

### 5. Correct canonical state and close W6

- [ ] Update the R7 Scope Status Snapshot with the sealed readout and the dispositions above.
- [ ] Correct the stale Closing Sequence/“next” language in the Scope.
- [ ] Add the cross-release move and any final architecture decisions to `Decision_Log.md`.
- [ ] Correct the R6 Scope reference to R7 Step 2 recall@30; that metric was cut and cannot gate R6.
- [x] Record the sealed metrics in `NA/Vaughan_Metrics_Log.md`.
- [ ] Confirm the standing per-base/reusability gate: no new Vaughan-specific behavior outside configuration.
- [ ] Update `Execution_Log.md` and `CHANGELOG.md` through `/wrap`.
- [ ] Commit the sealed readout, runner/tests, checklist, and canonical closeout edits.
- [ ] Run the bounded `/wrap-review` because this closeout contains number-producing evaluation work.
- [ ] Close R7-W6 only after every remaining R7 issue is closed or explicitly moved/deferred.

## Roadmap reconciliation

### Delivered

- NeedsReview baseline captured: **226**.
- Historical section training corpus built.
- Newsletter-scoped/per-base model architecture established.
- Section classifier trained.
- Binary viability gate trained and evaluated.
- Per-section diagnostics and confusion matrices produced.
- Live readout completed.
- Directional live transfer demonstrated.
- Canonical metrics recorded.

### Superseded—not missing work

The following frozen-roadmap mechanics were replaced by evidence-driven design choices and must not be rebuilt merely to satisfy old wording:

- LinearSVC plus TF-IDF.
- `class_weight="balanced"`.
- `CalibratedClassifierCV`.
- A fixed confidence threshold controlling GPT fallback.
- Four-class evaluation including Local Aroma.
- Classifier-versus-GPT-4o/GPT-4o-mini as the primary ship gate.
- NeedsReview reduction as W6's immediate success criterion.
- Per-segment recall as the release headline.

Their replacements are Voyage embeddings plus logistic heads, three event sections, a binary viability signal before sectioning, score-and-sort rather than hard deletion, live gate validation, constrained-shortlist evidence, and explicit downstream ownership by ranking and allocation.

## Sealed evidence already complete

- Sealed technical readout: `R7_Sealed_Live_Readout_2026-08-27.md`.
- Instrument A: 100 live judgments; 80 primary comparable rows; ROC AUC **0.824**.
- Section interpretation: **62.3% exact agreement** and **77.9% flex-adjusted operational agreement** over 77 eligible rows with valid sections.
- Instrument B: 24 judgments; establishes downstream recency, duplication, repetition, diversity, flex, and slot-positioning requirements.
- Readout code tests: 6/6 passing at the audit.

## Post-close obligations—not W6 blockers

- [ ] Complete the full release writeup within one week of close.
- [x] Update the Metrics Log.
- [ ] Correct `NA/VB_Portfolio_Case_Study.md`; it still describes the obsolete LinearSVC/TF-IDF system and label count.
- [ ] Run a public-repository presentation pass.
- [ ] Update or formally reference the architecture diagram.
- [ ] Include a quantified before/after result.
- [ ] Include one explicit failure-mode line.
- [ ] Include a defensible business-value or cost number.

## Audit coverage

This inventory was reconciled against every maintained project-tracking home available on 2026-08-27:

- frozen Post-MVP roadmap;
- active R7 Scope;
- R7 decisions in the Decision Log;
- Metrics Log pending captures;
- every file under `docs/r7/`;
- Execution Log carry-forwards;
- live GitHub R7 milestone;
- README release sign-off rules;
- current uncommitted files;
- release writeup guide and portfolio case study.

Historical worksheet residue, superseded experiments, and archived build history are not additional closeout work unless one of the decisions above deliberately reactivates them. This is the complete recorded R7-W6 closeout inventory as of the audit date; it cannot guarantee the absence of an unknown software defect.
