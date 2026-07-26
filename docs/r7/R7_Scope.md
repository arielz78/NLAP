# R7 Scope — The Reject Gate (R7-W6)

**Owner:** Ariel
**Deadline (self-imposed):** R7-W6 done by ~2026-08-02 (end of next week). R6 the week after (~2026-08-09).
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md` (frozen intent — read only for original release intent).

**Read order:** this doc → `docs/r6/R6_Scope.md` (the ranker half; they feed each other, see the seam note in §3) → `docs/Decision_Log.md` §61–72 → `logs/R7_Log.md` (build history) only if you need the empirical record.

**Type: Release-working.** Current truth + the one-week plan. Build history (probe numbers, confusion matrices, the dead investigation sequence) is in `logs/R7_Log.md`; decisions in `docs/Decision_Log.md` §61–72; chronological recaps in `Execution_Log.md`. Verbatim prior version (the pre-reframe 261-line doc) is in git (`2fcb5f5`).

**Key data input:** the **416 editor-labeled events** (`R7 Label Deck`, Airtable `tblOxYHuAl2yp9Znl`; 225 None / 191 includable) + the **cached embeddings** (current representation `voyage-4-large` @2048d, §73 — `models/sectioning/corpora/embeddings_voyage-4-large.npy` + `transfer_*_voyage-4-large.npy`; OpenAI `text-embedding-3-large` matrices also cached, which is what Fable's AUC 0.823 floor was measured on — the gate is representation-agnostic). The gate is trained on these — no new embedding spend, no new labeling session required to start.

---

## Status Snapshot (2026-07-25)

Single source of truth for "where are we." Supersedes the roadmap's R7 header and the pre-reframe body of this doc.

**The reframe (validated 3 independent ways, then confirmed by 3 outside LLM reviews):** this is a **top-k selection problem, not a classification problem.** The pipeline ships 5 events/section from ~720 raw candidates/week (~2% keep rate). The section classifier — the thing W6 spent the release building — **owns only ~3 of ~19 failures.** The filter owns ~12, ranking ~4. The classifier was trained on 1,126 *published* events (all winners); in production it sees raw scraped candidates (~98% junk) and, having never seen a negative, confidently sections the junk. **The missing stage is a binary include/None gate** — the reject decision the system has never had.

**The scope call (made this session, 2026-07-25):** W6 pivots from "ship a section classifier ≥0.75" to **build the reject gate + run the classifier suggest-only behind it.** The gate's `P(include)` also serves as the interim ranking score (`final = P(include) × P(section)`), which is why R7 and R6 now feed each other. This is validated but not blindly committed — two cheap experiments (Steps 1–2) can still redirect it before any real build.

**What the reframe kills (do not resume):**
- **The τ-abstention path is dead.** Confidence cannot do reject work — None vs includable confidence distributions are near-identical (medians 0.52 / 0.57); to abstain on 87% of junk you keep only 27% of keepers. A dedicated binary gate is ~7× more keeper-efficient at the same junk removal.
- **The transfer test / min-class-recall exit table (old §3) is moot** as the release gate. It measured section accuracy on a population that doesn't exist in production. Retired as the headline; kept only as an internal diagnostic. The unresolved 0.61 provenance and τ-calibration fork die with it.

**The two live decisions ("forks") — resolved by experiment, not deliberation:**
- **Fork A — does the gate train on split labels?** The 225 None is two different things fused: *ineligible* (permanent, wrong type/geo — trains the gate) and *outcompeted* (fine event that lost its slot that week — a property of the week, not the event; feeds R6's ranker). Training the gate on the merged pile teaches it to permanently reject good events for having competition. **Resolved by Step 1 (the None-split).**
- **Fork B — cheap ranker or real ranker?** The gate score used twice (`P(include) × P(section)`) is free and ships with the gate; a proper Bradley-Terry ranker on the outcompeted pile is the upgrade. **Resolved by Step 2 (the centroid baseline)** — and it's an R6 decision, it does not block W6.

**Convergence evidence (why this is de-risked, not a guess):** un-anchored Fable review re-derived the reframe from raw data (never saw our diagnosis); Ariel's independent per-source None-rate read matched it; ChatGPT + a second Claude review independently prescribed the same spine. All three outside reviews: build the gate, don't touch the classifier, retire min-class recall, don't chase Golden.

---

## The pipeline shape (what W6 + R6 build toward)

```
raw ~720/week
  → Step 3  Stage 0: deterministic pre-filter   (geo/date/language/domain; drop foreign Eventbrite)   ← R7-W6
  → Step 4  Stage 1: the GATE  P(include)        (binary, tuned to 0.98 keeper recall)                 ← R7-W6
  → Stage 2: section classifier (untouched) on survivors → P(section)                                  ← R7 (exists)
  → Stage 3: rank by  P(include) × P(section)     (cheap interim ranker; BT upgrade = fork B)           ← R6
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
- **Capture the demo rulings.** `live_demo_30_seed23.json` has `editor_ruling` empty on all 30 rows — 30 labeled events, paid for, currently unsaved. Recover them.
- **Dedup the corpus at fit** (~1,126 → ~1,042 unique; one sponsor ad appears 19×). Duplicates over-weight patterns in training and distort recall/precision measurement. Simple exact-match dedup (title+date or URL); skip fuzzy canonicalization.

