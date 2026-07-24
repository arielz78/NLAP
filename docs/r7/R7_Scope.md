# R7 Scope — Section Classifier (R7-W6)

**Type: Release-working.** Current truth + the live plan only. Build history (probe numbers, confusion
matrices, the investigation sequence) moved to `logs/R7_Log.md` (2026-07-24); decisions live in
`docs/Decision_Log.md` §61–72; chronological recaps in `Execution_Log.md`. This doc is
current-truth-first: **§1 finding → §2 settled design → §3 live plan + gates → §4 open questions + live
leads → §5 pointer.** Verbatim prior versions are in git (`916e450`).

> **Status (2026-07-24).** Representation settled: `text-embedding-3-large`, min-class CV 0.774
> (Decision_Log §71). **The transfer test is the release gate and it is not finished** — plumbing + 4
> blind pins + fit exist; the recall/coverage/verdict blocks are unrun, parked at the **τ-calibration
> fork** (the pinned `TAU_CALIBRATED_ON="train"` is degenerate — the train slice is uncertainty-sampled,
> so None/includable max-prob don't separate; frontrunner is to calibrate on the 1,126 corpus via CV).
> ⚠️ A transfer min-class recall of **~0.61** (below the 0.75 bar) is cited in the 07-23/07-24 sessions,
> but no clean run is recorded — **provenance to reconcile** before it stands as the gate number (§4).
>
> **The release-reframing finding (07-23/24, §1).** A 30-event live demo *with* the editor decomposed the
> failures by stage: **the classifier owns ~3 of ~19 failures; the filter owns ~12, ranking ~4.** Most of
> what W6 has treated as a classification problem is a filter + ranking problem — measured a third way and
> client-confirmed. **Open scope call (next session, Ariel's): does W6 stay "ship a section classifier
> ≥0.75," or pivot to suggest-only and reopen the filter/ordering boundary (Decision_Log §61)?** Do the
> §4 reconcile and define "None" before deciding.

---

## §1 Where W6 actually stands — the stage-decomposition finding (2026-07-23/24)

A 30-event live classifier demo (filtered draw, batch 5 in `R7 Label Deck`, rows 427–456) run for the
editor, who ruled 29/30 cold. His comments decomposed the failures **by stage**, and that is the release's
central result:

**The classifier owns ~3 of ~19 failures. Filter owns ~12, ranking ~4.** Same read as the two-stage
decision (§2), #94/#96, and the NeedsReview pile — now measured a third, client-confirmed way.

**Demo readout (n=29 — NOT a gate number; the transfer test is the gate):**
- Includables correct:incorrect = **12:5 (71%)** argmax, Golden weak (2/5) — consistent with the 0.61 the
  transfer test is cited at.
- **"Correct" has four defensible denominators — 71 / 81 / 64 / 31%.** The 30-point spread *is* the
  finding: it's ambiguous *because* "None" is undefined (conflates fails-criteria vs fine-but-outranked).
- **None rate 41%** (12/29) on *filtered* input — replicates 48.5% (400) / 50% (walkthrough) / stated
  50–75%. **The model committed on 9 of 12 Nones** (margin ≥0.15 → would not abstain): **abstention is not
  doing filter work.**

**The root, named:** training population ≠ serving population (published/edited/post-selection vs
raw/scraped/pre-selection), and the training corpus has **zero negatives** — every one of the 1,126 already
won, so it structurally cannot learn rejection. Every release symptom (URL-join death, 0.774→0.61,
hollow-correct, the recurring None problem, the invisible-cost rule) is a costume for that one fact. The
scope was written before the data to write it against existed (the proxy assumption died 07-12 and R7's
scope was never re-derived).

### Problem inventory (2026-07-23) — every problem caught this release, by how much it distorts decisions
"Home = none" = nowhere it's currently tracked (the actionable column). **8 of 22 have no home — and they
are the structural ones (1, 2, 4, 6, 9, 12, 19)** — homeless because nothing in the workflow was watching
for them, the same failure mode that slipped the NeedsReview baseline a whole work package.

| # | Problem | Home |
|---|---|---|
| **ROOT** | | |
| 1 | Training population ≠ serving population | **none** |
| 2 | Training corpus has zero negatives → cannot learn rejection | **none** |
| **DEFINITIONAL (blocks measurement)** | | |
| 3 | "None" conflates fails-criteria vs fine-but-outranked (flagged 07-19, unactioned) | 07-19 only |
| 4 | "Correct" has 4 denominators (71/81/64/31%) — downstream of #3 | **none** |
| **ARCHITECTURE / SCOPE** | | |
| 5 | No content-reject stage exists (`isBusinessy` dead) | #94/#96 |
| 6 | R5 solved supply, created a filtering problem — no release absorbs the cost (pool ~100→~1,800; Eventbrite 93%→6% of pool) | **none** |
| 7 | R7-before-R6 ordering may be wrong — filter+ranking own ~80% of failures | Decision_Log §61 |
| 8 | W6 builds the classifier; the value sits in stages it excludes | §3 |
| **DATA / INGESTION** | | |
| 9 | `CostRaw` 14% fill, cut as dead — the price rule stated 4× is invisible | **none** |
| 10 | `DescriptionRaw` 61% fill; ~47% title-only on some sources | uncosted |
| 11 | Structured signals under-used (`SourceCategories` 42% via cats ablation; source slug) | #75 |
| **MEASUREMENT INTEGRITY** | | |
| 12 | Deck exempted aggregators from the venue cap → gate slice aggregator-shifted; 0.61 measured on it | #106 |
| 13 | τ-calibration pin degenerate (train slice is uncertainty-sampled) | §3, fork open |
| 14 | Coverage bar unrun → exit table can't be routed | §3 |
| 15 | Golden n=18–21, ~5 pts/event | #105 |
| 16 | Editor ~89% self-consistent → hard label ceiling | #105 |
| **MODEL** | | |
| 17 | Min-class recall ~0.61 vs 0.75 bar — FAIL *(provenance to reconcile, see Status)* | §3 |
| 18 | Golden weak in CV and transfer (0.774 / 0.61 / 2-of-5) | #105 |
| 19 | Abstention not doing filter work — committed on 9 of 12 Nones | **none** |
| **PROCESS DEBT** | | |
| 20 | Pairwise dates overdue 2 meetings — blocks R6 (needs his labels, not the classifier) | meeting doc |
| 21 | Notebook blurbs, 9 sessions owed | Ariel |
| 22 | Two files unreviewed from the 07-20 override | #99 |

**The through-line (three things, not thirty):** one root (population gap, #1/#2), one undefined term
(None, #3 — unblocks #4, defines what the filter is *for*), one sampling artifact (aggregator cap, #12 —
makes the headline number softer than it reads). **#3 is the cheapest high-value move on the board** — an
hour of definition, not a build, and nothing measures cleanly until it's settled.

**Client-generated inputs from the meeting (his ideas, not yet evaluated):**
- **Source tiering by *trust*** ("sources where classification is easier" — source→trust, untested; NOT
  source→section, which is dead/"varies" 07-16). Testable cheap: **None-rate per source on the 416**
  (they carry URLs). Concentrated junk → tiering works; distributed → it doesn't.
- **A 4th "None" class** — held, not adopted: None is 6 mechanisms not a class (Decision_Log §66), and a
  4th class shares the softmax so it suppresses exactly the look-real junk you most want caught; a separate
  binary include/reject stage is the better shape (#96). Now client-requested — a conversation to have.

---

## §2 Settled design (current truth — re-litigate only with new data)

**Class set = 3-class (Families / Couples / Golden), train on 1,126** *(§62)*. Local Aroma enters via a
separate intake absent from the scraped pool, so the classifier never sees it in production and must never
output it. (1,126 = 376+383+367; the 380 Local Aroma events dropped.)

**Two-stage scope: include/reject filter + section classifier; the gate is over includable events**
*(2026-07-19, Decision_Log §66).* The criteria walkthrough closed the editor-error question — None
replicated at 50% on 26 never-seen events, and "None" is ~6 distinct mechanisms, 12/13 event-based (text,
not listing). So the reject stage is real work, it is the stage the editor actually finds hard, and nothing
in R1/R2 implements it (`isBusinessy` dead, #94). The classifier's gate is **section accuracy over events
the editor would include** (None rows excluded from the denominator). The filter itself is a named scope
**addition**, deferred with W7 (#96); its mechanism→tool decomposition (rule-over-fields / trained model /
editor-list / not-a-property) is design owed before it's built.

**Representation = `text-embedding-3-large`; TF-IDF killed** *(§67, §71).* TF-IDF failed the pre-registered
coverage gate — at full vocabulary it perceives only 5.9% of the production token space (2,692 of 45,652),
min-class weighted coverage 68.2% (< 70% kill). Embeddings close that (no OOV event when every string
produces a vector). Stack = frozen generic embedder (OpenAI API) + a small per-client trained logistic head
scored in Node from a JSON artifact — which also makes client #2 a labels-only retrain (§68/§71).

**C/G boundary is genuinely fuzzy → abstention is load-bearing; flex-flag spans R7→R6** *(§64).* Ambiguity
is quantified by the model's probability **margin** (small = hard). Low-margin C/G events get a **flex flag
emitted by R7**; **R6/the allocator resolves them** by filling whichever section is short that week
(scarcity resolves ambiguity for free). Clean split: R7 emits, R6 consumes. PinotsPalette (16 C / 17 G /
**0 Families**, identical title rotating) is absorbed by this for free — no special-casing. *(Abstention
two-signal read: max-prob = the None signal, margin = the flex signal; low-τ lean, because a committed junk
event is visible to the editor and a silently-declined good event is invisible. τ not yet set — §3 fork.)*

**Feature recipe = serve-time text: `title + clean(DescriptionRaw)`** *(§70).* SourceCategories is
**excluded by default**, re-entering only through the pre-registered cats ablation (§3). Source-prior and
deterministic-source routing were **both killed** by the editor's rulings (every source ruled "varies";
§63) — nothing hardcoded, full 1,126 goes to the model. **Open (Ariel):** does the source slug become a
*feature* (VPL ~90% not-Couples, PinotsPalette 0/33 Families are real per-source signal a feature can hold)
— decide by CV, watch the per-class confusion for the source-as-shortcut risk. Invariant: **score-time
recipe == serve-time recipe.**

**Missingness (measured, post-R5):** description dropout ~47%, but true signal-dead (no desc AND no cats)
is only ~15% — death concentrates in title-only single-venue sources (PinotsPalette 100%, RichmondHill 95%,
Facebook 81%). Include description *with* dropout so the model survives the ~half of production that lacks
it.

**Blind-pass catches (in scope regardless of architecture):**
- **Self-reinforcing `NoSection` drift** — a wrong section is visible (editor moves it); a silently-dropped
  event never appears, never gets corrected, and since retraining uses published survivors the newsletter
  narrows irreversibly. Mitigation: never hard-drop; weekly `NoSection`-rate alarm; one-click editor rescue.
- **Calibration tripwire** — if editor-override inside the auto-accept band > ~10%, auto-downgrade to
  suggest-only until retrained.

**Corpus freeze (07-15):** `published_titles.json` 1,126 rows (376/383/367); `raw_candidate_titles.json`
1,805 unique. The raw side was staged once into serve-time text and frozen — do not re-stage mid-analysis.

---

## §3 W6 live plan + release gates

### Scope boundary — what W6 owes vs defers (Decision_Log §61)
**W6 delivers an offline classifier good enough to section the fresh pool at high confidence** — §61: *"R6
only needs the classifier offline to section a pool it reads."* Deferred, deliberately:
- **R7-W7** (deploy into live n8n/R2) — has **no consumer today** (R1 is manual, editor not yet on the
  Airtable views, cost saving ~$2/yr), and R6's pair data may overturn assumptions W7 would wire around.
- **The reject filter (#96)** — rides with W7; Step 6 sections high-confidence only, so abstention handles
  junk implicitly and R6 isn't blocked by its absence.
- **Frozen eval set + model versioning** — W7 items (#101).
- **Per-item GitHub issues** — the "sequential investigation, not a checklist" justification for deviating
  from the roadmap's issue-per-item rule **expires at W7 open**. W7 is the separable-task build phase (same
  shape as R5's source integration) — open the issues then.

### Release gates (pre-registered 2026-07-21, before any embeddings fit — Decision_Log §72)
Set before any transfer number was seen; a marginal number can't argue past them. The transfer test scores
against these.
- **Recall bar: min per-class recall ≥ 75%**, gate slice, includable events only. Report raw fractions
  (Golden n=21 → 16/21; 1 event ≈ 5 pts). Ceiling = editor self-consistency ~89% (n=18, CI ~67–97).
- **Coverage bar (#98): ≥ 60% of includable gate events committed** (margin ≥ τ). Denominator is includable
  events only — abstaining on None is correct behavior, excluded. A floor, not a forecast.
- **Cats-ablation switch rule:** with-cats replaces without-cats only if min per-class recall improves by
  **≥ 10 points (≥ 2 events) with no class degrading** (per-class n = 20–46 → noise ≈ ±2 events).
- **Exit table:** both pass → ship to R6 (Step 5). One fails → one iteration cycle (recipe/τ), re-run once.
  Both fail, or a second miss → embeddings don't transfer; reopen the LLM-primary path (§67, deliberately
  left undecided; horse-raced at close-sequence Step 4).
- **CV on the 1,126 = sanity check only** — no bar attaches; it picked large-over-small, nothing more.

### The close sequence
1. **CV screen — DONE (07-22):** large 0.774 ≥ 0.75 survives; small 0.747 eliminated. Decision_Log §71.
2. **Transfer test — train on the 1,126 edited, score the gate slice** (184 events, joined by URL), **large
   arm** (TF-IDF and small are dead). Embed the **serve-time recipe** (§70), cats-ablation as a second arm.
   Read **per-class recall + confusion + margin bands**, never a single accuracy number. **Score pre/post-
   call separately** — the seam diverges 39.3% vs 57.3%, don't pool. ⚠️ Do **not** implement `max_prob < τ
   → None`: margin measures section ambiguity, not includability — that's the two-stage decision's whole
   point (§2). *(In progress: plumbing + 4 blind pins + fit done; recall/coverage/verdict unrun, parked at
   the τ-fork — §4.)*
   - *If transfer degrades, read the raw text before swapping models:* published events avg 105 chars, raw
     candidates 340 — if the extra ~235 are boilerplate/URLs, cleaning buys more than any representation
     change. Ad-hoc, ~30 rows, only if the number says so.
3. **Calibration check on the winner, then set the abstention threshold — in that order.** `predict_proba`
   summing to 1 is arithmetic, not honesty. *(Note: the fit uses `class_weight=None`, not `"balanced"` — so
   the original class-reweighting calibration concern doesn't apply; a general calibration check may still
   be wanted before trusting τ.)*
4. **`gpt-5.4-nano` few-shot on the same gate slice** — settles whether an LLM beats the classifier on
   per-segment recall (the roadmap's pre-registered rule). Few-shot, not zero-shot. Informational if
   embeddings clear the bar, decisive if not.
5. **Section the fresh pool at high confidence** — the artifact R6 consumes. W6 is not closed without it.
6. **Windowed captures at W6 close** (both deadline at W7 cutover, now after R6): NeedsReview baseline
   **— DONE (07-22, #104, 226 records)**; #83 gpt-4o cost baseline (instrument the node + run the ~1,100
   backlog) — still owed.
7. **Declare the architecture settled + log the Decision_Log entry.**

Then **R6.**

---

## §4 Open questions + live leads

**The immediate authored-core (Ariel), in order:**
1. **Define "None"** (fails-criteria vs fine-but-outranked) — cheapest high-value move; unblocks the
   4-denominator ambiguity and defines what the filter is *for*. Nothing measures cleanly until it's settled.
2. **Resolve the τ-calibration fork** — (a) split the gate; (b) calibrate on the 1,126 corpus via CV at a
   low known-good percentile *(frontrunner — non-circular, non-degenerate)*; (c) accept gate circularity and
   document the optimism. Then write the abstention + coverage logic and run the verdict against §3's gates.
3. **The scope call** — does W6 stay "≥0.75 classifier" or pivot to suggest-only + reopen the
   filter/ordering boundary (§61 now has its first counter-evidence, §1)? Deliberate with the coverage
   number in hand. Becomes a Decision_Log entry when made.
4. **Reconcile the 0.61 provenance** (§1 / Status) before it stands as the gate FAIL.

**Standing / unblocked:** None-rate-per-source on the 416 (tests the editor's tiering idea, ~15 min, Claude
plumbing); pairwise dates **overdue to a 3rd meeting, blocks R6** — leads the next editor contact.

**Live leads (re-derive before acting):**
- **Facebook is structurally title-only** (6-column intake, no descriptions; §49/§50) and **paused pending
  go-live, not drifted** — resumes at R8; ~13 events/week (<1%), so it can't move blindness, the model just
  abstains on most FB events. The only fix reaching R7 is adding a `Description` column to the intake prompt.
- **Facebook's "58% of clicks" is probably an attribution error** (unverified) — it measures the editor's
  *discovery channel* when the pipeline pulled ~only Eventbrite, not events existing only on FB. With 10+
  sources the same community events plausibly appear elsewhere *with* descriptions. **Check before spending
  on a Description column or spike #67.**
- **Label conflicts in the training corpus** — ~8 titles published under 2+ sections (identical string,
  contradictory label; skew overwhelmingly C↔G). Irreducible noise if real. **Re-derive count + skew at
  fit;** it informs a realistic recall target.
- **Dedup the published corpus at fit** (~1,126 rows / ~1,042 unique) — IDF-relevant / embedding-duplicate-
  relevant at fit time; irrelevant to anything set-based.
- **Source field is display-only — read the URL** (#92): blank on ~19%; the field would silently drop ~418
  Eventbrite events. Any source derivation reads the URL. URL coverage ≈ 99.9%.
- **Raw corpus must NOT be rebalanced** — it's a test set; its only job is to resemble production, and
  AllEvents *is* ~40% of production. Balancing buys a cleaner number that predicts nothing.
- **~28 Jan-2025 rows were labeled before Golden Age existed** (launched 2025-02) — points at the C/G
  boundary; consider dropping pre-2025-02 rows, test in CV rather than assuming.
- **The 5/5/5 per-issue balance is a QUOTA, not preference** — don't read 376/383/367 as signal about the
  incoming pool's real mix (which remains unmeasured).
- **#105** — post-transfer-test weak-class (Golden) improvement backlog; the test routes to the right lever
  (label noise / genre gap / too-few boundary examples). **#106** — aggregator venue-cap measurement-
  integrity issue (opened 07-24).

---

## §5 Build history + frozen background → `logs/R7_Log.md`
The 07-09 feasibility capture, the dead representation gates (Gate 1/2/3), the 07-15 investigation steps,
and the full 07-17→07-22 results log (probe numbers, confusion matrices, per-source None rates, the
self-consistency decomposition) moved there 2026-07-24. Decisions reached from those findings are in
`docs/Decision_Log.md` §61–72. *(§2 "open decisions" from earlier drafts are all resolved into §61–71 and
were removed with that move.)*
