# V1 Ship Plan

**Written 2026-10-07.** Working doc, not a status source — release status stays in
`docs/r8/R8_Scope.md` §0. This filename deliberately does not match `/start`'s glob
(`docs/r*/R*_Scope.md`) so it is never read as a Scope doc.

**Purpose:** be the only artifact that survives the planning session, so a cold session can
execute without re-deriving state. If this doc and a Scope doc disagree about *status*, Scope wins.

**Budget: ~12–16 hours of Ariel's time, at 3 × 3h/week. This is fixed. Do not propose more.**
Anything that does not fit is a non-goal (§7), not a trimmed version of itself.

## Evidence legend

Every substantive claim is tagged. **Check tagged claims rather than trusting them.**

- `[VERIFIED x:N]` — read directly from the file during the 2026-10-07 session
- `[REVIEW x:N]` — cited with line numbers by the read-only review agent, not re-read by the author
- `[AGENT]` — reported by an exploration agent, line numbers not independently confirmed
- `[INFERRED]` — the author's reasoning, no direct evidence
- `[UNVERIFIED]` — stated nowhere and not checked; treat as open

---

## 1. State as of 2026-10-07

### The ranking producer (R6)

Five editor demos have been sent. `[VERIFIED data/tracking/r6_demo/RUNS.md]`

| Run | Issue | Sent | Hand repairs | Recall |
|---|---|---|---|---|
| v1 | 09-10 | yes | 5 | 9/15 self-reported (not comparable) |
| v2b | 09-17 | yes | 6 | **8/15 measured** (4 picks, 4 alternatives, 1 in-pool miss, 6 never-candidates) |
| v3 | 09-24 | yes | 3 | unscored |
| v4 | 10-01 | **no** — superseded | 3 | n/a |
| v4b | 10-01 | yes, 09-26 | 3 | unscored |
| v5 | 10-08 | yes, 10-04 | **7** | unscored (Oct 8 not yet published) |

**The editor stopped responding.** He gave feedback on v1, v2b and v3. None on v4b, none on v5.
`[VERIFIED logs/R6_Log.md]` Consequence: recall scoring is now the only measurement instrument left.

**Hand repairs are not decaying.** Five runs, every one needed repair, and the newest was the worst.
Recurring classes `[VERIFIED logs/R6_Log.md + run READMEs]`:

- **id typo — 4 of 5 runs**
- **borrowed content from sibling records — 4 of 5 runs** (v4b was the only clean one)
- **Unionville Google Form URL reaching the slate — every run since it came back**; hand-removed in
  both v4b and v5 (Decision_Log §101, issues #93 / #133)
- **self-disavowed rows — new in v5**: four ranked rows whose own `reason` says not to use them; two
  also appeared in `exclusions`
- cross-section duplicates, duplicate section objects in the response, whitespace-mismatched quotes

**What demonstrably worked:** replacing the prompt's keep-dual-fits line with the editor's
one-section rule drove on-screen cross-section duplicates 1 → 0 and library picks 4 → 2.
`[VERIFIED logs/R6_Log.md 2026-10-04]` Prompt changes land; validator asserts only stop the run.

**The producer is a per-run copy.** `data/tracking/r6_demo/<run>/demo.js` carries hard-coded
constants — `const ISSUE='2026-09-17'` and siblings at lines 6–7 `[AGENT]` — plus a seasonal
lookback literal, a stale shortlist-policy string sent to the model, and `codeIdentity()`'s
self-referential file list `[REVIEW demo.js:113,145]`. `prepare_inputs.py` has its own set.

**`scripts/r6/` has never run in scoring mode.** Its two config worksheets are 100% blank (15 nulls
in `weights.json`) and `run.js` refuses `--attributes` until they are authored. `[AGENT]` Nothing in
the repo imports `scripts/r6/lib/assemble.js` except `scripts/r6/run.js` — confirmed by exhaustive
grep. `[AGENT]` **Deliberately not being authored for V1** (§7).

### The console (R8)

Mechanically complete and **fixture-only**. `[AGENT]` Draft/submit, versioned reopen, immutable
revisions, append-only interaction events, idempotency, slot-scoped undo, Postgres via Neon.

`c45a7ad` is the last commit touching `apps/editor-console/`. `[REVIEW]` Nate shipped #135
(`8396a79`, UI/fixture) and #136 (`c45a7ad`, +2131 lines: versioned reopen lifecycle, immutable
submissions, production fails closed, a 338-line Postgres integration suite). **Both issues are
still open on GitHub.** `[AGENT]`

