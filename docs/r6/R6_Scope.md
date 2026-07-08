# R6 Scope — Scoring

**Owner:** Ariel
**Status:** DRAFT v1 (2026-07-07) — pending single critique pass (Decision_Log §58); issues open only after finalization.
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md` § Release 6 (+ 2026-06-04 Amendment, 2026-06-30 PRE-R6 Addendum) — frozen intent. This doc supersedes it for status and approach; read the roadmap only for original intent.
**Read order:** this doc → `eval/README.md` (label legend) → Decision_Log §59/§60 → roadmap R6 (intent only).

This doc is the single home of the R6 approach. It absorbs the findings deliberately batched from the 2026-07-04→07 planning sessions (the §28 zero-signal verdict superseded; venue signal forward-only) — they live here now, not piecemeal in the Decision_Log, per the batch-at-draft call (§58). The formula-vs-LLM decision (§3 below) gets its own Decision_Log entry at finalization; this doc will point to it.

**Change protocol:** decisions here carry explicit *revisit conditions*. When one fires, the change is a new Decision_Log § plus a pointer edit here — never a prose patch or a rewrite. Status lives only in the snapshot; tasks live in issues once opened.

---

## R6 Status Snapshot (as of 2026-07-07)

Single source of truth for "where are we."

**Phase:** scope drafted. Prerequisite data work complete; awaiting critique pass → finalize → open `r6` issues (§58: issues come from the finalized doc, not before).

**Done (prereqs):**
- Eval set frozen & committed: `eval/click_join_FROZEN_2026-07-07.{json,csv,txt}` — 924 records, 85.8% coverage, 7-day maturation cutoff (§59, §60). Legend: `eval/README.md`.
- `fetchBeehiivHistory.js` extension (roadmap W4 step 0a) — was already done; `issue_history.json` carries editor-final DisplayTitle/Description/CTA + slot across 77 issues.
- Signal-inventory sweep complete, including the three previously-open checks (venue normalization, City variance, `Score_*` history) — §2 below.
- Within-issue A/B statistical power quantified (2026-07-07 session) — §4. Resolves the "check power before betting on it" open item: at ~13k subs only large selection effects are ever provable; swap-rate is the only fully-powered instrument we own.

**Decided in this doc:**
- Scoring architecture: **formula-shaped hybrid** — transparent weighted sum over 3 signals (source prior, venue recurrence, LLM content-fit), hand-set weights (§3).
- LLM-signal grounding: **dynamic few-shot selection at runtime**, reusing Decision_Log §17's mechanism with the sort key swapped to editor-recency, never clicks (§3).
- `City` cut as a scoring signal; eligibility gate only (§2).
- Date-spread constraint (roadmap W5 step 6, "leaning drop"): **dropped**, ratified for consistency with §30 (§3).
- Validation: editor-order backtest = target; frozen click set = floor; forward swap-rate = the real gate; CTOR = monitoring north-star (§4).

**Out of R6 (parked, not forgotten):**
- **#87** "beat the editor via smarter selection" — milestone `Future`, gated on R6+R7 being live. Go/no-go bar set by the §4 power math: only worth building if the believed effect is *large* (+50%-ish, detectable in weeks); small improvements are permanently unprovable at this list size. Its counterfactual dataset accrues passively meanwhile (§7).
- Recurring-event recovery (~103 lost picks) — deferred per §59; revisit only if the click floor check proves too noisy.

**Inherited obligations (from R5 close):**
- **#82** — health-check suite + FIELD_MAP walkthrough *before* R6 edits those same nodes.
- **#69** — blank-`Source` backfill (407 pre-R5 legacy blanks), lands in R6 build.
- **Geo/city config extraction** (R5 reusability disposition) — bundles into the R6 build pass: scoring config + city constants extracted together, one careful pass per node, not two.
- GPT-5-mini eval (roadmap W4 step 5 / Debt #13) — carried; pairs with the LLM cost measurement in §7.

**Standing close-gates (every release, per `docs/README.md`):** milestone-completeness check (no unmilestoned orphans; every R6-milestone issue closed or dispositioned) + reusability/config check (nothing new Vaughan-baked outside config).

**Effort:** ~26–40h active was the 2026-07-07 from-scratch estimate, with the swing in the formula-vs-LLM decision — now made, best guess ~30h.

**Next action:** critique pass on this doc → finalize → Decision_Log entry for §3 → open `r6` issues.

---

## 1. What R6 is and isn't

**R6 = imitation.** It replaces "sort by earliest date" with a scorer that replicates the **editor's picks and order**. A *perfect* R6 leaves clicks roughly **flat** — the payoff is automation (no manual triage of a ~1,900-candidate pool), consistency (same judgment every week, no fatigue), and a **scored substrate** that everything later (R7, #87, client #2) builds on. It is a pool sorter, not an auto-decision maker: both R3 auto-allocation and the editor's curation view consume the same `Score_Final` ranking, and the editor keeps override (§29).

**R6 imitates the editor's order, not the click order.** The frozen click set is a **floor/sanity check** — does R6's output positively correlate with real clicks? — not the target. The two orders are measurably different: the editor's own slot gradient is only 0.60→0.43 across slots 1–5 (`eval/README.md` §7), i.e. the editor loosely tracks clicks, so a faithful imitation reproduces that *imperfect* gradient. A scorer that matched clicks perfectly would already be beating the editor — which is **#87**, explicitly out of R6. Do not collapse "match the editor" and "match clicks" anywhere downstream of this doc.

Two sharpenings from the 2026-07-07 planning session, because the collapse is seductive:
- **An imitator and an optimizer read the same variables; they differ in the target.** Same features (title words, venue, source), different label (editor's choice vs clicks) — the same feature can carry opposite weights under the two targets. "Similar inputs" does not make them the same build.
- **The imitator is the on-ramp to #87, not a detour around it.** A click-optimizing selector has no training or eval data today (no reject pool, no counterfactuals). Once R6 is live, every editor override is a recorded formula-vs-editor divergence with an observed outcome — the dataset #87 needs, generated passively (§7).

**Scope:** R6 scores the three event sections — For Families, For Couples, For Golden Age Readers. Local Aroma and Trust Me Recipe are untouched (editorial content, not events; Trust Me Recipe is manual by hard rule).

---

## 2. Signal-inventory sweep

Fill → variance → backtestability, on the post-R5 cohort (n=1,886, `Added to Base Date` ≥ 2026-06-01, snapshot `candidates_2026-07-03_1549.json`). This table supersedes the 2026-06-04 zero-signal audit — R5's source diversification revived what that audit declared dead (Eventbrite 93%→6%; `Source`/`LocationName` 0%→94/95%).

| Field | Fill | Variance / usability | Backtestable vs clicks? | Verdict |
|---|---|---|---|---|
| `Source` | 94% | 13 sources, none dominant | Partial at best (§7 open item) | **Survivor** — source prior |
| `LocationName` | 95% | 494 distinct strings; normalization **passes** (see below) | **No** — 4% time-overlap with click set | **Survivor** — venue recurrence, forward-only |
| `City` | 100% | 3 real values (Vaughan 60 / Markham 21 / R.Hill 17%) | No | **Cut** — eligibility gate only; ranking by city is an editorial policy the client rejected (R5-W1: all three cities same tier). Revisit only if the client states a geographic preference. |
| `Start Date` | 100% | fine | n/a | Recency **struck** (§30, cut list); only weekend/day-of-week derivations eligible, and only if the editor's picks show a pattern worth encoding |
| `SourceCategories` / `Organizer` / `SourceScore` | 42 / 36 / 36% | sparse; `SourceScore` is an AllEvents vendor passthrough (611/611 AllEvents records, ~0 elsewhere), semantics unowned | no | **Out** |
| `CostRaw` | 14% | dead | no | **Out** |
| `Event Title` / `DescriptionRaw` | 100 / 61% | unstructured | Yes — via the LLM signal (§4) | **Feeds the LLM signal**, not the structured table |

**The three previously-open checks, resolved (measured 2026-07-07):**

- **(a) Venue normalization — passes.** Light normalization (case/punctuation/whitespace) collapses only 2 of 494 raw strings; 81.2% of venue-bearing records share their exact string with another record. Same-venue→same-value holds: sources emit canonical strings. Venue recurrence is usable on **exact match**. Known residue is junk values, not string drift — a placeholder string (×32), bare street addresses (×25), `"Online Programs"` (×27), plus ~5 Richmond Hill alias pairs (e.g. RHCPA long/short form). Build-time fix: small blocklist + alias map. **No entity-resolution subsystem** (§6).
- **(b) City — near-constant confirmed** in the sense that matters: 3 coarse values, no backtest path, and any weight on it encodes a geographic preference that is an editorial call, not a data finding. Cut.
- **(c) `Score_*` fields — dormant and information-free; not an imitation target.** `Score_Final` is the day-one Airtable formula slot R6 was always meant to fill (Decision_Log §6) — never implemented, every populated value is 0, but its consumer is already wired (`buildIssues.js` sorts Score_Final desc, Start Date asc). `Score_Manual` is an editor-override field hardcoded to 0 by the old n8n R2 mapping (the §40 incident class); the editor has never touched it. `SourceScore` is the AllEvents passthrough above. The 12% fill = the share of the post-R5 cohort that passed old-R2 (219/1,886). **The imitation target stays `issue_history`** — what actually got published — which the frozen eval set already encodes.

**Funnel result: 2 clean structured signals** (`Source`, `LocationName`) plus the unstructured pair for an LLM signal. That count drives §3.

---

## 3. Formula vs LLM — the decision

**Decision: formula-shaped hybrid.** `Score_Final` = a transparent weighted sum of **three normalized [0,1] signals**: (1) source prior, (2) venue recurrence, (3) an **LLM content-fit judgment** on Title + DescriptionRaw, grounded in the editor's *revealed* preference. Weights hand-set (the 2026-05-29 call stands), documented, tunable without a code change. Scored once per candidate at R2 time and stored — not re-rolled per allocation — so ordering is stable run-to-run (consistency is a third of R6's payoff).
*Revisit conditions:* if the backtest shows the LLM signal alone matches the editor's order as well as the hybrid, shrink the formula wrapper; if the backtest floor fails outright, regression fallback per §28's documented protocol (exclude eval issues from training, z-score features, permutation importance, one model family).

**LLM-signal grounding — dynamic few-shot at runtime, reusing Decision_Log §17's mechanism with two deliberate changes:**
- Examples = the most recent editor-approved/locked picks per section, selected by **editor-recency, never by clicks** — §17's click-performance sort key would silently point the signal at the click target, the exact collapse §1 forbids.
- Examples use **raw ingested text** (`Title`/`DescriptionRaw` from the matching Candidates rows), not editor-polished copy — the §17 Amendment-1 train/serve-skew lesson applied at design time. Dynamic selection is what makes this possible: only recent (post-pipeline) picks have raw-text rows.
- Negatives: seeded now by the 10 forced-choice pairs (`meetings/2026-07-02.md` §4.5); once live, pool-minus-picks accrues real passed-over examples weekly and the query starts pulling those too (§7).
- The example set used per run is **logged** (traceability — otherwise a swap-rate change can't be split into "editor drifted" vs "examples rotated"), and is **frozen during build/eval** (rotation is an uncontrolled variable while grading formula variants), going dynamic only at ship.
*Revisit condition:* if example rotation destabilizes scores in production, pin the example set and refresh on an explicit cadence.

**Why not a pure formula:** the two structured survivors are real but **content-blind**, and the editor's criteria are content-shaped — the 2026-07-02 meeting surfaced "novelty" as his one live criterion, which no source/venue arithmetic can see. Two coarse signals over ~50–150 in-window candidates per section produce massive ties with no legitimate tiebreaker (recency is struck). A pure formula imitates the editor's *habits* (which sources, which venues) but not his *judgment*.

**Why not an end-to-end LLM ranker:** it discards the two cheap, stable, fully-transparent signals R5 just revived; it makes swap-rate diagnosis opaque (when the editor overrides, *which part* of the score was wrong?); and per-signal weights are the handoff story — a non-technical client can be told "it ranks by source track record, venue track record, and a quality read of the description, weighted like so" and can ask for a weight change (Addendum principle 3). The LLM stays a **bounded signal inside an explainable frame** — which is where the 06-04 amendment's "LLM/hybrid picker" lean and the Addendum's "transparent weighted score + LLM quality signal passes" already converged. These objections are architecture, not cost — a cheaper model does not resurrect the end-to-end option (§7 cost item is procurement, decided by eval harness, and never drives this choice).

**Adjacent calls ratified here:**
- **Date-spread constraint (roadmap W5 step 6): dropped.** Consistent with §30 — the client said dates don't matter; keeping a variety constraint the data can't justify is decoration. *Revisit condition:* editor swaps show consistent variety-seeking (repeatedly swapping same-window picks apart).
- **Quality-floor principle kept** (slot left empty over junk — frozen-intent exit criterion); the threshold is set at build from the actual score distribution, not hardcoded here.

---

## 4. Validation design

Two offline correlations, one forward gate, one monitoring metric — each answering a different question. Every backtest run logs commit hash + candidate snapshot ID + eval-set version (else "the backtest said X" decays into folklore).

1. **Imitation backtest (the target):** rank-correlate the scorer's ordering of each section's published picks against the **editor's slot order**, per section-issue group on `issue_history` (77 issues), Spearman within group, bootstrap CI across issues. This is the offline measure of R6's actual objective. Caveat honestly: it primarily exercises the **LLM signal** — historical picks carry editor-*polished* copy (not raw `DescriptionRaw`), venue is unbacktestable (4% overlap), source only partially (§7). Strong positive = the content signal reads like the editor.
2. **Click floor (the sanity check):** same orderings vs `percentileVuc` on the frozen 924. **Require positive, don't maximize** — a faithful imitator only reproduces the editor's own 0.60→0.43 gradient. A negative or ~zero correlation means the scorer is grossly wrong; a strong one is *not* the goal (that's #87 leaking in).
3. **Selection is forward-only:** no historical reject pool exists, so "did it pick the right events" is validated live via **swap-rate** — how often the editor overrides the scorer's picks — trending down over the first 4–6 post-launch issues (§28 Phase 2, roadmap success criterion). Venue recurrence rides the same forward path. Swap-rate has an irreducible floor: the editor isn't perfectly self-consistent week to week, and no imitator can out-cohere its target.
4. **CTOR = north-star monitoring metric** (normalizes list size and open rate; kills the subscriber-growth confound). Expected roughly **flat** through R6 — that is success, not failure. It is a dashboard number, not a training label; the per-event percentile stays the label.
5. **Attribution discipline — and the measured power reality (2026-07-07).** Raw "clicks went up/down" is never attributable (subscribers, season, copy all move); only a **within-issue A/B** (scorer pick vs editor pick, same send) isolates the selection effect. Power at 13k subs / 50% open (~6,500 opens, per-event click rate ≈ 0.4%), two-proportion test at 80% power:

   | True per-event lift | Openers needed per arm | At 13k subs, ~3 divergent slots/issue |
   |---|---|---|
   | +50% (25→37 clicks) | ~16k | ~2–3 weeks of A/B |
   | +20% (25→30 clicks) | ~103k | ~11 weeks of continuous A/B |
   | +10% (25→27 clicks) | ~415k | ~10 months — effectively never |

   The relationship is quadratic (halve the detectable effect → 4× the sample), so subtle improvements get disproportionately unprovable. Practical reading: **this list can prove catastrophes and breakthroughs, never marginal gains** — which is why swap-rate (fully powered: every editor decision is a data point) is R6's gate and clicks are a floor. Simulated/synthetic clicks cannot close the gap — they only echo the assumptions fed into them; evidence is collected, not manufactured. The A/B design itself parks with **#87**, whose go/no-go bar it now sets.

---

## 5. Method-fit gate

Stated up front, before any build: **R6 is justified by automation + consistency + substrate — not clicks.** "Clicks up" has not been established as a *selection* problem at all. The click-side levers, in plausible order of size: copy (`generateBlurbs` titles/CTAs — every subscriber sees the copy; only clickers-through see the pick quality), source mix, send mechanics — and only then smarter selection. The editor's own weak slot gradient says pick-order explains a modest slice of click variance.

The §4 power math adds a decisive twist: per-event selection effects are near-unprovable at this list size (~0.4% base rate), but **copy/subject-line/send-time A/Bs act on the whole list at ~50% base rates — a subject-line test can detect a +5% relative change in a single issue.** So the "bigger levers" aren't just plausibly bigger — they are the only engagement levers whose effect is *cheaply provable* at 13k subs. If the client ever asks for "more engagement," that's where a measurable win lives; the first move is decomposing the open→click funnel, not building a smarter picker (#87 inherits this gate). R6 is never to be sold, internally or to the client, as a click play — the promise would be unverifiable even if delivered.

---

## 6. Explicitly not built (and why)

The restraint list — each of these is a decision, not an omission:

- **Learned ranker / regression-fit weights.** ~924 confounded labels; known leakage and slot-circularity traps (§28 amendments); hand-set weights over 3 signals is the right size. Regression remains the documented *fallback* if the backtest floor fails — not the default.
- **Learned content→click model (token-weight / bag-of-words or otherwise).** The classical version of "which words drive clicks" needs orders of magnitude more labels than our ~1,000 — it would memorize folklore. The LLM route is the same idea with the token knowledge pre-learned elsewhere (transfer, not training); the human-read pattern pass (§7) is the n-efficient explicit version.
- **Fine-tuning a model on editor picks.** n≈1,200 is marginal; adds retraining/versioning ops; moves editor taste from a legible prompt into opaque weights — hurts handoff and client-#2 portability. Few-shot prompting gets the transfer without the ops.
- **RAG / context-stuffing for the LLM signal.** The example corpus fits in a trivial query + prompt at this scale (§17's "no RAG" call stands); dumping all ~1,200 picks per call pays big-context prices for no measured gain and makes the prompt unauditable.
- **Position-bias debiasing (IPW / click models).** Overkill at 13k subs × 5 slots; slot is carried as a covariate, not corrected (§59).
- **Personalized / web-scale recommender methods.** One list to the whole audience, no per-user data, editorial-quality objective — the Indeed/Instagram learning-to-rank reference class is the trap, not the template (PRE-R6 Addendum). These constraints *cap* appropriate sophistication.
- **Venue entity-resolution subsystem.** Measured unnecessary: light normalization collapses 2 of 494 strings. A blocklist + ~5-entry alias map does the job.
- **Cut list (already struck — do not re-propose):** recency as a signal (§30), slot-position weighting (§28), segment-level click weighting (inert under hard quotas).
- **Chasing the click label.** The frozen set is a floor. Optimizing to it is #87 wearing R6's clothes.

---

## 7. Open questions / next steps

*(This section converts to issue pointers at finalization — tasks churn weekly and live in GitHub Issues, not here.)*

1. **`percentileVuc` distribution eyeball** on the frozen 924 (60-sec gutcheck, deferred) — do before leaning on the label in the backtest.
2. **Source-prior backtest coverage:** map the frozen set's URLs → source via domain, to see whether the source prior gets any historical validation. Expect skew (historical mix is pre-R5 Facebook/Eventbrite-heavy) — bounded value, cheap to check.
3. **LLM-signal build + grading:** dynamic few-shot per §3; graded against the 10 head-to-head pairs + held-out issues. Harness pattern exists (`gradeFacebookIntake.js`).
4. **Pair-collection cadence:** ~10–20 forced-choice same-section pairs per client meeting until R6 ships. Forced-choice beats stated-criteria elicitation (2026-07-02 proved introspection is thin) and beats rank-these-5 on label quality per editor-minute. Manual bridge to swap-rate; doubles as the LLM-signal negative pool.
5. **Top-vs-bottom-clicked content read** (optional, per the 2026-06-05 roadmap amendment): human reads the frozen set's best/worst per section, 3–4 robust patterns become small transparent features. Labeled honestly: this is **click-side** input, not the imitation target — it sits on the R6/#87 boundary and must not become the scorer's objective.
6. **Forward reject-set: already accruing, zero new tooling.** `snapshotCandidates.js` (post-R1 pool snapshots) + `issue_history.json` (picks) = pool-minus-picks per week — the editor-contrast data the LLM signal wants and the counterfactual dataset #87 needs. Noted so nobody builds a tracking mechanism for data we already capture.
7. **LLM cost measurement:** pilot the LLM signal on one week's pool; record actual tokens + cost per scored candidate (the few-shot block rides on every call — caching behavior is the swing variable). Pairs with the Debt #13 GPT-5-mini eval; same harness also grades any cheaper/open-weight model if the measured number is ugly. Procurement only — never drives §3's architecture (see §3).
8. **`Score_Final` write-path:** it's an Airtable *formula* field (read-only via API) — repoint or retype at build. Flagged, not solved here.
9. **Junk-venue blocklist + RH alias map** — small build task alongside the venue signal.
10. **On finalization:** critique pass (§58) → replace this DRAFT banner → Decision_Log entry for §3 → open `r6` issues (build items, #69, config extraction bundle) → **#82 before touching shared nodes**.
