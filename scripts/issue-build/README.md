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
node scripts/issue-build/issueBuild.js prepare  --issue 2026-10-15 --fetch-pages   # inputs + request; fetches up to 24 public event pages
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
`drop_duplicate_section` (section) · `set_quote` (id, from, to). Each applies only if its precondition
holds; extra keys (`title`, `type`, `detected_by`, …) are carried into the receipt. The one automatic
repair is the form-link rule below. Nothing else is repaired without a person (Decision_Log §102).

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
`editor_preview.html`, `editor_preview.md` · `run_manifest.json` (git SHA, `prompt_template_sha256`,
`repair_receipt`, `human_review`, checks, hashes) · `RECEIPT.md` · `human_review.json` after signoff.

## Tests

`node scripts/issue-build/issueBuild.test.js` — offline; fixture dates are offsets from the issue date.
