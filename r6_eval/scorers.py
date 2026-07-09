"""The three candidate scorers.

Two protocols, checked by the grader in this order:
  compare(a: dict, b: dict, section: str) -> "A" | "B"   (pairwise scorers)
  score(candidate: dict, config: dict = None) -> float in [0,1]  (pointwise)

llm_comparator is inherently pairwise (its prompt asks "which fits better"),
so it implements compare(); the other two are pointwise. Scorers with a
fit(train_rows, lookup) method are trained by the grader on the non-holdout,
non-duplicate pairs before any evaluation.

train_rows format (built by grade.py from the answers CSV):
  {"section", "a": candidate dict, "b": candidate dict, "winner": "A"|"B"}
"""

import random
import sys
import zlib

import numpy as np
from sklearn.linear_model import LogisticRegression

from .features import FEATURE_NAMES, compute_pool_stats, feature_vector
from .llm import get_client
from .pool import parse_date

SECTION_BLURBS = {
    "For Families": "outings parents would take kids to — family-friendly, local, hands-on",
    "For Couples": "date-worthy experiences for adults — evenings out, food/drink, arts, music",
    "For Golden Age Readers": "seniors-oriented — daytime, accessible, social, low-intensity",
}


class BaselineDateSort:
    """The floor to beat: score = 1 / days-to-event, i.e. what the pipeline
    does today (earliest date first). Missing/unparseable date scores 0."""

    name = "baseline_date_sort"

    def __init__(self, config, today, pool_by_section):
        self.today = today

    def score(self, candidate, config=None):
        start = parse_date(candidate.get("Start Date"))
        if start is None:
            return 0.0
        days = max(1, (start - self.today).days)
        return 1.0 / days  # in (0, 1], monotone in date


class LLMComparator:
    """Asks an LLM which of two RAW events fits the section better, grounded
    with a few raw-text examples sampled from the eligible pool. Uses the raw
    Event Title + DescriptionRaw only — never polished copy. Without an API
    key (see llm.py) a seeded stub answers, so the harness runs end-to-end."""

    name = "llm_comparator"

    def __init__(self, config, today, pool_by_section):
        self.config = config
        self.client = get_client(seed=config.get("seed", 7))
        self.examples = {}
        rng = random.Random(config.get("seed", 7))
        for section, recs in pool_by_section.items():
            sample = rng.sample(recs, min(3, len(recs)))
            self.examples[section] = [
                f"- {r.get('Event Title', '')} :: {(r.get('DescriptionRaw') or '')[:200]}"
                for r in sample
            ]

    def _prompt(self, a, b, section):
        blurb = SECTION_BLURBS.get(section, "")
        ex = "\n".join(self.examples.get(section, [])) or "(none available)"
        return (
            "You pick events for a hyperlocal weekly newsletter covering "
            "Vaughan, Markham and Richmond Hill.\n"
            f'Section: "{section}" — {blurb}.\n'
            "Examples of raw candidate events for this section (unedited feed text):\n"
            f"{ex}\n\n"
            "Compare these two raw candidates:\n"
            f"A: {a.get('Event Title', '')} :: {a.get('DescriptionRaw', '')}\n"
            f"B: {b.get('Event Title', '')} :: {b.get('DescriptionRaw', '')}\n\n"
            f'Which is more newsletter-worthy for "{section}"? '
            "Reply with exactly one letter: A or B."
        )

    def compare(self, a, b, section):
        prompt = self._prompt(a, b, section)
        try:
            return self.client.choose_a_or_b(prompt)
        except Exception as e:  # network/parse failure -> deterministic fallback
            print(f"  [llm_comparator] call failed ({e}); seeded fallback", file=sys.stderr)
            h = zlib.crc32(prompt.encode("utf-8"))
            return "A" if h % 2 == 0 else "B"


class PairwiseLR:
    """LogisticRegression on feature-difference vectors of the training pairs
    (label = which side won), L2-regularized, no intercept (differences are
    antisymmetric). Pointwise score = sigmoid(w . x), monotone in w . x, so
    pair agreement reduces to comparing linear scores."""

    name = "pairwise_lr"

    def __init__(self, config, today, pool_by_section):
        self.config = config
        self.pool_stats = compute_pool_stats(pool_by_section)
        self.weights = None

    def fit(self, train_rows, lookup):
        X, y = [], []
        for row in train_rows:
            fa = feature_vector(row["a"], row["section"], self.pool_stats, self.config)
            fb = feature_vector(row["b"], row["section"], self.pool_stats, self.config)
            X.append(fa - fb)
            y.append(1 if row["winner"] == "A" else 0)
        X, y = np.array(X), np.array(y)
        if len(y) < 5 or len(set(y)) < 2:
            print(
                f"  [pairwise_lr] insufficient training data (n={len(y)}); "
                "falling back to uniform weights",
                file=sys.stderr,
            )
            self.weights = np.ones(len(FEATURE_NAMES))
            return
        # L2 is sklearn's default penalty; C is the inverse regularization strength.
        model = LogisticRegression(
            C=self.config.get("lr_C", 1.0), fit_intercept=False, max_iter=1000
        )
        model.fit(X, y)
        self.weights = model.coef_[0]
        learned = ", ".join(f"{n}={w:+.3f}" for n, w in zip(FEATURE_NAMES, self.weights))
        print(f"  [pairwise_lr] trained on {len(y)} pairs; weights: {learned}")

    def score(self, candidate, config=None):
        if self.weights is None:
            raise RuntimeError("pairwise_lr.score() called before fit()")
        x = feature_vector(
            candidate, candidate.get("SegmentSuggested", ""), self.pool_stats, self.config
        )
        z = float(np.dot(self.weights, x))
        return 1.0 / (1.0 + np.exp(-z))


SCORERS = {
    BaselineDateSort.name: BaselineDateSort,
    LLMComparator.name: LLMComparator,
    PairwiseLR.name: PairwiseLR,
}


def make_scorer(name, config, today, pool_by_section):
    if name not in SCORERS:
        raise SystemExit(f"Unknown scorer {name!r}. Available: {', '.join(SCORERS)}")
    return SCORERS[name](config, today, pool_by_section)