**Done when:** the three errors are corrected in this doc + `logs/R7_Log.md`; demo rulings saved to a readable file; corpus deduped.

### Step 1 — Experiment A: the None-split (resolves Fork A; ~45–90 min editor time)

**What it's for:** the single highest-information-per-minute move on the board. Splits the 225 None so the gate trains on the right negatives.

- Editor re-tags each of the 225 None as **ineligible** (wrong type/geo/not-an-event — permanent) vs **eligible-but-outcompeted** (fine, lost its slot) vs **ambiguous**, with a reason code (geo / wrong-type / non-event / duplicate / other).
- **Interpret:** mostly ineligible → the gate is the win, ranking is easy, grow volume freely. Mostly outcompeted → filtering buys little and the real problem is preference-ranking (pushes weight to R6).

**Done when:** 225 split into the three buckets with reason codes; the ineligible pile is the gate's negative set, the outcompeted pile is reserved for R6's ranker.

### Step 2 — Experiment B: the centroid baseline (resolves Fork B; ~2–3h, Claude plumbing)

**What it's for:** a zero-training floor that tells R6 whether the cheap ranker suffices or a real one is needed. Does not block the gate.

- Reconstruct one past issue window's ~720 candidates. Score each by **cosine similarity to the centroid** (average vector) of the 1,126 published embeddings. No model, no fitting.
- Compute **recall@30** against the 15 events actually published that week.
- **Interpret:** ~0.5–0.6 → ranking is tractable, the cheap `P(include) × P(section)` ranker is plausibly enough (R6 stays small). ~0.15 → text alone isn't enough; R6 needs the real BT ranker + structured features. Every future ranker must beat this number.

**Done when:** recall@30 number in hand; recorded as the R6 ranker floor. (Homes the fork-B call in `docs/r6/R6_Scope.md`.)

### Step 3 — Build Stage 0: deterministic pre-filter (~1 day, no ML)

**What it's for:** kill the provably-dead junk cheaply, before the gate. **Rules for facts, never content keywords** (a "no B2B words" list doesn't scale; provenance rules do — small closed vocabularies, near-zero maintenance).

- Domain allow/blocklist — **drop the 59 foreign-Eventbrite domains** (.de/.fr/.co.uk/.sg — zero possible keepers) and forms.gle.
- Language detection; geography where the source provides it; date-window; is-it-an-event. Every rejection emits a typed reason code (`OUTSIDE_AREA` / `WRONG_DATE` / `NON_EVENT` / `NOT_ENGLISH`), auditable.
- **Source stays a feature, not a delete button** — do NOT drop sources by junk *rate*. allevents.in is 56% junk but supplies ~300 keepers/year; the gate handles its junk per-event. Delete only provably-100%-junk sources.

