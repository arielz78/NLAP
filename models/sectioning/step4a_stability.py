"""
step4a_stability.py — is the Step 4b sitting list a fact about the LABELS or about the
regularisation constant?

WHY THIS RUNS BEFORE 4b, NOT AFTER. Step 4b spends the only irreversible resource in the
sequence: editor time. Its input is "the 30 positives the model disagrees with most",
which is produced by one arbitrary configuration (C=1.0, GroupKFold(5), no shuffle). If
that set churns when C moves an order of magnitude or the folds are reshuffled, then the
selection is an artifact of the instrument and the sitting would be spent on model noise.
This is the 07-27 convention applied to the sitting list itself: is this a fact about the
world, or a fact about my instrument?

THE RULE, set before the result was seen (2026-07-31, Ariel):
  * Applied AFTER CV-group deduplication -- membership is compared in unique EVENTS
    (cv groups), never in rows, so a duplicate title cannot pad the overlap.
  * The base top-30 must share >= 23 unique events with EACH comparison configuration.
    For two 30-item sets J = k/(60-k), so 23 shared IS Jaccard 0.60. 18 shared -- the
    intuitive reading of "60% overlap" -- is only 0.43.
  * If ANY comparison fails, 4b's list is NOT the base set. It is rebuilt from selection
    frequency across all configurations, tie-broken by average disagreement rank.

Instability does not veto 4b. It means the lowest-score selector is arbitrary, and the
consensus set is the better selector -- the rows are not exonerated by churn.

Run:
    py -3 step4a_stability.py
"""
import sys
import io
import json
import collections
import contextlib
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, StratifiedGroupKFold, cross_val_predict
from sklearn.metrics import roc_auc_score

sys.stdout.reconfigure(encoding="utf-8")

# Import the real pipeline rather than re-implementing the load. Two loaders drift; one
# does not. gate_step4a runs top-to-bottom on import (that is the point -- identical
# plumbing, identical routing contract, identical mask), so its output is captured.
class _Quiet(io.StringIO):
    def reconfigure(self, **_):   # gate_step4a calls sys.stdout.reconfigure() at import
        pass


with contextlib.redirect_stdout(_Quiet()):
    import gate_step4a as g

X, y, groups = g.X, g.y, g.groups
rows_fit, section, slice_ = g.rows_fit, g.section, g.slice_
N = g.N_DISAGREEMENTS
BAR = 23          # unique events shared with the base set; == Jaccard 0.60 at n=30

print(f"loaded fit set: {X.shape[0]} rows, {int(y.sum())} pos / {int((1 - y).sum())} neg")
print(f"rule: base top-{N} must share >= {BAR} unique events with EVERY comparison config\n")

# ---------------------------------------------------------------------------------------
# The configurations. BASE is exactly what produced the committed export.
# GroupKFold has no random_state -- it is deterministic -- so varying folds needs
# StratifiedGroupKFold(shuffle=True), which is why the seeds live on that splitter.
# ---------------------------------------------------------------------------------------
CONFIGS = [
    ("BASE  C=1.0  GroupKFold(5)", 1.0, GroupKFold(n_splits=5)),
    ("C=0.1  GroupKFold(5)", 0.1, GroupKFold(n_splits=5)),
    ("C=0.3  GroupKFold(5)", 0.3, GroupKFold(n_splits=5)),
    ("C=3.0  GroupKFold(5)", 3.0, GroupKFold(n_splits=5)),
    ("C=10.0 GroupKFold(5)", 10.0, GroupKFold(n_splits=5)),
    ("C=1.0  SGKF(5) seed=0", 1.0, StratifiedGroupKFold(5, shuffle=True, random_state=0)),
    ("C=1.0  SGKF(5) seed=1", 1.0, StratifiedGroupKFold(5, shuffle=True, random_state=1)),
    ("C=1.0  SGKF(5) seed=2", 1.0, StratifiedGroupKFold(5, shuffle=True, random_state=2)),
]

gate_m, train_m = slice_ == "gate", slice_ == "train"
results = []

for name, C, cv in CONFIGS:
    p = cross_val_predict(LogisticRegression(max_iter=2000, C=C), X, y,
                          cv=cv, groups=groups, method="predict_proba")[:, 1]
    picked = g.top_disagreements(p, N)                 # same dedup-by-group selector
    members = [e["group"] for e in picked]
    rank_of = {e["group"]: r for r, e in enumerate(picked)}
    results.append({
        "name": name, "C": C, "p": p, "members": set(members), "rank": rank_of,
        "auc_gate": roc_auc_score(y[gate_m], p[gate_m]),
        "auc_train": roc_auc_score(y[train_m], p[train_m]),
    })

