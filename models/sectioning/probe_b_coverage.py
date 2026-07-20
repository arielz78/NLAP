# Probe B — TF-IDF transfer probe (R7_Scope.md §3 Step 2; feeds open decision #1)
#
# ROLE (07-19): primary evidence for decision #1 is now the labeled gate slice —
# this probe ATTRIBUTES the raw-accuracy gap (missing vocabulary vs boundary
# confusion vs label noise). A Gate 1 pass is NOT "transfer proven"; a fail is
# decisive. Embeddings can fix missing-vocab; they cannot fix absent-signal.
#
# Pre-registered gates (locked 2026-07-16 — read the result against these
# BEFORE discussing it):
#   Gate 1 — weighted token coverage: >=85% pass · <70% kill TF-IDF ·
#            70-85% marginal -> per-source fallback (top-4 sources only).
#   Gate 2 — event blindness (% of raw events whose analyzed text contains ZERO
#            learned tokens): >20% kill. 07-19 addendum: a fail is PROVISIONAL —
#            blind events skew junk the reject filter eats; re-read over
#            includable events before killing (R7_Scope.md §3, 07-19 entry).
#
# Pinned spec (07-19, closed before first run — the last degrees of freedom):
#   1. Gate 1 is PER-CLASS: top-N by |coef_| within each class; weighted
#      coverage per class = sum(|w| of top-N tokens present in raw vocab) /
#      sum(|w| of top-N). Report all three + the MINIMUM; the min reads
#      against 85/70 (same spirit as "no class <75%"). Pooled top-N rejected:
#      sum-to-zero coefficients put a strong token (wine -2.0 F / +1.0 C /
#      +1.0 G) in all three lists — pooling counts it three times.
#   2. |coef_| ranking is semantically correct, not just spec: a negative
#      weight is a RULE-OUT lever (wine -2.0 = Families' strongest exclusion
#      signal); losing it from raw text is a real capability loss and must
#      count against coverage.
#   3. Print SIGNED coefficients in token lists (wine -2.0, playground +2.1)
#      so exclusion-defined classes read as design, not bugs.
#   4. N is a CURVE: 10 / 50 / 200 / 500 — stop where weighted coverage
#      flattens; that N is what the model actually leans on.
#   5. Gate 2 + diagnostics via vec.transform(raw_events): a row with zero
#      nonzero entries IS "zero learned tokens" (no hand-rolled set logic,
#      no tokenizer-mismatch bug surface); nonzero-count-per-row gives the
#      hit distribution for free.
#   6. Extra diagnostic: per-event hit-count distribution (median +
#      percentiles across the 1,805) — the shading between the binary gates;
#      1 hit passes Gate 2 but is barely readable. (Same quantity as the deck
#      build's vocab_hits.)
#
# Input: probe_b/raw_candidate_events.json — 1,805 events, `.text` = serve-time
# title + desc + cats (NOT raw_candidate_titles.json — titles-only undercounts
# by construction, see the 07-16 correction).

import json
import sys
from pathlib import Path # imports Path from the library that is pathlib.

# matplotlib is optional: the histogram below is exploratory, and plt.show()
# blocks until the window is closed. Run with --plot to see it.
PLOT = "--plot" in sys.argv
import numpy as np

# importing a script-style module (no functions, no __main__ guard) RUNS it top
# to bottom — so this line executes the whole fit (~seconds) and then hands us
# its variables: vec (the trained TfidfVectorizer) and clf (the trained
# LogisticRegression). All the 1506/1126/CV output at startup is that import.
from fit_section_classifier import vec, clf

# relative paths resolve from wherever Python was LAUNCHED (the working dir),
# not from where this .py file lives — so we anchor to __file__ (this script's
# own location, fixed forever). .resolve() = make absolute; .parent = go up one
# folder (an attribute, not a function — no parens). Three parents:
# models/sectioning/ -> models/ -> NLAP/.
ROOT = Path(__file__).resolve().parent.parent.parent
with open(ROOT / "models/sectioning/corpora/raw_candidate_events.json", encoding="utf-8") as f:
    raw_events = [e["text"] for e in json.load(f)]  # 1,805 strings of serve-time text (title+desc+cats)