**Done when:** Stage 0 runs on the raw pool, drops ~5–10% deterministically with typed reasons, keeps every source that can ever produce a keeper.

### Step 4 — Build Stage 1: the gate (authored-core, Ariel; ~1–2 days)

**What it's for:** the one new model. Binary `P(include | event)` — the reject decision.

- **Representation:** the embeddings you already have (`voyage-4-large` @2048d, §71/§73 — TF-IDF killed, §67). Same vectors the classifier uses → zero marginal cost.
- **Model:** binary logistic regression. Features = embedding + one-hot source + has-category-tags + description length. Fable's text-only floor was **AUC 0.823** on the 416; source + more labels likely pushes it to ~0.87+.
- **Trained on:** the Step-1 split (ineligible = negatives, includables = positives). *Not* the merged None (Fork A).
- **Operating point:** tune to **≥0.98 keeper recall**, take whatever junk rejection that buys (~43% text-only at 0.95; higher with features). The dial is recall because a **killed keeper is invisible and unrecoverable**; surviving junk just loses in ranking. Precision is the ranker's job.
- Output a **calibrated probability** (needed to set the recall threshold, and to serve as the ranking score). Calibration check before trusting the threshold.
- **Grow labels for free:** every weekly editor review writes back ~30–50 labels → ~800 rows by September with no dedicated labeling session.

**Done when:** the gate scores the raw pool, hits ≥0.98 keeper recall on CV (URL-grouped, no leak), reports rejection rate by source, outputs a calibrated `P(include)` per event.

### Step 5 — Validate: the one-week dry run (the real go/no-go)

**What it's for:** the only number the business cares about, measured end-to-end on one real issue before committing.

- Take one real issue window. Run Stage 0 → gate → classifier (suggest-only) → rank by `P(include) × P(section)`. Hand the editor **top-8 per section**. Count swaps against the **≤2–3** bar.
- If swaps ≥8, the swap *positions* localize the failure (gate vs section vs rank), so you fix the right stage.

**Done when:** dry run scores ≤2–3 swaps of the 15 slots, editor review under ~15 min. That is the W6 sign-off.

---

## Metrics — retire the old bar

**Retired:** min per-class recall ≥ 0.75. It measured section accuracy on a population that doesn't exist in production; for C/G it sat at/below the ~89% human self-consistency ceiling anyway. Kept only as an internal diagnostic.

**New:**
- **Gate: keeper recall ≥ 0.98** (CV on the growing labeled set) — the one number that must be conservative; a silently killed keeper is the unrecoverable failure.
- **Product: editor swaps ≤ 2–3 of the 15 shipped slots, approve in < 15 min** — measurable every week for free from the review loop.
- **Recall@30** (from Step 2) — the ranking floor R6 must beat.

---

## R7-W6 Sign-off gate

W6 is done when:
1. The gate ships at ≥0.98 keeper recall with a calibrated `P(include)`.
2. It sections the fresh pool (survivors → classifier) — the artifact R6 consumes.
3. The one-week dry run clears ≤2–3 swaps.
4. Forks A and B are resolved (Steps 1–2) and their outcomes recorded (B → R6_Scope).
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

**Missingness (measured, post-R5):** description dropout ~47%, but true signal-dead (no desc AND no cats) only ~15% — concentrated in title-only single-venue sources (PinotsPalette 100%, RichmondHill 95%, Facebook 81%). Include description *with* dropout so the model survives the ~half of production that lacks it.

**Blind-pass catches (in scope regardless of architecture):**
- **Self-reinforcing `NoSection` drift** — a wrong section is visible (editor moves it); a silently-dropped event never appears, never gets corrected, and retraining on published survivors narrows the newsletter irreversibly. Mitigation: never hard-drop; weekly reject-rate alarm; one-click editor rescue. **Directly relevant to the gate — the 0.98 recall floor is this catch made quantitative.**
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