Missing: real data (W4/W9), hosting (W3), **any authentication at all**, write-back (W6).
`[REVIEW docs/r8/R8_Scope.md:170]`

**No CI exists anywhere in the repo** — `.github/` holds only `ISSUE_TEMPLATE/`. `[REVIEW]` So
"tests, lint and build pass" on both Nate commits is his claim, never independently run here.

The integration suite is gated behind `R8_REQUIRE_INTEGRATION_DB=1` plus a confirmed-isolated DB and
has almost certainly never run. `[REVIEW]`

### Ingestion

- **Eventbrite now needs a real CSRF token per run.** `[VERIFIED logs/R6_Log.md 2026-10-04]`
  Post-fix count unconfirmed. `[REVIEW]`
- Three sources silent since June/July — Visit Vaughan, McMichael, Facebook — verified not masked by
  cross-source dedup. `[VERIFIED logs/R6_Log.md]` Issue #128; depends on #92 (source field blank on
  ~418 Eventbrite rows, so counting by `Source` would misreport Eventbrite as dead). `[AGENT]`
- Unionville back up 09-26, but its form-URL defect recurs until fixed at source (#93).
- `postRunChecks.js` exits non-zero **solely** because of the stale-Facebook check, so a genuinely
  failing check elsewhere cannot change the suite's exit code. `[AGENT, from #114 comment]` Unfiled.

### Coverage — the finding that bounds ranking work

**~40% of the editor's picks never enter the candidate pool.** Venue caps, organizer variety and
prompt tuning all operate on the 53% already reached. `[VERIFIED logs/R6_Log.md]`

Already enumerated in #133: **AppleFest, Double Ninth Festival, The Linda Ronstadt Show, Cook &
Connect** (zero title matches anywhere in the pool), plus **Markham Fair**. `[REVIEW #133]`
So enumeration is largely done; the open work is per-event source research.

⚠️ Do not say "~7 uncovered events" — that conflates v2b's 6 never-candidates with its 1 in-pool
ranking miss. The in-pool miss is not a coverage problem. `[REVIEW]`

---

## 2. The two discoveries this plan rests on

### D1 — The producer *is* W9

The console consumes `{selected, alternatives, replacementAssessments}`. Nothing in the pipeline
produces a bench: `buildIssues.js` returns selected picks only. `[VERIFIED Execution_Log.md]`
De-hardcoding `demo.js` into a repeatable producer **is** W9. R6 and R8 are not two releases
sequenced; they are one task with two names. `[INFERRED, but see D2]`

ADR 0006 (versioned assembly contract) and ADR 0007 (ordering behind an adapter) were written to
permit exactly this. `[AGENT docs/r8/architecture/]`

### D2 — The Airtable write path already exists and the producer's output already fits it

`writeIssueItems(issueItems, issueMap, startDateMap, urlMap)` `[VERIFIED connectAirtable.js:268]`
takes an array of `{IssueDate, ItemID, Section, Slot}` plus three lookup maps. **It has no
dependency on `buildIssues`.** Same for `writeSelectionNotes` `[VERIFIED :154]`.

`demo.js` calls the real `buildIssues` through an adapter and writes `allocation.json` with
`picks: [{IssueDate, ItemID, Section, Slot}]` — **exactly that input shape.** `[AGENT]`

Three gaps, all small:

1. **Nothing is exported.** No `module.exports` anywhere in `connectAirtable.js`.
   `[VERIFIED — grep]` One line.
2. Nothing reads a submission from Postgres.
3. `main()` runs **delete → build → write** `[VERIFIED connectAirtable.js:314-372]`. A write-back
   script must **skip the delete** and write only the chosen picks, then lock them.

**Consequence:** Pareto W6 is ~2–3h, not the 10–15h a full Acceptance-#8 implementation costs
(four tested interruption points, run receipts, reconciliation convergence). `[INFERRED]`

**And it unlocks a shorter first step:** the demo's picks can be written to Airtable *with no console
at all*. That is finish-line item #3 ("R7 in the live path") for ~2h, and it proves the write path
**before** the console depends on it. `[INFERRED]`

---

## 3. The silent failure that governs sequencing

`deleteUnlockedIssueItems()` `[VERIFIED connectAirtable.js:218]` deletes every unlocked IssueItem on
current and future issues, then `main()` rebuilds from **the model's** picks.

So: editor submits in the console → his choices sit in Postgres → next allocation run fires → his
choices are gone → **the newsletter publishes and looks completely correct.**

`[REVIEW docs/r8/R8_Scope.md:138-140 §4 failure mode 1]`

This is the only defect in the whole set that does not announce itself, and it is client-facing. It
is why the Airtable write-back is step 1 and not step 5: a scripted, locking write removes the
failure by construction, where a manual Sunday transcription depends on remembering.

Write order is fixed by Decision_Log §96: **write picks → `generateBlurbs` → lock.** Not lock-first.
`pushToBeehiiv.js:209` filters items missing `DisplayTitle`/`Description`/`CTA` and **throws before
rendering** — a loud failure, not a blank bullet. `[VERIFIED Execution_Log.md — this was a
previously-propagated error, corrected in 5fc3be7]`

---

## 4. Execution order

Each step states its owner and its verification. Verification is written **before** execution
(project rule: define acceptance before implementing).

### Step 1 — Export the write functions, write demo picks to Airtable · **Ariel + Claude · ~2h**

Add `module.exports` to `connectAirtable.js`. New `scripts/writeDemoPicks.js`: read a run folder's
`allocation.json`, fetch Issues + Candidates for the maps, call `writeIssueItems`, then
`writeSelectionNotes`. **Never** call `deleteUnlockedIssueItems`. Dry-run by default, `--apply` writes.

**Verify:** dry run prints 15 picks matching the run's `editor_preview.html`; after `--apply`,
Airtable IssueItems match for all three sections; a subsequent R1 run does **not** delete them
(because they are locked); `generateBlurbs.js` populates copy; `pushToBeehiiv.js` exports without throwing.

**Lands finish-line item #3.**

### Step 2 — Two defect fixes that work by construction · **Claude · ~30min**

- Reject any candidate URL on `forms.gle` / `docs.google.com/forms` before ranking. Most reliably
  recurring defect in the set; hand-removed twice. `[REVIEW #133 2026-09-26 item 5]`
- Make `sections` a fixed three-key **object** in `makeSchema()` so a duplicated section object is
  impossible rather than caught-then-repaired. `[REVIEW #133 2026-09-26 item 2]`

**Verify:** a replay of v5's saved `response.json` through the new schema rejects at parse; no
Unionville form link appears in a fresh run's shortlist.

### Step 3 — De-hardcode the producer · **Claude · ~4h**

Lift `demo.js` + `prepare_inputs.py` into `scripts/issue-build/`, CLI-parameterised. **Delete
`render()`** and the HTML/MD preview — the console replaces it, and that removes ~30 lines of
hard-coded labels plus the date-sensitive render tests. `[REVIEW]`

⚠️ Two traps. `codeIdentity()` must hash the prompt **template**, not the substituted text, or every
week aborts as "code changed" `[REVIEW demo.js:113]`. And once code is shared across runs,
`codeIdentity()` can no longer reproduce a past run's hash — which is the guarantee `RUNS.md` rests
on ("never edit an older folder to rerun it"). **Decide what replaces that guarantee.** `[REVIEW]`

**Verify:** one full run for a fresh issue date with **zero file edits**.

### Step 4 — `to-bundle.js` + publish · **Ariel writes the matrix · Claude the rest · ~5h**

⚠️ **This is not a field mapping.** `alternatives()` `[REVIEW demo.js:99-112]` returns
`replaceable_slots: number[]`, computed only as alternative-vs-each-current-pick. The console needs
`replacementAssessments[X][Y]` over **all ordered pairs of `selected ∪ alternatives`**, because
`draft-domain.ts:129-133` `[REVIEW]` puts the displaced pick back into `alternatives` — so a second
replace in the same slot looks up a pair that was never evaluated. Those pairs must be **computed**
by re-invoking `accepted()`/`buildIssues`. Missing pair → `draft-domain.ts:111-116` throws
"The assembly bundle did not assess this replacement." `[REVIEW]`

**Ariel authors `buildAssessmentMatrix()`.** It is the one piece where a subtle error is silent
until a real user hits it mid-session. Before writing it, read `lib/contracts.ts`,
`lib/mock-issue.ts:33-70` and `lib/draft-domain.ts:103-133` directly — about 200 lines.

Then `publish-build.ts`, a copy of `scripts/seed-demo.ts`, inserting into the existing
`issue_builds` table. Three traps `[REVIEW]`:

- `UNIQUE (bundle_hash)` `[REVIEW 0001_editor_console.sql:13]` is **not** covered by seed-demo's
  `ON CONFLICT (issue_key, build_version)`. Compute a real content hash; handle that conflict
  separately. The fixture's hash is the literal string `"fixture-2026-09-17-v2-raw-copy"`.
- `issue_builds_are_immutable` trigger `[REVIEW 0001:70-80]` — a mis-published build cannot be fixed
  or deleted, only superseded by a new `build_version`.
- **No build selector exists.** `app/page.tsx` → `loadLatestWorkspace()` orders by
  `issue_date DESC, build_version DESC` `[REVIEW workspace-store.ts:311-320]`, so publishing week
  N+1 silently moves the editor off an unsubmitted draft on week N. `loadWorkspaceForBuild()` exists
  but nothing reachable calls it. **Decide: accept, or add a selector.**

Also: `createSubmission` iterates `sectionIds` with no guard `[REVIEW draft-domain.ts:446-447]` — a
bundle missing any of the three sections throws at **submit**, not at publish. And
`provenanceComplete` requires `classification === "classified"` on both sides
`[REVIEW draft-domain.ts:368-369]` — emit `"unclassified"` anywhere and that slot yields **zero
training pairs, silently**, which is the entire stated point of the console (`R8_Scope.md` §1).

**Verify:** publish → console loads real picks → replace succeeds on every slot → **a second replace
on the same slot succeeds** (this is the matrix test) → undo restores → submit produces a
qualifying training pair.

### Step 5 — Host it · **Nate · ~2h of his time**

Vercel + Neon + env vars. ADR 0003 settled that **Nate picks and operates the host**
`[REVIEW docs/r8/R8_Scope.md §2]` — so this is his, not Ariel's. He has said it would be quick.

Auth: `middleware.ts` with HTTP Basic over TLS against one env var, matcher covering everything
except `/_next` and static — **`/api/*` included**, since the mutations create durable state. Not
ADR 0008's signed-session system, which is still `Status: Proposed` and unapproved `[REVIEW]`, and
which `R8_Scope.md:322` puts out of scope anyway. Record as an ADR 0008 amendment; note the accepted
downsides (no logout, no rate limiting).

**Do not ship without auth.** The console serves unpublished candidate data with none today.

**Verify:** `curl` the deployed page and a `POST /api/drafts/.../commands` with no credentials →
both 401.

### Step 6 — One full weekly run, timed · **Ariel · ~2h**

Ingestion → producer → publish → editor session → write-back → export. Time it. **That is
finish-line item #5** (hours per issue), and the before-number is already available.

Budget a second run: this is the first time migrations, the publish CLI, the UI and submit ever meet.

### Step 7 — CI · **Claude · ~20min**

`.github/workflows/ci.yml` running `npm test && npm run lint && npm run build`. Credential-free, so
no secrets. Retires the "never independently run" premise permanently, and it is an existing W7
deliverable (Acceptance #17) `[REVIEW docs/r8/R8_Scope.md:200-203]`.

Also, before Step 4: spend 20 minutes **running** the existing suites rather than reading them.
Nate's training-pair logic has five dedicated unit tests plus an integration test `[REVIEW
draft-domain.test.ts:67,86,126,167,192; workspace-store.integration.test.ts:274]` — it is the
best-covered path in the commit, not the riskiest. The genuinely unverified surface is
`workspace-store.ts` (968 changed lines) and migration `0002` (89 lines of ALTER plus a cross-join
backfill). In particular `rowToSubmission` `[REVIEW workspace-store.ts:141-156]` overlays column
values onto the stored snapshot JSON, so a column/bundle divergence is reported as the column value
and nobody sees it.

---

## 5. Open decisions — Ariel's, and they block the steps that need them

Five are still literally `*Answer:* ______` in `docs/r8/R8_Scope.md:248-256` `[REVIEW]`. An
autonomous run would guess at these.

| # | Decision | Blocks |
|---|---|---|
| TODO-3 | **K** — how many alternatives the console shows | Step 4. `alternatives()` returns ~20/section; `editor_preview` rendered only the first 5. Changing K breaks recall comparability against v2b's 8/15 — the only measured number — because `R6_Scope.md:45-47` pins the join to picks plus **on-screen** alternatives. `[REVIEW]` |
| TODO-4 | What orders the alternatives | Step 4 |
| TODO-1 | Pipeline hosting migration | Step 5 scope; #62 is explicitly a post-R8 gate `[REVIEW R8_Scope.md:348]` |
| TODO-5, TODO-8 | (read them) | — |
| — | Build selector: accept the silent-overwrite risk, or add one | Step 4 |
| — | What replaces `codeIdentity()`'s per-run reproducibility guarantee | Step 3 |
| — | Republication: look-back depth, and drop vs demote | deferred (§7) |

---

## 6. What "V1 shipped" means under this plan

Say this out loud so the finish line is not later read as more than it was:

- The editor uses a hosted console on a real issue, and his submitted picks reach Airtable through a
  **scripted, locking** write-back.
- "R7 in the live path" means the model's ranking reached him and his decisions reached the export —
  **not** that reconciliation is proven against interruption, retries or partial failure.
- The measured number is hours per issue before/after, plus recall when the scoring debt is paid.

Full W6 (Acceptance #8's four tested interruption points, run receipts, convergence) is V1.1.

---

## 7. Non-goals — do not re-expand these

A reviewer put the fully-scoped version of this plan at **25–35h, plus 10–15h for full W6**. The cuts
below are what makes ~12–16h real. Each is deferred, not forgotten.

- **Authoring `scripts/r6/config/*.json`** (15 blank weights + the attribute schema). Keep
  `lib/assemble.js` as a *reference* for assessment semantics; import nothing.
- **Full W6** — interruption testing, run receipts, reconciliation convergence. #138.
- **ADR 0008's session auth.** Basic over TLS instead.
- **The four producer validators** — mandatory unique quotes, self-disavowal, republication filter,
  pre-call fill guard. See §8 for why the first two do not work as originally specified. Hand repairs
  are loud and annoying, not dangerous.
- **Recall scoring for v3/v4b/v5.** No script exists; v2b's 8/15 was computed by hand `[REVIEW]`.
  The join must honour the first-5-alternatives render slice. ~4–6h for two runs. #133.
- **The coverage fix (the 40%).** Real and important; not a ship blocker. #128/#114/#124/#93.
- **Series/occurrence identity modelling**, an `override` assessment status, start-time parsing out
  of description text.
- **Scheduling / unattended ingestion.** #62, already a post-R8 gate.

---

## 8. Falsified claims — do not rebuild these

Each was asserted during planning and disproved. They are listed so a cold session does not
re-derive them from the same docs that produced them.

| Claim | Why it's false |
|---|---|
| `scripts/r6/lib/assemble.js` is already W9 | Vocabulary matches, but nothing imports it, it has never run in scoring mode, and the working lineage bypasses it to wrap `buildIssues` directly. `[AGENT]` |
| Mandatory unique verbatim quotes kill the borrowed-content class | Borrowed content lives in `reason`/`warnings`, which are **unvalidated free text**; only `evidence_quote` is checked. A quote stolen from a sibling already fails today — that is how v3's defects were caught. `[REVIEW #133 2026-09-26 item 3; v3 README D2: "a wrong-but-valid id with a copied quote would still pass silently"]` Closing it needs a schema change, not a validator tweak. Separately, uniqueness introduces a **false-positive** risk: BiblioCommons programme blurbs are boilerplate across sessions. |
| "Zero hand repairs" via more asserts | Every defect that *was* detected was detected by a hard-failing assert and still required a hand repair. More asserts → more repairs. Zero needs deterministic auto-repair plus prompt/schema changes. `[REVIEW #133 2026-09-12 item 3: "Validation stops but cannot repair"]` |
| A self-disavowal assert is mechanical | Half already exists (`demo.js:64`, ranked-and-excluded). The other half needs classifying free-text English; `reason` is typed as a bare `str`. The honest fix is a structured `disqualifying: boolean` — authored by the same model that wrote the contradictory reason. Unproven. `[REVIEW]` |
| A republication filter catches the v5 repeat | `historyFor()` matches **exact URL only** `[REVIEW demo.js:30-36]`. The v5 miss was a Chef Upstairs *pasta dinner* against an Oct 1 *ravioli workshop* — different URL, filter silent. Ariel already named the right lever in #133: a `same_organizer_in_last_2_issues` field. |
| Fabricated history refs are an open gap | Already caught by `demo.js:60`. `[REVIEW]` |
| "Zero console data-layer changes needed" | True only single-build. See Step 4's three traps. |
| Phase estimate of ~12.5h for the fully-scoped plan | Review put it at 25–35h. This doc's 12–16h is the **cut** version (§7), not the same scope re-estimated. |
| Ariel sets up Vercel | ADR 0003 settled that Nate picks and operates the host. `[REVIEW]` |
| CTOR is a one-way door | It's a Beehiiv dashboard export (`posts_by_date_*.csv`) carrying a literal Click-To-Open Rate column, full archive back to Feb 2025 in one pull. Nothing expires. **The metrics log's capture instruction is wrong** — it points at `issue_history.json`, which carries no stats at all. `[AGENT]` |
| `docs/v1/V1_Scope.md` would orphan the logs | False as stated — the logs are in `logs/`, not `docs/`. The real (narrow) breakage is that `/start` derives `logs/R{N}_Log.md` from the release it finds. `[REVIEW]` |

---

## 9. Completeness — what has NOT been examined

**Read this section as the plan's biggest weakness.** §4's seven steps are what the planning
session happened to look at. They are not the output of a sweep against "what does a finished,
owned V1 actually require." Nobody has done that sweep.

### Raw materials that exist and are reusable

Facts, not recommendations. A completeness sweep should start by asking what each of these is
*for* in a finished V1, and which have no role (and so are dead weight to be said out loud).

**Pipeline, live:** R1 + R2 in n8n (`workflows/`); 11 ingestion sources; `buildIssues.js`
(production allocator); `connectAirtable.js` (fetch + write + delete); `generateBlurbs.js`;
`pushToBeehiiv.js`.

**Model, live:** the R7 gate — `models/sectioning/live_runner.py`, Voyage `voyage-4-large`
embeddings, frozen corpora, `scored_survivors.jsonl`. Three materialized runs exist.

**Model, trained but unused:** the R7 Label Deck — 400+ editor rulings across 4 batches, plus
`eval/step1c_reconciliation.json` and `step4b_reconciliation.json`. Measured editor
self-consistency: 77% overall, **89% conditional on both-included** — a hard ceiling on any
label-matching metric.

**The console:** complete, fixture-only, 8 ADRs, three test suites, one unrun integration suite.

**The producer:** 5 runs of receipts under `data/tracking/r6_demo/` with manifests, hashes,
costs (~US$0.25/run) and hand-repair tables. `RUNS.md` indexes them.

**Unused by design:** `scripts/r6/` (7 library modules + `run.js`), config worksheets blank.

**Monitoring:** `postRunChecks.js` and its five sub-checks (`depthCheck`, `overlapAudit`,
`integrityCheck`, `snapshotCandidates`, `facebookSubmissionCheck`). Read-only. One is stuck
non-zero (§1).

**Measurement data:** `data/beehiiv/issue_history.json` (90 issues through 10-01); two
`link_clicks_*.csv` exports (latest 2026-07-07, so clicks end 2026-06-25, #139); a
`posts_by_date_*.csv` carrying per-issue **CTOR for all 71 issues back to Feb 2025**;
`NA/Vaughan_Metrics_Log.md`.

**Editor evidence:** `docs/r6/R6_Editor_Feedback.md` (three recorded rounds: v1, v2b, v3);
`meetings/` notes; v2b's measured 8/15 recall.

**Decisions:** `docs/Decision_Log.md`, 101 entries. ~62 open GitHub issues.

### Completeness questions already visible — and this list is deliberately NOT exhaustive

The next session's job is to find what is **not** on this list. These are starting points, not
the answer.

1. **The console covers 3 of the newsletter's 5 sections.** Local Aroma and Trust Me Recipe stay
   in Airtable, out of scope by decision (`R8_Scope.md` §8). So every week the editor works in
   two places. **Nobody has asked whether a split workflow is better or worse for him than
   all-Airtable.** If it is worse, "editor using it on real issues" could be satisfied and the
   project still fail its actual purpose.
2. **"Editor using it on real issues" is plural.** One timed run is not sustained use. How many
   consecutive weeks does V1 require? Unscoped.
3. **Nothing monitors the weekly run.** If the producer, the publish or the write-back fails on a
   Sunday, what tells anyone? The health-check suite covers ingestion, not this new path.
4. **No handover artifact exists.** #49 (Airtable cleanup + client orientation SOP) and #61
   (client-replication playbook) are open and unscoped. "Done and owned" may require one.
5. **What happens when the editor is away**, or someone else runs the issue. No procedure.
6. **The client has not visibly agreed to any of this.** No record of a conversation about the
   console, the hosting, or where the data lives. `[UNVERIFIED]`
7. **The committed delivery date (2026-09-08) passed a month ago** and is recorded nowhere as
   renegotiated `[REVIEW R8_Scope.md:337]`. What the editor currently believes is unknown.
8. **Nate's role after Step 5 is undefined.** `R8_Scope.md:333` notes he never confirmed a start
   and no checkpoint fires until he does `[REVIEW]`.
9. **Two of the five finish-line items have no acceptance test written** — "R6 done" and "one
   number measured" are stated as outcomes, not as tests that can pass or fail.

---

## 10. Not yet recorded anywhere

The planning session wrote **only this file**. These remain unpersisted:

- The R6+R8 → V1 collapse, and the V1 authorship split → `docs/Decision_Log.md`
- `docs/r8/R8_Scope.md` §0 refresh + a pointer line in `docs/r6/R6_Scope.md`
- `Execution_Log.md` session entry, `CHANGELOG.md`
- **`NA/Vaughan_Metrics_Log.md`: the CTOR capture instruction is actively wrong** (see §8)
- `docs/r7/R7_Scope.md` §0 contradicts `R7_Closeout_Checklist.md` (says the readout is next; the
  checklist settled Fork C / 4c / #108 on 2026-09-04)
- `logs/R6_Log.md` "Next" and `RUNS.md` were stale on v3's sent status (now superseded anyway)
- Issues: close **#110** as duplicate of #117; retitle #117 (not a one-way door); file the
  `postRunChecks.js` pinned-exit-code bug; file the self-disavowed-rows defect class; **#135 and
  #136 are implemented but still open**
- `/start` already reads `docs/r5/` and `docs/r7/` Scopes as open releases — pre-existing, worth two
  minutes `[REVIEW]`
- `CLAUDE.md:72` and `AGENTS.md:72` hardcode `docs/r8/R8_Scope.md` as "the active delivery path";
  retitling it stales those lines `[REVIEW]`
- A post-project retrospective task (what Ariel authored vs agent-written, and what goes on the
  résumé) — Notion, one line, Ariel adds it
