# R7 Scope — The Reject Gate (R7-W6)

**Owner:** Ariel
**Deadline (self-imposed):** R7-W6 done by ~2026-08-02 (end of next week). R6 the week after (~2026-08-09).
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md` (frozen intent — read only for original release intent).

**Read order:** this doc → `docs/r6/R6_Scope.md` (the ranker half; they feed each other, see the seam note in §3) → `docs/Decision_Log.md` §61–72 → `logs/R7_Log.md` (build history) only if you need the empirical record.

**Type: Release-working.** Current truth + the one-week plan. Build history (probe numbers, confusion matrices, the dead investigation sequence) is in `logs/R7_Log.md`; decisions in `docs/Decision_Log.md` §61–72; chronological recaps in `Execution_Log.md`. Verbatim prior version (the pre-reframe 261-line doc) is in git (`2fcb5f5`).

**Key data input:** the editor-labeled deck (`R7 Label Deck`, Airtable `tblOxYHuAl2yp9Znl`). **Row count is contested: Airtable holds 456 rows (239 None / 211 includable / 6 blank); the modeling set uses 416, and which 40 differ is unexplained — see #107.** Use 456 when talking about what the editor has ruled on, 416 only when describing a fit that was actually run on 416.

Plus the **cached embeddings** (current representation `voyage-4-large` @2048d, §73 — `models/sectioning/corpora/embeddings_voyage-4-large.npy` + `transfer_*_voyage-4-large.npy`; OpenAI `text-embedding-3-large` matrices also cached, which is what Fable's AUC 0.823 floor was measured on — the gate is representation-agnostic). The gate is trained on these — no new embedding spend, no new labeling session required to start.

---

## Status Snapshot (2026-07-28)

Single source of truth for "where are we." Supersedes the roadmap's R7 header and the pre-reframe body of this doc.

**Step status at a glance (2026-07-28).** Step 0 ✅ · **Step 1 IN PROGRESS, 12 of 239** — instrument respecced and all prep done, blocked only on booking the editor · **Step 2 CUT** (it duplicated Step 4a) · **Step 3 nearly done** — geography shipped (#109), date-window and completeness already existed in R1, language / is-it-an-event / cancellation dropped from scope; **one item left, the Eventbrite TLD allowlist, written in-repo and awaiting a re-import** · **Step 4a STAGED, NOT RUN** — plumbing built, blocked on four blind pins plus the score-vs-delete call · Step 4 blocked on Step 1 · Step 5 untouched.

⚠️ **The instrument changed again on 2026-07-28 (§77):** the None-split is now **one 6-option multiselect** (`non-GTA` · `B2B / professional` · `civic` · `wrong fit / not our audience` · `outcompeted` · `can't tell`), with `NoneType` deleted and routing derived in code from a written priority order. §75's four-way *taxonomy* still describes how the editor rejects; it is no longer the *form he fills*. A new `Slice` field makes the gate/train split groupable in Airtable for the first time (gate 184 · train 210 · walkthrough 22 · not-in-model-set 40) — **label the 89 `Section=None` gate rows first**, because only that slice is drawn like production and the four-way split can then be read at ~89 rows instead of 239.

⚠️ **Stage 0's deletable set has shrunk three times, each time on measurement** — §75 (facts only) → §76 (content rules route to the gate) → §76 amendment (not-English and not-an-event removed). **The direction is the finding:** every time this step is measured it gets smaller. Treat any un-measured Stage-0 sizing as an over-estimate.

**The reframe (validated 3 independent ways, then confirmed by 3 outside LLM reviews):** this is a **top-k selection problem, not a classification problem.** The pipeline ships 5 events/section from ~720 raw candidates/week. The section classifier — the thing W6 spent the release building — **owns only ~3 of ~19 failures.** The filter owns ~12, ranking ~4. The classifier was trained on 1,126 *published* events (all winners); in production it sees raw scraped candidates it has never seen a negative example of, and confidently sections the junk. **The missing stage is a binary include/None gate** — the reject decision the system has never had.

