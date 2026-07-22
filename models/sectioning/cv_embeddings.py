import json
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent

# --- plumbing (mine): load what embed_corpus.py already made ---
X = np.load(HERE / "corpora/embeddings_text-embedding-3-large.npy")    # (1126, 3072) the vectors
y = json.loads((HERE / "corpora/embeddings_labels.json").read_text())  # 1126 section labels, row-aligned

# ============ classifier + cross-validated per-class recall ============
from sklearn.model_selection import cross_val_predict
from sklearn.metrics import classification_report, recall_score
from sklearn.linear_model import LogisticRegression

# max_iter=1000     : ceiling on solver steps for ONE fit (lbfgs stops early when it
#                     converges, so this is just headroom). Kept sane, not huge, so a
#                     non-convergence warning still SURFACES instead of grinding silently.
# C=1.0             : inverse regularization strength (default). Low C = simpler/cautious
#                     model; high C = trusts the training data harder and can overfit.
#                     Start at default; only tune C if the baseline recall says it's needed.
# class_weight=None : classes are ~even (376/383/367), so "balanced" would barely move
#                     anything here. Left off.
clf = LogisticRegression(max_iter=1000, C=1, class_weight=None)

# recall vs precision (same numerator, different denominator) -- for Couples:
#   recall(Couples)    = (truly Couples AND predicted Couples) / (all truly Couples)
#                        "of all real Couples events, how many did the model find?"
#                        low recall = model MISSES real events -> silent gap in a section.
#   precision(Couples) = (truly Couples AND predicted Couples) / (all PREDICTED Couples)
#                        "of everything called Couples, how many really were?"
#                        low precision = model DUMPS junk into the section.
# Bar is recall: a missed event never reaches the newsletter -- that's the failure gated on.
#
# cross_val_predict: every event is predicted while it sits in the held-out fold, so
# y_pred is one label per event, row-aligned to y (NOT a fold score -- that's why it's
# the _predict sibling, not _score). Then read per-class, because the bar is per-class:
#   classification_report      -> eyeball precision/recall for all 3 sections (see WHICH fails)
#   recall_score(average=None) -> [recall per class]; .min() = the min-class number the
#                                 R7_Scope §3 bar (>=75%) actually gates on.
y_pred = cross_val_predict(clf, X, y, cv=5)
print(classification_report(y, y_pred))
print("min-class recall:", recall_score(y, y_pred, average=None).min())
