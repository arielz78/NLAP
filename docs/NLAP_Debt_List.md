**R1 DEBT**

1. **HTML stripping in DescriptionRaw** — Some Eventbrite records store raw HTML (`<div><div>...`) in DescriptionRaw. Add a code node in R1 after Clean/Filter to strip HTML tags before upsert. Use a regex or library like `htmlparser2`. Priority: fix before R3.

2. **ExecutionLog table** — Create new Airtable table with fields: RunID, SourceName, ItemsCreated, ItemsUpdated, Errors, Timestamp. Add a node at end of R1 to write one row per run.

3. **RunID assignment** — Generate a unique ID at start of each R1 run (e.g. timestamp string) and attach to every record ingested in that batch via the Upsert node.

4. **NeedsReview guards** — In R1 canonicalizer: auto-set NeedsReview=true if StartDate or Link is missing. Quarantine (don't upsert) if date is invalid/unparseable.

6. **Eventbrite expand fix** — Current R1 HTTP Request uses array format for expand parameter. Eventbrite's city-browse endpoint may require comma-separated string: `"expand": "description,primary_venue"` instead of `"expand.destination_event": [...]`. Test and confirm correct format.

---

**R2 DEBT**

11. **Misclassification rate tracking** — After 2–4 weeks of data, review what % of LLM classifications required human correction. Use this to decide if rule keywords need expanding.

12. **Process standardization** — debug log format, debt list template, cross-chat continuity protocol, realistic timeline. Goal: 1-hour setup session, not a system. Keep it lightweight.

---

**R4 DEBT**

16. **Rewrite R3 + R4 as n8n workflows** — Currently R3 and R4 are Node.js scripts run from terminal. Rewriting them as n8n workflows would make the full pipeline visual, portable, and easier to demo to future clients. Not worth doing until NLAP is productized for other clients. Prerequisite: current client fully onboarded and pipeline stable.

---

**AIRTABLE HYGIENE**

19. **Formula field audit (VB Base)** — Manually trace and edge-case test three formula fields: `Event in Window` (missing date, boundary date, zero events in window), `Score_Final` (zero scores, nulls, no score data), `Has Event Date` (empty field, false vs blank return). Fix anything that returns unexpected results. Non-pressing — schedule when convenient.

---

30. **Airtable vs. Postgres decision** — Airtable works at current scale but has lookup performance limits and no query language. If the pipeline automates fully (R5+), candidate pool grows significantly, or more newsletters onboard, migrating to Postgres would be more robust. Migration cost is high (requires building a custom admin UI to replace Airtable's editorial interface). Revisit before productizing beyond Mississauga. Flagged by Nate during onboarding. this could be good for resume is something to consider

29. **getAllRecords fetches entire table** — All three scripts use `getAllRecords` with no row limit, returning every record in the table. Fine at current scale, but if the candidate pool grows significantly (R5+), fetching thousands of records to use a handful will hurt performance. Fix when table sizes become a real bottleneck — add server-side filtering or a pageSize cap. Flagged by Nate during onboarding.

28. **UniqueEventID collision risk** — Current format is `title|date`. Two events with the same name on the same date but in different cities would collide and the earlier-scraped record would be silently overwritten. Proposed fix: add City as a third field → `title|date|city`. Previous attempt at a third field (source) was dropped in April 2026 — understand why before implementing. Flagged by Nate during onboarding.

---

31. **RuleSuggestions feedback loop** — An Airtable table (`RuleSuggestions`) already exists but is not wired into the pipeline. The concept: after each R2 run, push `LLM_Rationale` + `SegmentSuggested` + `NeedsReview` into the table; editor flags rationales that reveal bad rules; a second LLM call proposes keyword additions/removals; approved rules feed back into the R2 classification prompt at runtime. Estimated ~12–18h (3 weeks at current pace). Prerequisites: R7 frozen eval set must exist first — without it there's no way to verify a proposed rule improves classification rather than breaking something else. Good candidate for R9 after Mississauga onboards. Resume-relevant for ML/AI Engineer roles.

---

**CROSS-PIPELINE DEBT**

23. **Silent failure monitoring** — Add basic alerting when R1/R2/R3 scripts fail: write to ExecutionLog + manual check reminder. Even a simple email notification acceptable as first pass.

24. **Airtable rate limit handling** — Add retry logic with exponential backoff to all scripts. Currently untested under load; unknown behavior at scale.
