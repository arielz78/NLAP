# issue-build — weekly ranking producer

Builds the editor's slate for one issue: shortlist the R7-scored candidates in the issue window, make
**one** LLM ranking call, repair and validate the response, allocate 5 picks + ordered alternatives per
section with `scripts/buildIssues.js`, and render the editor preview (HTML + Markdown).

This is the per-run `demo.js` / `prepare_inputs.py` lineage (Decision_Log §102) with the weekly
hand-edits removed. **The issue date is the only required input; nothing in this folder is edited for a
routine week.** No Airtable traffic of any kind. `scripts/r6/` is not used.

## Weekly sequence

Prerequisites, both already on disk before you start: a candidates snapshot
(`data/tracking/snapshots/`) and the R7 live-runner scores for the issue
(`data/tracking/r7_live_runner/issue_<date>_snapshot_<stamp>/`). Refresh
`data/beehiiv/issue_history.json` first, or `prepare` warns that the recency guidance is a week stale.

```
node scripts/issue-build/issueBuild.js prepare  --issue 2026-10-15 --fetch-pages   # inputs + request; fetches up to 30 thin-text event pages (pageExtract.js)
node scripts/issue-build/issueBuild.js call     --issue 2026-10-15                 # the one paid model call (~US$0.25)
node scripts/issue-build/issueBuild.js finalize --issue 2026-10-15                 # repair -> validate -> allocate -> render
node scripts/issue-build/issueBuild.js signoff  --issue 2026-10-15 --by "Ariel"    # after a person has read the slate
```

`call` is the only step that loads credentials (dotenv, `OPENAI_API_KEY`) or reaches the provider, and
it refuses to run twice in one run folder. `finalize` normally stops the first time: validation
reports one defect in the model response, you record the repair in the run folder's
`corrections.json` (below), and rerun `finalize`. Nothing is rendered until validation passes.

**A human reviews every slate before it is sent.** `RECEIPT.md` and `run_manifest.json` say so in every
run and stay unsigned until `signoff` writes `human_review.json`.

## One command for the week

`runWeek.js` runs the prerequisites and the first three steps above in order, for one issue date:

```
node scripts/issue-build/runWeek.js --issue 2026-10-22
```

| # | Stage | What it runs | Skipped when |
|---|---|---|---|
| 1 | `snapshot` | `scripts/snapshotCandidates.js` | a snapshot under 24 hours old exists, or the issue's R7 folder names one |
| 2 | `r1-freshness` | nothing: a check on the snapshot | `--skip-r1`, or the snapshot is already scored |
| 3 | `history` | `scripts/fetchBeehiivHistory.js` | the history already runs through the previous issue |
| 4 | `r7-score` | `models/sectioning/live_runner.py`, once, with its paid embedding calls | `scored_survivors.jsonl` exists |
| 5 | `prepare` | `issueBuild.js prepare --fetch-pages` | the run folder holds a request |
| 6 | `call` | `issueBuild.js call` (the paid model call) | the run folder holds a response |
| 7 | `finalize` | `issueBuild.js finalize` | the preview is rendered |

It stops at the first failing stage, names it, and leaves earlier outputs in place; rerunning the same
command resumes there. A paid call whose output is on disk is never repeated, and a run folder that
records a call with no response is refused, not called again. It never runs `signoff`.

**It checks R1; it does not run it.** R1 has only a manual trigger in n8n, so nothing here can start it.
If the newest candidate in the snapshot is more than 24 hours older than the capture, the command stops
and asks you to run "NLAP R1" in n8n. `--skip-r1` builds on the snapshot anyway.

Exit codes: 0 preview rendered · 1 a stage failed · 2 thin supply · 3 the validation stop (record the
repair in `corrections.json` and rerun). Other flags: `--snapshot <stamp>`, `--version vN` (required when
a date already has several run folders), `--no-fetch-pages`, `--r1-max-age-hours N`, `--python <path>`.

Tested with stubbed stages only; it has not yet run a real week end to end.

## Console bundle

`to-bundle.js <run folder>` converts a finished run into the editor console's `IssueBuild` contract
(`apps/editor-console/lib/contracts.ts`) and writes `bundle.json` into the run folder. It refuses, and
writes nothing, when a required field cannot be filled from the run folder. A run finalized on or after
2026-10-13 converts; an older run folder is refused for the fields it predates and is never rewritten
(rebuild it from its saved response into a fresh folder).

