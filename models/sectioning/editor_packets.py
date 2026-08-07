"""§90 editor-packet builder — blind sheets + a sealed answer key, from scored survivors.

Consumes ``live_runner``'s scored-survivor schema (``record_id``, identity/display
fields, ``p_include``, ``section_probabilities``) and emits the two instruments
`Decision_Log` §90 froze:

* **Instrument B** — the product read: the top 8 events per automated section, ranked by
  ``p_include * P(section)``, drawn over **listings**. Repeats are deliberately allowed
  here: in production nothing collapses a recurring series, so if a section's shortlist
  is four dates of one program, that is the product surface and the editor should see it.
* **Instrument A** — the validity read: 100 events drawn from the B-unused pool,
  stratified by *rank-position* quintile at 25/25/20/15/15 lowest→highest, then
  randomized into five blocks of 20. Drawn over **series**, one row per series.

**The two instruments use different units, on purpose.** Measured on the 2026-08-13 pool,
321 in-window listings collapse to 224 distinct events: 41 groups are byte-identical in
serve text and score within 1.2e-7 of each other, so a repeat is a duplicated question
with a predetermined answer. Instrument A measures whether the gate's ordering agrees
with the editor, and a duplicated question buys no information while consuming sample
budget — so A deduplicates and its strata are cut over the series population, keeping the
sampling unit and the stratum unit the same. Instrument B measures the product, where the
repetition is the finding, so B is left alone.

Three properties this module exists to guarantee, each with a named failure:

1. **No packet is a calibration source.** Per §91 the quintiles are rank positions, never
   score bands, so nothing here depends on ``0.4530`` being calibrated live. This module
   holds no threshold and makes no keep/reject call.
2. **The editor sheets are blind.** Blind rows are built by *whitelist construction*
   from ``EDITOR_DISPLAY_FIELDS`` — no score, probability, rank, quintile, predicted
   section, series size or packet-membership value can reach them by accident, because
   nothing copies the source row wholesale. The single deliberate exception is Instrument
   B's ``presented_section``: B *is* the section shortlist, so the section header is the
   instrument rather than a leak. B rows are shuffled within their section so the
   within-section ranking still does not reach the editor.
3. **Reruns are byte-identical.** Every random draw comes from a seed derived from the
   frozen snapshot's SHA-256, and every sort carries an explicit ``record_id`` or series
   tiebreak, so the same snapshot always yields the same packets.

**Calibration anchors are deliberately absent.** §90 records them as diagnostic and sets
no invalidation rule, and they are out of today's protocol; Instrument A is exactly 100
rows and nothing is appended to it.

Mechanical choices the §90 text leaves to the implementation, recorded here because they
are visible in the output:

* **Cross-section dedup in B is a global greedy** over all (event, section) pairs by
  descending ``p_include * P(section)``, assigning each event to at most one section and
  each section at most 8. A per-section pass would make the result depend on which section
  was processed first; the greedy does not.
* **The series key is ``gate_step4a``'s CV grouping convention** — whitespace-collapsed
  lowercase title — so the packets and the gate's leak-free folds agree on what one event
  is. A blank title falls back to ``record_id`` so untitled rows never merge.
* **A series' representative is drawn at random from its members** under a dedicated
  seeded stream. Picking the highest-scoring member would bias the sample upward; picking
  the earliest date would correlate with nothing. Intra-series score spread is at most
  0.025 and usually 1e-7, so the choice moves the ranking negligibly.
* **A whole series is excluded from A if any of its listings reached B**, so no event can
  be judged in both instruments.

This module reads a JSONL fixture and writes files. It performs no embedding, no fit, no
network call, and no Airtable write, and it makes no model, threshold or label decision.

Run from the repository root::

    models/.venv/Scripts/python.exe models/sectioning/editor_packets.py \
        --scored <scored_survivors.jsonl> --snapshot-sha256 <64 hex> --output <dir>
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import random
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


SECTIONS: tuple[str, ...] = ("For Families", "For Couples", "For Golden Age Readers")
INSTRUMENT_B_PER_SECTION = 8
QUINTILE_LABELS: tuple[str, ...] = ("q1_lowest", "q2", "q3", "q4", "q5_highest")
INSTRUMENT_A_QUOTAS: dict[str, int] = {
    "q1_lowest": 25,
    "q2": 25,
    "q3": 20,
    "q4": 15,
    "q5_highest": 15,
}
INSTRUMENT_A_BLOCK_SIZE = 20

# The only fields permitted to reach a blind sheet. Extending this list is the one way
# model information can leak into an editor packet — treat additions as a design change.
EDITOR_DISPLAY_FIELDS: tuple[str, ...] = (
    "title",
    "start_date",
    "city",
    "source",
    "url",
    "description",
)

SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")

BLIND_SHEET_B_NAME = "instrument_b_editor_sheet.jsonl"
BLIND_SHEET_A_NAME = "instrument_a_editor_sheet.jsonl"
SEALED_KEY_NAME = "sealed_answer_key.json"


class PacketBuildError(ValueError):
    """Raised rather than silently shipping a packet that violates §90's design."""


