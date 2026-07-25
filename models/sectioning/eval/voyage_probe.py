"""
voyage_probe.py — THROWAWAY. Does voyage-4-large beat text-embedding-3-large on the two
tests we already run? Nothing here is a new measurement: both tests are copied verbatim
from cv_embeddings.py and transfer_test.py so the only variable is the representation.

Deliberately does NOT touch the real scripts. §71 still pins text-embedding-3-large; if
Voyage wins we re-pin the decision and swap for real, and if it doesn't we delete this file.

Test 1 — internal CV : 5-fold on the 1,126 published blurbs, min-class recall. (0.774)
Test 2 — transfer    : fit on the 1,126, score the gate slice's includables (PAIR-deduped),
                       per-class recall on the §70 nocats arm. (0.861 F / 0.632 C / 0.545 G)

Both baselines are re-read live from the cached OpenAI .npy files, not quoted from the
docs — so the comparison can't drift from a stale number in a markdown file.

Run:
    ../../.venv/Scripts/python.exe eval/voyage_probe.py            # from models/sectioning
    ../../.venv/Scripts/python.exe eval/voyage_probe.py --dim 2048
    ../../.venv/Scripts/python.exe eval/voyage_probe.py --force    # ignore the voyage cache

Needs VOYAGE_API_KEY in NLAP_Airtable.env.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")   # Windows console is cp1252 -> chokes on em-dashes
import json
import csv
import re
import html
import hashlib
import argparse
from pathlib import Path
from collections import Counter

import numpy as np
from dotenv import load_dotenv
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_predict
from sklearn.metrics import recall_score

HERE    = Path(__file__).resolve().parent      # models/sectioning/eval
SECT    = HERE.parent                          # models/sectioning
ROOT    = SECT.parent.parent                   # repo root
CORPORA = SECT / "corpora"

BASELINE = "text-embedding-3-large"            # §71 incumbent
CHALLENGER = "voyage-4-large"

ap = argparse.ArgumentParser()
ap.add_argument("--dim", type=int, default=None,
                help="voyage output_dimension: 256/512/1024(default)/2048. "
                     "TODO(ariel): 2048 is the one knob worth a second run — the 4-series is "
                     "Matryoshka, so 2048 is a strictly wider view of the same space, not a "
                     "different model. 1024 vs OpenAI's 3072 is the like-for-like default.")
ap.add_argument("--force", action="store_true")
args = ap.parse_args()

# input_type stays None ON PURPOSE. "query"/"document" prepend an English retrieval
# instruction to every input ("Represent the document for retrieval: "). That tunes the
# space for asymmetric search; ours is symmetric classification, so it would inject a
# constant string into all 1,542 rows for no benefit.
INPUT_TYPE = None
BATCH = 100          # voyage caps at 1,000 texts and 120K tokens/request for -large; not close


# ============================================================
# EMBEDDING — voyage, content-hash cached so re-runs are instant
# ============================================================
def vembed(texts, stem, force=False):
    import voyageai
    tag = CHALLENGER + (f"-{args.dim}d" if args.dim else "")
    xp = CORPORA / f"{stem}_{tag}.npy"
    mp = CORPORA / f"{stem}_{tag}_manifest.json"
    digest = hashlib.sha256("\x00".join(texts).encode("utf-8")).hexdigest()

    if xp.exists() and mp.exists() and not force:
        m = json.loads(mp.read_text(encoding="utf-8"))
        if m.get("sha256") == digest and m.get("n") == len(texts):
            X = np.load(xp)
            print(f"  cache HIT  {xp.name}  {X.shape}")
            return X

    load_dotenv(ROOT / "NLAP_Airtable.env")
    vo = voyageai.Client()                     # reads VOYAGE_API_KEY
    vectors, tokens = [], 0
    for start in range(0, len(texts), BATCH):
        batch = texts[start:start + BATCH]
        r = vo.embed(batch, model=CHALLENGER, input_type=INPUT_TYPE,
                     output_dimension=args.dim, truncation=True)
        vectors.extend(r.embeddings)           # already ordered — no .index sort needed
        tokens += r.total_tokens
        print(f"  embedded {start + len(batch):>5}/{len(texts)}  [{stem}]")

    X = np.array(vectors, dtype=np.float32)
    CORPORA.mkdir(exist_ok=True)
    np.save(xp, X)
    mp.write_text(json.dumps({
        "model": CHALLENGER, "output_dimension": args.dim, "input_type": INPUT_TYPE,
        "stem": stem, "n": len(texts), "n_dims": int(X.shape[1]),
        "sha256": digest, "tokens": tokens,
        "embedded_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    }, indent=2), encoding="utf-8")
    print(f"  wrote {xp.name}  {X.shape}  {tokens:,} tokens (free tier)")
    return X


# ============================================================
# CORPUS 1 — the 1,126 published blurbs (copied from embed_corpus.py)
# ============================================================
KEEP = ("For Families", "For Couples", "For Golden Age Readers")

def build_published():
    history = json.loads(
        (ROOT / "data/beehiiv/issue_history.json").read_text(encoding="utf-8"))
    texts, labels = [], []
    for issue in history:
        for event in issue["events"]:
            if event["section"] not in KEEP:
                continue
            texts.append(event["displayTitle"] + " " + (event["description"] or ""))
            labels.append(event["section"])
    return texts, labels


# ============================================================
# CORPUS 2 — the labeled deck (copied from transfer_test.py: clean/serve_text/load_rows)
# ============================================================
DESC_CHAR_CAP = 300
F_SECTION = "fld8YycTYbx63EC22"
F_URL     = "fldndzHXPEBm43EJv"
F_ROW     = "fldwjfVY5pN1qajFj"
LABEL_MAP = {"Families": "For Families", "Couples": "For Couples",
             "Golden": "For Golden Age Readers", "None": "None"}

BOILER = re.compile(
    r"^(overview|good to know|highlights|refund policy|organized by|about this event"
    r"|followers?|hosting.*|events?\d*|in person|online|\d+ hours?.*|\d+ minutes?"
    r"|refunds? up to .*|more events from .*|time:.*)$", re.I)

def clean(s):
    s = html.unescape(str(s or ""))
    s = re.sub(r"<[^>]+>", " ", s)
    lines = [ln.strip() for ln in s.splitlines()]
    lines = [ln for ln in lines if ln and not BOILER.match(ln)]
    return re.sub(r"\s+", " ", " ".join(lines)).strip()[:DESC_CHAR_CAP]

def serve_text(ev):
    """§70 default arm: title + clean(desc). Cats excluded."""
    t = (ev.get("title") or "").strip() + " " + clean(ev.get("desc"))
    return re.sub(r"\s+", " ", t).strip()

def load_rows():
    pull = json.loads(
        (SECT / "deck/r7_label_deck_raw_pull_2026-07-20.json").read_text(encoding="utf-8")
    )["records"]
    ak = {}
    with open(SECT / "deck/answer_key_2026-07-18.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            ak[int(r["Row"])] = {"slice": r["slice"], "dupe": r["dupe"]}
    raw = {e["url"]: e for e in
           json.loads((CORPORA / "raw_candidate_events.json").read_text(encoding="utf-8"))}

    rows = []
    for rec in pull:
        c = rec["cellValuesByFieldId"]
        sec = c.get(F_SECTION)
        if not isinstance(sec, dict):
            continue
        url, row = c.get(F_URL), c.get(F_ROW)
        ev = raw.get(url)
        if ev is None:
            continue
        meta = ak.get(row, {"slice": "walkthrough", "dupe": ""})
        rows.append({"row": row, "url": url, "label": LABEL_MAP.get(sec["name"], sec["name"]),
                     "slice": meta["slice"], "dupe": meta["dupe"], "ev": ev})
    return rows


# ============================================================
# THE TWO TESTS — identical code, only X changes
# ============================================================
def head():
    """The §71 head, same hyperparameters as cv_embeddings.py / transfer_test.py."""
    return LogisticRegression(max_iter=1000, C=1, class_weight=None)

def test_cv(X, y):
    """cv_embeddings.py verbatim: 5-fold cross_val_predict, min per-class recall."""
    y_pred = cross_val_predict(head(), X, y, cv=5)
    return recall_score(y, y_pred, average=None, labels=list(KEEP))

def test_transfer(X_train, y_train, X_deck, gate_idx, gate_true):
    """transfer_test.py's gate block verbatim: fit on published, score gate includables."""
    clf = head()
    clf.fit(X_train, y_train)
    pred = clf.predict(X_deck[gate_idx])
    return recall_score(gate_true, pred, average=None, labels=list(KEEP))


