"""Acceptance tests for the §90 editor-packet builder.

Synthetic fixtures only — no snapshot, no credentials, no embeddings, no network.

Run from the repository root:
    models/.venv/Scripts/python.exe models/sectioning/test_editor_packets.py
"""
import json
import random
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import editor_packets as ep


SNAPSHOT_SHA = "e46da19f654adc94c908f63e31ea6aa58bd58a0a9a23cc3f796a34b5a89efe53"
OTHER_SHA = "a" * 64

# Anything in a blind sheet matching one of these is model information reaching the editor.
FORBIDDEN_BLIND_KEYS = frozenset(
    {
        "p_include",
        "section_probabilities",
        "predicted_section",
        "live_rank",
        "rank",
        "quintile",
        "b_score",
        "score",
        "record_id",
        "unique_event_id",
        "packet",
        "presentation_position",
        "position_in_block",
        "series_key",
        "series_size",
        "series_member_record_ids",
        "series_member_dates",
        "gate_fit_overlap",
    }
)


def fixture_pool(n_series=224, extra_listings=97, seed=20260806, correlate_sections=False):
    """A synthetic scored-survivor pool that mirrors the real recurring-series structure.

    Defaults reproduce the 2026-08-13 shape: 321 listings collapsing to 224 series.
    Repeat listings of one series share a title and score within noise, as measured.
    """
    rng = random.Random(seed)
    sizes = [1] * n_series
    for index in range(extra_listings):
        sizes[index % n_series] += 1

    rows = []
    listing = 0
    for series_index in range(n_series):
        base = round(rng.random(), 6)
        if correlate_sections:
            weights = [base, base / 2, base / 3]
        else:
            weights = [rng.random() for _ in range(3)]
        total = sum(weights) or 1.0
        probabilities = {
            section: round(weight / total, 6)
            for section, weight in zip(ep.SECTIONS, weights)
        }
        for member in range(sizes[series_index]):
            day = 14 + listing % 10
            rows.append(
                {
                    "record_id": f"rec{listing:04d}",
                    "unique_event_id": f"Event {series_index}|2026-08-{day:02d}",
                    # Same title across members: this is what makes them one series.
                    "title": f"Event {series_index}",
                    "start_date": f"2026-08-{day:02d}",
                    "city": "Vaughan",
                    "source": "VPL",
                    "url": f"https://example.test/e/{listing}",
                    "description": f"Description for event {series_index}",
                    "p_include": min(1.0, max(0.0, round(base + rng.uniform(-0.002, 0.002), 6))),
                    "section_probabilities": probabilities,
                }
            )
            listing += 1
    return rows


