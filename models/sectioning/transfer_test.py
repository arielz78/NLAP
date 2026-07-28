"""
transfer_test.py — the R7-W6 gate: does the embedding classifier transfer from the
published TRAINING corpus (newsletter blurbs) to the RAW candidate pool it will
actually score in production?

AUTHORSHIP SPLIT (CLAUDE.md R7-W6). Everything ABOVE the ===== EVAL ===== banner is
PLUMBING (Claude): join the editor's labels to raw text, build the §70 serve-time
recipe, embed it, hand back row-aligned matrices. Everything BELOW the banner is the
AUTHORED CORE (Ariel): the fit, the per-class recall / coverage / abstention scoring,
tau calibration, and the go/no-go against the §3 bars. The plumbing decides none of that.

DESIGN CONSTRAINTS baked into the plumbing (settled elsewhere, not re-litigated here):
  §70  score-time recipe == serve-time recipe: text = title + clean(DescriptionRaw);
        SourceCategories EXCLUDED by default, re-entering only via the ablation arm.
  §69  the gate and train slices are scored SEPARATELY, never pooled (train is drawn
        deliberately hard/low-margin, so a pooled number is meaningless).
  §71  representation = voyage-4-large @ 2048d (07-25; OpenAI -large before that, -small
        eliminated earlier). The provider swap was made on availability grounds and is
        performance-neutral — see eval/voyage_probe.py. Do NOT read the post-swap transfer
        numbers as a gain: both arms were seen before choosing, so any delta there is
        post-hoc selection on the eval set, which is exactly what the four blind
        pre-commitments below exist to prevent.
  join label(Airtable pull) --by URL--> raw text(raw_candidate_events)
       label(Airtable pull) --by Row--> slice(answer_key: gate / train)

Run:
    ../.venv/Scripts/python.exe transfer_test.py            # join + embed (or reuse cache)
    ../.venv/Scripts/python.exe transfer_test.py --force    # re-embed, ignore cache
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")   # Windows console is cp1252 -> chokes on em-dashes
import json
import csv
import re
import html
import hashlib
from pathlib import Path
from collections import Counter

import numpy as np
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CORPORA = HERE / "corpora"

MODEL = "voyage-4-large"           # §71 pick (07-25 swap); must match embed_corpus.py or the
VOYAGE_DIM = 2048                  # head is fit on one space and served another
BATCH_SIZE = 100
MAX_CHARS = 24_000                 # per-input ceiling; nothing here is close
USD_PER_1M = 0.0                   # free while the 200M Voyage allowance lasts (list: 0.12)

# --- deck-pull field ids: the Airtable export keys cells by field id, not by name ---
F_SECTION = "fld8YycTYbx63EC22"    # editor's label: Families / Couples / Golden / None
F_URL     = "fldndzHXPEBm43EJv"    # join key -> raw_candidate_events.json
F_ROW     = "fldwjfVY5pN1qajFj"    # join key -> answer_key (which carries the slice)

# editor label space -> training label space. "None" is NOT a training class: it is the
# abstention target, handled below the banner, and the head never outputs it.
LABEL_MAP = {
    "Families": "For Families",
    "Couples":  "For Couples",
    "Golden":   "For Golden Age Readers",
    "None":     "None",
}
KEEP = ("For Families", "For Couples", "For Golden Age Readers")   # the 3 includable classes

# ============================================================
# PART 1 — the §70 serve-time text recipe.
# IMPORTED, not copied (consolidated 2026-07-28). It previously lived inline here because
# classifier2give2editor.py executes on import; text_recipe.py is side-effect-free, which
# removes that reason. All four former copies were verified byte-identical on the 1,805-row
# corpus before the move — the recipe did not change, only its address.
# ============================================================
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from text_recipe import DESC_CHAR_CAP, BOILER, clean          # noqa: E402  (the ONE definition)

def serve_text(ev, with_cats):
    """§70 recipe. Default arm (with_cats=False) does NOT widen the train/serve gap; the
    with_cats arm is the pre-registered ablation. Cats are appended as raw tag-soup (the
    embedding reads them as text — the whole point of the ablation, per §70)."""
    t = (ev.get("title") or "").strip() + " " + clean(ev.get("desc"))
    if with_cats:
        t = t + " " + (ev.get("cats") or "")
    return re.sub(r"\s+", " ", t).strip()

# ============================================================
# PART 2 — JOIN: editor labels -> raw text (by URL) -> slice (by Row).
# Validated 2026-07-23: gate slice joins 184/184 (0 misses); the only drops are 5 blank
# labels + 5 no-raw-text rows (3 walkthrough, 2 blank-URL train) — all outside the gate
# number. Counts are printed so a future re-pull can't drift silently.
# ============================================================
def load_rows():
    pull = json.loads(
        (HERE / "deck/r7_label_deck_raw_pull_2026-07-20.json").read_text(encoding="utf-8")
    )["records"]

    ak = {}   # Row -> slice/dupe
    with open(HERE / "deck/answer_key_2026-07-18.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            ak[int(r["Row"])] = {"slice": r["slice"], "dupe": r["dupe"]}

    raw = {e["url"]: e for e in
           json.loads((CORPORA / "raw_candidate_events.json").read_text(encoding="utf-8"))}

    rows, dropped = [], Counter()
    for rec in pull:
        c = rec["cellValuesByFieldId"]
        sec = c.get(F_SECTION)
        if not isinstance(sec, dict):              # 5 pilot blanks -> unlabeled
            dropped["blank_label"] += 1
            continue
        url, row = c.get(F_URL), c.get(F_ROW)
        ev = raw.get(url)
        if ev is None:                             # no raw text -> no serve text to score
            dropped["no_raw_text"] += 1
            continue
        meta = ak.get(row, {"slice": "walkthrough", "dupe": ""})   # batch-4 rows aren't in the key
        rows.append({
            "row":   row,
            "url":   url,
            "label": LABEL_MAP.get(sec["name"], sec["name"]),
            "slice": meta["slice"],
            "dupe":  meta["dupe"],                 # "PAIR" on the 35 gate self-consistency repeats
            "ev":    ev,
        })
    return rows, dropped

# ============================================================
# PART 3 — embed one arm, cached by content hash (re-runs are free unless the text changed).
# ============================================================
def embed(texts, tag, force):
    xp = CORPORA / f"transfer_{tag}_{MODEL}.npy"
    mp = CORPORA / f"transfer_{tag}_{MODEL}_manifest.json"
    digest = hashlib.sha256(("\x00".join(texts)).encode("utf-8")).hexdigest()

    if xp.exists() and mp.exists() and not force:
        m = json.loads(mp.read_text(encoding="utf-8"))
        if m.get("sha256") == digest and m.get("n") == len(texts):
            X = np.load(xp)
            print(f"  cache HIT  {xp.name}  {X.shape}  (${m['cost_usd']:.4f} already paid)")
            return X

    load_dotenv(ROOT / "NLAP_Airtable.env")
    import voyageai
    client = voyageai.Client()                     # reads VOYAGE_API_KEY from the environment
    payload = [t[:MAX_CHARS] for t in texts]
    vectors, tokens = [], 0
    for start in range(0, len(payload), BATCH_SIZE):
        batch = payload[start:start + BATCH_SIZE]
        # input_type=None: classification is symmetric, so the query/document retrieval
        # prompts would only inject a constant string. Must match embed_corpus.py.
        resp = client.embed(batch, model=MODEL, input_type=None,
                            output_dimension=VOYAGE_DIM, truncation=True)
        vectors.extend(resp.embeddings)            # already ordered; no index sort needed
        tokens += resp.total_tokens
        print(f"  embedded {start + len(batch):>4}/{len(payload)}  [{tag}]")

    X = np.array(vectors, dtype=np.float32)
    cost = tokens / 1_000_000 * USD_PER_1M
    CORPORA.mkdir(exist_ok=True)
    np.save(xp, X)
    mp.write_text(json.dumps({
        "model": MODEL, "tag": tag, "n": len(texts), "sha256": digest,
        "tokens": tokens, "cost_usd": round(cost, 6),
        "embedded_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    }, indent=2), encoding="utf-8")
    print(f"  wrote {xp.name}  {X.shape}  ${cost:.4f}")
    return X

# ============================================================
# PART 4 — build both arms, embed, load the training corpus, hand it all off.
# ============================================================
force = "--force" in sys.argv

rows, dropped = load_rows()
print("joined:", len(rows), "labeled+text rows  | dropped:", dict(dropped))
for sl in ("gate", "train", "walkthrough"):
    c = Counter(r["label"] for r in rows if r["slice"] == sl)
    print(f"  {sl:11}", dict(c))

texts_nocats = [serve_text(r["ev"], with_cats=False) for r in rows]   # §70 default
texts_cats   = [serve_text(r["ev"], with_cats=True)  for r in rows]   # ablation arm
X_deck_nocats = embed(texts_nocats, "nocats", force)
X_deck_cats   = embed(texts_cats,   "cats",   force)

# row metadata, aligned to BOTH deck matrices (row i of the .npy == rows_meta[i])
rows_meta = [{k: r[k] for k in ("row", "url", "label", "slice", "dupe")} for r in rows]
(CORPORA / "transfer_rows.json").write_text(json.dumps(rows_meta, indent=1), encoding="utf-8")

# the 1,126 published training embeddings — the head is FIT on these (§71, large)
X_train = np.load(CORPORA / f"embeddings_{MODEL}.npy")
y_train = json.loads((CORPORA / "embeddings_labels.json").read_text())
assert X_train.shape[0] == len(y_train), "training X/labels misaligned"

print(f"\ntraining: {X_train.shape} | deck nocats {X_deck_nocats.shape} | deck cats {X_deck_cats.shape}")
print("slice sizes:", dict(Counter(r["slice"] for r in rows)),
      "| gate PAIR repeats:", sum(1 for r in rows if r["slice"] == "gate" and r["dupe"] == "PAIR"))

# =====================================================================================
# ================================  EVAL — AUTHORED CORE  ==============================
# =====================================================================================
# STOP. Plumbing above is done; the embeddings are cached. Everything below is yours.
# Do NOT let Claude write this. The three scoring rules must be PINNED BLIND — committed
# here BEFORE you fit and see a single number (07-22 Fable review). The modal outcome is a
# one-event Golden miss; if you decide the rules after seeing it, the pre-registration is
# worthless. The guard below refuses to run the eval until all four constants are set.

# (1) Does an abstention rescue a miss, or does argmax stand? (pin: abstention does NOT
#     rescue — recall = correct / all includables AT ARGMAX.)
RECALL_COUNTS_ABSTENTION_AS = "miss"   # TODO(ariel): set to "miss" to commit

# (2) gate and train are embedded together but scored apart (§69). State the ONE condition
#     under which pooling would ever be legitimate — or "never".
POOLING_JUSTIFICATION = "never"      # TODO(ariel)

# (3) tau is calibrated on WHICH rows' probability distribution? Not the rows the coverage
#     bar reads, or the number is circular. (pin: the TRAIN slice.)
TAU_CALIBRATED_ON = "train"             # TODO(ariel): set to "train" to commit

# (4) the iteration ladder: what you try, in order, IF a bar fails — committed before the
#     number so a failed bar doesn't turn into motivated tuning.
ITERATION_LADDER = ITERATION_LADDER = [ 
    "head sweep C x class_weight (CV-only, freeze)", 
    "serve-time text cleaning (genre gap)",
    "fold train-slice labels into training (guard repeat-mates)",
]

if None in (RECALL_COUNTS_ABSTENTION_AS, POOLING_JUSTIFICATION, TAU_CALIBRATED_ON, ITERATION_LADDER):
    raise SystemExit(
        "\nEVAL BLOCKED - pin the four blind pre-commitments above before scoring.\n"
        "The plumbing ran and cached the embeddings; nothing else executes until they're set.\n"
        "This guard is deliberate (07-22 Fable review): the rule is committed before the number."
    )

# --- from here down is yours to write ---
from sklearn.linear_model import LogisticRegression

clf = LogisticRegression(max_iter=1000, C=1, class_weight=None)
clf.fit(X_train, y_train)
print("fit done:", clf.classes_)

# --- gate slice: the headline recall number (includables only, PAIR-deduped) ---
# MECHANICAL (Claude, one-time unstick 07-23): mask the gate slice down to includables,
# predict, run the same recall_score line Ariel wrote in cv_embeddings.py. The abstention +
# coverage rule and the verdict below stay AUTHORED-CORE (Ariel) — not written here.
from sklearn.metrics import recall_score, classification_report

seen = set()
gate_idx, gate_true = [], []
for i, r in enumerate(rows):
    if r["slice"] != "gate" or r["label"] not in KEEP:   # gate slice + includables only
        continue
    if r["url"] in seen:                                  # dedupe the PAIR repeats — keep first
        continue
    seen.add(r["url"])
    gate_idx.append(i)
    gate_true.append(r["label"])

gate_pred = clf.predict(X_deck_nocats[gate_idx])
print(f"\ngate includables (deduped): {len(gate_idx)}")
print(classification_report(gate_true, gate_pred))
print("min-class recall (gate, nocats):", recall_score(gate_true, gate_pred, average=None).min())
# TODO(ariel): fit the head on (X_train, y_train) — LogisticRegression, §71 large params.
# TODO(ariel): score the GATE slice (the honest number) and the TRAIN slice SEPARATELY:
#     * argmax prediction per event; per-class recall over includables (KEEP) — Golden weak
#     * apply tau -> abstain; a None-labeled event SHOULD abstain (correct, not a miss)
#     * coverage (#98): of includable gate events, the fraction committed AND correct
#     * min-class recall vs the §3 bar (>=0.75); coverage vs the §3 bar (>=0.60)
#     * dedupe the gate PAIR repeats first, or one event counts twice in recall
# TODO(ariel): repeat on the cats ablation arm (X_deck_cats), apply the §3 switch rule
#     (>=10 pts min-class gain AND no class degrading) — arithmetic, not eyeball.
# TODO(ariel): walk the §3 exit table (both pass -> ship to R6; one fail -> one cycle down
#     ITERATION_LADDER; two fails -> reopen the LLM-primary path).
