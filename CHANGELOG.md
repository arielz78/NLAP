# Changelog

Short, public-facing summary of work per session. One entry per session,
newest at the top. The candid internal journal lives in `Execution_Log.md`
(private); this is the distilled, shareable version.

## 2026-07-07
- Reviewed the newly built event-ranking evaluation dataset end-to-end and hardened it for reuse: added human-readable event names, consistent terminology, and auto-generated spreadsheet + summary outputs alongside the raw data, plus a full legend/FAQ so the dataset is self-explanatory to a non-technical reader.
- Stress-tested the data's integrity — traced an apparent click-count anomaly to a spreadsheet sorting artifact (the underlying data was sound) and confirmed the label design is correctly normalized for the real, varying section sizes in the historical record.

## 2026-07-06
- Built the evaluation dataset for the upcoming event-ranking phase: joined 15 months of newsletter click data to the published-issue history, labeling each past event by how well it performed against the others in its section. Grounded the design in standard information-retrieval practice (relevance judgments from implicit click feedback) and measured a clear reader position-bias effect, deliberately preserving it as a signal to account for later rather than scrubbing it prematurely.
- Pressure-tested the plan before building: caught and fixed a record-matching flaw that would have silently mis-linked recurring events, and right-sized the claim so the offline check informs — but doesn't replace — live validation.

## 2026-07-04
- Closed out the two remaining release-closure tasks from the source-expansion phase (workflow archival, adapter/integrity disposition).
- Audited configuration portability ahead of a future second-city launch — found and corrected a stale planning snapshot, and scoped the remaining config-centralization work into the next phase rather than building it prematurely.
- Found that invalid-record rejection during ingestion wasn't being logged anywhere retrievable, closing a real observability gap — built a durable, automatically-surfaced record of what gets dropped and why, which immediately caught one source silently failing to provide links for its events.
- Scoped the remaining source-expansion-phase closure work into two tracked items (a comprehension sign-off and a release writeup/repo-polish pass), and worked out the drafting plan for the upcoming event-ranking phase's design document — including a pressure-test that trimmed the plan down to what the phase's real open question actually needs.
- Event-ranking phase planning: validated the current pipeline's data against an earlier design audit — event source diversity and venue/location fields, previously unusable, are now populated across the board following the source-expansion work, reopening the scoring-method design space.

## 2026-07-03
- Held a client review meeting confirming the source-expansion phase is complete, then acted on client input to extend the cooking-school source to also include its multi-week programs and camps (previously limited to single-evening classes). Inspected the live feed to confirm each program arrives as a single event — no duplication — and fixed a title-cleaning step that would otherwise have stripped a camp's name down to just its week label. Verified live with the full health-check suite green.
- Began scoping the event-ranking phase: rather than encoding the editor's stated preferences (which are intuitive and hard to specify), the plan is to ground a baseline in 15 months of the editor's actual past selections and let a backtest decide whether a scoring formula or a language-model picker is the right tool — avoiding sophistication the problem doesn't warrant. Built a set of real head-to-head event comparisons to serve as the evaluation set.
- Completed a full data-field audit across every event source, confirming exactly what information each one provides beyond what's currently used — surfacing several free signals (ticket pricing, availability, category tags) worth capturing ahead of the ranking work. Designed the rollout plan and opened it as tracked work for a future session.
- Shipped that rollout: added ticket-price and category signals across five event sources, and made sold-out/full events drop out of the pool automatically instead of being shown to the editor. Deliberately built a smaller, higher-value version of the original plan after re-checking which of the proposed fields actually had a use — verified live with the full health-check suite green.

## 2026-06-30
- Added The Chef Upstairs (a local cooking school and newsletter partner) as a new source, completing the planned set of venue-specific sources. The obvious data endpoint — the store's public product list — turned out to omit the one field the pipeline can't reconstruct: the class date. After probing every surface, integrated via the booking widget's own schedule feed, which is the only place the dated class occurrences live. Verified live: 100% of its events are exclusive to this source (net-new date-night/couples coverage), full health-check suite green.
- Enriched each class with its full menu/experience description by joining a second store feed on a shared key — feeding the content signal that upcoming scoring and classification work depends on, while failing gracefully (events still flow if that lookup is unavailable).
- Documented the endpoint-discovery methodology end to end: how to read a page's own source to find the data feed it calls (no browser automation required), when that's faster than scrolling network requests by hand, and why a clean-looking JSON endpoint is not automatically the right one — the field set decides.

