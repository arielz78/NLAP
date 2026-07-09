"""Generate a fixture Candidates snapshot matching the real snapshot schema
(snapshotCandidates.js shape: {"records": [{"id","createdTime","fields"}]}).

Dates are generated relative to the run date, so regenerate if the committed
fixture goes stale:  python -m r6_eval.make_fixture [--out PATH] [--seed 7]

Includes deliberate ineligibles (past dates, Rejected, Pending, wrong city,
empty descriptions, blocklisted venues, non-event sections) so the pool
filter is actually exercised.
"""

import argparse
import json
import os
import random
from datetime import date, timedelta

SECTIONS = {
    "For Families": {
        "venues": ["Bathurst Clark Resource Library", "VMC Library",
                   "Black Creek Pioneer Village", "Maple Library",
                   "Aaniin Branch", "LEGO Discovery Centre"],
        "titles": ["Family Storytime", "LEGO Builders Club", "Kids Science Lab",
                   "Pioneer Family Day", "Puppet Show", "Family Board Game Cafe",
                   "Junior Chefs Workshop", "Nature Scavenger Hunt"],
        "desc": "Bring the kids for {t} — hands-on fun for ages 4-12, drop-in, "
                "all materials provided. Caregivers must stay on site.",
        "sources": ["VPL", "BiblioCommons Markham", "AllEvents"],
    },
    "For Couples": {
        "venues": ["Pinot's Palette - Vaughan-Woodbridge",
                   "McMichael Canadian Art Collection", "9baci",
                   "Reds Wine Tavern", "Copper Creek Golf Club"],
        "titles": ["Paint & Sip Night", "Jazz on the Patio", "Wine Tasting Evening",
                   "Latin Dance Social", "Comedy Night", "Sunset Vineyard Walk",
                   "Chocolate Pairing Class"],
        "desc": "An evening of {t} — live music, drinks and a relaxed vibe. "
                "Tickets include a welcome glass. 19+.",
        "sources": ["Eventbrite", "PinotsPalette", "McMichael", "AllEvents"],
    },
    "For Golden Age Readers": {
        "venues": ["Pierre Berton Resource Library", "Civic Centre Resource Library",
                   "Carrville Library", "Angus Glen Branch"],
        "titles": ["Seniors Social Club", "Gentle Chair Yoga", "Tech Help Drop-In",
                   "Memoir Writing Circle", "Afternoon Concert", "Garden Club Meetup"],
        "desc": "Join us for {t} — a relaxed daytime program for older adults. "
                "Free, accessible venue, refreshments served.",
        "sources": ["VPL", "RichmondHill", "OnRichmondHill"],
    },
}
CITIES = ["Vaughan", "Markham", "Richmond Hill"]


def make_records(seed, today):
    rng = random.Random(seed)
    records = []
    counter = 0

    def add(title, section, venue, city, source, start, desc,
            r2="Enriched", status="New"):
        nonlocal counter
        counter += 1
        start_str = start.isoformat() if start else None
        uid = f"{title.lower()}|{start_str or 'nodate'}"
        fields = {
            "Event Title": title,
            "DescriptionRaw": desc,
            "Source": source,
            "LocationName": venue,
            "Start Date": start_str,
            "End Date": (start + timedelta(days=rng.choice([0, 0, 1]))).isoformat()
                        if start else None,
            "City": city,
            "SegmentSuggested": section,
            "R2Status": r2,
            "Status": status,
            "URL": f"https://example.com/e/{counter}",
            "UniqueEventID": uid,
        }
        records.append({
            "id": f"recFIX{counter:05d}",
            "createdTime": "2026-01-01T00:00:00.000Z",
            "fields": fields,
        })

    # ~35 eligible per section.
    for section, spec in SECTIONS.items():
        for k in range(35):
            title = f"{rng.choice(spec['titles'])} #{k + 1}"
            venue = rng.choice(spec["venues"])
            add(
                title, section, venue, rng.choice(CITIES), rng.choice(spec["sources"]),
                today + timedelta(days=rng.randint(1, 21)),
                spec["desc"].format(t=title.lower()),
            )

    # Ineligibles: exercise every filter clause.
    fam = SECTIONS["For Families"]
    add("Expired Storytime", "For Families", fam["venues"][0], "Vaughan", "VPL",
        today - timedelta(days=3), "Already happened.")
    add("Rejected Gala", "For Couples", "Reds Wine Tavern", "Vaughan", "Eventbrite",
        today + timedelta(days=5), "Editor said no.", status="Rejected")
    add("Pending Workshop", "For Families", fam["venues"][1], "Markham", "VPL",
        today + timedelta(days=6), "Not enriched yet.", r2="Pending")
    add("Toronto Concert", "For Couples", "Massey Hall", "Toronto", "Eventbrite",
        today + timedelta(days=7), "Wrong city.")
    add("Webinar: Retirement Planning", "For Golden Age Readers", "Online Programs",
        "Vaughan", "VPL", today + timedelta(days=8), "Blocklisted venue.")
    add("Mystery Meetup", "For Couples", "", "Vaughan", "AllEvents",
        today + timedelta(days=9), "Empty venue.")
    add("No Description Night", "For Couples", "9baci", "Vaughan", "Eventbrite",
        today + timedelta(days=10), "")
    add("Coffee Crawl", "Local Aroma", "Main St Cafes", "Vaughan", "Visit Vaughan",
        today + timedelta(days=11), "Non-event section.")
    add("B2B Sales Summit", None, "Convention Ctr", "Vaughan", "Eventbrite",
        today + timedelta(days=12), "No segment.")

    return records


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=os.path.join("r6_eval", "fixtures",
                                                  "fixture_snapshot.json"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args(argv)

    today = date.today()
    records = make_records(args.seed, today)
    snapshot = {
        "capturedAt": f"{today.isoformat()}T00:00:00.000Z",
        "note": "FIXTURE — synthetic data generated by r6_eval.make_fixture",
        "recordCount": len(records),
        "records": records,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=1, ensure_ascii=False)
    print(f"Wrote {args.out} ({len(records)} records)")


if __name__ == "__main__":
    main()
