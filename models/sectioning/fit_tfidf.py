import json # this loads a json module so that you can load json docs and script turns the json into python objects
from pathlib import Path # imports Path from the library that is pathlib.
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
history = json.loads((ROOT / "data/beehiiv/issue_history.json").read_text(encoding="utf-8"))

row = []
for issue in history:
    # im trying to get all the issues and get out the 4 main pieces of information
    # ie in each
    #  event, there is a displayTitle, section, description — date lives on the ISSUE
    # "events" is the only issue key holding a LIST — the other three (date, subject, slug)
    # are strings, and you can't loop over those. Dict lookup is exact + case-sensitive:
    # "Events" or "event" would fail. Same reason it's displayTitle, not title.
    date = issue["date"]  # one per issue -> plain assignment. looping a string yields characters.
    for event in issue["events"]:
        row.append({
            "displayTitle": event["displayTitle"],
            "section": event["section"],
            "description": event["description"],
            "date": date,  # every event in this issue shares the issue's date
        })

# KEEP is the 3-class whitelist. Local Aroma is deliberately absent, not forgotten:
# it arrives via a separate intake that never touches the scraped candidate pool, so the
# classifier must never be able to output it. Dropping it is scope, not tuning. (07-16 call.)
KEEP = ("For Families", "For Couples", "For Golden Age Readers")

# Two lists, built in ONE pass, appended together on every surviving row.
# That's the contract the fit depends on: texts[i] is described by labels[i].
# Two separate loops would drift the moment one of them skips a row the other keeps.
texts = []
labels = []
for r in row:
    if r["section"] not in KEEP:
        continue  # skip Local Aroma; `continue` = abandon this row, go to the next one
    # `or ""` turns a missing description into an empty string instead of crashing:
    # "Storytime" + " " + None is a TypeError. Empty string is the right default here
    # (NOT dropping the row) because ~47% of production candidates arrive with no
    # description — training on title-only rows is what makes the model survive them.
    desc = r["description"] or ""
    texts.append(r["displayTitle"] + " " + desc)
    labels.append(r["section"])

print(len(row))            # 1506 — every published event, all four sections
print(len(texts))          # 1126 — the 3-class subset
print(len(texts) == len(labels))  # True, or the alignment contract is already broken
print(Counter(labels))     # 376 / 383 / 367
print(texts[0])

vec = TfidfVectorizer(ngram_range=(1,2), min_df=2, sublinear_tf=True, stop_words="english")     # 1. create the translator
X = vec.fit_transform(texts)              # 2. learn vocab + convert to numbers
clf = LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced")  # 3. create the decider (C=4.0 = locked config; reproduces the 77%/78.68% baseline)
clf.fit(X, labels)                        # 4. learn the boundaries
print(X.shape)
print(clf.score(X, labels))

scores = cross_val_score(clf, X, labels, cv=5)
print(scores)              # the 5 fold scores
print(np.mean(scores))     # the honest number — should land near 0.77


words = vec.get_feature_names_out()   # the 2692 vocabulary words, in coef_ column order

# one pass per class. i picks ONE row of coef_ each loop -> your working 1-row logic, x3.
for i in range(len(clf.classes_)):
    weights = clf.coef_[i]            # this class's 2692 word-weights (1D row)
    order = weights.argsort()         # positions, low weight -> high
    top = order[-10:][::-1]           # last 10 = highest, reversed so #1 is first
    print(clf.classes_[i])            # which section this row is
    print(words[top])                 # its top 10 pull-words
    print()