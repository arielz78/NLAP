# R7 Scope — Section Classifier (ROUGH DRAFT — NOT REVIEWED)

> **Status: rough aggregate, 2026-07-09.** This is a capture of three independent
> views assembled at speed, *not* a finalized plan. It exists so the design work
> from this session isn't lost in a chat transcript. **Next session:** review
> slowly → self-critique → blind Fable critique + GPT-5.5 second opinion →
> finalize → Decision_Log entry → open `r7` issues. Do **not** treat any decision
> here as settled. The architecture call is Ariel's, informed by the critique —
> not delegated to a model.

---

## Review update — 2026-07-12 (supersedes conflicting body text below)

Slow review opened (pre-sprint). Resolved so far; the body sections below are the
2026-07-09 capture and are **superseded by this block where they conflict**:

- **Class set = 3-class (Families/Couples/Golden), train on 1,126.** Scope fact, not
  tuning: **Local Aroma enters via a separate intake absent from the scraped candidate
  pool**, so the classifier never sees it in production and must never output it. (1,126 =
  376+383+367; the 380 Local Aroma published events are dropped.)
- **KILLED: the URL-join raw-title training rebuild.** Wrong premise — the client does not
  use the pipeline for selection yet (only at R8), so `issue_history` (published) and
  Candidates (scraped) are **two independent samples**, not the same events twice. Exact-URL
  join yields only 69 pairs / 45 distinct titles (temporal hole + venue-vs-deep-link form
  mismatch). Kept only as a tiny, civic-skewed transfer *test* set — useless for training.
- **Go/no-go reframed into a 3-probe transfer-validation sequence** (replaces the dead join):
  1. **Probe B** (pre-build): raw↔published **vocabulary overlap** — do the discriminative
     tokens TF-IDF relies on appear in the raw candidate pool? Decides open-decision #1
     (TF-IDF vs embeddings); can kill early. Corpora staged: `eval/probe_b/`.
     - **Refinement — stratify the overlap by source (cheap, do it).** Compute the raw↔edited
       vocab gap *per source*, not just in aggregate. Rationale: each source has its own title
       style (clean vs emoji-soup), so an aggregate "fine" can hide bimodality where a few messy
       sources transfer badly and get silently misclassified. Stratifying turns the pass/fail
       number into a *diagnosis* — if the gap is concentrated, handle those sources specifically
       instead of abandoning TF-IDF. This is a diagnostic on the existing corpora, **not** a model
       change. **Deferred (do NOT build now):** source as a *classifier feature* / per-source
       prior — adds source-tag reliability, unseen-source, and drift complexity for uncertain gain,
       and **breaks for aggregators** (source ≠ style: an aggregator blurs many organizers' styles).
       Revisit only if the data shows it's needed and TF-IDF transfer is already validated.
  2. **Probe A** (post-build): 69-pair raw kill-check (directional only — biased easy).
  3. **Editor-150** (post-build): hand-labeled stratified raw candidates → the real gate-#3
     number (≥80% agreement).
  Test target is the **raw candidate distribution** — that's what's actually segmented.
- **C/G self-consistency in (2026-07-12):** editor blind re-ruled the 15 tightest Couples/Golden
  boundary cases → **12/15 (~80%) agree with his own past published placement** (`eval/ambiguous_cases_2026-07-09_RULINGS.tsv`).
  Held **loosely** (n=15, CI ~55–93%); the "directional C→G drift" read on the 3 disagreements was
  **dropped as n=3 noise**. Durable read: the C/G boundary is genuinely fuzzy → **abstention on this
  pair is load-bearing**, and the ambiguity is **quantified by the model's probability margin**
  (small margin = hard). This is a soft design assumption, not a measured ceiling.
- **Flex-flag design (parked, spans R7→R6):** low-margin C/G events get a **"flex" flag emitted by
  R7**; the **R6/allocator resolves them** by filling whichever section is short that week (scarcity
  resolves ambiguity for free). Clean split: **R7 emits, R6 consumes** — no flex logic in the classifier.
  Two dials: **margin tunes flex *volume*; editor-150 checks flex *quality*** (true dual-fit vs
  model-just-confused — different failure). Extends the existing **flex-segment idea (Decision_Log — verify
  entry)**. Margin **calibration is a build-time check** (the calibration tripwire), not design-now.
- **Still open:** #2 model head, #3 LLM-in-v1 (both paper, no data needed); #1 waits on Probe B.
  Consolidated Decision_Log entry deferred to finalization (Next steps §3).

---

## Feature design — v1 locked (2026-07-13, measured on candidates_2026-07-12 snapshot, n=2,533)

Came out of a primer session that turned into feature-design work. **Main feature decisions are made for now; deliberately stopping here rather than adding more before the baseline says what's needed** (method-fit: don't engineer features speculatively).

