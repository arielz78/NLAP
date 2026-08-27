# R7 Sealed Live Readout — 2026-08-27

**Status:** complete readout of the frozen 2026-08-13 live audit. Numbers originate in `NA/Vaughan_Metrics_Log.md`; this document interprets them. It does not retune the model, validate a production cutoff, or overwrite the preregistered editor rulings.

## Bottom line

The R7 gate transferred to a fresh live pool as a **coarse viability-ranking signal**. On the 80 gate-comparable Instrument A rows, an editor-eligible event scored above an editor-rejected event in **844 of 1,024 pairs (ROC AUC 0.824)**. Eligible share rose monotonically from **47% in Q1** to **100% in Q4–Q5**.

That supports the architecture already chosen: **score and sort; never hard-delete**. It does not establish a calibrated live cutoff, exact #1→#321 ordering, weekly publication probability, or a complete final-newsletter ranker.

The section classifier is weaker under strict single-label scoring (**48/77 = 62.3%**) but substantially closer to production use when the intended Couples/Golden flexibility is recognized (**60/77 = 77.9% flex-adjusted agreement**). This is a product-policy view, not revised raw accuracy.

Instrument B shows that the remaining load-bearing work is downstream slate construction: recent-publication suppression, semantic duplicates, organizer/series repetition, diversity, flexible section routing, and final slot positioning.

## Evidence and safeguards

The readout joins three frozen evidence layers:

1. The editor's completed Airtable rulings (100 Instrument A, 24 Instrument B).
2. `editor_packets/sealed_answer_key.json`, containing the live gate and section scores hidden during the sitting.
3. `instrument_a_editor_sheet.jsonl`, preserving exactly what information the editor saw, plus `scored_survivors.jsonl` for the gate-fit-overlap flag.

Instrument A was sampled by live score rank at **25/25/20/15/15** across Q1–Q5 and one row per recurring series. Its primary read excludes:

- **14 `LINK` rows**, because the editor consumed information the gate may not have had;
- **6 gate-fit-overlap rows**, because those events were partly in-sample;
- the known Georgia event `A-1-01`, treated as a Stage-0 geography miss rather than a gate miss.

These exclusions leave **80 clean rows: 64 Eligible and 16 Not eligible**.

## Instrument A — gate-ranking transfer

| Live-score stratum | Comparable rows | Eligible | Not eligible | Eligible rate |
|---|---:|---:|---:|---:|
| Q1 — lowest | 17 | 8 | 9 | **47.1%** |
| Q2 | 19 | 15 | 4 | **78.9%** |
| Q3 | 16 | 13 | 3 | **81.3%** |
| Q4 | 14 | 14 | 0 | **100%** |
| Q5 — highest | 14 | 14 | 0 | **100%** |
| **Total** | **80** | **64** | **16** | **80.0% within this constructed sample** |

### Three valid perspectives

**Pairwise ranking perspective — primary.** ROC AUC is **0.824**: across all 64 × 16 Eligible–Not eligible pairs, the model placed the eligible event higher **82.4%** of the time. This measures cross-class ordering, not individual classification accuracy.

**Quintile perspective — primary.** Editor rejections concentrate in the lower score regions; none appear in the clean Q4 or Q5 samples. This establishes coarse ranking transfer, not a threshold.

**Label-target perspective — limitation.** The editor answered whether an event could **ever** suit Vaughan Brief while ignoring weekly competition. `Eligible` therefore combines strong contenders with marginal or "too niche but technically acceptable" events. The result supports viability ranking; it must not be presented as top-five suitability or publication probability.

### What the raw 78% does not mean

Across all 100 rows the editor ruled **78 Eligible / 20 Not eligible / 2 Can't tell**. Instrument A deliberately oversampled low score regions and used a broader ever-eligible target, so 78% is not the live pool's eligibility rate. The representative historical pool estimate remains a different measurement: **66.8% on n=184**.

## Instrument A — missing-information diagnostic

Among the 14 `LINK` rows:

- 9 were Eligible;
- 4 were Not eligible;
- 1 was Can't tell.

Twelve of those 14 originally lacked descriptions; they split **7 Eligible / 4 Not eligible / 1 Can't tell**. Missing descriptions can therefore hide viable events, but this small diagnostic does not by itself authorize enrichment or prove that #108 should ship.

## Instrument A — section perspectives

