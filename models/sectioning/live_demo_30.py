"""
live_demo_30.py — pull 30 random raw candidates, classify them with the §71 embeddings
head, and print TWO sheets: a BLIND sheet (editor rules cold) and a REVEAL sheet.

WHAT THIS IS: a client-meeting demo, NOT a measurement. n=30 gives ~5-7 per class, an
error bar far too wide to say anything the 184-event gate slice hasn't already said
better. Do not quote a number off this run.

WHY NO CONTENT FILTER (the deliberate choice):
classifier2give2editor.py strips B2B / foreign / non-Latin junk BEFORE drawing, because
it was building a labelling deck. This does NOT, on purpose. Production has no
content-reject stage at all (#94 -- R2's isBusinessy is dead code), so an unfiltered
draw is what the pipeline actually hands the editor in a week. The junk IS the demo:
the head has no None class, so it will confidently file a B2B networking event under
For Couples. Say that BEFORE running it or it reads as the model being broken.

ORDERING RULE: editor rules all 30 blind, THEN reveal all 30. Revealing as you go
anchors him to the model and contaminates the rulings (the 07-19 pilot-review ruling:
never debate label correctness mid-pass).

Run:  models/.venv/Scripts/python.exe models/sectioning/live_demo_30.py
      models/.venv/Scripts/python.exe models/sectioning/live_demo_30.py --seed 7
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")   # Windows console is cp1252 -> chokes on em-dashes
import json
import re
import html
import random
import hashlib
import argparse
from pathlib import Path
from collections import Counter

import numpy as np
from dotenv import load_dotenv
from sklearn.linear_model import LogisticRegression

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CORPORA = HERE / "corpora"
OUT = HERE / "deck"

MODEL = "voyage-4-large"           # §71 pick (07-25 swap); must match embed_corpus.py or the
VOYAGE_DIM = 2048                  # head is fit on one space and served another
N_DRAW = 30
DESC_CHAR_CAP = 300

ap = argparse.ArgumentParser()
ap.add_argument("--seed", type=int, default=23)
ap.add_argument("--n", type=int, default=N_DRAW)
ap.add_argument("--nofilter", action="store_true",
                help="skip the content filters — the raw unfiltered pool (the 07-23 first draw)")
args = ap.parse_args()

# ============================================================
# PART 1 — §70 serve recipe. clean() copied from classifier2give2editor.py (that file
# executes on import). Same discipline as transfer_test.py: if it changes there, change
# it here, or the demo scores different text than production serves.
# ============================================================
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
    """§70: title + clean(DescriptionRaw). Cats EXCLUDED (default arm)."""
    return re.sub(r"\s+", " ", (ev.get("title") or "").strip() + " " + clean(ev.get("desc"))).strip()

# ============================================================
# PART 2 — filters, then draw. All three are COPIED from classifier2give2editor.py, which
# used them to build the 400-deck; same rules, so the demo stands on the same ground the
# labelled deck did. They are the CHEAP rule-based reject stage — NOT the content filter
# #94 calls for, which is a text-classification problem (07-19: 12 of 13 Nones were
# event-based, not listing-based). These catch overt B2B/foreign junk and nothing subtler.
# ============================================================
events = json.loads((CORPORA / "raw_candidate_events.json").read_text(encoding="utf-8"))
seen, pool = set(), []
for e in events:
    u = e.get("url")
    if not u or u in seen:
        continue
    seen.add(u)
    pool.append(e)
n_start = len(pool)

# B2B / professional-development. Criteria come from R2's LLM prompt, not R2's keyword list
# (that was dead code). TITLE-ONLY: matching descriptions deleted good events whose blurb
# merely said "networking opportunity".
REJECT = [
    r"\bb2b\b", r"\bsmb\b", r"\bsmes?\b", r"\bentrepreneur", r"\bstartups?\b",
    r"\bfranchise", r"\bbusiness (networking|workshop|summit|breakfast|owners?)\b",
    r"\bnetworking\b", r"\btrade show\b", r"\bsales training\b", r"\bleads? generation\b",
    r"\brealtors?\b", r"\breal estate\b", r"\bmortgage", r"\binvestors?\b", r"\binvesting\b",
    r"\bcommission income\b", r"\bbuild(ing)? wealth\b", r"\bwealth (management|building)\b",
    r"\bfinancial (planning|literacy|freedom)\b",
    r"\btax (planning|season|tips)\b", r"\binsurance\b", r"\bretirement planning\b",
    r"\bcareer fair\b", r"\bjob fair\b", r"\bhiring\b", r"\brecruit", r"\bresume\b",
    r"\bprofessional development\b", r"\bcertification\b", r"\bcpd\b", r"\bcontinuing education\b",
    r"\btoastmasters\b", r"\bmasterclass\b", r"\bprocess improvement\b",
    r"\bwebinar\b", r"\bvirtual (summit|conference|seminar)\b", r"\bonline course\b",
]
# RESCUE: the ACTIVITY beats the AUDIENCE. "Spa day for entrepreneurs" is a spa day.
RESCUE = [
    r"\bcamps?\b", r"\bkids?\b", r"\bteens?\b", r"\byouth\b", r"\bchildren\b", r"\bfamily\b",
    r"\btournament\b", r"\bspa\b", r"\bfloral\b", r"\bikebana\b", r"\bpickleball\b",
    r"\bstorytime\b", r"\ball ages\b", r"\btea party\b", r"\bconcert\b", r"\bfestival\b",
]
FOREIGN_URL = re.compile(r"eventbrite\.(?!ca/|com/)[a-z.]+/", re.I)
NONLATIN = re.compile(r"[一-鿿぀-ヿ가-힯֐-׿"
                      r"؀-ۿऀ-ॿ஀-௿Ѐ-ӿ]")
FOREIGN_FW = re.compile(r"\b(de|la|le|les|des|du|chez|pour|avec|sur|dans|et|en|el|los|"
                        r"las|para|con|una|por|und|der|die|das|voor|het|di|il|dei)\b", re.I)
LOCAL_VENUE = re.compile(r"(vaughanpl\.info|bibliocommons\.com|mcmichael\.com|visitvaughan\.ca"
                         r"|onrichmondhill\.com|calendar\.(richmondhill|trca)\.ca|markham\.ca"
                         r"|thechefupstairs\.com|varleyartgallery\.ca|unionvillepresents\.com)", re.I)

def foreign_language(t):
    letters = [c for c in t if c.isalpha()]
    if len(letters) >= 4 and sum(bool(NONLATIN.match(c)) for c in letters) / len(letters) > 0.25:
        return True
    return len({m.group(0).lower() for m in FOREIGN_FW.finditer(t)}) >= 2

if not args.nofilter:
    rej, res = re.compile("|".join(REJECT), re.I), re.compile("|".join(RESCUE), re.I)
    n0 = len(pool)
    pool = [e for e in pool if not (rej.search(e["title"]) and not res.search(e["title"]))]
    print(f"  B2B filter     : removed {n0 - len(pool)}")
    n0 = len(pool)
    pool = [e for e in pool if not FOREIGN_URL.search(e.get("url") or "")]
    print(f"  geo filter     : removed {n0 - len(pool)}")
    n0 = len(pool)
    pool = [e for e in pool
            if not (foreign_language(e["title"]) and not LOCAL_VENUE.search(e.get("url") or ""))]
    print(f"  language filter: removed {n0 - len(pool)}")

rng = random.Random(args.seed)
draw = rng.sample(pool, args.n)
mode = "UNFILTERED" if args.nofilter else "filtered"
print(f"pool: {n_start} unique-URL -> {len(pool)} after filters  |  drew {len(draw)} (seed {args.seed}, {mode})")

texts = [serve_text(e) for e in draw]

# ============================================================
# PART 3 — embed the 30, cached by content hash so a re-run is free.
# ============================================================
def embed(texts, tag):
    xp = CORPORA / f"livedemo_{tag}_{MODEL}.npy"
    mp = CORPORA / f"livedemo_{tag}_{MODEL}_manifest.json"
    digest = hashlib.sha256(("\x00".join(texts)).encode("utf-8")).hexdigest()
    if xp.exists() and mp.exists():
        m = json.loads(mp.read_text(encoding="utf-8"))
        if m.get("sha256") == digest and m.get("n") == len(texts):
            print(f"  cache HIT {xp.name}")
            return np.load(xp)
    load_dotenv(ROOT / "NLAP_Airtable.env")
    import voyageai
    client = voyageai.Client()
    # input_type=None + 2048d must match embed_corpus.py: the head below is fit on those
    # vectors, so a mismatch here scores the demo in a different space than it trained in.
    resp = client.embed([t[:24_000] for t in texts], model=MODEL, input_type=None,
                        output_dimension=VOYAGE_DIM, truncation=True)
    X = np.array(resp.embeddings, dtype=np.float32)
    cost = 0.0   # free while the 200M Voyage allowance lasts (list: $0.12/1M)
    np.save(xp, X)
    mp.write_text(json.dumps({"model": MODEL, "output_dimension": VOYAGE_DIM,
                              "n": len(texts), "sha256": digest,
                              "tokens": resp.total_tokens, "cost_usd": round(cost, 6)},
                             indent=2), encoding="utf-8")
    print(f"  embedded {len(texts)}  ${cost:.5f}")
    return X

X_demo = embed(texts, f"seed{args.seed}n{args.n}{'raw' if args.nofilter else 'filt'}")

# ============================================================
# PART 4 — fit the §71 head on the 1,126 published events, predict the 30.
# Same params as cv_embeddings.py / transfer_test.py -- not re-tuned for the demo.
# ============================================================
X_train = np.load(CORPORA / f"embeddings_{MODEL}.npy")
y_train = json.loads((CORPORA / "embeddings_labels.json").read_text())
clf = LogisticRegression(max_iter=1000, C=1, class_weight=None).fit(X_train, y_train)

probs = clf.predict_proba(X_demo)
order = np.sort(probs, axis=1)
pred = clf.classes_[probs.argmax(axis=1)]
top = order[:, -1]
margin = order[:, -1] - order[:, -2]

SHORT = {"For Families": "Families", "For Couples": "Couples", "For Golden Age Readers": "Golden"}

# ============================================================
# PART 5 — the two sheets.
# ============================================================
print("\n" + "=" * 78)
print("SHEET 1 — BLIND.  Read these out. He rules all 30 BEFORE you show sheet 2.")
print("=" * 78)
for i, (e, t) in enumerate(zip(draw, texts), 1):
    d = clean(e.get("desc"))
    print(f"\n{i:>2}. {re.sub(r'\\s+', ' ', e['title']).strip()}")
    if d:
        print(f"    {d[:180]}")
    else:
        print("    (no description — title only)")

print("\n\n" + "=" * 78)
print("SHEET 2 — REVEAL.  Only after all 30 are ruled.")
print("=" * 78)
print(f"{'#':>3}  {'MODEL SAYS':<10} {'conf':>5} {'margin':>6}  {'flag':<10} title")
for i, (e, p, c, m) in enumerate(zip(draw, pred, top, margin), 1):
    flag = "UNSURE" if m < 0.15 else ("weak" if c < 0.50 else "")
    print(f"{i:>3}  {SHORT[p]:<10} {c:>5.2f} {m:>6.2f}  {flag:<10} "
          f"{re.sub(r'\\s+', ' ', e['title']).strip()[:52]}")

print(f"\npredicted mix: {dict(Counter(SHORT[p] for p in pred))}")
print(f"low-margin (<0.15, would abstain): {int((margin < 0.15).sum())} of {len(draw)}")
print(f"low-confidence (<0.50): {int((top < 0.50).sum())} of {len(draw)}")

OUT.mkdir(exist_ok=True)
rec = [{"n": i, "title": re.sub(r"\s+", " ", e["title"]).strip(), "desc": clean(e.get("desc")),
        "url": e.get("url"), "model_pred": SHORT[p], "confidence": round(float(c), 3),
        "margin": round(float(m), 3), "editor_ruling": ""}
       for i, (e, p, c, m) in enumerate(zip(draw, pred, top, margin), 1)]
f = OUT / f"live_demo_30_seed{args.seed}{'_raw' if args.nofilter else ''}.json"
f.write_text(json.dumps(rec, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"\nwrote {f}  (editor_ruling blank — type his calls in as he goes)")