@dataclasses.dataclass(frozen=True)
class ScoredRow:
    record_id: str
    unique_event_id: str
    p_include: float
    section_probabilities: dict[str, float]
    display: dict[str, str]

    def section_score(self, section: str) -> float:
        return self.p_include * self.section_probabilities[section]

    @property
    def predicted_section(self) -> str:
        """Argmax over the three automated sections; ``SECTIONS`` order breaks ties."""
        return max(SECTIONS, key=lambda s: (self.section_probabilities[s], -SECTIONS.index(s)))


@dataclasses.dataclass(frozen=True)
class Series:
    """One recurring program: every listing that shares a series key."""

    key: str
    representative: ScoredRow
    members: tuple[ScoredRow, ...]

    @property
    def size(self) -> int:
        return len(self.members)


@dataclasses.dataclass(frozen=True)
class Packets:
    instrument_b: list[dict[str, Any]]
    instrument_a: list[dict[str, Any]]
    seed_provenance: dict[str, Any]
    pool_size: int
    series_count: int


# --------------------------------------------------------------------------------------
# Seed derivation
# --------------------------------------------------------------------------------------

def derive_seed(snapshot_sha256: str, purpose: str) -> int:
    """Derive a per-purpose seed from the frozen snapshot digest.

    Separate purposes get separate streams so that changing one instrument's draw can
    never silently reshuffle the other.
    """
    digest = str(snapshot_sha256 or "").strip().lower()
    if not SHA256_HEX.match(digest):
        raise PacketBuildError(f"snapshot SHA-256 must be 64 lowercase hex characters, got {snapshot_sha256!r}")
    material = hashlib.sha256(f"{digest}:{purpose}".encode("utf-8")).hexdigest()
    return int(material[:16], 16)


# --------------------------------------------------------------------------------------
# Input validation
# --------------------------------------------------------------------------------------

