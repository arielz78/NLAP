"""Build the Step 4c chosen-point error-mechanism evidence packet.

This is analysis plumbing, not an adjudicator. It reproduces the frozen Step 4c fit,
selects the gate-slice errors at the registered operating point, and exposes the evidence
Ariel needs to classify each failure. It deliberately leaves every mechanism and remedy
as TODO(ariel): those calls change the conclusion and belong to the authored core.

Run from the repository root:
    models/.venv/Scripts/python.exe models/sectioning/build_step4c_error_table.py
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
from pathlib import Path


sys.stdout.reconfigure(encoding="utf-8")


class _Quiet(io.StringIO):
    def reconfigure(self, **_):
        pass


with contextlib.redirect_stdout(_Quiet()):
    import gate_step4a as g


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EVAL_OUT = HERE / "eval" / "step4c_error_mechanisms.json"
DOC_OUT = ROOT / "docs" / "r7" / "R7_Step4c_Error_Mechanism_Table.md"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


step1c = _load_json(HERE / "eval" / "step1c_reconciliation.json")
step1c_by_row = {int(item["row"]): item for item in step1c["rows"]}

step4b = _load_json(HERE / "eval" / "step4b_reconciliation.json")
step4b_by_row = {
    int(key.removeprefix("r")): verdict
    for key, verdict in step4b["verdicts"].items()
}

# Read-only live-source checks performed 2026-08-03 after the error set was sealed.
# These are observations about input coverage, not mechanism classifications.
LIVE_SOURCE_FINDINGS = {
    218: (
        "HTTP 200. The live library description continues beyond the cached 300-character "
        "cutoff with budgeting, goal-setting, financial-literacy and CPA Canada details. "
        "The model-visible text already included 'Audience: Adult, Older Adult' and the "
        "financial-literacy premise."
    ),
    258: (
        "HTTP 200. The public Eventbrite metadata adds organizer, date and location but no "
        "clearer audience signal than the cached text; the model already saw 'transition "
        "into retirement' and 'financial future'."
    ),
    8: (
        "HTTP 200, event ID verified by fetchAllEventsDescriptions.js. The cached input was "
        "title-only; the live body yields 2,085 characters describing an ages 8–12 summer "
        "program, a real market stand, family/community guests and a charity donation."
    ),
}


def _provenance(row: int) -> str:
    if row in step1c_by_row:
        item = step1c_by_row[row]
        return (
            f"Step 1c: {item['disposition_provenance']} / "
            f"section {item.get('section_provenance') or 'n/a'}"
        )
    if row in step4b_by_row:
        return f"Step 4b audited: {step4b_by_row[row]}"
    batch = g.batch_of.get(row)
    return f"Current deck{f' / batch {batch}' if batch else ''}"


threshold = float(g._op["threshold"])
gate = g.slice_ == "gate"
lost_keeper = gate & (g.y == 1) & (g.p < threshold)
surviving_junk = gate & (g.y == 0) & (g.p >= threshold)

assert round(threshold, 4) == 0.4530, threshold
assert int(lost_keeper.sum()) == 3, int(lost_keeper.sum())
assert int(surviving_junk.sum()) == 32, int(surviving_junk.sum())
assert int((lost_keeper | surviving_junk).sum()) == 35


def _entry(i: int, error_type: str) -> dict:
    row_meta = g.rows_fit[i]
    row = int(row_meta["row"])
    raw = g.raw_by_url.get(row_meta["url"], {})
    desc = g.clean(raw.get("desc") or "").strip()
    title = (raw.get("title") or "").strip()
    return {
        "row": row,
        "error_type": error_type,
        "p_include": round(float(g.p[i]), 4),
        "margin_from_cutoff": round(float(g.p[i] - threshold), 4),
        "current_label": str(g.section[i]),
        "source": str(g.source[i]),
        "cv_group": int(g.groups[i]),
        "title": title,
        "model_visible_description": desc,
        "description_characters": len(desc),
        "source_categories_present": bool(g.has_cats[i]),
        "none_reasons": g.reasons_of.get(row, []),
        "none_reasoning": g.note_of.get(row),
        "label_provenance": _provenance(row),
        "live_source_finding": LIVE_SOURCE_FINDINGS.get(row),
        "url": row_meta["url"],
        "mechanism": "TODO(ariel)",
        "evidence": "TODO(ariel)",
        "smallest_fix": "TODO(ariel)",
    }


# Most severe keeper misses first; most confident surviving junk first.
keeper_idx = sorted(
    [int(i) for i in range(len(g.y)) if lost_keeper[i]],
    key=lambda i: float(g.p[i]),
)
junk_idx = sorted(
    [int(i) for i in range(len(g.y)) if surviving_junk[i]],
    key=lambda i: float(g.p[i]),
    reverse=True,
)
entries = (
    [_entry(i, "demoted_keeper") for i in keeper_idx]
    + [_entry(i, "surviving_junk") for i in junk_idx]
)

rows_by_group: dict[int, list[int]] = {}
for item in entries:
    rows_by_group.setdefault(item["cv_group"], []).append(item["row"])
for item in entries:
    item["same_error_group_rows"] = [
        row for row in rows_by_group[item["cv_group"]] if row != item["row"]
    ]

unique_groups = len(rows_by_group)

payload = g.stamped({
    "purpose": "Chosen-point error-mechanism evidence; observation only, not decision",
    "source_pull": g.CURRENT_PULL.name,
    "operating_point": threshold,
    "selection": {
        "slice": "gate",
        "demoted_keeper": "y=1 and p_include < operating_point",
        "surviving_junk": "y=0 and p_include >= operating_point",
    },
    "acceptance_counts": {
        "total": len(entries),
        "unique_cv_groups": unique_groups,
        "demoted_keepers": len(keeper_idx),
        "surviving_junk": len(junk_idx),
    },
    "allowed_mechanisms": [
        "label_error",
        "missing_input",
        "representation_failure",
        "boundary_ambiguity",
        "policy_mismatch",
    ],
    "rows": entries,
})
EVAL_OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


lines = [
    "# R7 Step 4c — Error-Mechanism Table",
    "",
    "**Status:** evidence worksheet, not a decision. The operating point and release status",
    "remain in `R7_Scope.md`; any resulting architecture decision belongs in the Decision Log.",
    "",
    f"**Selection:** gate slice at `P(include) = {threshold:.4f}` — "
    f"{len(keeper_idx)} demoted keepers + {len(junk_idx)} surviving rejects = {len(entries)} rows.",
    f"Those rows represent **{unique_groups} independent CV groups**; repeated rows are "
    "identified on their evidence cards so one mechanism ruling can cover identical events.",
    "",
    "## Classification rule",
    "",
    "For each row, choose exactly one primary mechanism:",
    "",
    "- `label_error` — the current target is wrong or inconsistent.",
    "- `missing_input` — decisive information exists but was absent from model-visible text.",
    "- `representation_failure` — the information was present but the model missed it.",
    "- `boundary_ambiguity` — reasonable editors could disagree from the available evidence.",
    "- `policy_mismatch` — permanent include/reject is not the decision this row actually needs.",
    "",
    "`TODO(ariel):` classify the mechanism, cite the evidence, and name the smallest fix.",
    "Do not infer a model change from title alone; open the source only after reading what",
    "the model actually saw, and record what the source added.",
    "",
    "## Compact index",
    "",
    "| # | Error | Row | Score | Margin | Label | Source | Input | Title |",
    "|---:|---|---:|---:|---:|---|---|---|---|",
]

for pos, item in enumerate(entries, 1):
    coverage = (
        f"desc {item['description_characters']} chars"
        if item["description_characters"]
        else "TITLE ONLY"
    )
    title = item["title"].replace("|", "\\|") or "(no title)"
    lines.append(
        f"| {pos} | {item['error_type']} | {item['row']} | {item['p_include']:.4f} | "
        f"{item['margin_from_cutoff']:+.4f} | {item['current_label']} | "
        f"{item['source']} | {coverage} | {title} |"
    )

lines += ["", "---", "", "## Evidence cards", ""]

for pos, item in enumerate(entries, 1):
    desc = item["model_visible_description"]
    if len(desc) > 900:
        desc = desc[:900].rsplit(" ", 1)[0] + " …"
    reasons = ", ".join(item["none_reasons"]) or "none"
    reasoning = item["none_reasoning"] or "none"
    lines += [
        f"### {pos}. r{item['row']} — {item['title'] or '(no title)'}",
        "",
        f"- **Observed error:** `{item['error_type']}`; score `{item['p_include']:.4f}` "
        f"(margin `{item['margin_from_cutoff']:+.4f}`)",
        f"- **Current label:** {item['current_label']}",
        f"- **Label provenance:** {item['label_provenance']}",
        f"- **Same error/CV group rows:** "
        f"{', '.join('r' + str(r) for r in item['same_error_group_rows']) or 'none'}",
        f"- **Current None reason(s):** {reasons}",
        f"- **Current reasoning:** {reasoning}",
        f"- **Input coverage:** {item['description_characters']} cleaned description chars; "
        f"source categories {'present' if item['source_categories_present'] else 'absent'}",
        f"- **Source:** [{item['source']}]({item['url']})",
        "",
        "**Model-visible description:**",
        "",
        desc if desc else "_(no description — the model saw the title only)_",
        "",
        "**Observed live-source delta:**",
        "",
        item["live_source_finding"] or "_(not checked yet)_",
        "",
        "**TODO(ariel) primary mechanism:**",
        "",
        "**Evidence—including what the live source adds, if opened:**",
        "",
        "**Smallest fix, or `none`:**",
        "",
        "---",
        "",
    ]

DOC_OUT.write_text("\n".join(lines), encoding="utf-8")

print(f"wrote {EVAL_OUT.relative_to(ROOT)}")
print(f"wrote {DOC_OUT.relative_to(ROOT)}")
print(f"verified {len(keeper_idx)} demoted keepers + {len(junk_idx)} surviving junk = {len(entries)}")
