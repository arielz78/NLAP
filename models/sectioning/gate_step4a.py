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
  # The negatives here are the MERGED None (225 rows), not `Wrong fit`.      #
  # The four-way NoneType split (§75) is 12 of 239 done, so the split does   #
  # not exist yet at scale and cannot be used. Step 4 specifies `Wrong fit`  #
  # as the gate's negatives, with `Outcompeted` WITHHELD (it is a property   #
  # of the week, not the event) and `Rule-break` routed to Stage 0.          #
  #                                                                          #
  # Consequence: this curve is a PROVISIONAL pricing and it will move when   #
  # the split lands. It moves in BOTH directions and they do not cancel --   #
  #   * Rule-break negatives are trivially separable -> flatter the gate     #
  #   * Outcompeted negatives are genuinely includable events labelled None  #
  #     -> the gate is being scored as wrong for keeping good events         #
  # Per the 07-26 standing caution: a number without its provenance may be   #
  # quoted as context, never as a bar. Tag anything that leaves here with    #
  # (n=416, merged-None negatives, measured YYYY-MM-DD, grouped 5-fold CV).  #
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

HERE = Path(__file__).resolve().parent
CORPORA = HERE / "corpora"
DECK = HERE / "deck"

MODEL = "voyage-4-large"            # §71; must match the cached manifests or the head is
ARM = "nocats"                      # fit in one space and served in another

# --- deck-pull field ids: the Airtable export keys cells by field id, not by name ---
F_SECTION = "fld8YycTYbx63EC22"     # editor's label: Families / Couples / Golden / None
F_ROW = "fldwjfVY5pN1qajFj"         # join key -> transfer_rows.json
F_BATCH = "fldDymraKt7oQxdBv"       # which labelling sitting the row came from
F_NOTE = "fld7p5LjFLTcU9hCP"        # editor free-text reasoning (73 rows; qualitative only)

SECTIONS = ("For Families", "For Couples", "For Golden Age Readers")
LABEL_MAP = {"Families": "For Families", "Couples": "For Couples",
             "Golden": "For Golden Age Readers", "None": "None"}

# The newest pull. transfer_rows.json was built from the 07-20 pull, so the labels baked
# into it are 6 days stale; this file is the current truth and the drift is reported below
# rather than silently applied.
CURRENT_PULL = DECK / "r7_label_deck_raw_pull_2026-07-26.json"

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

current, batch_of, note_of = {}, {}, {}
for rec in pull:
    c = rec["cellValuesByFieldId"]
    row = c.get(F_ROW)
    sec = c.get(F_SECTION)
    if row is None:
        continue
    if isinstance(sec, dict):
        current[row] = LABEL_MAP.get(sec["name"], sec["name"])
    if isinstance(c.get(F_BATCH), dict):
        batch_of[row] = c[F_BATCH]["name"]
    if c.get(F_NOTE):
        note_of[row] = c[F_NOTE]

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
# y = 1 (include) for any of the 3 sections, 0 (None) otherwise. This is the ONLY place the
# merged-None simplification enters, and it is the thing the header banner is about.
y = np.array([1 if lab in SECTIONS else 0 for lab in labels], dtype=int)

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

# ============================================================
# PART 4 — the staging report. Everything the eval needs to know about its own inputs
# BEFORE a number exists, so no surprise gets read as a finding later.
# ============================================================
print(f"\ntarget: {int(y.sum())} include / {int((1 - y).sum())} None"
      f"  (base rate {y.mean():.1%} includable)")
print(f"groups: {len(set(groups.tolist()))} distinct for {len(rows)} rows"
      f"  |  {int(is_pair.sum())} PAIR repeat rows -> {len(rows) - len(set(groups.tolist()))} collisions absorbed")

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
full_deck_none = sum(1 for r in pull
                     if isinstance(r["cellValuesByFieldId"].get(F_SECTION), dict)
                     and r["cellValuesByFieldId"][F_SECTION]["name"] == "None")
print(f"\ncoverage: the full deck has {len(current)} labelled rows ({full_deck_none} None);"
      f" {len(rows)} are embedded here.")
print(f"  -> {len(current) - len(rows)} labelled rows are NOT in this fit"
      f" (no raw text to build the §70 serve recipe from).")
print("  -> the #108 AllEvents prose backfill is NOT applied to these vectors."
      " Re-embedding after that call lands will move every AllEvents row.")

# =====================================================================================
# ================================  EVAL — AUTHORED CORE  ==============================
# =====================================================================================
# STOP. The plumbing above is done: X, y, groups, and the aux columns are in memory and
# row-aligned. Everything below is yours.
#
# Same discipline as transfer_test.py: the scoring rules are PINNED BLIND -- committed
# here BEFORE you fit and see a single number. Step 4a is the step most exposed to this,
# because it SETS the bar rather than testing against one: if you choose the definition
# of "recall" after seeing which section sags, you have chosen the definition that
# flatters the model. The guard below refuses to run until all four are set.

