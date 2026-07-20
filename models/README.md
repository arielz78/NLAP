# models/ — offline model building and evaluation

Everything here decides **what goes in the newsletter and where**. It is all
offline tooling: it reads snapshots and history files, and **never touches
Airtable, n8n, or any pipeline file**. The live pipeline lives in `scripts/`
and `workflows/`.

Organized by **what problem it solves**, not by which release built it — code
outlives releases (`models/ranking/` was built for R6 and its venv has served
R7 all along). Release numbers stay on docs (`docs/r{N}/`), milestones, and
branches.

| Folder | Question it answers | Release |
|---|---|---|
| `sectioning/` | Which section does this event belong to? | R7 |
| `ranking/` | Which events score best this week? | R6 |

## Setup — one venv for both

```
py -m venv models/.venv
models/.venv/Scripts/python.exe -m pip install -r models/requirements.txt
```

Run everything **from the repo root** with the venv's python:

```
models/.venv/Scripts/python.exe models/sectioning/probe_b_coverage.py
models/.venv/Scripts/python.exe -m models.ranking.generate_pairs <snapshot.json>
```

`sectioning/` scripts are standalone files (run by path). `ranking/` is a
Python package using relative imports, so it must be run with `-m` and the
dotted module path, not by file path.

Deps are pinned in `requirements.txt` to the versions R6 was built against.
`.venv/` is gitignored — recreate it with the two commands above on a new
machine.

## sectioning/ — R7 section classifier

| File | What it does |
|---|---|
| `fit_section_classifier.py` | The 3-class fit (Families/Couples/Golden) on published history. The reference model. |
| `probe_b_coverage.py` | Probe B — Gate 1 weighted token coverage + Gate 2 event blindness. |
| `score_deck_pre_post_call.py` | Scores the editor's 400-row label deck, pre- vs post-walkthrough-call slices. |
| `classifier2give2editor.py` | Built the 400-row deck: filter → predict → stratify → export. |
| `build_ambiguous_sections.py` | Pulls the tightest Couples/Golden boundary cases for editor re-ruling. |

| Folder | Contents |
|---|---|
| `corpora/` | Staged inputs — published titles, raw candidate events, `stage_corpora.js` that builds them. |
| `deck/` | The 400-row editor deck, its answer key, and the labeled pull-back from Airtable. |
| `rulings/` | The 07-09 Couples/Golden ambiguous cases sent to the editor + his rulings. |

## ranking/ — R6 scorer eval harness

Collects forced-choice editor pair judgments and grades candidate scorers
against them. See `ranking/README.md` for the full workflow.
`ranking/click_join/` holds the frozen, committed click-eval answer set and
its legend — read that README before using the labels.

## Naming rule

Subfolder names say **what problem is solved** (`sectioning`, `ranking`), not
what technique currently solves it. R7's representation changed from TF-IDF to
embeddings on 2026-07-20 without any folder needing a rename — that is the
property being protected.

⚠️ **Do not name any subfolder `data/` or `output/`.** The root `.gitignore`
matches those names at any depth, so committed artifacts placed there would
silently stop being tracked.
