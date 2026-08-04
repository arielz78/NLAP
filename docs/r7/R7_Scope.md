# R7 Scope — The Reject Gate (R7-W6)

**Owner:** Ariel
**Deadline (self-imposed):** R7-W6 done by ~2026-08-02 (end of next week). R6 the week after (~2026-08-09).
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md` (frozen intent — read only for original release intent).

**Read order:** this doc → `docs/r6/R6_Scope.md` (the ranker half; they feed each other, see the seam note in §3) → `docs/Decision_Log.md` §61–72 → `logs/R7_Log.md` (build history) only if you need the empirical record.

**Type: Release-working.** Current truth + the one-week plan. Build history (probe numbers, confusion matrices, the dead investigation sequence) is in `logs/R7_Log.md`; decisions in `docs/Decision_Log.md` §61–72; chronological recaps in `Execution_Log.md`. Verbatim prior version (the pre-reframe 261-line doc) is in git (`2fcb5f5`).

**Key data input:** the editor-labeled deck (`R7 Label Deck`, Airtable `tblOxYHuAl2yp9Znl`). Airtable holds **456 rows** (239 None / 211 includable / 6 blank); the current modeling set uses **416**. **#107 accounts for all 40 omitted rows:** 30 Batch-5 rows post-date the embedding pull, 4 walkthrough rows were omitted at staging, 4 have blank `Section`, and 2 have no URL. Use 456 when talking about what the editor has ruled on, 416 only when describing a fit actually run on the cached model set.

Plus the **cached embeddings** (current representation `voyage-4-large` @2048d, §73 — `models/sectioning/corpora/embeddings_voyage-4-large.npy` + `transfer_*_voyage-4-large.npy`; OpenAI `text-embedding-3-large` matrices also cached, which is what Fable's AUC 0.823 floor was measured on — the gate is representation-agnostic). The gate is trained on these — no new embedding spend, no new labeling session required to start.

---

## Status Snapshot (2026-08-01)

Single source of truth for "where are we." Supersedes the roadmap's R7 header and the pre-reframe body of this doc.

**Step status at a glance (2026-08-03, after Step 1c closed and the §75 diagnostic split).** Step 0 ✅ · **Step 1a ✅ CLOSED — 239 of 239 None rows labelled** · **Step 1b ✅ CLOSED (2026-07-31) — the §77 routing contract ships in both consumers** (`route_s77()` in `gate_step4a.py`, `targetOf()` in `auditR7Labels.js`), asserting one shared fixture `routing_s77_cases.json` · **Step 1c ✅ CLOSED (2026-08-03)** — round 1 returned 14 ELIGIBLE / 15 PERMANENT REJECT / 9 UNCLEAR; Ariel adjudicated the 9 UNCLEAR rows, the click-only rejections and the unsectioned ELIGIBLE rows, and **round 2 was cancelled without being issued**. All 38 dispositions settled as **25 gate-positive (Families 8 / Couples 10 / Golden 7) · 12 gate-negative · 1 withheld (r342, corrupt input)**; 37 rows written to Airtable and verified against a post-write refetch. `eval/step1c_reconciliation.json` records every row's verdict, verbatim reason, settled disposition, section, provenance and annotations. **16 of 38 dispositions are Ariel-adjudicated and 22 carry the editor's round-1 verdict — recorded per row, not hidden in an aggregate.** (The 16th is r175: its round-1 ELIGIBLE stood, but Ariel ruled over a conflicting first-sitting `Label`, so the disposition is his.) 11 rows outside the current model remain optional; r220 still withheld for language adjudication · **Step 2 CUT** · **Step 3 nearly done** — the Eventbrite TLD allowlist is written in-repo and awaiting re-import · **Step 4a ✅ DIAGNOSTIC RUN COMPLETE** — gate-slice AUC 0.889 on the pre-repair labels; no release bar taken from it · **Step 4b ✅ CLOSED** — 30 disagreement rows resolved (19 KEEP / 11 NEVER), all 11 corrections applied and verified in Airtable, and `eval/step4b_reconciliation.json` records the write · **Step 4c NUMERICAL RUN COMPLETE (2026-08-03) — NOT CLOSED** — the pin is flipped to `"4c"` and the fit ran under §85's pre-registered contract, preflight first. **Provisional operating point 0.4530**: gate-slice AUC 0.856, keeper recall 97.1% (101/104), junk rejection 47.5% (29/61), survivor precision 75.9%, Golden binding at 91.7% (22/24). Numbers home in `NA/Vaughan_Metrics_Log.md` — do not re-author them here. §75 reported descriptively as two class-separated cells (6/6 keyword-positives survived, 1/6 keyword-negatives rejected) with no automatic verdict and no influence on operating-point selection, per §88. **Not closed** because the fresh-30 readiness audit remains and four error-table rows await Ariel's adjudication (r269, r288, r341/r97, r70 — still `TODO(ariel)`, worksheet unchanged). ⚠️ **#123 remains unresolved after the positive-side cutoff diagnostic:** the gate rejects 0 of 14 audience-narrowness negatives, while all 25 flagged cultural/religious or age/family positives survive at 0.4530 (6/6 and 19/19). The positive check establishes cutoff behaviour only; it does not prove score-distribution separability or whether the fix belongs in a feature, the labels, or ranking. A seven-group blind review showed that `open/restricted` is not equivalent to `keep/reject`; no canonical judgments or labels changed. **The offline #108 arm still precedes the provisional shadow run.** Moving a baseline shadow ahead of remaining gate work was proposed but not settled; live R1 is untouched. ⚠️ Run it with `models/.venv/Scripts/python.exe`, not `py -3` — there is no system Python on this machine · **Step 5 untouched and editor-dependent.**

**Post-Step-1c routing over the 416 embedded rows: 205 positive · 160 negative · 27 withheld · 16 Stage 0 · 8 excluded.** Fit set **365**. **The gate-slice eval set is now 104 positive / 61 negative (n=165, 63.0% positive)** — superseding 93/56, and this is the population Step 4c prices the curve on. `EXPECTED_CURRENT_ROUTING_COUNTS` was updated to match, deliberately, on 2026-08-03.

**#108 offline-arm preparation (2026-08-04): inventory and evidence preservation complete; comparison not run.** The fixed-path pre-adjudication Step-4c outputs are sealed under `models/sectioning/eval/sealed/step4c-pre-adjudication-2026-08-03/`, and `R7_AllEvents_Backfill_Inventory_2026-08-03.md` records model-set coverage, source-page artifacts and the global-cap confound. Recipe approval, the frozen comparison/pass-fail contract, embeddings and evaluation remain open. No cached artifact, fit, threshold or live R1 behavior changed.

✅ **THE GATE/RANKER BOUNDARY IS SETTLED FOR V1 (2026-08-02; Decision Log §87).** V1 is decision support: R7 supplies a reversible viability signal, R6 owns relative weekly/click-oriented ranking, the allocator applies final-list constraints, and the editor retains final selection. This is a logical separation of functions, not a permanent commitment to two learned models, and it requires no R7-W6 redesign.

**Evidence boundary:** performance language appears in the editor's reasoning on both sides of the gate question, but the available comments do not establish that the editor holds one decision variable or that prompting cannot separate two. Click-informed KEEP judgments are compatible with plausibly publishable events; click-only permanent rejections require a higher evidential bar because they manufacture suppressive training signal. That asymmetry is a conservative decision rule under §76/§78's loss asymmetry, not an empirical finding that the positive side is uncontaminated.

✅ **Step 1c contract work is COMPLETE (2026-08-03).** Every ELIGIBLE row now carries a canonical section, so all 25 gate-positives route into the section-specific §85 veto. The 9 UNCLEAR rows and the click-only rejections were adjudicated rather than left withheld; r342 alone is held back, as corrupt input rather than as an editorial judgment. Provenance is explicit per row (16 Ariel-adjudicated / 22 editor round-1) in `eval/step1c_reconciliation.json`. The §75 mixed-class diagnostic is likewise resolved — split, not dropped. **Nothing in Step 1c or §75 now blocks Step 4c.**

**Historical §77 routing baseline (2026-07-30; superseded for Step 4c by the post-Step-1c routing above).** At that sitting, the full deck was **211 gate-positive · 142 gate-negative · 69 withheld to R6 · 16 Stage 0 · 12 excluded.** Over the 416 *embedded* rows the fit set was **191 pos / 137 neg = 328 rows** (88 dropped out); the gate-slice eval set was **95 pos / 54 neg.** These figures remain the provenance for the Step-4a diagnostic, not the current Step-4c population.

⚠️ **Historical 2026-07-30 pool-composition measurement — a different denominator from the current Step-4c evaluation set above.** Eligibility on the complete gate slice was **66.8%** (n=184), superseding the 07-26 ~46.5% figure, which counted `outcompeted` rows as ineligible; the corresponding removable rate was **29.9%**, not ~53%. Do not replace this with **63.0% of n=165**: that is the positive share of the current fit-eligible gate-evaluation population, not complete-slice pool eligibility. **The old junk-rejection points (0.95 → 43%, 0.90 → 55%) were computed on the obsolete merged-None target and are SUPERSEDED and non-comparable.** Current Step-4c routing and evaluation counts are stated above; canonical metric history remains in `NA/Vaughan_Metrics_Log.md`.

⚠️ **The positive class has never been audited — the largest open risk in the release.** All 239 rejections were checked against the breadth criterion; **zero of the 211 acceptances were.** The editor's task when he sectioned them was *"which section does this belong in?"*, not *"would you publish this?"*, and three rows say in his own words that a row is correctly sectioned but would never run. 178 of 211 carry no commentary at all. Neither a keyword scan (8 of 211, ~78% precision) nor a published-history control arm (joins on 2 of 211) can find the contamination cheaply. **Consequence: Step 4a's first pass is DIAGNOSTIC — it bounds Fork C and locates label errors, and it cannot set the release bar.** The audit is sourced from the gate's own highest-disagreement rows after that run, not from a designed sample (`Decision_Log` §82). The bar is set on the re-fit afterwards.

⚠️ **The gate slice is too small to price a fine operating point.** 95 positives means keeper recall moves in 1.05-point steps — "0.95" is *keep 90, lose 5*, set by roughly **5 events**. The representative positives split **46 Families / 28 Couples / 21 Golden**, so one event moves section recall by 2.2 / 3.6 / 4.8 points respectively. Step 4c therefore uses a coarse **≥90% observed-recall veto per section**, evaluated in whole-event counts, rather than pretending the percentages are precise. Train and pooled curves are reported for diagnosis but cannot replace the gate slice as the operating population (§85).

**Editor self-agreement, complete-deck measurement: 82.5% on include/None, 75.0% on routing** (40 duplicate-title groups). Routing is *lower* because 6 of the 10 flips are the same event marked includable once and `outcompeted` the other time — either the label working as designed or noise, and nothing separates them. **This is a ceiling on *agreement*, not on quality** — it bounds how closely any model can be expected to match this editor, not how well the gate can serve the business. A stable rule can outperform a noisy human while still "scoring" 80%. What it does bound is measurement: past ~80%, recall gains are fitting label noise, and any editor re-judgment instrument must clear a 15–25% null before its result means anything.

⚠️ **The instrument changed again on 2026-07-28 (§77):** the None-split is now **one 6-option multiselect** (`non-GTA` · `B2B / professional dev` · `civic` · `wrong fit / not our audience` · `outcompeted` · `can't tell`), with `NoneType` deleted and routing derived in code from a written priority order. §75's four-way *taxonomy* still describes how the editor rejects; it is no longer the *form he fills*. A new `Slice` field makes the gate/train split groupable in Airtable for the first time (gate 184 · train 210 · walkthrough 22 · not-in-model-set 40); only the 89 `Section=None` gate rows are representative, so every proportion must be read there rather than pooled across slices.

