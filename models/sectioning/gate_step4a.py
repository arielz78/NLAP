"""
gate_step4a.py — R7-W6 Step 4a: price the keeper-recall / junk-rejection curve.

WHAT THIS IS FOR (R7_Scope.md Step 4a): this step SETS the release bar, it does not
confirm one. The Step-4 operating point, Fork B and Fork C all wait on the number that
comes out of the eval below. No new spend: labels and embeddings are already cached.

AUTHORSHIP SPLIT (CLAUDE.md R7-W6). Everything ABOVE the ===== EVAL ===== banner is
PLUMBING (Claude): load the cached deck matrices, re-join the current editor labels,
build the binary include/None target, build leak-free CV groups, attach the auxiliary
columns, and report what the data actually is. Everything BELOW the banner is the
AUTHORED CORE (Ariel): the fit, the threshold sweep, the per-section read, the
0.95-vs-0.98 pricing, and the operating-point call. The plumbing decides none of that.

DESIGN CONSTRAINTS baked into the plumbing (settled elsewhere, not re-litigated here):
  §71  representation = voyage-4-large @ 2048d; the SAME cached vectors the section
       classifier uses, so the gate costs zero marginal embedding spend.
  §70  score-time recipe == serve-time recipe: text = title + clean(DescriptionRaw),
       SourceCategories excluded by default (the "cats" arm is the ablation).
  §74  the gate is a BINARY include/None model. It is the missing stage: the section
       classifier was trained on 1,126 published winners and has never seen a negative.
  Step 0 (superseded dedup ruling, 2026-07-26): do NOT delete duplicate rows — use
       GROUPED CV folds so no group straddles train and test. Repeat publication is
       signal; deleting it would strip the weakest class (Golden).

  ############################################################################
  # READ THIS BEFORE QUOTING ANY NUMBER THIS SCRIPT PRODUCES.                #
  #                                                                          #
  # The None split is COMPLETE: 239 of 239 (closed 2026-07-30). The merged-  #
  # None target is GONE -- the target is now the §77 routing contract below, #
  # so `outcompeted` is WITHHELD from the fit and `non-GTA` goes to Stage 0  #
  # rather than being scored as a gate negative.                             #
  #                                                                          #
  # This is Step 4a: DIAGNOSTIC ONLY. It does not set the release bar.       #
  # Two reasons, and the second is the bigger one:                           #
  #   * The 211 gate positives have NEVER been audited. The editor's task    #
  #     when he sectioned them was "which section?", not "would you publish  #
  #     this?" -- three rows say in his own words that a row is correctly    #
  #     sectioned but would never run. Contamination of unknown size.        #
  #   * The withheld `outcompeted` pile is impure (§83) and 38 model-        #
  #     relevant rows are still awaiting blind relabel (Step 1c). Eligible   #
  #     ones re-enter as POSITIVES, so the positive count only goes up.      #
  #                                                                          #
  # Step 4c re-runs this same fit after Steps 1c and 4b repair the labels,   #
  # and THAT run prices the operating point.                                 #
  #                                                                          #
  # Per the 07-26 standing caution: a number without its provenance may be   #
  # quoted as context, never as a bar. Tag anything that leaves here with    #
  # (n=328 fit rows, §77 routing, unaudited positives, measured YYYY-MM-DD,  #
  # grouped 5-fold CV).                                                      #
  ############################################################################

Run:
    py -3 gate_step4a.py
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")   # Windows console is cp1252 -> chokes on em-dashes
import json
import re
import collections
import urllib.parse as urlparse
from pathlib import Path

import numpy as np

from text_recipe import clean   # §70 serve-time cleaning; used to verify duplicate collapse

HERE = Path(__file__).resolve().parent
CORPORA = HERE / "corpora"
DECK = HERE / "deck"

MODEL = "voyage-4-large"            # §71; must match the cached manifests or the head is
ARM = "nocats"                      # fit in one space and served in another

# --- deck-pull field NAMES -----------------------------------------------------------
# The snapshot written by scripts/auditR7Labels.js is flat and keyed by field NAME, not
# by field id (the old 07-26 export was id-keyed, which is why this join silently broke:
# a missing id reads as None and the row drops out of a filter without raising).
# A rename upstream must fail loud, so every name below is asserted present after load.
F_SECTION = "Section"       # editor's label: Families / Couples / Golden / None
F_ROW = "Row"               # join key -> transfer_rows.json
F_BATCH = "Batch"           # which labelling sitting the row came from
F_NOTE = "NoneReasoning"    # editor free-text reasoning (qualitative only)
F_REASON = "NoneReason"     # the 6-option multiselect (§77) -- the gate target's input
REQUIRED_PULL_FIELDS = (F_SECTION, F_ROW, F_BATCH, F_NOTE, F_REASON)

SECTIONS = ("For Families", "For Couples", "For Golden Age Readers")
LABEL_MAP = {"Families": "For Families", "Couples": "For Couples",
             "Golden": "For Golden Age Readers", "None": "None"}

# The newest pull. transfer_rows.json was built from the 07-20 pull, so the labels baked
# into it are stale; this file is the current truth and the drift is reported below
# rather than silently applied. Refresh with: node scripts/auditR7Labels.js
CURRENT_PULL = sorted(
    (HERE.parent.parent / "data" / "tracking" / "r7_label_audits").glob("r7_label_deck_*.json")
)[-1]

# ============================================================
# PART 1 — load the cached deck matrix and its row metadata.
# Row i of the .npy IS rows[i]; that alignment is the whole contract of transfer_test.py
# PART 4, and everything downstream depends on it holding.
# ============================================================
X = np.load(CORPORA / f"transfer_{ARM}_{MODEL}.npy")
rows = json.loads((CORPORA / "transfer_rows.json").read_text(encoding="utf-8"))
manifest = json.loads((CORPORA / f"transfer_{ARM}_{MODEL}_manifest.json").read_text(encoding="utf-8"))
assert X.shape[0] == len(rows), "deck X and transfer_rows.json are misaligned"

raw_by_url = {e["url"]: e for e in
              json.loads((CORPORA / "raw_candidate_events.json").read_text(encoding="utf-8"))}

print(f"deck matrix  {X.shape}  [{ARM} arm, {MODEL}, embedded {manifest['embedded_at']}]")

# ============================================================
# PART 2 — re-join the CURRENT editor labels by Row, and report drift.
# The instrument-vs-world check the 07-27 convention now requires: if the editor changed
# a call since 07-20, the cached embedding is still valid (the TEXT did not change) but
# the TARGET did. Silently using the stale label would price the curve against labels
# nobody holds anymore.
# ============================================================
pull = json.loads(CURRENT_PULL.read_text(encoding="utf-8"))["records"]

# Fail loud on a field rename rather than dropping rows silently (the 07-26 failure).
for name in REQUIRED_PULL_FIELDS:
    if not any(name in rec for rec in pull):
        raise SystemExit(
            f"\nFIELD MISSING: '{name}' is absent from all {len(pull)} records in\n"
            f"  {CURRENT_PULL.name}\n"
            "A rename in Airtable reads as absent here and would silently empty the join.\n"
        )

current, batch_of, note_of, reasons_of = {}, {}, {}, {}
for rec in pull:
    row = rec.get(F_ROW)
    if row is None:
        continue
    sec = rec.get(F_SECTION)
    if sec:
        current[row] = LABEL_MAP.get(sec, sec)
    if rec.get(F_BATCH):
        batch_of[row] = rec[F_BATCH]
    if rec.get(F_NOTE):
        note_of[row] = rec[F_NOTE]
    raw_reasons = rec.get(F_REASON) or []
    reasons_of[row] = [raw_reasons] if isinstance(raw_reasons, str) else list(raw_reasons)

drift, missing = [], []
for r in rows:
    now = current.get(r["row"])
    if now is None:
        missing.append(r["row"])
    elif now != r["label"]:
        drift.append((r["row"], r["label"], now))

print(f"current pull  {CURRENT_PULL.name}: {len(pull)} records, {len(current)} labelled")
print(f"label drift since the 07-20 pull: {len(drift)} of {len(rows)} embedded rows"
      + (f"  {drift[:10]}" if drift else ""))
print(f"embedded rows absent from the current pull: {len(missing)}")

# Use the current label where it exists; fall back to the cached one only if the row has
# vanished from the pull (should be 0 -- flagged loudly above if not).
labels = [current.get(r["row"], r["label"]) for r in rows]

# ============================================================
# PART 3 — the binary target, the groups, and the auxiliary columns.
# ============================================================
# ------------------------------------------------------------------------------------
# THE §77 ROUTING CONTRACT (R7_Scope Step 1b). Editor-authored destinations.
#
# This is the ONE place a reason tick becomes a model target. It exists as a single
# asserted function because the same mapping, written twice and interpreted
# independently, produced three separate wrong numbers on 2026-07-30: a gate slice
# reported as 123/60 when it is 95/54, a false "zero residual conflicts", and a
# merged-binary target here. All three were the same defect wearing three hats.
#
# PRECEDENCE -- the order is the contract, not an implementation detail:
#   1. non-GTA     -> stage0    A record fact. Beats every content judgment because a
#                               foreign event never reaches the gate to be judged.
#   2. can't tell  -> excluded  The editor could not decide. Nothing brings these back,
#                               which is what separates `excluded` from `withheld`.
#   3. permanent   -> negative  wrong fit / B2B / civic. A permanent property of the
#                               event against the readership. This is the gate's job.
#   4. outcompeted -> withheld  Evaluated LAST so that a permanent + outcompeted row
#                               falls through to (3) and lands in the gate as a
#                               negative. Fails safe: a double-tick cannot escape.
#
# `withheld` is NOT `negative` and NOT `positive` -- these rows leave the fit entirely.
# §83 found the label impure, Step 1c is relabelling the 38 model-relevant ones blind,
# and eligible ones re-enter as POSITIVES at Step 4c. Scoring them either way today
# would prejudge the sitting that exists to answer the question.
# ------------------------------------------------------------------------------------
NON_GTA = "non-GTA"
CANT_TELL = "can't tell"
OUTCOMPETED = "outcompeted"
PERMANENT = ("wrong fit / not our audience", "B2B / professional dev", "civic")
KNOWN_REASONS = {NON_GTA, CANT_TELL, OUTCOMPETED, *PERMANENT}


def route_s77(section, reasons):
    """Editor label -> gate destination.

    Returns 'positive' | 'negative' | 'withheld' | 'stage0' | 'excluded' | 'unlabelled'.
    Only 'positive' and 'negative' enter the fit.
    """
    if section in SECTIONS:
        return "positive"            # the editor placed it in an issue section
    if section != "None":
        return "excluded"            # blank / unrecognised label: not a ruling
    reasons = set(reasons or ())
    if unknown := reasons - KNOWN_REASONS:
        raise ValueError(f"unrecognised NoneReason option(s): {sorted(unknown)}")
    if not reasons:
        return "unlabelled"          # asserted to be 0 -- the split closed at 239/239
    if NON_GTA in reasons:
        return "stage0"
    if CANT_TELL in reasons:
        return "excluded"
    if reasons & set(PERMANENT):
        return "negative"
    if OUTCOMPETED in reasons:
        return "withheld"
    raise AssertionError(f"unroutable reason set: {sorted(reasons)}")


# Precedence cases, asserted at import from the SHARED fixture that scripts/auditR7Labels.js
# also loads. Two copied case lists are not parity -- both could be edited consistently
# with their own local tests and still diverge. One fixture, two consumers, no local copy.
_CASES = json.loads((HERE / "routing_s77_cases.json").read_text(encoding="utf-8"))
_SECTION_ALIAS = {"Families": "For Families", "Couples": "For Couples", "Golden": "For Golden Age Readers"}

for _c in _CASES["cases"]:
    _sec = _SECTION_ALIAS.get(_c["section"], _c["section"])
    _got = route_s77(_sec, _c["reasons"])
    assert _got == _c["want"], (
        f"§77 routing contract broken: {_c['section']} {_c['reasons']} "
        f"-> {_got}, want {_c['want']}"
    )
for _c in _CASES["throw_cases"]:
    try:
        route_s77(_SECTION_ALIAS.get(_c["section"], _c["section"]), _c["reasons"])
    except ValueError:
        pass
    else:
        raise AssertionError(f"§77 contract: expected a raise for {_c['reasons']} ({_c['why']})")

route = np.array([route_s77(lab, reasons_of.get(r["row"], []))
                  for lab, r in zip(labels, rows)], dtype=object)

routed = collections.Counter(route.tolist())
print("\n§77 routing over the {} embedded rows:".format(len(rows)))
for dest in ("positive", "negative", "withheld", "stage0", "excluded", "unlabelled"):
    print(f"  {dest:12} {routed.get(dest, 0):4}")

# The pre-relabel baseline (R7_Scope Step 1b). Step 1c WILL move these -- that is the
# point of it -- so this assertion is a tripwire on silent drift, not a permanent truth.
# When 1c lands, update these numbers deliberately and say so in the Execution_Log.
EXPECTED_PRE_RELABEL = {"positive": 191, "negative": 137, "withheld": 64,
                        "stage0": 16, "excluded": 8, "unlabelled": 0}
_actual = {k: routed.get(k, 0) for k in EXPECTED_PRE_RELABEL}
if _actual != EXPECTED_PRE_RELABEL:
    raise SystemExit(
        "\nROUTING COUNTS MOVED -- refusing to fit on a target nobody has looked at.\n"
        f"  expected {EXPECTED_PRE_RELABEL}\n"
        f"  actual   {_actual}\n"
        "If this is Step 1c landing, that is expected: update EXPECTED_PRE_RELABEL and\n"
        "record the change. If it is not, a label moved that nobody decided to move.\n"
    )

# Only positives and negatives are fitted. The 88 others are not 'missing data' -- they
# are rows the contract deliberately declines to score.
fit_mask = np.isin(route, ("positive", "negative"))
y = np.where(route == "positive", 1, 0)[fit_mask].astype(int)

# Groups for leak-free CV. Key = URL, falling back to normalised title so that a recurring
# program appearing under different URLs still lands in one fold. Within THIS deck the two
# are equivalent (380 distinct URLs, 380 distinct titles) -- the title arm is insurance for
# when the deck grows, not something doing work today.
def norm_title(u):
    t = (raw_by_url.get(u, {}).get("title") or "").strip().lower()
    return re.sub(r"\s+", " ", t)


title_to_group, groups = {}, []
for r in rows:
    key = norm_title(r["url"]) or r["url"]
    groups.append(title_to_group.setdefault(key, len(title_to_group)))
groups = np.array(groups)

# Auxiliary columns. These are STAGED, not selected -- the feature set is representation
# choice, which is authored-core. Step 4 names embedding + source + has-cats + desc length
# as candidates; nothing here commits to any of them.
section = np.array(labels, dtype=object)                       # for the per-section recall read
slice_ = np.array([r["slice"] for r in rows], dtype=object)     # §69: gate vs train vs walkthrough
is_pair = np.array([r["dupe"] == "PAIR" for r in rows])         # self-consistency repeats
source = np.array([urlparse.urlparse(r["url"]).netloc for r in rows], dtype=object)
desc_len = np.array([len((raw_by_url.get(r["url"], {}).get("desc") or "")) for r in rows])
has_cats = np.array([bool((raw_by_url.get(r["url"], {}).get("cats") or "").strip()) for r in rows])
has_note = np.array([r["row"] in note_of for r in rows])        # editor wrote reasoning on this row

# Apply the routing mask to EVERYTHING at once, in one place, so row alignment cannot
# drift between X and a column that was masked a few lines later. After this line the
# fit set is the 328 rows the §77 contract scores; the 88 it declines are gone.
_n_before = len(rows)
X = X[fit_mask]
groups = groups[fit_mask]
section = section[fit_mask]
slice_ = slice_[fit_mask]
is_pair = is_pair[fit_mask]
source = source[fit_mask]
desc_len = desc_len[fit_mask]
has_cats = has_cats[fit_mask]
has_note = has_note[fit_mask]
route_fit = route[fit_mask]
rows_fit = [r for r, keep in zip(rows, fit_mask) if keep]
assert X.shape[0] == len(y) == len(groups) == len(rows_fit), "mask misaligned X and y"
print(f"\nfit set: {X.shape[0]} of {_n_before} embedded rows"
      f"  ({_n_before - X.shape[0]} withheld/stage0/excluded by the §77 contract)")

# ============================================================
# PART 4 — the staging report. Everything the eval needs to know about its own inputs
# BEFORE a number exists, so no surprise gets read as a finding later.
# ============================================================
print(f"\ntarget: {int(y.sum())} include / {int((1 - y).sum())} None"
      f"  (base rate {y.mean():.1%} includable)")
print(f"groups: {len(set(groups.tolist()))} distinct for {len(rows_fit)} rows"
      f"  |  {int(is_pair.sum())} PAIR repeat rows -> {len(rows_fit) - len(set(groups.tolist()))} collisions absorbed")

print("\nincludables by section (the per-section recall denominators):")
for s in SECTIONS:
    n = int((section == s).sum())
    print(f"  {s:24} {n:4}   smallest fold share ~{n / 5:.0f} events")

print("\nby slice (§69 -- gate and train are scored SEPARATELY, never pooled):")
for sl in ("gate", "train", "walkthrough"):
    m = slice_ == sl
    print(f"  {sl:12} n={int(m.sum()):4}  include={int(y[m].sum()):4}  None={int((1 - y[m]).sum()):4}")

print("\nby source (the gate must report rejection rate per source -- Step 4 done-when):")
for dom, n in collections.Counter(source.tolist()).most_common(8):
    m = source == dom
    print(f"  {dom:28} n={n:4}  includable {y[m].mean():5.1%}")

print(f"\ndesc length: {int(desc_len.min())}-{int(desc_len.max())} chars, median {int(np.median(desc_len))}"
      f"  |  {int((desc_len == 0).sum())} rows with NO description at all")
print(f"has category tags: {int(has_cats.sum())}  |  editor wrote reasoning on: {int(has_note.sum())} rows")

# What is NOT in this matrix, stated so it cannot be forgotten mid-eval:
full_deck_none = sum(1 for r in pull if r.get(F_SECTION) == "None")
print(f"\ncoverage: the full deck has {len(current)} labelled rows ({full_deck_none} None);"
      f" {_n_before} are embedded and {len(rows_fit)} survive the §77 contract.")
print(f"  -> of the {len(pull)} deck rows, {len(pull) - _n_before} are NOT embedded"
      f" (#107: 30 post-date the embedding pull, 4 walkthrough staging, 4 blank, 2 no URL).")
print("  -> the #108 AllEvents prose backfill is NOT applied to these vectors."
      " Re-embedding after that call lands will move every AllEvents row.")

# -------------------------------------------------------------------------------------
# DIAGNOSTIC STAMP (R7_Scope Step 4a). Step 4a is diagnostic-only: the positive class has
# never been audited (0 of 211 acceptances checked), so no number below is a release bar.
# Step 4c sets the bar, after Steps 1c and 4b repair the labels.
#
# This is printed rather than merely documented because numbers travel without their
# surrounding prose -- that is precisely how 0.98 keeper recall and the 0.95->43% /
# 0.90->55% anchors entered the Scope doc as bars with no measurement behind them.
# Stamp every exported artifact with DIAGNOSTIC_STAMP too, not just the console run.
DIAGNOSTIC_STAMP = "DIAGNOSTIC ONLY - UNAUDITED POSITIVE LABELS - NOT A RELEASE BAR"


def stamped(payload: dict) -> dict:
    """Wrap an export payload so the warning cannot be separated from the numbers."""
    return {"_warning": DIAGNOSTIC_STAMP, "_step": "R7-W6 Step 4a (diagnostic)", **payload}


print("\n" + "!" * 78)
print(DIAGNOSTIC_STAMP.center(78))
print("!" * 78)

# =====================================================================================
# ================================  EVAL — AUTHORED CORE  ==============================
# =====================================================================================
# STOP. The plumbing above is done: X, y, groups, and the aux columns are in memory and
# row-aligned. Everything below is yours.
#
# WHICH RUN IS THIS? The pin discipline applies to the run that SETS the bar, and that
# is no longer 4a (Decision §82 + R7_Scope: 4a is diagnostic, 4c sets the bar after 1c
# and 4b repair the labels). Blind pre-commitment exists to stop you choosing the
# definition of "recall" after seeing which section sags -- a real risk when a number
# becomes a bar, and not much of one when the run's whole job is to find label errors.
#
#   STEP = "4a"  -> report BOTH readings of every choice below. Nothing is pinned,
#                   nothing is chosen, and no operating point may be taken from it.
#   STEP = "4c"  -> the guard fires: every pin must be set BEFORE the fit runs.
STEP = "4a"

# (1) WHICH RECALL IS THE DIAL -- one global keeper-recall number, or a per-section floor?
#     R7_Scope Step 4 argues for a floor: "losing 67 events at random is survivable,
#     losing 67 that are all Golden Age library programs is not."
#     At 4a: report both. Positives per section are 79 / 57 / 55, so a per-section floor
#     moves in ~1.8-point steps -- report that granularity alongside the number so the
#     resolution is visible when you do pin it.
RECALL_DIAL = None            # TODO(ariel) @4c: "global" | "per_section_floor"

# (2) WHICH ROWS THE CURVE IS MEASURED ON. §69 says gate and train are scored separately
#     and never pooled -- train was drawn deliberately hard/low-margin, so a pooled number
#     is not interpretable. But grouped CV over the whole deck is what gives the gate
#     enough negatives to fit at all.
#     At 4a: report gate (95/54) and pooled (191/137) SEPARATELY, never as one number.
#     At 4c: state which population the OPERATING POINT is read off, and if it is not
#     "gate", say why pooling is legitimate here when §69 says it is not.
CURVE_MEASURED_ON = None      # TODO(ariel) @4c: "gate" | "all_grouped_cv" | "both_reported"

# (3) RETIRED 2026-07-31 -- this pin's premise is gone.
#     It asked whether a MERGED-None curve sets the bar or only bounds it pending the
#     four-way split. The split landed (239/239, closed 07-30) and the §77 routing
#     contract above replaced the merged target, so the question it guarded is closed.
#     The live version of the same worry is NOT about the negatives any more -- it is
#     the unaudited POSITIVE class, which is what Step 4b exists to repair and what the
#     DIAGNOSTIC_STAMP announces. Same shape as score-vs-delete: the pin was guarding a
#     door that had already shut while the open one was behind it.
# MERGED_NONE_VERDICT = ...   # do not re-add; see R7_Scope Step 4b

# (4) THE STOPPING RULE. If no threshold gives an acceptable recall/junk trade, what
#     happens -- in order, committed before the number, so a bad curve does not become
#     motivated tuning. (Fork C is one of the legitimate outcomes here: "the gate is not
#     the win, ranking is" is a finding, not a failure.)
ITERATION_LADDER = None       # TODO(ariel) @4c: list[str]

# (5) THE ESCALATION TRIGGER (R7_Scope Step 4c saturation check). After 4b's corrections,
#     4c exports a FRESH untouched disagreement set and reports how far the curve moved
#     from 4a. Few flips + a curve that barely moves = the repair is saturating. Still
#     flipping at the old rate = the contamination is too broad for targeted repair and
#     the full 211 need auditing. Both numbers get written BEFORE 4c runs; a threshold
#     set after seeing the output is a rationalisation, not a bar.
ESCALATION_TRIGGER = None     # TODO(ariel) @4c: {"flip_rate": float, "curve_shift": float}

_PINS = {"RECALL_DIAL": RECALL_DIAL, "CURVE_MEASURED_ON": CURVE_MEASURED_ON,
         "ITERATION_LADDER": ITERATION_LADDER, "ESCALATION_TRIGGER": ESCALATION_TRIGGER}

if STEP == "4c" and any(v is None for v in _PINS.values()):
    raise SystemExit(
        "\nEVAL BLOCKED - Step 4c sets the release bar, so the rules are committed first.\n"
        f"unset: {sorted(k for k, v in _PINS.items() if v is None)}\n"
        "The plumbing ran; X / y / groups / aux columns are staged and row-aligned.\n"
        "Pin these before the fit or the bar is just the number wearing a bar's clothes.\n"
    )

if STEP == "4a":
    print("\nSTEP 4a -- diagnostic. Nothing below is pinned: report BOTH the global and"
          "\n  per-section recall, and report the gate slice and the pooled fit SEPARATELY."
          "\n  No operating point may be taken from this run. Set STEP = \"4c\" for that.")

# ARM 1 -- embeddings only (settled in earlier sessions). The aux columns staged above
# are NOT used here: adding them is a representation choice and therefore arm 2, yours.
from sklearn.linear_model import LogisticRegression      # noqa: E402
from sklearn.model_selection import GroupKFold, cross_val_predict  # noqa: E402
from sklearn.metrics import roc_auc_score                # noqa: E402

clf = LogisticRegression(max_iter=2000, C=1.0)
cv = GroupKFold(n_splits=5)
p = cross_val_predict(clf, X, y, cv=cv, groups=groups, method="predict_proba")[:, 1]
print(f"\nout-of-fold P(include) via grouped 5-fold CV  (arm 1: embeddings only, C=1.0)")


def curve(mask, label):
    """Keeper recall vs junk rejection, in EVENT COUNTS, on the rows selected by mask."""
    pm, ym, sm = p[mask], y[mask], section[mask]
    n_pos, n_neg = int(ym.sum()), int((1 - ym).sum())
    if n_pos == 0 or n_neg == 0:
        print(f"\n{label}: not scoreable (pos={n_pos}, neg={n_neg})")
        return
    print(f"\n=== {label}  (n={mask.sum()}: {n_pos} keepers / {n_neg} junk) ===")
    print(f"  AUC {roc_auc_score(ym, pm):.3f}")
    print("  recall   thresh   keepers lost   junk rejected        per-section recall")
    for target in (0.99, 0.98, 0.95, 0.90, 0.85, 0.80):
        # highest threshold that still achieves the target keeper recall
        cand = [t for t in np.unique(pm) if (pm[ym == 1] >= t).mean() >= target]
        if not cand:
            continue
        t = max(cand)
        kept = pm[ym == 1] >= t
        lost = int((~kept).sum())
        rejected = int((pm[ym == 0] < t).sum())
        per_sec = "  ".join(
            f"{s.split()[-1][:4]} {(pm[(ym == 1) & (sm == s)] >= t).mean():.2f}"
            for s in SECTIONS if ((ym == 1) & (sm == s)).sum()
        )
        print(f"  {kept.mean():5.3f}   {t:.4f}   {lost:3} of {n_pos:3}    "
              f"{rejected:3} of {n_neg:3} ({rejected / n_neg:5.1%})   {per_sec}")


# Step 4a reports every sampling population separately. The train slice was selected from
# the old 3-class classifier's low-margin tail, so it is a useful stress test but not a
# production estimate for this different binary task. Walkthrough rows were selected for
# criteria elicitation and are more instrument-shaped still. Pooled remains descriptive
# only: it is not a substitute for any of the three slice-specific reads (§65/§69).
curve(np.ones(len(y), dtype=bool), "POOLED FIT — 328 rows, gate+train+walkthrough")
curve(slice_ == "gate", "GATE SLICE — the only representative population")
curve(slice_ == "train", "TRAIN SLICE — old 3-class low-margin stress test")
curve(slice_ == "walkthrough", "WALKTHROUGH SLICE — criteria-elicitation rows")

# Calibration. P(include) doubles as the interim ranking score (final = P(inc) x P(sec)),
# so a miscalibrated probability breaks ranking as well as the threshold.
print("\ncalibration (pooled, decile bins):")
print("  bin        n   mean P   actual")
for lo in np.arange(0.0, 1.0, 0.2):
    m = (p >= lo) & (p < lo + 0.2)
    if m.sum():
        print(f"  {lo:.1f}-{lo + 0.2:.1f}  {m.sum():4}   {p[m].mean():.3f}    {y[m].mean():.3f}")

# Step 4a done-when: export the highest-disagreement gate positives for Step 4b's sitting.
# These are rows the EDITOR called includable and the model scores lowest -- either the
# model cannot see it (feature bug) or the label is wrong (label bug). 4b asks which.
#
# DEDUPLICATED BY CV GROUP -- BUT A CV GROUP IS NOT AUTOMATICALLY ONE EDITORIAL EVENT.
# `groups` is keyed on normalised TITLE. That is the right key for leak-free folds; it is
# NOT proof that two occurrences carry the same description or deserve the same ruling.
# So the collapse is CHECKED, not assumed:
#   pass 1  pick the n lowest-scoring positives, one per group (the representative)
#   pass 2  scan the WHOLE fit set for every positive occurrence of those groups -- an
#           earlier version stopped at n and therefore missed later twins entirely
#   pass 3  compare cleaned description text; collapse only genuinely equivalent copies,
#           and surface the rest as VARIANTS the sitting must judge separately
N_DISAGREEMENTS = 30


def _evidence_key(i):
    """What the editor would actually read. Same text -> same ruling; different -> ask."""
    e = raw_by_url.get(rows_fit[i]["url"], {})
    return " ".join((clean(e.get("desc") or "")).lower().split())


def top_disagreements(scores, n=N_DISAGREEMENTS):
    """Lowest-scoring POSITIVES, one per CV group, with twins verified not assumed."""
    reps, seen = [], set()
    for i in np.argsort(scores):                    # ascending: most disagreed-with first
        if y[i] != 1 or int(groups[i]) in seen:
            continue
        seen.add(int(groups[i]))
        reps.append(int(i))
        if len(reps) == n:
            break

    by_group = collections.defaultdict(list)        # pass 2: FULL scan, no early stop
    for i in range(len(y)):
        if y[i] == 1 and int(groups[i]) in seen:
            by_group[int(groups[i])].append(i)

    out = []
    for i in reps:
        g = int(groups[i])
        rep_key = _evidence_key(i)
        same = [j for j in by_group[g] if j != i and _evidence_key(j) == rep_key]
        diff = [j for j in by_group[g] if j != i and _evidence_key(j) != rep_key]
        out.append({"idx": i, "group": g,
                    "twins": [rows_fit[j]["row"] for j in same],
                    "variants": [{"row": rows_fit[j]["row"],
                                  "p_include": round(float(scores[j]), 4)} for j in diff]})
    return out


picked = top_disagreements(p)
disagreements = [{
    "row": rows_fit[e["idx"]]["row"],
    "p_include": round(float(p[e["idx"]]), 4),
    "section": str(section[e["idx"]]),
    "slice": str(slice_[e["idx"]]),
    "cv_group": e["group"],
    # Same group AND byte-identical serve text -> one ruling covers all of these.
    "duplicate_rows": e["twins"],
    # Same group, DIFFERENT text -> the editor must judge these separately. Do not
    # apply the representative's ruling to them.
    "variant_rows": e["variants"],
    "title": raw_by_url.get(rows_fit[e["idx"]]["url"], {}).get("title", ""),
    "url": rows_fit[e["idx"]]["url"],
} for e in picked]

_collapsed = sum(len(e["twins"]) for e in picked)
_variants = sum(len(e["variants"]) for e in picked)
OUT = HERE / "eval" / "step4a_disagreements.json"
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(stamped({
    "generated": CURRENT_PULL.name,
    "arm": "embeddings only, C=1.0, grouped 5-fold CV",
    "n_fit": int(len(y)),
    "deduplicated_by": "cv_group (normalised title), VERIFIED against cleaned serve text. "
                       "duplicate_rows = same group AND identical text, one ruling covers "
                       "all. variant_rows = same group, DIFFERENT text -- judge separately, "
                       "do not inherit the representative's ruling.",
    "note": "Editor called these includable; the model scores them lowest. Step 4b asks "
            "the RULE question ('is there a permanent reason you would never run this?'), "
            "never the preference question. Enriched for suspected errors -- it repairs, "
            "it does not estimate contamination.",
    "rows": disagreements,
}), indent=2), encoding="utf-8")
print(f"\nexported {len(disagreements)} unique-group disagreement positives -> {OUT.relative_to(HERE)}")
print(f"  {_collapsed} duplicate row(s) collapsed (same group, identical serve text).")
print(f"  {_variants} variant row(s) share a group but NOT the text -> judged separately.")
print("  (Step 4b's sitting list. Enriched for errors: repairs, does not estimate.)")
#
# TODO(ariel): the breadth diagnostic (§75 un-park trigger, R7_Scope Step 4). Report gate
#     recall on the single-community stratum. If those events systematically SURVIVE, the
#     embedding is not carrying breadth and the flag comes off the shelf; if they are
#     rejected at base rate or better, the flag stays parked and §75 is confirmed.
#     Either result is a finding. This is the check, not a formality.
#
# TODO(ariel): write the chosen operating point into R7_Scope.md as the bar, WITH its
#     provenance tag. Until that is written, the doc names no recall target.
