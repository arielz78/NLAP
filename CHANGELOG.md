# Changelog

Short, public-facing summary of work per session. One entry per session,
newest at the top. The candid internal journal lives in `Execution_Log.md`
(private); this is the distilled, shareable version.

## 2026-06-16
- Added a pipeline observability layer: automated post-run health checks for data integrity (catches silent regression of editor-approved records), candidate-pool depth vs. per-issue floor, and cross-source duplicate health — bundled into a single runner with persisted, documented tracking outputs.
- Re-exported the live R1 ingestion workflow to `workflows/NLAP R1.json` — now reflects the AllEvents 3-city branches (Vaughan/Richmond Hill/Markham) and the batched Airtable upsert rebuild. Brings the repo back in sync with the live n8n pipeline.
- Rebuilt the source-evaluation reference doc from a 600-line chronological log into a structured, maintainable reference: a single source register (status/method/verdict per source), per-source build specs, the probe methodology, and an append-only probe log — so each fact has one maintained home instead of being restated across the file.