- **v1 feature set = title + description + SourceCategories + source-prior (targeted).**
  - **Description dropout ~47%**, not the doc's stale 42%. Provenance: 42% understated because "all candidates" (32.6% missing) is diluted by ~2,300 older enriched records (1.4% missing). The **production-relevant pool = post-R5 (added ≥ Jul 4), which runs ~47.5% missing** (n=217, small — mostly the Jul 9 batch; re-measure as post-R5 data grows). Calibrate dropout to the post-R5 rate, not the all-candidates average. Description adds ~7pts (title-only 70% → title+desc 77%, 3-class), so include it but with dropout so the model survives the ~half of production candidates that lack it.
  - **SourceCategories** (e.g. `Storytime`, `food-drinks`, `fitness, Sports`) — real discriminative signal, present where description is absent. **Treat as bag-of-tokens** (per-source tag-soup, inconsistent taxonomies) → TF-IDF handles natively. Mild point **for TF-IDF over embeddings** (clean keyword tags are TF-IDF's wheelhouse).
  - **Missingness is per-source and BIMODAL** (confirms the doc's per-source-stratification warning): **true signal-dead (no description AND no categories) is only ~15% post-R5 / ~9% all** — NOT the 47% description-only number. AllEvents (largest, 685) has ~3% desc but ~91% cat → not signal-dead. Death concentrates in **title-only single-venue sources: PinotsPalette (100% dead), RichmondHill (95%), Facebook (81%).**
  - **Source-prior as a TARGETED rescue** (not a blanket feature): the deferred "source-as-feature" idea is **safe and useful specifically for title-only single-venue sources** (PinotsPalette = paint-and-sip = Couples), because the doc's "breaks for aggregators" objection doesn't apply to single-venue sources — and the aggregator (AllEvents) already has categories so doesn't need it.
- **Deterministic-source routing (rule > ML):** fixed-audience single-*activity* venues get a hardcoded `source→segment` lookup (100% accurate, free, interpretable) instead of the classifier; classifier only handles genuinely multi-segment sources. Caveat: **single-venue ≠ single-segment** — VPL (library, 443) spans Families/Golden and needs the classifier; determinism is about the venue's *activity range*, not venue count. Rule-routed events get **dropped from train/eval** (like Local Aroma) so the accuracy number reflects only the hard events. **Validation blocked by data** (source↔published-segment link is the same disconnect that killed the URL join) → **routed to the editor** (agenda item parked in `meetings/2026-07-16.md`): editor rules each source "fixed→[section]" or "varies."

### Parked (explore only if the baseline underperforms — do NOT build speculatively)
- **Feature inventory sweep not yet done.** v1 was assembled by following the thread, not by sweeping every field. Unassessed candidate features on the record: **`LocationName` (venue), `City`, `CostRaw`, `Organizer`, `Start Date` (→ day-of-week / weekend), `Source`.** Some plausibly carry signal (weekend↔family/couple; cost↔date-night vs free-family; venue strong). Assess at finalization or if v1 falls short.
- **"Usable" vs merely-present description** — today's 47% is a *structural* blank check; a semantic "is the text contentful vs fluff" check would push the true-missing rate somewhat higher. Deferred.
- **Fable "what other features?" question** — at the blind-critique step (Next steps §2), ask Fable which features to add given the field inventory, and which are traps. **BUT first research how to prompt Fable** — anecdotally Fable does better with *general* prompts than sharp/loaded ones, so test general ("what features would you use for this?") vs specific (handing it the field list) rather than assuming the loaded prompt wins. Don't research now; revisit before running the Fable review.

---

## Parked from the 2026-07-15 Probe B staging session

> **⚠️ EVERY NUMBER IN THIS BLOCK IS UNVERIFIED.** All figures below came from
> throwaway inline `node -e` scripts run against the `candidates_2026-07-15_0943`
> snapshot and `issue_history.json` during a working session. **Nothing was saved as
> a re-runnable script.** Treat each number as a *lead*, not a measurement:
> **re-derive it before acting on it**, and only then write it down as fact. The one
> exception is the field-vs-URL source gap, which `scripts/overlapAudit.js` produces
> reproducibly on every run.

Session context: Probe B was **descoped to a single aggregate vocabulary-overlap gate**
(see below). These items surfaced while staging it and are parked so the probe can proceed.

- **PinotsPalette is NOT deterministic — the v1 source-prior for it is suspect.**
  v1 (2026-07-13, above) routes PinotsPalette deterministically as `paint-and-sip = Couples`.
  The published record appears to contradict this: the title `Pinot's Palette 🔥10% off…`
  looks to be published **~19× split across BOTH For Couples and For Golden Age Readers**.
  If so, the source sits on the fuzziest boundary in the class set, and hardcoding one
  answer would encode a question the editor himself answers two ways.
  **Working hypothesis (Ariel, 2026-07-15): PinotsPalette is a *constant flex* — always
  low-margin C/G, resolved by the R6 allocator into whichever section is short.**
  **→ ACTION: confirm with the client before building either the source-prior or the
  constant-flex rule.** Neither is decided. Do not implement on the strength of this note.
  Agenda item for the next client meeting; re-verify the 19× split first.

- **Label conflicts in the training corpus — a hard accuracy ceiling.** Apparently **8 titles
  are published under 2+ sections** (identical string, contradictory label): e.g.
  `Woodbridge Village Farmers Market` (all three), `Wine and Paint Night`, `Pottery Workshop`,
  `Make Your Own Perfume`. If real, this is **irreducible noise** — same input vector, two
  targets; no tuning removes it. Skew is **overwhelmingly Couples↔Golden**, which would be
  independent corroboration of the editor's 12/15 self-consistency read (Review update,
  2026-07-12) from a different direction, and strengthens the flex-flag design.
  **→ Re-derive the count and the C/G skew; then it informs a realistic accuracy target for gate #3.**

- **Dedup the PUBLISHED corpus — revisit at classifier build, not now.** `published_titles.json`
  is ~**1,126 rows / ~1,042 unique titles (~84 surplus, ~41 repeated)**; `stage_corpora.js`
  dedupes the raw side but **not** the published side. Irrelevant to Probe B (a presence-based
  vocab gate self-dedupes — a vocabulary *is* a set), but it **does** matter once the vectorizer
  is fit: **IDF is document-frequency based**, so 19 copies count as 19 documents.
  **→ Rule on it when fitting TF-IDF; ignore it for the probe.**

- **The `Source` field is display-only — read the URL instead.** `Source` was added for UI
  visibility (Ariel) and is **blank on ~513/2,706 (~19%)** of Candidates; `overlapAudit.js` already
  derives source from the URL and labels it `(ground truth)`. Field vs URL: **Eventbrite ~164 vs
  ~582 (~418 gap)**, AllEvents ~728 vs ~808. Gaps reconcile to the blank count. Mechanism: `Source`-present
  and `LocationName`-present appear to be the *same* records — one pre-R5 enrichment step wrote both,
  and legacy records predate it. **→ Any source-prior must derive source from the URL, never the field**
  (reading the field would silently drop 418 Eventbrite events). URL-derived coverage ≈ 99.9%.
  This one is reproducible via `overlapAudit.js`.

- **Description transfer is untested — likely a second probe.** Description is in v1 (adds ~7pts,
  70%→77%) but Probe B's staged corpora are **titles only**. Published descriptions are
  **editor-written prose**; raw `DescriptionRaw` is scraped copy — plausibly a **worse** raw↔edited
  gap than titles, since descriptions are rewritten more heavily. Title-only is the right *first*
  gate (title is 100% present; if title vocab doesn't transfer, nothing downstream will), but the
  77% can't be trusted until description gets the same check. **→ Sequence as Probe B2, not a
  blocker for B.**

- **Per-source vocab stratification → DEMOTED to fallback.** The 2026-07-12 refinement (above)
  is **cut from Probe B's critical path**. Rationale (method-fit): Probe B is a **binary go/no-go**,
  which is an aggregate question; per-source turns one number into ~13, most on n<100 (tail runs
  13–24 titles — the same small-n trap already rejected for the C/G drift read); and it **doesn't
  change the decision** — pass → build, ragged tail → still build, since v1 already handles
  title-only sources. **Counter-consideration, kept:** TF-IDF matches *exact tokens*
  (`Storytime` ≠ `Story Time`, zero overlap; embeddings absorb this), so per-source drift is
  precisely TF-IDF's failure mode — and the aggregate is **volume-weighted**, so AllEvents (~40%
  of the pool) could carry a passing number while thin sources fail silently.
  **→ Run the aggregate gate. If it returns marginal, stratify — top 4 sources only
  (AllEvents / Eventbrite / VPL / BiblioCommons), where n supports a read.**

- **Raw corpus must NOT be rebalanced.** Excluding AllEvents (or a fresh run's events) to
  "balance" the raw pool was **considered and rejected**: the raw corpus is a **test set**, and a
  test set's only job is to resemble production. AllEvents *is* ~40% of production. Balancing is a
  *training*-set instinct; applied here it buys a cleaner number that predicts nothing.

- **Unionville normalize logic** — post-R1 checks (2026-07-15) flagged **10/10 `MISSING_LINK`
  rejections from Unionville alone**. Reported-only, no alarm threshold. Not R7 work; file if it recurs.

**Corpus frozen for Probe B (2026-07-15, post-R1):** `published_titles.json` 1,126 rows
(Families 376 / Couples 383 / Golden 367) · `raw_candidate_titles.json` **1,805** unique raw titles
(1,730 pre-R1-rerun + 75). Do not re-stage mid-analysis — a shifting test set is unreproducible.

---

## Why R7 now (the discovery that reordered the roadmap)

R6 (within-section scorer) was being built when its pair-collection harness hit a
wall: it needs a pool of candidates **already assigned to a section**, and the
step that does that (R2 enrichment) is **dead / effectively unused**. The fresh
post-R5 candidate pool (~1,045 future events) is rich on every raw signal
(venue 99%, source 100%, title 100%) but carries **no section label** — those are
`Pending`, unenriched. The old `Enriched` cohort is stale (pre-R5: venue 24%,
source 22%) and its sections came from the same bad R2.

**So R6 has a hidden dependency on R7.** The roadmap sequenced R6→R7 assuming R2
sectioning worked; it doesn't. R7 (the trained sectioner) is the prerequisite.

- **Do now:** R7-W6 — build + evaluate the classifier **offline**.
- **Defer:** R7-W7 — deploy into live n8n/R2. Not needed to unblock R6.

---

## The collapse assumption (all three sources independently agree)

**Training labels are the editor's *edited* display titles; production inputs are
*raw* scraped titles.** The whole approach assumes these embed close enough to
transfer. Flagged independently by: my measurement (caveat on the 80%), the blind
Fable agent (its "validate first"), and the roadmap itself (line 449, "no
DisplayTitle leakage"). **This is the load-bearing risk.**

**→ R7-W6's real go/no-go gate = sectioning agreement on RAW candidate titles**,
rebuilt by joining `issue_history.json` events back to their raw Candidate rows
via URL. Not yet run.

### Feasibility measurement (this session — OPTIMISTIC upper bound only)
- TF-IDF + LinearSVC, 5-fold CV on 1,126 historical events (edited titles).
- **79.6% held-out accuracy vs 34% baseline.** Balanced across classes.
- Confusion is almost entirely **For Couples ↔ For Golden Age** (semantically real
  overlap). For Families is cleanest (f1 0.83).
- **Read: sectioning is learnable** (not noise) — but 80% is the ceiling; real
  (raw-title) number will be lower, and the fuzzy Couples/Golden boundary means
  abstention/review is load-bearing, not optional.

### Reproduction (2026-07-09, `eval/build_ambiguous_sections.py` env)
Re-ran independently to check the ad-hoc number wasn't a fluke — **it reproduces.**
- **The N reconciles: 1,126 = full 1,506 labeled events − 380 Local Aroma.** The
  original run was silently a **3-class** problem (Families/Couples/Golden), Local
  Aroma dropped. This was undocumented — recovering it matters: the "80%" was
  *never* on the full sectioning task. **Decide the class set deliberately in W6,
  don't inherit 3-class by accident** (Local Aroma is easy — f1 0.94 in the 4-class
  run — so including it inflates headline accuracy; excluding it is the honest hard number).
- 3-class LinearSVC title+desc: **77.0%** acc, Families f1 **0.82** (vs doc 79.6% / 0.83).
  ~2.6pt gap = TF-IDF/preprocessing tuning, not structural; doc number was flagged optimistic.
- Title-only (no description): 3-class **70.0%**; 4-class **73.8%** — description
  adds ~7pts, consistent with the description-dropout catch (§ New catches).
- Couples↔Golden confirmed as the dominant off-diagonal (56 + 52). Motivates
  `eval/ambiguous_cases_2026-07-09_*` — editor re-rules the tightest boundary cases
  (self-consistency check = the real label-noise ceiling on this pair).
- **Unchanged caveat:** both runs are on EDITED titles. Still not the raw-title go/no-go.

---

## The three views

| Dimension | Roadmap / §17 (our prior) | Blind Fable-5 design (cold) | Measurement says |
|---|---|---|---|
| **Core** | Trained classifier on ~2,729 historical `(title,section)` labels | Same — trained supervised classifier | Learnable (~80% optimistic) |
| **Representation** | **TF-IDF** | **Embeddings** (text-embedding-3-small) — TF-IDF vocab is city-specific, won't port to client #2 | TF-IDF already hits 80% on Vaughan |
| **Model head** | **LinearSVC** | **One-vs-rest calibrated logistic** — honest independent probabilities for overlapping sections + enables abstain thresholds | Abstain design is needed (fuzzy zone) → favors calibrated probs |
| **LLM role** | LLM as low-confidence **fallback + rationale** | **No LLM in v1** — deterministic flags instead (simpler, replayable) | n/a |
| **Low-confidence** | (implied) | Two flags: `NeedsReview-Ambiguous` (two high probs) vs `NoSection` (all low) | Couples/Golden overlap needs this |
| **Deploy** | Deploy to R2 (R7-W7) | Versioned JSON artifact, scored in Node | (defer W7) |

### Convergences (treat as settled foundation — validated by cold re-derivation)
- Trained supervised classifier on the editor's revealed placements. (Reject rules/R2; reject pure-LLM-primary.)
- Offline train in Python/sklearn → versioned artifact → score in Node, no model server.
- Abstain on low confidence is load-bearing.
- Portability = per-client config + retrain per client (matches per-base-models intent).

### Open decisions (for the critique + Ariel's call — NOT decided)
1. **Representation: TF-IDF vs embeddings.** Fable's portability argument (client #2) is strong; the counter is embeddings add an API dependency + their own provider-drift. *Proposed framing:* decide on the raw-title number — if TF-IDF holds ~75% on raw Vaughan titles, ship it v1; embeddings become the **client-#2 trigger**, not a v1 requirement (don't over-engineer for client #2 before client #1 is validated).
2. **Model head: LinearSVC vs calibrated OvR-logistic.** Low-cost swap; leans Fable (abstain design needs honest probabilities).
3. **LLM in v1: fallback+rationale vs none.** Leans defer — v1 ships with flags; add LLM rationale later if the editor wants explanations.

### New catches from the blind pass (add to scope regardless of architecture)
- **⚠️ Self-reinforcing `NoSection` drift (the real silent/live risk).** A wrong *section* is visible (editor moves it); an event silently dropped as "no section" never appears, never gets corrected, and since retraining uses published survivors, the newsletter **narrows irreversibly**. Mitigation: never hard-drop; weekly `NoSection`-rate alarm; one-click editor "rescue" → highest-value training labels.
- **Local Aroma rows as negative examples** — the only "none-shaped" signal (no reject pool).
- **Description-dropout at training** — 42% of live candidates lack a description; drop it randomly in training so the model doesn't lean on a field missing half the time.
- **Calibration tripwire** — if editor-override inside the auto-accept band > ~10%, auto-downgrade to suggest-only until retrained.

---

## Go/no-go gate (proposed — to confirm in review)
- ≥ 85% top-1 on the **unseen-title, raw-text** temporal test set, **no class < 75%**.
- ≥ 92% accuracy inside the auto-accept band at ≥ 80% coverage.
- Live-shaped check: run over one real cycle's candidates, hand-label ~150 stratified predictions, require ≥ 80% agreement.

## Portable interface (client #2)
- Per-client config: section names/count (**don't hardcode 3**), thresholds, per-source priors, Airtable IDs, artifact path.
- Canonical training schema `train.py labels.json → model_vN.json`; `labels.json` = client-agnostic `{text, section, date, url}`.
- Stable scorer API: `classify({title, description?, venue?, source?, city?, date}) → {section|null, confidence, alt, flag}`.
- Hardcode fine for Vaughan: scraper-specific title cleanup, emoji handling, the Vaughan label-extractor.

### Client-interview method (transferable to client #2 onboarding)
The obvious deterministic gates (alcohol→Couples, kids→Families) are **model-recoverable** — an LLM generates them cold, so eliciting them from the client cold wastes scarce meeting time. The interview's real value is elsewhere: (1) **pruning** the model's plausible-but-wrong gates, and (2) the **non-recoverable audience facts** an LLM can't infer (Vaughan e.g.: 75% women readers / woman decides for the couple; the run-now/re-run-in-weeks workflow). **Onboarding pattern: AI-generate the candidate gate list first → client validates/prunes; reserve live questions for the audience-specific residual.** (Source: 2026-07-09 client session.)

---

## Next steps — REWRITTEN 2026-07-15 (supersedes the 2026-07-09 sequence)

> **Why rewritten.** The old §4 said *"rebuild training set from raw titles (URL join)"* — **killed
> 2026-07-12**, and it sat stale in the authoritative doc for three days. The old order
> (review → critique → finalize → build) also assumed the design needed a once-over. It didn't:
> every front-loaded decision has been overturned by the first data that touched it (URL join died,
> class-set changed, per-source cut, PinotsPalette's prior cracked). **Design-ahead has a bad track
> record on R7; the checks are cheap enough that guessing costs more than looking.**
> New order: **cheap checks resolve the open decisions → then finalize → then critique.**

**Discipline (the guard against wandering):** every check below is tied to an open decision it
resolves. **If a check doesn't move #1, #2, or #3, it is not on the path.** 2026-07-15 is the
cautionary example — a session that went from "write Probe B" to health-checks to `Source` fields
to a ceiling argument and wrote no probe.

### Step 1 — Open `coef_` on the EXISTING fit (~10 min, resolves nothing alone; feeds Step 2)
`eval/build_ambiguous_sections.py` **already trains the exact stack** (`TfidfVectorizer(ngram_range=(1,2),
min_df=2, sublinear_tf=True, stop_words="english")` + `LogisticRegression(max_iter=2000, C=4.0,
class_weight="balanced")`) that produced the 77%. **Its coefficients have been on disk since 2026-07-09
and have never been opened.** Read the top-weighted words per class off `coef_`. Reuse this config —
inventing a second one measures a different model than the 77% being validated.
*Note:* `published_titles.json` (staged 07-11) **duplicates** what this script builds internally from
`issue_history.json`. `raw_candidate_titles.json` does not — nothing else touches the raw pool.

### Step 2 — Probe B (~10 lines, resolves #1) — *does TF-IDF survive production?*
Take Step 1's top-N words → check presence in `raw_candidate_titles.json` (1,805, frozen post-R1).
Aggregate gate, one number. **A fail kills TF-IDF outright and moots Step 3.**
Open sub-decisions (Ariel): **N** (single value vs a curve across 10/50/200/500), and
**weighted vs unweighted coverage** (95% of tokens present is a *pass* unless the missing 5% are the
highest-weighted). **Config gotcha:** `ngram_range=(1,2)` means bigrams are features — `wine tasting`
is one token, so the presence check must match bigrams, not just unigrams. `min_df=2` has already
pruned the vocabulary.

### Step 3 — Horse-race (most setup, resolves #1) — *whose ceiling is 77%?*
Embeddings vs TF-IDF on the same 1,126 published titles, same CV. **Never been run — no representation
other than TF-IDF has ever been tried.**
- Embeddings ≫ 77% → the ceiling was **TF-IDF's**; task is learnable, tool was the limit.
- Embeddings ≈ 77% → two representations hit the same wall → the task-ceiling hypothesis gets its
  first real support.

> **⚠️ The "~80% is the task ceiling" claim is NOT established** (corrected 2026-07-15, Ariel's
> pushback — the doc's own hedge was being argued past). Its evidence is weak: the **12/15
> self-consistency was measured on the 15 *deliberately hardest* boundary cases**, so it cannot be
> extrapolated to the corpus; and the **8 label conflicts are ~3-4% of rows — they cannot explain a
> 23% error rate**. Both are *leads*. Until Step 3 runs, **whose ceiling 77% is remains fully open**,
> and "77% is near human parity" is a hypothesis, not a finding.

### Step 4 — Resolve #2 (model head) and #3 (LLM in v1) on paper, against Step 1–3's answers
**#2 gains a non-accuracy argument (2026-07-15):** a TF-IDF + linear model **is not a program** — it's
a vocabulary dict + an IDF vector + a coefficient matrix, all JSON-serializable, and inference is
`w·x+b` ≈ 30 lines of JS. It ships as **a JSON file into the existing Node/n8n pipeline, with no infra**.
Embeddings or any heavier head forces a **permanent Python service** (host, monitor, latency). So the
model-head choice silently decides whether R7 ships as a file or as infrastructure — that is not an
accuracy question.

### Step 5 — Finalize → Decision_Log entry (records the R6↔R7 reorder + the architecture picks)

### Step 6 — Blind Fable critique + GPT-5.5 second opinion
**Deferred and narrowed (2026-07-15).** Not a whole-doc pass — that critiques a snapshot which is stale
in two days, and this doc changes every session. Run it against the **three resolved decisions with their
evidence**, once they've survived contact with data.

### Step 7 — Resume R6: section the fresh pool (high-confidence only) → generate pairs → editor labels → horse-race the scorers

**External, in parallel:** the editor's ~2hr editor-150 labeling slot is a **post-build gate** — book it
once predictions exist. Rough target was 07-18–21 (see 07-12 planning); Probe B has not started as of
07-15, so re-confirm at the 07-16 meeting.

**Deferred:** R7-W7 (deploy to live n8n) until after R6's pairs validate what the sectioner needs.
