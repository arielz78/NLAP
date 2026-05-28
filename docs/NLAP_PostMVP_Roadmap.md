# NEWSLETTER AUTOMATION MACHINE — POST-MVP IMPROVEMENT PLAN
Release + Week-by-Week Execution Plan

**Date:** 2026-05-10 (America/Toronto)  
**Updated:** 2026-05-22  
**Architecture:** Multi-tenant (Vaughan + Mississauga confirmed, end of summer launch)  
**Time budget:** 10h/week each (Ariel + Nathan, 20h combined)  
**Ownership:** Nathan owns R5, then pivots to PI for VB. Ariel owns R6–R8.  
**Internal deadline:** R5 + R6 both done by June 4.

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

### #1 — R2 classification eval (Debt #9, ~2h)
Pull 20–30 classified candidates from Airtable (R2Status = Enriched).
Stratified sample: across source types, confidence levels, segments.
Not just clean records. Manually review SegmentSuggested +
LLM_Rationale. Document failure patterns. Tighten R2 prompt or
keyword rules. Rerun on same records, measure improvement.

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

**Deliverables:**
- 2–3 new sources live as branches in R1 n8n workflow
- Newsletter config scoped within R1 workflow (Vaughan only for now)
- Recurring events no longer dropped incorrectly
- Source names consistent across all records
- Invalid records rejected with typed reasons at ingestion

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

---

### Release 6 — Scoring
**Owner: Ariel | Deadline: June 4**

**Success =** Score-ranked picks correlate with actual clicks better than earliest-date sort, validated by offline backtest on the frozen R6 eval set. CTOR is the post-launch outcome metric, not the development signal.

**Exit criteria:**
- Beehiiv clicks CSV analyzed — scoring weights grounded in real
  reader engagement, not guesses.
- Offline backtest completed — scoring demonstrably beats earliest-
  start-date sort, or formula simplified accordingly.
- Score_Final computed for all new candidates at R2 time.
- Score_Final backfill pass completed for old candidates.
- R3 allocates by Score_Final desc, start date asc as tiebreaker.
- Quality floor enforced — slot left empty rather than filled with junk.
- Date spread constraint enforced in R3.
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

0. **Freeze the R6 eval set.** Pick 10–15 past issues from the 71
   available — spread across cohorts (early/mid/recent), avoid issues
   with known data anomalies. Lock the list in `data/beehiiv/r6_eval_set.md`.
   All backtest comparisons (rule-based vs. score-ranked vs. any future
   regression validation) use *only* these issues. Prevents cherry-picking
   when results disappoint.
1. Analyze Beehiiv clicks CSV in Claude (not Claude Code) — map URLs
   back to event types and segments. Identify which segments and event
   categories drive the most clicks. [Mostly done 2026-05-13.
   Remaining: join client's tagged URL list to compute real per-segment
   click averages.]
2. Run offline backtest before implementing: what would earliest-date
   sort have picked vs what got featured vs what got clicks vs what
   editors locked. Tests whether scoring beats trivial sort. If it
   doesn't, simplify R6 further. Log code commit hash, candidate snapshot
   ID (from `data/tracking/snapshots/`), and frozen eval set
   version with every backtest run output — otherwise "the backtest
   said X" decays into untraceable folklore in 3 months.
3. Define scoring signal hierarchy (editorial actions strongest, clicks
   weaker because exposure-biased):
   - Locked/featured by editor (hard signal)
   - Repeat historical inclusion (venue/organizer)
   - SegmentConfidence (combined weight with recency)
   - Recency fit: days between event start and issue date
   - Source quality defaults (from config)
   - Segment click weight (set to 1.0 neutral until CSV analysis
     produces real weights)
