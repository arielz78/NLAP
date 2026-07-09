"""Grade a candidate scorer against the editor's answered pairs CSV.

Usage:
  python -m r6_eval.grade <pairs.csv> <snapshot.json> --scorer baseline_date_sort
      [--today YYYY-MM-DD] [--seed 7] [--bootstrap 2000] [--json results.json]

Reports, per section and overall:
  - agreement % on HOLDOUT pairs only (the headline), with bootstrap 95% CI
  - training-set agreement as a secondary reference line
  - editor self-consistency % on duplicate pairs (excluded from agreement)
  - a provenance line (git commit, snapshot file, pairs file, scorer)

Held-out discipline: pairwise_lr is fit ONLY on non-holdout, non-duplicate
pairs; the headline is computed ONLY on holdout pairs. Ties (equal scores)
count as 0.5 agreement — the expectation of a random tiebreak.
"""

import argparse
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd

from .config import make_config
from .generate_pairs import git_hash
from .pool import build_lookup, eligible_pool, load_snapshot, today_from_arg
from .scorers import SCORERS, make_scorer


def load_pairs_csv(path):
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    required = ["pair_id", "section", "event_A_id", "event_B_id", "winner",
                "why", "is_holdout", "duplicate_of"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise SystemExit(f"pairs CSV missing columns: {missing}")
    df["is_holdout"] = df["is_holdout"].str.strip().str.lower().isin(["true", "1"])
    df["duplicate_of"] = df["duplicate_of"].str.strip()
    df["winner"] = df["winner"].str.strip().str.upper()
    bad = df[~df["winner"].isin(["A", "B"])]
    if len(bad):
        print(f"  WARNING: dropping {len(bad)} rows with winner not in A/B", file=sys.stderr)
        df = df[df["winner"].isin(["A", "B"])]
    return df.reset_index(drop=True)


def resolve_rows(df, lookup):
    """Attach candidate dicts; drop pairs whose events left the snapshot."""
    rows, dropped = [], 0
    for _, r in df.iterrows():
        a, b = lookup.get(r["event_A_id"]), lookup.get(r["event_B_id"])
        if a is None or b is None:
            dropped += 1
            continue
        rows.append({
            "pair_id": r["pair_id"], "section": r["section"],
            "a": a, "b": b, "winner": r["winner"],
            "winner_id": r["event_A_id"] if r["winner"] == "A" else r["event_B_id"],
            "is_holdout": bool(r["is_holdout"]),
            "duplicate_of": r["duplicate_of"] or None,
        })
    if dropped:
        print(f"  WARNING: dropped {dropped} pairs with events missing from snapshot",
              file=sys.stderr)
    return rows


def pair_agreement(scorer, row):
    """1.0 agree / 0.0 disagree / 0.5 tie, honoring compare() when present."""
    if hasattr(scorer, "compare"):
        pred = scorer.compare(row["a"], row["b"], row["section"])
        return 1.0 if pred == row["winner"] else 0.0
    sa, sb = scorer.score(row["a"]), scorer.score(row["b"])
    if sa == sb:
        return 0.5
    model_pick = "A" if sa > sb else "B"
    return 1.0 if model_pick == row["winner"] else 0.0


def bootstrap_ci(values, iters, rng):
    values = np.asarray(values, dtype=float)
    if len(values) == 0:
        return None
    if len(values) == 1:
        return (values[0], values[0])
    idx = rng.integers(0, len(values), size=(iters, len(values)))
    means = values[idx].mean(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def self_consistency(rows):
    """% of duplicate pairs answered the same as their original (matched by
    winner event id — duplicates are shown A/B-swapped)."""
    originals = {r["pair_id"]: r["winner_id"] for r in rows if not r["duplicate_of"]}
    checked, agree = 0, 0
    for r in rows:
        if not r["duplicate_of"]:
            continue
        orig_winner = originals.get(r["duplicate_of"])
        if orig_winner is None:
            continue  # original unanswered/dropped
        checked += 1
        agree += int(r["winner_id"] == orig_winner)
    return (agree / checked if checked else None), checked


def fmt_pct(x):
    return "n/a" if x is None else f"{100 * x:5.1f}%"


def fmt_ci(ci):
    return "" if ci is None else f"  [95% CI {100 * ci[0]:.1f}%..{100 * ci[1]:.1f}%]"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pairs_csv")
    ap.add_argument("snapshot", help="Candidates snapshot JSON")
    ap.add_argument("--scorer", required=True, choices=sorted(SCORERS))
    ap.add_argument("--today", default=None, help="YYYY-MM-DD (default: today)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--bootstrap", type=int, default=None)
    ap.add_argument("--json", dest="json_out", default=None,
                    help="also write results to this JSON path")
    args = ap.parse_args(argv)

    config = make_config(seed=args.seed, bootstrap_iters=args.bootstrap)
    today = today_from_arg(args.today)
    rng = np.random.default_rng(args.seed)

    records = load_snapshot(args.snapshot)
    lookup = build_lookup(records)
    # Stats pool skips the date filter so features don't drift as events expire.
    stats_pool = eligible_pool(records, config, today=None)

    df = load_pairs_csv(args.pairs_csv)
    rows = resolve_rows(df, lookup)
    dup_rows = [r for r in rows if r["duplicate_of"]]
    base_rows = [r for r in rows if not r["duplicate_of"]]
    train_rows = [r for r in base_rows if not r["is_holdout"]]
    hold_rows = [r for r in base_rows if r["is_holdout"]]

    scorer = make_scorer(args.scorer, config, today, stats_pool)
    if hasattr(scorer, "fit"):
        scorer.fit(train_rows, lookup)

    hold_vals = {r["pair_id"]: pair_agreement(scorer, r) for r in hold_rows}
    train_vals = [pair_agreement(scorer, r) for r in train_rows]
    iters = config["bootstrap_iters"]

    provenance = (
        f"provenance: git={git_hash()} snapshot={os.path.basename(args.snapshot)} "
        f"pairs={os.path.basename(args.pairs_csv)} scorer={args.scorer} "
        f"today={today.isoformat()} seed={args.seed} "
        f"ts={datetime.now().isoformat(timespec='seconds')}"
    )

    print()
    print(f"=== {args.scorer} ===")
    print(f"pairs: {len(rows)} answered  ({len(train_rows)} train, "
          f"{len(hold_rows)} holdout, {len(dup_rows)} duplicates)")
    if getattr(getattr(scorer, "client", None), "is_stub", False):
        print("NOTE: llm_comparator ran on the SEEDED STUB (no API key set) — "
              "numbers below are machinery checks, not model quality.")
    print()
    print("HOLDOUT agreement (headline):")
    results = {"scorer": args.scorer, "sections": {}, "provenance": provenance}
    for section in config["sections"]:
        vals = [v for r, v in ((r, hold_vals[r["pair_id"]]) for r in hold_rows)
                if r["section"] == section]
        mean = float(np.mean(vals)) if vals else None
        ci = bootstrap_ci(vals, iters, rng) if vals else None
        print(f"  {section:<26} {fmt_pct(mean)}  (n={len(vals)}){fmt_ci(ci)}")
        results["sections"][section] = {"agreement": mean, "n": len(vals), "ci95": ci}
    all_vals = list(hold_vals.values())
    overall = float(np.mean(all_vals)) if all_vals else None
    overall_ci = bootstrap_ci(all_vals, iters, rng) if all_vals else None
    print(f"  {'OVERALL':<26} {fmt_pct(overall)}  (n={len(all_vals)}){fmt_ci(overall_ci)}")
    results["overall"] = {"agreement": overall, "n": len(all_vals), "ci95": overall_ci}

    train_mean = float(np.mean(train_vals)) if train_vals else None
    print(f"\ntraining-set agreement (reference only): {fmt_pct(train_mean)} "
          f"(n={len(train_vals)})")
    results["train_agreement"] = {"agreement": train_mean, "n": len(train_vals)}

    sc, n_dup_checked = self_consistency(rows)
    print(f"editor self-consistency on duplicates:   {fmt_pct(sc)} (n={n_dup_checked})")
    results["self_consistency"] = {"rate": sc, "n": n_dup_checked}

    print(f"\n{provenance}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"wrote {args.json_out}")


if __name__ == "__main__":
    main()