def fmt(r):
    return "  ".join(f"{v:.3f}" for v in r) + f"   | min {r.min():.3f}"


# ============================================================
# RUN
# ============================================================
pub_texts, y_pub = build_published()
rows = load_rows()
deck_texts = [serve_text(r["ev"]) for r in rows]

# The cached OpenAI deck matrix is row-aligned to transfer_rows.json, which was written by
# transfer_test.py. If our rebuilt row order doesn't match it byte-for-byte, the baseline
# arm is comparing different events and must not be trusted — so we check instead of assume.
cached_rows = json.loads((CORPORA / "transfer_rows.json").read_text(encoding="utf-8"))
aligned = ([r["url"] for r in rows] == [r["url"] for r in cached_rows])

# gate slice, includables only, PAIR repeats deduped by url (keep first) — transfer_test.py
gate_idx, gate_true, seen = [], [], set()
for i, r in enumerate(rows):
    if r["slice"] != "gate" or r["label"] not in KEEP or r["url"] in seen:
        continue
    seen.add(r["url"])
    gate_idx.append(i)
    gate_true.append(r["label"])

print(f"published: {len(pub_texts)} rows  |  deck: {len(rows)} rows  "
      f"|  gate includables (deduped): {len(gate_idx)}")
print(f"row-order match vs transfer_rows.json: {aligned}")
print(f"\nembedding with {CHALLENGER}"
      f"{f' @ {args.dim}d' if args.dim else ' @ 1024d (default)'}, input_type={INPUT_TYPE}")
