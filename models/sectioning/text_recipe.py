"""
The §70 serve-time text recipe — THE single definition. Import it; never copy it.

WHY THIS FILE EXISTS
--------------------
This recipe was previously duplicated in four places (transfer_test.py, live_demo_30.py,
eval/voyage_probe.py, classifier2give2editor.py). They were copied rather than imported for
one concrete reason, recorded at transfer_test.py:70 — `classifier2give2editor.py` executes
on import, so importing it runs a whole script. This module has NO side effects at import,
which removes that reason.

The four copies were verified byte-identical on 2026-07-28 before consolidation, so this is a
behaviour-preserving refactor: nothing about the cached embeddings changes.

WHY IT MATTERS MORE THAN TIDINESS
---------------------------------
§70's invariant is `score-time recipe == serve-time recipe`. Today only the score side exists
— R1 stores DescriptionRaw RAW (there is no clean() anywhere in the n8n pipeline) and no
production scorer has been built yet. When W7 builds one, the recipe has to be ported to it.
With one definition that is a one-file port; with four it is a guess about which copy was
current. The invariant is currently a claim in a document; this file is the first thing that
makes it enforceable.

DESIGN NOTE — clean() runs at SCORE time, not at ingestion.
Airtable keeps the raw text forever and the recipe is applied on read. Do not "clean at
ingestion" in R1: that overwrites the raw irreversibly, and every rule in here is a judgment
that may turn out wrong. Raw in the store, recipe on read.

OPEN (do not change without a measurement):
  * DESC_CHAR_CAP is a KNOB, not a constant. It was audited 2026-07-22 as display-only /
    zero model effect — but that audit was run on the SECTION CLASSIFIER, not on the reject
    gate, where the disqualifying phrase ("networking event for realtors…") often sits at the
    END of the text and is exactly what a cap removes. Re-audit for the gate (#108) before
    trusting it. Median description is 115 chars today, so the cap is barely binding — it
    only starts biting after the #108 AllEvents backfill lands.
  * The two AllEvents detail-page artifacts (title duplicated at the head; a trailing
    "Also check out other <cat> in <city>." nav block that pastes OTHER events' titles and
    cities into this row's text) are NOT stripped here yet. They cannot appear in production
    today because R1 does not fetch detail pages. They ship into this file in the same change
    that wires that fetch into R1 (A6 / W7) — same PR, so the recipe never leads or lags the
    data.
"""
import html
import re

# The knob. See the header before changing it — a change invalidates every cached embedding.
DESC_CHAR_CAP = 300

# Whole-line boilerplate only: the pattern is anchored ^…$, so it removes a bare "Overview"
# header line and never the content underneath it. Two entries do cost signal — bare "online"
# and "in person" lines are noise for a section classifier but may be load-bearing for a
# reject gate. Left as-is pending a measurement.
BOILER = re.compile(
    r"^(overview|good to know|highlights|refund policy|organized by|about this event"
    r"|followers?|hosting.*|events?\d*|in person|online|\d+ hours?.*|\d+ minutes?"
    r"|refunds? up to .*|more events from .*|time:.*)$", re.I)


def clean(s):
    """Serve-time description cleaning. Byte-identical to the four 2026-07-28 copies."""
    s = html.unescape(str(s or ""))
    s = re.sub(r"<[^>]+>", " ", s)                                  # strip HTML
    lines = [ln.strip() for ln in s.splitlines()]
    lines = [ln for ln in lines if ln and not BOILER.match(ln)]
    return re.sub(r"\s+", " ", " ".join(lines)).strip()[:DESC_CHAR_CAP]


def serve_text(title, description):
    """§70 score/serve text: title + cleaned description, whitespace-normalized."""
    text = str(title or "").strip() + " " + clean(description)
    return re.sub(r"\s+", " ", text).strip()
