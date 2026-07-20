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
from pathlib import Path # imports Path from the library that is pathlib.

import matplotlib.pyplot as plt

# importing a script-style module (no functions, no __main__ guard) RUNS it top
# to bottom — so this line executes the whole fit (~seconds) and then hands us
# its variables: vec (the trained TfidfVectorizer) and clf (the trained
# LogisticRegression). All the 1506/1126/CV output at startup is that import.
from fit_section_classifier import vec, clf

# relative paths resolve from wherever Python was LAUNCHED (the working dir),
# not from where this .py file lives — so we anchor to __file__ (this script's
# own location, fixed forever). .resolve() = make absolute; .parent = go up one
# folder (an attribute, not a function — no parens). Two parents: eval/ -> NLAP/.
ROOT = Path(__file__).resolve().parent.parent
with open(ROOT / "eval/probe_b/raw_candidate_events.json", encoding="utf-8") as f:
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

plt.hist(hits, bins=50)
plt.xlabel("known-token hits per event")
plt.show()
# ============================================================================

# ============================================================================
# BLOCK 4 — GATE 1: per-class weighted coverage (pinned spec #1-#4)
# TODO(ariel): for each class, for N in (10, 50, 200, 500): top-N tokens by
#   |coef_| -> weighted coverage = sum(|w| of top-N present in raw_vocab) /
#   sum(|w| of top-N). Print N-curve per class + the min; signed coefs in lists.


# ============================================================================

# ============================================================================
# BLOCK 5 — VERDICTS
# TODO(ariel): print verdict lines, verbatim thresholds: Gate 1 min-class
#   coverage vs 85/70; Gate 2 vs 20% (provisional on fail — see addendum above).
# ============================================================================
