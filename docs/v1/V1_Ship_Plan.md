# V1 Ship Plan

**Written 2026-10-07, rewritten 2026-10-10 after two independent audits.** Working doc, not a status source:
release status stays in `docs/r8/R8_Scope.md` §0 and `docs/r6/R6_Scope.md` §0. This filename deliberately does
not match `/start`'s glob (`docs/r*/R*_Scope.md`), so it is never read as a Scope doc.

**Purpose:** the remaining path to V1, ordered by dependency, with who builds each piece and the test that
decides it is done. A cold session should be able to pick up the next item from here without re-deriving state.
If this doc and a Scope disagree about *status*, the Scope wins.

**Timelines are off (Ariel, 2026-10-10).** Work runs in dependency order and is delegated to agents wherever the
authorship split allows. The Oct 31 target and the 12–16h budget no longer drive scope. Neither audit found a V1
package that fit them.

**How this version was produced.** Claude and Codex each audited the 2026-10-07 plan cold, from the same prompt.
Each then critiqued the other's audit, and every disagreement was settled on file evidence. Findings carry a
provenance tag.

## Evidence legend

- `[VERIFIED x:N]`: read directly from the file or a live query during the audit
- `[BOTH]`: found independently by both audits
- `[CODEX ✓]`: Codex finding, re-verified in the file by Claude
- `[ROUGH]`: rough measurement made during the audit, unreviewed and recorded nowhere else. Not a metric
  (metrics originate only in `NA/Vaughan_Metrics_Log.md`)
- `[INFERRED]`: reasoning, no direct evidence
- `[UNVERIFIED]`: not checked; treat as open

---

## 1. State, as corrected by the audit

### The live path is the weekly preview, not Airtable

- **The Airtable issue path has been dormant since June.** The Issues table has 12 records and the latest
  `IssueDate` is 2026-06-18. IssueItems was last written May 30. No issue since June has gone through
  allocation → blurbs → export. `[VERIFIED live Airtable query; data/tracking/snapshots/issueitems_2026-10-04_1500.json]`
  V1 has to *revive* this path, not preserve it. No Issues record exists for any upcoming date, so every write
  throws until one is created (`connectAirtable.js:272`).
- **The editor builds from the weekly preview despite not replying.** His published slots that appeared on the
  preview (picks plus the first 5 alternatives): v2b 8/15 (reproduces the hand-scored figure), v3 11/15, v4b
  8/15. A control slate built for the already-published Aug 13 issue and never shown to him matched **2/15**.
  `[ROUGH]` His v1 self-report (9 of 15 from the demo) agrees. This is evidence of use, not proof: the control used
  a different producer and a smaller reachable pool, and the fuzzy match is validated only on v2b. `[CODEX ✓]`
- **R7 is already in that path.** The producer reads `scored_survivors.jsonl`. `[VERIFIED prepare_inputs.py:27]`
- **R7 depends on the Label Deck at runtime.** `live_runner.py` imports `gate_step4a`, which verifies the label
  pull and reconciliation artifacts and fits the gate on 365 labelled rows. Preserve those artifacts and the
  Airtable deck table. `[CODEX ✓ live_runner.py:470-482]`

### The ranking producer (R6)

- Five editor demos sent (v1, v2b, v3, v4b, v5). The editor has given no feedback since v3. `[VERIFIED RUNS.md, R6_Log]`
- Hand repairs are not decaying (v1 5, v2b 6, v3 3, v4b 3, v5 7). **Not every class is loud.** The v5
  self-disavowed rows were caught by hand review, not a validator, so V1 keeps a human review of each slate.
  `[CODEX ✓ v5 README.md:32]`
- The producer is a per-run copy (`demo.js` + `prepare_inputs.py`) with hard-coded dates and labels. Lineage per
  Decision_Log §102.

### The console (R8)

