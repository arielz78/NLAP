# Pro-Approach: R7-W6 Step 4c Results — Merged Analysis

**Created:** 2026-08-03, immediately after the Step 4c corrected fit.
**Type: Release-working.** Freezes to `logs/` at R7 close.
**Status: analysis, not decision.** Nothing here is settled architecture. Decisions live in `docs/Decision_Log.md`; release status lives in `docs/r7/R7_Scope.md`'s Status Snapshot. This document is the reasoning that precedes the next decision, and it does not restate either.

**Provenance:** two independent pro-approach passes on the same Step 4c output — one Claude, one Codex — merged without deletion. Where they converged, the convergence is noted. Where they disagreed, both positions are kept. One Codex claim is flagged inline as unverified rather than removed.

**The run this analyzes:** gate-slice AUC 0.856, operating point 0.4530, 97.1% global recall, 47.5% junk rejection, Golden Age Readers binding at 0.917. Full output in the `Execution_Log.md` entry for this session.

---

## 1. Domain classification

This is **data science**, not ML engineering — and mistaking which one it is *is* the error in the question.

"What can we improve other than more data" is an ML-engineering reflex: the model is the object, the metric is the scoreboard, the job is to move it. The DS question comes first and you haven't asked it: **is the metric measuring the thing that matters, and is there headroom to move it at all?**

Secondary domain is **editorial/product**, because the objective function — what a good week actually looks like for the editor — has never been written down. AUC is a proxy that was adopted, reasonably, as a stand-in and never validated against the real target.

Stated the other way: a professional would treat this primarily as a data-science evaluation problem, with an ML-engineering seam around calibration and train/serve consistency. They would not start by tuning the model.

The first question is not "How do we raise AUC?" It is:

> Does this gate remove enough editorial work, without systematically hiding valuable events?

## 2. How to frame the problem

Two reframes, and they point the same way.

**Reframe 1 — the results are not a disappointing model, they're a scope answer.** The gate works: +13 points of precision for 3 keepers, AUC 0.856 on the honest slice. What the run tells you is that the gate removes ~14% of the raw weekly pool, leaving ~620 events for 15 slots. Push AUC from 0.856 to 0.90 and that becomes ~600 for 15 slots. **The improvement you're reaching for doesn't change the outcome**, because gate quality is not the binding constraint — selection is. That's Fork C, and this run just answered it.

**Reframe 2 — you're optimizing a proxy nobody has tied to the objective.** Nothing in the pipeline states what the gate is *for* in measurable terms. Is it editor minutes saved? Fewer junk events reaching the shortlist? Higher CTOR? Each implies a different operating point, and §85's 90% floor was set by judgment, not by a cost. Until one junk event and one lost keeper are priced in the same unit, "improving the model" has no direction — you can't know whether 0.4530 is too aggressive or too timid.

So: **this is not a data problem and not an engineering problem. It's an evaluation-methodology problem sitting on top of a scope decision.**

### Improve the objective, not merely the classifier

The gate is trained on permanent include/reject judgments, but the product needs 15 strong weekly selections. Those are related—not identical—targets.

The gate should remain a broad hygiene filter. The ranker should solve preference and scarcity. Trying to make the gate choose the newsletter would contaminate its target and likely hurt recall.

*(This is the same separation §87 already settled as the V1 architecture — worth noting that an independent analysis re-derived it from the numbers alone.)*

## 3. The analysis lenses

