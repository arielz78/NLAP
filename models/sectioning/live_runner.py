"""#125 read-only live-runner scaffold.

The 321-row assertion is deliberately a *snapshot-eligibility* check matching
``depthCheck.js`` (not a claim about raw R1 Stage 0).  The runner then performs only
offline-recheckable R1 Stage 0 rules: Clean/Filter completeness, Eventbrite host, and
Eventbrite canonical city.  AllEvents address geography was applied upstream and cannot
be replayed because Candidate snapshots do not retain ``venue.full_address``.

Default execution is local-only: it stages rows and writes no embeddings or scores.
``--materialize-embeddings --allow-network`` explicitly materializes (or validates a
cache of) live embeddings, fits the two frozen heads, and writes raw ranking scores.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import re
import tempfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Iterable

import numpy as np

from text_recipe import clean, serve_text


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CORPORA = HERE / "corpora"
DEFAULT_SNAPSHOT = ROOT / "data/tracking/snapshots/candidates_2026-08-06_0944.json"
DEFAULT_SNAPSHOT_SHA256 = "e46da19f654adc94c908f63e31ea6aa58bd58a0a9a23cc3f796a34b5a89efe53"
DEFAULT_OUTPUT = ROOT / "data/tracking/r7_live_runner/issue_2026-08-13"

MODEL = "voyage-4-large"
OUTPUT_DIMENSION = 2048
EVENTBRITE_ALLOWED_HOST = re.compile(r"(^|\.)eventbrite\.(ca|com)$", re.IGNORECASE)
EVENTBRITE_HOST = re.compile(r"(^|\.)eventbrite\.", re.IGNORECASE)
HTTP_HOST = re.compile(r"^https?://(?:www\.)?([^/]+)", re.IGNORECASE)
EVENTBRITE_CITIES = frozenset({"Vaughan", "Markham", "Richmond Hill"})
CACHE_MATRIX_NAME = "embeddings_voyage-4-large_2048d.npy"
CACHE_MANIFEST_NAME = "embeddings_voyage-4-large_2048d.manifest.json"


@dataclasses.dataclass(frozen=True)
class RunConfig:
    issue_date: str
    expected_certified_eligible: int | None = None

    @property
    def issue_day(self) -> date:
        return parse_ymd(self.issue_date)

    @property
    def window_start(self) -> date:
        return self.issue_day + timedelta(days=1)

    @property
    def window_end(self) -> date:
        return self.issue_day + timedelta(days=10)


@dataclasses.dataclass(frozen=True)
class Decision:
    survives: bool
    rule: str
    event_day: str | None = None


@dataclasses.dataclass(frozen=True)
class PreparedRun:
    config: RunConfig
    ledger: list[dict[str, Any]]
    survivors: list[dict[str, Any]]
    scoring_inputs: list[dict[str, Any]]
    embedding_manifest: dict[str, Any]
    stage0_provenance: dict[str, str]
    certified_eligible_count: int
    stage0_survivor_count: int


@dataclasses.dataclass(frozen=True)
class EmbeddingCacheResult:
    """A validated live matrix plus audit facts about how this invocation obtained it."""

    matrix: np.ndarray
    status: str  # cache_hit | materialized
    provider_calls: int


class NetworkEmbeddingDisabled(RuntimeError):
    """Raised whenever a cache miss would require an embedding request without consent."""


def parse_ymd(value: Any) -> date:
    text = str(value or "").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        raise ValueError(f"not an ISO calendar date: {value!r}")
    return date.fromisoformat(text)


def fields_of(record: dict[str, Any]) -> dict[str, Any]:
    fields = record.get("fields")
    if not isinstance(fields, dict):
        raise ValueError(f"record {record.get('id', '<unknown>')!r} has no fields object")
    return fields


def eventbrite_host(url: Any) -> str:
    """Mirror Clean/Filter's HTTP-host extraction, including its no-match behaviour."""
    match = HTTP_HOST.match(str(url or "").strip())
    return match.group(1).lower() if match else ""


