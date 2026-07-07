# Click-Join Eval Set — Legend & FAQ (frozen R6 answer key)

**What this folder holds:** the **frozen, version-controlled** labeled evaluation set for R6 (Scoring) —
three files with a shared name: `click_join_FROZEN_2026-07-07.json` (full data + metadata),
`.csv` (the human-readable rows), and `.txt` (at-a-glance summary). Each row is one event that was
published in one past newsletter, tagged with **how well it performed relative to the other events in
its section that issue.**

**Why it lives here (outside `data/`):** `data/` is gitignored because it holds raw `link_clicks_*.csv`
exports bearing `_bhlid` subscriber tokens. This join output is **PII-free** (only stripped URLs +
aggregate click counts + percentiles — verified 0 `_bhlid`, 0 emails), so it is safe to commit — and it
*should* be, because it's a load-bearing R6 dependency that must not survive as a single unbacked copy.

Built by [`scripts/joinClicksData.js`](../scripts/joinClicksData.js). That script writes **ephemeral,
gitignored** runs to `data/tracking/click_analysis/` (recreated on each run); the canonical run is
promoted here and committed.

---

## 1. What is this, in one sentence?

We took every event we've ever published, looked up how many people clicked it, and scored each one by
**how it ranked against the other events in its section that week** — higher score = did better. That
score is the *label* — the "right answer" R6's scoring formula will be graded against.

**Why it exists:** R6 replaces "sort by recency" with a real scoring formula. To know whether a formula is
any good, we need historical examples of what *did* well. This file is that answer key.

---

## 2. How it's built (the order things happen)

```
1. Read issue_history.json      → every past issue + its published events (77 issues)
2. Read newest link_clicks_*.csv → raw Beehiiv click counts per link
3. Keep only the 3 SCORED sections (For Families / For Couples / For Golden Age Readers)
4. Match each published event to its click row  (join on the event URL)
5. Drop issues younger than 7 days               (clicks are front-loaded — young issues aren't done clicking)
6. Group events by section-within-issue          (e.g. "For Families in the Feb 6 issue" = one group)
7. Drop groups with fewer than 4 matched events  (a rank over 2–3 events is noise)
8. Within each group, rank events by clicks → convert rank to a 0–1 percentile  ← THE LABEL
9. Write the JSON, CSV, and summary
```

Local Aroma and Trust Me Recipe are **excluded on purpose** — R6 doesn't score them (Trust Me Recipe is
manual; Local Aroma isn't in the R6 scoring scope).

---

## 3. Field dictionary (the `records` array — one object per event)

These are the columns you see in the CSV.

| Field | Meaning |
|---|---|
| `issueDate` | Date that issue was sent |
| `section` | Which newsletter section: For Families / For Couples / For Golden Age Readers |
| `slot` | Position 1–5 within that section (1 = top of the section) |
| `eventName` | The event's editor-final title from the newsletter (from `issue_history.json`) |
| `slug` | The issue's Beehiiv URL slug — identifies which issue this pick came from |
| `url` | The event link that was in the newsletter |
| `vuc` | **Verified Unique Clicks** — how many distinct subscribers clicked it (bots filtered out). *The number the label is built from.* |
| `vtc` | **Verified Total Clicks** — total clicks including the same person clicking twice. Carried for reference; not used for the label. |
| `sectionSize` | How many events were in this event's section that issue — the denominator the percentile is measured over (usually 5, sometimes 4) |
| `percentileVuc` | **THE LABEL.** This event's rank *within its section that issue*, 0–1. Higher = more-clicked relative to its peers. Ties split the difference (mid-rank), so in a group of 5 the best scores `0.9` and the worst `0.1` — see §4. |

### The metadata block (JSON-only — NOT in the CSV)

The blocks below live **only in the `.json` file**; the CSV is just the rows. For a quick read of these
numbers without opening JSON, use the `.txt` summary sidecar.

