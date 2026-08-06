"""Acceptance tests for #125's read-only live-runner plumbing.

Run from the repository root:
    models/.venv/Scripts/python.exe models/sectioning/test_live_runner.py
"""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import live_runner


def record(record_id, **fields):
    return {"id": record_id, "fields": fields}


def base_fields(**overrides):
    fields = {
        "Status": "New",
        "Event Title": "A local event",
        "URL": "https://example.test/event",
        "Start Date": "2026-08-14",
        "UniqueEventID": "a local event|2026-08-14",
        "DescriptionRaw": "",
        "Source": "VPL",
        "City": "Vaughan",
    }
    fields.update(overrides)
    return fields


class LiveRunnerAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.config = live_runner.RunConfig(issue_date="2026-08-13")

    def test_snapshot_eligibility_matches_depthcheck_contract_with_typed_rejections(self):
        cases = [
            ("snapshot_eligibility.rejected_status", record("r1", **base_fields(Status="Rejected"))),
            ("snapshot_eligibility.missing_url", record("r2", **base_fields(URL="", Source="Facebook"))),
            ("snapshot_eligibility.invalid_start_date", record("r3", **base_fields(**{"Start Date": "not-a-date"}))),
            ("snapshot_eligibility.outside_issue_window", record("r4", **base_fields(**{"Start Date": "2026-08-24"}))),
        ]
        for expected_rule, candidate in cases:
            with self.subTest(rule=expected_rule):
                decision = live_runner.snapshot_eligibility_decision(candidate, self.config)
                self.assertFalse(decision.survives)
                self.assertEqual(expected_rule, decision.rule)

        self.assertTrue(live_runner.snapshot_eligibility_decision(
            record("first", **base_fields(**{"Start Date": "2026-08-14"})), self.config
        ).survives)
        self.assertTrue(live_runner.snapshot_eligibility_decision(
            record("last", **base_fields(**{"Start Date": "2026-08-23"})), self.config
        ).survives)

    def test_stage0_recheck_mirrors_clean_filter_facebook_exception_and_eventbrite_rules(self):
        cases = [
            ("stage0.missing_title", record("r1", **base_fields(**{"Event Title": ""}))),
            ("stage0.eventbrite_host_not_allowed", record("r2", **base_fields(
                URL="https://www.eventbrite.fr/e/local-looking-event", Source="Eventbrite"
            ))),
            ("stage0.eventbrite_city_not_covered", record("r3", **base_fields(
                URL="https://www.eventbrite.ca/e/local-looking-event", Source="Eventbrite", City="Toronto"
            ))),
        ]
        for expected_rule, candidate in cases:
            with self.subTest(rule=expected_rule):
                decision = live_runner.stage0_recheck_decision(candidate)
                self.assertFalse(decision.survives)
                self.assertEqual(expected_rule, decision.rule)

        facebook_linkless = record("fb", **base_fields(URL="", Source="Facebook"))
        self.assertTrue(live_runner.stage0_recheck_decision(facebook_linkless).survives)
        online = record("online", **base_fields(City="Online", Source="VPL"))
        self.assertTrue(live_runner.stage0_recheck_decision(online).survives)

    def test_text_uses_the_shared_300_character_recipe(self):
        raw = "Overview\n" + ("x" * 400)
        candidate = record("recipe", **base_fields(DescriptionRaw=raw))
        item = live_runner.scoring_input(candidate)
        self.assertEqual("A local event " + ("x" * 300), item["text"])
        self.assertEqual(hashlib.sha256(item["text"].encode("utf-8")).hexdigest(), item["text_sha256"])

    def test_dedup_happens_after_stage0_and_every_loser_stays_in_the_ledger(self):
        winner = record("winner", **base_fields(
            UniqueEventID="same event|2026-08-14", DescriptionRaw="long description"
        ))
        loser = record("loser", **base_fields(
            UniqueEventID="same event|2026-08-14", DescriptionRaw="short"
        ))
        result = live_runner.prepare_run([winner, loser], self.config)

        self.assertEqual(["winner"], [r["record_id"] for r in result.survivors])
        loser_ledger = next(r for r in result.ledger if r["record_id"] == "loser")
        self.assertEqual("dedup.loser_shorter_description", loser_ledger["dedup"]["rule"])
        self.assertFalse(loser_ledger["survives"])

    def test_frozen_snapshot_digest_and_certified_eligibility_are_pinned(self):
        snapshot = HERE.parent.parent / "data/tracking/snapshots/candidates_2026-08-06_0944.json"
        records = live_runner.load_snapshot(snapshot, expected_sha256=live_runner.DEFAULT_SNAPSHOT_SHA256)
        config = live_runner.RunConfig(issue_date="2026-08-13", expected_certified_eligible=321)
        result = live_runner.prepare_run(records, config)
        self.assertEqual(321, result.certified_eligible_count)
        self.assertEqual(321, result.stage0_survivor_count)
        self.assertEqual(321, len(result.survivors))
        self.assertEqual(321, len(result.scoring_inputs))
        self.assertEqual("voyage-4-large", result.embedding_manifest["model"])
        self.assertEqual(2048, result.embedding_manifest["output_dimension"])
        self.assertEqual("upstream_only", result.stage0_provenance["all_events_full_address_guard"])

        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "runner"
            live_runner.write_output_scaffold(result, out)
            first = {path.name: path.read_bytes() for path in sorted(out.iterdir())}
            live_runner.write_output_scaffold(result, out)
            second = {path.name: path.read_bytes() for path in sorted(out.iterdir())}
        self.assertEqual(first, second)

    def test_embedding_cache_batches_in_order_validates_dimension_and_hits_offline(self):
        records = [
            record("one", **base_fields(UniqueEventID="one|2026-08-14", DescriptionRaw="first")),
            record("two", **base_fields(UniqueEventID="two|2026-08-14", DescriptionRaw="second")),
        ]
        result = live_runner.prepare_run(records, self.config)
        calls = []

        def fake_embedder(batch):
            calls.append([row["record_id"] for row in batch])
            return [[float({"one": 1, "two": 2}[row["record_id"]])] * 2048 for row in batch]

        with tempfile.TemporaryDirectory() as temp:
            cache_dir = Path(temp)
            materialized = live_runner.materialize_embedding_cache(
                result.scoring_inputs, cache_dir, allow_network=True, embedder=fake_embedder, batch_size=1
            )
            matrix = materialized.matrix
            self.assertEqual("materialized", materialized.status)
            self.assertEqual(2, materialized.provider_calls)
            self.assertEqual([["one"], ["two"]], calls)
            self.assertEqual((2, 2048), matrix.shape)
            self.assertEqual(1.0, float(matrix[0, 0]))
            self.assertEqual(2.0, float(matrix[1, 0]))
            calls.clear()
            hit = live_runner.materialize_embedding_cache(
                result.scoring_inputs, cache_dir, allow_network=False, embedder=fake_embedder, batch_size=1
            )
            self.assertEqual([], calls)
            self.assertEqual("cache_hit", hit.status)
            self.assertEqual(0, hit.provider_calls)
            self.assertEqual(matrix.tolist(), hit.matrix.tolist())

            manifest_path = cache_dir / live_runner.CACHE_MANIFEST_NAME
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["input_type"] = "document"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(live_runner.NetworkEmbeddingDisabled):
                live_runner.materialize_embedding_cache(result.scoring_inputs, cache_dir, allow_network=False)

            changed = [dict(row) for row in result.scoring_inputs]
            changed[0]["text_sha256"] = "0" * 64
            with self.assertRaises(live_runner.NetworkEmbeddingDisabled):
                live_runner.materialize_embedding_cache(changed, cache_dir, allow_network=False)

        with self.assertRaises(live_runner.NetworkEmbeddingDisabled):
            live_runner.materialize_embedding_cache(result.scoring_inputs, Path(tempfile.gettempdir()) / "missing-nlap-cache")

    def test_ariel_owned_fit_and_score_seam_fails_loud_before_any_scoring(self):
        with self.assertRaisesRegex(live_runner.ArielAuthoredCoreRequired, "TODO\\(ariel\\)"):
            live_runner.fit_and_score_live_survivors([], {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