def snapshot_eligibility_decision(record: dict[str, Any], config: RunConfig) -> Decision:
    """Reproduce depthCheck's certified snapshot denominator, not Stage 0."""
    fields = fields_of(record)
    if fields.get("Status") == "Rejected":
        return Decision(False, "snapshot_eligibility.rejected_status")
    if not str(fields.get("URL") or "").strip():
        return Decision(False, "snapshot_eligibility.missing_url")
    try:
        event_day = parse_ymd(fields.get("Start Date"))
    except ValueError:
        return Decision(False, "snapshot_eligibility.invalid_start_date")
    if not config.window_start <= event_day <= config.window_end:
        return Decision(False, "snapshot_eligibility.outside_issue_window", event_day.isoformat())
    return Decision(True, "snapshot_eligibility.pass", event_day.isoformat())


def stage0_recheck_decision(record: dict[str, Any]) -> Decision:
    """Apply only R1 rules visible in a Candidate snapshot.

    Clean/Filter permits linkless Facebook entries.  The preceding certified pool does
    not contain them because depthCheck's independent supply contract requires URL.
    """
    fields = fields_of(record)
    title = str(fields.get("Event Title") or "").strip()
    url = str(fields.get("URL") or "").strip()
    source = str(fields.get("Source") or "").strip()
    if not title:
        return Decision(False, "stage0.missing_title")
    if not url and source != "Facebook":
        return Decision(False, "stage0.missing_url")
    host = eventbrite_host(url)
    if EVENTBRITE_HOST.search(host) and not EVENTBRITE_ALLOWED_HOST.search(host):
        return Decision(False, "stage0.eventbrite_host_not_allowed")
    if EVENTBRITE_HOST.search(host) and str(fields.get("City") or "").strip() not in EVENTBRITE_CITIES:
        return Decision(False, "stage0.eventbrite_city_not_covered")
    return Decision(True, "stage0.pass")


def ledger_identity(record: dict[str, Any]) -> dict[str, Any]:
    fields = fields_of(record)
    return {
        "record_id": record.get("id", ""),
        "unique_event_id": fields.get("UniqueEventID", ""),
        "title": fields.get("Event Title", ""),
        "source": fields.get("Source", ""),
        "start_date": fields.get("Start Date", ""),
    }


def decision_json(decision: Decision | None) -> dict[str, Any] | None:
    if decision is None:
        return None
    return {"survives": decision.survives, "rule": decision.rule, "event_day": decision.event_day}


def has_url(record: dict[str, Any]) -> bool:
    return bool(str(fields_of(record).get("URL") or "").strip())


