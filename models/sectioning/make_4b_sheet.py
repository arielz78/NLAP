"""
make_4b_sheet.py — build the BLIND editor sheet for R7_Scope Step 4b.

WHAT STEP 4b IS. The 211 gate positives have never been audited: when the editor
sectioned them he was answering "which section?", not "would you publish this?". Step 4a
exports the 30 he called includable that the model scores lowest. 4b asks him, blind,
whether each one carries a PERMANENT reason it would never run.

WHY THE SHEET EXISTS AT ALL — do not run this sitting inside Airtable. Airtable displays
the prior label, the slice and the row's history, and the 2026-07-30 sitting established
that a visible prior label is an anchor: the editor confirms it rather than re-deciding.
This sheet is the same two-phase protocol that produced the `outcompeted` finding.

WHAT IS DELIBERATELY WITHHELD, and why each one leaks if shown:
  * P(include)   — the model's opinion. Showing it converts the sitting into agreement
                   scoring, which measures nothing.
  * section      — a PRIOR LABEL. It is the thing under audit; showing it anchors.
  * slice        — gate/train tells him how much a row "counts", which is a reason to
                   think harder about some rows than others. Uniform effort or nothing.
  * row id / URL — the deck is sorted by row id and he has seen these rows before.
  * ORDER        — the export is ranked by disagreement, so position alone leaks the
                   score. Shuffled under a fixed seed so the run is reproducible.

THE QUESTION IS A RULE QUESTION, NOT A PREFERENCE QUESTION. "Is there a permanent reason
you would never run this?" — not "would you run this?". §83: the preference framing is
the `outcompeted` variable wearing a different hat, and it sits under a 15-25% noise floor
set by the editor's own 75-82.5% self-agreement. The rule framing is the only version
whose signal clears the null.

Run:
    py -3 make_4b_sheet.py
"""
import io
import json
import random
import contextlib
from pathlib import Path

import sys

sys.stdout.reconfigure(encoding="utf-8")


class _Quiet(io.StringIO):
    def reconfigure(self, **_):
        pass


with contextlib.redirect_stdout(_Quiet()):
    import gate_step4a as g

from text_recipe import clean

SEED = 4731          # fixed so the sheet is reproducible; change only with a reason
HERE = Path(__file__).resolve().parent

payload = json.loads((HERE / "eval" / "step4a_disagreements.json").read_text(encoding="utf-8"))
rows = list(payload["rows"])

# Answer key FIRST, in export order, so the blind sheet below can be shuffled freely.
# This file is what you reconcile against AFTER the sitting -- do not open it during.
key = [{"position": None, "row": r["row"], "cv_group": r["cv_group"],
        "duplicate_rows": r["duplicate_rows"], "p_include": r["p_include"],
        "section": r["section"], "slice": r["slice"], "title": r["title"],
        "url": r["url"]} for r in rows]

random.Random(SEED).shuffle(rows)
for i, r in enumerate(rows, 1):
    for k in key:
        if k["row"] == r["row"]:
            k["position"] = i

lines = [
    "# R7 Step 4b — Positive-Class Audit (BLIND SHEET)",
    "",
    "**Do not open Airtable during this sitting.** It shows the previous label, which anchors.",
    "",
    "## The question, asked the same way every time",
    "",
    "> **Assume this event is local and within the issue window.** Based only on its",
    "> **content, would you ever publish it in the newsletter on a quiet week?**",
    "",
    "⚠️ **Geography is not your call here.** Stage 0 removes non-GTA events before the",
    "gate ever sees them, so if you reject something for being far away you would be",
    "creating a rejection for a condition the model will never be asked to evaluate.",
    "Assume it is local, even when the listing says otherwise.",
    "",
    "\"Permanent\" means a property of the *event itself* — who it is for, what it is —",
    "that would be just as true on the quietest week of the year.",
    "",
    "It is **not** \"would you run it this week?\" and **not** \"is it better than the other",
    "options?\" Those are ranking questions and they belong to R6.",
    "",
    "## How to answer",
    "",
    "One of three, per row. Say the reason out loud even when it feels obvious.",
    "",
    "| Answer | Means |",
    "|---|---|",
    "| **KEEP** | No permanent reason. It could run on a quiet week. |",
    "| **NEVER** | A permanent content reason exists — name which: B2B / professional dev · civic · wrong fit (not our audience) |",
    "| **UNCLEAR** | You cannot tell from the text. Do not guess; do not open the link yet. |",
    "",
    "**Text first.** Decide from the title and description alone. If you want the link,",
    "say so and record your text-only answer **first** — the facilitator then reads out",
    "that row's link from the separate lookup, and you record whether it changed anything.",
    "",
    "⚠️ **Language alone never decides eligibility** (Decision_Log §81). Breadth turns on",
    "cross-community appeal — Lunar New Year is an explicit accepted case.",
    "",
    f"**{len(rows)} rows.** Order is randomised; it carries no information.",
    "",
    "---",
    "",
]

