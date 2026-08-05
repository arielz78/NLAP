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

⚠️ **Always invoke the venv's interpreter explicitly** — `models/.venv/Scripts/python.exe`, never
a bare `python` or `py -3`. A system interpreter is not guaranteed to exist, and if one does it
will not have the pinned deps. This is why every command above spells out the full venv path.

Deps are pinned in `requirements.txt` to the versions R6 was built against.
`.venv/` is gitignored — recreate it with the two commands above on a new
machine.

## sectioning/ — R7 section classifier

**How the pieces connect:** every script is a **producer** (writes a file to disk)
or a **consumer** (reads one). They never call each other live — they hand off
through files, so you can run one, inspect its output, then run the next. The
JS/Python split follows the same seam: **JS stages data** (pipeline-shaped, must
match production's serve-time recipe), **Python does the modeling**; the JSON files
in `corpora/` are the language-neutral handoff between them.

| File | What it does | Reads → Writes |
|---|---|---|
| `embed_corpus.py` | Embeds the 3-class corpus with `voyage-4-large` (run once, cached). Provider-agnostic — `--model text-embedding-3-*` restores the OpenAI path, and those OpenAI matrices are still cached on disk. | `issue_history.json` → `corpora/*.npy` + `embeddings_labels.json` |
| `cv_embeddings.py` | The 3-class embeddings CV + fit (the live representation path). | `corpora/*.npy` → prints |
| `fit_tfidf.py` | The 3-class TF-IDF fit on published history. Killed by Gate 1 (Decision_Log §67); kept as the frozen baseline. | `issue_history.json` → in-memory `vec`, `clf` (+ prints) |
| `probe_b_coverage.py` | Probe B — Gate 1 weighted token coverage + Gate 2 event blindness. | imports `fit_tfidf` + `corpora/raw_candidate_events.json` → prints |
| `classifier2give2editor.py` | Built the 400-row deck: filter → predict → stratify → export. | candidates + `fit_tfidf` → `deck/editor_deck_*` |
| `build_ambiguous_sections.py` | Pulls the tightest Couples/Golden boundary cases for editor re-ruling. | `issue_history.json` → `rulings/*` |
| `score_deck_pre_post_call.py` | Scores the editor's 400-row label deck, pre- vs post-walkthrough-call slices. | `deck/` labels → prints |
| `gate_step4a.py` | The reject gate — include-vs-None fit, the `route_s77()` label-routing contract, and out-of-fold scoring of the deck. | cached `corpora/transfer_*.npy` + the latest `data/tracking/r7_label_audits/` pull → `eval/step4*_disagreements.json` |
| `text_recipe.py` | The single serve-time text recipe — import it, never copy it. Score-time recipe must equal serve-time recipe (Decision_Log §70, §79). | imported by the scripts that build text → writes nothing |
| `corpora/stage_corpora.js` | (JS) Assembles the raw-candidate corpus — dedupes snapshots, builds serve-time text. | `issue_history.json` + snapshots → `corpora/raw_candidate_*.json` |

| Folder | Contents |
|---|---|
| `corpora/` | Staged inputs — published titles, raw candidate events, `stage_corpora.js` that builds them. |
| `deck/` | The 400-row editor deck, its answer key, and the labeled pull-back from Airtable. |
| `rulings/` | The 07-09 Couples/Golden ambiguous cases sent to the editor + his rulings. |
| `eval/` | Label-reconciliation artifacts and error-mechanism outputs from the gate steps. |

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
