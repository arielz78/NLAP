# R6 Scope

**Owner:** Ariel
**Status:** PLACEHOLDER — not yet drafted. Full plan to be built in a dedicated planning session (Fable draft → focused critique → synthesize), per the methodology worked out in `Execution_Log.md` 2026-07-04.
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md` § Release 6 — Scoring (includes the 2026-06-04 Amendment and the 2026-06-30 PRE-R6 Addendum — read both before drafting, they already contain most of the method-fit framing).

**Read order:** this doc → `docs/NLAP_PostMVP_Roadmap_v3.md` § Release 6 → `docs/r5/R5_Scope.md` (for the reusability/config-drive items R6 inherits, e.g. #85).

---

## R6 Status Snapshot (placeholder — as of 2026-07-04)

**This doc exists only so `CLAUDE.md`'s Session Start pointer and `docs/README.md`'s active-release reference have somewhere real to point.** No R6 planning has happened yet beyond deciding *how* to plan it.

**Planned drafting sequence (see `Execution_Log.md` 2026-07-04 for full reasoning):**
1. Prerequisite data work — freeze the R6 eval set, extend `fetchBeehiivHistory.js`, join the client's tagged URL list against `issue_history.json` (roadmap R6-W4 steps 0/0a/1).
2. `/pro-approach` pass for right-sized framing.
3. Fable drafts this doc directly from: this file's template, the roadmap's R6 section (Amendment + Addendum + July 2 reinforcement), and the frozen eval set — including an explicit "heavier methods deliberately not used, and why" section.
4. One focused critique pass (not a multi-LLM ensemble) checking the draft against the roadmap's explicit cut list (recency, slot-position, segment click weight all already struck).
5. Issues opened from the finalized doc, labeled `r6` — not before.

**Next action:** do step 1 above, then draft.

---

## Drafting inputs — captured 2026-07-07 (synthesize into the doc; NOT the final draft)

Raw material for the Fable draft, consolidated from the 2026-07-06/07 sessions. Fable should turn this into prose + decisions, not paste it. Numbers here are current as of 2026-07-07.

### 1. The answer key exists (Step 0 done)
- Frozen eval set: **`eval/click_join_FROZEN_2026-07-07.{json,csv,txt}`** — 924 labeled records, 85.8% coverage, 7-day maturation cutoff (measured, Decision_Log §60). Committed/version-controlled. Full legend: `eval/README.md`.
- It grades **ordering of already-picked events** (a floor/sanity check), NOT selection. Label = within-section-within-issue percentile of Verified Unique Clicks (§59).

### 2. What R6 IS and ISN'T (the boundary the doc must nail)
- **R6 = imitation.** Replicate the editor's picks/ordering. A *perfect* R6 leaves clicks **flat** — the payoff is **automation + consistency + the scored substrate**, not more clicks.
- **R6 imitates the editor's ORDER, not the click order.** The frozen click set is a floor check (does R6's output positively correlate with real clicks?), NOT R6's target. Proof they differ: editor's slot gradient is only 0.60→0.43 across slots 1–5 — the editor loosely tracks clicks, so imitating the editor reproduces that *imperfect* gradient, not a clean click ranking. (Don't collapse "match the editor" and "match clicks" — a perfect click-match would mean R6 already beats the editor.)
- **"Beat the editor via smarter selection" is explicitly OUT of R6** → parked as **#87** (milestone `Future`). It's gated: its training signal (formula-pick vs editor-pick performance) doesn't exist until R6+R7 are live. R6→R7→[beat editor]; R8 is the separate productization/handoff track.

### 3. Signal-inventory sweep (the doc's first analytical section)
Candidate signals = features derived from the few Airtable fields R5 made usable. Sweep = fill-cut → variance/backtestability, per field. Post-R5 cohort fill (n=1,886, `Added to Base Date` ≥ 2026-06-01):

| Field | Post-R5 fill | Verdict |
|---|---|---|
| `Source` | 94% | **clean survivor** — source-reliability feature |
| `LocationName` | 95% | **clean survivor** — venue-recurrence feature (forward-only, see §4 below) |
| `City` | 100% | high-fill but likely **near-constant** (GTA) → variance check needed |
| `Start Date` | 100% | high-fill but pure recency **struck**; only weekend/day-of-week derivations survive |
| `SourceCategories` / `Organizer` / `SourceScore` | 42 / 36 / 36% | sparse → likely out |
| `CostRaw` | 14% | dead |
| `Event Title` / `DescriptionRaw` | 100 / 61% | unstructured — the **LLM route** uses these, not the table above |

- **`Score_*` / `Segment*` fields are dormant at 12% post-R5** → NOT a usable imitation target. The imitation target stays **`issue_history`** (what actually got published), which the frozen eval set already encodes.
- **Realistic funnel:** ~8 candidates in → fill-cut kills the sparse 5 → 4 high-fill → only **`Source` + `LocationName`** clearly survive the variance/backtest gate. This ~2-survivor result drives the **formula-vs-LLM** call: 2+ clean structured signals → formula viable; too thin/messy → LLM on the raw event.
- **Still-to-run in the sweep:** (a) `LocationName` string-**normalization** check (does same-venue→same-value? decides if venue-recurrence is even usable); (b) `City` variance; (c) investigate what the three `Score_*` fields historically were.

### 4. Validation design (how "did it work" gets answered)
- Backtest against the frozen set = **rank correlation** within section (Spearman-ish). Floor check only — catches a grossly-wrong formula. Necessary, not sufficient.
- **Selection is forward-only.** Venue can't be backtested against clicks (4% time-overlap between the click set and `LocationName`-bearing candidates) — same class as swap-rate.
- **Real gate = forward swap-rate** + live click monitoring, post-ship.
- **North-star KPI = CTOR** (normalizes list size + open rate; kills the subscriber-growth confound). Monitoring metric, not the training label; per-event percentile is the label.
- **Attribution / A/B:** raw "clicks went up" is NOT attributable (confounded by subscribers/season/copy). Only a **within-issue A/B** (formula pick vs editor pick, same week/list/blurb-generator) isolates the selection effect. Check statistical power at ~13k subs × 5 slots before betting on it.
- **Method-fit gate (state up front):** confirm "clicks up" is even a *selection* problem — copy (`generateBlurbs`) or source expansion may be bigger levers than a smarter scorer.

### 5. Deferred / carried
- 60-sec `percentileVuc` distribution eyeball on the frozen 924 (gutcheck #2) — not yet done; do before relying heavily on the label.
- Recurring-event recovery (~103 picks) — deferred per §59.
