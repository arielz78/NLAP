"""Prepare the sealed R7 live-audit join without interpreting its result.

This module is deliberately read-only.  It joins the editor's Airtable export to
the frozen Instrument A sheet, sealed answer key, and scored survivor artifact,
then applies only the exclusions pre-registered in Decision_Log section 93.

The number-producing comparison remains ``TODO(ariel)`` under the repository's
authorship split.  This file produces the validated row set that comparison will
consume; it does not choose a transfer statistic or a pass/fail rule.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Iterable


INSTRUMENT_A_SIZE = 100
EXPECTED_GATE_FIT_OVERLAP = 6
STAGE0_MISS_ROW_IDS = {"A-1-01"}
VALID_VERDICTS = {"Eligible", "Not eligible", "Can't tell"}


class ReadoutError(ValueError):
    """Raised when a source artifact cannot support a trustworthy join."""


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ReadoutError(f"{path}:{number} is not a JSON object")
        rows.append(value)
    return rows


def _read_rulings(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))
    payload = _read_json(path)
    rows = payload.get("records", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ReadoutError("rulings export must be CSV, a JSON list, or an object with a records list")
    return rows


def _fields(row: dict[str, Any]) -> dict[str, Any]:
    """Accept either an Airtable API record or a flat exported row."""
    value = row.get("fields", row)
    if not isinstance(value, dict):
        raise ReadoutError("ruling row fields must be an object")
    return value


def _index(rows: Iterable[dict[str, Any]], key: str, label: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = row.get(key)
        if not isinstance(value, str) or not value:
            raise ReadoutError(f"{label} row is missing {key}")
        if value in result:
            raise ReadoutError(f"duplicate {label} {key}: {value}")
        result[value] = row
    return result


def prepare_instrument_a(
    editor_sheet: list[dict[str, Any]],
    sealed_rows: list[dict[str, Any]],
    scored_rows: list[dict[str, Any]],
    ruling_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return the validated Instrument A rows prepared for Ariel's comparison."""
    sheet = _index(editor_sheet, "sheet_row_id", "editor sheet")
    if len(sheet) != INSTRUMENT_A_SIZE or any(not key.startswith("A-") for key in sheet):
        raise ReadoutError(f"editor sheet must contain exactly {INSTRUMENT_A_SIZE} Instrument A rows")

    sealed_a = [row for row in sealed_rows if row.get("packet") == "A"]
    sealed = _index(sealed_a, "sheet_row_id", "sealed key")
    scored = _index(scored_rows, "record_id", "scored survivor")

    all_rulings = [_fields(row) for row in ruling_records]
    flat_rulings = [
        row for row in all_rulings
        if row.get("Instrument") == "A" or str(row.get("Sheet Row ID", "")).startswith("A-")
    ]
    rulings = _index(flat_rulings, "Sheet Row ID", "ruling")

    expected_ids = set(sheet)
    for label, actual in (("sealed key", set(sealed)), ("rulings", set(rulings))):
        missing = sorted(expected_ids - actual)
        extra = sorted(actual - expected_ids)
        if missing or extra:
            raise ReadoutError(f"{label} ID mismatch: missing={missing}, extra={extra}")

    joined: list[dict[str, Any]] = []
    for sheet_row_id in sorted(expected_ids):
        blind = sheet[sheet_row_id]
        key = sealed[sheet_row_id]
        ruling = rulings[sheet_row_id]
        score = scored.get(key.get("record_id"))
        if score is None:
            raise ReadoutError(f"{sheet_row_id}: record_id missing from scored survivors")

        verdict = str(ruling.get("Verdict", "")).strip()
        if verdict not in VALID_VERDICTS:
            raise ReadoutError(f"{sheet_row_id}: invalid or blank Verdict {verdict!r}")
        notes = str(ruling.get("Notes", ""))

        joined.append(
            {
                "sheet_row_id": sheet_row_id,
                "record_id": key["record_id"],
                "title": blind.get("title"),
                "editor_verdict": verdict,
                "editor_section": ruling.get("Section"),
                "used_link": "LINK" in notes.upper(),
                "originally_empty_description": not bool(str(blind.get("description", "")).strip()),
                "p_include": key["p_include"],
                "quintile": key["quintile"],
                "predicted_section": key["predicted_section"],
                "section_probabilities": key["section_probabilities"],
                "gate_fit_overlap": bool(score.get("gate_fit_overlap")),
                "stage0_miss": sheet_row_id in STAGE0_MISS_ROW_IDS,
            }
        )

    overlap_count = sum(row["gate_fit_overlap"] for row in joined)
    if overlap_count != EXPECTED_GATE_FIT_OVERLAP:
        raise ReadoutError(
            f"expected {EXPECTED_GATE_FIT_OVERLAP} Instrument A gate-fit overlaps, found {overlap_count}"
        )
    if not any(row["sheet_row_id"] == "A-1-01" and row["stage0_miss"] for row in joined):
        raise ReadoutError("A-1-01 must be annotated as the known Stage-0 miss")

    for row in joined:
        row["primary_gate_comparable"] = not (
            row["used_link"] or row["gate_fit_overlap"] or row["stage0_miss"]
        )
    return joined


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare the sealed R7 Instrument A readout join.")
    parser.add_argument("--rulings", type=Path, required=True, help="Airtable CSV or JSON export")
    parser.add_argument("--output", type=Path, required=True, help="Destination JSON file")
    parser.add_argument("--packet-dir", type=Path, required=True)
    parser.add_argument("--scored", type=Path, required=True)
    args = parser.parse_args()

    sheet = _read_jsonl(args.packet_dir / "instrument_a_editor_sheet.jsonl")
    key = _read_json(args.packet_dir / "sealed_answer_key.json")
    joined = prepare_instrument_a(sheet, key["rows"], _read_jsonl(args.scored), _read_rulings(args.rulings))
    payload = {
        "contract": "Decision_Log section 93",
        "rows": joined,
        "todo_ariel": "Define and author the number-producing transfer comparison over primary_gate_comparable rows.",
    }
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Prepared {len(joined)} Instrument A rows: {args.output}")


if __name__ == "__main__":
    main()
