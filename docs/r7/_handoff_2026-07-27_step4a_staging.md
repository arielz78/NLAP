# Handoff — Step 4a staging, 2026-07-27 (5:35 PM)

**Temp doc, resume-point only.** Absorbed by `/wrap` (Execution_Log + the conditional homes), then delete.
Written from a remote session (Ariel away from the machine) so the pickup does not depend on chat access.

**What was done:** `models/sectioning/gate_step4a.py` created — the plumbing half of Step 4a, run and verified.
**What was NOT done:** the fit, the sweep, the per-section read, the operating-point call. All authored-core, all
still yours. No Airtable writes, no re-embed, no spend, nothing committed.

**Still blocking and untouched:** the n8n re-import of `workflows/NLAP R1.json` (#109 fixed in repo, NOT live —
12.9% of AllEvents ingestion still leaking). Neither of us could do it; it is a browser GUI.

---

## The script

`models/sectioning/gate_step4a.py` — follows `transfer_test.py`'s banner convention: plumbing above the
`===== EVAL =====` banner, authored core below, with a guard that refuses to score until four blind
pre-commitments are pinned. Run with `py -3 gate_step4a.py` (note: `python` on PATH is the Windows Store
stub; `py -3` is 3.13.7 with numpy 2.4.4 / sklearn 1.9.0).

It loads the cached `transfer_nocats_voyage-4-large.npy` (416 × 2048), re-joins the current 07-26 editor
labels by `Row`, builds the binary include/None target, builds URL-then-title CV groups, and stages the
auxiliary columns (section, slice, source domain, desc length, has-cats, has-note). It currently exits 1 on
the guard — that is the design, not a failure.

**Header caveat, load-bearing:** the negatives are the **merged None (225 rows), not `Wrong fit`.** The
four-way split (§75) is 12 of 239 done and cannot be used yet. So this curve is a *provisional* pricing and
it moves when the split lands — in both directions, which do not cancel: `Rule-break` negatives are trivially
separable and flatter the gate, `Outcompeted` negatives are genuinely includable events labelled None and
score the gate as wrong for keeping good events. Tag anything that leaves here as
`(n=416, merged-None negatives, measured 2026-07-27, grouped 5-fold CV)`.

---

## Findings from the staging run

**1. Zero label drift.** 0 of 416 rows changed between the 07-20 and 07-26 pulls, and 0 embedded rows are
absent from the current pull. The cached vectors are valid against current labels — no re-embed, no spend.

**2. Base rate 45.9% includable (191 include / 225 None, n=416).** Independently corroborates the §74
amendment's ~46.5% eligibility figure, which was measured on n=114 at CI ±9. Same number on a 3.6× larger
sample. **The population correction holds** — this is the second independent read, not a re-quote of the first.

**3. ⚠️ Golden's per-section denominator is 55, so grouped 5-fold puts ~11 events in a fold — one event moves
that section's recall by ~9 points.** This bears directly on pre-commitment (1): choosing `per_section_floor`
sets a release bar off a quantity a single Golden event swings by nine points. Families is 79 (~16/fold),
Couples 57 (~11/fold). Decide what to do about this *before* seeing the curve, or the choice is post-hoc.

**4. Median description is 115 chars against `DESC_CHAR_CAP = 300`; 53 rows (12.7%) have no description at
all.** The cap is barely binding on the median row *today* — it only starts biting after the #108 backfill.
Points the same direction as the `transfer_test.py:74` coupling finding: there is no coherent position that
backfills and keeps 300. **New input to the merged `DESC_CHAR_CAP`/backfill call on #108.**

**5. Minor, but it corrects a written rule.** `eventbrite.com` is **20.6% includable (7 of 34)**, not 0%.
R7_Scope Step 3's "drop foreign Eventbrite" is scoped to `.de/.fr/.co.uk/.sg`; this confirms `.com` cannot be
folded into that rule as a foreign-domain proxy. 7 keepers would die.

**6. Context for pre-commitment (2).** The slices are differently balanced — gate 95 include / 89 None
(51.6%), train 86 / 124 (41.0%). Train was drawn deliberately hard, which is what §69's never-pool rule is
about, and it is why "which population is the operating point read off" is a real question rather than a
formality.

---

## What you do next, in order

1. **Pin the four blind pre-commitments** (`gate_step4a.py:230`) — they are `None` and the guard blocks on them:
   - `RECALL_DIAL` — global keeper recall, or a per-section floor? (See finding 3 first.)
   - `CURVE_MEASURED_ON` — gate slice, all-grouped-CV, or both reported? If not "gate", say why pooling is
     legitimate here when §69 says it is not.
   - `MERGED_NONE_VERDICT` — does this curve *set* the bar or only *bound* it pending the split? Answering
     "sets it" commits to the claim that the four-way split will not move the curve. Nobody has evidence for that.
   - `ITERATION_LADDER` — the stopping rule if no threshold gives an acceptable trade. Fork C ("the gate is not
     the win, ranking is") is a legitimate outcome here, not a failure.
2. **Then the fit and the sweep** — TODOs are written out in order below the banner: out-of-fold probabilities
   via `GroupKFold` (in-sample would price a curve the gate cannot reproduce — the same failure as 0.774 → 0.61),
   the recall/junk curve anchored against the two measured points (0.95 → 43%, 0.90 → 55%), per-section recall
   at each point, the 0.95↔0.98 event count, a calibration check, and the §75 breadth diagnostic.
3. **Write the chosen operating point into `R7_Scope.md` as the bar, with its provenance tag.** Until that is
   written, the doc names no recall target.

**Owed before you run it:** your prediction — junk rejection at 0.95 recall, and which section goes dark
first. Asked three times this session, not yet given. The delta between the guess and the curve is the signal.

---

## Promotion at `/wrap` — do not let this doc become a fifth home

By the source-of-truth rule these findings belong elsewhere; this doc is a resume point, not a home:

| Finding | Real home |
|---|---|
| 2 — base rate corroboration (n=416) | `R7_Scope.md` snapshot, as a second read on the §74 amendment |
| 3 — Golden fold denominator | `R7_Scope.md` Step 4a, as a caveat on the per-section requirement |
| 4 — desc median vs the cap | **#108**, on the merged `DESC_CHAR_CAP`/backfill call |
| 5 — `eventbrite.com` at 20.6% | `R7_Scope.md` Step 3, correcting the foreign-Eventbrite rule's scope |
| 1, 6 — drift check, slice balance | the script prints them; the script is the home. No doc change. |