class EditorPacketTests(unittest.TestCase):
    def setUp(self):
        self.pool = fixture_pool()
        self.packets = ep.build_packets(self.pool, SNAPSHOT_SHA)
        self.key = ep.sealed_answer_key(self.packets)
        self.by_sheet_id = {row["sheet_row_id"]: row for row in self.key["rows"]}

    # -- Series collapsing -------------------------------------------------------------

    def test_the_pool_collapses_to_series_on_the_gate_grouping_key(self):
        self.assertEqual(321, self.packets.pool_size)
        self.assertEqual(224, self.packets.series_count)

    def test_series_key_matches_gate_step4a_norm_title_and_never_merges_blank_titles(self):
        def row(record_id, title):
            return ep.normalize_row(
                {
                    "record_id": record_id,
                    "unique_event_id": f"{title}|2026-08-14",
                    "title": title,
                    "p_include": 0.5,
                    "section_probabilities": {s: 1 / 3 for s in ep.SECTIONS},
                }
            )

        # Whitespace collapsed and lowercased, punctuation preserved — gate_step4a's rule.
        self.assertEqual("baby social", ep.series_key(row("a", "  Baby   Social ")))
        self.assertEqual("baby social", ep.series_key(row("b", "BABY SOCIAL")))
        self.assertNotEqual(ep.series_key(row("c", "Mini-Makers")), ep.series_key(row("d", "Mini Makers")))
        # A blank title falls back to record_id so untitled rows never form one giant group.
        self.assertEqual("e", ep.series_key(row("e", "   ")))
        self.assertNotEqual(ep.series_key(row("e", "")), ep.series_key(row("f", "")))

    def test_a_series_representative_is_drawn_from_its_own_members(self):
        collapsed = ep.collapse_to_series(ep.normalize_pool(self.pool), random.Random(7))
        self.assertEqual(224, len(collapsed))
        for item in collapsed:
            self.assertIn(item.representative, item.members)
            self.assertEqual(1, len({ep.series_key(m) for m in item.members}))
        self.assertEqual(321, sum(item.size for item in collapsed))

    # -- Instrument B ------------------------------------------------------------------

    def test_instrument_b_is_24_listings_at_8_per_section(self):
        self.assertEqual(24, len(self.packets.instrument_b))
        counts = Counter(entry["presented_section"] for entry in self.packets.instrument_b)
        self.assertEqual({section: 8 for section in ep.SECTIONS}, dict(counts))
        self.assertEqual(24, len({entry["row"].record_id for entry in self.packets.instrument_b}))

    def test_instrument_b_collapses_repeat_listings_of_one_series(self):
        """Production permits one recurring series per section/week."""
        # One series with the ten highest scores: B should show one, then fill down.
        pool = fixture_pool(n_series=224, extra_listings=0)
        for row in pool[:10]:
            row["title"] = "Mini Camp"
            row["unique_event_id"] = f"Mini Camp|{row['start_date']}"
            row["p_include"] = 0.99
            row["section_probabilities"] = {"For Families": 0.98, "For Couples": 0.01, "For Golden Age Readers": 0.01}
        packets = ep.build_packets(pool, SNAPSHOT_SHA)
        families = [e for e in packets.instrument_b if e["presented_section"] == "For Families"]
        self.assertEqual(8, len(families))
        self.assertEqual(1, sum(1 for e in families if e["series"].key == "mini camp"))
        self.assertEqual(8, len({e["series"].key for e in families}))
        # ...and that series is then wholly barred from Instrument A.
        self.assertEqual(0, sum(1 for e in packets.instrument_a if e["series"].key == "mini camp"))

    def test_instrument_b_picks_the_highest_p_include_times_section_probability(self):
        chosen = {entry["row"].record_id for entry in self.packets.instrument_b}
        chosen_series = {entry["series"].key for entry in self.packets.instrument_b}
        by_record = {row.record_id: row for row in ep.normalize_pool(self.pool)}
        for entry in self.packets.instrument_b:
            section = entry["presented_section"]
            floor = entry["b_score"]
            displaced = [
                other.record_id
                for other in by_record.values()
                if other.record_id not in chosen
                and ep.series_key(other) not in chosen_series
                and other.section_score(section) > floor
            ]
            self.assertEqual([], displaced, f"{section} kept a lower-scoring row over {displaced[:3]}")

    # -- Instrument A ------------------------------------------------------------------

    def test_instrument_a_is_100_rows_stratified_25_25_20_15_15(self):
        self.assertEqual(100, len(self.packets.instrument_a))
        counts = Counter(entry["quintile"] for entry in self.packets.instrument_a)
        self.assertEqual(ep.INSTRUMENT_A_QUOTAS, dict(counts))

    def test_instrument_a_is_100_distinct_series_so_effective_n_equals_row_count(self):
        keys = [entry["series"].key for entry in self.packets.instrument_a]
        self.assertEqual(100, len(set(keys)), "a repeated series would make effective n < 100")
        titles = [entry["row"].display["title"] for entry in self.packets.instrument_a]
        self.assertEqual(100, len(set(titles)))

    def test_instrument_a_quintiles_are_cut_over_the_series_population_not_the_listings(self):
        """Option A: sampling unit and stratum unit are both the series."""
        rows = ep.normalize_pool(self.pool)
        series = ep.collapse_to_series(rows, random.Random(ep.derive_seed(SNAPSHOT_SHA, "series_representative")))
        ranking = ep.live_ranking([item.representative for item in series])
        self.assertEqual(224, len(ranking))
        counts = Counter(entry["quintile"] for entry in ranking.values())
        for label in ep.QUINTILE_LABELS:
            self.assertAlmostEqual(224 / 5, counts[label], delta=1)
        for entry in self.packets.instrument_a:
            self.assertEqual(ranking[entry["row"].record_id]["quintile"], entry["quintile"])
            self.assertEqual(ranking[entry["row"].record_id]["live_rank"], entry["live_rank"])

        # Listing-level quintiles would be a different cut — prove the two differ here.
        listing_ranking = ep.live_ranking(rows)
        self.assertEqual(321, len(listing_ranking))
        differing = sum(
            1
            for entry in self.packets.instrument_a
            if listing_ranking[entry["row"].record_id]["quintile"] != entry["quintile"]
        )
        self.assertGreater(differing, 0, "series and listing strata coincide — the test proves nothing")

    def test_instrument_a_is_five_blocks_of_twenty_that_mix_quintiles(self):
        blocks = Counter(entry["block"] for entry in self.packets.instrument_a)
        self.assertEqual({1: 20, 2: 20, 3: 20, 4: 20, 5: 20}, dict(blocks))
        for block in sorted(blocks):
            strata = {e["quintile"] for e in self.packets.instrument_a if e["block"] == block}
            self.assertGreater(len(strata), 1, f"block {block} is a single stratum — position leaks it")

    def test_no_calibration_anchors_are_appended(self):
        self.assertEqual(sum(ep.INSTRUMENT_A_QUOTAS.values()), len(self.packets.instrument_a))
        self.assertIn("omitted by protocol", self.key["calibration_anchors"])
        self.assertIsNone(self.key["operating_point_applied"])

    # -- Disjointness ------------------------------------------------------------------

    def test_no_duplicate_event_identity_within_or_across_packets(self):
        for attribute in ("record_id", "unique_event_id"):
            b_values = [getattr(e["row"], attribute) for e in self.packets.instrument_b]
            a_values = [getattr(e["row"], attribute) for e in self.packets.instrument_a]
            self.assertEqual(len(b_values), len(set(b_values)), f"B repeats a {attribute}")
            self.assertEqual(len(a_values), len(set(a_values)), f"A repeats a {attribute}")
            self.assertEqual(set(), set(b_values) & set(a_values), f"A and B share a {attribute}")

        b_series = {e["series"].key for e in self.packets.instrument_b}
        a_series = {e["series"].key for e in self.packets.instrument_a}
        self.assertEqual(set(), b_series & a_series, "an event judged in both instruments is not independent")

        sheet_ids = [e["sheet_row_id"] for e in self.packets.instrument_b + self.packets.instrument_a]
        self.assertEqual(len(sheet_ids), len(set(sheet_ids)))

    # -- Blindness ---------------------------------------------------------------------

    def test_blind_sheets_carry_display_fields_only(self):
        display = set(ep.EDITOR_DISPLAY_FIELDS)
        for row in ep.blind_sheet_b(self.packets):
            self.assertEqual(display | {"sheet_row_id", "presented_section"}, set(row))
        for row in ep.blind_sheet_a(self.packets):
            self.assertEqual(display | {"sheet_row_id", "block"}, set(row))

    def test_blind_sheets_contain_no_model_or_series_information(self):
        sheets = ep.blind_sheet_b(self.packets) + ep.blind_sheet_a(self.packets)
        for row in sheets:
            self.assertEqual(set(), set(row) & FORBIDDEN_BLIND_KEYS)
            for value in row.values():
                self.assertIsInstance(value, (str, int))
                self.assertNotIsInstance(value, float)

        serialized = json.dumps(sheets)
        for token in ("p_include", "section_probabilities", "quintile", "live_rank", "b_score", "series"):
            self.assertNotIn(token, serialized)
        for row in ep.normalize_pool(self.pool)[:50]:
            self.assertNotIn(repr(row.p_include), serialized)

    def test_unknown_scored_fields_cannot_reach_a_blind_sheet(self):
        """Whitelist construction, not blacklist filtering — new upstream fields stay out."""
        pool = [dict(row, gate_fit_overlap=True, secret_score=0.99) for row in self.pool]
        packets = ep.build_packets(pool, SNAPSHOT_SHA)
        blob = json.dumps(ep.blind_sheet_a(packets) + ep.blind_sheet_b(packets))
        self.assertNotIn("gate_fit_overlap", blob)
        self.assertNotIn("secret_score", blob)

    def test_sealed_key_holds_everything_the_blind_sheets_withhold(self):
        self.assertEqual(124, len(self.key["rows"]))
        self.assertEqual({"A": 100, "B": 24}, dict(Counter(r["packet"] for r in self.key["rows"])))
        for row in ep.blind_sheet_a(self.packets) + ep.blind_sheet_b(self.packets):
            sealed = self.by_sheet_id[row["sheet_row_id"]]
            for field in ("record_id", "unique_event_id", "p_include", "section_probabilities",
                          "predicted_section", "live_rank", "quintile", "packet",
                          "series_key", "series_size", "series_member_record_ids"):
                self.assertIn(field, sealed)
            self.assertEqual(sealed["series_size"], len(sealed["series_member_record_ids"]))
            self.assertIn(sealed["record_id"], sealed["series_member_record_ids"])
        self.assertEqual(SNAPSHOT_SHA, self.key["seed_provenance"]["snapshot_sha256"])
        self.assertEqual(321, self.key["pool_size"])
        self.assertEqual(224, self.key["series_count"])
        self.assertIn("series", self.key["sampling_units"]["instrument_a"])

    # -- Determinism -------------------------------------------------------------------

    def test_reruns_are_byte_identical_and_independent_of_input_order(self):
        with tempfile.TemporaryDirectory() as temp:
            first_dir, second_dir = Path(temp) / "one", Path(temp) / "two"
            ep.write_packets(self.packets, first_dir)
            first = {p.name: p.read_bytes() for p in sorted(first_dir.iterdir())}
            ep.write_packets(ep.build_packets(list(reversed(self.pool)), SNAPSHOT_SHA), second_dir)
            second = {p.name: p.read_bytes() for p in sorted(second_dir.iterdir())}

        self.assertEqual(
            {ep.BLIND_SHEET_A_NAME, ep.BLIND_SHEET_B_NAME, ep.SEALED_KEY_NAME}, set(first)
        )
        self.assertEqual(first, second)

    def test_the_seed_comes_from_the_snapshot_digest(self):
        self.assertEqual(
            ep.derive_seed(SNAPSHOT_SHA, "instrument_a"), ep.derive_seed(SNAPSHOT_SHA.upper(), "instrument_a")
        )
        self.assertEqual(
            3, len({ep.derive_seed(SNAPSHOT_SHA, p) for p in ("instrument_a", "instrument_b", "series_representative")})
        )

        other = ep.build_packets(self.pool, OTHER_SHA)
        self.assertNotEqual(
            [e["row"].record_id for e in self.packets.instrument_a],
            [e["row"].record_id for e in other.instrument_a],
        )
        self.assertEqual(
            sorted(e["row"].record_id for e in self.packets.instrument_b),
            sorted(e["row"].record_id for e in other.instrument_b),
        )

        for bad in ("", "not-a-digest", "A" * 63, SNAPSHOT_SHA + "0"):
            with self.subTest(digest=bad):
                with self.assertRaises(ep.PacketBuildError):
                    ep.derive_seed(bad, "instrument_a")

    # -- Loud failure ------------------------------------------------------------------

    def test_a_pool_too_small_for_instrument_b_fails_loudly(self):
        with self.assertRaisesRegex(ep.PacketBuildError, "Instrument B needs 8"):
            ep.build_packets(fixture_pool(n_series=20, extra_listings=0), SNAPSHOT_SHA)

    def test_too_few_series_fails_loudly_rather_than_under_filling_a_stratum(self):
        """124 listings that collapse to 62 series cannot fill 100 distinct-series draws."""
        with self.assertRaisesRegex(ep.PacketBuildError, "cannot meet its stratified quotas"):
            ep.build_packets(fixture_pool(n_series=62, extra_listings=62), SNAPSHOT_SHA)

    def test_a_drained_quintile_fails_loudly(self):
        with self.assertRaisesRegex(ep.PacketBuildError, "cannot meet its stratified quotas"):
            ep.build_packets(
                fixture_pool(n_series=124, extra_listings=0, correlate_sections=True), SNAPSHOT_SHA
            )

    def test_malformed_scored_rows_fail_loudly(self):
        cases = [
            ("no record_id", lambda row: row.pop("record_id")),
            ("no unique_event_id", lambda row: row.pop("unique_event_id")),
            ("missing section", lambda row: row["section_probabilities"].pop("For Couples")),
            ("p_include absent", lambda row: row.pop("p_include")),
            ("p_include out of range", lambda row: row.update(p_include=1.4)),
            ("p_include not numeric", lambda row: row.update(p_include="0.5")),
            ("section prob out of range", lambda row: row["section_probabilities"].update({"For Families": -0.1})),
            ("section_probabilities not an object", lambda row: row.update(section_probabilities=[])),
        ]
        for label, mutate in cases:
            with self.subTest(case=label):
                pool = fixture_pool(n_series=200, extra_listings=40)
                mutate(pool[7])
                with self.assertRaises(ep.PacketBuildError):
                    ep.build_packets(pool, SNAPSHOT_SHA)

    def test_a_pool_that_is_not_already_deduplicated_fails_loudly(self):
        pool = fixture_pool(n_series=200, extra_listings=40)
        pool[9]["unique_event_id"] = pool[8]["unique_event_id"]
        with self.assertRaisesRegex(ep.PacketBuildError, "duplicate unique_event_id"):
            ep.build_packets(pool, SNAPSHOT_SHA)

        pool = fixture_pool(n_series=200, extra_listings=40)
        pool[9]["record_id"] = pool[8]["record_id"]
        with self.assertRaisesRegex(ep.PacketBuildError, "duplicate record_id"):
            ep.build_packets(pool, SNAPSHOT_SHA)

    def test_empty_and_unparseable_input_files_fail_loudly(self):
        with tempfile.TemporaryDirectory() as temp:
            empty = Path(temp) / "empty.jsonl"
            empty.write_text("\n\n", encoding="utf-8")
            with self.assertRaisesRegex(ep.PacketBuildError, "no scored survivors"):
                ep.read_scored_jsonl(empty)

            broken = Path(temp) / "broken.jsonl"
            broken.write_text('{"record_id": "a"}\nnot json\n', encoding="utf-8")
            with self.assertRaisesRegex(ep.PacketBuildError, "not valid JSON"):
                ep.read_scored_jsonl(broken)


if __name__ == "__main__":
    unittest.main(verbosity=2)
