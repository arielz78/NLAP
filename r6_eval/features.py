"""Layer-1 feature computation for pairwise_lr.

Four features, deliberately few. Two are live, two are documented stubs:

  venue_recurrence  live  count of the candidate's venue across the eligible
                          pool (all 3 sections), normalized by the max count.
  source_prior      live  config-supplied {source: prior} map if given, else
                          source frequency in the pool normalized by max.
  click_prior       STUB  returns 0.0. Intended interface: look up historical
                          Beehiiv click-through for similar past IssueItems
                          (by venue and/or source) and return a [0,1] prior.
                          Wire by replacing `click_prior()` below; the
                          signature (candidate dict -> float) is the contract.
  content_fit       STUB  returns 0.0 unless config["content_fit_fn"] is set
                          to a callable(candidate, section) -> [0,1] (e.g. an
                          LLM section-fit score). Pluggable by config only —
                          no code change needed.
"""

from collections import Counter

import numpy as np

FEATURE_NAMES = ["venue_recurrence", "source_prior", "click_prior", "content_fit"]


def compute_pool_stats(pool_by_section):
    """Aggregate venue/source counts over the whole eligible pool."""
    venues, sources = Counter(), Counter()
    for recs in pool_by_section.values():
        for r in recs:
            v = (r.get("LocationName") or "").strip().lower()
            if v:
                venues[v] += 1
            s = (r.get("Source") or "").strip()
            if s:
                sources[s] += 1
    return {
        "venue_counts": venues,
        "source_counts": sources,
        "max_venue": max(venues.values(), default=1),
        "max_source": max(sources.values(), default=1),
    }


def click_prior(candidate):
    """STUB — historical click prior, [0,1]. Returns 0 until wired to the
    Beehiiv click history (data/beehiiv/issue_history.json joined on venue or
    source). Contract: pure function of the candidate dict."""
    return 0.0


def content_fit(candidate, section, config):
    """Pluggable content-fit score, [0,1]. Defaults to 0.0."""
    fn = config.get("content_fit_fn")
    if fn is None:
        return 0.0
    return float(fn(candidate, section))


def feature_vector(candidate, section, pool_stats, config):
    """Return the 4-dim feature vector (np.float64) for one candidate."""
    venue = (candidate.get("LocationName") or "").strip().lower()
    venue_rec = pool_stats["venue_counts"].get(venue, 0) / pool_stats["max_venue"]

    source = (candidate.get("Source") or "").strip()
    prior_map = config.get("source_prior")
    if prior_map:
        src_prior = float(prior_map.get(source, 0.0))
    else:
        src_prior = pool_stats["source_counts"].get(source, 0) / pool_stats["max_source"]

    return np.array(
        [venue_rec, src_prior, click_prior(candidate), content_fit(candidate, section, config)],
        dtype=np.float64,
    )
