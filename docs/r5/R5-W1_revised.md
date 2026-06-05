# R5-W1 Gate Check

Date: 2026-06-04

This is the short pre-W2 check-in requested in `docs/R5_Scope.md`. It preserves the original W1 source choices, but fills the gaps called out in review: actual source table, Facebook vs non-Facebook breakdown, valid tenant config, resolved geography, Markham method, and Meetup URLs.

Supporting artifacts:
- `docs/r5/R5_W1_analysis_last7.md`
- `docs/r5/vaughan.r5-w1.config.json`
- `scripts/r5W1Analysis.js`

## Status Summary

| Area | Status | Notes |
|---|---|---|
| Read `docs/R5_Scope.md` | Done | W2 should not start on the live workflow. Use dev copy + scratch/disabled upsert discipline from the scope doc. |
| Analyses 1-3 | Done | Domain tally, section fill, and venue/domain repeat are in `R5_W1_analysis_last7.md`. |
| Analyses 5-7 | Done | Stale sources, Facebook share, and URL recurrence are in `R5_W1_analysis_last7.md`. |
| Analysis 4 | Blocked | Requires Airtable Candidates export/snapshot or Airtable credentials. No local Candidates snapshot was available. |
| Geography | Done | Markham and Richmond Hill moved into `include`; `adjacent` is empty. |
| Idempotency key | Done | Keep `title|date`; no migration. |
| Source selection | Done | Proceed with TRCA, Markham BiblioCommons, McMichael, and Meetup. |
| Tenant config | Done | Valid JSON created with `airtableBaseId`, `beehiivPubId`, `segments`, `sources`, `geography`, `quotas`, `scoringWeights`, and `prompts`. |

## What Was Good In The Original W1

The four source choices were directionally right. The last-7-issue domain tally supports TRCA and Markham BiblioCommons strongly, and the clicks analysis supports keeping McMichael and Meetup in the candidate set even where the last-7 volume is smaller.

The integration-method instincts were also mostly right:
- TRCA: iCal if available, JSON-LD per event page as fallback.
- Markham BiblioCommons: per-event iCal, not a generic API path.
- McMichael: iCal.
- Meetup: group-level iCal, not the global search page.

## What Changed

### 1. Task 1 now has actual evidence

The original line said the info came from `issue_history.json`, but did not show the table. The revised analysis uses the last 7 issues only, as requested.

Top useful domains:

| Domain | Placements | Decision |
|---|---:|---|
| facebook.com | 85 | W3 manual intake, not W2 automation |
| calendar.trca.ca | 23 | W2 source |
| markham.bibliocommons.com | 23 | W2 source |
| eventbrite.ca + eventbrite.com | 31 | Already in R1 |
| mcmichael.com | small last-7 count, high click signal | W2 source |
| meetup.com | 5 | W2 source, but section fit corrected |

Important Facebook finding: Facebook is 85/383 placements in the last 7 issues, or 22.2%. That is much lower than the clicks analysis finding that Facebook drove 58% of event clicks. So the W3 case should be framed as reliability for high-click inventory, not because Facebook is the majority of recent placements.

### 2. Meetup section fit changed

Original W1 said Meetup was 5 events in `For Golden Age Readers`. The last-7 issue data shows the 5 Meetup placements were all in `For Couples`:
- `torontobikemeetup`
- `women-that`

Decision: keep Meetup, but configure it for `for_couples` unless a new senior-specific group list is provided later.

### 3. Markham method is resolved

Original config said `"method": "api"`, but the writeup said per-event iCal. The revised config resolves this to:

```json
"method": "per_event_ical"
```

Reason: R5_Scope says iCal first, undocumented API second. Per-event iCal is the lower-risk path if the event IDs can be harvested from the listing page.

### 4. Tenant config is now actually multi-tenant

Original config was a Vaughan source list. The revised file adds the multi-tenant fields the review called out:
- `airtableBaseId`
- `beehiivPubId`
- `scoringWeights`
- `prompts`

It also separates `segments` from `quotas`, because those are different concepts. A segment can be active/inactive independently from its allocation quota.