# build_analyzer() hands us the vectorizer's OWN text-chopping function — same
# lowercasing, same stopword removal, same ngram_range=(1,2) set at training.
# analyzer(one_string) -> list of tokens, unigrams then bigrams
# ("wine tasting" is ONE token). Using .split() instead would lose every bigram
# and fake a Gate 1 failure.
analyzer = vec.build_analyzer()

# BLOCK 1 — Gate 1's instrument: the raw-side vocabulary.
# One set of every UNIQUE token appearing anywhere in the 1,805 events (a set
# because Gate 1 only asks "does token X exist out there at all" — one copy is
# enough, and the set eats duplicates for free; .update() pours a whole list in).
# Result: 45,652 — the raw world speaks ~17x more words than the model's 2,692.
# Fine: the probe question is the other direction — do the model's words live
# INSIDE raw's 45,652?
raw_vocab = set()
for event_text in raw_events:
    raw_vocab.update(analyzer(event_text))

print(len(raw_vocab))

# BLOCK 2 — Gate 2's instrument: the event×token matrix.
# transform VECTORIZES, it does not classify (clf.predict does that; unused
# here): each event-string -> one row of numbers, one column per LEARNED token
# (2,692 — never the 45,652), cell = that token's TF-IDF weight in that event.
# transform (not fit_transform!): fit_transform would RE-learn the vocabulary
# from raw, silently changing what the columns mean. Words the model never
# learned get dropped silently — no column, no warning. An event whose words
# are ALL unknown becomes an all-zeros row: that row IS a blind event (Gate 2).
# Stored sparse: only nonzero cells kept, as (row, col) value coordinates —
# which is why print(X_raw) shows coordinates, not a 1,805 x 2,692 grid of zeros.
X_raw = vec.transform(raw_events)

print(X_raw.shape)  # expect (1805, 2692): 1,805 events x 2,692 learned tokens

# ============================================================================
# BLOCK 3 — GATE 2 + hit-count distribution  ←  YOU ARE HERE
# TODO(ariel): 1) per-row count of stored (nonzero) entries in X_raw
#              2) blind = rows where that count == 0 -> print count and % of
#                 1,805 vs the 20% kill line (provisional on fail — addendum)
#              3) hit distribution: median + percentiles of the per-row counts

# getnnz = "get Number of NonZeros" (nnz = sparse-matrix shorthand; the matrix
# only STORES nonzero cells, so nonzeros = stored entries). axis=1 = per row.
# So: for each event, how many words the model knows -> 1,805 counts.
# The library does the million-cell loop; we only loop over its answers.
# A 0 in this array = a blind event; Gate 2 = how many 0s are in here.
#
# WORKED EXAMPLES (indexing starts at 0 — [3] is the FOURTH event):
#   hits           -> [12, 5, 0, 10, ...]  1,805 counts, one per event
#   hits[3]        -> 10   = the 4th event has 10 model-known words
#   hits[2]        -> 0    = the 3rd event is BLIND (no known words at all)
#   hits[:10]      -> the first ten counts
# Same [ ] rule everywhere — "first item of whatever is directly to my left":
#   raw_events[0]  -> event 0's TEXT (a string)
#   analyzer(raw_events[0]) -> event 0 chopped into tokens (a list of strings)
#   X_raw[0]       -> event 0's ROW of the matrix (its nonzero cells)
#   X_raw.shape    -> the sticky note on the cover: (1805, 2692)
#   X_raw.shape[0] -> 1805 (first number ON the sticky note = row count)
hits = X_raw.getnnz(axis=1)

zerohits = 0
for h in hits:
    if h == 0:
        zerohits += 1
print(zerohits, zerohits/ 1805 * 100)

if PLOT:
    import matplotlib.pyplot as plt  # not in requirements.txt — pip install matplotlib
    plt.hist(hits, bins=50)
    plt.xlabel("known-token hits per event")
    plt.show()
# ============================================================================

# ============================================================================
# BLOCK 4 — GATE 1: per-class weighted coverage (pinned spec #1-#4)
# Written by Claude 2026-07-20 under explicit override (B — Ariel drives-later
# review, time crunch) — see Execution_Log for the authorship-split decision.
feature_names = vec.get_feature_names_out()
classes = clf.classes_
VOCAB_SIZE = len(feature_names)  # the model's whole learned vocabulary — the hard
                                  # ceiling for N; nothing exists past this point
