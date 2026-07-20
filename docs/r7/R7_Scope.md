# R7 Scope — Section Classifier (WORKING DRAFT — finalize at Next steps Step 5)

> **Status (2026-07-16): pre-build checks phase.** Design capture (07-09) has been through four
> working sessions; the doc is now ordered **current-truth-first**:
> **§1 Settled** (don't re-litigate) → **§2 Open decisions** (#1–3) → **§3 Next steps + pre-registered
> gates** (the live plan) → **§4 Parked leads** (unverified, re-derive before acting) → **§5 Frozen
> background** (the 07-09 capture — historical, superseded where §1 disagrees).
> The architecture call is Ariel's, informed by critique — not delegated to a model.
> **Results append; they never edit history.**

---

## §1 Settled design (current truth — date-stamped, re-litigate only with new data)

**Class set = 3-class (Families / Couples / Golden), train on 1,126.** *(07-12)* Scope fact, not
tuning: **Local Aroma enters via a separate intake absent from the scraped candidate pool**, so the
classifier never sees it in production and must never output it. (1,126 = 376+383+367; the 380 Local
Aroma published events are dropped.)

**KILLED: the URL-join raw-title training rebuild.** *(07-12)* Wrong premise — the client does not
use the pipeline for selection yet (only at R8), so `issue_history` (published) and Candidates
(scraped) are **two independent samples**, not the same events twice. Exact-URL join yields only 69
pairs / 45 distinct titles (temporal hole + venue-vs-deep-link form mismatch). Kept only as a tiny,
civic-skewed transfer *test* set — useless for training.

**Validation = 3-probe transfer sequence** (replaces the dead join; test target is the **raw
candidate distribution** — that's what's actually segmented):
1. **Probe B** (pre-build): raw↔published **vocabulary overlap** — do the discriminative tokens the
   fit relies on appear in the raw pool? Decides open-decision #1; can kill early.
   **Aggregate gate, one pass** *(descoped 07-15 — per-source stratification demoted to
   fallback-if-marginal, top-4 sources only; rationale + counter-argument preserved in §4)*.
   **Corpora = serve-time text per event** *(corrected 07-16 — see pre-registered gates, §3)*.
2. **Probe A** (post-build): 69-pair raw kill-check (directional only — biased easy).
3. **Editor-150** (post-build): hand-labeled stratified raw candidates → the real gate-#3 number
   (≥80% agreement). The editor's ~2hr slot is a **post-build** external commitment — book once
   predictions exist.

**C/G boundary is genuinely fuzzy → abstention on this pair is load-bearing.** *(07-12)* Editor
blind re-ruled the 15 tightest Couples/Golden boundary cases → **12/15 (~80%) agree with his own
past placement** (`eval/ambiguous_cases_2026-07-09_RULINGS.tsv`). Held **loosely** (n=15, CI
~55–93%); the "directional C→G drift" read on the 3 disagreements was **dropped as n=3 noise**.
Ambiguity is quantified by the model's probability **margin** (small = hard). Soft design
assumption, not a measured ceiling — see the task-ceiling warning in §3 Step 3.

**Flex-flag design (parked, spans R7→R6).** *(07-12)* Low-margin C/G events get a **"flex" flag
emitted by R7**; the **R6/allocator resolves them** by filling whichever section is short that week
(scarcity resolves ambiguity for free). Clean split: **R7 emits, R6 consumes** — no flex logic in
the classifier. Two dials: **margin tunes flex *volume*; editor-150 checks flex *quality*** (true
dual-fit vs model-just-confused — different failure). Extends the existing flex-segment idea
(**Decision_Log — entry still to verify**). Margin calibration is a **build-time check** (the
calibration tripwire), not design-now.

**Feature set v1 locked.** *(07-13, measured on candidates_2026-07-12 snapshot, n=2,533; deliberately
stopping here rather than adding more before the baseline says what's needed)*
- **v1 = title + description + SourceCategories + source-prior (targeted).**
- **Description dropout ~47%**, not the earlier 42%: "all candidates" (32.6% missing) is diluted by
  ~2,300 older enriched records (1.4% missing); the **production-relevant post-R5 pool (added ≥
  Jul 4) runs ~47.5% missing** (n=217, small — re-measure as it grows). Calibrate dropout to the
  post-R5 rate. Description adds ~7pts (70%→77% 3-class), so include it **with dropout** so the
  model survives the ~half of production candidates that lack it.
- **SourceCategories = bag-of-tokens** (per-source tag-soup, inconsistent taxonomies) → TF-IDF
  handles natively; mild point for TF-IDF (clean keyword tags are its wheelhouse). Inspected
  07-16: platform taxonomy tags, not prose — three dialects (AllEvents lowercase slugs, Eventbrite
  curated pairs, BiblioCommons single labels); slugs tokenize into real words under sklearn's
  default tokenizer (`science-fair` → `science, fair`); AllEvents tags are noisy (`fitness` appears
  as an apparent default tag — fine as concatenated text, bad as a rule input). BiblioCommons
  descriptions carry a near-label prefix (`Audience: Children / Adult / Older Adult`) — captured
  for free by dumb concatenation; do **not** parse it into a structured feature.
- **Missingness is per-source and BIMODAL:** true signal-dead (no description AND no categories) is
  only **~15% post-R5 / ~9% all** — not the 47% description-only number. AllEvents (largest, 685)
  is ~3% desc but ~91% cats → not signal-dead. Death concentrates in **title-only single-venue
  sources: PinotsPalette (100%), RichmondHill (95%), Facebook (81%).**
- ~~**Source-prior as a TARGETED rescue**~~ — **KILLED 2026-07-16 by the editor's rulings.** The prior
  was scoped to the three title-only sources above (PinotsPalette, RichmondHill, Facebook); **all three
  were ruled "varies."** A prior must output one section with certainty; he gave rates. Zero valid
  instances — the lookup table has no rows. *(Any source derivation must still read the **URL, never
  the `Source` field** — §4.)*
- ~~**Deterministic-source routing (rule > ML)**~~ — **KILLED 2026-07-16.** Every source ruled
  "varies"; none is a fixed-*activity* venue. Consequences: nothing is hardcoded, and **nothing is
  dropped from train/eval** — the full 1,126 goes to the model, and the accuracy number needs no
  adjustment. Simplification, not a loss. (Rulings verbatim: `meetings/2026-07-16.md`.)
- **OPEN (Ariel's call) — does `source` become a FEATURE now the prior is dead?** *(07-16)* He handed
  over real per-source signal that only a feature can hold: **VPL/BiblioCommons ~90% not-Couples**,
  **ChefUpstairs not-Golden** (price), **PinotsPalette 0/33 Families** (alcohol → not Families — his own
  07-09 Q3 rule). A rule can't express a rate; a feature can, and it captures the hard and the soft
  cases without adjudicating which is which. Implementation is near-free: **append the source slug to
  the text** (`"Wine and Paint Night pinotspalette"`) — TF-IDF tokenizes it, no new machinery. Risk:
  source becomes a **shortcut** (model leans on `vaughanpl`, stops reading the title). **Decide by CV,
  not by argument** — run with and without the token, read the number; watch the shortcut in the
  per-class confusion.
- **PinotsPalette = flex, confirmed** *(07-16 — editor: "it's for both"; data: 16 C / 17 G / **0
  Families**, identical title in both sections, visible C→G→C→G rotation).* **The flex-flag design
  absorbs it for free** — identical text with conflicting labels → model learns ~50/50 → low margin →
  abstains → allocator resolves. No special-casing needed. ⚠️ Hold loosely: ~30 of the 33 are
  **sponsor-era contract rotation, not judgment** (§4); post-sponsor is n=3. **0/33 Families is the one
  hard fact.** **OPEN (Ariel's call):** keep or drop the ~30 sponsor rows from training. *Leaning keep*
  — those events arrive at serve time and abstention is what you want, and at 3% of rows it can't move
  77% either way (the same arithmetic that retracted the ceiling claim, §3 Step 3). Testable in CV.

**Settled foundation from the 07-09 capture (validated by cold re-derivation):**
- Trained supervised classifier on the editor's revealed placements (reject rules/R2; reject
  pure-LLM-primary).
- Offline train in Python/sklearn → versioned artifact → score in Node, no model server.
- Abstain on low confidence is load-bearing.
- Portability = per-client config + retrain per client.

**Blind-pass catches (07-09 — in scope regardless of architecture):**
- **⚠️ Self-reinforcing `NoSection` drift (the real silent/live risk).** A wrong *section* is
  visible (editor moves it); an event silently dropped as "no section" never appears, never gets
  corrected, and since retraining uses published survivors, the newsletter **narrows
  irreversibly**. Mitigation: never hard-drop; weekly `NoSection`-rate alarm; one-click editor
  "rescue" → highest-value training labels.
- **Local Aroma rows as negative examples** — the only "none-shaped" signal (no reject pool).
- **Description-dropout at training** (rate corrected to ~47% post-R5, above).
- **Calibration tripwire** — if editor-override inside the auto-accept band > ~10%, auto-downgrade
  to suggest-only until retrained.

**Post-build go/no-go gate (proposed 07-09 — confirm at Step 5):**
- ≥ 85% top-1 on the **unseen-title, raw-text** temporal test set, **no class < 75%**.
- ≥ 92% accuracy inside the auto-accept band at ≥ 80% coverage.
- Live-shaped check: one real cycle's candidates, hand-label ~150 stratified predictions
  (= editor-150), require ≥ 80% agreement.

**Corpus freeze (07-15, post-R1):** `published_titles.json` 1,126 rows (376/383/367) ·
`raw_candidate_titles.json` 1,805 unique raw titles. *(07-16: the raw side gets **one** re-staging
into serve-time text — title+desc+cats from the same `candidates_2026-07-15_0943` snapshot, so
provenance holds — then frozen again. Do not re-stage mid-analysis.)* Note: `published_titles.json`
duplicates what `build_ambiguous_sections.py` builds internally from `issue_history.json`; only the
raw file is unique.

---

## §2 Open decisions (Ariel's call — resolved by §3's checks, then recorded at Step 5)

1. **Representation: TF-IDF vs embeddings.** Fable's portability argument (client #2) is strong;
   the counter is embeddings add an API dependency + provider-drift. *Framing:* decide on the
   probe/raw evidence — if TF-IDF transfer holds, ship it v1; embeddings become the **client-#2
   trigger**, not a v1 requirement. Waits on Probe B (Gate 1/2) + horse-race (Gate 3).
2. **Model head: LinearSVC vs calibrated OvR-logistic.** Low-cost swap; leans calibrated logistic
   (abstain design needs honest probabilities). Plus the ship-as-a-file argument — see §3 Step 4,
   including the 07-16 softening.
3. **LLM in v1: fallback+rationale vs none.** Leans none — v1 ships with deterministic flags; add
   LLM rationale later if the editor wants explanations.

---

## §3 Next steps + pre-registered gates — REWRITTEN 2026-07-15 (supersedes the 2026-07-09 sequence)

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

### Pre-registered gates (2026-07-16 — fixed BEFORE Step 1's `coef_` was opened; Ariel's calls)

> **Why pre-registered:** thresholds set after seeing the data get rationalized ("74% is basically
> fine"). These are locked now so a marginal number can't argue its way past the gate. Results get
> appended below as they land — never edited in.

- **Probe corpora (corrects the 07-12/07-15 spec):** the existing fit trains on
  `displayTitle + " " + description` (`build_ambiguous_sections.py` — **descriptions are already in
  the 77% model**), so checking `coef_` tokens against raw *titles only* undercounts by construction.
  The probe checks coverage against **serve-time text per event: raw title + `DescriptionRaw` +
  `SourceCategories`, as available** (mirrors v1's feature text). Presence modes (snapshot 07-15,
  n=2,706): desc 68% · cats 37% · both 14% · **neither ~9%**. Report coverage overall + per
  presence-mode. → `raw_candidate_titles.json` (titles only) is **insufficient; re-stage with
  desc+cats** (plumbing). *(This also absorbs the 07-15 "Probe B2 for description transfer" idea —
  the main probe now measures the combined serve-time text directly.)*
- **Gate 1 — weighted token coverage** (each of the top-N tokens counts by its |coef_| weight; a
  missing token matters in proportion to how much the model leans on it):
  **≥85% pass · <70% kill TF-IDF · 70–85% marginal → run the per-source fallback (top-4
  sources) to see if the gap is concentrated before deciding.** N (single value vs curve) stays a
  keyboard call in the probe script.
- **Gate 2 — event blindness** (% of raw events whose serve-time text contains *zero* learned
  tokens — the model is structurally blind to these; every one is a guaranteed editor-fallback):
  **>20% kill.** Derivation, not vibes: target ≥70% auto-coverage for the tool to be worth shipping;
  expected C/G margin-abstains eat ~10–15% of the fallback budget on their own → ~20% is what's left
  for blindness. Cross-check: Gates 1+2 are the token-axis and event-axis of the same token×event
  matrix — **high coverage + high blindness = surviving vocabulary concentrated in part of the pool**
  (the hidden-bimodality failure mode), which routes to the per-source fallback.
- **Gate 3 — horse-race rule (Step 3):** embeddings must beat 77% by **≥5 pts (≥82%)** to rule "the
  ceiling was TF-IDF's" and switch representation. 5-fold CV on n=1,126 has ~±2–3 pts fold noise, so
  **≤+3 = same wall** → first real support for the task-ceiling hypothesis; **+3–5 = judgment call,
  made then.** ⚠️ A tie does **not** mean embeddings are useless: their real advantage
  (paraphrase-robustness under raw↔edited drift) is invisible to this race — it's published-vs-published,
  exact-token-friendly ground. Transfer is measured by Probe B and editor-150, not here.

### Step 1 — Open `coef_` on the EXISTING fit (~10 min, resolves nothing alone; feeds Step 2)
`eval/build_ambiguous_sections.py` **already trains the exact stack** (`TfidfVectorizer(ngram_range=(1,2),
min_df=2, sublinear_tf=True, stop_words="english")` + `LogisticRegression(max_iter=2000, C=4.0,
class_weight="balanced")`) that produced the 77%. **Its coefficients have been on disk since 2026-07-09
and have never been opened.** Read the top-weighted words per class off `coef_`. Reuse this config —
inventing a second one measures a different model than the 77% being validated.
**Fit caveat (found 2026-07-16):** the script trains over ALL sections incl. Local Aroma, not the
locked 3-class set — decide whether to re-fit 3-class before reading `coef_`, since Local Aroma
vocabulary shapes the shared vectorizer.

### Step 2 — Probe B (~10 lines, resolves #1) — *does TF-IDF survive production?*
Take Step 1's top-N words → check presence in the **serve-time corpora** (pre-registered gates
above). Gates 1 (weighted coverage 85/70) and 2 (blindness >20% kill) are locked.
**A fail kills TF-IDF outright and moots Step 3.**
Remaining sub-decision (Ariel, at the keyboard): **N** (single value vs a curve across 10/50/200/500).
Weighted-vs-unweighted is decided: weighted (Gate 1). **Config gotchas:** `ngram_range=(1,2)` means
bigrams are features — `wine tasting` is one token, so the presence check must match bigrams, not
just unigrams; `min_df=2` has already pruned the vocabulary.

### Step 3 — Horse-race (most setup, resolves #1) — *whose ceiling is 77%?*
Embeddings vs TF-IDF on the same 1,126 published titles, same CV. **Never been run — no representation
other than TF-IDF has ever been tried.** Decision rule = Gate 3 above.

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

> **Softened 2026-07-16 (Ariel's challenge, correct):** the "embeddings force a permanent Python
> service" claim overstated it. **API embeddings** (Node calls an embeddings endpoint, the trained
> linear head is still a JSON `w·x+b` applied locally) add **no new dependency kind** — the build path
> already calls an LLM API every issue (`generateBlurbs.js`), and R7-W6 is offline/batch anyway (deploy
> is W7). The **residual, real asymmetry**: a TF-IDF artifact is self-contained and deterministic
> forever; an embeddings head is **coupled to a third-party model's lifetime** (provider deprecates the
> embedding model → re-embed + retrain), raw text flows to an external API, and local open-weight
> embeddings would add a Python step (a script, not a service, at weekly batch cadence). The head
> choice is a **closer call** than file-vs-infrastructure framing suggested — decide it on Step 1–3's
> evidence plus the coupling cost, not on infra fear.

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

### Results log (append-only — never edit prior results)

**2026-07-17 — Step 1 DONE: the fit exists (`eval/fit_section_classifier.py`) and `coef_` is read.**
- **CV = 78.68% (cv=5, 3-class, title+desc, locked config C=4.0).** Reproduces the 07-09 3-class
  baseline (77.0%) within tuning noise. Training accuracy 98.57% (the overfitting gap, on 2692
  features / 1126 rows).
- **FLAT across hyperparameters.** C (0.5–6; best 0.79 @ C=2), min_df, and cv (cv=10 → 80.5%, a
  looser estimator not a better model) all leave the score at **78–80%**. → **Not
  overfitting-limited; the ceiling reads as the TASK's, not the representation's.** Direct support
  for running Gate 3 (horse-race) — and a prior that embeddings will *also* stall near 78% unless the
  wall is raw↔edited drift (which the race can't see; only Probe B / editor-150 can).
- **`coef_` top-10/class = REAL SIGNAL, not artifacts** (the session's core question):
  Couples → wine/dinner/date/couples/live; Families → family/kids/ages/activities/explore;
  Golden → seniors/yoga/social/connect/club. The 78% keys on section-meaningful words → robust to
  reworded production text.
- **NEW — C/G vocab looks BETTER-SEPARATED than §1/§5 assumed.** Couples (romantic-evening) vs Golden
  (gentle-community) barely overlap in the top tokens. **Mildly challenges the fuzzy-boundary premise
  behind abstention** — the 22% error may concentrate in title-only/blind events rather than C/G
  bleed. **Hold loosely** (top-10 eyeball, not a measurement); the **confusion matrix is the arbiter**,
  and it must land before the abstention volume is tuned. Note the tension with §5's 07-09 read
  (Couples↔Golden = dominant off-diagonal, 56+52) — reconcile at the confusion-matrix step.
- **Artifact/shortcut smell (watch):** `check`/`tickets`/`book tickets` rank high in Couples —
  ticketed-source booking language, not couple-semantics. First wild sighting of the
  **source-as-shortcut** risk (§1's `source`-as-feature caveat). Watch the per-class confusion when
  the `source` token is tested.
- **Probe B N = a CURVE, not a scalar** (resolves the open Step 2 sub-decision's framing): because
  Gate 1 coverage is |coef_|-weighted, near-zero-weight tail tokens add ~nothing, so weighted coverage
  **flattens past some N**. Run 10/50/200/500 and stop at the flattening point — that N captures the
  tokens the model actually leans on. The question is "do the *weighted* words survive," not "do all
  ~2,700."

---

## §4 Parked leads (from the 2026-07-15 staging session — UNVERIFIED unless noted)

> **⚠️ EVERY NUMBER IN THIS BLOCK IS UNVERIFIED** unless marked otherwise — from throwaway inline
> `node -e` scripts against the `candidates_2026-07-15_0943` snapshot and `issue_history.json`,
> **not saved as re-runnable code**. Treat each as a *lead*: **re-derive before acting**, then write
> it down as fact.

- ~~**PinotsPalette is NOT deterministic**~~ — **RESOLVED 2026-07-16, moved to §1.** Client confirmed
  "it's for both"; data confirmed 16 C / 17 G / 0 Families with the identical title in both sections.
  Flex hypothesis (Ariel, 07-15) was right. The prior is dead; the flex-flag absorbs it.

### New leads — 2026-07-16 (post-meeting analysis; verified where marked)

- **⚠️ The Pinot's flex read is contaminated by a dead sponsorship. (VERIFIED — `issue_history.json`.)**
  ~30 of the 33 Pinot's events carry `10% off exclusively for Vaughan Brief readers` and run
  **2025-03 → 2025-09**. That era's clean C→G→C→G alternation is **contract rotation, not editorial
  judgment** — the design thesis is imitate *revealed preference*, and a rotation schedule isn't
  preference. Client (07-16): **no longer a sponsor, but the editor still includes it.** Post-sponsor:
  **3 events in 6 months** (2 G, 1 C) — n=3, unreadable, and ~10× less frequent than the training data
  implies (2.9% of rows vs ~0.5% going forward). *Also unresolved:* it ran in **both sections of the
  same issue** on 2025-02-20 and 2025-03-20 — contradicting his 07-09 Q4 rule (*"never the same
  issue"*). URLs not checked; could be two distinct sessions sharing a title.
- **The Golden Age section did not exist in January 2025. (VERIFIED.)** 2025-01: Families 14 / Couples
  14 / **Golden 0**; it launches 2025-02. So ~28 January rows were labeled when **Golden wasn't an
  option** — an event filed Couples then might be Golden today. Small (~2.5% of 1,126) but pointed
  straight at the C/G boundary, which is the hardest pair. Consider dropping pre-2025-02 rows; test in
  CV rather than assuming.
- **The 5/5/5 per-issue balance is a QUOTA, not editorial preference. (VERIFIED.)** Every month is
  exactly balanced across the three sections — that's `CLAUDE.md`'s segment quota, not the editor
  liking three audiences equally. **Do not read 376/383/367 as signal about the incoming pool's real
  mix**, which remains unmeasured (and matters for the 400-label draw — see `meetings/2026-07-16.md`
  Item 1's sampling caveat).
- **CORRECTED: Facebook did not "drift away" — it is PAUSED pending go-live.** Facebook was the top
  published source 2025-09 → 2026-05, then stops. This is **not** a train/serve distribution shift:
  `Execution_Log` says the client stopped uploading *because the pipeline isn't live*, and FB is manual
  paste intake (Decision_Log §49). It resumes at R8. Training weight is predictive, not stale.
- **Facebook is structurally title-only, by design — and R7 can never fix it.** Intake schema is six
  columns (`Title | StartDate | EndDate | LocationName | City | Link`) and the prompt forbids
  descriptions/categories (`docs/client_prompts/4_VB_FACEBOOK_INTAKE_v1.md`). §50 also accepts a
  **~17% title-misread rate** behind the editor backstop. The link-at-selection enrichment (§49) is
  **downstream of R7** — R7 sorts candidates; the link arrives when the editor picks. And FB event IDs
  are **not derivable** from title/date/venue (§49), so no reverse-lookup exists. Saving grace: FB is
  ~13 events/week (<1% of candidates), so it cannot move Gate 2's blindness rate. It just means the
  model abstains on most FB events. **Only fix that could reach R7: add a `Description` column to the
  intake prompt — viable only if the feed screenshot actually shows post text (§49 notes it lacks URLs;
  descriptions unverified).**
- **⚠️ Facebook's "58% of clicks" is probably an attribution error. (UNVERIFIED — Ariel, 07-16.)** R5
  measured FB at 17–22% of placements but 58% of clicks. That says *the editor found those events via
  Facebook* — **not** that they exist only on Facebook. FB was his discovery channel when the pipeline
  pulled ≈only Eventbrite (R5_Log:190); coverage is now 10+ sources and the same community events
  plausibly appear in AllEvents/VPL/Eventbrite **with descriptions and categories attached**. If true,
  FB's title-only problem largely evaporates — you'd classify the AllEvents copy. Counter-evidence
  (weak): 07-16's `overlapAudit.js` found only **19 fuzzy clusters / 12 cross-source out of 2,706**
  (~0.4%) — but fuzzy *title* matching is the wrong instrument for "same event, different phrasing per
  source," the same failure that made the URL join return 69 pairs. **Check this before spending
  anything on a Description column or spike #67.**
- **Label conflicts in the training corpus — irreducible noise if real.** Apparently **8 titles
  published under 2+ sections** (identical string, contradictory label): `Woodbridge Village
  Farmers Market` (all three), `Wine and Paint Night`, `Pottery Workshop`, `Make Your Own Perfume`.
  Same input vector, two targets — no tuning removes it. Skew is **overwhelmingly C↔G** →
  independent corroboration of the 12/15 self-consistency read, strengthens the flex-flag design.
  **→ Re-derive count + skew; then it informs a realistic accuracy target for gate #3.**
- **Dedup the PUBLISHED corpus — at classifier build, not now.** ~1,126 rows / ~1,042 unique
  (~84 surplus, ~41 repeated); `stage_corpora.js` dedupes only the raw side. Irrelevant to Probe B
  (a vocabulary is a set) but matters at fit time: **IDF is document-frequency based** — 19 copies
  count as 19 documents. **→ Rule on it when fitting TF-IDF.**
- **The `Source` field is display-only — read the URL instead.** *(REPRODUCIBLE via
  `overlapAudit.js`, unlike the rest of this block.)* Blank on ~513/2,706 (~19%). Field vs URL:
  Eventbrite ~164 vs ~582 (~418 gap), AllEvents ~728 vs ~808; gaps reconcile to the blanks.
  Mechanism: `Source`-present and `LocationName`-present are the *same* records (one pre-R5
  enrichment step wrote both; legacy predates it). **→ Any source-prior derives source from URL,
  never the field** (the field would silently drop ~418 Eventbrite events). URL coverage ≈ 99.9%.
  Tracked as issue #92.
- **Per-source vocab stratification → DEMOTED to fallback** *(07-15, Ariel's method-fit call)*.
  Cut from Probe B's critical path: the probe is a **binary go/no-go** (an aggregate question);
  per-source yields ~13 numbers, most on n<100 (tail 13–24 = the small-n trap already rejected for
  the C/G drift read); and it doesn't change the decision (pass → build; ragged tail → still build,
  v1 already handles title-only sources). **Counter-argument, kept:** TF-IDF matches *exact tokens*
  (`Storytime` ≠ `Story Time`; embeddings absorb this), so per-source drift is precisely TF-IDF's
  failure mode — and the aggregate is **volume-weighted** (AllEvents ~40% could carry a passing
  number while thin sources fail silently). **→ Aggregate gate first; if marginal, stratify top-4
  only (AllEvents / Eventbrite / VPL / BiblioCommons), where n supports a read.**
- **Raw corpus must NOT be rebalanced.** Excluding AllEvents to "balance" the raw pool was
  considered and **rejected**: the raw corpus is a **test set**; its only job is to resemble
  production, and AllEvents *is* ~40% of production. Balancing is a training-set instinct; applied
  here it buys a cleaner number that predicts nothing.
- **Unionville normalize logic** — post-R1 checks (07-15) flagged 10/10 `MISSING_LINK` rejections
  from Unionville alone (issue #93). Not R7 work; noted for adjacency only.

**Parked feature work (07-13 — explore only if the baseline underperforms; do NOT build speculatively):**
- **Feature inventory sweep not yet done.** v1 was assembled by following the thread, not sweeping
  every field. Unassessed: `LocationName`, `City`, `CostRaw`, `Organizer`, `Start Date` (→
  day-of-week/weekend), `Source`. Some plausibly carry signal (weekend↔family/couple; cost↔date-night
  vs free-family; venue strong). Assess at finalization or if v1 falls short. Tempting-but-forbidden:
  `SegmentSuggested` / `LLM_Rationale` are *outputs* of the dead R2 sectioner, not inputs.
- **"Usable" vs merely-present description** — the ~47% is a *structural* blank check; a semantic
  contentful-vs-fluff check would push true-missing somewhat higher. Deferred.
- **Fable "what other features?" question** — at the Step 6 critique, ask which features to add
  given the field inventory and which are traps. **First research how to prompt Fable** — anecdotally
  general prompts beat sharp/loaded ones; test both framings. Don't research now.

---

## §5 Frozen background — the 2026-07-09 capture (historical; §1 wins where they disagree)

### Why R7 now (the discovery that reordered the roadmap)
R6 (within-section scorer) was being built when its pair-collection harness hit a wall: it needs a
pool of candidates **already assigned to a section**, and the step that does that (R2 enrichment) is
**dead / effectively unused**. The fresh post-R5 pool (~1,045 future events) is rich on every raw
signal (venue 99%, source 100%, title 100%) but carries **no section label**. The old `Enriched`
cohort is stale (pre-R5: venue 24%, source 22%) and its sections came from the same bad R2.
**So R6 has a hidden dependency on R7.** Decision_Log §61 records the reorder.
Do now: **R7-W6** (offline classifier). Defer: **R7-W7** (live deploy).

### The collapse assumption (all three sources independently agree)
**Training labels are the editor's *edited* display titles (+ blurb descriptions); production inputs
are *raw* scraped text.** The whole approach assumes these embed close enough to transfer. Flagged
independently by: the measurement caveat, the blind Fable design ("validate first"), and the roadmap
(line 449, "no DisplayTitle leakage"). **This is the load-bearing risk.**
*(The original mitigation here — "rebuild training set via URL join" — was killed 07-12; the live
mitigation is the 3-probe sequence, §1.)*

### Feasibility measurement (07-09 — OPTIMISTIC upper bound only)
- TF-IDF + LinearSVC, 5-fold CV on 1,126 historical events (edited titles).
- **79.6% held-out accuracy vs 34% baseline.** Balanced across classes.
- Confusion almost entirely **Couples ↔ Golden** (semantically real overlap); Families cleanest
  (f1 0.83).
- Read: sectioning is **learnable** — but this is a ceiling measured on edited text; the raw number
  will be lower, and the fuzzy C/G boundary makes abstention load-bearing.

### Reproduction (07-09 evening, `eval/build_ambiguous_sections.py` env)
Re-ran independently — **it reproduces.**
- **The N reconciles: 1,126 = 1,506 labeled − 380 Local Aroma.** The original run was silently
  **3-class**; undocumented until recovered. The "80%" was *never* on the full sectioning task
  (Local Aroma is easy — f1 0.94 in 4-class — and inflates headline accuracy). Class set was then
  decided deliberately (§1).
- 3-class LinearSVC title+desc: **77.0%** acc, Families f1 **0.82** (vs doc 79.6%/0.83; ~2.6pt gap =
  TF-IDF tuning, doc number flagged optimistic).
- Title-only: 3-class **70.0%**, 4-class 73.8% — **description adds ~7pts**.
- Couples↔Golden confirmed dominant off-diagonal (56 + 52) → motivated the ambiguous-cases probe.
- Both runs on EDITED text — never the raw-side go/no-go.

### The three views (07-09 capture)
| Dimension | Roadmap / §17 (our prior) | Blind Fable-5 design (cold) | Measurement says |
|---|---|---|---|
| **Core** | Trained classifier on historical `(title,section)` labels | Same — trained supervised classifier | Learnable (~80% optimistic) |
| **Representation** | **TF-IDF** | **Embeddings** (text-embedding-3-small) — TF-IDF vocab is city-specific, won't port to client #2 | TF-IDF already hits 80% on Vaughan |
| **Model head** | **LinearSVC** | **One-vs-rest calibrated logistic** — honest independent probabilities + abstain thresholds | Abstain design is needed → favors calibrated probs |
| **LLM role** | LLM as low-confidence **fallback + rationale** | **No LLM in v1** — deterministic flags (simpler, replayable) | n/a |
| **Low-confidence** | (implied) | Two flags: `NeedsReview-Ambiguous` (two high probs) vs `NoSection` (all low) | Couples/Golden overlap needs this |
| **Deploy** | Deploy to R2 (R7-W7) | Versioned JSON artifact, scored in Node | (defer W7) |

### Portable interface (client #2)
- Per-client config: section names/count (**don't hardcode 3**), thresholds, per-source priors,
  Airtable IDs, artifact path.
- Canonical training schema `train.py labels.json → model_vN.json`; `labels.json` = client-agnostic
  `{text, section, date, url}`.
- Stable scorer API: `classify({title, description?, venue?, source?, city?, date}) →
  {section|null, confidence, alt, flag}`.
- Hardcode fine for Vaughan: scraper-specific title cleanup, emoji handling, the Vaughan
  label-extractor.

### Client-interview method (transferable to client #2 onboarding)
The obvious deterministic gates (alcohol→Couples, kids→Families) are **model-recoverable** — an LLM
generates them cold, so eliciting them from the client cold wastes scarce meeting time. The
interview's real value: (1) **pruning** the model's plausible-but-wrong gates, and (2) the
**non-recoverable audience facts** (Vaughan: 75% women readers / woman decides for the couple; the
run-now/re-run-in-weeks workflow). **Onboarding pattern: AI-generate the candidate gate list →
client validates/prunes; reserve live questions for the audience-specific residual.** (Source:
07-09 client session.)

**2026-07-18 — the 400 re-scoped: gate + train, not gate-only (resolves the 07-16 open split).**
- **Draw = 150 representative (gate) + 215 low-margin (train) + 35 repeats.** **Score the two slices
  SEPARATELY** — the train slice is deliberately hard, so a pooled number is biased low and estimates
  nothing. Slice membership is recorded in `eval/deck/answer_key_2026-07-18.csv`.
- **Why tilt to training** (Ariel's call): at **78.68% vs an 85% gate**, certification fails today even
  in the optimistic case — raw ≥ published is not plausible, and *equal* still fails. So the editor's
  weekend buys training data instead of measuring a known failure. **Why keep 150 anyway:** an all-hard
  draw can measure neither production accuracy nor the **confident-but-wrong** rate — the failure mode
  margin filtering can never catch (live example: a realtor seminar predicted Golden at 0.694). 150 is
  a sanity read (CI ~±8), explicitly not certification.
- **Uncertainty sampling needed two corrections, both measured rather than assumed:**
  1. **Blind ≠ ambiguous.** The lowest-margin events skew to *thin text*: train-slice median **5** known-
     vocabulary hits vs **8** pool-wide, and it captured **all 44** zero-vocab events. Those are events the
     **editor** also cannot judge — so uncertainty sampling selects where label quality will be *worst*, and
     noisy labels on hard cases move the boundary randomly. Fix: prefer low-margin events *with* a
     description; cap blind at 35 (16%).
  2. **Single-activity venues flood the draw.** Pinot's titles are painting names (`Beach Bug`, `Boba
     Besties`) carrying no section signal → near-zero margin → **28 rows (7%)** of the deck. Capped to 2 in
     *both* slices — not just train — because **a flex venue has no single correct label**, so scoring a
     designed abstention as a miss *depresses* the accuracy number rather than making it representative.
- **NEW: all 44 vocabulary-blind events predict Golden.** With no matching terms the model emits the same
  near-uniform triple (`0.339 / 0.303 / 0.358`), and Golden wins it every time. A blind event's predicted
  class is therefore **noise, not signal** — relevant when reading Gate 2, and it is why the train slice's
  raw predicted mix looked Golden-skewed (84/67/64) before balancing on meaningful predictions only.
- **Language policy, derived from behaviour:** the editor has published **1 non-Latin title in 1,506**, and
  it was a restaurant *name* in a Local Aroma highlight — **zero non-English events have ever run.** Filter
  by **ratio, with a local-venue exemption**: the discriminator is *geography, not language* (VPL's
  `Hebrew Storytime` is local programming; a France-based webinar is not). See `source_decision_sheet.md`
  — the standing "allowlist subsumes #41" claim holds only for foreign events, not local non-English ones.
- **Editor captures `Section` + `Flag` (Either / Unsure), not per-row rationale.** Free text costs 3–5× the
  labelling time **and changes the behaviour being measured** — forced justification yields considered
  reasoning, while the pipeline must replicate fast editorial instinct. `Either` is the flex-flag design's
  only ground truth; `Unsure` is the distinct "listing too thin to judge" case. Rationale is deferred to a
  post-hoc pass over the `Either` rows, after all labelling is done so it cannot contaminate.

**2026-07-19 — SCOPE DECISION (Ariel): R7 is two stages — include/reject filter + section
classifier — and the gate is redefined over includable events.**
- **Why:** the criteria walkthrough (meetings/2026-07-19.md) closed the editor-error question —
  None replicated at 50% on 26 never-seen events. "None" is ~6 distinct mechanisms, 12/13
  event-based (text, not listing) — so the reject stage is real work, it is the stage the editor
  actually finds hard, and nothing anywhere in R1/R2 implements it (isBusinessy is dead code, #94).
- **Gate redefinition:** §1's ≥85% top-1 gate is scored against labels that conflate *fails
  criteria* with *outranked this week* — a target that is not a function of the event text. The
  classifier's gate becomes **section accuracy over events the editor would include** (None rows
  excluded from the denominator). Pre-call read of that number: 59% overall, but **86% at margin
  >0.5 (n=14), 100% at >0.7 (n=7)** — junk entering the confident band, not section confusion, is
  the dominant failure. The filter's own gate: TBD after the mechanism decomposition (below).
- **The filter is a named scope ADDITION, not a drift** — recorded here per the meeting doc's
  "not a call to make by drift." Design input owed first (Ariel):
  **mechanism → tool decomposition** — for each of the six None mechanisms, rule-over-fields /
  trained model / editor-maintained list / not-a-property-of-the-event. The ~200 labeled Nones
  (~400 after batch 3) are the filter's training/eval data — the reason batch 3 shipped
  unfiltered and unretilted.
- **Batch 3 shipped as drawn (07-19), decision recorded:** retilting toward high-margin
  (confirm the confident band) or low-margin (study None) was considered and rejected — the
  draw already carries 23 gate rows at margin >0.5 / 9 at >0.7 (doubling the confident-band n
  for free), low-margin oversampling re-commits the blind≠ambiguous error (thin text ≠ junk;
  the junk that matters is high-margin junk), and any retilt destroys the 35 pairs, the gate
  slice's representativeness, and the seam test. New questions get new draws.
- **Pre-registered before batch 3 returns:** batches 1–2 (pre-call) and batch 3 (post-call) are
  different instruments — **score separately, seam test first**: if batch 3's gate None-rate ≈
  38.6% (batches 1–2), the call didn't move his standard and the halves may pool; if it
  diverges, they stay separate and the 35 pairs partly measure the call, not his stability.
  All 35 pair-halves sit in batch 3 (verified 07-19: min gap 115, zero walkthrough leakage).
- **Probe B addendum (pre-registered 07-19, before the probe has run):** the probe itself is
  UNCHANGED — build and thresholds exactly as locked 07-16. But Gate 2's blindness is measured
  over the full 1,805 pre-filter pool, and the two-stage scope means the classifier's serve-time
  population is post-filter survivors. Blind events skew junk (thin-text→None), so all-pool
  blindness OVERSTATES classifier blindness. Therefore **a Gate 2 fail is provisional** — re-read
  blindness over includable events (editor labels on the 44 zero-vocab rows now; the post-filter
  pool once the filter exists) before killing on it. Gate 1 unaffected (junk only adds tokens to
  the raw vocab; if anything it mildly flatters coverage — relevant only on a razor-thin pass).
