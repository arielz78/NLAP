"""Shared configuration for pair generation and grading.

Everything tunable lives here. CLI flags override individual keys; there is
deliberately no config-file machinery for a system this small.
"""

DEFAULT_CONFIG = {
    # The three event sections (SegmentSuggested values) in scope for R6.
    "sections": ["For Families", "For Couples", "For Golden Age Readers"],
    # Eligible cities.
    "cities": ["Vaughan", "Markham", "Richmond Hill"],
    # Junk-venue blocklist, compared case-insensitively after strip().
    # Empty/missing LocationName is also excluded (spec'd for the pair pool;
    # note this is stricter than the allocator's "blank venue allowed" rule).
    "venue_blocklist": [
        "online programs",
        "online",
        "online (markham public library)",
        "virtual",
        "tbd",
        "tba",
        "various locations",
    ],
    # Pair generation.
    "pairs_per_section": 55,
    "holdout_frac": 0.20,       # ~20% of base pairs marked is_holdout
    "n_duplicates": 10,          # total re-shown pairs across all sections
    "min_duplicate_gap": 30,     # min presentation slots between original and dup
    "seed": 7,
    # pairwise_lr.
    "lr_C": 1.0,                 # inverse L2 strength for LogisticRegression
    # source_prior: optional {source_name: prior in [0,1]} map. None = derive
    # from source frequency in the eligible pool.
    "source_prior": None,
    # content_fit: optional callable(candidate, section) -> [0,1]. None = 0.0.
    "content_fit_fn": None,
    # Grading.
    "bootstrap_iters": 2000,
}


def make_config(**overrides):
    cfg = dict(DEFAULT_CONFIG)
    for k, v in overrides.items():
        if v is not None:
            cfg[k] = v
    return cfg
