# eval/ — Frozen R6 evaluation set (committed answer key)

This directory holds the **frozen, version-controlled** labeled evaluation set for R6 (Scoring).
It lives here — outside `data/` — deliberately: `data/` is gitignored because it holds raw
`link_clicks_*.csv` exports bearing `_bhlid` subscriber tokens. The **join output is PII-free**
(only stripped URLs + aggregate click counts + percentiles — verified 0 `_bhlid`, 0 emails), so it
is safe to commit, and it *should* be committed: it's a load-bearing R6 dependency and must not
survive as a single unbacked copy on one machine.

## Canonical file: `click_join_FROZEN_2026-07-07.{json,csv,txt}`

- **924 labeled records**, 3 scored sections (For Families / For Couples / For Golden Age Readers).
- **Source:** `issue_history.json` (77 issues) ⋈ `link_clicks_2026-07-07T13_54_36…csv` (all-time export, 2026-07-07).
- **Label:** within-section-within-issue percentile of Verified Unique Clicks (`percentileVuc`).
- **Maturation cutoff:** 7 days (measured 2026-07-07: clicks plateau by ~day 7 — <0.5% growth after,
  via two-snapshot May→Jul diff). Excludes only `beat-the-heat-your-5-smart-picks` (5d old).
- **Coverage:** 85.8% (966/1126 scored picks). The gap to a naive ~92% is recurring events where
  `utm_campaign` ≠ post `slug`; 85.8% is the *correctly-attributed* number, not a miss.

## What this set is — and isn't

- ✅ Grades the **ordering** of events the editor already picked (a floor / sanity gate for a scoring formula).
- ❌ Does **not** validate **selection** (no historical reject pool exists). Selection is validated
  **forward** via swap-rate — that remains R6's real gate. A green backtest here is necessary, not sufficient.
- The label is confounded with slot position and copy; treat it as directional, not ground truth.

## Regenerating / re-freezing

Runs are produced by `scripts/joinClicksData.js` → ephemeral, gitignored output in
`data/tracking/click_analysis/`. To promote a new run to the frozen answer key, copy it here under a
`click_join_FROZEN_<date>` name and update this README. The build plan is
`~/.claude/plans/proud-dancing-origami.md` (completed 2026-07-07).
