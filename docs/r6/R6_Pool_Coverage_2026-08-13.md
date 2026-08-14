# Pool coverage — adjudicated result

> **Provenance:** automated matching by `scripts/poolCoverage.js`; the 26 recoveries and 12
> evergreen rulings are **Claude-adjudicated and unverified by Ariel**. The 68% is a floor.
> Do not treat as a settled measurement or quote it as a release number until re-checked.
> Ad-hoc investigation run 2026-08-13, outside the R7 critical path.

**Question:** do the events the editor published exist in our candidate pool for that week?
If yes, published issues can serve as ranking labels for R6.

**Method.** For each issue, filter the pool snapshot (`candidates_2026-08-06_0944.json`,
3,465 records) to its window (IssueDate+1 .. +10), then look for each published event.
Auto-match by normalised URL, or IDF-weighted title coverage ≥ 0.70 with ≥ 2 content words.
Everything unmatched (87 rows) was ruled by hand against its six nearest pool neighbours.

**Ruling rule (Ariel, 2026-08-13):** same event and time = PRESENT, regardless of URL.

- **PRESENT** — the pool has this event, any source, any URL
- **EVERGREEN** — a standing place/attraction with no date; no calendar lists it, so no
  scraper can find it. Removed from the denominator.
- **ABSENT** — a dated event we genuinely never ingested. Counts against coverage.

Local Aroma (restaurants) and Trust Me Recipe (manual-only) excluded throughout.

---

## Result

| issue | pool in window | auto | hand-recovered | evergreen | absent | **coverage** |
|---|---|---|---|---|---|---|
| 2026-06-04 | 203 | 6 | 2 | 1 | 6 | 8/14 |
| 2026-06-11 | 280 | 10 | 0 | 0 | 5 | 10/15 |
| 2026-06-18 | 425 | 8 | 2 | 0 | 5 | 10/15 |
| 2026-06-25 | 469 | 8 | 3 | 2 | 2 | 11/13 |
| 2026-07-02 | 483 | 7 | 4 | 0 | 4 | 11/15 |
| 2026-07-09 | 507 | 10 | 1 | 1 | 3 | 11/14 |
| 2026-07-16 | 460 | 6 | 4 | 1 | 4 | 10/14 |
| 2026-07-23 | 373 | 5 | 1 | 1 | 8 | 6/14 |
| 2026-07-30 | 314 | 7 | 4 | 2 | 2 | 11/13 |
| 2026-08-06 | 375 | 5 | 3 | 3 | 4 | 8/12 |
| 2026-08-13 | 321 | 6 | 2 | 1 | 6 | 8/14 |

**All 11 issues: 104 / 153 = 68%**
**Post-R5-complete only (Jul 2 →, 7 issues): 65 / 96 = 68%**

The pre/post-R5 gap has closed. Once evergreen leaves the denominator and the hand pass
recovers the matcher's false negatives, June and August look the same. The apparent climb
in the raw numbers was a matcher artifact plus a denominator error, not a coverage trend.

---

## What the automated matcher got wrong

The hand pass recovered **26 events the matcher missed** — a third of its misses. It also
counted 12 evergreen rows against the pipeline. So the naive number (78/165 = 47%) understated
true coverage by 21 points.

Representative false negatives:

| published | pool row | why the matcher failed |
|---|---|---|
| Richmond Hill Ribfest | `Ribfest` ×3, RichmondHill, Jul 17–19 | scored 1.00 but only 1 content word; blocked by the ≥2-word guard |
| Beach Boys Party Tribute Concert | `Vaughan Celebrates Concerts in the Park: Beach Party Boys: Tribute to the Beach Boys` | pool title 5× longer than published title |
| Women's Nutrition Summit | `She Blooms: A Women's Nutrition Summit` | pool title carries a distinctive prefix the published one drops |
| The Bruno Mars Experience | `Concerts in the Park - The Bruno Mars Experience` | same shape |
| Peaches & Cream Lawn Bowling | `Delmanor Peaches and Cream` | published adds the activity, pool has the sponsor |
| Sunflower Fields of Markham | `Sunflower Fields of Markham - General Admission` | ticket-type suffix |

The pattern is consistent: **pool titles are official/long, published titles are editorial/short,
and the overlap is real but partial.** No symmetric similarity threshold separates these from
coincidental matches, which is why the hand pass was necessary and why an automated number
should not be quoted without one.

---

## The 31 genuine absences (post-R5 issues only)

Clustered by where the editor sourced them:

| source of the published link | count | note |
|---|---|---|
| `visitvaughan.ca` | 5 | **source is dead — last produced 2026-06-18** |
| `meetup.com` | 3 | not an integrated source |
| `facebook.com` | 3 | intake is manual; last auto row 2026-06-25 |
| `woodbridgefarmersmarket.com` | 2 | not integrated |
| `markham.ca` (museum) | 2 | not integrated |
| `eventbrite.ca` | 2 | ⚠️ **live source — these are gaps inside a working integration** |
| one-off sites (14 distinct) | 14 | long tail: cityplayhouse, kingtheatre, ticketgateway, caribanatoronto, ontreasure, shiermedia, markhamcycles, sixflags, promenade, mainstreetmarkham, varleyartgallery, downtownmarkham, vaughan.ca, richmondhill.ca/news |

Two findings worth separating:

1. **`visitvaughan.ca` is the single largest recoverable cluster and the source is broken.**
   Five published events in seven weeks came from a feed that stopped returning rows on
   2026-06-18. This is an ingestion defect with a live cost, not a ranking question — filed as
   **#128** (milestone R6), together with McMichael and the absence of any per-source liveness
   detector. Facebook's silence is separately explained and tracked in #114.
2. **Two Eventbrite absences are more concerning than the long tail**, because Eventbrite is
   integrated and producing (212 records, last seen 2026-08-06). A live source missing events
   the editor found is a different failure from a source we never built.

The 14-site long tail is the editor doing his own sourcing across venues no scraper covers.
That is a real ceiling on any pool-based ranker, and it is not fixable by adding one source.

---

## What this means for the R6 idea

**The premise holds.** ~68% of what the editor publishes is in the pool, stably, across seven
post-R5 weeks. Each issue yields ~10 revealed positives against a 300–500 event field.

**Two limits to carry forward:**

- **~32% of published picks are unreachable** — evergreen aside, the editor sources roughly a
  third of the newsletter from places the pipeline does not see. A ranker trained or evaluated
  on the pool can never propose those. That caps how much of the issue the system can ever
  build, independent of model quality.
- **The absences are not random.** They cluster on dead and non-integrated sources. Any
  evaluation on the matched 68% is therefore measuring a population selected on
  source-integration status, which correlates with venue type and event size. This is a real
  bias, and it is the reason to report it rather than quietly evaluate on the matched subset.

**Sample size:** 7 clean issues × ~10 recoverable positives ≈ 70 positives. Enough to *evaluate*
whether `P(elig) × P(section)` ranks published events highly. Not enough to *train* a learned
ranker on high-dimensional embeddings.

---

## Reproduce

```
node scripts/poolCoverage.js <residuals-out.md> 2026-06-04
```

Read-only; reads `data/beehiiv/issue_history.json` and the pool snapshot, writes only the
residual worksheet you name. **Auto-match only** — it reproduces the 78-row automated column,
not the result. The 26 recoveries and 12 evergreen rulings are hand judgments recorded in this
file; re-running the script without redoing them reproduces the *understated* 78/165.

Refresh the published-issue history first if extending the range: `node scripts/fetchBeehiivHistory.js`.