Xv_pub  = vembed(pub_texts,  "embeddings_probe", args.force)
Xv_deck = vembed(deck_texts, "transfer_nocats_probe", args.force)

Xo_pub  = np.load(CORPORA / f"embeddings_{BASELINE}.npy")
Xo_deck = np.load(CORPORA / f"transfer_nocats_{BASELINE}.npy")
assert Xo_pub.shape[0] == len(y_pub), "published baseline matrix is stale vs issue_history"

print(f"\n{'':22}{'Families':>10}{'Couples':>9}{'Golden':>9}")
print("-" * 62)
print("TEST 1 — internal 5-fold CV on the 1,126 published")
print(f"  {BASELINE:<20}", fmt(test_cv(Xo_pub, y_pub)))
print(f"  {CHALLENGER:<20}", fmt(test_cv(Xv_pub, y_pub)))

print("\nTEST 2 — transfer: fit on 1,126 -> gate slice includables (nocats)")
if aligned:
    print(f"  {BASELINE:<20}",
          fmt(test_transfer(Xo_pub, y_pub, Xo_deck, gate_idx, gate_true)))
else:
    print(f"  {BASELINE:<20} SKIPPED — row order drifted from transfer_rows.json")
print(f"  {CHALLENGER:<20}",
      fmt(test_transfer(Xv_pub, y_pub, Xv_deck, gate_idx, gate_true)))

print(f"\ndims: {BASELINE} {Xo_pub.shape[1]}  |  {CHALLENGER} {Xv_pub.shape[1]}")
print("n for the transfer row is ~{}/class — a 1-event swing is ~{:.0f} pts."
      .format(len(gate_idx) // 3, 100 / max(1, len(gate_idx) // 3)))
print("TODO(ariel): the verdict. Is any delta bigger than the noise floor above?")