Ns = (10, 50, 200, 500, VOCAB_SIZE)

# 07-20 addition (Ariel's question: "a lot of these can be junk no?"): coverage
# alone can't tell you whether a given N is measuring the model's real behavior
# or an arbitrary truncation. weight_capture = what fraction of this class's
# TOTAL |coef_| mass the top-N accounts for. If coverage is high but weight
# capture is low, the read is optimistic — most of the model's actual decision
# weight lives outside the N you checked.
print("\n=== GATE 1: per-class weighted token coverage ===")
per_class_curve = {}  # class -> {N: coverage}
per_class_weight_capture = {}  # class -> {N: fraction of total |coef_| mass}
for ci, cls in enumerate(classes):
    coefs = clf.coef_[ci]                      # this class's 2,692 signed weights
    order = np.argsort(-np.abs(coefs))          # rank by |coef_|, descending — sum-to-zero
                                                 # means signed argsort would miss rule-out levers
    total_class_weight = np.abs(coefs).sum()
    print(f"\nClass: {cls}")
    per_class_curve[cls] = {}
    per_class_weight_capture[cls] = {}
    for n in Ns:
        top_idx = order[:n]
        top_weights = np.abs(coefs[top_idx])
        present = np.array([feature_names[i] in raw_vocab for i in top_idx])
        covered = top_weights[present].sum()
        total_topn = top_weights.sum()
        coverage = covered / total_topn if total_topn > 0 else 0.0
        weight_capture = total_topn / total_class_weight
        per_class_curve[cls][n] = coverage
        per_class_weight_capture[cls][n] = weight_capture
        print(f"  N={n:>5}: weighted coverage = {coverage*100:5.1f}%   "
              f"(top-N holds {weight_capture*100:5.1f}% of this class's total weight)")
    top20 = order[:20]
    signed = ", ".join(f"{feature_names[i]} {coefs[i]:+.2f}" for i in top20)
    print(f"  top-20 tokens (signed): {signed}")

print("\n--- cross-class MINIMUM per N (this is what reads against 85/70) ---")
gate1_min_curve = {}
for n in Ns:
    m = min(per_class_curve[cls][n] for cls in classes)
    gate1_min_curve[n] = m
    print(f"  N={n:>5}: min-class coverage = {m*100:5.1f}%")
# ============================================================================

# ============================================================================
# BLOCK 5 — VERDICTS
# Written by Claude 2026-07-20 under explicit override (B) — verbatim
# pre-registered thresholds, no rationalization of a marginal number.
print("\n=== VERDICTS ===")


def gate1_call(coverage):
    if coverage >= 0.85:
        return "PASS"
    elif coverage < 0.70:
        return "KILL TF-IDF"
    return "MARGINAL -> run per-source fallback (top-4 sources)"


# N=500 read: practical-sized top-N, but only holds ~44-45% of any class's
# total |coef_| weight (07-20 finding) -- optimistic, not the real answer.
gate1_500 = gate1_min_curve[500]
print(f"Gate 1 @ N=500 (min-class coverage = {gate1_500*100:.1f}%, "
      f"~45% of model weight): {gate1_call(gate1_500)} -- PARTIAL READ, see ceiling below")

# N=VOCAB_SIZE: the only N with no truncation -- holds 100% of every class's
# weight by construction. This is the number Gate 1's threshold was written
# against, not the N=500 approximation.
gate1_ceiling = gate1_min_curve[VOCAB_SIZE]
print(f"Gate 1 @ N={VOCAB_SIZE} (full vocab, min-class coverage = {gate1_ceiling*100:.1f}%, "
      f"100% of model weight): {gate1_call(gate1_ceiling)}")

blind_pct = zerohits / len(raw_events) * 100
if blind_pct > 20:
    gate2_verdict = "KILL (provisional -- re-read over includable events before acting, 07-19 addendum)"
else:
    gate2_verdict = "PASS"
print(f"Gate 2 (event blindness = {blind_pct:.2f}%, {zerohits}/{len(raw_events)}): {gate2_verdict}")
# ============================================================================
