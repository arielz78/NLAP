# R7-W6 Closeout Checklist

**Audited:** 2026-08-27

**Purpose:** One bounded inventory for closing R7-W6 without repeatedly reopening the roadmap, issue milestone, or historical worksheets.

**Status authority:** `R7_Scope.md` remains the source of truth for release status. This file is the closeout worklist.

## Boundary

R7-W6 proves and closes the model work. R6 owns weekly ranking. Ariel's current direction is to move the former R7-W7 production deployment and model-lifecycle tranche into R8, where the R7 signals, R6 ranking, allocator, and editor console are integrated. That move still needs to be recorded in the Decision Log before R7 closes.

The upcoming ranked-week prototype is R6 work. It is not an R7 close requirement.

## Closeout order

### 1. Settle the three remaining W6 decisions

- [x] **Fork C: SETTLED 2026-09-04 (Ariel) — option (a), gate only.** R7 supplies reversible viability and section signals; R6 owns weekly relative ranking; the allocator applies final-list constraints; the editor retains final selection.
  - Options (b) expand W6 to own ranking and (c) merge W6 into R6 are closed. Foreclosed by §87's function split and by R6's 2026-09-03 reopening, which owns `RankedPool`.
  - **What this sets is the exit bar, not the artifact.** R7's claim is "directionally correct signal," which the sealed readout's ROC AUC 0.824 and 62.3% / 77.9% section agreement support. It is not "this system picks the final 15" — that claim would owe measurement R7 does not have.
  - Per §78 R7 scores and sorts, never deletes: it hands downstream the whole in-window pool (~310–360) with viability and section affinity attached. It does not emit a shortlist. Shortlist depth is R6's `M` and R8's `K`, both deliberately unfixed.
  - **Accepted cost:** R7 ships nothing the editor sees directly. Its value is contingent on R6 or the allocator consuming it.
  - Not a blocker, still open: the `~720` denominator `TODO(ariel)` at `R7_Scope.md:70` is labelled "Fork C's arithmetic." Line 74 already records that the premise survives at ~10:1 and only the magnitude changes, and §87 settled the boundary on function rather than that ratio. Stop quoting `~505 of ~720`; do not re-derive before close.
  - Still to record: the Decision Log entry, in the Gate 5 batch below.