for i, r in enumerate(rows, 1):
    desc = clean(g.raw_by_url.get(r["url"], {}).get("desc") or "").strip()
    if len(desc) > 900:
        desc = desc[:900].rsplit(" ", 1)[0] + " …"
    lines += [
        f"## {i}. {r['title'] or '(no title)'}",
        "",
        f"{desc if desc else '_(no description in the pool — title only)_'}",
        "",
        "**KEEP / NEVER / UNCLEAR:**",
        "",
        "**Reason (required — his words, not a paraphrase):**",
        "",
        "**Wanted the link? (y/n) — text-only answer first, then what the link changed:**",
        "",
        "---",
        "",
    ]

SHEET = HERE.parent.parent / "docs" / "r7" / "R7_4b_PositiveClass_Blind_Sheet.md"
SHEET.write_text("\n".join(lines), encoding="utf-8")

# The link lookup. position -> URL and NOTHING ELSE. The facilitator opens this during the
# sitting; the answer key must stay shut, because it carries P(include), section, slice and
# the original label. Two files because one file that reveals everything is not a lookup,
# it is an unblinding — and the sheet previously told the editor he could ask for a link
# that existed nowhere he could safely reach.
LOOKUP = HERE.parent.parent / "docs" / "r7" / "R7_4b_Link_Lookup.md"
LOOKUP.write_text("\n".join([
    "# R7 Step 4b — Link Lookup (facilitator only)",
    "",
    "Position → URL. Nothing else is in this file, deliberately.",
    "",
    "**Protocol:** the editor answers from text first and that answer is written down.",
    "Only then read out the link for that position. Record separately whether it changed",
    "his answer — a text-only answer that flips on the link is a *feature* finding (the",
    "model cannot see what he needed), not a label finding.",
    "",
    "⚠️ Do not open `models/sectioning/eval/step4b_answer_key.json` during the sitting.",
    "It carries the model's score, the section, the slice and the original label.",
    "",
    "| # | URL |",
    "|---|---|",
    *[f"| {i} | {r['url']} |" for i, r in enumerate(rows, 1)],
    "",
]), encoding="utf-8")

KEY = HERE / "eval" / "step4b_answer_key.json"
KEY.write_text(json.dumps(g.stamped({
    "seed": SEED,
    "source": "step4a_disagreements.json",
    "warning": "DO NOT OPEN DURING THE SITTING. Reconcile after.",
    "note": "duplicate_rows share a CV group with their representative -- one ruling "
            "applies to every row listed there.",
    "key": sorted(key, key=lambda k: k["position"]),
}), indent=2), encoding="utf-8")

n_nodesc = sum(1 for r in rows
               if not clean(g.raw_by_url.get(r["url"], {}).get("desc") or "").strip())
print(f"wrote {SHEET.relative_to(HERE.parent.parent)}  ({len(rows)} rows, seed {SEED})")
print(f"  {n_nodesc} row(s) are title-only — flag these in the sitting, they are the")
print("  hardest to judge blind and the most likely UNCLEAR.")
print(f"wrote {LOOKUP.relative_to(HERE.parent.parent)}  (facilitator: position -> URL only)")
print(f"wrote {KEY.relative_to(HERE)}  (do not open during the sitting)")

_variant_rows = [r for r in rows if r.get("variant_rows")]
if _variant_rows:
    print(f"\n⚠️  {len(_variant_rows)} row(s) have same-title VARIANTS with different text.")
    print("   Their ruling does NOT transfer to the variant. Present separately:")
    for r in _variant_rows:
        print(f"     {r['title'][:60]}  variants: "
              f"{[v['row'] for v in r['variant_rows']]}")