# (1) WHICH RECALL IS THE DIAL -- one global keeper-recall number, or a per-section floor?
#     R7_Scope Step 4 argues for a floor: "losing 67 events at random is survivable,
#     losing 67 that are all Golden Age library programs is not." Pin it before you see
#     which section sags, or the choice is post-hoc.
RECALL_DIAL = None            # TODO(ariel): "global" | "per_section_floor"

# (2) WHICH ROWS THE CURVE IS MEASURED ON. §69 says gate and train are scored separately
#     and never pooled -- train was drawn deliberately hard/low-margin, so a pooled number
#     is not interpretable. But grouped CV over the whole deck is what gives the gate
#     enough negatives to fit at all. State which population the OPERATING POINT is read
#     off, and if it is not "gate", say why pooling is legitimate here when §69 says it
#     is not.
CURVE_MEASURED_ON = None      # TODO(ariel): "gate" | "all_grouped_cv" | "both_reported"

# (3) WHAT THIS CURVE IS ALLOWED TO DECIDE. The negatives are merged None, not `Wrong fit`
#     (see the header banner). Does the number that comes out set the release bar, or only
#     bound it pending the four-way split? Answering "sets it" means committing that the
#     split will not move the curve -- which is a claim, and one nobody has evidence for.
MERGED_NONE_VERDICT = None    # TODO(ariel): "sets_the_bar" | "bounds_it_pending_split"

# (4) THE STOPPING RULE. If no threshold gives an acceptable recall/junk trade, what
#     happens -- in order, committed before the number, so a bad curve does not become
#     motivated tuning. (Fork C is one of the legitimate outcomes here: "the gate is not
#     the win, ranking is" is a finding, not a failure.)
ITERATION_LADDER = None       # TODO(ariel): list[str]

if None in (RECALL_DIAL, CURVE_MEASURED_ON, MERGED_NONE_VERDICT, ITERATION_LADDER):
    raise SystemExit(
        "\nEVAL BLOCKED - pin the four blind pre-commitments above before scoring.\n"
        "The plumbing ran; X / y / groups / aux columns are staged and row-aligned.\n"
        "This guard is deliberate: Step 4a SETS the bar, so the rule is committed\n"
        "before the number or the bar is just the number wearing a bar's clothes.\n"
    )

# --- from here down is yours to write ---
#
# TODO(ariel): fit the binary gate. LogisticRegression on X with y; get OUT-OF-FOLD
#     probabilities via cross_val_predict(..., method="predict_proba", cv=GroupKFold)
#     passing `groups` -- in-sample probabilities would price a curve the gate cannot
#     reproduce on unseen events, which is the exact failure the 0.774 -> 0.61 drop was.
#
# TODO(ariel): sweep the threshold across the full range and build the curve:
#     keeper recall (y==1 kept) vs junk rejection (y==0 dropped). Anchor it against the
#     two measured points from the fresh-lens review: 0.95 recall -> 43% junk rejected,
#     0.90 -> 55%. If your curve disagrees with those, that is a finding about one of the
#     two setups, not a rounding difference -- chase it before reading anything else.
#
# TODO(ariel): report per-section keeper recall at each operating point, not just global.
#     The failure that matters is a class going dark. Denominators are printed above and
#     they are small (Golden ~55) -- put a number on how few events move a section's
#     recall by 10 points before you trust any per-section reading.
#
# TODO(ariel): price the last three points. How many EVENTS separate 0.95 from 0.98?
#     R7_Scope: with ~211 positives a 0.98 threshold is set by roughly 4 events. Make the
#     cost visible instead of assumed -- 0.98 entered the docs unmeasured and this is the
#     step that retires it or earns it.
#
# TODO(ariel): calibration check before trusting any threshold. The gate's P(include) is
#     also the interim ranking score (final = P(include) x P(section)), so a miscalibrated
#     probability breaks ranking as well as the gate.
#
# TODO(ariel): the breadth diagnostic (§75 un-park trigger, R7_Scope Step 4). Report gate
#     recall on the single-community stratum. If those events systematically SURVIVE, the
#     embedding is not carrying breadth and the flag comes off the shelf; if they are
#     rejected at base rate or better, the flag stays parked and §75 is confirmed.
#     Either result is a finding. This is the check, not a formality.
#
# TODO(ariel): write the chosen operating point into R7_Scope.md as the bar, WITH its
#     provenance tag. Until that is written, the doc names no recall target.