| Field | Meaning |
|---|---|
| `capturedAt` | When this file was generated |
| `scope` | Plain-English reminder of what the label does/doesn't validate (see §6) |
| `inputs` | Which history file + which click CSV fed this run, and the CSV's export date |
| `config` | The knobs: metric (`Verified Unique Clicks`), `maturationMinAgeDays` (7), `minSectionSize` (4) |
| `coverage` | How many picks got matched to a click row — overall and per section (see §5) |
| `maturation` | Which issues were excluded for being too young (<7 days at export) |
| `sections` | How many section-issue groups were kept vs. dropped for being too small |
| `slotGradient` | Mean label by slot 1→5 — the position-bias readout (see §7) |
| `recordCount` | Number of labeled records (rows in `records`) — **924** in the frozen set |

---

## 4. Key concepts

**Section-within-issue = the comparison group.** "For Families in the Feb 6 issue" is one group of ~5
events. The label is always *relative within that group* — an event is only ever compared to the other
events it competed with in the same section, same issue, never across issues or sections.

**Why a percentile, not raw clicks?** Raw click counts aren't comparable across issues or sections. A
summer issue with more subscribers, a longer list, or a broader-appeal section all inflate raw clicks with
no bearing on whether *that* event was a good pick. Ranking *within the group* strips all of that out — it
isolates "was this a good pick for its section," which is what R6's formula controls.

**Why a percentile and not just "rank 1–5"?** Because the groups aren't all the same size — **46 of the
194 groups have only 4 matched events, not 5** (a 5-event section where one event didn't join to a click
row — a coverage gap, §5 — or the rare section that genuinely ran <5 events). "3rd place" means something
different in a group of 4 (middle-ish) than in a group of 5 (dead center). Percentile divides by group
size, so a 4-event section and a 5-event section become directly comparable when all 924 records are
pooled for the downstream evaluation. Plain rank would break that. (If every group were exactly 5,
percentile would add nothing over rank — it earns its place *only* because size varies, and since coverage
is never 100% that variation is permanent.)

> **Caveat from coverage gaps:** when one of five events is unmatched and dropped, the *remaining* four
> events' percentiles shift (a missing top-clicker nudges the others up; a missing dud nudges them down).
> Minor, but real — mostly in the early-2025 (least-covered) rows.

**Why the best score is 0.9, not 1.0.** The percentile is *mid-rank*: `(# below + 0.5 × # tied) / group
size`. The top event in a group of 5 has 4 below it and 1 tie (itself) → `(4 + 0.5)/5 = 0.9`. In a group of
4 the top is `0.875`. This centering (a group's scores average to ~0.5) is standard and keeps groups of
different sizes comparable — it's convention, not a bug. So read `percentileVuc` as *relative position*,
not "percent of clicks."

**Example (Feb 6 issue, For Families):**

| slot | eventName | vuc | percentileVuc |
|---|---|---|---|
| 4 | Kids Cooking Classes | 31 | **0.9** ← best in section |
| 1 | Skating, Live DJ, Giveaways | 26 | 0.7 |
| 2 | Spa packages for kids | 21 | 0.5 |
| 3 | Lunar New Year Celebration | 20 | 0.3 |
| 5 | Children's Art Classes | 13 | **0.1** ← worst in section |

Same raw count of 13 clicks lands at `0.1` here but `0.5` in For Couples that same issue — because Couples
clicked less overall. That's the normalization working.

---

## 5. Coverage — why isn't it 100%?

This run matched **85.8%** of picks (966 of 1,126) to a click row. The ~14% that didn't match are almost all
**recurring events** whose Beehiiv `utm_campaign` tag doesn't equal the issue slug (different namespaces), plus
a few link formats that don't join cleanly (Pinot's Palette, Facebook, Eventbrite — see `coverage.unmatchedByDomainTop`).

85.8% is the **correctly-attributed** number on purpose. A naive URL match would hit ~92% but would misattribute
a recurring event's clicks to the wrong issue. We'd rather drop an event than mislabel it. Known side effect:
recurring/popular venues are slightly under-represented in the eval set.

