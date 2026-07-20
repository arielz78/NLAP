"""
build_ambiguous_sections.py — Couples vs Golden Age boundary-case sampler
==========================================================================

PURPOSE
    Pull the events from published history that sit closest to the
    For Couples <-> For Golden Age Readers decision boundary, so the editor
    can re-rule them cold. Two things this measures at once:
      1. SELF-CONSISTENCY: does his new ruling match where he originally ran it?
         (Low self-consistency here => the ~80% classifier ceiling is partly the
         human's own fuzziness in this zone, not model weakness.)
      2. MODEL AGREEMENT: does his ruling match the trained classifier?
    Feeds R7-W6 (section classifier). See docs/r7/R7_Scope.md — the Couples/Golden
    overlap is the documented ~80%-of-errors zone.

METHOD
    TF-IDF (1-2 gram) + multinomial logistic regression over ALL sections.
    Probabilities are OUT-OF-FOLD (cross_val_predict, 5-fold): every event is
    scored by a model that did not train on it, so "ambiguous" means genuinely
    ambiguous, not memorized. Candidates = true section is Couples or Golden AND
    the two highest predicted probs are exactly those two; ranked by smallest
    |p_couples - p_golden|; de-duped by title.

CAVEAT
    Trained on the editor's EDITED display titles (all history has). Production
    inputs are RAW scraped titles — this is a design-signal / consistency probe,
    NOT the R7 go/no-go accuracy measurement (that requires the raw-title rebuild).

RUN
    ./models/.venv/Scripts/python.exe models/sectioning/build_ambiguous_sections.py \
        --n 15 --out-prefix models/sectioning/rulings/ambiguous_cases_YYYY-MM-DD

OUTPUTS
    <prefix>_for_client.txt  — stripped list (no section/date) to send the editor
    <prefix>_KEY.tsv         — INTERNAL: true section + model pred + probs. Do NOT send.
"""
import argparse, json, re, sys
from datetime import date
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import cross_val_predict

ROOT = Path(__file__).resolve().parent.parent.parent
COUPLES, GOLDEN = "For Couples", "For Golden Age Readers"

def clean(s: str) -> str:
    # strip leading emoji/variation-selectors/zero-width junk and collapse spaces
    s = re.sub(r"^[\W_]+", "", s or "", flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--n", type=int, default=15, help="number of boundary cases to emit")
    ap.add_argument("--source", default="data/beehiiv/issue_history.json")
    ap.add_argument("--out-prefix", default=f"models/sectioning/rulings/ambiguous_cases_{date.today()}")
    args = ap.parse_args()

    data = json.loads((ROOT / args.source).read_text(encoding="utf-8"))
    rows = []
    for iss in data:
        for e in iss.get("events", []):
            sec, title = (e.get("section") or "").strip(), clean(e.get("displayTitle") or "")
            if not sec or not title:
                continue
            desc = clean(e.get("description") or "")
            rows.append({"section": sec, "title": title, "desc": desc,
                         "text": (title + " " + desc).strip()})

    X, y = [r["text"] for r in rows], [r["section"] for r in rows]
    clf = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, stop_words="english"),
        LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced", random_state=0),
    )
    proba = cross_val_predict(clf, X, y, cv=5, method="predict_proba")
    order = clf.fit(X, y).classes_.tolist()  # lock class column order
    COU, GOL = order.index(COUPLES), order.index(GOLDEN)

    cand, seen = [], set()
    for i, r in enumerate(rows):
        if r["section"] not in (COUPLES, GOLDEN):
            continue
        p = proba[i]
        if set(sorted(range(len(p)), key=lambda k: -p[k])[:2]) != {COU, GOL}:
            continue  # only genuine Couples/Golden ties
        if r["title"].lower() in seen:
            continue
        seen.add(r["title"].lower())
        cand.append({**r, "pc": round(float(p[COU]), 3), "pg": round(float(p[GOL]), 3),
                     "margin": round(abs(float(p[COU] - p[GOL])), 3),
                     "model_pred": COUPLES if p[COU] >= p[GOL] else GOLDEN})
    cand.sort(key=lambda r: r["margin"])
    pick = cand[: args.n]

    stamp = date.today().isoformat()
    prov = (f"# Generated {stamp} by models/sectioning/build_ambiguous_sections.py\n"
            f"# Purpose: editor re-rules Couples/Golden boundary cases -> R7-W6 section-classifier signal.\n"
            f"# Source: {args.source} ({len(rows)} labeled events; Couples/Golden boundary pool: {len(cand)}).\n")

    client = [prov,
              "# WHICH SECTION does each belong in?  (For Couples  /  For Golden Age Readers)",
              "# One word per line. No right answer expected on the hard ones — that's the point.\n"]
    key = [prov.replace("# Purpose", "# INTERNAL — DO NOT SEND TO EDITOR. Purpose"),
           "n\ttitle\ttrue_section\tmodel_pred\tp_couples\tp_golden\tmargin"]
    for n, r in enumerate(pick, 1):
        client.append(f"{n}. {r['title']}")
        if r["desc"]:
            client.append(f"   {r['desc']}")
        client.append("   -> your section: ______________\n")
        key.append(f"{n}\t{r['title']}\t{r['section']}\t{r['model_pred']}\t{r['pc']}\t{r['pg']}\t{r['margin']}")

    cpath = ROOT / f"{args.out_prefix}_for_client.txt"
    kpath = ROOT / f"{args.out_prefix}_KEY.tsv"
    cpath.write_text("\n".join(client), encoding="utf-8")
    kpath.write_text("\n".join(key), encoding="utf-8")
    print(f"Wrote {len(pick)} cases -> {cpath.name}, {kpath.name}", file=sys.stderr)
    print(f"Boundary pool (unique Couples/Golden ties): {len(cand)}", file=sys.stderr)

if __name__ == "__main__":
    main()