| Lens | What it asks | What 4c currently says |
|---|---|---|
| Product utility | Does the gate materially shrink the workload? | It demotes 19.4% of the complete pool—not 47.5%. Useful, not transformative. |
| Error cost | What do we gain for each keeper lost? | At `0.453`: roughly 10 junk removed per keeper lost. At 90% global recall: only 1 extra junk per extra keeper lost. |
| Discrimination | Does the model rank keepers above rejects? | Gate AUC 0.856: meaningful signal, but the representative population is harder than training. |
| Precision/recall | What survives at the operating point? | 97.1% keeper recall; survivors are 75.9% keepers. |
| Subgroup safety | Is harm concentrated? | Yes. Golden controls the threshold and deteriorates sharply under a higher cutoff. |
| Calibration | Do scores mean literal probabilities? | No. The ordering works, but `0.70` does not reliably mean 70%. |
| Stability | Would another sample select the same threshold? | Unknown. With 24 Golden keepers, one event moves recall 4.2 points. |
| Error mechanism | Why are specific events wrong? | ⚠️ **DISPROVEN 2026-08-03.** Codex hypothesized "some Golden misses appear concentrated in literary/library programming." The error table settled it: at the 0.4530 cutoff the two Golden misses are **retirement-finance seminars** (r218, r258), not literary or library programming. Both were audited KEEP in Step 4b and both had adequate model-visible text — the live lookups added no decisive fact. n=2; do not tune around it. |
| Operational validity | Does it improve an actual newsletter? | Unmeasured until the shadow issue. |

**Two notes on the top row.** The 19.4% is 32 of 165 rows falling below the cutoff — that's the *gate slice*, not the complete production pool. Production is junkier, so the real demotion rate is higher, making 19.4% conservative. It does not conflict with the ~14%-of-raw-pool estimate in Reframe 1; different denominators, different questions.

**The error-cost row is the sharpest single argument available.** 29 junk / 3 keepers ≈ 10:1 at the chosen point; moving to 0.5013 costs 7 more keepers to reject 7 more junk, i.e. 1:1. That's the elbow. It converts the operating point from "the §85 veto forced it" into "the trade collapses past here" — a much stronger defense of 0.4530.

## 4. What to validate first — the assumption that collapses everything

**Is there headroom at all?**

Editor self-agreement is **82.5% on include/None** across 40 duplicate-title groups. You are scoring a model against labels that disagree with themselves roughly one time in six. That puts a ceiling on measurable performance, and **nobody has estimated where it is.**

If the irreducible-noise ceiling is around AUC 0.86, then 0.856 means the model is done — and every item on the improvement list below is dead on arrival, including more data. If the ceiling is 0.93, there's real room and it's worth spending.

This is ~30 minutes on data you already have, it requires no new labels and no new spend. It's also squarely eval design, so it's Ariel's to author.

**Everything else in this document is conditional on that number** — with one exception, noted in §11: the error table is cheaper still, and partially answers the ceiling question qualitatively.

## 5. Analyses we can still run without more labels

### 5.1 Full error taxonomy

For every false negative and a sample of false positives, classify the failure as:

- Label error: the editor's target was wrong or inconsistent.
- Missing input: useful description/category data existed but was absent.
- Representation failure: the text was present but the embedding missed the distinction.
- Boundary ambiguity: reasonable people could disagree.
- Policy mismatch: "permanent reject" does not align with actual weekly editorial value.

This tells us what to fix. Retraining does not solve missing input or a bad target.

**At the chosen operating point that's 3 lost keepers and 32 surviving junk — 35 rows.** Read them. Is there structure — a source, a section, a description-length band, a category? Structured errors mean a feature is missing. Unstructured errors mean you're at the noise floor. This is the single highest information-per-minute hour available and it costs nothing.

### 5.2 Threshold stability

Run grouped bootstrap refits and measure:

- Distribution of the selected threshold.
- Junk rejection distribution.
- Keeper losses by section.
- How often Golden falls below 90%.
- Which events repeatedly cross the cutoff.

If `0.453` moves wildly across resamples, we should not encode it as a durable threshold. That analysis quantifies the small-sample concern directly.

This is also the cheap early check on the script's own boundary-hugging warning — cheaper and sooner than waiting for the shadow run, which is editor-dependent.

### 5.3 More appropriate evaluation metrics

AUC is not enough. Add:

- Precision-recall curve and average precision.
- Survivor precision at each candidate threshold.
- Total-pool reduction.
- Junk removed per keeper lost.
- Confidence intervals in whole-event counts.
- Section-specific precision and recall.
- False-negative composition by source and event type.

The business-facing curve should be:

```text
editorial work removed ↔ valuable events put at risk
```

### 5.4 Slice analysis

Break performance down by:

- Section.
- Source.
- Missing versus present description.
- Description length.
- Library versus commercial listings.
- Aggregator versus first-party source.
- Event type: book club, performance, workshop, festival, class.
- Label provenance: original editor, 4b correction, 1c correction.
- Time period.

This can reveal something like:

> The model works overall but fails on title-heavy library events with short descriptions.

That produces a specific engineering fix.

*(Note: label provenance is a genuinely good slice here — there are 16 Ariel-adjudicated vs 22 editor round-1 dispositions in `eval/step1c_reconciliation.json`, plus 11 4b corrections. If the model performs differently on Ariel-authored labels than editor-authored ones, that's a target-purity finding, not a model finding.)*

### 5.5 Temporal and source robustness

The current grouped CV prevents duplicate-title leakage, which is good, but it does not prove future robustness.

Useful tests:

- Train on earlier events, test on later events.
- Hold out one source at a time.
- Compare old versus recently added sources.
- Check whether performance collapses when a source disappears.

A source-holdout collapse would mean the model learned source identity instead of editorial meaning.

**This is the most important test in the document for the client-#2 requirement**, and it should gate the arm-2 feature work in §6.4 rather than follow it. Source *is* strongly predictive (32.1% includable on `eventbrite.com` to 100% on `markham.ca`) — which is precisely why adding it is dangerous. A model that learns source identity scores well on Vaughan and collapses at Mississauga, where the source mix differs.

### 5.6 Calibration analysis

Evaluate calibration on the representative gate slice—not only pooled—and ideally by section.

Then choose one of two honest architectures:

- Calibrate with a simple method such as sigmoid/Platt calibration inside nested grouped CV.
- Rename the output `gate_score` and stop treating it as a literal probability.

With only 365 fit rows, isotonic calibration is likely too flexible. Calibration will not improve AUC; it improves score interpretation and makes multiplication with `P(section)` defensible.

**Why this is not optional:** the current decile table shows the 0.4–0.6 bin predicting 0.500 and delivering 0.366, and the 0.6–0.8 bin predicting 0.700 and delivering 0.874. The chosen threshold sits inside the worst-calibrated bin. It doesn't move Step 4c's threshold at all — but R6's interim ranker is `P(include) × P(section)`, and multiplying two miscalibrated numbers isn't defensible. Fix it before R6 depends on it, not after.

## 6. Actual improvements beyond more data

### 6.1 Highest-value: improve feature completeness

The embeddings do not include the pending AllEvents description backfill, and 46 fitted rows have no description.

Before changing the model:

- Apply the description backfill.
- Rebuild embeddings using the exact production text recipe.
- Verify training and serving construct identical text.
- Rerun the same frozen evaluation.

If useful text exists but the model never receives it, model tuning is addressing the wrong problem.

**The scale of this:** 158 of 365 fit rows are `allevents.in` — **43% of the fit set** — median description 117 characters. The model is being asked to judge events from a title and nothing else. More text per row beats more rows, and it's not close. This is #108.

### 6.2 Diagnose the Golden failure

The aggressive threshold disproportionately removes Golden events. Possible fixes depend on the mechanism:

- Missing descriptions → fix ingestion.
- Labels inconsistent → repair labels.
- Text present but model scores them low → representation/fit problem.
- Events genuinely ambiguous → preserve an uncertainty band for editor review.
- Repeated subtype failure → add an explicit, validated feature.

Do not add a generic "library" or "book club" flag until we verify it preserves the corresponding rejects.

⚠️ **Resolved 2026-08-03 — the "literary/library programming" concentration was wrong.** The error table shows the two Golden misses at the 0.4530 cutoff are **retirement-finance seminars** (r218 "10 Health Financial Management Habits", r258 "Making Your Money Last in Retirement"). Both carried adequate model-visible text — r218 even stated "Audience: Adult, Older Adult" — and the verified live lookups added no decisive audience fact. Plausible mechanism, offered as inference not observation: financial-seminar language sits near the B2B / professional-dev negatives the model trains on. **n=2. The mechanism list above remains the right decision tree; do not tune the model around two events.**

**Counterweight to this whole section:** Golden's eval slice is 24 rows. Its 0.917 is two events from failing the veto. Some of what looks like a Golden weakness is sample size, and treating 24 rows as a diagnosable subgroup risks fitting noise.

### 6.3 Cost-sensitive fitting

A section-weighted loss could make Golden false negatives more expensive during training. This may produce a better global threshold without creating forbidden per-section thresholds.

It must be tested against:

- Overall junk rejection.
- Families and Couples performance.
- Golden false-negative count.
- Threshold stability.

This is preferable to manually lowering Golden's threshold, but it is still a design change—not a free improvement.

*(And it is weighting a loss to protect 24 rows. Defer harder than the rest of §6.)*

### 6.4 Add structured features selectively

Potential features include:

- Source/hostname.
- Description presence.
- Event-type indicators.
- Audience/age language.
- Venue type.
- Registration or commercial language.

Each requires an ablation:

```text
embeddings only
versus
embeddings + candidate feature
```

Source is particularly risky: it can improve current CV while failing on a new client or changed source mix. Test it with source-held-out evaluation.

**Implementation note:** `desc_len` and `has_cats` are already computed at `gate_step4a.py:417–418` but deliberately excluded from `X`. Line 961 states that adding them is a representation choice and therefore **arm 2, Ariel's call.** The features are on the floor waiting; the decision to use them is authored-core.

### 6.5 Use uncertainty instead of a sharper cutoff

Events near `0.453` could enter an explicit review band:

```text
high score    → normal priority
near cutoff   → visible uncertainty/review
low score     → demoted but recoverable
```

That fits the actual uncertainty better than pretending one decimal threshold cleanly separates the classes.

*(This is also the most natural fit with §78's score-and-sort architecture — nothing is deleted, so a band costs nothing to implement.)*

## 7. What to skip or defer

- Deep neural networks.
- Nonlinear models over 2,048 embedding dimensions. **365 rows, 2048 dimensions — gradient boosting or a neural head will lose to logistic regression here and cost a week. This is the method-fit call: the technique already matches the problem.**
- Per-section thresholds.
- Fine threshold optimization. **It's boundary-hugging by construction; any further precision on that number is false precision.**
- Handwritten rule systems.
- Declaring a population-level 90% guarantee.
- Large indiscriminate relabelling exercises.
- **Hyperparameter tuning.** `C` is frozen at 1.0 by §85 and the preflight enforces it. Correct — tuning on 365 rows against noisy labels fits noise.
- **The §75 stratum.** n_neg = 6. One event is 16.7 points. Record and move on, as §88 already requires.
- **More labels.** Last, and probably never. 365 rows against a 17.5%-noisy labeling process; doubling the rows halves the standard error on a number whose ceiling is unmeasured.

Those add complexity before we know the error mechanism.

## 8. Where the real risk is

Not the numbers. Four silent ones, ranked:

**Train/serve skew through the embeddings.** The vectors were embedded 2026-07-25. #108 will change the input *text* for 43% of the fit set, and the run output says it outright: "Re-embedding after that call lands will move every AllEvents row." If the backfill ships and the model isn't re-embedded and re-fit together, production scores rows on text the model never saw a version of. Nothing errors. The numbers stay plausible. This is the classic one and it's already loaded.

**The operating point was selected on the same slice it's scored on.** The script flags it — highest threshold that still clears the floor on that exact slice. In production it will underperform, and it will be impossible to tell whether that's threshold overfitting or model degradation, because both look identical from the outside.

**Label drift is written in place and prior states are unrecoverable.** 36 of 416 rows drifted since the 07-20 pull; the 4a labels no longer exist to re-fit against. Any future "did we regress?" question is permanently unanswerable. Not urgent, but it means today's curve is the only one that will ever exist from before the shadow run.

**Precision degrading with production base rate is invisible.** The editor sees a worse shortlist and experiences it as "the tool got worse," with no signal telling you it's prevalence, not the model.

## 9. The portable asset — what survives Mississauga

**Portable, and worth designing cleanly now:**
- **The §77 routing contract** — label → target mapping, asserted in code, one shared fixture, two consumers. The *structure* transfers exactly; only the vocabulary changes.
- **The slice discipline** — a representative eval population held separate from convenience training data, never pooled. This is the methodological asset and it's the thing most teams get wrong.
- **The labeling instrument** — the multiselect reason form, the live text-first sitting protocol, the self-agreement measurement. Client #2 needs its own labels; it should not need its own process design.
- **The source-holdout evaluation** (§5.5) — the test that proves the model learned editorial meaning rather than source identity. Without it, portability is asserted, not demonstrated.

**Not portable, don't try:**
- **The model.** Different city, different editor, different taste. The weights are worthless in Mississauga. Retrain from their labels.
- **The operating point.** Theirs to price.

**Vaughan-specific and fine to hardcode:** section names, the breadth-criterion vocabulary, the source list, the quota structure.

The clean line to hold: **the harness is the product, the model is the artifact.** If Mississauga can reuse the labeling instrument, the routing contract, and the eval harness, and only has to supply labels, the replication is a week. If any of those three has Vaughan baked in, it's a rewrite.

## 10. The professional sequence

1. **Produce one error-analysis table** covering every keeper lost at `0.453` and `0.5013`, plus the 32 surviving junk.
2. **Classify each** as label, input, representation, ambiguity, or policy failure.
3. **Estimate the noise ceiling** from the 40 duplicate-title groups.
4. **Run grouped threshold-stability/bootstrap analysis.**
5. **Fix feature completeness and train/serve parity** (#108 → re-embed → verify identical text construction).
6. **Resolve the calibration contract** (Platt, or rename to `gate_score`).
7. **Refit under the unchanged evaluation protocol.**
8. **Run the real shadow issue.**
9. **Only then** decide whether cost weighting, structured features (gated on source-holdout), or more labels are warranted.

Steps 4 through 7 are conditional on step 3. If the model is already at the noise ceiling, they are a week spent moving a number that cannot move.

## 11. The single first action

**Build the error-mechanism table.** Until we know why those events failed, every proposed model improvement is guessing.

It comes before the ceiling estimate for a specific reason: at 35 rows it's twenty minutes, and if the 3 misses turn out to be obvious label errors then the model isn't at a noise ceiling at all — it's at a label problem, and the ceiling estimate would have measured the wrong thing. The cheaper analysis also partially answers the more expensive one.

`TODO(ariel):` For each missed keeper, decide whether the model lacked the information or had the information and interpreted it incorrectly. That split determines whether the next move is engineering or modelling.

---

## Open questions this document does not settle

- **Fork C** — whether W6 keeps the gate and lowers the bar, expands to include ranking, or merges with R6. §2's Reframe 1 argues the run answered it; that is an argument, not a decision.
- **The objective function** — what the gate is for, in units that can price one lost keeper against one surviving junk event. Unwritten.
- **Arm 2** — representation choice, Ariel's, and gated on source-holdout per §5.5.
- **The calibration contract** — calibrate, or rename to `gate_score` and stop implying probability.
- **The noise ceiling** — unmeasured, and it conditions most of §10.
