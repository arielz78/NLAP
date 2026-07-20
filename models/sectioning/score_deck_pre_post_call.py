# Seam test + pre/post-call results-append (R7_Scope.md §3, 2026-07-20 entry).
# Written by Claude under an explicit authorship-split override (B) — see
# Execution_Log 2026-07-20. Joins the R7 Label Deck (Airtable) to the deck's
# gate/train answer key by Row, splits pre-call (batches 1-2, rows 1-200) vs
# post-call (batch 3, rows 201-400), and scores each SEPARATELY per the
# pre-registered seam-test rule (never pool until the seam test says to).
#
# Rerun after any deck edit: re-pull `r7_label_deck_raw_pull_<date>.json` via
# the Airtable MCP tool (list_records_for_table, R7 Label Deck, fields Row/
# Batch/Section/Link) and update DECK_JSON below.

import json
import csv
from pathlib import Path
from collections import defaultdict, Counter
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent.parent
DECK_JSON = ROOT / "models/sectioning/deck/r7_label_deck_raw_pull_2026-07-20.json"
ANSWER_CSV = ROOT / "models/sectioning/deck/answer_key_2026-07-18.csv"

FIELD_ROW = "fldwjfVY5pN1qajFj"
FIELD_BATCH = "fldDymraKt7oQxdBv"
FIELD_SECTION = "fld8YycTYbx63EC22"
FIELD_LINK = "fldndzHXPEBm43EJv"

# Airtable Section choices are short names; answer_key model_pred uses the
# full Beehiiv section names -- normalize so they compare equal. (Bug found
# 07-20: without this every accuracy/confusion number silently comes back 0,
# no error — the two label sets just never matched.)
SECTION_MAP = {"Families": "For Families", "Couples": "For Couples",
               "Golden": "For Golden Age Readers", "None": "None"}

deck = json.loads(DECK_JSON.read_text(encoding="utf-8"))["records"]
deck_by_row = {}
for r in deck:
    cv = r["cellValuesByFieldId"]
    row = cv.get(FIELD_ROW)
    if row is None or row > 400:
        continue  # skip walkthrough batch (401-426), not part of gate/train scoring
    batch = cv.get(FIELD_BATCH, {}).get("name")
    section_short = cv.get(FIELD_SECTION, {}).get("name")
    section = SECTION_MAP.get(section_short, section_short)
    link = cv.get(FIELD_LINK)
    deck_by_row[row] = {"batch": batch, "section": section, "link": link}

answer = {}
# utf-8-sig: the CSV has a BOM, plain utf-8 makes the first header key
# '﻿Row' instead of 'Row' and every lookup KeyErrors.
with open(ANSWER_CSV, encoding="utf-8-sig") as f:
    for rec in csv.DictReader(f):
        row = int(rec["Row"])
        answer[row] = {
            "slice": rec["slice"],
            "model_pred": rec["model_pred"],
            "margin": float(rec["margin"]),
            "vocab_hits": int(rec["vocab_hits"]),
            "dupe": rec["dupe"],
        }

joined = []
for row, d in deck_by_row.items():
    a = answer.get(row)
    if a is None:
        continue
    joined.append({"row": row, "batch": d["batch"], "section": d["section"], "link": d["link"], **a})

PRE_CALL = [j for j in joined if j["row"] <= 200]
POST_CALL = [j for j in joined if j["row"] > 200]


def gate_slice(rows):
    return [r for r in rows if r["slice"] == "gate"]


def includable(rows):
    # "events the editor would include" -- drop None per the 07-19 gate redefinition
    return [r for r in rows if r["section"] not in (None, "None")]


def margin_band_accuracy(rows, threshold):
    subset = [r for r in rows if r["margin"] > threshold]
    if not subset:
        return None, 0
    correct = sum(1 for r in subset if r["model_pred"] == r["section"])
    return correct / len(subset), len(subset)


def confusion_matrix(rows):
    classes = ["For Families", "For Couples", "For Golden Age Readers"]
    cm = {c: Counter() for c in classes}
    for r in rows:
        if r["section"] in classes:
            cm[r["section"]][r["model_pred"]] += 1
    return cm, classes


def none_rate_by_vocab(rows, bucket_edges=(0, 5, 15, 10_000)):
    labels = [(bucket_edges[i], bucket_edges[i + 1]) for i in range(len(bucket_edges) - 1)]
    buckets = {lab: [] for lab in labels}
    for r in rows:
        for lo, hi in labels:
            if lo <= r["vocab_hits"] < hi:
                buckets[(lo, hi)].append(r)
                break
    out = {}
    for lab, rs in buckets.items():
        if not rs:
            continue
        n_none = sum(1 for r in rs if r["section"] in (None, "None"))
        out[lab] = (n_none / len(rs), len(rs))
    return out


def source_from_link(link):
    if not link:
        return "(blank)"
    try:
        return urlparse(link).netloc.replace("www.", "") or "(unparseable)"
    except Exception:
        return "(unparseable)"


def none_rate_by_source(rows):
    by_src = defaultdict(list)
    for r in rows:
        by_src[source_from_link(r["link"])].append(r)
    out = {}
    for src, rs in by_src.items():
        n_none = sum(1 for r in rs if r["section"] in (None, "None"))
        out[src] = (n_none / len(rs), len(rs))
    return out


if __name__ == "__main__":
    gs_pre, gs_post = gate_slice(PRE_CALL), gate_slice(POST_CALL)
    pre_none = sum(1 for r in gs_pre if r["section"] in (None, "None")) / len(gs_pre)
    post_none = sum(1 for r in gs_post if r["section"] in (None, "None")) / len(gs_post)
    print(f"SEAM TEST: pre-call gate-slice None-rate = {pre_none*100:.1f}% (n={len(gs_pre)}), "
          f"post-call = {post_none*100:.1f}% (n={len(gs_post)})")

    for label, rows in (("PRE-CALL (batches 1+2, n<=200)", PRE_CALL), ("POST-CALL (batch 3, n=201-400)", POST_CALL)):
        print(f"\n{'='*70}\n{label}\n{'='*70}")
        gs = gate_slice(rows)
        inc = includable(gs)
        print(f"gate-slice n={len(gs)}, includable (non-None) n={len(inc)}")
        for thr in (0.5, 0.7):
            acc, n = margin_band_accuracy(inc, thr)
            print(f"  margin > {thr}: accuracy = {'n/a' if acc is None else f'{acc*100:.1f}%'} (n={n})")
        cm, classes = confusion_matrix(inc)
        print("  confusion matrix (rows=true, cols=predicted):")
        for c in classes:
            print(f"    {c[4:14]:<10}: " + " | ".join(f"{cm[c][pc]:>3}" for pc in classes))
        print("  None-rate by vocab_hits bucket (gate-slice):")
        for band, (rate, n) in sorted(none_rate_by_vocab(gs).items()):
            print(f"    hits [{band[0]},{band[1]}): {rate*100:.1f}% None (n={n})")
        print("  None-rate by source (gate-slice):")
        for src, (rate, n) in sorted(none_rate_by_source(gs).items(), key=lambda kv: -kv[1][1]):
            print(f"    {src:<30}: {rate*100:.1f}% None (n={n})")
