"""Local, offline preparation receipt for one issue build (lifted from the per-run demo lineage).

Stages facts only. No ranking policy, model calls, credentials, or external writes.
Run with the project's Python and -B. Existing generated outputs are never replaced.

Normally invoked by issueBuild.js, which discovers the R7 folder and snapshot stamp and passes
--issue, --r7-dir, --snapshot and --out (all relative to the repo root).
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "models/sectioning"))
from live_runner import RunConfig, prepare_run

# Week-specific values arrive as arguments (see configure); nothing below is edited per week.
ISSUE = None
OUT = None
PATHS = {
    "publication_history": "data/beehiiv/issue_history.json",
    "click_history": "models/ranking/click_join/click_join_FROZEN_2026-07-07.json",
    "editor_feedback": "docs/r7/R7_Sealed_Live_Readout_2026-08-27.md",
    "editor_feedback_v1_demo": "docs/r6/R6_Editor_Feedback.md",
}
SECTIONS = {"For Families", "For Couples", "For Golden Age Readers"}


def configure(argv=None):
    global ISSUE, OUT
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--issue", required=True, help="issue date, YYYY-MM-DD")
    parser.add_argument("--r7-dir", required=True, help="R7 live-runner folder, relative to the repo root")
    parser.add_argument("--snapshot", required=True, help="snapshot stamp, e.g. 2026-10-04_1222")
    parser.add_argument("--out", required=True, help="run folder, relative to the repo root")
    args = parser.parse_args(argv)
    ISSUE = date.fromisoformat(args.issue).isoformat()
    OUT = (ROOT / args.out).resolve()
    OUT.relative_to(ROOT / "data/tracking")  # run output never lands in scripts/
    r7 = Path(args.r7_dir).as_posix().rstrip("/")
    week = {
        "candidates": f"data/tracking/snapshots/candidates_{args.snapshot}.json",
        "issueitems": f"data/tracking/snapshots/issueitems_{args.snapshot}.json",
        "r7_scores": f"{r7}/scored_survivors.jsonl",
        "r7_summary": f"{r7}/run_summary.json",
        "r7_inputs": f"{r7}/scoring_input.jsonl",
    }
    fixed = dict(PATHS)
    PATHS.clear()
    PATHS.update({**week, **fixed})  # same key order as the per-run scripts wrote


def read(name):
    text = (ROOT / PATHS[name]).read_text(encoding="utf-8")
    if PATHS[name].endswith(".jsonl"):
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    return json.loads(text)


def validate_scores(expected, scored):
    ids = [r.get("record_id") for r in scored]
    if not all(ids) or len(ids) != len(set(ids)):
        raise ValueError("R7 scores require unique, nonblank record IDs")
    lookup = {r["record_id"]: r for r in expected}
    if set(ids) != set(lookup):
        raise ValueError("R7 score IDs do not match this snapshot's complete survivor set")
    for row in scored:
        for key, value in lookup[row["record_id"]].items():
            if row.get(key) != value:
                raise ValueError(f"R7 input mismatch: {row['record_id']} / {key}")
        p = row.get("section_probabilities")
        if not isinstance(p, dict) or set(p) != SECTIONS:
            raise ValueError("R7 section probability vocabulary mismatch")
        values = [row.get("p_include"), *p.values()]
        if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in values):
            raise ValueError("Invalid R7 probability")
        if abs(sum(p.values()) - 1) > 1e-6:
            raise ValueError("R7 section probabilities do not sum to one")


def reject_corruption_checks(expected, scored):
    variants = []
    wrong_text = copy.deepcopy(scored)
    wrong_text[0]["text"] += " wrong event"
    variants.append(wrong_text)
    variants.append(scored + [scored[0]])
    variants.append(scored[:-1])
    bad_probability = copy.deepcopy(scored)
    bad_probability[0]["p_include"] = float("nan")
    variants.append(bad_probability)
    for variant in variants:
        try:
            validate_scores(expected, variant)
        except ValueError:
            continue
        raise AssertionError("A corrupted score fixture was accepted")


def write_new(name, value):
    with (OUT / name).open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def main():
    configure()
    for name in ("evidence_inputs.json", "preparation_manifest.json"):
        if (OUT / name).exists():
            raise FileExistsError(f"Preserve existing preparation: {OUT / name}")
    snapshots = read("candidates")
    records = snapshots["records"]
    if len({r["id"] for r in records}) != len(records):
        raise ValueError("Duplicate Candidate IDs in snapshot")
    expected = prepare_run(records, RunConfig(issue_date=ISSUE))
    scored = read("r7_scores")
    validate_scores(expected.scoring_inputs, scored)
    reject_corruption_checks(expected.scoring_inputs, scored)
    if read("r7_inputs") != expected.scoring_inputs:
        raise ValueError("R7 scoring-input file differs from reproduced snapshot inputs")
    summary = read("r7_summary")
    if summary["issue_date"] != ISSUE or summary["deduplicated_survivors"] != len(scored):
        raise ValueError("R7 summary identifies a different run")
    if summary["window"] != [str(expected.config.window_start), str(expected.config.window_end)]:
        raise ValueError("R7 summary window mismatch")

    facts = {r["id"]: r["fields"] for r in records}
    fields = ["Event Title", "Start Date", "End Date", "URL", "LocationName", "City",
              "Organizer", "CostRaw", "DescriptionRaw", "Source", "SourceCategories",
              "Status", "NeedsReview", "R2Status", "UniqueEventID"]
    candidates = [{"record_id": r["record_id"],
                   "snapshot_fields": {k: facts[r["record_id"]].get(k) for k in fields},
                   "r7": r} for r in scored]
    history = read("publication_history")
    publications = []
    for issue in history:
        if date.fromisoformat(issue["date"]) < date.fromisoformat(ISSUE):
            publications.append({**issue, "events": [e for e in issue["events"] if e["section"] in SECTIONS]})
    clicks = read("click_history")
    click_records = [r for r in clicks["records"] if date.fromisoformat(r["issueDate"]) < date.fromisoformat(ISSUE)]
    issueitems = read("issueitems")
    current_items = [r for r in issueitems["records"] if r["fields"].get("Name") == ISSUE]
    packet = {
        "schema_version": "editor-evidence-inputs/1",
        "issue_date": ISSUE,
        "window": summary["window"],
        "status": "facts_staged_only",
        "candidates": candidates,
        "published_issues": publications,
        "click_history": {"captured_at": clicks.get("capturedAt"), "scope": clicks.get("scope"), "records": click_records},
        "issueitems_snapshot": issueitems,
        "editor_feedback": (ROOT / PATHS["editor_feedback"]).read_text(encoding="utf-8"),
        "editor_feedback_v1_demo": (ROOT / PATHS["editor_feedback_v1_demo"]).read_text(encoding="utf-8"),
        "interpretation_notes": [
            "All R7 survivors are retained; this file does not choose a shortlist depth or rank candidates.",
            "Original Candidate status is retained; staging does not confer editorial approval.",
            "Snapshot DescriptionRaw is preserved separately from R7's capped scoring text.",
            "Missing snapshot fields remain null, including CostRaw; no price or performance is imputed.",
            "Publication and click records are raw evidence, not assertions that a candidate is the same event.",
            "IssueItems are stored separately from confirmed Beehiiv publication history.",
            "No title-based series collapse, history inference, numerical feature weights, or flex policy is applied.",
            "Historical clicks describe selected published events and do not label unpublished candidates.",
        ],
    }
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None
    manifest = {
        "schema_version": "editor-input-preparation/1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "issue_date": ISSUE,
        "input_snapshot_captured_at": snapshots.get("capturedAt"),
        "git_commit_at_preparation": commit,
        "inputs": {k: {"path": p, "sha256": hashlib.sha256((ROOT / p).read_bytes()).hexdigest()} for k, p in PATHS.items()},
        "source_hashes_at_preparation": {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in [
            Path(__file__).resolve().relative_to(ROOT).as_posix(), "models/sectioning/live_runner.py",
            "models/sectioning/text_recipe.py", "scripts/buildIssues.js"]},
        "checks": {"record_and_text_identity": "pass", "probabilities": "pass", "rejected_corrupt_score_fixtures": 4},
        "counts": {"candidates": len(candidates), "publication_issues": len(publications),
                   "published_event_entries": sum(len(i["events"]) for i in publications),
                   "click_observations": len(click_records), "target_issueitems": len(current_items),
                   "target_locks": sum(r["fields"].get("Lock") is True for r in current_items)},
        "latest_publication_date": max(i["date"] for i in publications),
        "earliest_click_issue": min(r["issueDate"] for r in click_records),
        "latest_click_issue": max(r["issueDate"] for r in click_records),
        "proposed_model": "gpt-5.6-terra",
        "model_calls": 0,
        "status": "prepared; LLM comparison and allocator handoff not executed",
    }
    write_new("evidence_inputs.json", packet)
    manifest["evidence_inputs_sha256"] = hashlib.sha256((OUT / "evidence_inputs.json").read_bytes()).hexdigest()
    write_new("preparation_manifest.json", manifest)
    print(json.dumps({"output": str(OUT), "counts": manifest["counts"], "checks": manifest["checks"],
                      "latest_publication_date": manifest["latest_publication_date"],
                      "click_history_through": manifest["latest_click_issue"], "model_calls": 0}, indent=2))


if __name__ == "__main__":
    main()