def _probability(value: Any, label: str, record_id: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PacketBuildError(f"{record_id}: {label} must be a number, got {value!r}")
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise PacketBuildError(f"{record_id}: {label} must lie in [0, 1], got {number!r}")
    return number


def normalize_row(raw: dict[str, Any]) -> ScoredRow:
    record_id = str(raw.get("record_id") or "").strip()
    if not record_id:
        raise PacketBuildError(f"scored row has no record_id: {raw!r}")

    unique_event_id = str(raw.get("unique_event_id") or "").strip()
    if not unique_event_id:
        raise PacketBuildError(f"{record_id}: scored row has no unique_event_id to dedup identity on")

    probabilities = raw.get("section_probabilities")
    if not isinstance(probabilities, dict):
        raise PacketBuildError(f"{record_id}: section_probabilities must be an object")
    missing = [section for section in SECTIONS if section not in probabilities]
    if missing:
        raise PacketBuildError(f"{record_id}: section_probabilities missing {missing}")

    return ScoredRow(
        record_id=record_id,
        unique_event_id=unique_event_id,
        p_include=_probability(raw.get("p_include"), "p_include", record_id),
        section_probabilities={
            section: _probability(probabilities[section], f"section_probabilities[{section}]", record_id)
            for section in SECTIONS
        },
        display={field: str(raw.get(field) or "") for field in EDITOR_DISPLAY_FIELDS},
    )


def normalize_pool(raw_rows: Iterable[dict[str, Any]]) -> list[ScoredRow]:
    rows = [normalize_row(raw) for raw in raw_rows]
    _reject_duplicates(rows, key=lambda row: row.record_id, label="record_id")
    _reject_duplicates(rows, key=lambda row: row.unique_event_id, label="unique_event_id")
    return rows


def _reject_duplicates(rows: list[ScoredRow], *, key, label: str) -> None:
    seen: dict[str, str] = {}
    for row in rows:
        value = key(row)
        if value in seen:
            raise PacketBuildError(
                f"duplicate {label} {value!r} in the scored pool ({seen[value]} and {row.record_id}); "
                "the pool must already be deduplicated by live_runner"
            )
        seen[value] = row.record_id


# --------------------------------------------------------------------------------------
# Series collapsing — the Instrument A sampling unit
# --------------------------------------------------------------------------------------

def series_key(row: ScoredRow) -> str:
    """``gate_step4a.norm_title``'s convention: whitespace-collapsed lowercase title.

    Deliberately the same key the gate uses for leak-free CV folds, so "one event" means
    the same thing to the packets and to the model that scored them. Punctuation is NOT
    stripped, matching the gate; a blank title falls back to ``record_id`` so untitled
    rows never merge into one giant group.
    """
    normalized = re.sub(r"\s+", " ", row.display["title"].strip().lower())
    return normalized or row.record_id


def collapse_to_series(rows: list[ScoredRow], rng: random.Random) -> list[Series]:
    """Group listings into series and pick one representative each, reproducibly."""
    groups: dict[str, list[ScoredRow]] = defaultdict(list)
    for row in sorted(rows, key=lambda row: row.record_id):
        groups[series_key(row)].append(row)

    collapsed: list[Series] = []
    for key in sorted(groups):
        members = groups[key]
        representative = members[rng.randrange(len(members))]
        collapsed.append(Series(key=key, representative=representative, members=tuple(members)))
    return collapsed


# --------------------------------------------------------------------------------------
# Live ranking and rank-position quintiles (§91)
# --------------------------------------------------------------------------------------

def live_ranking(rows: list[ScoredRow]) -> dict[str, dict[str, Any]]:
    """Map ``record_id`` -> ``{live_rank, quintile}`` over whatever population is passed.

    ``live_rank`` is 1 for the highest ``p_include``. Quintiles are equal-count splits of
    the ascending ordering, so ``q1_lowest`` holds the lowest-scoring fifth — the stratum
    §90 deliberately over-samples, because a buried keeper can only hide there. Instrument
    A passes the series representatives, so a stratum is a fifth of the *events*, not a
    fifth of the listings.
    """
    if not rows:
        raise PacketBuildError("cannot rank an empty scored pool")
    ascending = sorted(rows, key=lambda row: (row.p_include, row.record_id))
    total = len(ascending)
    ranking: dict[str, dict[str, Any]] = {}
    for position, row in enumerate(ascending):
        ranking[row.record_id] = {
            "live_rank": total - position,
            "quintile": QUINTILE_LABELS[min(len(QUINTILE_LABELS) - 1, position * len(QUINTILE_LABELS) // total)],
        }
    return ranking


# --------------------------------------------------------------------------------------
# Instrument B — the product read, over listings
# --------------------------------------------------------------------------------------

def build_instrument_b(rows: list[ScoredRow], rng: random.Random) -> list[dict[str, Any]]:
    """Assign the top 8 listings per section by ``p_include * P(section)``.

    Global greedy over every (listing, section) pair: a listing can be claimed by at most
    one section, and a section stops at eight. Ordering is fully determined by
    ``(-score, record_id, section index)``, so the greedy is not sensitive to input order.
    Repeat listings of one series are NOT collapsed — see the module docstring.
    """
    pairs = [
        (-row.section_score(section), row.record_id, index, section, row)
        for row in rows
        for index, section in enumerate(SECTIONS)
    ]
    pairs.sort(key=lambda pair: (pair[0], pair[1], pair[2]))

    claimed: set[str] = set()
    by_section: dict[str, list[ScoredRow]] = {section: [] for section in SECTIONS}
    for _negative_score, record_id, _index, section, row in pairs:
        if record_id in claimed or len(by_section[section]) >= INSTRUMENT_B_PER_SECTION:
            continue
        claimed.add(record_id)
        by_section[section].append(row)

    short = {
        section: len(members)
        for section, members in by_section.items()
        if len(members) != INSTRUMENT_B_PER_SECTION
    }
    if short:
        raise PacketBuildError(
            f"Instrument B needs {INSTRUMENT_B_PER_SECTION} listings per section; "
            f"the pool of {len(rows)} could only fill {short} — packet not built"
        )

    assignments: list[dict[str, Any]] = []
    for section in SECTIONS:
        members = sorted(by_section[section], key=lambda row: row.record_id)
        rng.shuffle(members)  # presentation order carries no ranking signal
        for position, row in enumerate(members, start=1):
            assignments.append(
                {
                    "row": row,
                    "presented_section": section,
                    "presentation_position": position,
                    "b_score": row.section_score(section),
                }
            )
    return assignments


# --------------------------------------------------------------------------------------
# Instrument A — the validity read, over series
# --------------------------------------------------------------------------------------

def build_instrument_a(
    series: list[Series],
    ranking: dict[str, dict[str, Any]],
    excluded_keys: set[str],
    rng: random.Random,
) -> list[dict[str, Any]]:
    """Draw 25/25/20/15/15 series from the B-unused series of each quintile."""
    available: dict[str, list[Series]] = {label: [] for label in QUINTILE_LABELS}
    for item in sorted(series, key=lambda item: item.key):
        if item.key in excluded_keys:
            continue
        available[ranking[item.representative.record_id]["quintile"]].append(item)

    starved = {
        label: len(available[label])
        for label in QUINTILE_LABELS
        if len(available[label]) < INSTRUMENT_A_QUOTAS[label]
    }
    if starved:
        raise PacketBuildError(
            "Instrument A cannot meet its stratified quotas "
            f"{INSTRUMENT_A_QUOTAS}; available series after Instrument B: {starved} — packet not built"
        )

    drawn: list[tuple[str, Series]] = []
    for label in QUINTILE_LABELS:
        for item in rng.sample(available[label], INSTRUMENT_A_QUOTAS[label]):
            drawn.append((label, item))

    rng.shuffle(drawn)  # blocks must mix quintiles, or block position leaks the stratum
    total = sum(INSTRUMENT_A_QUOTAS.values())
    if len(drawn) != total:
        raise PacketBuildError(f"Instrument A drew {len(drawn)} series, expected {total}")

    assignments: list[dict[str, Any]] = []
    for index, (label, item) in enumerate(drawn):
        assignments.append(
            {
                "row": item.representative,
                "series": item,
                "quintile": label,
                "block": index // INSTRUMENT_A_BLOCK_SIZE + 1,
                "position_in_block": index % INSTRUMENT_A_BLOCK_SIZE + 1,
            }
        )
    return assignments


# --------------------------------------------------------------------------------------
# Packet assembly
# --------------------------------------------------------------------------------------

def build_packets(raw_rows: Iterable[dict[str, Any]], snapshot_sha256: str) -> Packets:
    rows = normalize_pool(raw_rows)

    seed_b = derive_seed(snapshot_sha256, "instrument_b")
    seed_a = derive_seed(snapshot_sha256, "instrument_a")
    seed_s = derive_seed(snapshot_sha256, "series_representative")

    # B is built over listings, A over series; the series population defines A's strata.
    instrument_b = build_instrument_b(rows, random.Random(seed_b))
    series = collapse_to_series(rows, random.Random(seed_s))
    ranking = live_ranking([item.representative for item in series])

    # Every listing inherits its series' rank and quintile, so a B row that is not its
    # own series' representative still reports a stratum in the sealed key.
    series_by_key = {item.key: item for item in series}
    ranking_by_record = {
        member.record_id: ranking[item.representative.record_id]
        for item in series
        for member in item.members
    }

    excluded = {series_key(entry["row"]) for entry in instrument_b}
    instrument_a = build_instrument_a(series, ranking, excluded, random.Random(seed_a))

    for entry in instrument_b:
        row = entry["row"]
        entry["sheet_row_id"] = f"B-{SECTIONS.index(entry['presented_section']) + 1}-{entry['presentation_position']:02d}"
        entry["series"] = series_by_key[series_key(row)]
        entry.update(ranking_by_record[row.record_id])
    for entry in instrument_a:
        entry["sheet_row_id"] = f"A-{entry['block']}-{entry['position_in_block']:02d}"
        entry["live_rank"] = ranking[entry["row"].record_id]["live_rank"]

    _reject_cross_packet_overlap(instrument_b, instrument_a)

    return Packets(
        instrument_b=instrument_b,
        instrument_a=instrument_a,
        seed_provenance={
            "snapshot_sha256": snapshot_sha256.strip().lower(),
            "derivation": "int(sha256(f'{snapshot_sha256}:{purpose}').hexdigest()[:16], 16)",
            "generator": "python random.Random (Mersenne Twister)",
            "instrument_b_seed": seed_b,
            "instrument_a_seed": seed_a,
            "series_representative_seed": seed_s,
        },
        pool_size=len(rows),
        series_count=len(series),
    )


def _reject_cross_packet_overlap(
    instrument_b: list[dict[str, Any]], instrument_a: list[dict[str, Any]]
) -> None:
    checks = (
        ("record_id", lambda entry: entry["row"].record_id),
        ("unique_event_id", lambda entry: entry["row"].unique_event_id),
        ("series_key", lambda entry: entry["series"].key),
    )
    for label, key in checks:
        b_values = [key(entry) for entry in instrument_b]
        a_values = [key(entry) for entry in instrument_a]
        overlap = sorted(set(b_values) & set(a_values))
        if overlap:
            raise PacketBuildError(f"instruments A and B share {label} {overlap} — packets must be disjoint")
        if len(set(a_values)) != len(a_values):
            raise PacketBuildError(f"Instrument A repeats {label} — it is drawn one row per series")
        # Instrument B deliberately allows repeat listings of one series; only its own
        # record identity must be unique.
        if label != "series_key" and len(set(b_values)) != len(b_values):
            raise PacketBuildError(f"Instrument B repeats {label}")


# --------------------------------------------------------------------------------------
# Blind sheets and the sealed key
# --------------------------------------------------------------------------------------

def blind_sheet_b(packets: Packets) -> list[dict[str, Any]]:
    """Whitelist-constructed rows. ``presented_section`` is the instrument, see docstring."""
    return [
        {
            "sheet_row_id": entry["sheet_row_id"],
            "presented_section": entry["presented_section"],
            **entry["row"].display,
        }
        for entry in packets.instrument_b
    ]


def blind_sheet_a(packets: Packets) -> list[dict[str, Any]]:
    """Whitelist-constructed rows. Block number is presentation order, not a stratum."""
    return [
        {
            "sheet_row_id": entry["sheet_row_id"],
            "block": entry["block"],
            **entry["row"].display,
        }
        for entry in packets.instrument_a
    ]


def sealed_answer_key(packets: Packets) -> dict[str, Any]:
    def unseal(entry: dict[str, Any], packet: str) -> dict[str, Any]:
        row: ScoredRow = entry["row"]
        item: Series = entry["series"]
        sealed = {
            "sheet_row_id": entry["sheet_row_id"],
            "packet": packet,
            "record_id": row.record_id,
            "unique_event_id": row.unique_event_id,
            "p_include": row.p_include,
            "section_probabilities": dict(row.section_probabilities),
            "predicted_section": row.predicted_section,
            "live_rank": entry["live_rank"],
            "quintile": entry["quintile"],
            "series_key": item.key,
            "series_size": item.size,
            "series_member_record_ids": [member.record_id for member in item.members],
            "series_member_dates": [member.display["start_date"] for member in item.members],
        }
        if packet == "B":
            sealed["presented_section"] = entry["presented_section"]
            sealed["b_score"] = entry["b_score"]
        else:
            sealed["block"] = entry["block"]
            sealed["position_in_block"] = entry["position_in_block"]
        return sealed

    b_series = {entry["series"].key for entry in packets.instrument_b}
    return {
        "schema_version": 2,
        "purpose": "Sealed §90 answer key — open only after the editor sitting is complete.",
        "decision_provenance": ["Decision_Log §90", "Decision_Log §91"],
        "calibration_anchors": "omitted by protocol (§90 records them as diagnostic; out of scope this pass)",
        "operating_point_applied": None,
        "pool_size": packets.pool_size,
        "series_count": packets.series_count,
        "sampling_units": {
            "instrument_b": "listings — repeats retained, because the repetition is the product finding",
            "instrument_a": "series — one row per series, strata cut over the series population",
            "series_key": "gate_step4a.norm_title convention: whitespace-collapsed lowercase title",
        },
        "instrument_b_distinct_series": len(b_series),
        "seed_provenance": packets.seed_provenance,
        "quintile_definition": "equal-count rank positions over ascending live p_include across the series population",
        "instrument_a_quotas": dict(INSTRUMENT_A_QUOTAS),
        "instrument_b_per_section": INSTRUMENT_B_PER_SECTION,
        "rows": [unseal(entry, "B") for entry in packets.instrument_b]
        + [unseal(entry, "A") for entry in packets.instrument_a],
    }


# --------------------------------------------------------------------------------------
# I/O
# --------------------------------------------------------------------------------------

def read_scored_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as error:
            raise PacketBuildError(f"{path}:{number} is not valid JSON: {error}") from error
        if not isinstance(payload, dict):
            raise PacketBuildError(f"{path}:{number} is not a JSON object")
        rows.append(payload)
    if not rows:
        raise PacketBuildError(f"{path} contains no scored survivors")
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def write_packets(packets: Packets, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_dir / BLIND_SHEET_B_NAME, blind_sheet_b(packets))
    write_jsonl(output_dir / BLIND_SHEET_A_NAME, blind_sheet_a(packets))
    (output_dir / SEALED_KEY_NAME).write_text(
        json.dumps(sealed_answer_key(packets), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the §90 Instrument A/B editor packets.")
    parser.add_argument("--scored", type=Path, required=True, help="scored-survivor JSONL from live_runner")
    parser.add_argument("--snapshot-sha256", required=True, help="frozen snapshot digest; the seed is derived from it")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    packets = build_packets(read_scored_jsonl(args.scored), args.snapshot_sha256)
    write_packets(packets, args.output)
    b_series = len({entry["series"].key for entry in packets.instrument_b})
    print(
        f"pool {packets.pool_size} listings -> {packets.series_count} series; "
        f"Instrument B {len(packets.instrument_b)} listings ({b_series} distinct series, "
        f"{INSTRUMENT_B_PER_SECTION} x {len(SECTIONS)} sections), "
        f"Instrument A {len(packets.instrument_a)} series in "
        f"{len(packets.instrument_a) // INSTRUMENT_A_BLOCK_SIZE} blocks; no anchors; sealed key: {args.output}"
    )


if __name__ == "__main__":
    main()