base = results[0]

print("AUC by configuration (context only -- not the thing being tested):")
print("  config                          gate   train")
for r in results:
    print(f"  {r['name']:30}  {r['auc_gate']:.3f}  {r['auc_train']:.3f}")

print(f"\nOverlap with BASE (unique events, out of {N}):")
print(f"  config                          shared  jaccard  vs bar {BAR}")
failures = []
for r in results[1:]:
    k = len(base["members"] & r["members"])
    j = k / len(base["members"] | r["members"])
    ok = k >= BAR
    if not ok:
        failures.append(r["name"])
    print(f"  {r['name']:30}  {k:5}   {j:.3f}    {'PASS' if ok else 'FAIL'}")

# Full pairwise matrix -- churn between two comparison configs is as informative as churn
# against the base, and a base that happens to sit in a stable neighbourhood can hide it.
print("\nPairwise shared-event matrix:")
print("       " + "".join(f"{i:5}" for i in range(len(results))))
for i, a in enumerate(results):
    print(f"  [{i}] " + "".join(f"{len(a['members'] & b['members']):5}" for b in results))

# How often each event is selected, and its average rank when it is.
freq = collections.Counter()
rank_sum = collections.defaultdict(list)
for r in results:
    for gid in r["members"]:
        freq[gid] += 1
        rank_sum[gid].append(r["rank"][gid])

# The representative for a group must be the LOWEST-SCORING POSITIVE, matching what
# top_disagreements() picks -- not simply the first row that happens to carry the group id.
# Dormant bug when found (the fallback had not fired), fixed anyway: it would have put a
# different, higher-scoring row in front of the editor than the one the model flagged.
group_row = {}
for gid in freq:
    members = [i for i in range(len(y)) if int(groups[i]) == gid and y[i] == 1]
    group_row[gid] = min(members, key=lambda i: base["p"][i])

print(f"\nSelection frequency across {len(results)} configurations:")
for n_hits in range(len(results), 0, -1):
    gids = [gid for gid, c in freq.items() if c == n_hits]
    if gids:
        print(f"  selected {n_hits}/{len(results)} configs: {len(gids):3} events")

# The consensus set: frequency desc, then average rank asc. Built regardless, so the
# fallback is on disk whether or not the bar was cleared.
consensus = sorted(freq, key=lambda gid: (-freq[gid], np.mean(rank_sum[gid])))[:N]
consensus_rows = [{
    "row": rows_fit[group_row[gid]]["row"],
    "cv_group": gid,
    "n_configs": freq[gid],
    "mean_rank": round(float(np.mean(rank_sum[gid])), 2),
    "p_include_base": round(float(base["p"][group_row[gid]]), 4),
    "section": str(section[group_row[gid]]),
    "slice": str(slice_[group_row[gid]]),
    "title": g.raw_by_url.get(rows_fit[group_row[gid]]["url"], {}).get("title", ""),
    "url": rows_fit[group_row[gid]]["url"],
} for gid in consensus]

verdict = "base" if not failures else "consensus"
print(f"\n{'=' * 78}")
if failures:
    print(f"VERDICT: {len(failures)} configuration(s) below the {BAR}-event bar -> "
          "4b's list is the CONSENSUS set.")
    for f in failures:
        print(f"  failed: {f}")
else:
    print(f"VERDICT: every configuration shares >= {BAR} events with BASE -> "
          "4b's list is the BASE set.")
print(f"consensus and base differ by "
      f"{N - len(base['members'] & set(consensus))} of {N} events.")
print("=" * 78)

OUT = g.HERE / "eval" / "step4a_stability.json"
OUT.write_text(json.dumps(g.stamped({
    "bar": BAR,
    "n": N,
    "rule": "base top-N must share >= BAR unique cv-groups with EVERY comparison config; "
            "otherwise 4b is built from selection frequency, tie-broken by mean rank",
    "verdict": verdict,
    "failures": failures,
    "configs": [{"name": r["name"], "auc_gate": round(r["auc_gate"], 4),
                 "auc_train": round(r["auc_train"], 4),
                 "shared_with_base": len(base["members"] & r["members"])}
                for r in results],
    "consensus_rows": consensus_rows,
}), indent=2), encoding="utf-8")
print(f"\nwrote {OUT.relative_to(g.HERE)}")