**⚠️ Population correction (2026-07-26, Decision_Log §74 amendment) — the arithmetic this doc used to run on was wrong.** The old snapshot cited a "~2% keep rate / ~98% junk." **That 2% is a *slot* rate, not a junk rate:** 15 published ÷ ~720 in window conflates *ineligible* events with *eligible-but-outcompeted* ones, because 5-per-section is a hard quota. **The measured eligibility rate is ~46.5%** (deck's representative gate slice, n=114, CI ±9; batches 1–2 independently 38.6% None). The reframe's conclusion is unaffected — ~53% ineligible is still a large removable chunk that nothing implements today — but **the downstream funnel changes**: at the measured operating point a gate leaves ~537 events for the ranker, and even a **perfect** gate leaves ~335 for 15 slots. **Consequence: ranking is load-bearing *inside* W6, and Fork B no longer defers cleanly to R6.**

**The scope call (2026-07-25):** W6 pivots from "ship a section classifier ≥0.75" to **build the reject gate + run the classifier suggest-only behind it.** The gate's `P(include)` also serves as the interim ranking score (`final = P(include) × P(section)`), which is why R7 and R6 now feed each other.

**The None-split taxonomy is settled (2026-07-27, Decision_Log §75):** `NoneType` is **four-way** — `Rule-break` (→ Stage 0) · `Wrong fit` (→ the gate) · `Outcompeted` (→ R6's ranker) · `Ambiguous` (excluded). `NeededLink` is retired in favour of free-text `LinkGave` plus live text-first labelling sittings. The **breadth criterion** — an event must appeal *across* communities, not single one out — is adopted as a written editorial rule and evaluated **inside the gate, never in Stage 0** (a religion/nationality regex separates the two cases at only 1.7× and would delete measured keepers). Implementation: `R7_None_Split_Labelling_Plan.md`.

**What the reframe kills (do not resume):**
- **The τ-abstention path is dead.** Confidence cannot do reject work — None vs includable confidence distributions are near-identical (medians 0.52 / 0.57); to abstain on 87% of junk you keep only 27% of keepers. A dedicated binary gate is ~7× more keeper-efficient at the same junk removal.
- **The transfer test / min-class-recall exit table (old §3) is moot** as the release gate. It measured section accuracy on a population that doesn't exist in production. Retired as the headline; kept only as an internal diagnostic. The unresolved 0.61 provenance and τ-calibration fork die with it.

**The live decisions ("forks"):**
- **Fork A — does the gate train on split labels?** ✅ **Answered in principle** (§75): yes, four ways, with only `Wrong fit` as the gate's negatives. **Still executing** — the editor is 12 of 239 rows in, and the instrument is being respecced before the remaining ~227.
- **Fork B — threshold gate or *scoring* gate? (OPEN, Ariel's)** Not the old cheap-vs-real-ranker question. Candidate principle: **hard-kill on facts, never on scores** — while the gate score also ranks, deleting a low scorer and burying it produce identical output, so *keeping* weakly dominates and it preserves both the audit trail and the label stream. Raises the question of whether the gate needs a threshold at all. **This no longer defers cleanly to R6** (see the population correction above). Was to be resolved by Step 2; Step 2 is blocked (below).
- **Fork C — W6's scope (NEW, OPEN, Ariel's).** Given that a perfect gate still leaves ~335 events for 15 slots: keep the gate and change the sign-off bar / expand W6 to include ranking / merge W6 with R6.

**Blocking order for the forks:** neither B nor C can be decided before **Step 4a** prices the recall/junk-rejection curve — that number *sets* the release bar rather than confirming it.

**Convergence evidence (why this is de-risked, not a guess):** un-anchored Fable review re-derived the reframe from raw data (never saw our diagnosis); Ariel's independent per-source None-rate read matched it; ChatGPT + a second Claude review independently prescribed the same spine. All three outside reviews: build the gate, don't touch the classifier, retire min-class recall, don't chase Golden.

---

## The pipeline shape (what W6 + R6 build toward)

```
raw ~720/week
  → Step 3  Stage 0: deterministic pre-filter   (geo/date/language/domain; drop foreign Eventbrite)   ← R7-W6
  → Step 4  Stage 1: the GATE  P(include)        (binary; operating point UNSET — Step 4a)             ← R7-W6
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
- ~~**Capture the demo rulings.**~~ **DISSOLVED (2026-07-26) — they were never lost.** The rulings are in Airtable as `Batch = "5 - Live Demo (30)"`, 29 of 30 carrying a `Section`; only the local `live_demo_30_seed23.json` mirror is empty. This is a one-command export (`scripts/readLiveDemoRulings.js`), not an editor re-ask. No editor time, no cost.
- ~~**Dedup the corpus at fit.**~~ **SUPERSEDED (2026-07-26) — use grouped CV, not deletion.** Title-only dedup removes 98 rows, but most are legitimately *recurring* programs (a farmers market ×6, chair yoga ×5) concentrated in Golden — **repeat publication is signal, not a data artifact**, and deleting it would strip the weakest class. The leakage concern is real; the correct fix is **URL/title-grouped CV folds** so no group straddles train and test. **PinotsPalette ×19 remains deletable for a different reason** — it is a sponsor ad, not an event.

**Done when:** the two live errors (Golden-367, section-is-contextual) are corrected in this doc + `logs/R7_Log.md`; grouped CV is the fit's default splitter.

### Step 1 — The None-split (IN PROGRESS; ~3–4 live sittings with the editor)

**What it's for:** the single highest-information-per-minute move on the board. Splits the **239** None so the gate trains on the right negatives. Full plan: `R7_None_Split_Labelling_Plan.md`.

- **Four-way `NoneType`** per §75 — `Rule-break` → Stage 0 · `Wrong fit` → the gate · `Outcompeted` → R6's ranker · `Ambiguous` → excluded from both. `NoneReason` (multi-select) applies to `Rule-break` rows only.
- **Live, text-first sittings**, not solo async work. `NeededLink` is retired; free-text `LinkGave` records what the link added.
- **Status: 12 of 239 done.** Those 12 are the **pilot** — the instrument is being respecced now, at row 12, rather than never; 10 of them carry reasoning clear enough to remap for a two-minute confirm rather than a redo.
- **Interpret:** mostly Wrong fit → the gate is the win. Mostly Outcompeted → filtering buys little and the problem is preference-ranking (weight moves to R6). *Pilot signal, n=11, not to be trusted as a rate:* Rule-break 3 / Wrong fit 6 / Outcompeted 1.

**Done when:** 239 split four ways; the `Wrong fit` pile is the gate's negative set, the `Outcompeted` pile is reserved for R6's ranker, the `Rule-break` pile is a Stage-0 rule inventory.

### Step 2 — ~~Experiment B: the centroid baseline~~ **CUT (2026-07-28)**

**Decision: cut, not re-pointed.** Re-pointing meant ranking within the labelled deck against the editor's own includable/None calls — which is exactly what **Step 4a's threshold sweep already does.** It would be a duplicate measurement. Nothing downstream consumes it: Fork B is now a W6-internal architecture question, not the cheap-vs-BT-ranker question this step was built to answer. *(Original blocking rationale preserved below for the record.)*


**Why it's blocked (2026-07-26):** recall@30 has **no valid denominator.** Only 0–6 of each issue's ~20 published events exist in the candidate pool at all (**3.1% corpus-wide overlap**), so the denominator is ~2, not 15. This is the same dead URL-join assumption that §62 killed on 2026-07-12, in a new costume — reconstructing "the ~720 candidates that week" and "the 15 published that week" as the same population is exactly what the data says we cannot do.

**Do not run it as written.** Two live options, **neither chosen — Ariel's call:**
- **Re-point** at a population where the join is real (e.g. rank *within the labelled deck* and measure against the editor's own includable/None calls), accepting that it is a weaker proxy for production ranking.
- **Cut it.** Fork B is now a W6-internal architecture question (threshold vs scoring gate), not the cheap-vs-BT-ranker question this step was built to answer — so its original consumer no longer exists.

**Not a blocker either way:** it never blocked the gate, and Fork B is now priced by Step 4a instead.

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

### Step 4 — Build Stage 1: the gate (authored-core, Ariel; ~1–2 days)

**What it's for:** the one new model. Binary `P(include | event)` — the reject decision.

- **Representation:** the embeddings you already have (`voyage-4-large` @2048d, §71/§73 — TF-IDF killed, §67). Same vectors the classifier uses → zero marginal cost.
- **Model:** binary logistic regression. Features = embedding + one-hot source + has-category-tags + description length. Fable's text-only floor was **AUC 0.823** on the 416; source + more labels likely pushes it to ~0.87+.
- **Trained on:** the Step-1 four-way split — **`Wrong fit` = negatives**, includables = positives. `Outcompeted` is *withheld* (it is a property of the week, not the event); `Rule-break` belongs to Stage 0; `Ambiguous` is excluded. *Not* the merged None.
- **Operating point: UNSET — see Step 4a. Do not treat 0.98 as settled.** The ≥0.98 keeper-recall figure entered this doc unpriced and **has no measurement behind it**; the fresh-lens review prescribed **0.95** (`fresh_lens_review_2026-07-24.md:75`), and only two points on the curve are measured — **0.95 → 43% junk rejection, 0.90 → 55%**. With ~211 positives, a 0.98 threshold is set by roughly 4 events. The dial is still recall, because a **killed keeper is invisible and unrecoverable** while surviving junk just loses in ranking — but *which* recall is an open number, and 0.98 was chosen against an assumed **scarcity** of keepers that does not exist at ~335 eligible per window. What recall must still guard is **bias, not volume**: losing 67 events at random is survivable, losing 67 that are all Golden Age library programs is not — which argues for a per-section floor rather than one global number.
- Output a **calibrated probability** (needed to set the recall threshold, and to serve as the ranking score). Calibration check before trusting the threshold.
- **Grow labels for free:** every weekly editor review writes back ~30–50 labels → ~800 rows by September with no dedicated labeling session.

**Done when:** the gate scores the raw pool, hits the Step-4a operating point on **grouped** CV (no leak), reports rejection rate by source, outputs a calibrated `P(include)` per event.

**Also report here — the trigger that un-parks the breadth flag (§75).** §75 parked the religion/nationality flag on the theory that the *embedding* carries breadth semantically where a regex cannot. That theory has never been tested, and nothing in the workflow was scheduled to test it. **Report gate recall on the single-community stratum** (the ~30 rows the §75 regex identifies, used here as a diagnostic slice, never as a feature). If those events systematically **survive** the gate, the embedding is not carrying breadth and the flag comes off the shelf; if they are rejected at the base rate or better, the flag stays parked permanently and §75's reasoning is confirmed. Either result is a finding — this is the check, not a formality.

**Same diagnostic, second stratum (added 2026-07-27).** Report gate recall on the **prof-dev / B2B stratum** as well — the rows §76 routes to the gate as content judgments. Identical logic, identical cost, one more line: if those rows systematically score **low** `P(include)`, the embedding carries the rule and no hand-crafted flag column is warranted; if they **survive**, a column earns its place. This is the cleaner of the two tests, because Ariel's 2026-07-27 ruling makes the rule crisp — adjacency to B2B or prof-dev is *always* a rejection, no case-by-case — so a survival result isolates the representation rather than the rule. Breadth, by contrast, is fuzzy on both sides. **General principle this encodes: with a strong representation, test whether it already carries the signal before hand-crafting a feature for it.** The aux columns are already staged and row-aligned in `gate_step4a.py` — this is a selection, not an implementation.

### Step 4a — Price the recall / junk-rejection curve (authored-core, Ariel; ~1h, cached data)

**What it's for:** this **sets the release bar**; it does not confirm one. Everything downstream — the Step-4 operating point, Fork B, Fork C — waits on it. No new spend: the labels and embeddings are cached.

- Sweep the threshold across the full range and plot **keeper recall vs junk rejection**, with the two measured points (0.95→43%, 0.90→55%) as anchors.
- Report **per-section** keeper recall at each point, not just the global number — the failure that matters is a class going dark, not a random loss.
- Report how many *events* separate 0.95 from 0.98, so the cost of the last three points is visible rather than assumed.

**Done when:** the curve exists, an operating point is chosen **with the number in hand**, and it is written into this doc as the bar. Until then, this doc names no recall target.

### Step 5 — Validate: the one-week dry run (the real go/no-go)

**What it's for:** the only number the business cares about, measured end-to-end on one real issue before committing.

- Take one real issue window. Run Stage 0 → gate → classifier (suggest-only) → rank by `P(include) × P(section)`. Hand the editor **top-8 per section**. Count swaps against the **≤2–3** bar.
- If swaps ≥8, the swap *positions* localize the failure (gate vs section vs rank), so you fix the right stage.

**Done when:** dry run scores ≤2–3 swaps of the 15 slots, editor review under ~15 min. That is the W6 sign-off.

---

## Metrics — retire the old bar

**Retired:** min per-class recall ≥ 0.75. It measured section accuracy on a population that doesn't exist in production; for C/G it sat at/below the ~89% human self-consistency ceiling anyway. Kept only as an internal diagnostic.

**New:**
- **Gate: keeper recall ≥ TBD — set by Step 4a, not by this doc.** ⚠️ **0.98 is UNMEASURED** and must not be quoted as the bar anywhere. What is measured: **0.95 → 43% junk rejection · 0.90 → 55%.** What was *prescribed* by the fresh-lens review: **0.95.** The direction is settled (recall is the conservative dial, because a silently killed keeper is the unrecoverable failure); the value is not. Report **per-section** recall alongside the global figure.
- **Product: editor swaps ≤ 2–3 of the 15 shipped slots, approve in < 15 min** — measurable every week for free from the review loop. ⚠️ **UNMEASURED as a bar.** No swap count has ever been recorded; 2–3 is a target someone wrote down, not a baseline anyone observed. It is also the bar Fork C questions (a perfect gate still leaves ~335 for 15 slots, so a swap count measures the ranker as much as the gate). Capture a *current* swap count on one real issue before treating this as pass/fail.
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
1. The gate ships **at the operating point chosen in Step 4a** (a priced point on a measured curve — *not* a number carried over from this doc's history) with a calibrated `P(include)`.
2. It sections the fresh pool (survivors → classifier) — the artifact R6 consumes.
3. The one-week dry run clears ≤2–3 swaps. **⚠️ This bar is itself in question — see Fork C**; a perfect gate still leaves ~335 events for 15 slots, so a swap count measures the ranker as much as the gate.
4. Fork A is executed (Step 1 complete, 239 rows split four ways) and **Forks B and C are resolved with the Step-4a number in hand**, their outcomes recorded (B → `R6_Scope` if it lands there).
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
- **Self-reinforcing `NoSection` drift** — a wrong section is visible (editor moves it); a silently-dropped event never appears, never gets corrected, and retraining on published survivors narrows the newsletter irreversibly. Mitigation: never hard-drop; weekly reject-rate alarm; one-click editor rescue. **Directly relevant to the gate — the keeper-recall floor (value TBD, Step 4a) is this catch made quantitative.**
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
