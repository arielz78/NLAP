# Changelog

Short, public-facing summary of work per session. One entry per session,
newest at the top. The candid internal journal lives in `Execution_Log.md`
(private); this is the distilled, shareable version.

## 2026-06-24
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
