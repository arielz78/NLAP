"""TEST HELPER — synthesize an answered pairs CSV from a manifest, exactly as
the HTML collector would export it. Lets the grader be exercised end-to-end
before the editor has answered anything. Never use its output as real data.

Simulated editor: prefers the earlier event 80% of the time (so
baseline_date_sort should land visibly above 50%), answers duplicates
consistently with the original 90% of the time.

Usage:
  python -m r6_eval.simulate_answers <pairs_manifest.json> [--out CSV] [--seed 7]
"""

import argparse
import csv
import json
import os
import random

WHYS = ["", "", "", "", "", "cuter", "closer", "unique", "boring", "seasonal"]


def simulate(manifest, seed):
    rng = random.Random(seed)
    winner_ids = {}  # pair_id -> winning event id
    rows = []
    for p in manifest["pairs"]:
        a, b = p["A"], p["B"]
        if p["duplicate_of"] and p["duplicate_of"] in winner_ids:
            orig_winner = winner_ids[p["duplicate_of"]]
            consistent = rng.random() < 0.9
            pick_id = orig_winner if consistent else (
                a["id"] if orig_winner != a["id"] else b["id"])
            winner = "A" if pick_id == a["id"] else "B"
        else:
            da, db = a.get("start_date") or "9999", b.get("start_date") or "9999"
            earlier = "A" if da <= db else "B"
            winner = earlier if rng.random() < 0.8 else ("B" if earlier == "A" else "A")
        winner_ids[p["pair_id"]] = a["id"] if winner == "A" else b["id"]
        rows.append({
            "pair_id": p["pair_id"],
            "section": p["section"],
            "event_A_id": a["id"],
            "event_B_id": b["id"],
            "winner": winner,
            "why": rng.choice(WHYS),
            "is_holdout": "true" if p["is_holdout"] else "false",
            "duplicate_of": p["duplicate_of"] or "",
        })
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("manifest")
    ap.add_argument("--out", default=os.path.join("r6_eval", "output",
                                                  "answers_simulated.csv"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args(argv)

    with open(args.manifest, encoding="utf-8") as f:
        manifest = json.load(f)
    rows = simulate(manifest, args.seed)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["pair_id", "section", "event_A_id",
                                          "event_B_id", "winner", "why",
                                          "is_holdout", "duplicate_of"])
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {args.out} ({len(rows)} simulated answers)")


if __name__ == "__main__":
    main()