After matching, two more filters shrink 966 → **924 labeled records**: young issues removed (maturation), and
section-issue groups with fewer than 4 matched events dropped.

---

## 6. What this label DOES and DOESN'T prove

- ✅ **It grades ORDERING** — given the 5 events that were already chosen for a section, did the more-clicked
  ones deserve to rank higher? A grossly wrong formula will disagree with this label and get caught.
- ❌ **It does NOT grade SELECTION** — whether the *right* events were chosen in the first place. We only have
  the events the editor picked; there's no record of the events they rejected, so there's nothing to compare a
  "should we have picked this instead" decision against.

**Selection is validated a different way — forward, via swap-rate** (how often the editor overrides the
formula's picks on live runs). This file is a *directional floor check*, not the final word — a green backtest
here is necessary, not sufficient. See [`clicks_analysis_2026-05-13.md`](../data/beehiiv/clicks_analysis_2026-05-13.md).

---

## 7. Position bias (read `slotGradient`)

Mean label by slot: **1 → 0.60, 2 → 0.52, 3 → 0.48, 4 → 0.46, 5 → 0.43.** Higher slots get more clicks. But
this is **confounded**: the editor deliberately put the events they judged strongest at slot 1, so we can't
tell how much of the gradient is "position drives clicks" vs. "good events were placed high." With only
historical data the two can't be separated, so slot is **carried as a covariate, not corrected for.** (Formal
debiasing exists but is overkill at ~13k subscribers / 5 slots.)

---

## 8. Maturation cutoff (why 7 days)

Clicks are front-loaded — a subscriber opens the email within days and clicks then, and essentially never
returns to an old issue. Measured 2026-07-07 via a two-snapshot (May→Jul) diff of the *same* issues: clicks
grew **<0.5%** over two months for any issue already ≥7 days old at export. So the cutoff is **7 days** — issues
younger than that are excluded because their clicks haven't settled. (The frozen set excludes only
`beat-the-heat-your-5-smart-picks`, 5 days old at export.)

> **Unverified edge:** the diff proved clicks don't grow *after* day 7; it did not measure days 0–7. So the
> 7-day floor is safe for issues comfortably past it (e.g. the 12-day Canada Day issue that's included), but a
> future refresh admitting a *just*-7-day issue rests on an unmeasured assumption. Bump the cutoff if in doubt.

---

## 9. How to actually read the file

- **Easiest:** open `click_join_FROZEN_2026-07-07.csv` in Excel. `eventName` (col D) tells you what each row
  is. Sort by `percentileVuc` for best/worst picks; filter by `section` or `slug`.
  - ⚠️ **When sorting in Excel, select the whole table (or click one cell and use Data → Sort, which
    auto-expands) — never highlight just one column.** Sorting a single column detaches it from its rows and
    scrambles the data.
- **Quick stats:** open the `.txt` summary — coverage, slot gradient, excluded issues, in plain text.
- **The JSON** carries the same rows under `records`, plus the metadata blocks (which are JSON-only). Don't
  read it by eye — it's for scripts.

---

## 10. Regenerating / re-freezing

```
node scripts/joinClicksData.js
```

Auto-picks the newest `link_clicks_*.csv` in `data/beehiiv/` and the current `issue_history.json`, writes a
new timestamped **JSON + CSV + summary** trio to `data/tracking/click_analysis/` (ephemeral, gitignored).
Re-run after pulling a fresh click export or re-running `fetchBeehiivHistory.js`. **To promote a new run to
the frozen answer key:** copy its trio here as `click_join_FROZEN_<date>` and update this README.

**Config knobs** (top of the script, hardcoded — this is offline one-shot analysis, not a live path):
`SCORED_SECTIONS`, `MATURATION_MIN_AGE_DAYS` (7), `MIN_SECTION_SIZE` (4), `CLICK_METRIC` (Verified Unique Clicks).

Build plan (completed 2026-07-07): `~/.claude/plans/proud-dancing-origami.md`.
