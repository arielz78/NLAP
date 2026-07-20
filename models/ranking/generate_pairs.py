"""Generate forced-choice pairs from a Candidates snapshot and emit the
HTML collector + a pairs manifest.

Usage:
  python -m models.ranking.generate_pairs <snapshot.json> [--out DIR]
      [--per-section 55] [--seed 7] [--holdout-frac 0.2] [--duplicates 10]
      [--today YYYY-MM-DD]

Outputs (in --out, default models/ranking/output/):
  pairs_manifest.json  full pair definitions + generation provenance
  collector.html       self-contained collector page for the editor
"""

import argparse
import json
import os
import random
import subprocess
from datetime import datetime
from itertools import combinations

from .config import make_config
from .pool import eligible_pool, load_snapshot, today_from_arg


def git_hash():
    try:
        return (
            subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=10,
            ).stdout.strip()
            or "unknown"
        )
    except Exception:
        return "unknown"


def _slim(rec):
    return {
        "id": rec["UniqueEventID"],
        "title": rec.get("Event Title", ""),
        "description": rec.get("DescriptionRaw", ""),
        "venue": rec.get("LocationName", ""),
        "city": rec.get("City", ""),
        "start_date": rec.get("Start Date", ""),
        "source": rec.get("Source", ""),
        "url": rec.get("URL", ""),
    }


def generate_base_pairs(pool_by_section, config, rng):
    """Unique unordered random pairs per section, ~holdout_frac held out."""
    pairs = []
    n_target = config["pairs_per_section"]
    for section in config["sections"]:
        recs = [r for r in pool_by_section[section] if r.get("UniqueEventID")]
        # De-dupe events by UniqueEventID within the section.
        by_id = {r["UniqueEventID"]: r for r in recs}
        recs = list(by_id.values())
        if len(recs) < 2:
            print(f"  WARNING: section {section!r} has {len(recs)} eligible events; skipping")
            continue
        max_pairs = len(recs) * (len(recs) - 1) // 2
        target = min(n_target, max_pairs)
        if target < n_target:
            print(f"  WARNING: {section!r} pool supports only {target} unique pairs "
                  f"(pool size {len(recs)}); capping")
        seen = set()
        section_pairs = []
        if max_pairs <= 4 * n_target:
            # Small pool: enumerate and sample, guaranteed no dupes.
            all_pairs = list(combinations(range(len(recs)), 2))
            picks = rng.sample(all_pairs, target)
        else:
            picks = []
            while len(picks) < target:
                i, j = rng.sample(range(len(recs)), 2)
                key = (min(i, j), max(i, j))
                if key in seen:
                    continue
                seen.add(key)
                picks.append((i, j))
        for i, j in picks:
            a, b = recs[i], recs[j]
            if rng.random() < 0.5:
                a, b = b, a  # randomize which side is A
            section_pairs.append({"section": section, "A": _slim(a), "B": _slim(b)})
        # Holdout flags, balanced per section.
        n_hold = round(len(section_pairs) * config["holdout_frac"])
        hold_idx = set(rng.sample(range(len(section_pairs)), n_hold))
        for k, p in enumerate(section_pairs):
            p["is_holdout"] = k in hold_idx
            p["duplicate_of"] = None
        pairs.extend(section_pairs)
    return pairs


def order_and_duplicate(base_pairs, config, rng):
    """Assign pair_ids, shuffle presentation, inject spaced duplicates.

    Duplicates re-show an existing pair later in the sequence with A/B
    swapped (so self-consistency measures the judgment, not visual memory).
    They carry duplicate_of and are excluded from agreement at grade time.
    """
    ordered = list(base_pairs)
    rng.shuffle(ordered)
    for k, p in enumerate(ordered):
        p["pair_id"] = f"p{k + 1:03d}"

    n_dup = min(config["n_duplicates"], len(ordered))
    gap = config["min_duplicate_gap"]
    # Originals drawn from positions that leave room for a spaced re-show;
    # fall back to any position if the sequence is shorter than the gap.
    candidates = [pos for pos in range(len(ordered)) if pos + gap < len(ordered)]
    if len(candidates) < n_dup:
        candidates = list(range(len(ordered)))
    rng.shuffle(candidates)
    dup_sources = [ordered[pos] for pos in candidates[:n_dup]]

    next_id = len(ordered) + 1
    for orig in dup_sources:
        dup = {
            "pair_id": f"p{next_id:03d}",
            "section": orig["section"],
            "A": dict(orig["B"]),  # swapped
            "B": dict(orig["A"]),
            "is_holdout": False,
            "duplicate_of": orig["pair_id"],
        }
        next_id += 1
        orig_pos = ordered.index(orig)
        lo = orig_pos + gap
        if lo >= len(ordered):
            ordered.append(dup)
        else:
            ordered.insert(rng.randrange(lo, len(ordered) + 1), dup)
    return ordered


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("snapshot", help="Candidates snapshot JSON")
    ap.add_argument("--out", default=os.path.join("models", "ranking", "output"))
    ap.add_argument("--per-section", type=int, default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--holdout-frac", type=float, default=None)
    ap.add_argument("--duplicates", type=int, default=None)
    ap.add_argument("--today", default=None, help="YYYY-MM-DD (default: today)")
    args = ap.parse_args(argv)

    config = make_config(
        pairs_per_section=args.per_section,
        seed=args.seed,
        holdout_frac=args.holdout_frac,
        n_duplicates=args.duplicates,
    )
    today = today_from_arg(args.today)
    rng = random.Random(config["seed"])

    records = load_snapshot(args.snapshot)
    pool = eligible_pool(records, config, today=today)
    print(f"Snapshot: {len(records)} records; eligible pool "
          + ", ".join(f"{s}={len(v)}" for s, v in pool.items()))

    base = generate_base_pairs(pool, config, rng)
    ordered = order_and_duplicate(base, config, rng)
    n_dup = sum(1 for p in ordered if p["duplicate_of"])
    n_hold = sum(1 for p in ordered if p["is_holdout"])
    print(f"Pairs: {len(ordered)} total ({len(base)} base, {n_dup} duplicates, "
          f"{n_hold} holdout)")

    manifest_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    manifest = {
        "manifest_id": manifest_id,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "git_commit": git_hash(),
        "snapshot_file": os.path.basename(args.snapshot),
        "today": today.isoformat(),
        "config": {
            k: config[k]
            for k in ("sections", "cities", "venue_blocklist", "pairs_per_section",
                      "holdout_frac", "n_duplicates", "min_duplicate_gap", "seed")
        },
        "pairs": ordered,  # presentation order
    }

    os.makedirs(args.out, exist_ok=True)
    manifest_path = os.path.join(args.out, "pairs_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    from .collector_html import render_collector
    html_path = os.path.join(args.out, "collector.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(render_collector(ordered, manifest_id))

    print(f"Wrote {manifest_path}")
    print(f"Wrote {html_path}  <- send this file to the editor")


if __name__ == "__main__":
    main()