- Mechanically complete and fixture-only. No real data, hosting, authentication or write-back. Status: R8_Scope §0.
- **Its swap checks are fixed when the issue is built and never re-checked against the lineup.** A replacement
  is looked up as one stored pair verdict. The lineup-dependent rules (one venue per section, no event in two
  sections) can be broken after two swaps, and the console then stores those swaps as feasible training pairs.
  `[BOTH; CODEX reproduced it with the real domain code; buildIssues.js:120-135; draft-domain.ts:108-133, :319]`
- **Date-only events display a wrong date.** `formatSchedule` runs `new Date("2026-10-17")`, which is UTC
  midnight, and renders Oct 16, 8 p.m. in Toronto with an invented time. `[CODEX ✓ editor-console.tsx:56]`
- **"Only one current build" is enforced per build, not per issue,** so two builds for the same issue can each
  hold an editable draft. `[CODEX ✓ 0002_versioned_submission_lifecycle.sql:22-28]`
- No CI exists. `[VERIFIED .github/]`

### The Airtable write path

- **Importing `connectAirtable.js` runs the allocator.** `main()` is called unconditionally at `:373`, with no
  `require.main === module` guard. Requiring it fires delete → `buildIssues` → write for every future issue. It
  also auto-fills Local Aroma and Trust Me Recipe. `[BOTH; CODEX reproduced it with mocks]`
- **Nothing sets `Lock=true`.** It is a manual Airtable checkbox (`createTables.js:48`), read at
  `connectAirtable.js:213` and `generateBlurbs.js:261`. `[BOTH]`
- **`writeIssueItems` is append-only POST.** Skipping the delete means a repeat run duplicates every row.
  `[BOTH connectAirtable.js:288-307]`
- **`generateBlurbs` rewrites copy on every unlocked row for the issue,** including Local Aroma. For a row with no
  Candidate it prompts from the row's `Name`. `[BOTH generateBlurbs.js:262, :272, :338]`
- R1 (n8n) never touches IssueItems; only `connectAirtable.js` deletes. `[VERIFIED workflows/NLAP R1.json]`

---

## 2. The biggest flaw

**The console cannot express the issue the editor actually publishes.** Each week 4–7 of his 15 event slots
come from outside the bench (Facebook, Visit Vaughan, other links). `[CODEX ✓ R6_Editor_Feedback.md:80; ROUGH join]`
The console only replaces from the bench. TODO-0 (R8_Scope §6) was closed as "yes, he can complete an issue",
on the premise that sponsored events have their own section. That premise does not cover these ordinary
outside picks.

So on a live Sunday he either:
- **submits a lineup he then changes by hand in Beehiiv.** Write-back and blurbs run on events he won't publish,
  his "kept" picks become false preference evidence, and the gap between submitted and published is silent in
  the data; or
- **abandons the console.** That fails finish-line item #4.

This happens every week, not occasionally. It needs Ariel's decision D0 (§4) before Step 4 or any live use.
Raised by Codex; neither audit ranked it first until the comparison.

---

## 3. Work map, in dependency order

**Owner key:** **Agent** = delegable plumbing, verifiable by inspection · **Ariel** = authored core (a wrong
choice changes a number or a conclusion) · **Nate** = hosting/console per ADR 0003 and Decision_Log §103(b).
Every acceptance test is written before its work.

