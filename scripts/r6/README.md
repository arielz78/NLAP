# scripts/r6 — R6 ranking demo harness (read-only)

Runs the R6 evidence pipeline over one issue window and writes a ranked pool, a rule-built slate
with alternatives, and a side-by-side against today's date order. **Never writes to Airtable.**
Architecture and contracts: the R6 scope proposal (2026-09-04); Decision_Log §87.

```
node scripts/r6/run.js --issue-date 2026-09-10                       # evidence only (no slate)
node scripts/r6/run.js --issue-date 2026-09-10 --r7 <scored.jsonl>   # prior order (R8 day-one adapter)
node scripts/r6/run.js --issue-date 2026-09-10 --attributes          # full run: LLM attributes + score + slate
node scripts/r6/lib/assemble.js                                      # assembly self-test
```

Inputs default to the newest `data/tracking/snapshots/candidates_*.json` and `issueitems_*.json`,
`data/beehiiv/issue_history.json`, and the frozen click set under `models/ranking/click_join/`.
Output: `data/tracking/r6_demo/<issue>_<stamp>/` with `manifest.json` (input hashes, config hashes,
model, run_id), `series_evidence.json`, `ranked_pool.json`, `slate.json`, `baseline_date_slate.json`,
`calls.jsonl` (every LLM call), `survivors_ledger.jsonl` (every excluded listing with reason), `report.md`.

`--attributes` refuses to run until the two worksheets in `config/` have no blanks: the attribute
definitions and value encodings, and the weights. Those are authored, not defaulted. The attribute
cache lives in `data/tracking/r6_demo/cache/attributes/`, keyed by prompt version, model, schema hash
and text, so a rerun with unchanged inputs makes zero calls.

| File | Role |
|---|---|
| `lib/load.js` | snapshot loading, in-window survivors with an exclusion ledger |
| `lib/collapse.js` | listings → series (the ranking unit); report-only near-duplicate clusters |
| `lib/evidence.js` | history, venue/organizer, click and recurrence joins; evidence lines |
| `lib/attributes.js` | LLM attribute extraction: schema prompt, validation, cache, audit log |
| `lib/score.js` | routing (hard rules → R7 → appeal fallback) and the weighted score |
| `lib/assemble.js` | read-only assembly: hard rules, flex by scarcity, alternatives, assessment |
| `config/attribute_schema.json` | worksheet: field definitions and value encodings |
| `config/weights.json` | worksheet: feature weights, penalties, parameters |