### 5. Local Aroma and Trust Me Recipe are inactive for R5 source expansion

The original config had both active. The June 4 decision log parks Local Aroma and Trust Me Recipe automation, so the revised config sets them inactive and gives them 0 automatic quota for source expansion. This does not remove them from the existing newsletter; it prevents R5 W2 from accidentally expanding parked sections.

## Source Decisions And Logic

### TRCA / Black Creek

Decision: proceed.

Why:
- `calendar.trca.ca` appears 23 times in the last 7 issues.
- It spans Families, Couples, and Golden Age, which makes it useful across the allocation pool.
- It replaces the less-structured `blackcreek.ca/events/` decision-sheet entry with the actual calendar backend.

W2 implementation:
- Try iCal endpoints first.
- If list iCal fails, use listing page -> event page -> JSON-LD extraction.

### Markham BiblioCommons

Decision: proceed.

Why:
- 23 placements in the last 7 issues.
- 19 of those are in Golden Age, exactly where source depth is hard to get.
- The source is structured and should produce clean title/date/link data.

W2 implementation:
- Harvest event IDs from `https://markham.bibliocommons.com/v2/events`.
- Fetch per-event iCal where available.
- Avoid treating the listing page itself as the final event endpoint.

### McMichael

Decision: proceed.

Why:
- Last-7 volume is not as high as TRCA/Markham, but the clicks analysis shows McMichael averaging 26.3 verified unique clicks per link on a small sample.
- Because sample size is small, do not use that as a scoring weight yet. Use it as a source-selection hint only.

W2 implementation:
- Use `https://mcmichael.com/events/?ical=1`.
- Add category feeds such as adult programs if needed after testing.

### Meetup

Decision: proceed, but with corrected framing.

Why:
- The last-7 slice has 5 Meetup placements, all in Couples.
- Clicks analysis says Meetup has 19.3 avg clicks/link on a small sample, so it is worth testing but not weighting.
- The global seniors search page is not a stable source. Use group iCal URLs.

W2 implementation:
- Start with these group feeds from the actual last-7 URLs:
  - `https://www.meetup.com/torontobikemeetup/events/ical/`
  - `https://www.meetup.com/women-that/events/ical/`
- If the client wants Golden Age coverage from Meetup, get 3-5 specific senior group URLs before adding them.

### Facebook

Decision: do not automate in W2; keep W3 manual intake.

Why:
- Facebook is 22.2% of placements in the last 7 issues, but 58% of event clicks in the 15-month clicks analysis.
- That makes Facebook a high-value source even when it is not the majority of placements.
- TOS and fragility still make automation out of scope.

W3 implication:
- The manual intake reliability alert should be framed around click risk: if weekly Facebook submission is missed, high-click inventory is likely missing.

## Blocker Before W2

Only Analysis 4 remains blocked: published URL vs Airtable Candidates.URL cross-reference.

Needed input:
- A current Candidates snapshot from `scripts/snapshotCandidates.js`, or
- Airtable credentials available locally, or
- An exported Candidates CSV/JSON with at least `URL` and `Status`.

Once that exists, run:

```powershell
node scripts\r5W1Analysis.js --history "C:\Users\nc\Downloads\issue_history (2).json" --last 7 --candidates "path\to\candidates_snapshot.json"
```

**Note (2026-06-04, Ariel):** superseded in substance by the 484-record live audit (pool ~93% Eventbrite, `LocationName`/`Source` 0% populated). Analysis 4 is low-value to chase and is not treated as a W2 blocker. See Decision_Log §32.

## W2 Guardrails To Carry Forward

Do not edit the live R1 workflow directly. Re-export live R1, duplicate it to a W2 dev workflow, and point the dev copy at scratch data or disable upsert while testing.

Build additive source branches first, validate each branch output before merge, then handle behavior changes: recurring EndDate expiry, source normalization, and schema validator. Run validator log-only before hard reject.

Do not map `Status` in any upsert branch. R1 must never reset editor-approved or rejected records.