⚠️ **Stage 0's deletable set has shrunk three times, each time on measurement** — §75 (facts only) → §76 (content rules route to the gate) → §76 amendment (not-English and not-an-event removed). **The direction is the finding:** every time this step is measured it gets smaller. Treat any un-measured Stage-0 sizing as an over-estimate.

**The reframe (validated 3 independent ways, then confirmed by 3 outside LLM reviews):** this is a **top-k selection problem, not a classification problem.** The pipeline ships 5 events/section from ~720 raw candidates/week. The section classifier — the thing W6 spent the release building — **owns only ~3 of ~19 failures.** The filter owns ~12, ranking ~4. The classifier was trained on 1,126 *published* events (all winners); in production it sees raw scraped candidates it has never seen a negative example of, and confidently sections the junk. **The missing stage is a binary include/None gate** — the reject decision the system has never had.

**⚠️ Population correction (2026-07-26, Decision_Log §74 amendment) — the arithmetic this doc used to run on was wrong.** The old snapshot cited a "~2% keep rate / ~98% junk." **That 2% is a *slot* rate, not a junk rate:** 15 published ÷ ~720 in window conflates *ineligible* events with *eligible-but-outcompeted* ones, because 5-per-section is a hard quota. The later **~46.5% pre-split eligibility estimate is now also superseded**: it treated every `Section=None` as ineligible, while the completed split identifies a material `outcompeted` pile that belongs with the gate's positives. Do not quote a replacement until Step 1 QC closes and the metrics log records it. The conclusion only strengthens: ranking is load-bearing inside W6, and §78 resolves the gate as score-and-sort, never delete.

**The scope call (2026-07-25):** W6 pivots from "ship a section classifier ≥0.75" to **build the reject gate + run the classifier suggest-only behind it.** The gate's `P(include)` also serves as the interim ranking score (`final = P(include) × P(section)`), which is why R7 and R6 now feed each other.

