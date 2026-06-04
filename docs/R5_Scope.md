# R5 Scope

**Owner:** Nathan  
**Deadline:** June 4  
**Roadmap:** `docs/NLAP_PostMVP_Roadmap_v3.md`

**Read order:** this doc → `docs/source_decision_sheet.md` → roadmap (only if you need full release context).

**Tracking:** Tasks live in GitHub Issues #33 (W1), #34 (W2), #35 (W3), #53 (data analysis input to W1). Close them as you go.

**Key data input:** `data/beehiiv/issue_history.json` contains 2,729 `(section, url)` pairs across 72 past published issues, generated from the Beehiiv API. This is the ground truth for W1 — it tells you what sources actually fed the newsletter over the last 15 months, which sections are thin, and which sources have gone stale. Everything in W1 builds off this file.

---

## W1 — Source Audit + Newsletter Config Design

**Effort:** ~3h | **Blocks:** W2

### What W1 is for

The pipeline currently pulls from RSS feeds and Eventbrite only. The candidate pool is thin — not enough events to fill all five sections with quality picks. W1's job is to figure out which sources should be added in W2 by looking at what the client has actually been publishing over the last 15 months, confirming those sources still have live endpoints, and designing the config structure that W2 will build against. You can't start W2 without W1 signed off by Ariel, because W2 builds directly on the source decisions and config structure you produce here.

### Current state (2026-06-03)

Some of this is already done. Here's where things stand:

**Done:** The domain tally (#53 analysis 1) has been run against `issue_history.json`. Four sources have been identified with proposed integration methods — `calendar.trca.ca`, `markham.bibliocommons.com`, `mcmichael.com`, and `meetup.com`. A config schema has been drafted.

**Still needed before the W1 gate:**

Run #53 analyses 2–7 (section fill rate, venue repeat, data quality, stale source detection, Facebook share per section, URL recurrence) and post one-line takeaways in #pipeline. These aren't optional — the Facebook % breakdown is an explicit R5 exit criterion, and stale source detection tells you which sources not to wire up in W2.

The Markham Bibliocommons method needs to be resolved. The source analysis says per-event iCal; the config says `"method": "api"`. Pick one — the priority order is iCal first, undocumented API second.

The Meetup endpoint is a placeholder (`"(input list of group ical urls)"`). Find the actual group iCal URLs before W2.

The config has two problems: JS-style comments (`//`) aren't valid JSON and need to be removed, and the multi-tenant fields are missing — add `airtableBaseId`, `beehiivPubId`, `scoringWeights`, and `prompts`. Without those four fields, the config is a source list, not a tenant config. The whole point of the config is that swapping those four fields is what makes the pipeline work for Mississauga instead of Vaughan.

**Gates already resolved by Ariel — do not re-open:**

Geography is confirmed: Markham and Richmond Hill are `include`, same tier as Vaughan. Move them out of `adjacent`. The newsletter covers all three equally.

The idempotency key stays as `title|date`. The theoretical collision risk (same-day same-title events from high-volume sources) is low enough at this scale that adding venue back isn't worth the migration cost. Monitor in practice.

Four sources are signed off. Proceed with all four if all have iCal or undocumented API.

Prereq #1 (R2 classification eval) does not block you. That's Ariel's gate for R6/R7. W2 is ingestion plumbing — classification quality is irrelevant to whether the source branches work correctly.

### Tasks

**Task 1 — Run the analyses.** Run all seven analyses from GitHub Issue #53 against `issue_history.json`. The ones that matter most for W2 are stale source detection (don't wire up dead sources) and Facebook share per section (context for W3 scoping). Post one-line takeaways per analysis in Discord #pipeline.

**Task 2 — Cross-reference three inputs.** Take the analysis output from Task 1 and compare it against two other things you have: `docs/source_decision_sheet.md` (Ariel's audit of which websites the client sources from) and `data/beehiiv/clicks_analysis_2026-05-13.md` (which sources drive actual engagement). The goal is to reconcile contradictions — if a source is in the decision sheet but shows up as stale in Task 1, flag it. If a source dominates volume in Task 1 but isn't in the decision sheet, flag it. You want all three inputs pointing at the same four sources before you lock in W2.

**Task 3 — Probe integration methods.** For each of the four sources, confirm the integration method by actually testing it. Try in this order: iCal endpoint first, then undocumented API (browser dev tools → Network → XHR/Fetch), then JSON-LD embedded in the HTML, then HTML scraping as a last resort. Document the confirmed method and endpoint for each source. If any source requires HTML scraping, drop to three sources — don't let one hard source eat the W2 budget.

**Task 4 — Fix and finalize the config.** Take the drafted config and close the open items: move Markham and Richmond Hill to `include`, fill in the Meetup group iCal URLs, resolve the Markham Bibliocommons method, remove JS comments, and add the four missing multi-tenant fields. The finished config is what Ariel reviews at the W1 gate.

### Done When

All seven #53 analyses are run and posted. Four sources (or three, if any need scraping) are confirmed with method and endpoint. The config is valid JSON with all multi-tenant fields present. Ariel has reviewed and signed off before W2 starts.

**Tracked in:** #33 (W1 tasks), #53 (data analysis input)

---

## W2 — Source Integration + Multi-Tenant Plumbing + Integrity Guards

**Effort:** ~5h | **Prereq:** W1 signed off by Ariel

### What W2 is for

W2 takes the source decisions from W1 and builds them into the live R1 n8n workflow. Every new source becomes a separate branch that fetches, normalizes, and merges into the existing Candidates upsert node. On top of that, W2 fixes two known bugs in the existing pipeline — recurring events that get dropped too early (Debt #8) and inconsistent source names that will break R6 scoring (Debt #5) — and adds a schema validator that hard-rejects malformed records before they hit R2.

All source ingestion stays in n8n. These are not Node.js scripts — use native n8n nodes where available, Code nodes where not.

### Safe Execution — Read This Before Touching Anything

R1 ships a real newsletter every Thursday. W2 edits the running system, and three of the ten steps don't add new behavior — they change existing behavior (recurring event expiry, source renaming, schema rejection). Those are where corruption hides. Follow this discipline exactly.

**Step 0 — before any changes.** Re-export the current live `NLAP R1` workflow to git (`workflows/NLAP_R1.json` may be stale — export the actual running version and commit it). This is your rollback. Then duplicate the workflow to `NLAP R1 - W2 dev` and do all W2 work on the copy. The live workflow keeps shipping Thursdays untouched. Point the dev copy at a scratch Candidates table, or disable the upsert node entirely, so dev runs never write to the live table. A dev run against the live table can silently overwrite editor-approved records — this is the single most important guardrail in W2.

**Phase 1 — additive source branches (safe).** Build one source branch at a time. Before connecting any branch to the merge node, use n8n's pin/execute-single-node to inspect its output in isolation and confirm the UniqueEventID is formatted correctly (`title|date`), dates are ISO, and the source name is normalized. One branch validated, then the next. Wrap every external fetch in `continueOnFail` so a dead source can't kill the whole run — undocumented APIs and iCal feeds will be flaky.

**Phase 2 — behavior changes (risky).** The recurring event fix and source normalization both change what the existing pipeline does to records it has already seen. Don't just make the change and see if it runs. Take last week's actual candidate set, run old logic vs new logic, and diff the outputs. Confirm no previously-valid event is newly dropped, no stale event is newly retained, and no source name is changed in a way that breaks a downstream consumer. Source renaming is sneakier than it looks — the max-1-venue-per-section rule, dedup, and R6 scoring all key on source name. A broken remap fragments dedup silently.

**Phase 3 — schema validator (log-only first).** Run the validator in count/log-only mode before enabling hard-reject. Have it emit `MISSING_DATE` / `MISSING_LINK` / `MISSING_TITLE` counts to the execution log without dropping anything. Inspect the list for false positives — a valid event with a quirky field format. Only flip to hard-reject once you've confirmed it's not eating good records. A too-aggressive validator silently shrinks the candidate pool, which is the opposite of what R5 is trying to do.

**Phase 4 — idempotency and R2 flow.** Run the dev copy twice against the scratch table and confirm the record count is stable (no dupes) and no Status churn. Then push a handful of new-source candidates through R2 classification and confirm they classify correctly without breaking the LLM path.

**One thing to check before adding any branches.** There's a single merge node where all branches converge. In n8n, merge mode matters — if it's set to "combine by position" rather than "append," adding new branches misaligns rows. Confirm it's set to append before touching it.

**Upsert node rule — never map Status.** Every new branch maps Title, Date, Link, Source, etc. into the upsert node, but never map the `Status` field. Re-upserting an event the editor already set to Approved must not reset it to New. This fix was already applied to the existing R1 branches — apply the same rule to every branch you add.

**Cutover window.** Swap dev→live only on Fri–Mon. Never touch the workflow on Tue–Thu — Thursday is the live issue and you don't want to be debugging a broken workflow the day before it runs. On the first live run after cutover, compare the candidate count and source mix against the pre-W2 baseline (the 433-record snapshot from `snapshotCandidates.js`). An unexplained swing means something in the merge or dedup misfired.

### What to Build

Each new source follows the same pattern:

```
[Source Trigger] → [Fetch Events] → [Normalize to Candidates Schema] → [Merge]
```

Map every source to the canonical Candidates schema before the merge node. Required fields: Title, StartDate, EndDate (if available), Link, LocationName, City, Source.

**Newsletter config** lives as a Set node at the top of the R1 workflow. It stores Vaughan-specific config: segments, geography (Vaughan, Markham, Richmond Hill all `include`), quotas, and active sources. Mississauga gets its own cloned workflow at R8 — no flag or JSON config file is needed now. The point of externalizing this into a Set node is that it makes the Mississauga clone a two-minute job instead of a search-and-replace across the whole workflow.

**Recurring events fix (Debt #8).** Currently the pipeline uses StartDate to decide whether an event is still in the date window. Events with an EndDate that extends past the window cutoff are being dropped even though they're still active. Fix: when EndDate is present, use EndDate to gate expiry instead of StartDate.

**Source normalization (Debt #5).** Source names are inconsistent across the existing pipeline — the same site appears under multiple names depending on how it was ingested. This matters because R6 scoring weights per source, and dedup keys off source name. Add a Set or Code node that maps raw domain → canonical source name (e.g. `inoreader.com` → `McMichael RSS`) and apply it once, before the merge node, for every branch including the existing ones.

**Airtable retry.** The Node.js scripts already have Retry-After header backoff added in the 2026-05-21 script review. Confirm the n8n upsert node also has retry enabled — it should match.

### Done When

Three to four new source branches are live in R1, all mapping correctly to the Candidates schema. The newsletter config is in a Set node at the top of the workflow. Recurring events are no longer dropped incorrectly. Source names are consistent across all records. The schema validator is running and rejecting malformed records with typed reasons. Reruns don't create duplicates. New candidates flow through R2 classification correctly.

**Tracked in:** #34

---

## W3 — Facebook Manual Intake + Candidate Pool Checks

**Effort:** ~3h | **Prereq:** W2 source branches live

### What W3 is for

Facebook drives 58% of click volume across the 15-month Beehiiv history (Decision_Log §18). Automating it is off the table — the TOS risk and fragility aren't worth it, and that decision is locked. What W3 builds instead is a reliable manual intake path: the client pastes Facebook events into a structured drop zone weekly, and the pipeline processes them identically to automated sources. W3 also adds the safety checks that catch candidate pool problems before R3 allocation runs — because if the pool is too thin, scoring in R6 is cosmetic and the newsletter ships with whatever's left.

Before starting W3, check the Facebook share per section output from #53 analysis 6. If Facebook's placement share across sections is much lower than its 58% click share, that tells you Facebook is the clicks goldmine but not the volume source — the reliability checks stay as scoped but the intake format matters less. If placement share is also ~58%, Facebook is both the volume and clicks engine, which strengthens the case for making the intake as friction-free as possible for the client.

### Tasks

**Task 1 — Pick the intake format.** The two options are an Airtable form the client fills weekly or a watched folder with a CSV drop. Default to the Airtable form — it's easier to validate at intake, has no file-system dependency, and requires no extra infrastructure for the client to manage.

**Task 2 — Build the intake handler.** Reads from the drop zone and maps each entry to the canonical Candidates schema: Title, StartDate, EndDate (optional), Link, LocationName, City, Source = `"Facebook"`. Upserts via UniqueEventID in `title|date` format.

**Task 3 — Test idempotency.** Submit the same record twice and confirm no duplicate is created. This is non-negotiable — idempotency is a pipeline non-negotiable and Facebook intake must behave identically to automated sources.

**Task 4 — Test with a real sample.** Pull 3–5 actual Facebook events the client has submitted before and confirm they flow through R2 classification correctly. Don't test with synthetic data.

**Task 5 — Add pool safety checks.** Three checks: (1) Before R3 runs, hard-flag if the eligible candidate pool is below 75 — that's the 3:1 ratio against 25 allocation slots, and below that number R6 scoring is cosmetic. (2) In each run, count Facebook records. If zero and it's been 8+ days since the last Facebook submission, flag it in the run log — the client committed to weekly submission and a miss loses more than half the issue's click potential. (3) After W2 and W3 both ship, document the candidate-to-slot ratio in the run log as a go/no-go signal before starting R6.

### Done When

The client can submit Facebook events manually and the pipeline processes them identically to automated sources. Idempotency is confirmed. Pool count, Facebook 0-submission detection, and candidate-to-slot ratio checks are all in place and tested.

**Tracked in:** #35

---

## R6-Substrate Lens — Field Capture, Source Selection & Ingestion Risk (added 2026-06-04)

**Status:** Ariel taking over R5. This section layers R6-scoring concerns and risk findings on top of the W1–W3 plan above — it does **not** replace them. Source: signal-design audit + 484-record live-data audit, 2026-06-04 (see `Execution_Log.md` 2026-06-04 deep-session entry, `docs/Decision_Log.md` §28 amendment, §30, §31).

### Why this section exists — the reframe

R5 isn't just "add volume." **It's the data substrate R6 scoring runs on.** Ingestion sets the ceiling: you can't score on a field you didn't capture, and you can't backfill history retroactively. Done right, **R5 is the first half of R6** — you're laying the rails the scoring later runs on. This is the "check the substrate before designing on top of it" lesson, pointed forward.

### Live-data findings that drive this (484-record audit, 2026-06-04)

- Pool is **~93% Eventbrite monoculture** (almost all Eventbrite + allevents.in). The diverse sources in `issue_history.json` (Facebook 240, McMichael, bibliocommons, visitvaughan) are the editor's 15-month *manual* history — the automated pipeline currently pulls ≈only Eventbrite.
- **`LocationName` and `Source` are 0% populated** in the live Candidates table. The existing Eventbrite branch doesn't write them, even though W2's schema lists them as required. **Fixing the existing branch to populate them is in-scope and is a live-behavior change — treat it per the W2 Phase 2 diff discipline above.**
- **~30 foreign Eventbrite domains** (`.de`/`.fr`/`.sg`/`.com.au`) leaking past the GTA geo-filter. Correctness hole, filed as a GitHub issue.

### How a pro frames this (pro-approach digest)

- **Domain:** data engineering — a schema-contract + ingestion-normalization problem, not a scoring problem. The 0% population is an *enforcement* failure, not a missing field.
- **The reframe:** the task isn't "capture venue" — it's "define the contract that guarantees the fields are populated and normalized *regardless of which adapter produced the record*."
- **Validate before building:** pull a real sample from each candidate feed and inventory it — **field contents AND segment skew** — before designing the schema or picking sources. The whole plan assumes the feeds carry the fields; confirm it (you already paid once for assuming a field was populated when it was 0%).
- **Not a rebuild.** Additive branches + one shared normalization node + one targeted fix to the existing branch. Rebuilding a working idempotent Thursday pipeline to satisfy an abstraction is the over-engineering trap; the locked W2 plan (additive branches, stays in n8n) stands.

### Decisions / discipline (gutcheck-hardened)

1. **Split field capture by cost.** *Cheap* payload fields already in the feed (venue, category, description, source) → map via the normalization node now, near-free, serves both R6 paths. *Expensive* structured extraction (fuzzy venue resolution, scraping venue from unstructured sources) → **DEFER until the R6 formula-vs-LLM decision (post-R5).** If R6 goes LLM/hybrid it reasons over Title + Description and won't need structured venue/category — don't gold-plate fields one path won't use.
2. **Field population ≠ signal. Diversity is the lever.** Populating `Source` on monoculture records writes "Eventbrite" 93% of the time — zero discriminating power. The new diverse *sources* unblock the source prior; field capture just records them. Keep the two payoffs separate in your head.
3. **Source selection = segment coverage, not raw volume.** Criterion for which sources to add: *which segments does Eventbrite starve, and which sources fill them?* (library/bibliocommons → Golden Age + Families programs; cultural venues → Couples/Golden Age.) Target thin sections so every segment has surplus and ranking matters everywhere. **Prereq: measure per-section candidate depth first** (#53 analysis 2) — pick sources to fill measured gaps, not blind.
4. **Consumer-driven schema, not source-driven.** Derive required fields from what R2/R6 *consume*, not from what Vaughan's feeds happen to provide. Source-driven over-fits Vaughan and won't port to Mississauga. Map each source into the contract; accept that some sources won't fill every field (neutral default in scoring, not a penalty).
5. **Shared normalization node = the Debt #5 fix.** Keep it — inline-per-branch mapping recreates the source-name drift you're fixing. But routing the *existing* Eventbrite branch through it is the one live-behavior change — isolate and idempotency-test it per W2 Phase 2/4.
6. **Capture raw inputs, not derived scores.** Source, venue, category, description. No `Score_Final` sub-fields or weights — those are R6, built from these inputs later.
7. **Auto-capture from the payload; no new manual tracking fields.** Take what the feed already carries; don't add manual-entry fields "to have metrics."

### Risk register (gutcheck — silent / Thursday failures)

1. **Geo-filter fix (foreign Eventbrite) — the riskiest item, disguised as a small fix.** Wrong reject logic silently drops valid GTA events → section under-fills → short Thursday issue. **Run log-only first** (like the schema validator, W2 Phase 3); log every rejection with a typed reason; test against a known-good GTA set before flipping to hard-reject. More care than the additive work, not less.
2. **Partial / wrong field population.** A new source fills venue for 60% of records and blanks the rest, or maps the wrong payload field into `LocationName` → R6 later computes priors on contaminated data, silently. **Add a per-source population-rate check at ingestion.** Plausibly-wrong is worse than empty.
3. **Idempotency break on the live upsert.** A new adapter's title format shifts `UniqueEventID` → duplicates in the live pool. Per W2 Phase 4 rerun test. The upsert node is the one place a mistake corrupts editor-approved data.

### The portable asset

The **canonical Candidates schema + adapter contract** (each adapter = a pure function `raw feed → canonical record with required fields`). 100% reusable for Mississauga — new city, new sources, same contract, same downstream. Hardcode the Vaughan-specifics (aggregator domain list, GTA geo-filter, source endpoints). The contract is the product asset: it's what lets client #2 onboard via config.

### Concrete next actions (in order)

1. **Sample each candidate feed** → inventory fields + segment skew (gates field capture *and* source selection).
2. **Measure per-section candidate depth** on a recent issue → identify which segments Eventbrite starves.
3. **Pick/confirm sources to fill the thin segments** (overlaps W1 Tasks 1–3).
4. **Add cheap-payload field mapping** via the shared normalization node; fix the existing Eventbrite branch to populate `LocationName`/`Source` (W2 Phase 2 discipline).
5. **Geo-filter fix as log-only first** (W2 Phase 3 discipline).
6. **Defer** expensive structured extraction + the R6 formula-vs-LLM call to post-R5.