The replacement assessment matrix (ship-plan item 9, Decision_Log §108) is filled from the producer's own
`replaceable_slots`: replacing an original pick with an alternative is `clean` when the pick's slot is in
that alternative's list and a warning (`override`) otherwise. Pairs the producer never assessed, which can
only arise after an earlier swap, are marked as not checked. Nothing is ever `unavailable`. The console
does not show this table to the editor: it assesses each swap against the current lineup itself
(`apps/editor-console/lib/replacement-rules.ts`). The table feeds the saved record of a swap only.

`finalize` supplies the fields the bundle needs. In `displayed_events.json`, beside each description:

- **`series_id`**: the event's title, lowercased with whitespace collapsed. Listings with the same title
  are one series whatever the venue or time (the key R7 and `scripts/r6` use, Decision_Log §92). The
  console uses it only to warn when a swap puts two of one series in a section.
- **`classification`**: `classified` for every displayed event, because each was placed in its section by
  the ranker. `unclassified` is reserved for an event that reached the console without the ranker.

Neither is added to the ranking packet, so the model's input is unchanged. The other two:

- **`build_version`** in `run_manifest.json`: one more than the number of finished runs (folders holding
  a `run_manifest.json`) for the same issue date, and never at or below a `build_version` one of them
  already carries. A run finished before the field existed counts as one build; a run that stopped
  before its manifest does not. Deleting the highest-numbered run folder frees its number.
- **`displayed_events.json`**: one row per event the preview shows (picks and listed alternatives), with
  a non-empty `description` and a `description_source`. `source` is the snapshot's `DescriptionRaw`,
  unchanged. `fallback` is used when that is missing or blank: the title, date, venue, city and source
  from the snapshot, ending "No description was supplied by the source". No model call and no page
  fetch. The mark stays in this file; the console's contract has no field for it.

A run finalized before these existed is also refused for them, and stays that way: outputs are never
rewritten.

## Replay (no model call, no page fetch)

Rebuilds a week from a saved response. Runs `prepare` and `finalize`, never `call`:

```
node scripts/issue-build/issueBuild.js replay --issue 2026-10-08 \
  --response      data/tracking/r6_demo/v5_2026-10-08_snapshot_2026-10-04_1222/response.json \
  --page-evidence data/tracking/r6_demo/v5_2026-10-08_snapshot_2026-10-04_1222/page_evidence.json \
  --corrections   data/tracking/issue_build/replay_corrections/2026-10-08_v5.json
```

Page evidence is reused only behind the explicit `--page-evidence` flag (or declined with
`--no-page-evidence`); replay never fetches. The files are copied into the new run folder; the source
folder is not touched. `replay.json` records that the response answered the request saved beside it,
which can differ from the request this run built. To rerun the post-response stages only, in a run
folder that already holds a `response.json`, use `finalize`.

## Discovered vs passed

| Value | Source | Override |
|---|---|---|
| Issue date | `--issue` (required) | — |
| Window, labels, seasonal-history month | derived: IssueDate+1 … +10; same month one year earlier | — |
| R7 scores folder | discovered: latest `r7_live_runner/issue_<date>_snapshot_*` holding `scored_survivors.jsonl` | `--r7-dir` |
| Snapshot | the stamp in the R7 folder name (the snapshot R7 scored — not simply the newest on disk) | `--snapshot` |
| Demonstration number, version tag (`v<number>`) | derived: weeks since `guidance.json` `first_demo_issue` | `--demo-number`, `--version` |
| Recency dates in the guidance | discovered: three latest issues in the publication history | `--recent-issues a,b,c` |
| Unreviewed-round notes | derived: Thursdays after the last `reviewed_demo_issues` entry | edit `guidance.json` |
| Run folder | `data/tracking/issue_build/<version>_<date>_snapshot_<stamp>/` | `--run-dir` |
| Page evidence | none unless asked | `--fetch-pages` / `--page-evidence <file>` |
| Response (replay), corrections | — | `--response <file>`, `--corrections <file>` |
| Python | `models/.venv/Scripts/python.exe` | `--python` |

Later stages find the run folder from `--issue` (add `--version` or `--run-dir` if a date has several).

Runs through v5 were hand-built and live in `data/tracking/r6_demo/`. That folder's `RUNS.md` is still the
one index of every version, including the ones written here.

## When the editor gives feedback

That is the one time the producer's inputs change: add the round to `guidance.json` and edit the guidance
text in `editor_rules.template.md` / `ranking_prompt.template.txt`. `prompt_template_sha256` in the manifest
then changes, which is the point — it is stable across weeks otherwise.