**The None-split taxonomy is settled (2026-07-27, Decision_Log §75):** `NoneType` is **four-way** — `Rule-break` (→ Stage 0) · `Wrong fit` (→ the gate) · `Outcompeted` (→ R6's ranker) · `Ambiguous` (excluded). `NeededLink` is retired in favour of free-text `LinkGave` plus live text-first labelling sittings. The **breadth criterion** — an event must appeal *across* communities, not single one out — is adopted as a written editorial rule and evaluated **inside the gate, never in Stage 0** (a religion/nationality regex separates the two cases at only 1.7× and would delete measured keepers). Implementation: `R7_None_Split_Labelling_Plan.md`.

**What the reframe kills (do not resume):**
- **The τ-abstention path is dead.** Confidence cannot do reject work — None vs includable confidence distributions are near-identical (medians 0.52 / 0.57); to abstain on 87% of junk you keep only 27% of keepers. A dedicated binary gate is ~7× more keeper-efficient at the same junk removal.
- **The transfer test / min-class-recall exit table (old §3) is moot** as the release gate. It measured section accuracy on a population that doesn't exist in production. Retired as the headline; kept only as an internal diagnostic. The unresolved 0.61 provenance and τ-calibration fork die with it.

**The live decisions ("forks"):**
- **Fork A — does the gate train on split labels?** ✅ **CLOSED (2026-07-30).** Yes, and the routing is §77's, not §75's: permanent content rejections (`wrong fit` / `B2B / professional dev` / `civic`) are the gate's negatives, `non-GTA` routes to Stage 0, `can't tell` is excluded, and **`outcompeted` is withheld from the gate** — *not* because it is a property of the week (§83 shows that rationale failed on measurement) but because the label is impure and the pile is unseparated. It is held pending Step 1c: 38 model-relevant rows are required, 11 rows outside the current model are optional, and genuinely eligible rows may afterwards become gate-positive while still serving R6 as ranking evidence. All 239 None rows are labelled (gate 89 · train 124 · walkthrough 12 · not-in-model-set 14). ⚠️ Earlier versions of this line called `outcompeted` "gate-positive ranking material," which inverts §77 and inflates the removable rate — see the corrected-arithmetic note in the Status Snapshot.
- **Fork B — threshold gate or *scoring* gate?** ✅ **DISSOLVED by architecture (§78): score and sort, never delete.** The gate deploys into R2 after R1 has already upserted the record, so "do not write it" was never available. Pin 1 is therefore a reporting/alarm commitment, not a kill threshold.
- **Fork C — W6's scope (NEW, OPEN, Ariel's).** Given that a perfect gate removes only the **29.9%** permanently-rejectable share and so still leaves **~505 of ~720** events for 15 slots (the ~335 this line used to quote came from the superseded ~46.5% eligibility figure, and the correction makes the fork *harder*, not easier): keep the gate and change the sign-off bar / expand W6 to include ranking / merge W6 with R6.

**Blocking order for the remaining fork:** Fork C needs the **Step 4c corrected re-fit** to price the recall/junk-rejection curve. Step 4a is deliberately diagnostic, Step 4b repairs the consequential positive-label disagreements it surfaces, and only Step 4c sets the release bar.

**Convergence evidence (why this is de-risked, not a guess):** un-anchored Fable review re-derived the reframe from raw data (never saw our diagnosis); Ariel's independent per-source None-rate read matched it; ChatGPT + a second Claude review independently prescribed the same spine. All three outside reviews: build the gate, don't touch the classifier, retire min-class recall, don't chase Golden.

---

## The pipeline shape (what W6 + R6 build toward)

```
raw ~720/week
  → Step 3  Stage 0: deterministic pre-filter   (geo/date/language/domain; drop foreign Eventbrite)   ← R7-W6
  → Step 4  Stage 1: the GATE  P(include)        (binary; operating point UNSET — Step 4c)             ← R7-W6
  → Stage 2: section classifier (untouched) on survivors → P(section)                                  ← R7 (exists)
  → Stage 3: rank by  P(include) × P(section)     (cheap interim ranker; BT upgrade belongs to R6)     ← R6
  → Stage 4: buildIssues allocator fills 5/section under quota + thin-section flag                      ← R6
  → editor reviews ~24, accept/reject/move writes back as next round's labels
```

W6 delivers Steps 3–4 (the gate) and hands R6 a sectioned, gated pool. R6 owns Stages 3–4.

---

## WEEK 1 — R7-W6: build the gate

### Step 0 — Cleanup (fold in before building; ~1h)

**What it's for:** three doc errors an outside review caught, plus one corpus fix, so the build runs on correct facts.

- **Golden is 367 training examples, not 18–21.** (1,126 = 376 Fam / 383 Coup / 367 Gold; 18–21 is the *transfer-slice* count.) So "Golden weak from too few training examples" is FALSE — it's transfer slice-noise + genuine C/G editorial softness. Fix everywhere it appears.
- **Section is partly contextual (issue-packing).** 8 titles were published in different sections in different weeks — the same farmers market under all three. A per-event section classifier has a hard ceiling; this is why C/G is Case B (genuine overlap), not a curve a fancier model traces.
- ~~**Capture the demo rulings.**~~ **DISSOLVED (2026-07-26) — they were never lost.** The rulings are in Airtable as `Batch = "5 - Live Demo (30)"`, 29 of 30 carrying a `Section`; only the local `live_demo_30_seed23.json` mirror is empty. This is a one-command export (`scripts/readLiveDemoRulings.js`), not an editor re-ask. No editor time, no cost.
- ~~**Dedup the corpus at fit.**~~ **SUPERSEDED (2026-07-26) — use grouped CV, not deletion.** Title-only dedup removes 98 rows, but most are legitimately *recurring* programs (a farmers market ×6, chair yoga ×5) concentrated in Golden — **repeat publication is signal, not a data artifact**, and deleting it would strip the weakest class. The leakage concern is real; the correct fix is **URL/title-grouped CV folds** so no group straddles train and test. **PinotsPalette ×19 remains deletable for a different reason** — it is a sponsor ad, not an event.

**Done when:** the two live errors (Golden-367, section-is-contextual) are corrected in this doc + `logs/R7_Log.md`; grouped CV is the fit's default splitter.

### Step 1a — The None-split (✅ CLOSED 2026-07-30; two live sittings)

**What it's for:** the single highest-information-per-minute move on the board. Splits the **239** None so the gate trains on the right negatives. Full plan: `R7_None_Split_Labelling_Plan.md`.

- **Current instrument (§77):** one six-option `NoneReason` multiselect. Routing is derived from all ticks in a written priority order; the editor does not choose an architectural destination.
- **Live, text-first sittings**, not solo async work. `NeededLink` is retired; free-text `LinkGave` records what the link added.
- **Status: 239 of 239 done** (gate 89 · train 124 · walkthrough 12 · not-in-model-set 14), across two live sittings on 07-29 and 07-30. The first 12 were the **pilot** — the instrument was respecced at row 12 rather than never, and those rows were remapped by confirm rather than redo. Verify any time with `node scripts/auditR7Labels.js`.
- ⚠️ **Labelling is closed; the positive class is not validated.** All 239 rejections were checked against the breadth criterion; **zero of the 211 acceptances were.** Step 4a locates the consequential disagreements and Step 4b audits them — see the Status Snapshot and `Decision_Log` §82.
- **Interpret:** mostly Wrong fit → the gate is the win. Mostly Outcompeted → filtering buys little and the problem is preference-ranking (weight moves to R6). *Pilot signal, n=11, not to be trusted as a rate:* Rule-break 3 / Wrong fit 6 / Outcompeted 1.

**Done when:** all 239 `Section=None` rows carry at least one reason tick. Label completion does not imply target purity; Steps 1b–1c own that repair.

### Step 1b — Implement the §77 routing contract (~30 min)

**What it's for:** turn editor-authored reason ticks into the gate target without silently changing the question. For `Section=None` rows, precedence is `non-GTA` → Stage 0 · `can't tell` → excluded · permanent content reason (`wrong fit` / `B2B / professional dev` / `civic`) → gate-negative · `outcompeted` alone → withheld pending relabelling. `Outcompeted` is evaluated last so a permanent-reason double-tick fails safe into the gate rather than escaping it. Existing section labels route gate-positive.

- Define one canonical routing contract and apply it consistently in `scripts/auditR7Labels.js` and `models/sectioning/gate_step4a.py`; do not leave two independently interpreted mappings.
- Assert the **pre-relabel 416-row baseline**: 191 gate-positive · 137 gate-negative · 64 withheld · 16 Stage 0 · 8 excluded. Step 1c is expected to change these counts, so any update must be explicit rather than silent.
- The label → target mapping is a **design decision** — it changes the model's numbers and its conclusions, so it is settled deliberately and asserted in code. The consumer wiring around it is not a design decision and follows mechanically.

**Done when:** the contract passes precedence cases and the pre-relabel count assertion; `auditR7Labels.js` reports the §77-correct target/conflict counts; `gate_step4a.py` no longer builds a merged include/None target; and its stale header no longer says 12 of 239 are done. **Blocks Step 4a.**

### Step 1c — Relabel the impure `outcompeted` pile (one editor sitting)

**What it's for:** separate permanent eligibility from weekly competition before the gate learns from the label. Run blind from `R7_Outcompeted_Relabel_Sheet_49.md`, using the quiet-week counterfactual and applying the relabelling contract only after each answer is recorded.

**Where the numbers come from (69 → 49 → 38):** **69** `outcompeted` rows were withheld across the full deck by §77's routing → **20** were already reviewed in the 2026-07-30 blind validation sitting (the one that established the label is impure, §83) → **49** remain on the relabel sheet → **38** of those affect the current model set, and the other **11** are optional consistency cleanup. Quote whichever number the context calls for, but say which.

- **Required for the current model:** Section A's 38 rows (17 gate slice · 21 train slice).
- **Optional deck cleanup:** Section B's 11 rows (6 walkthrough · 5 not in model set). They improve deck consistency but do not enter the current fit or gate evaluation; stop before them if editor fatigue threatens judgment quality.
- Truly eligible rows become gate-positive only when they carry an authored section whose provenance and evaluation treatment are settled; otherwise they remain withheld. Once that contract is satisfied, eligible rows remain useful to R6 as ranking evidence; permanent audience/content rejections become gate-negative; unclear rows are excluded. **r220 remains withheld** pending §81 language adjudication.

**Done when:** all 38 model-relevant rows are re-decided blind; resolved outcomes are applied under the settled provenance contract; every eligible row either carries an authored section or is explicitly preserved as withheld; and post-relabel routing counts change only as those decisions predict. Section B's 11 are explicitly optional and do not block R7.

⚠️ **This step does NOT block Step 4a** *(corrected 2026-07-31)*. The withheld `outcompeted` rows are **excluded from 4a's fit set**, not fitted incorrectly — 4a runs on 191 positive / 137 negative either way, and relabelling only ever *adds* rows afterward. §82 specifies the diagnostic runs on current labels, so gating 4a behind an editor sitting would both contradict that decision and put a human dependency in front of the one step that needs none. **1c blocks Step 4c**, which is where the corrected labels are actually consumed.

### Step 2 — ~~Experiment B: the centroid baseline~~ **CUT (2026-07-28)**

**Decision: cut, not re-pointed.** Re-pointing meant ranking within the labelled deck against the editor's own includable/None calls — which is exactly what **Step 4a's threshold sweep already does.** It would be a duplicate measurement. Nothing downstream consumes it: Fork B is now a W6-internal architecture question, not the cheap-vs-BT-ranker question this step was built to answer. *(Original blocking rationale preserved below for the record.)*


**Why it's blocked (2026-07-26):** recall@30 has **no valid denominator.** Only 0–6 of each issue's ~20 published events exist in the candidate pool at all (**3.1% corpus-wide overlap**), so the denominator is ~2, not 15. This is the same dead URL-join assumption that §62 killed on 2026-07-12, in a new costume — reconstructing "the ~720 candidates that week" and "the 15 published that week" as the same population is exactly what the data says we cannot do.

**Do not run it as written.** Two live options, **neither chosen — Ariel's call:**
- **Re-point** at a population where the join is real (e.g. rank *within the labelled deck* and measure against the editor's own includable/None calls), accepting that it is a weaker proxy for production ranking.
- **Cut it.** Fork B is now a W6-internal architecture question (threshold vs scoring gate), not the cheap-vs-BT-ranker question this step was built to answer — so its original consumer no longer exists.

**Not a blocker either way:** it never blocked the gate, and Fork B is now priced by the Step 4a diagnostic plus the corrected Step 4c re-fit instead.

### Step 3 — Build Stage 0: deterministic pre-filter (~1 day, no ML)

**What it's for:** kill the provably-dead junk cheaply, before the gate. **Rules for facts, never content keywords** (a "no B2B words" list doesn't scale; provenance rules do — small closed vocabularies, near-zero maintenance).

- **Domain rule — an ALLOWLIST, not a blocklist** *(revised 2026-07-28 on measurement; n=624 Eventbrite/forms.gle Candidates, Airtable URL scan)*. Keep `eventbrite.ca` (432) and `eventbrite.com` (154); **drop every other Eventbrite TLD — 38 records.** The previously-written "59 foreign domains (.de/.fr/.co.uk/.sg)" list catches only 29 and **misses nine** on `.nl`/`.be`/`.com.au`/`.at`/`.ch`. Same lesson as #109: enumerate the fact, not the instances. ⚠️ **Never extend to `eventbrite.com`** — 20.6% includable (7 of 34), so folding it in kills 7 keepers.
  - **`forms.gle` REMOVED from the rule** *(2026-07-28)*. The single pool record is **"Historic Unionville Walking Tour"** — a Google Form is a *registration mechanism* small local organizers use, not a geography or content signal. Blocking it is a category error.
  - **Online events do not rescue the foreign TLDs** — checked, since the editor sometimes includes online. The `.fr`/`.de` rows *are* largely online ("Happy WEEM en ligne", "Webinaire de mai", a CMS talk) but are French/German B2B-prof-dev. They fail on language and content independently.
- **Date-window: already exists** — R1's `DateWindow` node (`DAYS_AHEAD = 30`; drops past, invalid, and too-far). **Field completeness: already exists** — `_valid = title && isoDate && eventUrl` → `Validity Filter`. Neither is new W6 work.
- **Language detection — DROPPED from Stage 0** *(2026-07-28)*. Whether readers can use a non-English listing is a **content** judgment, not a record fact (§76): the pool holds `Photography 101 攝影基礎班` at a Richmond Hill church — a legitimate local event. Routed to the gate; the wording is a TBD-from-editor question in `R7_None_Split_Labelling_Plan.md`.
- **Is-it-an-event — DROPPED from Stage 0** *(2026-07-28)*. Low yield, not deterministically decidable.
- **Cancellation — DEFERRED** *(2026-07-28, `Future` milestone)*. Only AllEvents exposes it, and a filter covering ~40% of sources invites trust it hasn't earned. The editor reviews manually and opens links by habit. Revisit if it is ever observed to ship.
- **Typed reason codes (`MISSING_TITLE`/`MISSING_LINK`/`MISSING_DATE`/`INVALID_DATE`/`OUT_OF_WINDOW`) — BUILT, THEN DESTROYED.** They wrote `data/tracking/ingestion_rejections.jsonl`, read by `scripts/rejectionCheck.js` inside `postRunChecks.js`. The code lived **only in the live n8n instance and was never committed** (`git log -S "OUT_OF_WINDOW" --all` on the workflow is empty); the 2026-07-27 repo→live re-import overwrote it. Last write 07-24; run 518 on 07-27 wrote nothing. **Re-authoring into the repo file is W7 deploy work.**
- **Source stays a feature, not a delete button** — do NOT drop sources by junk *rate*. allevents.in is 56% junk but supplies ~300 keepers/year; the gate handles its junk per-event. Delete only provably-100%-junk sources. ⚠️ **Both numbers are STALE-BY-CONSTRUCTION** — they were measured on text missing ~74% of AllEvents descriptions (#108) *and* before the #109 geo guard removed 12.9% of AllEvents ingestion. Directionally fine, not re-derived; do not quote as a bar.
- **✅ Geo hole CLOSED 2026-07-27 (#109) — and it was 5× bigger than the deck showed.** AllEvents' `richmond-hill` slug conflates **Richmond Hill Ontario with Richmond Hill GEORGIA and Richmond Hill NEW YORK**; `CITY_MAP` passed all three because the city name is genuinely correct. Deck detection found 10 rows; **a live API pull found 51 of 396 (12.9%)** — deck detection was incomplete because it inferred geography from description text. **Fixed in all three `AllEvents Normalize*` nodes** of `workflows/NLAP R1.json`: `venue.full_address` (blank on **0 of 390** live records) is now tested for positive foreign evidence, never for a missing address. Verified against live data — 51 dropped (50 Richmond Hill GA/NY, 1 Markham **Illinois**), 0 false drops. **Still open:** an **n8n re-import** (the repo is fixed, the running instance is not), and **deck re-detection via `full_address`** — deck detection inferred geography from description text and is known-incomplete, so the 10 is a floor. ⚠️ The 3 rows carrying a positive editor label were previously called *"label noise in the gate's positive class"* — **retracted 2026-07-27, see Decision_Log §76 corollary.** They keep both labels: post-#109 a foreign event never reaches the gate, so the gate is never asked the geography question. The direction that actually matters is foreign rows in the gate's ***negative*** pile, which must be tagged `Rule-break` (→ Stage 0), never `Wrong fit` (→ the gate).

**Done when:** the Eventbrite TLD allowlist ships. That is the whole of Step 3's remaining new work — date-window and completeness already exist, geography shipped as #109, language/is-it-an-event/cancellation are out of scope, and reason-code restoration is W7. **Revised 2026-07-28: this step is far smaller than originally written.**

### Step 4 — Build Stage 1: the gate (~1–2 days)

**What it's for:** the one new model. Binary `P(include | event)` — the reject decision.

**Steps 4, 4a and 4c are one script:** `models/sectioning/gate_step4a.py`. Plumbing and authored core are split at the `===== EVAL =====` banner; Step 4a is the diagnostic run and Step 4c reruns the same fit/sweep after Step 4b repairs labels.

- **Representation:** the embeddings you already have (`voyage-4-large` @2048d, §71/§73 — TF-IDF killed, §67). Same vectors the classifier uses → zero marginal cost.
- **Model:** binary logistic regression. Features = embedding + one-hot source + has-category-tags + description length. Fable's text-only floor was **AUC 0.823** on the 416; source + more labels likely pushes it to ~0.87+.
- **Trained on:** the Step-1 four-way split — **`Wrong fit` = negatives**, includables = positives. `Outcompeted` is **withheld pending §83's relabelling because the current label is impure** — genuinely eligible rows may re-enter as positives; `Rule-break` belongs to Stage 0; `Ambiguous` is excluded. *Not* the merged None.
- **Operating point: UNSET — see Step 4c. Do not treat 0.98 as settled.** The ≥0.98 keeper-recall figure entered this doc unpriced and **has no measurement behind it**; the fresh-lens review prescribed **0.95** (`fresh_lens_review_2026-07-24.md:75`). ⚠️ **The two previously-quoted curve points — 0.95 → 43% junk rejection, 0.90 → 55% — are SUPERSEDED and non-comparable.** They were measured on the obsolete merged-None target and cannot serve as anchors for anything. **Step 4a produces a diagnostic curve; Step 4c reports the corrected curve in event counts and sets the bar with no preset recall target.** With ~211 positives, a 0.98 threshold is set by roughly 4 events. The dial is still recall, because a **killed keeper is invisible and unrecoverable** while surviving junk just loses in ranking — but *which* recall is an open number, and 0.98 was chosen against an assumed **scarcity** of keepers that does not exist at ~505 of ~720 per window. What recall must still guard is **bias, not volume**: losing 67 events at random is survivable, losing 67 that are all Golden Age library programs is not. **Settled 2026-07-31 (§85): that guard is a per-section *veto* on ONE global threshold — never per-section thresholds.** A candidate global threshold survives only if every section retains ≥90% observed recall on the gate slice, expressed in whole-event counts (4 / 2 / 2 on the pre-repair 46 / 28 / 21 split). Earlier drafts of this line argued for "a per-section floor rather than one global number"; that reading is superseded — the floor vetoes the global number, it does not replace it.
- Output a **calibrated probability** (needed to set the recall threshold, and to serve as the ranking score). Calibration check before trusting the threshold.
- **Grow labels for free:** every weekly editor review writes back ~30–50 labels → ~800 rows by September with no dedicated labeling session.

**Done when:** the gate scores the raw pool, hits the Step-4c operating point on **grouped** CV (no leak), reports rejection rate by source, and outputs a calibrated `P(include)` per event.

**Also report here — the trigger that un-parks the breadth flag (§75).** §75 parked the religion/nationality flag on the theory that the *embedding* carries breadth semantically where a regex cannot. That theory has never been tested, and nothing in the workflow was scheduled to test it. **Report the single-community stratum** (the ~30 rows the §75 regex identifies, used here as a diagnostic slice, never as a feature).

⚠️ **CORRECTED 2026-08-02 (Codex review) — the aggregate reading originally written here is INVALID and must not be executed.** This paragraph used to say: *"if those events systematically survive the gate, the embedding is not carrying breadth; if they are rejected at the base rate or better, the flag stays parked."* **The stratum is mixed-class by construction** — the regex flags 10 includables and 20 Nones (§75's own measurement), so *Italian Festival* and *Shabbat Korach* are both in it. A pooled survival rate therefore confounds two opposite successes: keepers correctly surviving and rejects correctly failing. It cannot distinguish "the embedding is not catching single-community rejects" from "the keepers in this stratum survived, as they should."

**The stratum needs two numbers, not one:** **keyword-positive recall** (of the flagged rows the editor kept, what share survive the cutoff — should be high) and **keyword-negative rejection** (of the flagged rows the editor rejected, what share fall below it — compared against the slice's base negative-rejection rate). Only the second is the un-park test. ✅ **RESOLVED 2026-08-03 — SPLIT, not dropped.** Both metrics ship in `stratum_report()`; the pooled `survival_rate` is deleted and an import-time regression case pins it out (a perfectly-behaving stratum pools to 33.3%, which is why one number could never be read). `SINGLE_COMMUNITY_PATTERN` stays frozen and diagnostic-only — never a feature, never a filter.

✅ `stratum_report()` no longer returns a pooled `survival_rate` — it was removed 2026-08-03 and cannot be reintroduced silently: the fixture asserted at import fails if the two cells are collapsed. The function now reports `keyword_positive_recall` and `keyword_negative_rejection` with whole-event counts beside every percentage, plus the signed gap against the slice's own negative-rejection rate. The B2B / prof-dev stratum was never affected in the same way — being defined by the editor's own §77 reason tick it is ~all-negative by construction, so its pooled rate was already a negative-rejection rate; it reports through the same function with an `n/a` positive cell.

**Same diagnostic, second stratum (added 2026-07-27).** Report gate recall on the **prof-dev / B2B stratum** as well — the rows §76 routes to the gate as content judgments. Identical logic, identical cost, one more line: if those rows systematically score **low** `P(include)`, the embedding carries the rule and no hand-crafted flag column is warranted; if they **survive**, a column earns its place. This is the cleaner of the two tests, because Ariel's 2026-07-27 ruling makes the rule crisp — adjacency to B2B or prof-dev is *always* a rejection, no case-by-case — so a survival result isolates the representation rather than the rule. Breadth, by contrast, is fuzzy on both sides. **General principle this encodes: with a strong representation, test whether it already carries the signal before hand-crafting a feature for it.** The aux columns are already staged and row-aligned in `gate_step4a.py` — this is a selection, not an implementation.

### Step 4a — Diagnostic fit and recall / junk-rejection sweep (~1h, cached data)

**What it's for:** bound whether the simple gate has useful signal and locate consequential errors in the unaudited positive class. This run is deliberately **diagnostic-only** (§82): it does not set the release bar. No new spend; labels and embeddings are cached.

**Preconditions — ✅ all three discharged 2026-07-31 when Step 1b closed:**

- [x] Point `CURRENT_PULL` at the current name-keyed label pull and join it correctly. *(Now chosen by sorted glob, with a hard `SystemExit` if any required field name is absent from every record.)*
- [x] Replace the merged include/None target with the asserted §77 routing contract. *(`route_s77()`, 12 precedence assertions at import against the shared `routing_s77_cases.json` fixture.)*
- [x] Replace the stale header banner that says the split is 12 of 239 done and state the diagnostic provenance accurately. *(Provenance is now derived from `STEP`, so 4a and 4c cannot wear each other's stamp.)*

- Sweep the threshold across the full range and plot **keeper recall vs junk rejection**, reporting the curve **in event counts** and with **no preset recall target**. ⚠️ The old anchors (0.95→43%, 0.90→55%) were measured on the obsolete merged-None target and are **superseded and non-comparable** — do not plot them alongside the corrected curve.
- Report **per-section** keeper recall at each point, not just the global number — the failure that matters is a class going dark, not a random loss.
- Report how many *events* separate 0.95 from 0.98, so the cost of the last three points is visible rather than assumed.

**Done when:** an out-of-fold diagnostic curve exists in event counts, per-section keeper recall is reported, and the highest-disagreement gate-positive rows are exported for Step 4b. No operating point is chosen from this run.

### Step 4b — Audit the positive-class disagreement set (one editor sitting)

**What it's for:** repair—not estimate—the unaudited positive class. Review Step 4a's highest-disagreement gate-positive rows using the rule question **“is there a permanent reason you would never run this?”**, not the preference question “would you run this?” The set is deliberately enriched for suspected errors and therefore cannot estimate contamination across all 211 positives.

**Status (2026-08-01):** the blind sitting is complete at **19 KEEP / 11 NEVER / 0 unresolved** across all 30 selected rows. The sheet preserves the editor's wording. Reconciliation against the sealed answer key and the resulting label writes are still pending (#121), so the step is not closed.

**Done when:** every selected disagreement row is re-judged, resulting label corrections are applied, and no selected row remains unresolved before re-fit. The number or percentage that survives re-judgment is **not** a pass/fail statistic.

### Step 4c — Corrected re-fit that sets the bar

**What it's for:** rerun the same fit and sweep after Steps 1c and 4b repair the labels, then choose the operating point from the corrected curve rather than the diagnostic one.

- **Model configuration is frozen:** embeddings-only logistic regression, `C=1.0`. The Step-4a grid remains sensitivity evidence only; no release-time tuning. Revisit tuning only on genuinely new data.
- Repeat Step 4a's event-count curve, calibration check and grouped-CV read. Report **gate, train and pooled separately** (walkthrough remains display-only at n=15). The representative **gate slice alone governs** the operating point; material disagreement triggers investigation of sampling, source, section or label composition, never denominator switching.
- Use **one global threshold**, with no per-section thresholds. A candidate threshold survives only if every section retains **≥90% observed recall** on the gate slice. Express the veto in whole-event counts and recompute those limits after relabelling changes the denominators; on the pre-repair 46 / 28 / 21 split the maximum below-cutoff counts are 4 / 2 / 2.
- Among thresholds that survive the section veto, carry the one rejecting the most known junk into the dry run. There is **no invented minimum junk-rejection percentage**: the shadow dry run's swaps and editor time decide operational value. Rows below the reporting cutoff are demoted, never deleted (§78).
- **Fresh-set readiness check:** export a fresh, untouched 30-event disagreement set after 4b's corrections. **0–5 consequential target/destination flips:** apply them and proceed. **6+:** repair them and run a second targeted batch. **A second batch also at 6+:** stop targeted sampling and audit the remaining positive class. Any newly systematic failure mechanism pauses progression for investigation regardless of count.
- Report the 4a→4c curve movement descriptively only. Label repair changes the target and denominators, so curve movement is not a clean escalation statistic and carries no numeric trigger.
- If the dry run fails, localize the failure to gate, sectioning or ranking from the swap positions. Do not tune `C` opportunistically against the one issue; a changed system requires another validation run.

- **Report both committed stratum diagnostics at the chosen point** (carried forward from Step 4, where they have sat unexecuted since 07-27): the **single-community stratum** (§75's breadth check — ✅ **split into `keyword_positive_recall` and `keyword_negative_rejection` on 2026-08-03; the invalid pooled reading is removed. Per Decision Log §88, this is exploratory: report counts, percentages and gaps, print no automatic verdict, and do not let it alter operating-point selection**) and the **prof-dev / B2B stratum** (§76's content-judgment rows). Both are live in `gate_step4a.py` via `stratum_report()`. The B2B stratum is defined by the editor's own §77 reason tick, so it carries no invented vocabulary; the single-community stratum's `SINGLE_COMMUNITY_PATTERN` is **populated as of 2026-08-02 (#120 closed)** with the **original** §75 pattern recovered verbatim — reproducing all three recorded counts exactly (10/182 · 20/214 · 112/1805). It is **frozen: reuse, never reconstruct or improve** (§86), because rewriting the vocabulary would silently redefine the stratum and make the result unable to speak to §75's claim.

**Done when:** the fresh-set readiness rule permits progression, the corrected gate/train/pooled curves and calibration read are reported, both stratum diagnostics are reported at the chosen point, the best gate-slice point satisfying the ≥90%-per-section veto is recorded in whole-event counts, and that point is handed to Step 5.

**Implementation state (2026-08-02):** the rules above are implemented and guarded in `models/sectioning/gate_step4a.py` — `section_safe_point()` searches all unique thresholds (not the six display rows), the fresh set excludes every CV group Step 4b audited, exports are step-specific so 4c cannot overwrite 4a, and `STEP = "4c"` verifies its preconditions behaviourally before fitting. **Step 4c's numerical run is COMPLETE (2026-08-03) at provisional operating point 0.4530** — see the Status Snapshot for the figures. It is **not closed**: the fresh-30 readiness audit and four Ariel adjudications (r269, r288, r341/r97, r70) remain, the offline #108 arm precedes the provisional shadow, and live R1 is untouched. **Updated 2026-08-04: #123 records 0/14 audience-narrowness negatives rejected and 25/25 flagged cultural/religious or age/family positives surviving at the cutoff. This is a cutoff diagnostic, not proof of a representation gap; the feature-versus-label-versus-ranking interpretation remains unresolved.** All preconditions listed below are now resolved:

- **Step 4b is COMPLETE** (19 KEEP / 11 NEVER / 0 unresolved). All 11 NEVER rows now carry an editor-chosen §77 permanent reason, the Airtable writes were applied and refetch-verified, and `eval/step4b_reconciliation.json` records the audited groups, verdicts, record ids and post-write routing counts.
- **`SINGLE_COMMUNITY_PATTERN` is SET** — #120 closed 2026-08-02, original §75 pattern recovered verbatim and verified against all three recorded counts. Frozen per §86.
- **#122 is CLOSED** — the suspected cross-event `DescriptionRaw` contamination does not exist. A full 456-row scan found exactly two shared description strings, both one organizer running one program at two venues; r100's police text is its own organizer's copy (York Regional Police runs the event). No provenance repair and no pre-fit identity assertion are warranted.
- ✅ **Step 1c is CLOSED and no longer blocking (2026-08-03).** Round 1 (14 / 15 / 9) was reconciled and applied: 25 gate-positive with canonical sections, 12 gate-negative, r342 withheld as corrupt input. Round 2 was cancelled without being issued. 37 Airtable rows written and refetch-verified; `eval/step1c_reconciliation.json` records per-row provenance (16 Ariel / 22 editor).
- ✅ **The §75 stratum diagnostic is RESOLVED (2026-08-03) — split, not dropped.** `keyword_positive_recall` and `keyword_negative_rejection` are reported separately, the invalid pooled rate is gone, and a regression fixture asserted at import prevents its return.
- The gate refuses to run without `eval/step4b_reconciliation.json`, and additionally refuses if the §77 routing counts still equal the pre-repair baseline — belt-and-braces evidence that the 11 NEVER corrections were actually applied rather than merely recorded.

### Step 5 — Validate: the one-week dry run (the real go/no-go)

**What it's for:** the only number the business cares about, measured end-to-end on one real issue before committing.

**External dependency:** this step requires editor time for a real-issue review. It cannot be scheduled or completed by the build work alone.

- Take one real issue window. Run Stage 0 → gate → classifier (suggest-only) → rank by `P(include) × P(section)`. Hand the editor **top-8 per section**. Count swaps against the **≤2–3** bar.
- If swaps ≥8, the swap *positions* localize the failure (gate vs section vs rank), so you fix the right stage.

**Done when:** dry run scores ≤2–3 swaps of the 15 slots, editor review under ~15 min. That is the W6 sign-off.

---

## Metrics — retire the old bar

**Retired:** min per-class recall ≥ 0.75. It measured section accuracy on a population that doesn't exist in production; for C/G it sat at/below the ~89% human self-consistency ceiling anyway. Kept only as an internal diagnostic.

**New:**
- **Gate operating policy (pre-registered 2026-07-31; §85):** one global reporting threshold, chosen on the representative gate slice to maximize known-junk rejection subject to **≥90% observed recall in every section**. Report gate, train and pooled separately; only gate governs. The floor is a coarse dry-run-readiness veto, expressed in whole-event counts, not a population guarantee. ⚠️ **0.98 and the former 0.95 → 43% / 0.90 → 55% points remain superseded** — they were measured on the obsolete merged-None target.
- **Product: editor swaps ≤ 2–3 of the 15 shipped slots, approve in < 15 min** — measurable every week for free from the review loop. ⚠️ **UNMEASURED as a bar.** No swap count has ever been recorded; 2–3 is a target someone wrote down, not a baseline anyone observed. It is also the bar Fork C questions (a perfect gate still leaves **~505 of ~720** for 15 slots, so a swap count measures the ranker as much as the gate). Capture a *current* swap count on one real issue before treating this as pass/fail.
- ~~**Recall@30**~~ — **removed. Step 2 has no valid denominator** (3.1% pool/published overlap); it is not a live metric until the step is re-pointed or cut.

**Standing caution (meta, 2026-07-26; extended 2026-07-27):** four load-bearing numbers in this release entered documents with no measurement behind them — the 2% keep rate, min-class 0.75, the 0.98 recall bar, and recall@30's denominator. That is **one pattern, not four mistakes**, and it is the only one still live. Any number that enters this doc as a *bar* names its measurement or is marked UNMEASURED.

**The convention that enforces it (adopted 2026-07-27):**
1. **Every number carries its provenance inline** — `(n=X, measured YYYY-MM-DD, how)`. A number without that tag may be quoted as context, never as a bar.
2. **Before a number sizes a solution, ask: is this a fact about the world, or a fact about my instrument?** Every failure so far was the latter read as the former, and the check costs ten seconds:

   | The number | Read as | Actually an artifact of |
   |---|---|---|
   | 2% keep rate | the pool is junk | the 5-per-section **quota** |
   | ~40% no prose | the data doesn't exist | **which endpoint** we call (#108) |
   | 30.9% block include rate | those events are worse | **our feature vector** |
   | 10 Georgia rows | the leak is small | **detecting via description text** (real: 51/396, #109) |
   | 0.98 keeper recall | a measured bar | nothing — never measured |

3. **Name which claim you are making: "the editor was wrong" vs "the model cannot see it."** Different bugs, different fixes (relabel vs add a feature). This was conflated three separate times on 2026-07-27. The tell: **if the editor had the link, it is a feature bug, not a label bug.**

---

## R7-W6 Sign-off gate

W6 is done when:
1. The gate ships **at the operating point chosen in Step 4c** (a priced point on a measured, post-audit curve — *not* a number carried over from this doc's history) with a calibrated `P(include)`.
2. It sections the fresh pool (survivors → classifier) — the artifact R6 consumes.
3. The one-week dry run clears ≤2–3 swaps. **⚠️ This bar is itself in question — see Fork C**; a perfect gate still leaves **~505 of ~720** events for 15 slots, so a swap count measures the ranker as much as the gate.
4. Fork A is executed (Step 1 complete, 239 rows split four ways) and **Fork C is resolved from the Step-4c corrected result — not the Step-4a diagnostic**, its outcome recorded. (Fork B is already dissolved by §78.) Step 4a is diagnostic by construction: it runs on unaudited positive labels and cannot price the removable share Fork C turns on.
5. Decision_Log entry logged (the reframe + scope pivot; supersedes the min-class exit table in §72).

**Deferred to R6 (Week 2), not W6:**
- The ranker (cheap interim ships with the gate; BT upgrade gated on Step 2 / Fork B).
- The **flex-flag** — cheap, read the margin off the existing softmax (no rebuild; §Appendix confirms softmax margin is sufficient). The allocator consumes it. Low value in total failures (classifier owns ~3 of 19) but the correct response to the C/G Case-B overlap.
- **buildIssues integration** (~1–2 days): re-wire the existing allocator to consume gate + section + rank scores. It exists; it needs adapting, not rebuilding.

**Deferred to R7-W7 (unchanged, has no consumer today):** live deploy into n8n/R2; frozen eval set + model versioning (#101); per-item GitHub issues (open at W7).

---

## Appendix — Settled design (carried forward; re-litigate only with new data)

*These held through the reframe and still stand. Preserved from the pre-reframe §2.*

**Class set = 3-class (Families / Couples / Golden), train on 1,126** *(§62).* Local Aroma enters via a separate intake absent from the scraped pool — the classifier never sees it in production and must never output it. (1,126 = 376+383+367; the 380 Local Aroma events dropped.)

**Two-stage: include/reject filter + section classifier; the classifier's gate is section accuracy over includable events** *(2026-07-19, §66).* "None" is ~6 distinct mechanisms, 12/13 event-based (text, not listing). The reject stage is real work, the stage the editor finds hard, and nothing in R1/R2 implements it (`isBusinessy` dead, #94). **This is exactly the gate W6 now builds** — the reframe operationalized §66.

**Representation = `voyage-4-large` @2048d; TF-IDF and `text-embedding-3-small` killed** *(§67, §71; provider swapped to Voyage §73 — availability not quality, performance-neutral).* TF-IDF perceives only 5.9% of the production token space (min-class coverage 68.2% < 70% kill). Embeddings close it (no OOV — every string produces a vector). Stack = frozen generic embedder + a small per-client trained logistic head scored in Node from a JSON artifact → client #2 is a labels-only retrain (§68/§71).

**C/G boundary is genuinely fuzzy (Case B — genuine overlap, not a traceable curve) → flex-flag spans R7→R6** *(§64).* Editor self-consistency ~80% on C/G; 8 titles cross-published. No classifier (linear, non-linear, or LLM) fixes a boundary the human flip-flops on — the ceiling is label noise (~89%). Ambiguity is quantified by the softmax **margin** (small = hard); low-margin C/G events get a flex flag emitted by R7, and R6/the allocator resolves them by filling whichever section is short that week. R7 emits, R6 consumes. PinotsPalette (16 C / 17 G / 0 Families) absorbed for free.

**Feature recipe = serve-time text: `title + clean(DescriptionRaw)`** *(§70).* SourceCategories excluded by default (re-enters only via ablation). Source-prior and deterministic-source routing killed by the editor's "every source varies" rulings (§63). **Open (Ariel, decide by CV):** does the source slug become a *feature* for the gate (VPL ~90% not-Couples, PinotsPalette 0/33 Families are real per-source signal) — watch per-class confusion for the source-as-shortcut risk. Invariant: **score-time recipe == serve-time recipe.**

**Missingness (measured, post-R5):** description dropout ~47%, but true signal-dead (no desc AND no cats) only ~15% — concentrated in title-only single-venue sources (PinotsPalette 100%, RichmondHill 95%, Facebook 81%). ⚠️ **The ~47% describes what we FETCH, not what EXISTS** (measured pre-#108). On the label deck the same gap is 42.3% → **14.8%** once AllEvents detail pages are read. Still true of the corpus as it stands today; **wrong the moment R1 fetches descriptions**, which is open decision #1. Re-measure then rather than editing this line now. Include description *with* dropout so the model survives the ~half of production that lacks it.

**Blind-pass catches (in scope regardless of architecture):**
- **Self-reinforcing `NoSection` drift** — a wrong section is visible (editor moves it); a silently-dropped event never appears, never gets corrected, and retraining on published survivors narrows the newsletter irreversibly. Mitigation: never hard-drop; weekly reject-rate alarm; one-click editor rescue. **Directly relevant to the gate — the keeper-recall floor is this catch made quantitative, and it is now set: ≥90% observed recall in EVERY section on the gate slice, as a veto on one global threshold (§85), expressed in whole-event counts (4 / 2 / 2 on the pre-repair 46 / 28 / 21 split). Per-section rather than global precisely because this catch is about a *class* going dark, not about average loss.**
- **Calibration tripwire** — if editor-override inside the auto-accept band > ~10%, auto-downgrade to suggest-only until retrained.

**Corpus freeze (07-15):** `published_titles.json` 1,126 rows (376/383/367); `raw_candidate_titles.json` 1,805 unique. Frozen once into serve-time text — do not re-stage mid-analysis (but dedup at fit, Step 0).

**Still-live leads (re-derive before acting):**
- Source field is display-only — **read the URL** (#92): blank on ~19%; URL coverage ≈ 99.9%.
- Raw corpus must NOT be rebalanced — it's a test set; its job is to resemble production (AllEvents *is* ~40% of production).
- ~28 Jan-2025 rows labeled before Golden Age existed (launched 2025-02) — test dropping pre-2025-02 rows in CV rather than assuming.
- The 5/5/5 per-issue balance is a QUOTA, not preference — don't read 376/383/367 as the incoming pool's real mix.
- **#105** — weak-class (Golden) improvement backlog. **#106** — aggregator venue-cap measurement-integrity (the deck exempted aggregators from the venue cap → the 0.61 was measured on an aggregator-shifted slice).

---

## Build history + frozen background → `logs/R7_Log.md`
The 07-09 feasibility capture, the dead representation gates, the 07-15→07-22 results log (probe numbers, confusion matrices, per-source None rates, self-consistency decomposition), and the now-superseded transfer-test / τ-fork investigation live there. Decisions in `docs/Decision_Log.md` §61–72.
