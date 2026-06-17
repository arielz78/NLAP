# Changelog

Short, public-facing summary of work per session. One entry per session,
newest at the top. The candid internal journal lives in `Execution_Log.md`
(private); this is the distilled, shareable version.

## 2026-06-17
- Added a sixth event source — the Visit Vaughan (Tourism Vaughan) calendar — to the live ingestion pipeline, contributing curated civic, festival, and major-venue events the other automated feeds don't surface.
- Hardened the cross-source duplicate audit: a per-source overlap tally (how much each source re-lists vs. contributes net-new) and a venue+date pass that flags same-event duplicates titled differently across sources; also purged legacy duplicate rows from the candidate table.

## 2026-06-16
- Added a pipeline observability layer: automated post-run health checks for data integrity (catches silent regression of editor-approved records), candidate-pool depth vs. per-issue floor, and cross-source duplicate health — bundled into a single runner with persisted, documented tracking outputs.
- Re-exported the live R1 ingestion workflow to `workflows/NLAP R1.json` — now reflects the AllEvents 3-city branches (Vaughan/Richmond Hill/Markham) and the batched Airtable upsert rebuild. Brings the repo back in sync with the live n8n pipeline.
- Rebuilt the source-evaluation reference doc from a 600-line chronological log into a structured, maintainable reference: a single source register (status/method/verdict per source), per-source build specs, the probe methodology, and an append-only probe log — so each fact has one maintained home instead of being restated across the file.
- Reorganized the documentation system by durability: durable references (source register, scrape methodology) moved to a stable top-level home, superseded planning archived, and added a `docs/README.md` index mapping every document to its type and update rule — eliminating the cross-document drift that comes from the same fact living in two places.