## Private files

`guidance.json`, `editor_rules.template.md` and `ranking_prompt.template.txt` hold the editor's feedback
and are gitignored, because this repo is public. They live in this folder beside the code. Each has a
tracked `*.example` copy with the feedback stripped out. On a fresh clone, copy each example to its real
name and fill in the `TODO(ariel)` blanks; `prepare` refuses to run while a file is missing or a blank
remains. The manifest records a hash of each, so a run still identifies exactly which version it used.

## Corrections file

Hand repairs are data, not a per-week script. `<run folder>/corrections.json`:

```
{ "source_response_sha256": "<sha256 of response.json>",
  "corrections": [
    { "defect": "D1", "op": "remap_id", "section": "For Couples", "from": "recWJX…", "to": "rec0WJX…" },
    { "defect": "D2", "op": "drop_row", "section": "For Golden Age Readers", "id": "rec…" } ] }
```

Ops: `remap_id` (section, from, to) · `drop_row` (section, id) · `drop_everywhere` (id) ·
`drop_duplicate_section` (section; two identical copies) · `drop_empty_section` (section; a repeat with no
rows) · `drop_exclusion` (id; a ranked record also filed under exclusions, ranking kept) ·
`set_quote` (id, from, to). Each applies only if its precondition
holds; extra keys (`title`, `type`, `detected_by`, …) are carried into the receipt.

## Automatic repairs

Besides the form-link rule below, `finalize` repairs four bookkeeping defects by itself (ship-plan item
16a), after the corrections file, so a hand repair always wins. Each is repaired only when exactly one
correction exists; otherwise validation stops the run as before. Every repair is listed under
`repair_receipt.automatic` and in `RECEIPT.md`, with its `type`:

| `type` | Repaired when | Left for a person when |
|---|---|---|
| `repeated_section` | a section is returned more than once and every copy but one is empty, or all copies are identical | two copies hold different rows |
| `record_id_typo` | an unknown id is one character (added, dropped or changed) from exactly one shortlisted id, that id is not already in the section, and the row's quote is in that record | two ids are that close, the quote is missing or not in that record, or the id is further off |
| `quote_text_mismatch` | the quote matches exactly one span of the record's text once case, spacing and typographic quotes/dashes are ignored; the quote is replaced with that span | a word is added or missing, nothing matches, or two different spans match |
| `history_ref_typo` | an unknown history ref is one character from exactly one ref the packet offered for that record (exact-URL or similar-title publications) | two offered refs are that close, or none is |

A remapped history ref carries a `check` note: the row's reason was written against the mistyped ref.
These run in code; no second model call is made. Retrying the call on a stop is a possible later option.

## Built-in stops

- **Form links (Decision_Log §101).** A record whose URL matches `forms.gle` or `docs.google.com/forms`
  stays in `evidence_inputs.json` but never enters the shortlist; a replayed response that ranks one has
  the row removed, recorded under `repair_receipt.automatic`.
- **Thin supply — exit code 2, no preview.** Before the request: fewer than 15 usable in-window
  candidates. After the response: any section with fewer than 5 picks or fewer than 5 replaceable
  alternatives (the two checks the per-run scripts already made). The message names the section and count.
- Any other failure exits 1.

## Output (all under the run folder, gitignored; files are never overwritten)

`week.json` (every derived/discovered value) · `evidence_inputs.json`, `preparation_manifest.json` ·
`editor_rules.md`, `ranking_prompt.txt` (as sent) · `page_evidence.json` · `ranking_packet.json`,
`request.json`, `request_manifest.json` · `response.json`, `usage.json`, `attempt.json` or `replay.json` ·
`ranked_pool.json` (the repaired, validated ranking), `allocation.json`, `validation.json` ·
`displayed_events.json` · `editor_preview.html`, `editor_preview.md` · `run_manifest.json` (git SHA,
`build_version`, `prompt_template_sha256`,
`repair_receipt`, `human_review`, checks, hashes) · `RECEIPT.md` · `human_review.json` after signoff.

## Tests

`node scripts/issue-build/issueBuild.test.js` — offline; fixture dates are offsets from the issue date.

`node scripts/issue-build/runWeek.test.js` — offline; every stage is a stub, so no snapshot, embedding
call or model call happens.

`node --test scripts/issue-build/to-bundle.test.js` — offline. Its check against the console's TypeScript
contract needs `apps/editor-console` installed and skips itself otherwise (it is skipped in CI).