- [x] **Step 4c: CLOSED 2026-09-04 (Ariel) — the error-mechanism adjudication is killed, not deferred.** The numerical run stands. `R7_Step4c_Error_Mechanism_Table.md` remains sealed evidence of that run; its 35 `TODO(ariel)` rows are marked **not performed, deliberately** — they are not pending work and must not reappear as debt in a later audit.
  - **The worksheet's categories no longer exist.** Its 35 rows are 3 demoted keepers + 32 surviving junk *at the 0.4530 cut* — and per §78 plus Fork C nothing thresholds. The gate scores, R6 ranks. With no cut there is no false positive or negative, only an order.
  - The errors do not vanish, they change type. Row 61 (`Bollywood Boom`, 0.8438) is no longer junk past a filter; it is junk ranked above keepers. That is a pairwise ranking failure, owned by R6, measured against R6's target.
  - **The observation instrument is the R8 console, not a hand-filled worksheet.** An editor swap is the error record — the model ranked A above B, he chose B. See `R8_Scope.md` §1.
  - Its findings already have homes: 8 of 35 rows are `TITLE ONLY` (that is #108), and the narrow-audience cluster — Bollywood Boom, Afghan Nights, Russian Nights, Hebrew Library, Oshkabewis, Holy Week — is #123. The worksheet would have itemized two tracked issues, not discovered a third.
  - **Accepted cost:** Step 4b's comparable pass found 11 label errors in 30 rows, so the eval set behind R7's closing numbers is probably slightly noisy and stays that way. Accepted because the release closes on the live readout, which does not depend on that set.
- [x] **#108: MOVED TO R6 2026-09-04 (Ariel).** Deferred out of R7 as an enrichment experiment that does not change V1. Framing: *we can enrich AllEvents; R6 measures whether it helps.* Re-milestone the issue to R6; do not run R7's frozen arm.
  - **Rationale:** R7's arm could only move an exit bar Fork C has now fixed at "directionally correct." In R6 the same enrichment feeds the ranker, where it can change an outcome.
  - **What already exists (2026-08-04, read-only): reach measured, comparison never run.** On the 165-row slice, backfill at cap 300 changes text on 40 rows (21 previously title-only), touching 1 of 3 demoted keepers and 9 of 32 surviving junk. Stated ceiling was keeper recall 97.1% → 98.1% and junk rejection 47.5% → 62.3%.
  - ⚠️ **That ceiling is expressed in threshold terms and does not transfer.** With Step 4c's cut killed, the R6 question is whether enrichment moves those rows *down the order* — a different measurement than the one staged. Do not quote 62.3% as an R6 target.
  - **Deployment is the expensive half and is not entailed by the experiment.** `scripts/fetchAllEventsDescriptions.js` is a working reference implementation, not wired into R1; wiring it means a per-event detail-page fetch loop in n8n. Run the offline arm first; wire only on a win. The 2026-08-04 note that `text_recipe.py:36-41` welds the artifact rules to that wiring still stands.
  - **Second arm, R6's to schedule: LLM + websearch enrichment as a comparator.** Not the dead LLM-fallback path in §4 below — that concerned classification confidence, not text recovery. Deterministic scraping is free, repeatable and byte-identical, but needs a stable detail page; LLM search costs per event across ~310–360 rows/week and is non-deterministic, so features move between runs. They solve different problems: scraping wins where a page exists, LLM search is the only option for sources without one. Compare them **on AllEvents specifically**, because it is the case with verifiable ground truth — an LLM arm that cannot match a scrape you can check is not trustworthy on the sources where you cannot check it.

### 2. Record the former W7 tranche as moved to R8

- [x] Add the cross-release decision to `Decision_Log.md` — **DONE**, §94 (2026-08-27).
- [x] Remove W7 from the definition of R7 completion rather than leaving it ambiguously deferred — **DONE 2026-09-04**, `R7_Scope.md` §3 now records W7 as dropped with per-step reasoning, and the two `R7_Scope.md` pointers routing #111 to "W7 deploy work" are corrected.
- [x] **R8 inherits nothing from W7. RESOLVED 2026-09-04 (Ariel): all five W7 steps are dropped from R7.** The earlier "ensure R8 inherits" framing is withdrawn — it would have parked a dependency R8 does not have. R8 scores manually per `R8_Scope.md` §3, so no production deployment is required for delivery.

W7's five steps, triaged against what R7 actually shipped:

| # | W7 step | Disposition |
|---|---|---|
| 1 | Classifier in R2 ahead of the LLM node; high-confidence predictions skip the LLM | **Dropped — superseded.** The confidence/abstention path is dead on measurement (§78): None and includable confidence distributions are near-identical, so confidence cannot do reject work. R7 shipped a scoring gate plus section head, not a classifier that short-circuits the LLM. |
| 2 | Templated `LLM_Rationale` for skipped rows | **Dropped.** Existed only to fill the gap left by step 1. |
| 3 | 20-record test of classifier+fallback vs GPT-4o-only | **Dropped.** Compares against a path that does not exist. A production smoke test may be written independently if scoring ever goes unattended. |
| 4 | Replay a frozen evaluation set through the production path | **Dropped (Ariel).** Rationale: future R6/R8 versions will not be worse than current R7, so R7-as-baseline has no value. Flagged once and accepted: the residual use of a *pre-committed* set is catching a later version that breaks silently — a bad re-embed or feature bug whose output still looks plausible — not benchmarking against R7. Revisit if that becomes a live concern. |
| 5 | Retraining trigger on N editor corrections | **Deferred past R8 (Ariel).** Decide the trigger once the console is delivering editor corrections; the mechanism depends on what R8 actually captures. |

- [x] **#101 split and moved R7 → R6 2026-09-04 (Ariel).** It bundled two things and they resolve differently.
  - **Frozen eval set — dropped, on method fit.** A frozen benchmark catches regressions before they reach users; here they cannot, because the editor reviews every issue before it publishes. The one failure he would miss is slow degradation, and R8's console records swaps — swap rate over time is that detector, free with a release already being built. Freezing now would also freeze the wrong question: R7 measured viability and section, R6 measures ordering. The sealed live readout and sealed Step-4c snapshot remain as frozen evidence. Revisit only if the model ever runs where the editor does not see the output.
  - **Model versioning — kept, moved to R6.** Persist the fitted model with a training-data hash, config and metrics. It earns its keep in R6, which will produce multiple scoring versions; without it, "why did this event rank differently this week" has no answer. Copy `models/sectioning/embed_corpus.py`'s existing corpus manifest pattern.
  - Issue retitled accordingly; the frozen-set and retraining-trigger done-criteria are withdrawn from it.
- [ ] The "measurable NeedsReview reduction" deliverable is **dead as a release bar** (explicitly superseded below) and survives only as a post-deployment observation. The 226 baseline is captured and keeps its value.

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