4. Add ScoreSignalCount field (0–5) for editorial transparency.
5. Evaluate GPT-5-mini as replacement for GPT-4o in R2 LLM node
   (Debt #13): run on 20 records, compare SegmentSuggested quality.
   10x cheaper — switch if quality holds.
6. Document final scoring formula. Share with client for gut-check.

**Deliverables:**
- Offline backtest complete — scoring justified or formula simplified
- Scoring weights grounded in real click data
- GPT-5-mini evaluation complete — switch or keep GPT-4o decided
- Scoring formula documented in Decision Log

#### R6-W5 (4h): Implement + backfill + R3 updates

1. Add scoring logic to R2 (compute Score_Final per candidate after
   classification).
2. Update R3 sort: Score_Final desc, start date asc as tiebreaker.
3. Add quality floor: Score_Final must exceed threshold (start at 0.4)
   for auto-allocation. Below threshold → leave slot empty + flag.
4. Add SegmentConfidence floor mechanism: records below threshold →
   NeedsReview instead of R3. Set threshold from R2 eval distribution
   (prerequisite #1), not hardcoded at 0.6.
5. Add Score_Final backfill pass for old candidates (Score_Final = 0
   will silently sink to bottom without it).
6. Add date spread constraint in R3: if slots 1–5 fall in same 3-day
   window, force at least one slot from different part of issue window.
7. Compute and store ScoreSignalCount per candidate.
8. Run R3 on an upcoming issue. Compare output to previous earliest-
   start-date output. Document obvious misses.

**Deliverables:**
- Score_Final populated for all candidates (new + backfill)
- R3 output demonstrably improved vs. earliest-start-date sort
- Quality floor and date spread constraints active

---

### Release 7 — Classification Quality
**Owner: Ariel**

**Success =** NeedsReview rate drops measurably below the pre-R7 baseline AND classification accuracy on the frozen R7 eval set is at or above the current LLM baseline (no regression).

**Exit criteria:**
- Dynamic few-shot examples injected into R2 prompt at runtime, drawn
  from highest-performing IssueItems.
- Frozen eval set built — 15 high-confidence + 15 ambiguous examples
  per segment from Vaughan history. Permanent regression benchmark.
- Newsletter-scoped few-shot queries (no cross-newsletter contamination).
- Prompt versioning in place — regressions are rollback-able.
- NeedsReview rate measurably lower than pre-tuning baseline.

Note: this release is gated on Beehiiv engagement data from client.
Do not start until clicks analysis (R6-W4) is complete.

> **Before R7 starts:** capture NeedsReview baseline.
> Query Airtable — count of records in R2-NeedsReview view, broken down
> by reason (segment confusion, low confidence, missing fields) if
> distinguishable from LLM_Rationale. This is the before number for
> the NeedsReview improvement metric. Do this before any prompt changes
> in R7-W6. One Airtable query, takes 5 minutes.
> → Log in NA/Vaughan_Metrics_Log.md (NeedsReview baseline section)
> → Update NA/VB_Portfolio_Case_Study.md update log (same row, same time)

#### R7-W6 (3h): Few-shot mechanism + frozen eval set + prompt versioning

1. At the start of each R2 run, query IssueItems for the last 10
   locked/approved records per segment, sorted by click performance
   (where available) then date desc. Filter by newsletter field to
   prevent cross-newsletter contamination.
2. Store selection logic in config helper so N per segment is easy
   to adjust.
3. Build frozen evaluation set: 15 high-confidence + 15 ambiguous
   examples per segment from Vaughan history. Permanent benchmark —
   every prompt or model change replayed against it. Add Mississauga
   examples once those issues exist.
4. Set up prompt versioning: store R2 prompt versions in a versioned
   file with dates so regressions are rollback-able.

**Deliverables:**
- Dynamic few-shot selection running at start of R2
- Frozen eval set built and stored
- Prompt versioning in place

#### R7-W7 (3h): Inject examples into R2 prompt + validate

1. Update R2 classification prompt to include dynamically selected
   examples per segment (2–4 canonical examples + 2–3 hard negatives per segment). No RAG needed.
2. Add "What to Avoid" section per segment using LLM_Rationale from
   past failures.
3. Test on 20 records. Compare new vs. old SegmentSuggested output.
   Measure agreement with client's expected classifications.
4. Replay frozen eval set. Confirm no regression.

**Deliverables:**
- R2 classification prompt updated with dynamic historical examples
- Frozen eval set replayed — no regression confirmed
- Measurable improvement in classification agreement rate

---

### Release 8 — Handoff
**Owner: Ariel**

**Success =** Client runs the full weekly pipeline solo for 3 consecutive weeks without unrecovered errors or escalation.

**Exit criteria:**
- End-to-end pipeline run completed successfully on real Vaughan issue date.
- Client can run all scripts independently for Vaughan.
- Mississauga newsletter onboarded via config (no code changes).
- Runbook + failure protocol written and signed off.

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
   Threshold alert before client gets a surprise bill.
6. Add manual override audit trail: when editor flips Status, Segment,
   or Lock, log it. Feeds few-shot mechanism and informs eval.

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
