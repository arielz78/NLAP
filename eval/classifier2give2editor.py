"""
Build the 400-event labelling deck for the editor.

The deck serves two jobs that want OPPOSITE samples, so they are drawn separately
and tagged. They must be SCORED separately -- pooling them yields a meaningless
number, since the train slice is deliberately hard and biased low.

  GATE slice  (representative)      -> honest accuracy estimate on raw events
  TRAIN slice (uncertainty-sampled) -> maximum learning per label

Run:  r6_eval/.venv/Scripts/python.exe eval/classifier2give2editor.py
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")   # Windows console is cp1252 -> chokes on em-dashes
import json
import random
import re
import html
from pathlib import Path
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
import numpy as np
import pandas as pd

SEED = 18
random.seed(SEED)
np.random.seed(SEED)
rng = random.Random(SEED)

N_GATE = 150         # representative -> accuracy estimate (CI ~+/-8)
N_TRAIN = 215        # low-margin     -> training value
N_BLIND = 35         # CAP on vocabulary-blind events inside the train slice
N_DUPES = 35         # unannounced repeats -> editor self-consistency
DAY = 200            # rows per sitting; pair members are split across sittings

ROOT = Path(__file__).resolve().parent.parent

# ============================================================
# PART 1 — TRAIN on issue_history.json, the ONLY labelled source.
# raw_candidate_events.json has no labels and cannot train anything.
# ============================================================
history = json.loads((ROOT / "data/beehiiv/issue_history.json").read_text(encoding="utf-8"))
KEEP = ("For Families", "For Couples", "For Golden Age Readers")   # Local Aroma excluded: separate intake

texts, labels = [], []
for issue in history:
    for e in issue["events"]:
        if e["section"] not in KEEP:
            continue
        texts.append(e["displayTitle"] + " " + (e["description"] or ""))   # `or ""` keeps title-only rows
        labels.append(e["section"])

vec = TfidfVectorizer(ngram_range=(1,2), min_df=2, sublinear_tf=True, stop_words="english")
X = vec.fit_transform(texts)                       # fit_transform: LEARN the vocabulary
clf = LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced").fit(X, labels)
print("trained on", len(texts), "labelled events:", dict(Counter(labels)))
print("mean CV accuracy:", round(float(np.mean(cross_val_score(clf, X, labels, cv=5))), 4))

# ============================================================
# PART 2 — FILTER junk, then PREDICT on the raw pool.
# ============================================================
events = json.loads((ROOT / "eval/probe_b/raw_candidate_events.json").read_text(encoding="utf-8"))

# Criteria come from R2's LLM prompt (B2B / professional development / career fair /
# real-estate seminar), NOT R2's keyword list -- that was dead code (`isBusinessy`
# computed and never referenced). TITLE-ONLY: matching descriptions deleted good
# events whose blurb merely said "networking opportunity".
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
rej, res = re.compile("|".join(REJECT), re.I), re.compile("|".join(RESCUE), re.I)
n0 = len(events)
events = [e for e in events if not (rej.search(e["title"]) and not res.search(e["title"]))]
print("keyword filter: removed", n0 - len(events))

# GEO: eventbrite .ca/.com are mixed (Toronto uses both), but every OTHER TLD was
# inspected and is 100% foreign junk. The Airtable `City` field CANNOT be used --
# it records the QUERY city, not the venue city, so global events served into the
# Vaughan query are stamped "Vaughan" (#81 / Decision_Log §52).
foreign = re.compile(r"eventbrite\.(?!ca/|com/)[a-z.]+/", re.I)
n0 = len(events)
events = [e for e in events if not foreign.search(e["url"] or "")]
print("geo filter    : removed", n0 - len(events), "->", len(events), "remain")

# LANGUAGE: the editor has published 1 non-Latin title in 1,506 events, and that one
# was a restaurant NAME (Pho Le 錦麗) in a Local Aroma highlight. Zero non-English-
# language events have ever run -- revealed policy, and far stronger evidence than
# R2's prompt, which only says "set confidence below 0.3".
# Filtering AGGRESSIVELY here, which inverts the usual precision-over-recall rule.
# That rule holds when a deleted event might genuinely have been wanted; with a 0/1506
# revealed policy it cannot be. A dropped French event would have been marked None
# anyway, so a false positive costs nothing real while every leak burns a slot.
# Still a RATIO not a presence test -- a 25% threshold keeps English-led titles with a
# foreign proper noun ("SHERO Mother's Day Market 寵愛媽咪市集") while cutting the rest.
NONLATIN = re.compile(r"[一-鿿぀-ヿ가-힯֐-׿"
                      r"؀-ۿऀ-ॿ஀-௿Ѐ-ӿ]")
# 2+ DISTINCT function words -- one alone false-positives on English proper nouns
# ("De La Salle", "La Vie"). Two co-occurring is reliably a foreign-language title.
FOREIGN_FW = re.compile(r"\b(de|la|le|les|des|du|chez|pour|avec|sur|dans|et|en|el|los|"
                        r"las|para|con|una|por|und|der|die|das|voor|het|di|il|dei)\b", re.I)

def foreign_language(t):
    letters = [c for c in t if c.isalpha()]
    if len(letters) >= 4 and sum(bool(NONLATIN.match(c)) for c in letters) / len(letters) > 0.25:
        return True
    return len({m.group(0).lower() for m in FOREIGN_FW.finditer(t)}) >= 2

# EXEMPT local venue domains. The discriminator is geography, not language: if the
# Vaughan Public Library runs "Hebrew Storytime" or Markham library runs a Farsi
# session, that is a local Vaughan/Markham event whatever language it is in. Foreign
# junk lives on the AGGREGATORS (allevents/eventbrite), where nothing vouches for
# locality. Without this exemption the filter deleted VPL storytimes, a Markham
# library fee-assistance session, and the McMichael's French gallery tours.
LOCAL_VENUE = re.compile(r"(vaughanpl\.info|bibliocommons\.com|mcmichael\.com|visitvaughan\.ca"
                         r"|onrichmondhill\.com|calendar\.(richmondhill|trca)\.ca|markham\.ca"
                         r"|thechefupstairs\.com|varleyartgallery\.ca|unionvillepresents\.com)", re.I)

def drop_for_language(e):
    return foreign_language(e["title"]) and not LOCAL_VENUE.search(e["url"] or "")

n0 = len(events)
cut = [e["title"] for e in events if drop_for_language(e)]
events = [e for e in events if not drop_for_language(e)]
print("language filter: removed", n0 - len(events), "->", len(events), "remain")

# Clean DescriptionRaw BEFORE drawing: mcmichael rows carry unstripped HTML and
# Eventbrite rows carry listing boilerplate. Cleaning first matters because the
# draw uses "has a usable description" as a criterion (see PART 3).
BOILER = re.compile(
    r"^(overview|good to know|highlights|refund policy|organized by|about this event"
    r"|followers?|hosting.*|events?\d*|in person|online|\d+ hours?.*|\d+ minutes?"
    r"|refunds? up to .*|more events from .*|time:.*)$", re.I)

def clean(s):
    s = html.unescape(str(s or ""))
    s = re.sub(r"<[^>]+>", " ", s)                                  # strip HTML
    lines = [ln.strip() for ln in s.splitlines()]
    lines = [ln for ln in lines if ln and not BOILER.match(ln)]
    return re.sub(r"\s+", " ", " ".join(lines)).strip()[:300]

Xraw = vec.transform([e["text"] for e in events])                   # transform, NOT fit_transform
probs = clf.predict_proba(Xraw)
sp = np.sort(probs, axis=1)

df = pd.DataFrame({
    "title":  [re.sub(r"\s+", " ", e["title"]).strip() for e in events],
    "desc":   [clean(e["desc"]) for e in events],
    "url":    [e["url"] for e in events],
    "pred":   clf.predict(Xraw),
    "margin": sp[:, -1] - sp[:, -2],                                # top prob minus 2nd
    "vocab":  np.diff(Xraw.indptr),                                 # known terms matched
})
df["has_desc"] = df["desc"].str.len() > 30
df["domain"] = df["url"].astype(str).str.replace(r"https?://(www\.)?", "", regex=True).str.split("/").str[0]
print("raw pool:", len(df), "| with usable description:", int(df.has_desc.sum()))

# ============================================================
# PART 3 — DRAW two slices.
# ============================================================
# GATE: representative (proportional to predicted mix, random within class).
# Deliberately includes description-less events -- they are part of production.
# Single-activity venues are capped in the GATE too. A flex venue (Pinot's:
# editor-confirmed "it's for both") has NO single correct label -- scoring a
# designed abstention as a miss actively depresses the accuracy number rather
# than making it more representative. Their ~5% production share is handled by
# the flex-flag mechanism, not by the classifier's top-1 accuracy.
AGGREGATORS = {"allevents.in", "eventbrite.ca", "eventbrite.com",
               "markham.bibliocommons.com", "vaughanpl.info"}
MAX_VENUE = 2

pool = pd.concat([g if dom in AGGREGATORS else g.nsmallest(MAX_VENUE, "margin")
                  for dom, g in df.groupby("domain")])
props = pool["pred"].value_counts(normalize=True)
gate = pd.concat([pool[pool["pred"] == c].sample(n=int(round(s * N_GATE)), random_state=SEED)
                  for c, s in props.items()]).sample(n=N_GATE, random_state=SEED)
gate = gate.assign(slice="gate")

# TRAIN: two corrections over a naive "lowest 215 margins".
#  (1) BALANCED by predicted class -- a raw low-margin draw came back Golden-skewed
#      (91/64/60), which would tilt a training set that is currently balanced.
#  (2) DESCRIPTION-AWARE -- low margin correlates with thin text, so the events
#      hardest for the model are also the ones the EDITOR can least judge. Noisy
#      labels on hard cases move the boundary randomly and are worse than none.
#      So: prefer low-margin events that HAVE a description (genuinely ambiguous
#      = real boundary lessons), and CAP vocabulary-blind ones at N_BLIND.
#  (3) VENUE-CAPPED -- single-activity venues flood an uncertainty draw. Pinot's
#      Palette titles are painting names ("Beach Bug", "Boba Besties") carrying no
#      section signal, so they sit at near-zero margin and took 21 train slots for
#      ~zero marginal information: the venue is already known to be flex (16 C /
#      17 G / 0 Families, editor-confirmed 07-16). Capped, not zeroed -- that flex
#      read is contaminated by a dead sponsorship (~30 of 33 rows were contract
#      rotation, post-sponsor n=3), so a few fresh labels still answer something.
#      Aggregators are exempt: they host many venues and genuinely diverse events.
rest = pool.drop(gate.index)
per_class = (N_TRAIN - N_BLIND) // 3
train = pd.concat([rest[(rest["pred"] == c) & rest.has_desc].nsmallest(per_class, "margin")
                   for c in props.index])
blind = rest.drop(train.index)[~rest.drop(train.index).has_desc].nsmallest(N_BLIND, "margin")
train = pd.concat([train, blind]).assign(slice="train")
print("gate slice :", len(gate), "representative |", dict(gate["pred"].value_counts()))
print("train slice:", len(train), "| balanced:", dict(train["pred"].value_counts()),
      "| blind capped at", len(blind))

# ============================================================
# PART 4 — PLACE the duplicates across sittings.
# A pair 2 rows apart gets spotted; once he knows repeats exist he starts trying
# to be consistent and ALL 35 pairs become worthless, undetectably. So: the
# original goes in the FIRST sitting's opening stretch, the repeat in the SECOND
# sitting's closing stretch -- guaranteeing a different day AND a ~100-row gap.
# ============================================================
deck = pd.concat([gate, train])
dupe_src = gate.sample(n=N_DUPES, random_state=SEED)        # repeats drawn from GATE only,
                                                            # so self-consistency stays interpretable
# SHUFFLE before splitting into sittings. Without this the slices stay in
# concatenation order (gate then train), which clumps them: rows 1-150 all gate,
# 151-250 all train. That would put every hard low-margin event on day 2 when he
# is most fatigued -- hardest material meeting lowest attention -- and would make
# the 50-row pilot test only the gate slice, surfacing no train-slice problem.
others = deck.drop(dupe_src.index).sample(frac=1, random_state=SEED)
o1, o2 = others.iloc[:DAY - N_DUPES], others.iloc[DAY - N_DUPES:]

def place(special, fillers, slots):
    """Put `special` rows at random positions within `slots`, fill the rest in order."""
    arr = [None] * DAY
    for pos, (_, r) in zip(rng.sample(slots, len(special)), special.iterrows()):
        arr[pos] = r
    it = (r for _, r in fillers.iterrows())
    return pd.DataFrame([r if r is not None else next(it) for r in arr])

day1 = place(dupe_src, o1, list(range(0, 150)))             # originals early on day 1
day2 = place(dupe_src, o2, list(range(50, DAY)))            # repeats late on day 2
full = pd.concat([day1, day2]).reset_index(drop=True)
full["Day"] = [1] * DAY + [2] * DAY

gaps = [g.index[1] - g.index[0] for _, g in full.groupby("title") if len(g) == 2]
print("final deck :", len(full), "rows |", len(deck), "unique +", N_DUPES, "repeats")
print("dupe gap   : min", min(gaps), "rows | pairs in same sitting:",
      sum(1 for _, g in full.groupby("title") if len(g) == 2 and g.Day.nunique() == 1))

# ============================================================
# PART 5 — EXPORT.
# ============================================================
out = ROOT / "eval" / "deck"; out.mkdir(exist_ok=True)

# Batches are sized so the editor commits in increasing increments: a 50-row pilot
# he can sanity-check and return, then the two real sittings. Verified: no duplicate
# pair falls inside a single batch, so he never sees a repeat within one sitting.
def batch_of(r):
    return "1 - Pilot (50)" if r <= 50 else ("2 - Saturday (150)" if r <= 200 else "3 - Sunday (200)")

editor = pd.DataFrame({
    "Row": range(1, len(full) + 1),
    "Day": full["Day"],
    "Event": full["title"],
    "Details": full["desc"],
    "Link": full["url"],
    "Section": "",     # Families / Couples / Golden / None
    "Either": "",      # X = could honestly go either way
})
editor["Batch"] = editor["Row"].map(batch_of)
editor.to_csv(out / "editor_deck_2026-07-18.csv", index=False, encoding="utf-8-sig")

# JSON for the Airtable push (scripts/pushLabelDeck.js) -- avoids parsing a CSV
# whose Details column is full of commas and quotes.
editor.assign(Details=editor["Details"].fillna("")).to_json(
    out / "editor_deck_2026-07-18.json", orient="records", force_ascii=False, indent=1)
print("batches:", dict(editor["Batch"].value_counts()))

# `slice` is load-bearing: score gate and train SEPARATELY.
key = pd.DataFrame({
    "Row": range(1, len(full) + 1),
    "Day": full["Day"],
    "Event": full["title"],
    "slice": full["slice"],
    "model_pred": full["pred"],
    "margin": full["margin"].round(3),
    "vocab_hits": full["vocab"],
})
key["dupe"] = key["Event"].duplicated(keep=False).map({True: "PAIR", False: ""})
key.to_csv(out / "answer_key_2026-07-18.csv", index=False, encoding="utf-8-sig")

print("\nEDITOR FILE ->", out / "editor_deck_2026-07-18.csv")
print("ANSWER KEY  ->", out / "answer_key_2026-07-18.csv", "(do NOT send)")
print("\nPILOT: have him label rows 1-40 and send back BEFORE continuing.")
print("\n--- first 5 rows as the editor sees them ---")
print(editor.head(5).to_string(index=False, max_colwidth=42))