## 2026-06-26
- Added Pinot's Palette (a local paint-and-sip studio, and a newsletter partner venue) as a new source. After probing every access method — including a structured data endpoint surfaced via browser dev tools — the studio's own landing page proved the best surface: it lists every upcoming class on a single page with date and title inline, so one fetch captures the full calendar with no follow-up requests. The dev-tools endpoint turned out to be analytics tracking that omits event dates, and the dedicated calendar view only showed the current month; documented both so the choice is evidence-backed.
- Verified live: every class correctly dated and located, 100% of its events exclusive to this source (net-new coverage for date-night and older-adult segments), full health-check suite green.
- Hardened three source integrations against transient network drops by enabling automatic retry on their per-event fetches, while deliberately leaving single-request sources to fail loudly — so a real outage still surfaces instead of being silently masked.
- Added the City of Richmond Hill's official municipal events calendar as a new source. After probing every access method, integrated via the calendar's structured feed rather than scraping the visual month grid — the grid silently hides events on busy days behind a "view more" link, so the feed captures ~20% more. Filtered out government/committee meetings at ingestion while keeping community and cultural events.
- Confirmed the new source adds genuinely distinct coverage: ~90% of its events are exclusive to it (City-run galleries, seniors' programming, observatory tours), with zero overlap against the other Richmond Hill source added the day before.
- Validated parsing in isolation before any live write, then verified live — every event correctly tagged and located, full health-check suite green.
- Investigated a small source that appeared to stop adding events: confirmed via its live data that the integration is healthy and the quiet period is genuine, not a broken feed. Turned the finding into a concrete design for lightweight per-source health monitoring once the pipeline runs unattended.
- Scoped how the project's database platform should be used at client handoff — which features genuinely improve the workflow vs. add complexity, with a clear boundary keeping core pipeline logic in code. Documented the plan against the handoff release, including a client access model that prevents accidental breakage of the automated pipeline.

## 2026-06-25
- Added a new community/municipal event source (OnRichmondHill). Its RSS feed was capped at ~10 items, so after probing every available access method, integrated via a paginated page-by-page scrape that captures the full forward calendar — ~4.6× more events. Validated the parsing in isolation before any live write, then verified live; ~70% of its events are exclusive to this source, directly broadening coverage of local civic events.
- Refactored the source-overlap monitoring to trust provenance the pipeline already records, so newly added sources show up automatically with no per-source code edits — removing a recurring maintenance step.
- Audited the classification pipeline to baseline a future cost-savings metric: measured that ~86% of event classifications currently route to an LLM (with a free rules-based pre-filter handling the rest), establishing the "before" picture for a planned trained-classifier upgrade. Captured the measurement method and savings framing so the comparison stays honest and reproducible.
- Closed a geographic-accuracy gap in the ticketing-platform feed: added a strict allowed-city filter so events from neighbouring towns (Newmarket, Aurora, Toronto, and others) no longer slip into a newsletter scoped to three specific municipalities. Before changing anything, simulated the filter on real feed data to prove every removed event was genuinely out-of-area — and caught a case where a naive rule would have wrongly dropped events at a beloved local heritage venue.
- Verified the fix on a live run (every kept event now in-area), cleaned 50 pre-existing out-of-area records from the pool, and confirmed the full health-check suite still passes.
- Implemented the client's "include online events" decision as a source-aware rule rather than a blanket filter change: kept genuinely-local library virtual programs (yoga for older adults, retirement planning, virtual tutoring) while dropping global/foreign webinars that a broad ticketing platform was mislabeling as local — and purged 72 already-contaminated records.
- Audited every ingestion branch to locate where online events were being kept, dropped, or mislabeled before changing anything; verified the fix end-to-end on a live run and confirmed the full health-check suite passes.

## 2026-06-24
- Held a client review that closed the source-expansion sign-off: confirmed the full source list, secured the client's commitment to the weekly manual-intake step, and resolved four outstanding editorial decisions (online events, big-event handling, trusted-venue list, feed cleanup).
- Settled a "which venues to add" question with data rather than guesswork — counted how often each candidate venue had actually been featured across 72 past issues, which collapsed five possible builds down to the two the editor genuinely relies on.
- Built the Vaughan Public Libraries integration into the live ingestion pipeline — a two-step calendar-grid + per-program-detail scraper covering all 14 branches — and verified it end-to-end, adding ~200 civic/library events to the candidate pool. Restructured the pipeline's merge stage to stay within tooling limits as sources scale.
- Vaughan Public Libraries source: completed a deep integration re-probe and revised the ingestion method to a calendar-grid scrape (all 14 branches, dated occurrences) plus a per-program description fetch — improving coverage and data completeness over the original single-page approach. Documented the full surface evaluation in the source register.
- Completed a full source-reconciliation audit: catalogued every event source the client uses against what the pipeline already ingests, then evaluated each candidate by the supply it *uniquely* adds rather than its raw size — dropping redundant aggregators and identifying two civic/library sources worth adding.
- Probed the shortlisted new sources hands-on (rather than by assumption), confirming clean integration paths and measuring real overlap with existing feeds, so the build-vs-skip call for each rests on evidence.
- Added a publish-time safeguard that blocks any featured event with a missing link from going out with a dead link, and built a monitoring check that flags when the manual Facebook intake has gone quiet — surfacing a missed submission to the operator before it can thin out an issue.
- Closed out a backlog of older tracked items by verifying each against the live system: several were already resolved by recent design changes, one was reclassified to a later release, and a parser fix was carried into the production workflow so it no longer diverged from the tested version.

## 2026-06-23
- Hardened the event-deduplication logic so the richest record (real description + primary link) wins when multiple sources list the same event, replacing an order-dependent rule that could keep the weaker copy.
- Restructured AllEvents ingestion to store organizer, popularity score, and categories as discrete, queryable fields instead of one concatenated text blob — cleaning the data that feeds downstream event scoring; backfilled 487 existing records.

## 2026-06-22
- Validated the Facebook intake's AI extraction step with a purpose-built test harness that grades model output two ways: structural correctness (does it parse) and content accuracy (does it match a hand-labeled answer key) — separating well-formed output from actually-correct output.
- Hardened the intake parser to absorb run-to-run formatting nondeterminism from the AI step deterministically, and tightened the extraction prompt to never guess a location it can't read — converting a silent wrong-value failure into an honest blank for the editor to resolve.
- Proved the Facebook intake works end-to-end on a real submission, and in doing so found and fixed a bug that was silently discarding every manually-sourced event before it reached the candidate pool.
- Resolved how the pipeline should reconcile the same event arriving from multiple sources: keep the richest record rather than the last one in, so source attribution stays honest and the data feeding future event-scoring stays clean.

## 2026-06-21
- Built a manual Facebook-events intake path: the editor screenshots the local Facebook events feed, an AI prompt converts it to a clean structured table, and a simple form feeds those events into the same pipeline as every automated source — capturing high-engagement events that have no public API.
- Wired Facebook in as a tenth source branch in the live ingestion workflow, with a tailored rule that lets these manually-sourced events through and defers link collection to the point an event is actually selected for publication.
- Established release sign-off governance: every unit of work is a tracked issue assigned to a release milestone, and a release closes only when its milestone is fully reconciled (each issue completed or explicitly deferred with a reason) — a lightweight, audit-clean process that prevents work from silently slipping between releases.

## 2026-06-20
- Added a seventh event source — the Unionville (Main Street BIA) community calendar — to the live ingestion pipeline, contributing curated neighbourhood, gallery, and festival events; closes the additive-source phase of the current release.
- Improved the cross-source duplicate audit to identify each event by its true originating feed rather than its outbound link — fixing mis-attribution for curated "link-out" sources that point to third-party hosts.
- Completed a full reconciliation of the client's source list against the live pipeline — every requested source now has a recorded disposition (live, deferred, or out-of-scope) and nothing is silently missing.
- Tightened the project's own process hygiene: open work now lives in the issue tracker rather than session notes, with an end-of-session gate that prevents to-do items from quietly falling through across work sessions.

## 2026-06-18
- Internal: reviewed the visitvaughan.ca integration's request format to confirm the minimal set of parameters needed — no functional change.

## 2026-06-17
- Added a sixth event source — the Visit Vaughan (Tourism Vaughan) calendar — to the live ingestion pipeline, contributing curated civic, festival, and major-venue events the other automated feeds don't surface.
- Hardened the cross-source duplicate audit: a per-source overlap tally (how much each source re-lists vs. contributes net-new) and a venue+date pass that flags same-event duplicates titled differently across sources; also purged legacy duplicate rows from the candidate table.

## 2026-06-16
- Added a pipeline observability layer: automated post-run health checks for data integrity (catches silent regression of editor-approved records), candidate-pool depth vs. per-issue floor, and cross-source duplicate health — bundled into a single runner with persisted, documented tracking outputs.
- Re-exported the live R1 ingestion workflow to `workflows/NLAP R1.json` — now reflects the AllEvents 3-city branches (Vaughan/Richmond Hill/Markham) and the batched Airtable upsert rebuild. Brings the repo back in sync with the live n8n pipeline.
- Rebuilt the source-evaluation reference doc from a 600-line chronological log into a structured, maintainable reference: a single source register (status/method/verdict per source), per-source build specs, the probe methodology, and an append-only probe log — so each fact has one maintained home instead of being restated across the file.
- Reorganized the documentation system by durability: durable references (source register, scrape methodology) moved to a stable top-level home, superseded planning archived, and added a `docs/README.md` index mapping every document to its type and update rule — eliminating the cross-document drift that comes from the same fact living in two places.