Section analysis uses all **77 eligible rows with a valid editor section**, because its question is section routing rather than gate transfer.

| Editor \ Model | Families | Couples | Golden | Editor total |
|---|---:|---:|---:|---:|
| Families | **27** | 5 | 5 | 37 |
| Couples | 2 | **7** | 2 | 11 |
| Golden | 5 | 10 | **14** | 29 |
| **Model total** | **34** | **22** | **21** | **77** |

### Perspective 1 — strict label agreement

Exact agreement is **48/77 = 62.3%**.

- Families: **27/37 = 73.0%**
- Couples: **7/11 = 63.6%**
- Golden: **14/29 = 48.3%**

This is directional only. Instrument A was not balanced or designed as a formal classifier benchmark, and prior editor routing self-agreement is about 75%.

### Perspective 2 — production flex

There are **12 Couples↔Golden swaps**: two editor-Couples/model-Golden and ten editor-Golden/model-Couples. If the product's intended C/G flex mechanism treats either destination as acceptable, agreement becomes:

> **(48 exact + 12 flex) / 77 = 77.9% flex-adjusted agreement**

This is the most production-relevant directional view **only if** the allocator truly consumes the flex flag. It is not raw classifier accuracy.

### Perspective 3 — ambiguity removed

If the 12 C/G-flex rows are removed rather than credited, exact agreement is:

> **48/65 = 73.8%**

This is a sensitivity analysis. It shows how much the moving C/G boundary affects the strict score, but it changes the denominator and should not replace the full confusion matrix.

### What the C/G errors mean

The largest strict cell is editor-Golden/model-Couples. Much of it reflects the already-known contextual boundary: Pinot's Palette historically splits nearly evenly across Couples and Golden, and outdoor concerts were explicitly described as flexible during the sitting. The classifier is not tracing a stable distinction because the editorial destination itself changes with weekly composition.

The remaining real signal is that model-created Couples is the least pure strict pile (**7/22 = 31.8%**). That belongs in flex-aware allocation and ranking, not another broad gate experiment.

## Instrument B — product shortlist read

Instrument B asked a different question: whether eight unique model-ranked opportunities per section gave the editor enough material to build five slots. Its checkbox drifted toward "acceptable in general," so **20/24 checked = 83.3% is not top-five accuracy**. Notes carry the actual constrained read.

### Families

Five events were acceptable in isolation, but Mini-Makers had run recently. Only four were runnable that week, so Families needed one replacement. This is a recency/allocator failure, not a permanent gate rejection.

### Couples

Couples could fill five, but the slate contained:

- two listings representing one semantic beer opportunity;
- two independently acceptable Pinot's Palette events that should not both run in one section/week;
- events that could flex between Couples and Golden.

This points to semantic deduplication, organizer/series repetition limits, and flexible routing.

### Golden

All eight were generally acceptable and the editor identified a preferred five. The slate was overly concentrated in yoga/wellness. Several individually valid predictions produced a repetitive section, so the failure is slate-level diversity rather than individual eligibility.

## What the evidence supports

- The gate score separates stronger and weaker live viability regions.
- It is safe to use as a reversible score-and-sort input.
- The section head is directionally useful but requires C/G flexibility.
- The model can supply useful section shortlists.
- Ranking and constrained slate construction remain load-bearing.
- Further broad binary-gate tuning has low expected value relative to downstream work.

## What the evidence does not support

- `0.4530` as a calibrated live cutoff.
- Automatic deletion of low-scored events.
- Exact ranking of all 321 candidates.
- Treating Instrument A's 80% as a production eligibility rate.
- Treating Q4/Q5 as guaranteed newsletter selections.
- Treating Instrument B's 83.3% as top-five accuracy.
- Treating 62.3% or 77.9% as a formal production accuracy guarantee.
- Treating display position as identical to relevance rank.

## Decision-ready R7 interpretation

The model work has answered the R7 question: the gate is viable as a **reversible viability signal**, not as a hard classifier or final selection mechanism. The main product problem has moved downstream to weekly competition and constrained slate construction.

The remaining release decisions are administrative and architectural rather than another broad model investigation:

1. Resolve Fork C by keeping R7 at the viability-signal boundary and handing constrained ranking to R6, or explicitly choose a different boundary.
2. Decide whether the consequential Step-4c adjudication and #108 offline enrichment arm still earn their cost before close.
3. Reconcile the R7 milestone issues and persist final status through `/wrap`.