| # | Item | Owner | Depends on | Acceptance test |
|---|---|---|---|---|
| 1 | **CI** — `.github/workflows/ci.yml` | Agent | — | A GitHub Actions run goes green on `npm test && npm run lint && npm run build` in `apps/editor-console`, plus item 2's test. Database tests are reported as skipped, never counted as passed. |
| 2 | **Allocator guard** in `connectAirtable.js`: a `require.main === module` guard; `main()` refuses any issue date that already has IssueItems unless `--rebuild`; export the fetch/write helpers | Agent | — | `require()` with a stubbed fetch makes zero requests. A direct run against a date with rows exits non-zero, names the date, and issues zero DELETEs. `--rebuild` restores today's behaviour. |
| 3 | **Write-back writer** `scripts/writeIssuePicks.js`: input is a picks file (`allocation.json` now, item 7's output later). Dry-run by default; `--apply`; `--ensure-issue` creates the Issues record; refuses if a row already exists for (date, section, slot); `--lock` sets `Lock=true` on exactly the written IDs after blurbs | Agent; the first live `--apply` needs Ariel's go and a bounded review (irreversible external write) | 2 | Dry run lists exactly the file's picks and 0 deletes. After apply: exactly one row per pick, each `Name` byte-equal to `` `${Section} Slot ${n} — ${date}` ``. A repeat apply refuses. After `generateBlurbs`, rows the writer didn't touch are byte-identical before and after. Lock sets exactly the written rows. A `connectAirtable.js` run refuses. `pushToBeehiiv` exports without throwing. `integrityCheck` is clean. |
| 4 | **Repeatable producer**: lift `demo.js` + `prepare_inputs.py` into `scripts/issue-build/`, parameterised by issue date. Includes the form-URL exclusion (Decision_Log §101). **Keep `render()` and the preview** until the console has served a real week. | Agent | — | Two different issue dates build from the CLI with no tracked-file edits. The manifest records the git SHA, a prompt-*template* hash and a repair receipt. 0 shortlist URLs match `forms.gle` or `docs.google.com/forms`. Thin supply stops the run before publish. Each run's receipt carries a human-review line. |
| 5 | **Console date fix**: date-only events show the correct date and no time | Agent (console code; tell Nate) | — | A fixture event dated `2026-10-17` renders Oct 17 with no time, in the Toronto timezone. |
| 6 | **Run the existing console suites** | Agent | 1 | `npm test` passes. The integration suite runs against an isolated Neon branch, or it is recorded as not run. |
| 7 | **Submission → Airtable bridge**: read the latest submitted revision from Postgres, validate the final lineup against the allocator's rules, map it to the picks shape, feed item 3 | Agent | 2, 3; Neon credentials from Nate | A fixture submission maps exactly to its final state. Two same-venue picks in one section are refused, naming the slot. A build-identity mismatch is refused (W1). Replaying an applied submission is refused. Slots marked under D0 are skipped. |
| 8 | **D0: how the console handles outside-pool events** | **Ariel** (product call; ideally checked with the editor) | — | Written in Decision_Log, with the console change it implies handed to Nate. |
| 9 | **D2: replacement checks against the current lineup, plus the assessment matrix** (`buildAssessmentMatrix()`) | **Ariel** | 8 | Swaps in the same slot and in different slots; a newly created venue conflict is refused in the console and yields no pair; undo; an invalid final lineup is refused at submit; D0 slots yield no pair. Before writing it, read `lib/contracts.ts`, `lib/mock-issue.ts:33-70` and `lib/draft-domain.ts:103-133`. |
| 10 | **Bundle + publish** (`to-bundle.js`, `publish-build.ts`) | Agent, around Ariel's item 9 | 4, 9 | A real build loads in the console. A bundle missing a section or carrying `"unclassified"` is rejected at publish. The `UNIQUE (bundle_hash)` conflict is handled. Publish refuses while another build for the same issue has an editable draft. |
| 11 | **Hosting + auth** (HTTP Basic over TLS, `/api/*` included) | **Nate** | 10 | Unauthenticated page and API requests both return 401. The authenticated real build renders and survives a browser restart. `publish-build` from Ariel's laptop reaches the same database. |
| 12 | **Operating message to the editor**: operator-supported V1, Ariel triggers runs, no scheduling, the console covers 3 sections, LA/TMR unchanged, the D0 behaviour, link-open recording (TODO-6) | Ariel sends; an agent drafts | 8 | Sent before the first live Sunday. |
| 13 | **Live Sundays**: the preview is still sent as a fallback until one succeeds | Ariel + editor | 7, 10, 11, 12 | He submits in the console. Item 7 applies it. Blurbs, lock and export run clean. **Final check (Ariel):** join the published issue against the submitted lineup; every gap is explained by D0 slots or LA/TMR. |

**Items 1, 2, 4 and 5 have no dependencies and can go to agents in parallel.**

---

## 4. Decisions that are Ariel's

**Blocking:**
- **D0. Outside-pool events** (blocks items 9, 10 and 13). Options:
  - (a) a per-slot "I'll fill this myself" tap: the slot leaves write-back and preference evidence, and he fills
    it in Beehiiv as today. A small change for Nate.
  - (b) he adds outside events to Airtable before the build. This costs his time and moves the hours number.
  - (c) a manual-insert field in the console. R8 excluded this.
  - *Claude's lean:* (a).
- **D2. Replacement checks** (blocks item 10). Claude's earlier "advisory matrix, validate at write-back" was
  **rejected by both audits**: write-back refusal protects Airtable, but the preference pairs are stored as
  feasible during submission. The lineup-dependent rules are only one venue per section and no event in two
  sections. A check over those two, against the current draft, closes the gap. Whether a TypeScript check
  counts as "restating rules in a second planner" (R8_Scope §5) is Ariel's call.
- **Finish-line thresholds:** see §5.

**Defaults** (no decision needed unless Ariel objects):
- K = 5, matching the rendered slate and keeping Decision_Log §100 comparable.
- Ordering per Decision_Log §102, labelled "suggested".
- TODO-5: use the producer in the first console issue.
- TODO-6: disclose link-open recording.
- TODO-1: the pipeline is not hosted for V1; Ariel triggers runs.
- LA/TMR stay in Beehiiv, not Airtable. This also defuses the blurb overwrite.
- Build currentness: enforced by item 10's publish refusal.
- Producer reproducibility: store inputs, the raw and reviewed responses, the correction receipt, the SHA and the
  template hash. Replay saved responses; never promise identical LLM output.

---

## 5. Finish-line tests

The five items (Notion, "NLAP — the finish line"): R6 done · R8 shipped · R7 in the live path · editor using it on
real issues · one number measured. Thresholds are left blank because pass/fail is Ariel's authored decision.

- **R6 done:** for `TODO(ariel): N` consecutive weekly issues, (1) the slate comes from item 4's CLI with the
  issue date as the only input, no tracked-file edits, and a human-review receipt; and (2) the rendered-slate join
  (Decision_Log §100) is ≥ `TODO(ariel): floor` on each. Reference series: 8/11/8 `[ROUGH]`. This closes an
  operator-supported producer; it does not prove ranking quality improved.
- **R8 shipped:** items 10–11 pass, and item 13 succeeds once.
- **R7 in the live path:** already true in substance via the producer's input. Formally passes when item 13 runs
  on a slate built from R7 scores.
- **Editor using it on real issues:** item 13 succeeds on `TODO(ariel): N` issues.
- **One number measured:** the instrument is Ariel's choice.
  - (a) re-ask the 2026-05-14 question ("total time per issue, research + writing", ~4h self-reported) after V1
    issues. Cheap. Helper status at baseline was never captured, so the comparison is self-reported and the
    labour conditions may differ.
  - (b) time one untreated issue plus V1 issues on the same boundary (active editorial time, all 5 sections,
    helper and Ariel support recorded separately).
  - Either way it passes when before and after exist on the **same instrument** and are recorded in
    `NA/Vaughan_Metrics_Log.md` with the wording and date. The value is not a gate. The metrics log's current
    "pipeline elapsed time" after-method measures a different quantity and must not be used.

---

## 6. Non-goals

Deferred, not forgotten:
- Authoring `scripts/r6/config/*.json`, and the duplicate-section schema redesign
- Full W6 (#138: interruption testing, run receipts, convergence)
- ADR 0008 session auth
- New producer validators
- The coverage fix (#128/#114/#124/#93)
- Series/occurrence modelling and a republication policy
- Scheduling and unattended ingestion (#62)
- CTOR and click work
- A build-browsing UI
- Wholesale Airtable cleanup

## 7. Assets with no V1 role

- `scripts/r6/` (reference only, Decision_Log §102)
- `connectAirtable.main()` (a hazard to guard; only its write helpers are used)
- The R7 Label Deck *tools* (pushLabelDeck, pushLiveDemo30, readLiveDemoRulings, reconcileR7Step1c/4b). Their
  *artifacts* are runtime inputs; see §1.
- `models/ranking/`
- The click CSVs, `joinClicksData.js`, #116/#117/#139
- `facebookSubmissionCheck.js` and #114
- `fetchAllEventsDescriptions.js` and #108
- n8n R2
- The tinker-era issues in the R8 milestone (#22 #28 #29 #30 #31 #32 #36 #50 #67 #103), which predate the console.
  Triage them before the milestone can serve as a V1 completeness gate.

## 8. Open, not settled here

- **Release structure** (Ariel's call; do not encode). Both audits recommend keeping R6 and R8 separate, with
  V1 as a GitHub milestone across them. Whichever is chosen must update **both** discovery entry points:
  Claude's `/start` glob, and the Codex start skill, which still names R7 (`.agents/skills/start/SKILL.md:22`).
- **Who operates V1 after it ships.** The weekly loop needs Ariel each week (R1 trigger, R7 runner, producer,
  review, publish, write-back). Unassigned.
- **What the editor has agreed to.** The 08-20 meeting records his request for scheduled ingestion. The 08-27
  file is a presentation script with its outcomes blank, so it doesn't record what he heard. Item 12 settles the
  operating arrangement in writing.
- **Nate's availability.** No repo activity since 2026-09-18. Communication status is unknown. `[UNVERIFIED]`
- **Canonical-state candidates, not yet applied:**
  - TODO-0 (R8_Scope §6) should be reopened, per §2.
  - Decision_Log §103(a)'s "every producer defect is loud" has a hand-review exception (the v5 self-disavowed rows).

## 9. Falsified claims: do not rebuild these

| Claim | Why it's false |
|---|---|
| `scripts/r6/lib/assemble.js` is already W9 | Nothing imports it, and it has never run in scoring mode. |
| Adding `module.exports` to `connectAirtable.js` is "one line" | The import runs `main()` (§1). |
| A scripted write removes the deletion risk "by construction" via Lock | Nothing sets Lock. The protection is item 2's guard; Lock is a second layer. |
| Step 1 "lands R7 in the live path" by writing to Airtable | R7 already feeds the preview. The Airtable path is dormant. |
| A complete pair matrix makes replacements correct | Validity depends on the current lineup (§1). |
| An advisory matrix plus write-back validation is enough | The preference pairs are already stored as feasible (§4 D2). |
| TODO-0 is resolved | Ordinary outside picks are not covered by the sponsorship premise (§2). |
| The Label Deck has no V1 role | R7's gate fits on it at runtime. |
| The editor stopped using the slate when he stopped replying | Published overlap of 8–11/15 vs a 2/15 control (§1). |
| Recall scoring costs 4–6h | A rough join took about 15 minutes. The formal Decision_Log §100 version remains #133. |
| Mandatory unique quotes kill the borrowed-content class | That content lives in unvalidated free text (`reason`/`warnings`). |
| "Zero hand repairs" via more asserts | Asserts stop the run but repair nothing. |
| A republication filter catches the v5 repeat | `historyFor()` matches exact URLs only. |
| Ariel sets up Vercel | ADR 0003 and Decision_Log §103(b): Nate. |
| CTOR is a one-way door | It is a retroactive Beehiiv `posts_by_date` export. |
