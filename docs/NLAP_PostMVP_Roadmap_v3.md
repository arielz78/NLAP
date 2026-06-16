# NEWSLETTER AUTOMATION MACHINE — POST-MVP IMPROVEMENT PLAN
Release + Week-by-Week Execution Plan

**Date:** 2026-05-10 (America/Toronto)  
**Updated:** 2026-05-22  
**Architecture:** Multi-tenant (Vaughan + Mississauga confirmed, end of summer launch)  
**Time budget:** 10h/week each (Ariel + Nathan, 20h combined)  
**Ownership:** Nathan owns R5, then pivots to PI for VB. Ariel owns R6–R8.  
**Internal deadline:** R5 done by June 4. R6 ~mid-June.

---

## Context

R1–R4 are complete and stable. The pipeline ingests events, classifies
them, allocates them to issues, generates blurbs, and exports HTML for
Beehiiv. This document covers what needs to happen to go from working
MVP to a pipeline the client can run independently with confidence.

Three problems to solve:
1. Candidate pool is thin — only RSS + Eventbrite; Facebook (70%+ of
   client's original sources) not yet integrated.
2. Scoring is not real — R3 picks by earliest start date, not quality.
3. Classification is not calibrated — R2 has never been tuned against
   the client's actual editorial history.

Plus handoff prep at the end.

---

## Current State (as of 2026-05-10)

- R1: 3–4 RSS feeds + Eventbrite API. Stable, idempotent.
- R2: Rules-based + GPT-4o fallback. SegmentConfidence computed but
  never used downstream. Not validated against client engagement data.
  Classification accuracy never formally evaluated (see prerequisite
  below).
- R3: Allocates by earliest start date. Score_Final = 0 for all records.
- R4: generateBlurbs.js + pushToBeehiiv.js. Complete. Lock respected.
- Hosting: local. Client has not yet run scripts independently.

---

## Prerequisite Block — Complete Before R5 Starts

~5h total. Must clear all six items before R5-W1 begins.

### #1 — R2 classification eval (Debt #9, ~2h) — CLOSED 2026-06-03
Superseded by R7 classifier. Only remaining use was setting the
SegmentConfidence floor in R6-W5 step 4 — start at 0.6 and adjust
from live behavior. Prompt tuning is wasted work given R7 replaces
the GPT-4o path.

### #2 — LLM_ParseError field check (Debt #10, ~30min)
Confirm LLM_ParseError is writing to Airtable correctly. Open
R2 - LLM_ParseError not empty view and resolve any open errors
before proceeding.

### #3 — GPT-4o failure behavior (Debt #25, ~1h)
Define now, before R5 starts: skip-and-flag, or retry-once-then-flag.
Implement before R5 so silent corruption is not a risk during the
next 7 weeks of work.

### #4 — Beehiiv clicks CSV granularity (~30min) — CLOSED 2026-05-13
Granularity confirmed link-level. Scoring metric: Verified Unique
Clicks. Attribution path: Full URL → IssueItems.CandidateURL →
Section + Issue. Segment weight tuning is on the table for R6
(pending manual URL tagging exercise by client). See Decision_Log
§ 19 and data/beehiiv/clicks_analysis_2026-05-13.md.

### #5 — Quality metric agreement with client (~30min)
Propose the following structure to client: Primary metric = editor
acceptance rate without modification (blurbs published as-is vs.
edited). Guardrails = CTR doesn't materially drop issue-over-issue,
NeedsReview rate stays bounded below X%. Threshold targets deferred
to post-data (2–3 live issues). Required: scoring is unfalsifiable
without an agreed metric.

### #6 — Multi-tenant base architecture decision
Confirm with Nathan: base-per-newsletter vs single-base-with-
Newsletter-field. Recommendation is base-per-newsletter (isolation,
no record-limit ceiling, cleaner permissions). Must be locked
before R5-W1 starts — R5-W2 builds on the answer.

---

## Non-Negotiables

1. Editorial control remains: automation suggests; editor approves.
2. All ingestion paths must remain idempotent.
3. Never overwrite IssueItems where Lock = true.
4. No scoring or classification change ships without client validation.
5. Facebook automation is out of scope — TOS risk and fragility not
   worth it. Manual intake is the confirmed path.

---

## Prioritization Rationale

Sources first: scoring and classification on a thin candidate pool
doesn't fix output quality. More candidates = more to pick from.

Scoring second: once volume exists, R3 needs a real signal to pick
the best events — not just the earliest ones. Beehiiv clicks CSV is
already in hand and will be analyzed in R6-W4 to ground scoring weights.

Classification third: this is a quality refinement, not a correctness
fix. Requires Beehiiv engagement data from client before it can be
tuned properly. Do after volume is up.

Handoff last: SOP and failure protocol are written against a stable,
validated pipeline — not before it.

---

## Releases

> **Before R5 starts:** record candidate pool baseline.
> Count of Status = Approved in Airtable Candidates table. Takes 2 minutes.
> This is the before number for the source expansion impact metric.
> → Log in NA/Vaughan_Metrics_Log.md (candidate pool baseline section)
> → Update NA/VB_Portfolio_Case_Study.md update log (same row, same time)

---

### Release 5 — Source Expansion + Multi-Tenant Foundation
**Owner: Nathan | Deadline: June 4 | After R5: Nathan pivots to PI for VB, Dependant on Ariel scoping out what's needed for PI to be working / MVP**

**Success =** Approved-candidate pool size ≥ 75 per cycle (3:1 ratio against 25 slots) sustained across 3 consecutive runs.

**Exit criteria:**
- Source audit complete — all events from 5–7 past issues tallied by
  source, Facebook vs. non-Facebook breakdown confirmed.
- Top 2–3 automatable non-Facebook sources integrated into R1.
- Recurring events handled correctly (EndDate-based expiry).
- Source names normalized across all sources.
- Facebook manual intake path defined and working — client pastes a
  structured list weekly; pipeline handles ingestion idempotently.
- Multi-tenant scaffolding in place: newsletter scoping, config
  externalization, source adapter registry.
- Pre-R2 schema validator rejecting invalid records with typed reasons
  to ExecutionLog.
- Candidate pool meaningfully larger than current RSS + Eventbrite.

#### R5-W1 (3h): Source audit + multi-tenant config design

1. Tally events across 5–7 past Vaughan issues by source (from Beehiiv
   archives or client's sent issues). Confirm Facebook % and which
   non-Facebook sources dominate.
2. Cross-reference with source decision sheet in the NLAP project folder.
3. For each non-Facebook source: confirm whether RSS, ICS, JSON
   endpoint, or light scrape is viable.
4. Pick top 2–3 to integrate. Record decision per source (method +
   endpoint).
5. Design newsletter config file structure: airtableBaseId,
   beehiivPubId, segments, sources, geography, quotas, scoringWeights,
   prompts. Architecture decision (base-per-newsletter) already locked
   in prerequisite #6.

**Deliverables:**
- Source tally (which sources, which volumes)
- Integration decision per source (method + endpoint)
- Newsletter config schema designed

#### R5-W2 (5h): Integrate sources + multi-tenant plumbing + integrity guards

All source ingestion stays in n8n (R1 workflow). New sources added as
additional branches in the existing workflow — native nodes where available,
Code nodes for anything without a native integration. No Node.js rewrite.

1. Add 2–3 new source branches to R1 workflow, one per source identified
   in W1. Each branch fetches, normalizes, and merges into the existing
   Candidates upsert node.
2. Add newsletter scoping to R1: store Vaughan config (segments, geography,
   quotas, sources) in a Set node or sub-workflow at the top of R1.
   Mississauga gets its own workflow clone at R8-W10 — no flag needed now.
3. Map all new sources to canonical Candidates schema before the merge node.
4. Fix recurring events (Debt #8): use EndDate to gate expiry when
   EndDate is present, rather than StartDate. Prevents active recurring
   events from falling outside the date window.
5. Fix source normalization (Debt #5): define fixed domain→name mapping
   in a Set or Code node (e.g. inoreader.com → McMichael RSS). Consistent
   naming feeds into source quality scoring in R6.
6. Add pre-R2 schema validator: hard-reject records missing StartDate,
   Link, or Title. Write typed rejection reasons (MISSING_DATE,
   MISSING_LINK, MISSING_TITLE) to execution log output.
7. Airtable rate limit retry already handled (Retry-After backoff added
   in script review 2026-05-21) — confirm R1 n8n upsert node also has
   retry enabled.
8. Test idempotency: rerun does not duplicate.
9. Confirm new candidates flow through R2 classification correctly.
10. **Per-source health check (added 2026-05-29 from external review).**
    Each adapter needs its own expected-count floor — undocumented APIs
    silently break, RSS feeds change schemas without notice. Same
    failure-mode profile as Facebook (§18). Per-source pattern:
    - Track historical mean submissions/run per source (after ~5 runs to
      build baseline).
    - If a source returns <50% of mean for 2+ consecutive runs, flag in
      run log AND in #pipeline Discord. Loud failure, not silent.
    - Generalize the §18 FB 0-submission detection to a config-driven
      per-adapter check, not 5 hardcoded if-statements.

**Deliverables:**
- 2–3 new sources live as branches in R1 n8n workflow
- Newsletter config scoped within R1 workflow (Vaughan only for now)
- Recurring events no longer dropped incorrectly
- Source names consistent across all records
- Invalid records rejected with typed reasons at ingestion
- Per-source expected-count floor active for every adapter (not just FB)

#### R5-W3 (3h): Facebook manual intake + candidate pool checks

1. Define intake format — CSV or plain URL list that client pastes
   weekly into a drop zone (Airtable form or watched folder).
2. Build intake handler: reads drop zone, maps to Candidates schema,
   upserts via UniqueEventID.
3. Test with sample Facebook event data.
4. Add pre-R3 candidate pool count check: hard-flag when pool is below
   minimum viable threshold before allocation runs.
5. Add Facebook 0-submission detection: if Facebook events in current
   run = 0 and 8+ days since last submission, flag in run log.
6. Candidate-to-slot ratio check: 25 slots total (5 segments × 5 slots).
   If eligible candidate pool is below 75 (3:1 ratio), scoring in R6
   is cosmetic — R5 expansion is the only lever that matters. Document
   ratio and treat as a go/no-go gate before starting R6.

**Deliverables:**
- Client can submit Facebook events manually; pipeline processes them
  identically to automated sources
- Pool count, Facebook submission, and candidate-to-slot ratio checks
  in place

> **Reliability risk (added 2026-05-13):** Facebook events drive 58% of
> all event clicks per the 15-month Beehiiv analysis. If weekly manual
> submission slips, the affected issue loses more than half its
> potential click volume. The 0-submission detection above catches
> misses after the fact. Confirm with client at next meeting whether
> a backup submission path exists (see meetings/2026-05-14.md Talking
> Point B). Decision_Log § 18 updated.

> **When R5 closes:** complete a release writeup within one week (see `NA/Release_Writeup_Guide.md`). Then review both metric docs — `NA/Vaughan_Metrics_Log.md` and `NA/VB_Portfolio_Case_Study.md` — and update them with this release's numbers. Finally, make the repo presentable to recruiters and potential clients: assess what's stale, missing, or unflattering (README, committed code/workflows, docs) and push whatever's needed so the public-facing artifact reflects the work. Judgment call each time, not a fixed checklist — the writeup is the source material for it.

---

### Release 6 — Scoring
> **Before starting R6:** open GitHub issues for each W4 and W5 work item (label `r6`). Do this first, before any build work.

**Owner: Ariel | Deadline: ~mid-June (re-baselined 2026-05-29 — ~3 weeks solo at 10h/week, not June 4)**

**Success =** Editorial override rate (swap rate) drops over the first 4–6 post-launch issues as the editor trusts R6's picks. Pre-launch: signal correlation check confirms scoring signals point in the right direction. See Decision_Log §28 for two-phase validation rationale.

> **AMENDMENT 2026-06-04 (client meeting + live-data audit) — read before any R6 work:**
> - **Recency/date-proximity DROPPED** from the formula (client: dates don't matter, only quality). Window still gates eligibility. See Decision_Log §30. → strike step 3 "Recency fit" and the recency prior in step 2a.
> - **Source prior is INERT on the current pool.** Live Candidates are ~93% Eventbrite (monoculture); `Source` and `LocationName` fields are **0% populated** (484-record audit). Source/venue signals cannot discriminate until R5 diversifies sourcing AND `LocationName` is populated at ingestion (new R5 dependency).
> - **Venue recurrence salvage = client-curated trusted-venue list** (incoming), matched on `Event Title`. Not derived from history (no clean venue key in `issue_history.json`).
> - **R6 is now gated on R5** (pool diversity) + the venue list. With recency gone, today's pool has **zero working scoring signals** — do not build a scorer until R5 lands.
> - **Method-fit shift:** client wants "quality" = editorial judgment → an **LLM/hybrid picker** is now the leading approach over a weighted formula (the engineered formula has little left to weight). Decide product-vs-portfolio framing post-R5; R7 carries the ML-rigor portfolio load regardless.
> - **Date-spread constraint (W5 step 6): PENDING DECISION** — drop for consistency with §30, or keep as editorial variety. Leaning drop.
> - **Segment click weight: CUT** — inert under hard per-segment quotas (constant within a segment ⇒ no effect on within-segment ranking).
> - **Content-pattern click signal (idea, 2026-06-05) — evaluate when R6 starts, not before.** Once the click↔content join exists (R6-W4), pull top- vs bottom-clicked events per segment and *read them* — human-in-the-loop discovery, not a learned model. At ~100/segment with click noise (slot position, issue open-rate, exposure bias), a trained content→click regressor over-fits folklore; a human spotting 3-4 robust patterns, validated against the editor's gut, is the better method-fit. Surviving patterns become modest additive features (keyword/binary, fully transparent), encoded in newsletter config so client #2 supplies its own patterns. Gate: the URL round-trip (clicks → CandidateURL → DescriptionRaw) must be confirmed clean first — if lossy, the sample is an artifact of what joined, not what got clicks. Test patterns only on held-out issues you didn't read. One signal among several, not the scorer.

**Exit criteria:**
- Click data analyzed — scoring weights grounded in real engagement
  data, not guesses.
- Pre-launch signal correlation check run on post-pipeline issues
  (April 2026+) — signals directionally correct or weights adjusted.
- Score_Final computed for all new candidates at R2 time.
- Score_Final backfill pass completed for old candidates.
- R3 allocates by Score_Final desc, start date asc as tiebreaker.
- R3-Eligible Airtable view sorted by Score_Final desc (editorial
  curation view — see Decision_Log §29).
- Quality floor enforced — slot left empty rather than filled with junk.
- Date spread constraint in R3 — **pending decision (2026-06-04), may be dropped per §30.**
- Weights documented and tunable without a code change.
- Client has reviewed one full issue allocated by score and signed off.

#### R6-W4 (4h): Clicks analysis + offline backtest + scoring formula

Pre-analysis already done 2026-05-13 — see data/beehiiv/clicks_analysis_2026-05-13.md
and Decision_Log § 19, § 20. Granularity, scoring metric, attribution path,
CTOR baseline, and source-quality sample-size flags are all locked.
Remaining work for this week is the manual URL tagging join + offline
backtest + formula. Segment weights compute from client's tagged URL
list (Talking Point A in meetings/2026-05-14.md) — do not start the
formula until that list is in hand.

0. **Data scoping rules (from Issue #54 audit, 2026-06-02).** For Golden Age Readers: use March 2025 onward only — section did not exist in the template before that. For Families and For Couples: full 72-issue range safe, but Jan-Feb 2025 labels are the least-audited subset — check this cohort first if early-era backtest results look off. Trust Me Recipe and Local Aroma excluded from R6/R7 training entirely (editorial content, not events).
0. **Freeze the R6 eval set.** Pick 10–15 past issues from
   `data/beehiiv/issue_history.json` (72 issues available as of 2026-05-28)
   — spread across cohorts (early/mid/recent), avoid issues with known
   data anomalies. Lock the list in `data/beehiiv/r6_eval_set.md`.
   All backtest comparisons (rule-based vs. score-ranked vs. any future
   regression validation) use *only* these issues. Prevents cherry-picking
   when results disappoint.
0a. **Extend fetchBeehiivHistory.js to extract editor-final blurbs +
   slot position.** Same script, second pass through the email HTML.
   Captures DisplayTitle, Description, CTA per event + position within
   section. Output: `data/beehiiv/issue_history.json` enriched. ~30 min.
   Unlocks: slot-position feature for R6, few-shot pool for R7 LLM fallback,
   edit-distance health check (R4 generated vs editor-final).
1. Analyze Beehiiv clicks CSV in Claude (not Claude Code) — map URLs
   back to event types and segments. Identify which segments and event
   categories drive the most clicks. [Mostly done 2026-05-13.
   Remaining: join client's tagged URL list + `issue_history.json`
   to compute real per-segment AND per-source click averages
   (15-month coverage, not 7-issue sample).]
2. Run offline backtest before implementing: what would earliest-date
   sort have picked vs what got featured vs what got clicks vs what
   editors locked. Tests whether scoring beats trivial sort. If it
   doesn't, simplify R6 further. Log code commit hash, candidate snapshot
   ID (from `data/tracking/snapshots/`), and frozen eval set
   version with every backtest run output — otherwise "the backtest
   said X" decays into untraceable folklore in 3 months. **Bootstrap
   confidence intervals across issues** (per 2026-05-29 ChatGPT review)
   — 10–15 issues is small enough that a backtest can look decisive
   while still being noisy. Bootstrap protects against overreacting to
   weird issue mix.
2a. **Hand-set v1 weights from domain knowledge (REVISED 2026-05-29).**
   Original plan was "fit regression first, read magnitudes." External
   review surfaced fragility (eval leakage, raw-coefficient
   interpretation, slot circularity, exposure bias). New plan: ship
   hand-set v1 grounded in documented domain analysis, regression only
   as fallback if backtest fails.
   - Hand-set weights from: §18 (FB = 58% clicks), §20 (Families most
     popular), recency/source-quality priors, locked/featured as hard
     signal.
   - Normalize each signal to [0,1] and have weights sum to 1 so the
     0.4 quality floor (R6-W5 step 3) is interpretable.
   - **Drop slot-position from candidate scoring signals** — it's a
     confound at allocation time (R3 assigns slot *from* score, not
     score from slot). See §28 Amendments.
   - If backtest (step 2) shows hand-set v1 beats earliest-date sort:
     done, no regression needed.
   - **Regression only if backtest fails.** Then: exclude frozen eval-set
     issues from training matrix, z-score features before fitting, report
     partial-dependence / permutation importance (not raw magnitudes),
     pick one model family (linear-on-log-clicks OR logistic), use
     slot-position interaction as confound control only. Document in
     Decision_Log §28.
3. Define scoring signal hierarchy (editorial actions strongest, clicks
   weaker because exposure-biased). Weights from step 2a:
   - Locked/featured by editor (hard signal)
   - Repeat historical inclusion (venue/organizer — derived from
     `issue_history.json` URL recurrence)
   - Trusted venue/organizer boost (client-supplied list, pending receipt)
   - SegmentConfidence
   - Source quality defaults (from per-source click averages, step 1)
   - Segment click weight (from per-segment click averages, step 1)
   - **Recency fit (date-proximity) is NOT a scoring signal** (dropped
     2026-06-04 — client confirmed dates don't matter, only quality.
     Historical data cannot test this anyway — event dates not stored
     in issue_history.json for pre-pipeline issues. See Decision_Log §30.)
   - **Slot-position is NOT a candidate scoring signal** (removed
     2026-05-29 — circular, since R3 assigns slot from score; used only
     as confound control in regression if needed. See §28 Amendments.)
4. Add ScoreSignalCount field (0–5) for editorial transparency.
5. Evaluate GPT-5-mini as replacement for GPT-4o in R2 LLM node
   (Debt #13): run on 20 records, compare SegmentSuggested quality.
   10x cheaper — switch if quality holds.
6. Document final scoring formula. Share with client for gut-check.

**Deliverables:**
- Signal correlation check complete on post-pipeline issues — weights directionally correct or adjusted
- Scoring weights grounded in real click data, hand-set from domain knowledge
- GPT-5-mini evaluation complete — switch or keep GPT-4o decided
- Scoring formula documented in Decision_Log §28

#### R6-W5 (4h): Implement + backfill + R3 updates

1. Add scoring logic to R2 (compute Score_Final per candidate after
   classification).
2. Update R3 sort: Score_Final desc, start date asc as tiebreaker.
3. Add quality floor: Score_Final must exceed threshold (start at 0.4,
   interpretable because signals normalized [0,1] and weights sum to 1).
   Below threshold → leave slot empty + flag.
4. Add SegmentConfidence floor mechanism: records below threshold →
   NeedsReview instead of R3. Set threshold from R2 eval distribution
   (prerequisite #1), not hardcoded at 0.6.
5. Add Score_Final backfill pass for old candidates (Score_Final = 0
   will silently sink to bottom without it).
6. **PENDING DECISION (2026-06-04):** date spread constraint — drop for
   consistency with §30 (client: dates don't matter), or keep as editorial
   variety. Leaning drop. If kept: if slots 1–5 fall in same 3-day window,
   force at least one slot from different part of issue window.
7. Compute and store ScoreSignalCount per candidate.
8. Update R3-Eligible Airtable view sort order: Score_Final desc,
   Start Date asc as tiebreaker (see Decision_Log §29 — editorial
   curation view consumes same ranking as R3 auto-allocation).
9. Run R3 on an upcoming issue. Note which picks are kept vs swapped
   by editor — this is the start of swap-rate tracking (Phase 2
   validation per §28).

**Deliverables:**
- Score_Final populated for all candidates (new + backfill)
- R3 and R3-Eligible view both sorted by Score_Final
- Quality floor and date spread constraints active
- Swap rate tracking begun (URL-match script needed to automate — §25)

> **When R6 closes:** complete a release writeup within one week (see `NA/Release_Writeup_Guide.md`). Then review both metric docs — `NA/Vaughan_Metrics_Log.md` and `NA/VB_Portfolio_Case_Study.md` — and update them with this release's numbers. Finally, make the repo presentable to recruiters and potential clients: assess what's stale, missing, or unflattering (README, committed code/workflows, docs) and push whatever's needed so the public-facing artifact reflects the work. Judgment call each time, not a fixed checklist — the writeup is the source material for it.

---

### Release 7 — Classification Quality
> **Before starting R7:** open GitHub issues for each W6 and W7 work item (label `r7`). Do this first, before any build work.

**Owner: Ariel**

**Success =** Trained classifier on Beehiiv historical labels matches or beats GPT-4o accuracy on the frozen R7 eval set, AND NeedsReview rate drops measurably below the pre-R7 baseline.

**Mechanism change 2026-05-28 (Decision_Log §17):** R7 was originally scoped as prompt-tuning with dynamic few-shot examples. After #52 (Beehiiv parseability) returned GO, 2,729 `(title, section)` ground-truth labels became extractable from past issues. R7 is now a trained classifier (LinearSVC + TF-IDF), with the LLM retained as low-confidence fallback and rationale generator.

**Exit criteria:**
- LinearSVC + TF-IDF classifier trained on `issue_history.json` labels, deployed in R2 path before the LLM call.
- High-confidence predictions (above tuned threshold) skip the LLM entirely — cost + latency reduction.
- Low-confidence predictions fall through to GPT-4o for classification + rationale.
- Frozen eval set built — 15 high-confidence + 15 ambiguous examples per segment, held out from training. Permanent regression benchmark.
- Newsletter-scoped training data (Vaughan classifier ≠ Mississauga classifier — separate models per base).
- Model versioning + retraining cadence in place (retrain when N new editor-corrected examples accumulate, or every N weeks).
- NeedsReview rate measurably lower than pre-R7 baseline.

> **Before R7 starts:** capture NeedsReview baseline.
> Query Airtable — count of records in R2-NeedsReview view, broken down
> by reason (segment confusion, low confidence, missing fields) if
> distinguishable from LLM_Rationale. This is the before number for
> the NeedsReview improvement metric. Do this before any classifier work
> in R7-W6. One Airtable query, takes 5 minutes.
> → Log in NA/Vaughan_Metrics_Log.md (NeedsReview baseline section)
> → Update NA/VB_Portfolio_Case_Study.md update log (same row, same time)

#### R7-W6 (4h): Build training set + train classifier + frozen eval set

**REVISED 2026-05-29 after external review** — train/serve feature skew, calibration, and class-balance gaps identified. See Decision_Log §17 Amendments for full reasoning.

1. Build training set from `issue_history.json` — extract `(URL, section)` pairs, then match URL back to `Candidates.Title` + `Candidates.DescriptionRaw` (the actual R2 input fields, NOT editor-final DisplayTitle). For events without a Candidates match (pre-pipeline issues), flag separately — they're a weaker label source and may need to be excluded entirely. Filter out Trust Me Recipe and Local Aroma (editorial content, not events). Filter out For Golden Age Readers labels before March 2025 (section did not exist in template). Jan-Feb 2025 For Families/For Couples labels are lowest-confidence — exclude if classifier performance on that cohort is weak.
2. Hold out frozen eval set FIRST — 15 high-confidence + 15 ambiguous examples per segment. These never enter training. Lock the list in `data/beehiiv/r7_eval_set.md`. Eval set must use the same field source as training (Candidates.Title + DescriptionRaw) — no DisplayTitle leakage.
3. Train LinearSVC + TF-IDF on the remaining labels. Required configuration:
   - Features: TF-IDF on `Candidates.Title` + `Candidates.DescriptionRaw` (concat or separate vectorizers — try both)
   - `class_weight='balanced'` — Families is the dominant class (§1); without rebalancing, recall on Couples / Golden Age / Local Aroma will silently tank
   - Wrap with `CalibratedClassifierCV` (Platt scaling) on held-out data — LinearSVC margins are NOT probabilities. The confidence threshold for LLM fallback only means anything after calibration.
4. Tune confidence threshold against eval set — too high = wastes LLM on records the classifier could've handled; too low = classifier ships wrong predictions silently. Threshold tuned on *calibrated* probabilities, not raw margins.
5. **Headline metric: per-segment recall, not overall accuracy.** Class imbalance means overall accuracy is misleading. Report a 4×4 confusion matrix + per-segment precision/recall/F1.
6. Set up model versioning — pickled model + training data hash + eval metrics stored per version. Regressions are rollback-able by reverting to the previous model file.
7. Replay GPT-4o baseline against the same frozen eval set so the comparison is apples-to-apples. **GPT-4o-mini comparison too** (per Claude.ai review — if mini is close enough, the classifier infra cost may not be justified for 2 newsletters; decision: ship classifier if it materially beats mini on per-segment recall, otherwise stay with mini).

**Deliverables:**
- Training set + frozen eval set built and stored, both using Candidates.Title + DescriptionRaw
- Classifier trained with class_weight='balanced' + CalibratedClassifierCV calibration
- Per-segment recall reported (not just accuracy)
- Comparison vs GPT-4o AND GPT-4o-mini baselines documented
- Model versioning in place

#### R7-W7 (3h): Deploy classifier to R2 + validate

1. Update R2 n8n workflow: add classifier prediction step before the LLM Message-a-Model node. High-confidence predictions (above tuned threshold) write SegmentSuggested directly and skip the LLM. Low-confidence predictions fall through to GPT-4o.
2. LLM_Rationale still gets populated — for high-confidence classifier predictions, use a templated rationale ("Classified as X with confidence Y based on training data"). For low-confidence fallback, GPT-4o generates as before.
3. Test on 20 records. Compare classifier+fallback vs old GPT-4o-only path.
4. Replay frozen eval set. Confirm classifier accuracy holds in production path.
5. Set retraining trigger — when N new editor-corrected examples accumulate (from the §27 fix-and-approve workflow), retrain and replay eval set before deploying new model.

**Deliverables:**
- Classifier deployed in R2 path with LLM fallback
- Frozen eval set replayed — accuracy confirmed in production path
- Retraining trigger defined
- Measurable NeedsReview rate reduction vs pre-R7 baseline

> **When R7 closes:** complete a release writeup within one week (see `NA/Release_Writeup_Guide.md`). Then review both metric docs — `NA/Vaughan_Metrics_Log.md` and `NA/VB_Portfolio_Case_Study.md` — and update them with this release's numbers. Finally, make the repo presentable to recruiters and potential clients: assess what's stale, missing, or unflattering (README, committed code/workflows, docs) and push whatever's needed so the public-facing artifact reflects the work. Judgment call each time, not a fixed checklist — the writeup is the source material for it.

---

### Release 8 — Handoff
> **Before starting R8:** open GitHub issues for each W8 work item (label `r8`). Do this first, before any build work.

**Owner: Ariel**

**Success =** Client runs the full weekly pipeline solo for 3 consecutive weeks without unrecovered errors or escalation.

**Exit criteria:**
- End-to-end pipeline run completed successfully on real Vaughan issue date.
- Client can run all scripts independently for Vaughan.
- Mississauga newsletter onboarded via config (no code changes).
- Runbook + failure protocol written and signed off.
- Execution interface decision made: assess whether client should be running scripts manually (VS Code + terminal) or whether a lower-friction path (scheduled automation, webhook trigger, simple UI) is warranted before handoff. Pick and scope the approach — don't hand off a terminal workflow to a non-technical client without a deliberate decision.

#### R8-W8 (4h): Validate + harden (Vaughan)

1. End-to-end dry-run: R1 → R2 → R3 → R4 → pushToBeehiiv on a real
   upcoming Vaughan issue date. Fix anything that breaks.
2. Build clean IssueItems view in Airtable (Section, Slot,
   DisplayTitle, Description, CTA, CandidateURL — filtered by issue).
   At the same time: add `EditedByClient` checkbox field to IssueItems.
   Client checks it when they change a blurb. This is the tracking
   mechanism for blurb acceptance rate — the primary case study quality
   metric. Walk client through the habit during the R8-W9 walkthrough.
   See NA/Pipeline_Metrics_Framework.md.
   From this point forward: fill in one row per issue in
   NA/Vaughan_Metrics_Log.md after each pipeline run.
   → Update NA/VB_Portfolio_Case_Study.md update log at the same time.
3. Debt #15 — auto-upsert next 3 Thursdays into Issues table.
4. Add dry-run flags to R2, R3, R4 (pushToBeehiiv already has one).
   Critical for client running scripts independently.
5. Add cost-per-run logging to ExecutionLog (token count + USD).
   Threshold alert before client gets a surprise bill. **Pull this
   forward to R5** (per 2026-05-29 review) — R5 triples R2 LLM-fallback
   calls + R4 generation as the candidate pool grows toward 75. Cost
   visibility matters before that scaling event, not after.
6. Add manual override audit trail: when editor flips Status, Segment,
   or Lock, log it. Feeds few-shot mechanism and informs eval.
7. **Preflight / smoke-test / bootstrap script (added 2026-05-29).**
   Client is a non-engineer running scripts locally. Polished SOPs aren't
   enough — the toolchain itself needs guardrails.
   - `scripts/preflight.js` — verifies env vars present, API keys valid
     (test ping per service), Airtable base reachable, expected tables/
     fields exist. Runs first in the weekly sequence; exits with clear
     error message if anything fails.
   - `scripts/smoke_test.js` — runs each script (R3, R4, pushToBeehiiv)
     in `--dry-run` mode against a known-good Issue date. Validates the
     full pipeline path without writing to Airtable or generating costs.
     Use before any real run after env or dependency changes.
   - Document one-command bootstrap in RUNBOOK: `npm install` + env file
     setup + preflight + smoke test, in that order.

**Deliverables:**
- Vaughan pipeline runs clean end-to-end
- Client has a usable editorial view in Airtable with EditedByClient field
- Dry-run flags on all scripts
- Cost logging in place

#### R8-W9 (4h): Docs + client walkthrough

1. Write client failure protocol (Debt #26) — one page: what breaks,
   what the client does, manual fallback.
2. Write runbook (Debt #27) — step-by-step weekly run guide, built on
   top of Decision Log. Include exact commands, healthy output
   expectations, error code meanings, rollback steps.
3. Document API key ownership: who holds OpenAI key, what happens
   when it rotates.
4. Define rollback procedure for bad R3 allocation runs.
5. Walk client through running the full pipeline themselves on Vaughan.
   Fix any environment or setup issues on their machine.
6. Get client testimonial in writing. Must include: before/after
   time per issue (their words), and any CTOR or quality observations
   they've noticed. This is the primary proof artifact for pitching
   client #2. Don't leave this meeting without a commitment to send it.
7. Record editorial time delta: confirm the before number (from
   2026-05-14 meeting notes) against the after number from run logs.
   Fill in the R8 Handoff section and Case Study Numbers section in
   NA/Vaughan_Metrics_Log.md and NA/VB_Portfolio_Case_Study.md update log.
   This completes the case study baseline.
9. **Scoring effectiveness validation (optional but high-value).**
   If you want real evidence that R6 scoring improves editorial output,
   the client needs to commit to one condition: run 100% through the
   NLAP pipeline for 4–6 consecutive weeks with no off-pipeline sourcing.
   Mixed sourcing makes the swap rate data uninterpretable — any event
   the client sources manually won't appear in IssueItems, the URL-match
   script flags it, and that issue gets excluded from the calculation.
   The client doesn't need to self-report; the data detects contamination
   automatically.

   **Ask at this walkthrough:** "For the next 4–6 issues, are you willing
   to source exclusively through the pipeline? It's the only way we can
   measure whether the scoring system is actually saving you time."

   **The right before/after comparison is R1–R4 vs R6** — not pre-pipeline
   vs post-pipeline. Pre-pipeline issues used completely different sourcing,
   no candidate pool data exists, and the editorial workflow was different.
   The clean comparison is earliest-date sort (R1–R4, April 2026+) vs
   scored picks (R6, mid-June 2026+). Lock the R1–R4 per-section click
   averages as the baseline during the R6-W4 clicks analysis — don't wait
   until R8 to capture it.

   **Metrics — ranked by signal quality:**

   HIGH SIGNAL (directly attributable to scoring, no confounds):
   - **Swap rate** — % of R6 IssueItems picks the editor kept without
     overriding. Measured via URL-match script (§25): IssueItems URLs
     matched against published Beehiiv URLs per issue. High swap rate =
     formula surfaces what editor would've chosen = scoring is working.
     This is the primary metric. Target: rising trend over 4–6 issues.
   - **Score_Final vs. clicks correlation** — after R6 ships, do
     higher-scored candidates actually get more clicks within each issue?
     Computed from Score_Final in Airtable joined to per-URL click data.
     Direct test of whether scoring weights are calibrated correctly. If
     high-scored events consistently outclick low-scored events, the
     formula is working. If not, weights need tuning.
   - **Per-section click rate** — average verified unique clicks per event
     per section per issue. More granular than CTOR — isolates scoring
     impact from subject line, ad placement, and other issue-level noise.
     Baseline: compute from R1–R4 issues (April 2026+) during clicks
     analysis. Compare against R6 issues after 4–6 clean issues.
   - **Curation time delta (specific, not total)** — time spent reviewing
     and swapping R3 picks, not total editorial time. Client's 4h baseline
     includes ads, subject line, testing — those don't change with scoring.
     The curation step specifically (~45 min in the 2026-05-14 baseline)
     should compress as swap rate rises. Track this step separately.

   MEDIUM SIGNAL (directional, noisy — use as supporting evidence only):
   - **CTOR per issue** — overall click-to-open rate from Beehiiv analytics.
     Confounded by subject line quality, ad count, seasonality, and external
     events. Don't lead with this. Use as a directional trend over 10+ issues,
     not 6. A rising CTOR alongside rising swap rate strengthens the case;
     CTOR alone proves nothing about scoring.
   - **Section fill rate** — how often each section fills all 5 slots vs.
     fewer. Signals whether R5 source expansion solved the thin-pool problem.
     Should improve post-R5, independent of scoring.
   - **NeedsReview rate trend** — count of R2-NeedsReview records per week
     over time. Should drop after R7 classifier ships. Useful for R7
     justification; also signals overall pipeline health.
   - **Candidate pool size trend** — weekly Candidates snapshot already
     captures this. Track Approved count per week post-R5. Should rise
     as new sources bed in.

   LOW SIGNAL (skip — too many confounds, too slow to move):
   - Open rate — almost entirely subject line dependent. Nothing to do
     with event selection or scoring.
   - Subscriber growth — too many external factors, too slow to attribute.
   - Unsubscribe rate — low volume, very noisy signal.

   **What this data is worth:**
   - **Portfolio:** "Scoring formula reduced editorial override rate by X%
     over 6 issues, with per-section click rate up Y%" is a concrete,
     defensible outcome — not "I built a scoring system." Answers "did it
     work?" for any technical interviewer or client #2.
   - **Case study:** Replaces the current "in progress" framing with real
     before/after numbers. Transforms the case study from process description
     to outcome proof.
   - **Client #2 pitch:** Swap rate + curation time delta is a replicable
     measurement framework — you can promise the same instrumentation to
     the next client, which signals you know how to evaluate your own work.
     That's the product differentiator: not just automation, but automation
     with a measurement layer that tells you if it's working.
   - **Product improvement:** Score_Final vs. clicks correlation tells you
     exactly which weights to adjust after each 4-issue window. The
     measurement framework isn't just proof — it's the feedback loop that
     makes the product better over time.

8. Stress-test portfolio claims: bring the full NA/ folder to Claude.ai
   and ask it to validate every claim in VB_Portfolio_Case_Study.md
   against the real numbers now in Vaughan_Metrics_Log.md. Flag anything
   that's overstated, understated, or missing evidence. Update both docs
   before any job applications go out.

**Deliverables:**
- Client has run the Vaughan pipeline independently at least once
- Runbook, failure protocol, and rollback procedure signed off
- Testimonial committed to (in writing or firm verbal commitment with follow-up)
- Editorial time delta recorded

#### R8-W10 (3h): Mississauga onboarding

1. Create mississauga.json config. Set up Mississauga Airtable base
   from Vaughan schema template.
2. Define Mississauga sources (Eventbrite Mississauga + insauga RSS
   + 1–2 others identified in R5-W1 audit).
3. Run full pipeline on Mississauga with --newsletter=mississauga flag.
   No code changes should be required.
4. Walk client through first Mississauga issue dry-run.

**Deliverables:**
- Mississauga pipeline running end-to-end via config only
- Client has run Mississauga pipeline independently at least once

> **When R8 closes:** complete a release writeup within one week (see `NA/Release_Writeup_Guide.md`). Then review both metric docs — `NA/Vaughan_Metrics_Log.md` and `NA/VB_Portfolio_Case_Study.md` — and update them with this release's numbers. Make the repo presentable to recruiters and potential clients: assess what's stale, missing, or unflattering (README, committed code/workflows, docs) and push whatever's needed so the public-facing artifact reflects the work. Judgment call each time, not a fixed checklist — the writeup is the source material for it. This is also the point to compile the full project portfolio writeup across all releases — R8 is the handoff, so the complete record matters most here.

---

---

### Performance Intelligence (PI) — Post-R8
**Owner: Nathan (after R5, in parallel with Ariel's R6–R8) | Scoped by Ariel after R5 ships**

**What PI is:** A measurement dashboard that surfaces the metrics above automatically
after each issue, so you're not manually querying Airtable and Beehiiv every week.
The scoring validation metrics and the PI outputs are the same thing — PI is the
infrastructure that makes the measurement framework repeatable rather than one-off.

**Why now:** The data is already in hand (15-month Beehiiv export + Airtable IssueItems
history + candidate snapshots). No need to wait for NLAP to finish shipping. Nathan
can build PI in parallel with R6–R8 using the existing data, and the dashboard is
ready to show real post-R6 numbers as soon as scoring ships.

**Shared data join with R6:** One connector — Airtable IssueItems + tagged Beehiiv
clicks CSV — produces two outputs: scoring weights for the pipeline (R6) and
performance data for the dashboard (PI). Build the join once, use it in both places.

**MVP stack:** Airtable API + tagged Beehiiv clicks CSV → Google Sheets → Looker Studio.
No custom UI, no warehouse. Fast to build, easy for the client to read.

**PI dashboard — what to include:**

*Per-issue metrics (one row per issue):*
- CTOR — from Beehiiv analytics export
- Total verified unique clicks — from Beehiiv clicks CSV
- Section fill rate — how many of 25 slots were filled (from IssueItems)
- Swap rate — % of IssueItems kept in published newsletter (from URL-match script, post-R6)
- Curation time (if client tracks it) — optional self-reported field in Airtable

*Per-section metrics (one row per section per issue):*
- Average verified unique clicks per event — from Beehiiv clicks CSV joined to IssueItems
- Fill count — how many slots filled in this section this issue
- Swap rate per section — which sections does the editor override most? (post-R6)

*Per-source metrics (rolling, not per-issue):*
- Average clicks per event by source domain — from issue_history.json + clicks CSV
- Submission count per source per run — from R1 execution logs
- NeedsReview rate per source — which sources produce the most classification failures?

*Scoring health metrics (post-R6 only):*
- Score_Final vs. clicks correlation per issue — do higher-scored events outclick
  lower-scored events within each issue? Plotted as a scatter per issue.
- Weight drift signal — if correlation weakens over time, weights need retuning.

*Pipeline health metrics (ongoing):*
- Candidate pool size (Approved count) — from weekly snapshots
- NeedsReview rate — from Airtable R2-NeedsReview view count per week
- R1 submission count per source — flags dead or degraded sources early

**Scoping note:** Ariel scopes PI in 1–2 days after R5 ships. Nathan builds in parallel
with R6/R8. The Looker Studio dashboard can be shared directly with the client as a
read-only view — gives him visibility into his own newsletter performance without
needing to query Airtable himself. That's an additional client deliverable at R8 handoff.

**Transferability:** The PI framework is newsletter-agnostic. Mississauga gets the same
dashboard from day one — swap the Airtable base ID and Beehiiv publication ID in the
connector, everything else is identical. This is the "measurement layer" differentiator
for client #2 pitches.

---

## What Was Cut and Why (do not add back without discussion)

- **Recurring event series abstraction** — venue+title fuzzy-match dedupe
  in a 14-day window solves 90% of flooding at this scale. Schema-change
  overhead not justified.
- **Contrastive classification structure** (evaluate against every segment)
  — adds tokens and latency on every candidate. Cheaper version is 90%
  as accurate. Test if R2 eval shows segment confusion problems; don't
  ship blind.
- **Second-pass issue-level composition optimizer** (tonal, price, geographic,
  indoor/outdoor, recurring/unique, premium/accessible) — five of six
  dimensions aren't in the schema. Keep only venue diversity + date spread.
- **Offline replay evaluator** (simulate pipeline versions against history)
  — graduate-thesis overhead for 2 newsletters. A/B by running both
  versions on next week's issue and eyeballing.
- **Per-segment confusion matrix infrastructure** — at ~5 events per segment
  per issue, months of data needed before a 5×5 matrix is statistically
  interesting. Compute ad-hoc during eval, don't bake in.
- **Scarcity weighting in allocation** — premature; the failure mode hasn't
  been observed at volume yet.
- **Local Aroma and Trust Me Recipe automation** — all three options
  (blurb-only, intake + blurb, full discovery) presented to client
  2026-06-04. Client parked both sections. Neither is in scope until
  client raises them again. See Decision_Log §31.
- **Batch blurb generation with neighbor visibility** — substantial rewrite.
  Defer until after handoff if blurb quality is still flagged as off.

---

## Weekly Risk Checklist

- Any source failing or returning 0 events?
- Candidate pool large enough to fill all quotas without fallback?
- Score_Final populated for all new candidates?
- Any NeedsReview spike after R2 run?
- Client able to run scripts without help?

---

## Open Items Requiring Client Input

1. ~~Beehiiv clicks report CSV~~ — CLOSED 2026-05-13. Link-level confirmed.
   Scoring metric locked: Verified Unique Clicks. See Decision_Log §19.
2. Facebook manual intake format — confirm Airtable form vs CSV drop
   before R5-W3.
3. ~~Multi-tenant ownership terms~~ — CLOSED 2026-05-20. Base-per-newsletter
   confirmed with Nathan. See Decision_Log §15.
4. Quality metric definition — agree on editor edit-rate (or
   alternative) before R6 ships. See prerequisite block (#5).
5. Trusted venues / organizers list — client to send (2026-06-04).
   ~10–20 venue/organizer names readers reliably show up for. Feeds
   venue-boost signal in R6 scoring formula (step 3 above).

---

## Debt Items Covered in This Roadmap

| Debt # | Item | Where |
|--------|------|-------|
| #5 | Source normalization | R5-W2 |
| #8 | Recurring events fix | R5-W2 |
| #9 | R2 classification eval | Prerequisite #1 |
| #10 | LLM_ParseError verification | Prerequisite #2 |
| #13 | GPT-5-mini evaluation | R6-W4 |
| #14 | Beehiiv engagement data | R6-W4 + R7 |
| #15 | Issues table auto-creation | R8-W8 |
| #20 | Historical examples | R7 |
| #25 | GPT-4o timeout/fallback | Prerequisite #3 |
| #26 | Client failure protocol | R8-W9 |
| #27 | SOP | R8-W9 |

