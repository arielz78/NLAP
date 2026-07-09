# r6_eval — scorer eval harness + forced-choice pair collector

Offline tooling for R6: collect ~150–200 editor pair judgments, then grade
candidate scorers against them. Reads a Candidates snapshot JSON only —
**never touches Airtable, n8n, or any pipeline file.** All outputs land in
`r6_eval/output/` (gitignored).

## Setup

```
py -m pip install -r r6_eval/requirements.txt
```

Run everything from the repo root.

## 1. Generate pairs + the collector page (this weekend's step)

```
py -m r6_eval.generate_pairs <snapshot.json>
```

Use a **fresh** snapshot (run `scripts/snapshotCandidates.js` first) — eligibility
requires `Start Date >= today`, so a stale snapshot yields a thin pool.
The fixture works too: `py -m r6_eval.generate_pairs r6_eval/fixtures/fixture_snapshot.json`.

Flags: `--per-section 55` `--seed 7` `--holdout-frac 0.2` `--duplicates 10`
`--out DIR` `--today YYYY-MM-DD` (pin for reproducibility with old snapshots).

Writes to `r6_eval/output/`:
- `collector.html` — send this single file to the editor. Opens from disk, no
  internet needed. Click a card to pick the winner, optional one-word "why",
  Enter/Next to advance. Progress + Download CSV in the header. Answers
  auto-save to the browser (`localStorage`), so closing the tab loses nothing.
- `pairs_manifest.json` — full pair definitions + generation provenance
  (git commit, snapshot file, config, seed).

Eligibility filter (configurable in `config.py`): `R2Status == Enriched`,
`Status != Rejected`, section in the 3 event segments, city in
Vaughan/Markham/Richmond Hill, future `Start Date`, non-empty title +
`DescriptionRaw`, venue not blank and not in `venue_blocklist`.

## 2. Editor answers → CSV

The Download button exports one row per answered pair:

```
pair_id, section, event_A_id, event_B_id, winner, why, is_holdout, duplicate_of
```

`event_*_id` = `UniqueEventID`; `winner` = A|B. `is_holdout` / `duplicate_of`
ride along invisibly from the manifest.

## 3. Grade a scorer

```
py -m r6_eval.grade <answers.csv> <snapshot.json> --scorer baseline_date_sort
py -m r6_eval.grade <answers.csv> <snapshot.json> --scorer llm_comparator
py -m r6_eval.grade <answers.csv> <snapshot.json> --scorer pairwise_lr
```

Flags: `--today` `--seed` `--bootstrap N` `--json results.json`.
Use the **same snapshot** the pairs were generated from.

Reports: **holdout-only agreement** (headline) per section + overall with
bootstrap 95% CIs, training-set agreement (reference), editor
**self-consistency on duplicates** (excluded from agreement), and a
provenance line (git commit + snapshot + pairs file).

Held-out discipline is enforced in `grade.py`: `pairwise_lr` trains only on
non-holdout, non-duplicate pairs; the headline never includes training pairs.

## Scorers (`scorers.py`)

| name | type | status |
|---|---|---|
| `baseline_date_sort` | pointwise, 1/days-to-event | fully working — the floor to beat |
| `llm_comparator` | pairwise LLM judgment on raw title+description | interface + prompt done; **runs on a seeded stub without an API key**. Set `R6_LLM_API_KEY` (or `OPENAI_API_KEY`), optionally `R6_LLM_MODEL` (default `gpt-5.4-nano`) and `R6_LLM_BASE_URL`, to use a real model. The real-API path is untested (no key in this environment). |
| `pairwise_lr` | LogisticRegression on feature-difference vectors, L2, no intercept | machinery working; 2 of 4 features are documented stubs |

Features (`features.py`): `venue_recurrence` (live), `source_prior` (live;
config map or pool frequency), `click_prior` (**stub → 0**, wire to Beehiiv
history later), `content_fit` (**stub → 0**, plug any
`callable(candidate, section) -> [0,1]` via `config["content_fit_fn"]`).

## Test helpers

```
py -m r6_eval.make_fixture           # regenerate the fixture (dates relative to today)
py -m r6_eval.simulate_answers r6_eval/output/pairs_manifest.json
```

`simulate_answers` fakes an editor who prefers earlier events 80% of the time
and answers duplicates consistently 90% of the time — for exercising the
grader only, never real data.

## Judgment calls (where the spec was silent)

- **Snapshot shapes:** loader accepts the `snapshotCandidates.js` format
  (`{records: [{fields: …}]}`) and bare arrays of flat records.
- **Duplicates are shown A/B-swapped** so self-consistency measures the
  judgment, not visual memory; grading matches by winner *event id*.
  Duplicates are never holdout and are spaced ≥ 30 slots after the original.
- **Collector hides dates and venues** (title + description + section only) —
  proximity ranking is exactly what the scorer replaces, so it shouldn't be
  visible at judgment time.
- **Ties** (equal scores) count as 0.5 agreement — expectation of a random
  tiebreak.
- **Holdout is sampled per section** so per-section holdout numbers exist.
- **Scorer protocol:** the spec's `score(candidate, config) -> [0,1]` holds
  for pointwise scorers (config bound at construction, overridable per call);
  `llm_comparator` is inherently pairwise so it exposes
  `compare(a, b, section) -> "A"|"B"`, which the grader prefers when present.
- **Feature stats ignore the date filter at grade time** so venue/source
  counts don't drift as events expire between collection and grading.
- **Empty `LocationName` is excluded from the pair pool** (per spec) even
  though the allocator lets blank venues through — noted so nobody "fixes" it.
