"""
gate_step4a.py — R7-W6 Step 4a: price the keeper-recall / junk-rejection curve.

WHAT THIS IS FOR (R7_Scope.md Steps 4a + 4c). Two runs, one script, selected by STEP:
  STEP = "4a"  DIAGNOSTIC. Bounds whether the gate has signal and exports Step 4b's
               disagreement sitting list. It sets no bar and prints no operating point.
  STEP = "4c"  SETS THE BAR, and only after Steps 1c and 4b have repaired the labels.
               Runs the section-safe operating-point search (Decision_Log §85) and
               exports a FRESH disagreement set that excludes every CV group Step 4b
               already audited.
The Step-4 operating point and Fork C wait on 4c's number, never on 4a's. No new spend:
labels and embeddings are already cached.

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
import hashlib
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

# ------------------------------------------------------------------------------------
# CORRUPT-INPUT WITHHOLDS. Rows whose LABEL is sound but whose EMBEDDED TEXT is not the
# event, so no target value is truthful. §77 routes from the editor's label and cannot
# see this; the six NoneReason options have no value meaning "the input text is wrong",
# so encoding it in Airtable would require writing a false label. It lives here instead.
#
# This is a GUARD, not a correction: each row below must ALREADY route out of the fit on
# its Airtable label alone, and the assertion under the dict enforces that. If a row ever
# starts arriving as positive/negative, the guard fires loudly rather than silently
# changing a count -- which is the failure it exists to prevent, because the Step-1c
# reconciliation leaves these rows carrying `outcompeted` and a later sweep of the
# remaining outcompeted pile would otherwise pull them straight into the fit.
#
# Removing a row requires re-embedding it from corrected text, not a judgment call.
#
# THE SET IS NOT WRITTEN HERE. It is read from the Step-1c reconciliation artifact, which
# is the same file that records why each row was withheld and what the editor actually
# said about it. A hard-coded list here would be a second home for that fact, free to
# drift from the artifact -- the exact failure the §77 shared fixture exists to prevent
# on the routing side. One home, one loader, no local copy.
# ------------------------------------------------------------------------------------
STEP1C_RECONCILIATION = HERE / "eval" / "step1c_reconciliation.json"


def _load_withheld_rows():
    """Corrupt-input withholds, sourced from the Step-1c reconciliation artifact.

    Fails loud on absence or a malformed entry. Silently returning {} would drop the
    withhold and pull a corrupt row into the fit -- a count change nothing downstream
    would flag, which is precisely what this guard exists to stop. Validated for shape
    AND against the artifact's own declared count, so a hand-made stub cannot unblock it.
    """
    if not STEP1C_RECONCILIATION.exists():
        raise SystemExit(
            f"\nMISSING: {STEP1C_RECONCILIATION.name} is required to know which rows are\n"
            "withheld for corrupt input.\n\n"
            "DO NOT regenerate it with `--emit-artifact`. The Step-1c write is APPLIED, so\n"
            "the live deck is now the POST-write state; regenerating would rebuild the\n"
            "artifact's `before` values and `cleared_commentary` from it, destroying the\n"
            "pre-write record and the cleared r175 Label string (which exists nowhere else,\n"
            "since data/ is gitignored). The script refuses, but do not try.\n\n"
            "RECOVER IT FROM GIT instead -- it is a committed artifact:\n"
            "  git checkout -- models/sectioning/eval/step1c_reconciliation.json\n"
        )
    art = json.loads(STEP1C_RECONCILIATION.read_text(encoding="utf-8"))
    entries = art.get("withheld_from_fit")
    if not isinstance(entries, list):
        raise SystemExit(f"\n{STEP1C_RECONCILIATION.name}: 'withheld_from_fit' must be a list\n")

    withheld = {}
    for entry in entries:
        row, why = entry.get("row"), entry.get("reason_withheld")
        if not isinstance(row, int) or isinstance(row, bool):
            raise SystemExit(f"\n{STEP1C_RECONCILIATION.name}: bad 'row' in {entry!r}\n")
        if not (isinstance(why, str) and why.strip()):
            raise SystemExit(
                f"\n{STEP1C_RECONCILIATION.name}: r{row} is withheld with no stated reason. "
                "A withhold without a reason cannot be reviewed or ever safely removed.\n"
            )
        if row in withheld:
            raise SystemExit(f"\n{STEP1C_RECONCILIATION.name}: r{row} listed twice\n")
        withheld[row] = why.strip()

    declared = art.get("counts", {}).get("withheld")
    if declared != len(withheld):
        raise SystemExit(
            f"\n{STEP1C_RECONCILIATION.name}: counts.withheld says {declared} but "
            f"'withheld_from_fit' carries {len(withheld)}. The artifact disagrees with "
            "itself; regenerate it rather than editing one side.\n"
        )
    return withheld


WITHHELD_ROWS = _load_withheld_rows()
print(f"corrupt-input withholds (from {STEP1C_RECONCILIATION.name}): "
      f"{sorted(WITHHELD_ROWS) or 'none'}")

_raw_route = [route_s77(lab, reasons_of.get(r["row"], []))
              for lab, r in zip(labels, rows)]
for _i, _r in enumerate(rows):
    if _r["row"] in WITHHELD_ROWS:
        assert _raw_route[_i] not in ("positive", "negative"), (
            f"WITHHELD_ROWS guard fired: r{_r['row']} now routes '{_raw_route[_i]}' from its "
            f"Airtable label and would enter the fit. Reason it must not: "
            f"{WITHHELD_ROWS[_r['row']]}"
        )
        _raw_route[_i] = "withheld"

route = np.array(_raw_route, dtype=object)

routed = collections.Counter(route.tolist())
print("\n§77 routing over the {} embedded rows:".format(len(rows)))
for dest in ("positive", "negative", "withheld", "stage0", "excluded", "unlabelled"):
    print(f"  {dest:12} {routed.get(dest, 0):4}")

# --------------------------------------------------------------------------------------
# TWO ROUTING-COUNT CONSTANTS. They look alike and do opposite jobs; conflating them was
# the defect. One is a FIXED HISTORICAL FACT, the other is a MAINTAINED EXPECTATION.
#
#   PRE_REPAIR_ROUTING_COUNTS   Immutable. What the §77 contract produced on 2026-07-31,
#                               BEFORE Step 4b's 11 NEVER corrections and Step 1c's
#                               relabel. NEVER EDIT THIS. Step 4c compares against it to
#                               prove the corrections actually landed -- and a baseline
#                               that gets "updated" can no longer prove anything, because
#                               editing it to match reality is exactly the mistake the
#                               guard is watching for.
#
#   EXPECTED_CURRENT_ROUTING_COUNTS  Deliberately maintained. The tripwire against SILENT
#                               drift: any label that moves without somebody deciding to
#                               move it. Updated by hand, on purpose, after Step 4b and
#                               Step 1c land, with the change recorded in Execution_Log.
#
# They are equal today only because no correction has been applied yet. The moment 4b's
# writes land they must diverge, and that divergence is the evidence Step 4c requires.
# --------------------------------------------------------------------------------------
PRE_REPAIR_ROUTING_COUNTS = {"positive": 191, "negative": 137, "withheld": 64,
                             "stage0": 16, "excluded": 8, "unlabelled": 0}

# Updated 2026-08-03, deliberately, after the Step-1c reconciliation wrote 37 rows
# (25 -> positive, 12 -> negative; r342 held back as a corrupt-input withhold). Verified
# against a post-write refetch and an all-fields diff of the full 456-record deck.
# Previous value, post-4b: positive 180 / negative 148 / withheld 64.
EXPECTED_CURRENT_ROUTING_COUNTS = {"positive": 205, "negative": 160, "withheld": 27,
                                   "stage0": 16, "excluded": 8, "unlabelled": 0}

_actual = {k: routed.get(k, 0) for k in EXPECTED_CURRENT_ROUTING_COUNTS}
if _actual != EXPECTED_CURRENT_ROUTING_COUNTS:
    raise SystemExit(
        "\nROUTING COUNTS MOVED -- refusing to fit on a target nobody has looked at.\n"
        f"  expected {EXPECTED_CURRENT_ROUTING_COUNTS}\n"
        f"  actual   {_actual}\n"
        "If this is Step 4b's corrections or Step 1c landing, that is expected: update\n"
        "EXPECTED_CURRENT_ROUTING_COUNTS deliberately and record the change (#121).\n"
        "Do NOT touch PRE_REPAIR_ROUTING_COUNTS -- Step 4c needs it fixed to detect that\n"
        "the corrections were applied at all.\n"
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

# The prof-dev / B2B stratum (R7_Scope Step 4, second stratum). NOT invented vocabulary:
# this is the editor's own §77 reason tick, so the stratum is defined by the label rather
# than by a keyword list somebody wrote. These rows route to the gate as CONTENT
# judgments (§76), so the question is whether the embedding already carries the rule.
B2B_REASON = "B2B / professional dev"
is_b2b_reason = np.array([B2B_REASON in reasons_of.get(r["row"], []) for r in rows])

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
is_b2b_reason = is_b2b_reason[fit_mask]
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
# ARTIFACT PROVENANCE STAMP -- DERIVED FROM `STEP`, never hardcoded.
#
# Why derived: the stamp's entire job is to travel with the numbers, because numbers
# travel without their surrounding prose. That is precisely how 0.98 keeper recall and
# the 0.95->43% / 0.90->55% anchors entered the Scope doc as bars with no measurement
# behind them. A hardcoded stamp fails that job in BOTH directions -- a 4c run wearing
# "DIAGNOSTIC ONLY" understates a real bar exactly as badly as a 4a number quoted as one.
#
#   4a: the positive class has never been audited (0 of 211 acceptances checked), so no
#       number the run produces is a release bar.
#   4c: runs after Steps 1c and 4b repair the labels, under the pre-registered rules in
#       Decision_Log §85. It is the run that prices the operating point.
_STAMPS = {
    "4a": ("DIAGNOSTIC ONLY - UNAUDITED POSITIVE LABELS - NOT A RELEASE BAR",
           "R7-W6 Step 4a (diagnostic)"),
    "4c": ("POST-AUDIT PRE-REGISTERED EVALUATION - OPERATING POINT PER Decision_Log §85",
           "R7-W6 Step 4c (post-audit, pre-registered)"),
}


def _stamp():
    """(warning, step-label) for the CURRENT run.

    Resolved at CALL time, not import time, so that `STEP` can stay below the EVAL
    banner where the authorship split puts it. Every caller (the exports here,
    step4a_stability.py, make_4b_sheet.py) runs after `STEP` is bound.
    """
    step = globals().get("STEP")
    if step not in _STAMPS:
        raise RuntimeError(
            f"STEP is {step!r}; expected one of {sorted(_STAMPS)}. An artifact cannot be "
            "stamped before the run declares which step it is."
        )
    return _STAMPS[step]


def stamped(payload: dict) -> dict:
    """Wrap an export payload so the provenance cannot be separated from the numbers."""
    warning, step_label = _stamp()
    return {"_warning": warning, "_step": step_label, **payload}

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
STEP = "4c"

# (1) One GLOBAL reporting threshold; per-section recall is a veto on that threshold,
#     never three separate thresholds. The floor is deliberately coarse because the
#     representative gate positives are only 46 / 28 / 21 by section before repair.
RECALL_DIAL = "global_with_per_section_veto"
PER_SECTION_RECALL_FLOOR = 0.90

# (1b) MODEL CONFIGURATION -- frozen for R7 by §85. Defined here with the other pins,
#      above the precondition check that reads it, rather than beside the sklearn call.
#      The Step-4a `C` grid is SENSITIVITY EVIDENCE ONLY: gate-slice AUC rose monotonically
#      across it (0.834 -> 0.923), and selecting on that would tune against the very
#      population the operating point is read from. Revisit only on genuinely new data.
MODEL_C = 1.0

# (2) WHICH ROWS THE CURVE IS MEASURED ON. §69 says gate and train are scored separately
#     and never pooled -- train was drawn deliberately hard/low-margin, so a pooled number
#     is not interpretable. But grouped CV over the whole deck is what gives the gate
#     enough negatives to fit at all.
#     At 4a: report gate (95/54) and pooled (191/137) SEPARATELY, never as one number.
#     At 4c: state which population the OPERATING POINT is read off, and if it is not
#     "gate", say why pooling is legitimate here when §69 says it is not.
CURVE_MEASURED_ON = "gate"   # train and pooled are reported diagnostics, never substitutes

# (3) RETIRED 2026-07-31 -- this pin's premise is gone.
#     It asked whether a MERGED-None curve sets the bar or only bounds it pending the
#     four-way split. The split landed (239/239, closed 07-30) and the §77 routing
#     contract above replaced the merged target, so the question it guarded is closed.
#     The live version of the same worry is NOT about the negatives any more -- it is
#     the unaudited POSITIVE class, which is what Step 4b exists to repair and what the
#     DIAGNOSTIC_STAMP announces. Same shape as score-vs-delete: the pin was guarding a
#     door that had already shut while the open one was behind it.
# MERGED_NONE_VERDICT = ...   # do not re-add; see R7_Scope Step 4b

# (4) THE STOPPING RULE. No invented minimum junk-rejection percentage: carry the point
#     that rejects the most known junk while clearing the section veto into the shadow
#     dry run. The dry run measures operational value; a failed run is localized before
#     anything is changed, and C is never tuned against that one issue.
#
#     ⚠️ THIS IS A PROSE RECORD, NOT A MECHANISM. Nothing executes it, and its presence
#     in the precondition check below proves only that somebody wrote it down. The steps
#     it describes are enforced by `section_safe_point()` (step 1), by §78's demote-never-
#     delete architecture (step 2), and by human discipline (steps 3-4). Do not read a
#     populated ITERATION_LADDER as evidence the ladder was followed.
ITERATION_LADDER = (
    "choose max gate-slice junk rejection subject to every section recall >= the floor",
    "carry that point into the shadow dry run; below-cutoff rows are demoted, never deleted",
    "if dry run fails, localize gate vs sectioning vs ranking from swap positions",
    "do not tune C on the dry-run issue; validate any changed system again",
)

# (5) THE FRESH-SET READINESS TRIGGER. The disagreement set is enriched, so its flip
#     count estimates no population rate. It answers only whether targeted repair is
#     still productive. Curve movement is descriptive: repair changes target/denominator,
#     so it is not a clean escalation statistic.
#
#     ⚠️ THE TWO 6s ARE INTENTIONALLY THE SAME NUMBER AND MEAN DIFFERENT ACTIONS.
#     The threshold does not escalate; the RESPONSE does, on the second occurrence:
#         first batch at >= 6   -> repair the flips, run ONE more targeted batch
#         second batch at >= 6  -> targeted sampling has stopped converging; stop
#                                  sampling and audit the whole remaining positive class
#     A single number with a state-dependent consequence is the point: a rate that stays
#     high after one repair round is evidence about the STRATEGY, not about the batch.
ESCALATION_TRIGGER = {
    "fresh_batch_size": 30,
    "proceed_max_consequential_flips": 5,
    "second_batch_at_or_above": 6,
    "full_audit_if_second_batch_at_or_above": 6,
    "new_systematic_failure": "pause_and_investigate",
    "curve_shift": "report_only",
}

# The §75 breadth stratum (R7_Scope Step 4, first stratum).
#
# RECOVERED, NOT AUTHORED (#120, 2026-08-02). The vocabulary below is the ORIGINAL §75
# pattern, recovered verbatim -- it is not a reconstruction and must not be "improved".
# Writing a fresh word list would silently redefine the stratum and make the 4c result
# unable to speak to §75's claim, which is the only thing this diagnostic exists to test.
#
# PROVENANCE. The regex never existed in a file: it was an inline argument to a
# `py -3 -c "..."` Bash call on 2026-07-27, so it has no blob, path or git object, and a
# full 190-revision repo search (incl. stashes, dangling objects, gitignored artifacts)
# correctly came up empty. Recovered from the Claude Code session transcript
# `~/.claude/projects/c--NA---Learning-NLAP/bd92a769-8345-4fef-a956-d822b3058c38.jsonl`,
# lines 151 and 172 -- two independent tool calls carrying a byte-identical string.
#
# VERIFIED against all three counts Decision_Log §75 records, reproduced exactly:
#     includables  10/182 (5.5%)   Nones  20/214 (9.3%)   raw pool  112/1805 (6.2%)
# Named anchors present: Italian Festival, Vaughan Asian Festival, Soul Food Caribbean
# Festival (flagged includables) and Shabbat Korach (flagged None).
#
# DIAGNOSTIC ONLY -- never a label, a feature, or a filter. It is applied AFTER scoring,
# to split finished results into two groups for reporting. No P(include) changes if this
# line is deleted. Its measured separation is only 1.7x and it flags keepers and rejects
# alike; that weakness is WHY it may not become a feature, and is harmless to a report.
#
# MIXED-CLASS BY CONSTRUCTION -- 10 editor-includables and 20 editor-Nones. Anything this
# pattern feeds must therefore report the two classes SEPARATELY. Pooling them produces a
# number that confounds correct keeper-survival with correct reject-rejection; see the
# block above stratum_report(). Frozen 2026-08-02 (#120), split 2026-08-03.
# Applied to `title + ' ' + description`, case-insensitive (matching the §75 measurement).
SINGLE_COMMUNITY_PATTERN = (
    r"\b(jewish|judaism|hanukkah|chanukah|shabbat|kosher|synagogue|muslim|islam|islamic|"
    r"ramadan|eid|halal|mosque|hindu|diwali|sikh|gurdwara|vaisakhi|buddhis|christian|"
    r"church|catholic|baptist|gospel|parish|indigenous|first nations|metis|inuit|powwow|"
    r"russian|ukrainian|polish|italian|portuguese|greek|persian|iranian|chinese|"
    r"lunar new year|korean|japanese|filipino|vietnamese|tamil|punjabi|indian|pakistani|"
    r"bangladesh|somali|nigerian|caribbean|jamaican|latino|latina|hispanic|mexican|"
    r"colombian|brazilian|spanish|french|german|turkish|arab|armenian|afghan|"
    r"black history|african)\b"
)

_PINS = {"RECALL_DIAL": RECALL_DIAL, "PER_SECTION_RECALL_FLOOR": PER_SECTION_RECALL_FLOOR,
         "CURVE_MEASURED_ON": CURVE_MEASURED_ON,
         "ITERATION_LADDER": ITERATION_LADDER, "ESCALATION_TRIGGER": ESCALATION_TRIGGER}

# Step 4b's answer key is the authoritative record of which events the editor has already
# judged. Step 4c's fresh set is defined against it, so its absence is a hard stop.
STEP4B_ANSWER_KEY = HERE / "eval" / "step4b_answer_key.json"

# THE RECONCILIATION ARTIFACT (#121). The answer key existing proves the SITTING happened.
# It proves nothing about whether the 11 NEVER corrections were mapped, written back to
# Airtable, and reflected in the labels this script loads -- and those are different
# events, separated by an editor mapping pass and a write.
#
# Why this guard exists: with SINGLE_COMMUNITY_PATTERN set (i.e. the moment #120 closes),
# every other precondition already passes TODAY, on unreconciled labels, and the routing
# tripwire does not fire either because EXPECTED_CURRENT_ROUTING_COUNTS still matches the
# pre-correction state exactly. #120 is regex archaeology with no dependency on #121, so
# it can easily land first. Without this check the only thing between an unreconciled run
# and a "POST-AUDIT PRE-REGISTERED EVALUATION"-stamped operating point is remembering the
# order -- which is the same class of failure as a stamp that says what it is not.
STEP4B_RECONCILIATION = HERE / "eval" / "step4b_reconciliation.json"

# Schema the artifact must satisfy. Presence is not enough: a hand-made stub that merely
# unblocks the guard would reproduce the defect this closes, so the fields that require
# the work to have ACTUALLY HAPPENED (the write-back row ids, the post-write counts, the
# source hashes) are validated for shape and non-emptiness rather than merely for
# existence. Written by the reconciliation step, never by this script.
_RECON_REQUIRED = {
    "sheet_path": str,           # which blind sheet was reconciled
    "sheet_sha256": str,         # ...and its exact content, so a later edit is detectable
    "answer_key_path": str,      # which sealed key it was reconciled against
    "answer_key_sha256": str,
    "audited_cv_groups": list,   # all 30, must match the key
    "verdicts": dict,            # row/position -> final KEEP | NEVER | UNCLEAR, all 30
    "applied_airtable_row_ids": list,   # the write-back actually performed
    "post_write_routing_counts": dict,  # §77 destinations AFTER the write
    "reconciled_at": str,        # ISO timestamp
}


# What the completed Step 4b sitting actually produced. These are FACTS about the
# sitting, not targets: 30 rows, 19 KEEP, 11 NEVER, 0 UNCLEAR. An artifact that disagrees
# is describing some other sitting.
STEP4B_SHEET = HERE.parent.parent / "docs" / "r7" / "R7_4b_PositiveClass_Blind_Sheet.md"
STEP4B_VERDICT_TOTALS = {"KEEP": 19, "NEVER": 11, "UNCLEAR": 0}
_VALID_VERDICTS = set(STEP4B_VERDICT_TOTALS)


def _verify_reconciliation_artifact():
    """Validate #121's artifact. Returns a list of problems (empty == good).

    Every check here is something a HAND-WRITTEN STUB would fail. That is the design
    goal: presence of the file must not be enough, or the guard becomes a formality that
    the person in a hurry satisfies with `{}` and a timestamp.
    """
    if not STEP4B_RECONCILIATION.exists():
        return [
            f"Step 4b reconciliation artifact not found at {STEP4B_RECONCILIATION}.\n"
            "      The sitting is complete (19 KEEP / 11 NEVER / 0 unresolved) but its\n"
            "      corrections have NOT been mapped to permanent reasons or written to\n"
            "      Airtable. Step 4c must not price a bar on labels the audit already\n"
            "      found wrong. Generate this artifact from the real reconciliation (#121)."
        ]
    try:
        art = json.loads(STEP4B_RECONCILIATION.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        return [f"{STEP4B_RECONCILIATION.name} is unreadable: {exc}"]
    if not isinstance(art, dict):
        return [f"{STEP4B_RECONCILIATION.name} must be a JSON object"]

    problems = []
    for field, kind in _RECON_REQUIRED.items():
        if field not in art:
            problems.append(f"reconciliation artifact is missing '{field}'")
        elif not isinstance(art[field], kind):
            problems.append(f"reconciliation '{field}' should be {kind.__name__}, "
                            f"got {type(art[field]).__name__}")
        elif not art[field]:
            problems.append(f"reconciliation '{field}' is empty -- an empty value here "
                            "means the step it records did not happen")
    if problems:
        return problems      # shape is wrong; cross-checks below would be noise

    # --- source identity: the artifact must describe THESE artifacts, not some others ---
    # Existence is checked BEFORE reading. A missing key used to skip its own hash check
    # silently, which meant the strongest identity check was the one that could vanish.
    if not STEP4B_ANSWER_KEY.exists():
        problems.append(f"answer key {STEP4B_ANSWER_KEY.name} is missing, so the "
                        "reconciliation cannot be verified against the sitting it claims")
        return problems
    key_sha = hashlib.sha256(STEP4B_ANSWER_KEY.read_bytes()).hexdigest()
    if art["answer_key_sha256"] != key_sha:
        problems.append("reconciliation was performed against a DIFFERENT answer key "
                        f"({art['answer_key_sha256'][:12]}... vs {key_sha[:12]}...)")

    if not STEP4B_SHEET.exists():
        problems.append(f"blind sheet {STEP4B_SHEET.name} is missing; its hash cannot "
                        "be verified")
    else:
        sheet_sha = hashlib.sha256(STEP4B_SHEET.read_bytes()).hexdigest()
        if art["sheet_sha256"] != sheet_sha:
            problems.append("reconciliation records a DIFFERENT blind sheet "
                            f"({art['sheet_sha256'][:12]}... vs {sheet_sha[:12]}...). "
                            "The sheet changed after reconciliation, or the wrong file "
                            "was hashed.")

    # --- the audited set must be EXACTLY the key's groups, not merely the right size ---
    key_entries = json.loads(STEP4B_ANSWER_KEY.read_text(encoding="utf-8")).get("key", [])
    want_groups = {int(e["cv_group"]) for e in key_entries if e.get("cv_group") is not None}
    try:
        got_groups = [int(g) for g in art["audited_cv_groups"]]
    except (TypeError, ValueError):
        got_groups = None
        problems.append("reconciliation 'audited_cv_groups' contains non-integer entries")
    if got_groups is not None:
        if len(got_groups) != len(set(got_groups)):
            dupes = sorted({g for g in got_groups if got_groups.count(g) > 1})
            problems.append(f"reconciliation 'audited_cv_groups' has duplicates: {dupes}")
        if set(got_groups) != want_groups:
            missing = sorted(want_groups - set(got_groups))
            extra = sorted(set(got_groups) - want_groups)
            problems.append(
                "reconciliation 'audited_cv_groups' is not the answer key's set"
                + (f"; missing {missing}" if missing else "")
                + (f"; unexpected {extra}" if extra else "")
            )

    # --- verdicts: valid tokens, right count, right totals -----------------------------
    verdicts = art["verdicts"]
    bad_tokens = sorted({v for v in verdicts.values()
                         if not isinstance(v, str) or v.upper() not in _VALID_VERDICTS},
                        key=str)
    if bad_tokens:
        problems.append(f"reconciliation 'verdicts' has invalid token(s): {bad_tokens[:5]}; "
                        f"expected one of {sorted(_VALID_VERDICTS)}")
    else:
        if len(verdicts) != len(key_entries):
            problems.append(f"reconciliation carries {len(verdicts)} verdicts; "
                            f"the answer key has {len(key_entries)} rows")
        tally = collections.Counter(v.upper() for v in verdicts.values())
        got = {k: tally.get(k, 0) for k in STEP4B_VERDICT_TOTALS}
        if got != STEP4B_VERDICT_TOTALS:
            problems.append(f"reconciliation verdict totals are {got}; the completed "
                            f"sitting was {STEP4B_VERDICT_TOTALS}")

    # --- the write-back: one id per NEVER correction, unique and non-blank -------------
    n_never = STEP4B_VERDICT_TOTALS["NEVER"]
    ids = art["applied_airtable_row_ids"]
    clean_ids = [i for i in ids if isinstance(i, str) and i.strip()]
    if len(clean_ids) != len(ids):
        problems.append("reconciliation 'applied_airtable_row_ids' contains blank or "
                        "non-string ids")
    elif len(set(clean_ids)) != len(clean_ids):
        problems.append("reconciliation 'applied_airtable_row_ids' contains duplicates")
    elif len(clean_ids) != n_never:
        problems.append(f"reconciliation applied {len(clean_ids)} Airtable row id(s); the "
                        f"sitting produced {n_never} NEVER corrections. A shorter list "
                        "means the write-back is incomplete.")

    # --- post-write routing counts -----------------------------------------------------
    # NOTE: these are NOT required to equal the live counts this script just computed.
    # Step 1c relabels `outcompeted` rows AFTER 4b's write, so the live counts move again
    # and legitimately differ from what the artifact recorded at write time. What IS
    # required is that they differ from the immutable pre-repair baseline -- otherwise the
    # artifact is claiming a write that changed nothing.
    counts = art["post_write_routing_counts"]
    missing_dest = sorted(set(PRE_REPAIR_ROUTING_COUNTS) - set(counts))
    extra_dest = sorted(set(counts) - set(PRE_REPAIR_ROUTING_COUNTS))
    if missing_dest or extra_dest:
        problems.append(
            "reconciliation 'post_write_routing_counts' keys are wrong"
            + (f"; missing {missing_dest}" if missing_dest else "")
            + (f"; unexpected {extra_dest}" if extra_dest else ""))
    elif any(not isinstance(v, int) or isinstance(v, bool) or v < 0
             for v in counts.values()):
        problems.append("reconciliation 'post_write_routing_counts' must be non-negative "
                        f"integers; got {counts}")
    else:
        want_total = sum(PRE_REPAIR_ROUTING_COUNTS.values())
        if sum(counts.values()) != want_total:
            problems.append(f"reconciliation 'post_write_routing_counts' totals "
                            f"{sum(counts.values())}; the embedded deck has {want_total} "
                            "rows and routing moves rows between destinations, never "
                            "creates or destroys them")
        elif counts == PRE_REPAIR_ROUTING_COUNTS:
            problems.append(
                "reconciliation 'post_write_routing_counts' are IDENTICAL to the "
                "pre-repair baseline. The sitting found 11 NEVER rows among current "
                "gate-positives; applying them must move these counts. This artifact "
                "records a write that changed nothing.")
    return problems


_REQUIRED_ESCALATION_KEYS = {
    "fresh_batch_size", "proceed_max_consequential_flips", "second_batch_at_or_above",
    "full_audit_if_second_batch_at_or_above", "new_systematic_failure", "curve_shift",
}


def _verify_4c_preconditions():
    """Behavioural check, not a None-check.

    The previous version tested `any(v is None ...)`. Once the pins were filled in, that
    condition became unsatisfiable -- the guard could never fire again and enforced
    nothing while still reading as rigour. This is §84's own generalizable rule applied
    to §84's own guard: a pre-commitment is a function of what the run is ALLOWED TO
    DECIDE. So each check below is something that can actually be false at run time.
    """
    problems = []
    if MODEL_C != 1.0:
        problems.append(f"MODEL_C is {MODEL_C}; §85 freezes C=1.0 with no R7 tuning")
    if RECALL_DIAL != "global_with_per_section_veto":
        problems.append(f"RECALL_DIAL is {RECALL_DIAL!r}; §85 fixes one global threshold "
                        "vetoed per section, never per-section thresholds")
    if CURVE_MEASURED_ON != "gate":
        problems.append(f"CURVE_MEASURED_ON is {CURVE_MEASURED_ON!r}; §85 gives the "
                        "representative gate slice sole authority over the operating point")
    if not (isinstance(PER_SECTION_RECALL_FLOOR, float)
            and 0.0 < PER_SECTION_RECALL_FLOOR < 1.0):
        problems.append(f"PER_SECTION_RECALL_FLOOR is {PER_SECTION_RECALL_FLOOR!r}; "
                        "expected a fraction strictly between 0 and 1")
    missing_keys = _REQUIRED_ESCALATION_KEYS - set(ESCALATION_TRIGGER or {})
    if missing_keys:
        problems.append(f"ESCALATION_TRIGGER is missing {sorted(missing_keys)}")
    if ESCALATION_TRIGGER.get("curve_shift") != "report_only":
        problems.append("ESCALATION_TRIGGER['curve_shift'] must stay 'report_only' -- §85 "
                        "makes 4a->4c curve movement descriptive, never a numeric trigger")
    if not ITERATION_LADDER:
        problems.append("ITERATION_LADDER is empty (prose record; write it before the run)")
    if SINGLE_COMMUNITY_PATTERN is None:
        problems.append(
            "SINGLE_COMMUNITY_PATTERN is unset -- R7_Scope Step 4 commits Step 4c to "
            "report keyword_positive_recall AND keyword_negative_rejection on the single-"
            "community stratum, reported separately (§75's un-park trigger is the negative "
            "cell). The vocabulary is editorial and must be authored, not inferred here."
        )
    if not STEP4B_ANSWER_KEY.exists():
        problems.append(
            f"Step 4b answer key not found at {STEP4B_ANSWER_KEY}. Step 4c's fresh set is "
            "DEFINED as 'excludes every group 4b audited'; without the key it is not fresh."
        )
    problems.extend(_verify_reconciliation_artifact())

    # BELT AND BRACES on the same failure. The artifact above records that a write
    # happened; this checks the labels THIS SCRIPT JUST LOADED actually moved.
    #
    # Compared against the IMMUTABLE PRE_REPAIR_ROUTING_COUNTS, deliberately -- not
    # against EXPECTED_CURRENT_ROUTING_COUNTS. Comparing against the maintained tripwire
    # would make this guard vacuous: that constant is edited to match reality whenever
    # labels move, so `_actual == EXPECTED_CURRENT` is true on every correct run and
    # proves nothing. Only a fixed historical baseline can evidence that the corrections
    # landed at all.
    if _actual == PRE_REPAIR_ROUTING_COUNTS:
        problems.append(
            "routing counts still equal the immutable PRE-REPAIR baseline "
            f"({PRE_REPAIR_ROUTING_COUNTS}).\n"
            "      Step 4b found 11 NEVER rows among current gate-positives; applying them\n"
            "      must move these counts. Unchanged counts at Step 4c mean the corrections\n"
            "      are unapplied. Update EXPECTED_CURRENT_ROUTING_COUNTS after the labels\n"
            "      move, deliberately, and record the change (#121). Never edit\n"
            "      PRE_REPAIR_ROUTING_COUNTS -- this check depends on it staying fixed."
        )
    if problems:
        raise SystemExit(
            "\nEVAL BLOCKED - Step 4c sets the release bar, so its preconditions are\n"
            "verified before the fit rather than asserted afterwards.\n\n"
            + "".join(f"  * {p}\n" for p in problems)
            + "\nThe plumbing ran; X / y / groups / aux columns are staged and row-aligned.\n"
        )


if STEP not in _STAMPS:
    raise SystemExit(f"\nSTEP is {STEP!r}; expected one of {sorted(_STAMPS)}.\n")

# --preflight: verify the STEP-4c CONTRACT, then stop without fitting.
#
# It runs _verify_4c_preconditions() REGARDLESS of the STEP pin, deliberately. Checking
# only when STEP is already "4c" would make the flag useless for its actual job: telling
# you whether 4c is ready to run on a day you are not setting the release bar. The
# alternative is flipping the pin to find out, which leaves a stamped operating point in
# the scrollback of a run that was never meant to produce one.
#
# The preconditions are the expensive-to-be-wrong part; the fit is cheap and repeatable.
_PREFLIGHT = "--preflight" in sys.argv
if STEP == "4c" or _PREFLIGHT:
    _verify_4c_preconditions()

if _PREFLIGHT:
    print("\n" + "=" * 78)
    print("PREFLIGHT ONLY — the Step-4c contract was verified in full.".center(78))
    print(f"(checked against STEP = {STEP!r}; the pin was not changed)".center(78))
    print("No fit ran; no scores, no threshold, no operating point exist.".center(78))
    print("=" * 78)
    raise SystemExit(0)

_warning, _step_label = _stamp()
print("\n" + "!" * 78)
print(_warning.center(78))
print(_step_label.center(78))
print("!" * 78)

if STEP == "4a":
    print("\nSTEP 4a -- diagnostic. Nothing below is pinned: report BOTH the global and"
          "\n  per-section recall, and report the gate slice and the pooled fit SEPARATELY."
          "\n  No operating point may be taken from this run. Set STEP = \"4c\" for that.")

# ARM 1 -- embeddings only (settled in earlier sessions). The aux columns staged above
# are NOT used here: adding them is a representation choice and therefore arm 2, yours.
from sklearn.linear_model import LogisticRegression      # noqa: E402
from sklearn.model_selection import GroupKFold, cross_val_predict  # noqa: E402
from sklearn.metrics import roc_auc_score                # noqa: E402

clf = LogisticRegression(max_iter=2000, C=MODEL_C)   # MODEL_C frozen with the pins above
cv = GroupKFold(n_splits=5)
p = cross_val_predict(clf, X, y, cv=cv, groups=groups, method="predict_proba")[:, 1]
print(f"\nout-of-fold P(include) via grouped 5-fold CV  (arm 1: embeddings only, C={MODEL_C})")


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

# =====================================================================================
# THE SECTION-SAFE OPERATING POINT (Decision_Log §85). Step 4c only.
# =====================================================================================
# The frozen policy is ONE GLOBAL THRESHOLD, vetoed unless EVERY represented section
# retains at least PER_SECTION_RECALL_FLOOR observed keeper recall. Among the thresholds
# that survive that veto, take the one rejecting the most known junk.
#
# WHY THIS IS A SEARCH AND NOT A TABLE LOOKUP. `curve()` above reports six GLOBAL recall
# targets. The section-safe point is a different object: junk rejection increases
# monotonically with the threshold and per-section recall decreases monotonically with
# it, so the answer is simply the HIGHEST threshold at which no section has yet dropped
# below the floor -- and that threshold generally is not one of the six display rows.
# Reading the operating point off that table would have been eyeballing.
#
# ⚠️ THIS POINT IS BOUNDARY-HUGGING BY CONSTRUCTION. It is deliberately the highest
# threshold that still clears the floor, chosen on the same gate slice whose numbers are
# then reported, so the binding section will sit just above the floor rather than
# comfortably above it. That is not a bug in the search -- it is what "maximum junk
# rejection subject to the veto" means -- but it is exactly why the shadow dry run is
# INDEPENDENT validation rather than confirmation. See §85.
def section_safe_point(mask, label, floor=None):
    """Highest threshold at which every represented section still clears `floor`.

    Reads PER_SECTION_RECALL_FLOOR by default; the parameter exists so the search can be
    unit-tested on synthetic arrays without mutating the frozen pin.
    """
    floor = PER_SECTION_RECALL_FLOOR if floor is None else floor
    pm, ym, sm = p[mask], y[mask], section[mask]
    n_pos, n_neg = int(ym.sum()), int((1 - ym).sum())
    if n_pos == 0 or n_neg == 0:
        raise SystemExit(f"{label}: not scoreable (pos={n_pos}, neg={n_neg})")

    present = [s for s in SECTIONS if ((ym == 1) & (sm == s)).sum()]
    if not present:
        raise SystemExit(f"{label}: no section has a positive denominator")

    def recalls(t):
        return {s: float((pm[(ym == 1) & (sm == s)] >= t).mean()) for s in present}

    # Search ALL unique observed scores, not the six display rows.
    #
    # WHY THERE IS NO "no threshold clears the floor" BRANCH. 0.0 is included as a
    # candidate, and every score satisfies `p >= 0.0`, so recall is 1.0 in every section
    # there and `survivors` can never be empty for any floor <= 1.0. A recall-safe
    # threshold ALWAYS exists; what can fail to exist is a recall-safe threshold that
    # rejects any junk. An earlier version raised SystemExit on an empty `survivors`,
    # which was unreachable code reading as rigour -- the same defect class as a pin that
    # can never fire. The real degenerate case is handled below, as a WARNING not a crash:
    # §85 sets no minimum junk-rejection percentage, so a section-safe point that rejects
    # zero junk is valid evidence and still advances to the shadow dry run.
    candidates = sorted(set(np.unique(pm).tolist()) | {0.0})
    survivors = [t for t in candidates if min(recalls(t).values()) >= floor]
    assert survivors, "unreachable: t=0.0 gives recall 1.0 in every section"
    t = max(survivors)
    rec = recalls(t)
    binding = [s for s in present if rec[s] == min(rec.values())]

    # --- assertions: the chosen point is what the contract says it is ------------------
    assert min(rec.values()) >= floor, "chosen point does not clear the section floor"
    higher = [c for c in candidates if c > t]
    assert all(min(recalls(c).values()) < floor for c in higher), \
        "a higher threshold also clears the floor -- the search is not maximal"
    for s in present:
        assert ((ym == 1) & (sm == s)).sum() > 0, f"{s} has an empty denominator"
    assert len(present) == len(SECTIONS), \
        f"expected all of {SECTIONS} represented; got {present}"

    lost = int((pm[ym == 1] < t).sum())
    rejected = int((pm[ym == 0] < t).sum())
    print(f"\n{'=' * 78}")
    print(f"SECTION-SAFE OPERATING POINT — {label}".center(78))
    print(f"{'=' * 78}")
    print(f"  policy        one global threshold, vetoed below {floor:.0%} recall in ANY section")
    print(f"  threshold     {t:.4f}")
    print(f"  keepers       {n_pos} total, {lost} below cutoff (demoted, never deleted — §78)")
    print(f"  known junk    {n_neg} total, {rejected} rejected ({rejected / n_neg:.1%})")
    print(f"  global recall {(n_pos - lost) / n_pos:.3f}")
    print("\n  section                    n   below cutoff   observed recall")
    for s in present:
        n_s = int(((ym == 1) & (sm == s)).sum())
        below = int((pm[(ym == 1) & (sm == s)] < t).sum())
        flag = "  <-- BINDING" if s in binding else ""
        print(f"  {s:24} {n_s:4}   {below:12}   {rec[s]:15.3f}{flag}")
    print(f"\n  binding section(s): {', '.join(binding)}")
    print("  ⚠️ boundary-hugging by construction: this is the HIGHEST threshold that still")
    print("     clears the floor on this same slice. The shadow dry run is the independent")
    print("     check, not a confirmation of this number. (§85)")

    # THE DEGENERATE CASE, reported not enforced. §85 sets no minimum junk-rejection
    # percentage on purpose, so this does NOT veto the point and does NOT crash: the
    # point is preserved and the failure ladder still carries it to the shadow dry run,
    # where swaps and editor time price operational value. What it does is refuse to let
    # "an operating point was selected" read as "the gate filters something".
    if rejected == 0:
        print()
        print("  " + "!" * 74)
        print("  ⚠️ DEGENERATE OPERATING POINT — the section veto binds before the gate")
        print("     rejects ANY known junk. This point provides no offline filtering value.")
        print("     It is still a valid §85 outcome and still advances to the shadow dry")
        print("     run (P(include) remains a ranking input; §78 demotes, never deletes).")
        print("     Read it as evidence about Fork C: if the gate cannot remove junk within")
        print("     the section floor, the load is on ranking, not filtering.")
        print("  " + "!" * 74)
    return {"threshold": float(t), "n_pos": n_pos, "n_neg": n_neg,
            "keepers_below_cutoff": lost, "junk_rejected": rejected,
            "junk_rejection_rate": rejected / n_neg,
            "global_recall": (n_pos - lost) / n_pos,
            "per_section": {s: {"n": int(((ym == 1) & (sm == s)).sum()),
                                "below_cutoff": int((pm[(ym == 1) & (sm == s)] < t).sum()),
                                "recall": rec[s]} for s in present},
            "binding_sections": binding, "floor": floor}


# The two committed stratum diagnostics (R7_Scope Step 4). Both ask the SAME question --
# does the representation already carry a rule, or does the rule need a hand-crafted
# feature column? -- and both are reported AT the chosen operating point, which is why
# they live at 4c rather than 4a.
#
# ⚠️ THE POOLED SURVIVAL RATE IS GONE, AND MUST NOT COME BACK. Until 2026-08-03 this
# function returned one `survival_rate` over the whole stratum. That number is INVALID
# for §75 and was caught before it was ever read.
#
# Why: the §75 stratum is MIXED-CLASS BY CONSTRUCTION. The regex flags 10 editor-
# includables and 20 editor-Nones, so *Italian Festival* and *Shabbat Korach* are both
# in it. A pooled "how many survive" confounds two OPPOSITE successes -- keepers
# correctly surviving and rejects correctly failing -- and moves in the same direction
# for both. It therefore cannot distinguish "the embedding is missing single-community
# rejects" (the thing §75 parked the flag on) from "the stratum's keepers are behaving
# exactly as they should." One number, two questions, no way to tell them apart.
#
# The split, per Ariel's 2026-08-03 decision:
#   keyword_positive_recall     share of regex-tagged EDITOR-POSITIVE rows surviving.
#   keyword_negative_rejection  share of regex-tagged EDITOR-NEGATIVE rows falling below
#                               the cutoff, read AGAINST the gate slice's overall
#                               negative-rejection rate.
#
# ONLY THE SECOND IS THE UN-PARK TEST. The first is the guard on the fix: §75 parked the
# flag precisely because the regex separates the two cases at only 1.7x and a filter
# built on it would delete measured keepers. If tagged negatives are under-rejected but
# tagged positives are surviving fine, a flag might earn its place; if BOTH sag, the
# regex is just finding hard rows and a flag would cost keepers.
#
# The B2B stratum is unaffected by the original defect -- being defined by the editor's
# own §77 reason tick it is ~all-negative, so its old pooled rate was already a negative-
# rejection rate. It reports through the same function; its positive cell is simply thin
# or empty, and prints as n/a rather than as a number nobody should read.
#
# Counts are printed alongside every percentage. At n_pos≈10 one event moves the recall
# figure ~10 points, which is the same reason §85 evaluates the veto in whole events.
def stratum_cells(scores, truth, stratum_mask, eval_mask, threshold):
    """The pure arithmetic of the split. No printing, no globals -- so it is testable.

    Returns None when the stratum is empty in this slice. Each cell is either None
    (no rows of that class) or (rate, hits, total) in WHOLE EVENTS as well as a rate.
    """
    m = stratum_mask & eval_mask
    if m.sum() == 0:
        return None
    pos_m, neg_m = m & (truth == 1), m & (truth == 0)
    base_pos, base_neg = eval_mask & (truth == 1), eval_mask & (truth == 0)

    def _rate(mask, survives):
        """Fraction of `mask` on the wanted side of the cutoff, or None when empty."""
        if mask.sum() == 0:
            return None
        hits = (scores[mask] >= threshold) if survives else (scores[mask] < threshold)
        return float(hits.mean()), int(hits.sum()), int(mask.sum())

    return {
        "n": int(m.sum()), "n_pos": int(pos_m.sum()), "n_neg": int(neg_m.sum()),
        "mean_p": float(scores[m].mean()),
        "kpr": _rate(pos_m, True),           # keyword_positive_recall
        "knr": _rate(neg_m, False),          # keyword_negative_rejection
        "slice_recall": _rate(base_pos, True),
        "slice_rejection": _rate(base_neg, False),
    }


# ------------------------------------------------------------------------------------
# THE REGRESSION CASE, asserted at import. This encodes the exact defect that was caught
# on 2026-08-03, so it cannot be reintroduced by someone "simplifying" the two cells back
# into one number.
#
# The fixture is a stratum behaving PERFECTLY: every tagged keeper survives, every tagged
# reject falls. The old pooled survival rate reports 10/30 = 33.3% -- which reads as a
# stratum being crushed, and is indistinguishable from the genuinely bad case where the
# embedding drops keepers. The split reports 100% / 100% and is unambiguous.
# ------------------------------------------------------------------------------------
_t_scores = np.array([0.9] * 10 + [0.1] * 20 + [0.8] * 5 + [0.2] * 15)
_t_truth = np.array([1] * 10 + [0] * 20 + [1] * 5 + [0] * 15)
_t_stratum = np.array([True] * 30 + [False] * 20)
_t_eval = np.ones(50, dtype=bool)
_t = stratum_cells(_t_scores, _t_truth, _t_stratum, _t_eval, 0.5)

assert _t["n"] == 30 and _t["n_pos"] == 10 and _t["n_neg"] == 20, _t
assert _t["kpr"] == (1.0, 10, 10), f"keyword_positive_recall broken: {_t['kpr']}"
assert _t["knr"] == (1.0, 20, 20), f"keyword_negative_rejection broken: {_t['knr']}"
# The whole point: the pooled number this replaced would have been 33.3% on this input.
assert abs(float((_t_scores[_t_stratum] >= 0.5).mean()) - 10 / 30) < 1e-9, (
    "the pooled survival rate on a PERFECTLY behaving mixed-class stratum is 33.3% -- "
    "that is why it was removed; never reintroduce it as the headline")
# An all-negative stratum (the B2B shape) must report n/a for recall, not 0.0.
_t_b2b = stratum_cells(_t_scores, _t_truth, np.array([False] * 10 + [True] * 20 + [False] * 20),
                       _t_eval, 0.5)
assert _t_b2b["kpr"] is None, "empty positive cell must be n/a, not a rate"
assert _t_b2b["knr"] == (1.0, 20, 20), _t_b2b["knr"]
del _t_scores, _t_truth, _t_stratum, _t_eval, _t, _t_b2b


def stratum_report(stratum_mask, eval_mask, threshold, label, reads):
    """Class-SEPARATED behaviour of one stratum at the chosen threshold.

    Never returns a pooled survival rate; see the comment block above for why.
    `reads` is {'positive': str, 'negative': str} -- the interpretation of each cell.
    """
    cells = stratum_cells(p, y, stratum_mask, eval_mask, threshold)
    if cells is None:
        print(f"\n  {label}: 0 rows in this slice — not evaluable.")
        return None

    kpr, knr = cells["kpr"], cells["knr"]
    slice_recall, slice_rejection = cells["slice_recall"], cells["slice_rejection"]

    out = {
        "n": cells["n"], "n_pos": cells["n_pos"], "n_neg": cells["n_neg"],
        "mean_p": cells["mean_p"],
        "keyword_positive_recall": kpr[0] if kpr else None,
        "keyword_positive_recall_counts": [kpr[1], kpr[2]] if kpr else None,
        "keyword_negative_rejection": knr[0] if knr else None,
        "keyword_negative_rejection_counts": [knr[1], knr[2]] if knr else None,
        "slice_positive_recall": slice_recall[0] if slice_recall else None,
        "slice_negative_rejection": slice_rejection[0] if slice_rejection else None,
    }
    # The un-park signal, pre-computed so nobody has to subtract two percentages by eye.
    out["negative_rejection_gap"] = (
        None if (knr is None or slice_rejection is None)
        else out["keyword_negative_rejection"] - out["slice_negative_rejection"]
    )

    def _fmt(cell, base, base_label):
        if cell is None:
            return "n/a (0 rows in this cell)"
        rate, hits, total = cell
        tail = "" if base is None else f"   (slice {base_label} {base[0]:.1%})"
        return f"{rate:.1%}  [{hits} of {total} events]{tail}"

    print(f"\n  {label}")
    print(f"    n={cells['n']} ({cells['n_pos']} pos / {cells['n_neg']} neg)   "
          f"mean P(include) {cells['mean_p']:.3f}")
    print(f"    keyword_positive_recall    : {_fmt(kpr, slice_recall, 'recall')}")
    print(f"      read: {reads['positive']}")
    print(f"    keyword_negative_rejection : {_fmt(knr, slice_rejection, 'rejection')}")
    print(f"      read: {reads['negative']}")
    if out["negative_rejection_gap"] is not None:
        gap = out["negative_rejection_gap"]
        n_neg = cells["n_neg"]
        # NO VERDICT IS PRINTED, DELIBERATELY. An earlier version of this line called any
        # gap < 0 "the un-park condition". That is a decision rule, and it was never made:
        # §85 pre-registers the recall veto BEFORE the numbers are seen, and nothing
        # equivalent has been pre-registered for this gap. Declaring a threshold here --
        # in the same run that first shows the number -- is exactly the post-hoc choosing
        # the pin discipline exists to prevent.
        #
        # It also cannot support one. At n_neg on the order of 20, one event moves the gap
        # ~5 points; at n_pos ~10, ~10 points. A small negative gap is indistinguishable
        # from noise, so "not evaluable at this n" is a live reading, not a fallback.
        step = 1.0 / n_neg if n_neg else float("nan")
        print(f"    gap vs slice negative-rejection: {gap:+.1%}   "
              f"(1 event = {step:.1%} at n_neg={n_neg})")
        print("      NO un-park verdict is asserted: the decisive gap was never "
              "pre-registered (§85 pattern). Decide the rule before reading the number.")
    return out


if STEP == "4c":
    _op = section_safe_point(slice_ == "gate", "GATE SLICE — the only representative population")

    print(f"\n{'=' * 78}")
    print("STRATUM DIAGNOSTICS AT THE CHOSEN POINT (R7_Scope Step 4)".center(78))
    print("=" * 78)

    # §75 breadth. Vocabulary is authored (the precondition check refuses to run without
    # it); the mechanism is here. Applied to title + cleaned description, the serve text.
    _text = np.array([
        f"{raw_by_url.get(r['url'], {}).get('title', '')} "
        f"{clean(raw_by_url.get(r['url'], {}).get('desc') or '')}"
        for r in rows_fit], dtype=object)
    _sc = re.compile(SINGLE_COMMUNITY_PATTERN, re.I)
    _single_community = np.array([bool(_sc.search(t)) for t in _text])
    _strata = {"single_community": stratum_report(
        _single_community, slice_ == "gate", _op["threshold"],
        "SINGLE-COMMUNITY STRATUM (§75 breadth un-park trigger)",
        {"positive":
            "guard on the fix, not the trigger. Near slice recall => a flag could be added "
            "without deleting keepers. Well below => a flag would cost measured keepers.",
         "negative":
            "THE UN-PARK TEST. Below the slice rate => the embedding misses single-community "
            "rejects, flag comes off the shelf. At or above => stays parked, §75 confirmed."})}

    # §76 prof-dev / B2B. Defined by the editor's own reason tick, so no invented
    # vocabulary. These are gate NEGATIVES: low scores mean the embedding carries the rule.
    _strata["b2b_profdev"] = stratum_report(
        is_b2b_reason, slice_ == "gate", _op["threshold"],
        "PROF-DEV / B2B STRATUM (§76 content-judgment rows)",
        {"positive":
            "expected empty — the §77 B2B tick routes to gate-negative. Populated => a row "
            "carries the tick AND a section; check the routing before reading this line.",
         "negative":
            "the live question here. At or above the slice rate => the embedding carries "
            "the rule, no flag column warranted. Under-rejected => a column earns its place."})

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


def audited_groups_from_4b():
    """Every CV group Step 4b already put in front of the editor.

    The answer key is the authoritative record. Groups are collected three ways because
    a group can appear under any of them: the representative's own `cv_group`, and -- for
    robustness against an older or hand-edited key that omits `cv_group` -- the group of
    any row listed in `duplicate_rows` or `variant_rows`. Excluding the representative
    alone would leave its twins selectable, which is the same "a CV group is not one
    editorial event" trap that produced the 4-slots-on-2-events bug.
    """
    if not STEP4B_ANSWER_KEY.exists():
        raise SystemExit(
            f"\nStep 4b answer key not found at {STEP4B_ANSWER_KEY}.\n"
            "Step 4c's disagreement set is DEFINED as 'excludes every group 4b audited'.\n"
            "Without the key there is no way to know what is fresh, and a set that merely\n"
            "looks fresh is worse than none: it would re-serve judged rows and read as\n"
            "saturation while testing nothing.\n"
        )
    key = json.loads(STEP4B_ANSWER_KEY.read_text(encoding="utf-8"))
    entries = key.get("key") or key.get("rows") or []
    if not entries:
        raise SystemExit(f"\n{STEP4B_ANSWER_KEY.name} carries no 'key'/'rows' entries.\n")

    group_of_row = {}
    for i in range(len(y)):
        group_of_row.setdefault(rows_fit[i]["row"], int(groups[i]))

    audited, unresolved = set(), []
    for e in entries:
        if e.get("cv_group") is not None:
            audited.add(int(e["cv_group"]))
        elif e.get("row") in group_of_row:
            audited.add(group_of_row[e["row"]])
        else:
            unresolved.append(e.get("row"))
        for extra in list(e.get("duplicate_rows") or []) + list(e.get("variant_rows") or []):
            r = extra.get("row") if isinstance(extra, dict) else extra
            if r in group_of_row:
                audited.add(group_of_row[r])
            else:
                unresolved.append(r)
    if unresolved:
        print(f"  note: {len(unresolved)} audited row(s) are not in the current fit set "
              f"(expected if 4b/1c moved labels): {unresolved[:10]}")
    print(f"  Step 4b audited {len(entries)} representatives -> {len(audited)} excluded CV groups")
    return audited


def top_disagreements(scores, n=N_DISAGREEMENTS, exclude_groups=frozenset()):
    """Lowest-scoring POSITIVES, one per CV group, with twins verified not assumed.

    `exclude_groups` makes Step 4c's set genuinely FRESH. Rows that SURVIVED 4b's
    re-judgment stay positive and stay low-scoring, so without this they would be
    re-selected almost wholesale -- and a fresh-set flip count computed on already-judged
    events flips at near-zero by construction and reads as saturation while testing
    nothing. Exclusion is by GROUP, never by row.
    """
    exclude_groups = {int(g) for g in exclude_groups}
    reps, seen = [], set()
    for i in np.argsort(scores):                    # ascending: most disagreed-with first
        if y[i] != 1 or int(groups[i]) in seen or int(groups[i]) in exclude_groups:
            continue
        seen.add(int(groups[i]))
        reps.append(int(i))
        if len(reps) == n:
            break

    if len(reps) < n:
        raise SystemExit(
            f"\nOnly {len(reps)} fresh unique CV groups available; {n} required.\n"
            f"({len(exclude_groups)} groups excluded as already audited.)\n"
            "The positive class has been exhausted by targeted sampling -- which is itself\n"
            "the §85 finding that targeted repair is done. Record it; do not shrink n.\n"
        )
    assert not (set(seen) & exclude_groups), "fresh set overlaps Step 4b's audited groups"

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


# -------------------------------------------------------------------------------------
# EXPORTS. Behind a __main__ guard, and on STEP-SPECIFIC paths.
#
# Two separate defects this closes:
#   * step4a_stability.py and make_4b_sheet.py both `import gate_step4a`, and the module
#     runs top-to-bottom on import (deliberately -- one loader, one routing contract, no
#     drift). With the write at module level, merely importing the module rewrote the
#     export. Reading a file must never be a side effect of importing the thing that
#     produced it.
#   * A single fixed path meant a 4c run would overwrite 4a's export -- destroying the
#     record of WHICH 30 events went to the editor, which is the very thing 4c's fresh
#     set is defined against. Provenance for a run cannot live in a file that the next
#     run silently replaces.
# -------------------------------------------------------------------------------------
EXPORTS = {"4a": HERE / "eval" / "step4a_disagreements.json",
           "4c": HERE / "eval" / "step4c_disagreements.json"}


def export_disagreements():
    """Build and write this STEP's disagreement set. Never called on import."""
    # Step 4a is the FIRST pass: nothing has been audited, so nothing is excluded.
    # Step 4c must exclude every group 4b already judged, or the set is not fresh.
    exclude = audited_groups_from_4b() if STEP == "4c" else frozenset()
    picked = top_disagreements(p, exclude_groups=exclude)
    assert not ({e["group"] for e in picked} & set(exclude)), \
        "Step 4c selected a group Step 4b already audited"

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

    collapsed = sum(len(e["twins"]) for e in picked)
    variants = sum(len(e["variants"]) for e in picked)
    out = EXPORTS[STEP]
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(stamped({
        "generated": CURRENT_PULL.name,
        "arm": f"embeddings only, C={MODEL_C}, grouped 5-fold CV",
        "n_fit": int(len(y)),
        "excluded_audited_groups": sorted(int(g) for g in exclude),
        "deduplicated_by": "cv_group (normalised title), VERIFIED against cleaned serve text. "
                           "duplicate_rows = same group AND identical text, one ruling covers "
                           "all. variant_rows = same group, DIFFERENT text -- judge separately, "
                           "do not inherit the representative's ruling.",
        "note": "Editor called these includable; the model scores them lowest. The sitting "
                "asks the RULE question ('is there a permanent reason you would never run "
                "this?'), never the preference question. Enriched for suspected errors -- "
                "it repairs, it does not estimate contamination.",
        "rows": disagreements,
    }), indent=2), encoding="utf-8")
    print(f"\nexported {len(disagreements)} unique-group disagreement positives -> "
          f"{out.relative_to(HERE)}")
    if exclude:
        print(f"  {len(exclude)} CV group(s) excluded as already audited in Step 4b "
              "-> this set is FRESH.")
    print(f"  {collapsed} duplicate row(s) collapsed (same group, identical serve text).")
    print(f"  {variants} variant row(s) share a group but NOT the text -> judged separately.")
    print("  (Enriched for errors: it repairs, it does not estimate.)")
    return disagreements


if __name__ == "__main__":
    export_disagreements()

# TODO(ariel): write the chosen operating point into R7_Scope.md as the bar, WITH its
#     provenance tag. Until that is written, the doc names no recall target.
#     (The §75 breadth diagnostic that used to sit here is now executable -- see
#     `stratum_report` above. It needs SINGLE_COMMUNITY_PATTERN, and STEP="4c" refuses
#     to run until that is authored.)