def richer_winner(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """Use R1's source-agnostic URL -> description -> merge-order comparator."""
    if has_url(left) != has_url(right):
        return left if has_url(left) else right
    left_len = len(str(fields_of(left).get("DescriptionRaw") or ""))
    right_len = len(str(fields_of(right).get("DescriptionRaw") or ""))
    if left_len != right_len:
        return left if left_len > right_len else right
    return right


def dedup_rule(winner: dict[str, Any], loser: dict[str, Any]) -> str:
    if has_url(winner) != has_url(loser):
        return "dedup.loser_missing_url"
    winner_len = len(str(fields_of(winner).get("DescriptionRaw") or ""))
    loser_len = len(str(fields_of(loser).get("DescriptionRaw") or ""))
    if winner_len != loser_len:
        return "dedup.loser_shorter_description"
    return "dedup.loser_merge_order_tie"


def scoring_input(record: dict[str, Any]) -> dict[str, Any]:
    fields = fields_of(record)
    title = str(fields.get("Event Title") or "").strip()
    text = serve_text(title, fields.get("DescriptionRaw"))
    return {
        "record_id": record.get("id", ""),
        "unique_event_id": fields.get("UniqueEventID", ""),
        "title": title,
        "source": fields.get("Source", ""),
        "city": fields.get("City", ""),
        "start_date": str(fields.get("Start Date") or "")[:10],
        "url": fields.get("URL", ""),
        # Editor-facing copy only. The model still consumes `text` below, built by the
        # frozen serve_text recipe; exposing this field cannot change its embedding.
        "description": clean(fields.get("DescriptionRaw")),
        "text": text,
        "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }


def input_sha256(scoring_inputs: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for row in scoring_inputs:
        digest.update(row["record_id"].encode("utf-8"))
        digest.update(b"\x00")
        digest.update(row["text_sha256"].encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def manifest_for(scoring_inputs: list[dict[str, Any]], config: RunConfig) -> dict[str, Any]:
    return {
        "schema_version": 2,
        "issue_date": config.issue_date,
        "window": [config.window_start.isoformat(), config.window_end.isoformat()],
        "model": MODEL,
        "output_dimension": OUTPUT_DIMENSION,
        "text_recipe": "Event Title + clean(DescriptionRaw)",
        "embedding_cache_contract": {
            "matrix_filename": CACHE_MATRIX_NAME,
            "manifest_filename": CACHE_MANIFEST_NAME,
            "row_key": "record_id",
            "input_fingerprint": "record_id + NUL + text_sha256 + newline, in scoring_input order",
            "input_sha256": input_sha256(scoring_inputs),
            "network_permitted_by_default": False,
            "cache_written_by_default_run": False,
        },
        "n_rows": len(scoring_inputs),
    }


def prepare_run(records: Iterable[dict[str, Any]], config: RunConfig) -> PreparedRun:
    """Build a per-record two-phase ledger, then deduplicate Stage-0 survivors."""
    ledger: list[dict[str, Any]] = []
    certified: list[dict[str, Any]] = []
    ledger_by_id: dict[str, dict[str, Any]] = {}
    for record in records:
        eligibility = snapshot_eligibility_decision(record, config)
        row = {
            **ledger_identity(record),
            "snapshot_eligibility": decision_json(eligibility),
            "stage0_recheck": None,
            "dedup": None,
            "survives": False,
        }
        ledger.append(row)
        ledger_by_id[str(record.get("id", ""))] = row
        if eligibility.survives:
            certified.append(record)

    if config.expected_certified_eligible is not None and len(certified) != config.expected_certified_eligible:
        raise ValueError(
            f"certified snapshot eligibility {len(certified)} != expected "
            f"{config.expected_certified_eligible}; snapshot or depthCheck contract drifted"
        )

    stage0_survivors: list[dict[str, Any]] = []
    for record in certified:
        decision = stage0_recheck_decision(record)
        row = ledger_by_id[str(record.get("id", ""))]
        row["stage0_recheck"] = decision_json(decision)
        if decision.survives:
            stage0_survivors.append(record)

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in stage0_survivors:
        unique_event_id = str(fields_of(record).get("UniqueEventID") or "")
        if not unique_event_id:
            raise ValueError(f"Stage 0 survivor {record.get('id')!r} has no UniqueEventID for dedup")
        groups[unique_event_id].append(record)

    survivors: list[dict[str, Any]] = []
    for group in groups.values():
        winner = group[0]
        for candidate in group[1:]:
            winner = richer_winner(winner, candidate)
        survivors.append(winner)
        for candidate in group:
            row = ledger_by_id[str(candidate.get("id", ""))]
            if candidate is winner:
                row["dedup"] = {"survives": True, "rule": "dedup.pass"}
                row["survives"] = True
            else:
                row["dedup"] = {"survives": False, "rule": dedup_rule(winner, candidate)}

    scoring_inputs = [scoring_input(record) for record in survivors]
    return PreparedRun(
        config=config,
        ledger=ledger,
        survivors=[{"record_id": item["record_id"], "unique_event_id": item["unique_event_id"]} for item in scoring_inputs],
        scoring_inputs=scoring_inputs,
        embedding_manifest=manifest_for(scoring_inputs, config),
        stage0_provenance={
            "eventbrite_host_allowlist": "rechecked_from_url",
            "eventbrite_canonical_city": "rechecked_from_candidate_city",
            "all_events_full_address_guard": "upstream_only",
        },
        certified_eligible_count=len(certified),
        stage0_survivor_count=len(stage0_survivors),
    )


def cache_paths(cache_dir: Path) -> tuple[Path, Path]:
    return cache_dir / CACHE_MATRIX_NAME, cache_dir / CACHE_MANIFEST_NAME


def valid_cache(scoring_inputs: list[dict[str, Any]], matrix_path: Path, manifest_path: Path) -> np.ndarray | None:
    if not (matrix_path.exists() and manifest_path.exists()):
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        matrix = np.load(matrix_path, allow_pickle=False)
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    if (
        manifest.get("schema_version") != 1
        or manifest.get("model") != MODEL
        or manifest.get("output_dimension") != OUTPUT_DIMENSION
        or manifest.get("n_rows") != len(scoring_inputs)
        or manifest.get("input_sha256") != input_sha256(scoring_inputs)
        or manifest.get("dtype") != "float32"
        or manifest.get("row_order") != "scoring_input.jsonl order"
        or "input_type" not in manifest
        or manifest.get("input_type") is not None
        or manifest.get("truncation") is not True
        or tuple(matrix.shape) != (len(scoring_inputs), OUTPUT_DIMENSION)
        or matrix.dtype != np.dtype(np.float32)
    ):
        return None
    return matrix


def voyage_embed(batch: list[dict[str, Any]]) -> list[list[float]]:
    """The explicit future provider call; reached only with --allow-network."""
    from dotenv import load_dotenv
    import voyageai

    # Load credentials into the process without reading or exposing the env file here.
    load_dotenv(ROOT / "NLAP_Airtable.env")
    client = voyageai.Client()
    response = client.embed(
        [row["text"] for row in batch],
        model=MODEL,
        input_type=None,
        output_dimension=OUTPUT_DIMENSION,
        truncation=True,
    )
    return response.embeddings


def atomic_write_cache(matrix: np.ndarray, manifest: dict[str, Any], cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    matrix_path, manifest_path = cache_paths(cache_dir)
    with tempfile.NamedTemporaryFile(mode="wb", suffix=".npy", dir=cache_dir, delete=False) as handle:
        np.save(handle, matrix)
        matrix_temp = Path(handle.name)
    try:
        os.replace(matrix_temp, matrix_path)
    finally:
        if matrix_temp.exists():
            matrix_temp.unlink()

    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", dir=cache_dir, delete=False) as handle:
        handle.write(manifest_text)
        manifest_temp = Path(handle.name)
    try:
        os.replace(manifest_temp, manifest_path)
    finally:
        if manifest_temp.exists():
            manifest_temp.unlink()


def materialize_embedding_cache(
    scoring_inputs: list[dict[str, Any]],
    cache_dir: Path,
    *,
    allow_network: bool = False,
    embedder: Callable[[list[dict[str, Any]]], list[list[float]]] | None = None,
    batch_size: int = 100,
) -> EmbeddingCacheResult:
    """Return a validated cache hit or explicitly materialize a 2048d Voyage cache.

    The injected ``embedder`` makes batching, ordering, dimension validation, and cache
    safety testable without credentials or network activity.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    matrix_path, manifest_path = cache_paths(cache_dir)
    cached = valid_cache(scoring_inputs, matrix_path, manifest_path)
    if cached is not None:
        return EmbeddingCacheResult(cached, "cache_hit", 0)
    if not allow_network:
        raise NetworkEmbeddingDisabled(
            "embedding cache miss: rerun only with explicit --materialize-embeddings --allow-network"
        )
    active_embedder = embedder or voyage_embed
    vectors: list[list[float]] = []
    provider_calls = 0
    for start in range(0, len(scoring_inputs), batch_size):
        batch = scoring_inputs[start:start + batch_size]
        returned = active_embedder(batch)
        provider_calls += 1
        if len(returned) != len(batch):
            raise ValueError(f"embedder returned {len(returned)} vectors for {len(batch)} input rows")
        for index, vector in enumerate(returned):
            if len(vector) != OUTPUT_DIMENSION:
                raise ValueError(
                    f"embedding dimension {len(vector)} at input row {start + index} != {OUTPUT_DIMENSION}"
                )
            vectors.append(vector)
    matrix = np.asarray(vectors, dtype=np.float32)
    if tuple(matrix.shape) != (len(scoring_inputs), OUTPUT_DIMENSION):
        raise ValueError(f"embedding alignment failure: got {matrix.shape}")
    manifest = {
        "schema_version": 1,
        "model": MODEL,
        "output_dimension": OUTPUT_DIMENSION,
        "n_rows": len(scoring_inputs),
        "input_sha256": input_sha256(scoring_inputs),
        "dtype": str(matrix.dtype),
        "row_order": "scoring_input.jsonl order",
        "input_type": None,
        "truncation": True,
    }
    atomic_write_cache(matrix, manifest, cache_dir)
    return EmbeddingCacheResult(matrix, "materialized", provider_calls)


def fit_and_score_live_survivors(
    scoring_inputs: list[dict[str, Any]], live_embeddings: np.ndarray
) -> list[dict[str, Any]]:
    """Fit the two frozen heads and emit raw probabilities for each live survivor.

    The historical 0.4530 cutoff belongs to grouped-CV out-of-fold scores. This function
    fits on all labelled rows, so its probabilities are used for ranking only and are
    never treated as threshold-calibrated keep/reject decisions.
    """
    from sklearn.linear_model import LogisticRegression

    # Every score must stay aligned with the record and text that produced its embedding.
    expected_shape = (len(scoring_inputs), OUTPUT_DIMENSION)
    if not isinstance(live_embeddings, np.ndarray) or live_embeddings.shape != expected_shape:
        got = getattr(live_embeddings, "shape", None)
        raise ValueError(f"live embedding shape {got} != expected {expected_shape}")
    if not np.isfinite(live_embeddings).all():
        raise ValueError("live embeddings contain non-finite values")
    record_ids = [str(row.get("record_id") or "") for row in scoring_inputs]
    if not all(record_ids) or len(set(record_ids)) != len(record_ids):
        raise ValueError("scoring inputs require unique, non-blank record_id values")

    # Reuse Step 4c's existing loader rather than copying its §77 target mapping. Importing
    # it verifies the current label pull, reconciliation artifacts, routing-count tripwire,
    # and cached-matrix alignment before exposing the frozen fit matrix and binary target.
    import gate_step4a as gate

    if gate.X.shape != (365, OUTPUT_DIMENSION) or gate.y.shape != (365,):
        raise ValueError(f"unexpected gate fit population: X={gate.X.shape}, y={gate.y.shape}")
    if set(np.unique(gate.y).tolist()) != {0, 1}:
        raise ValueError("gate targets must contain exactly classes 0 and 1")

    # Fit the already-frozen gate head once on the complete labelled population. Unlike
    # Step 4c's grouped CV, this full fit exists only to rank the live pool for the audit.
    gate_head = LogisticRegression(max_iter=2000, C=1.0)
    gate_head.fit(gate.X, gate.y)
    if gate_head.classes_.tolist() != [0, 1]:
        raise ValueError(f"unexpected gate class order: {gate_head.classes_.tolist()}")
    p_include = gate_head.predict_proba(live_embeddings)[:, 1]

    # The section classifier learns from the same 1,126 published examples and cached
    # Voyage vectors as the frozen R7 classifier. Assert the exact class vocabulary before
    # assigning predict_proba columns to human-readable section names.
    train_x = np.load(CORPORA / f"embeddings_{MODEL}.npy", allow_pickle=False)
    train_y = json.loads((CORPORA / "embeddings_labels.json").read_text(encoding="utf-8"))
    expected_sections = ["For Couples", "For Families", "For Golden Age Readers"]
    if train_x.shape != (1126, OUTPUT_DIMENSION) or len(train_y) != train_x.shape[0]:
        raise ValueError(f"unexpected section fit population: X={train_x.shape}, labels={len(train_y)}")
    if sorted(set(train_y)) != expected_sections:
        raise ValueError(f"unexpected section labels: {sorted(set(train_y))}")

    section_head = LogisticRegression(max_iter=1000, C=1, class_weight=None)
    section_head.fit(train_x, train_y)
    if section_head.classes_.tolist() != expected_sections:
        raise ValueError(f"unexpected section class order: {section_head.classes_.tolist()}")
    section_scores = section_head.predict_proba(live_embeddings)
    if (
        not np.isfinite(p_include).all()
        or not np.isfinite(section_scores).all()
        or np.any((p_include < 0) | (p_include > 1))
        or np.any((section_scores < 0) | (section_scores > 1))
        or not np.allclose(section_scores.sum(axis=1), 1.0, atol=1e-6)
    ):
        raise ValueError("model emitted invalid probabilities")

    # A recurring program can reappear in the live week with the same URL or title as a
    # labelled fit row. Keep its score, but mark it so the editor readout can report true
    # unseen transfer separately from in-sample recurring-series rows.
    fit_urls = {str(row.get("url") or "").strip() for row in gate.rows_fit} - {""}
    fit_titles = {gate.norm_title(row["url"]) for row in gate.rows_fit} - {""}
    overlap_flags = live_gate_fit_overlap(scoring_inputs, fit_urls, fit_titles)

    # Emit raw probabilities without filtering any event. Instrument B ranks with their
    # product; Instrument A forms rank-position quintiles from p_include.
    return [{
        **row,
        "p_include": float(p_include[index]),
        "gate_fit_overlap": overlap_flags[index],
        "section_probabilities": {
            str(section): float(section_scores[index, class_index])
            for class_index, section in enumerate(section_head.classes_)
        },
    } for index, row in enumerate(scoring_inputs)]


def live_gate_fit_overlap(
    scoring_inputs: list[dict[str, Any]], fit_urls: set[str], fit_titles: set[str]
) -> list[bool]:
    """Flag live rows seen by the gate fit, matching URL then normalized title."""
    flags = []
    for row in scoring_inputs:
        url = str(row.get("url") or "").strip()
        title = re.sub(r"\s+", " ", str(row.get("title") or "").strip().lower())
        flags.append(bool((url and url in fit_urls) or (title and title in fit_titles)))
    return flags


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8"
    )


def write_output_scaffold(
    result: PreparedRun,
    output_dir: Path,
    *,
    embedding_status: str = "not_requested",
    provider_calls: int = 0,
    scored_survivors: list[dict[str, Any]] | None = None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_dir / "survivor_rejection_ledger.jsonl", result.ledger)
    write_jsonl(output_dir / "scoring_input.jsonl", result.scoring_inputs)
    (output_dir / "embedding_manifest.json").write_text(
        json.dumps(result.embedding_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    score_schema = {
        "schema_version": 1,
        "purpose": "Raw ranking probabilities; no live threshold or automatic rejection.",
        "required_per_record": {
            "record_id": "Airtable Candidate record id",
            "p_include": "raw gate probability; no cutoff action in this runner",
            "gate_fit_overlap": "true when URL or normalized title occurs in the 365-row gate fit set",
            "section_probabilities": {
                "For Families": "raw probability",
                "For Couples": "raw probability",
                "For Golden Age Readers": "raw probability",
            },
        },
    }
    (output_dir / "scored_survivors.schema.json").write_text(
        json.dumps(score_schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    if scored_survivors is not None:
        write_jsonl(output_dir / "scored_survivors.jsonl", scored_survivors)
    summary = {
        "issue_date": result.config.issue_date,
        "window": [result.config.window_start.isoformat(), result.config.window_end.isoformat()],
        "input_records": len(result.ledger),
        "certified_snapshot_eligible": result.certified_eligible_count,
        "stage0_recheck_survivors": result.stage0_survivor_count,
        "deduplicated_survivors": len(result.survivors),
        "stage0_provenance": result.stage0_provenance,
        "embedding_status": embedding_status,
        "network_calls": provider_calls,
        "embedding_calls": provider_calls,
        "scoring_calls": 1 if scored_survivors is not None else 0,
        "gate_fit_overlap_count": (
            sum(bool(row.get("gate_fit_overlap")) for row in scored_survivors)
            if scored_survivors is not None else None
        ),
        "next_seam": "build disjoint Instrument A/B packets" if scored_survivors is not None
        else "materialize embeddings and score survivors",
    }
    (output_dir / "run_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_snapshot(path: Path, *, expected_sha256: str | None = None) -> list[dict[str, Any]]:
    actual_sha256 = sha256_file(path)
    if expected_sha256 is not None and actual_sha256.lower() != expected_sha256.lower():
        raise ValueError(f"snapshot SHA-256 {actual_sha256} != expected {expected_sha256}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records") if isinstance(payload, dict) else None
    if not isinstance(records, list):
        raise ValueError(f"snapshot {path} has no records array")
    return records


def is_default_snapshot(path: Path) -> bool:
    return path.resolve() == DEFAULT_SNAPSHOT.resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare #125's live scoring scaffold.")
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--snapshot-sha256", help="optional explicit digest pin for a non-default snapshot")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--issue-date", default="2026-08-13")
    parser.add_argument("--expected-certified-eligible", type=int)
    parser.add_argument("--materialize-embeddings", action="store_true")
    parser.add_argument("--allow-network", action="store_true")
    args = parser.parse_args()

    expected_digest = DEFAULT_SNAPSHOT_SHA256 if is_default_snapshot(args.snapshot) else args.snapshot_sha256
    expected_eligible = args.expected_certified_eligible
    if expected_eligible is None and is_default_snapshot(args.snapshot):
        expected_eligible = 321
    result = prepare_run(
        load_snapshot(args.snapshot, expected_sha256=expected_digest),
        RunConfig(issue_date=args.issue_date, expected_certified_eligible=expected_eligible),
    )
    embedding_status = "not_requested"
    provider_calls = 0
    scored_survivors = None
    if args.materialize_embeddings:
        embedding_result = materialize_embedding_cache(
            result.scoring_inputs, args.output, allow_network=args.allow_network
        )
        embedding_status = embedding_result.status
        provider_calls = embedding_result.provider_calls
        scored_survivors = fit_and_score_live_survivors(result.scoring_inputs, embedding_result.matrix)
    write_output_scaffold(
        result, args.output, embedding_status=embedding_status, provider_calls=provider_calls,
        scored_survivors=scored_survivors
    )
    embedding_message = (
        "no embedding requested"
        if embedding_status == "not_requested"
        else f"embedding {embedding_status} ({provider_calls} provider call(s))"
    )
    print(
        f"certified {result.certified_eligible_count} snapshot-eligible -> "
        f"{result.stage0_survivor_count} Stage-0 recheck survivors -> {len(result.survivors)} after dedup; "
        f"{embedding_message}; "
        f"{'scores written' if scored_survivors is not None else 'no scores'}: {args.output}"
    )


if __name__ == "__main__":
    main()
