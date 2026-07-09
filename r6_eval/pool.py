"""Snapshot loading + eligible-pool filtering.

A "snapshot" is the Candidates export. Two shapes are accepted:
  1. The snapshotCandidates.js format: {"records": [{"id", "createdTime",
     "fields": {...}}, ...]}
  2. A bare JSON array of records, either flat field dicts or Airtable-style
     {"fields": {...}} objects.
Records are normalized to flat field dicts.
"""

import json
from datetime import date, datetime


def load_snapshot(path):
    """Load a Candidates snapshot JSON; return a list of flat field dicts."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        records = data.get("records", [])
    else:
        records = data
    flat = []
    for r in records:
        if isinstance(r, dict) and "fields" in r and isinstance(r["fields"], dict):
            flat.append(r["fields"])
        elif isinstance(r, dict):
            flat.append(r)
    return flat


def parse_date(value):
    """Parse 'YYYY-MM-DD' or an ISO datetime string; None if absent/bad."""
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _venue_blocked(location_name, blocklist):
    name = (location_name or "").strip().lower()
    if not name:
        return True  # empty/missing venue is excluded from the pair pool
    return name in blocklist


def is_eligible(rec, config, today=None):
    """Eligibility filter for the pair pool.

    today=None skips the date filter (used when computing feature/pool stats
    at grade time, so venue/source counts don't drift as events expire).
    """
    blocklist = {b.strip().lower() for b in config["venue_blocklist"]}
    if rec.get("R2Status") != "Enriched":
        return False
    if rec.get("Status") == "Rejected":
        return False
    if rec.get("SegmentSuggested") not in config["sections"]:
        return False
    if rec.get("City") not in config["cities"]:
        return False
    if not (rec.get("Event Title") or "").strip():
        return False
    if not (rec.get("DescriptionRaw") or "").strip():
        return False
    if _venue_blocked(rec.get("LocationName"), blocklist):
        return False
    if today is not None:
        start = parse_date(rec.get("Start Date"))
        if start is None or start < today:
            return False
    return True


def eligible_pool(records, config, today=None):
    """Return {section: [record, ...]} for the three sections."""
    pool = {s: [] for s in config["sections"]}
    for rec in records:
        if is_eligible(rec, config, today=today):
            pool[rec["SegmentSuggested"]].append(rec)
    return pool


def build_lookup(records):
    """Index all snapshot records by UniqueEventID (last one wins on dupes)."""
    return {r["UniqueEventID"]: r for r in records if r.get("UniqueEventID")}


def today_from_arg(value):
    """--today CLI helper: 'YYYY-MM-DD' or None -> date.today()."""
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    return date.today()
