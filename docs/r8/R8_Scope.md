# R8 Scope — The Editor Console

**Owner:** Ariel · **Builder:** Nate · **Committed delivery:** 2026-09-08

**Type: Release-working.** Decisions home in `docs/Decision_Log.md`. Session recaps in
`logs/R8_Log.md`. Everything Nate-facing — scope of his build, decision rights, checkpoints —
homes in `docs/r8/R8_Nate_Kickoff.md`. This doc does not restate any of it.

**Read order:** this doc → `docs/Decision_Log.md` §87, §93, §94, §95, §96, §98, §99.

---

## How to use this Scope

When opening R8, read §0 for the current verified state and `Next`, then §5 for package ownership
and status. Do not infer completion from code existing: advance a package only when its stated
behaviour has been demonstrated.

After every R8 session:

1. Update §0 only with newly verified state and replace `Next` with the single next executable gate.
2. Update §5's Status cell only for packages whose evidence changed.
3. Append the session record to `logs/R8_Log.md`; do not copy the recap into this Scope.
4. Put any new settled architecture/editorial decision in `docs/Decision_Log.md` and point to it here.

---

## 0. Status (2026-10-13)

R8 is open ahead of the R6 gate, on a delivery commitment to the editor. R7 is closeout-only and
off the critical path.

**Nate's #135 (`8396a79`) and #136 (`c45a7ad`) have landed** (2026-09-18) on top of the `1370f77`
foundation: versioned reopen lifecycle with one-current-revision DB constraints, immutable
submissions, submissions carrying full provenance, stricter training-pair qualification, slot-scoped
undo fix, explicit demo-vs-production modes where production fails closed, and a PostgreSQL
integration suite. **Both issues remain open on GitHub.** `c45a7ad` is the last commit touching
`apps/editor-console/`.

**CI exists since 2026-10-11** (`.github/workflows/ci.yml`): every push runs the console's tests, lint
and build, the `connectAirtable.js` guard test and the issue-producer tests, green on `master` at
`b8b6a68`. ⚠️ The integration suite is still gated behind `R8_REQUIRE_INTEGRATION_DB=1`; CI reports it as skipped,
not passed. It has been run by hand once (2026-10-13, see below).

**The console is hosted and serves a real build (2026-10-13).** It runs in production mode on Vercel
against a Neon database, behind one shared login (HTTP Basic on every page and `/api` route; with no
login configured every request is refused). Ariel set up and owns both accounts (Decision_Log §110).
The build it serves is the 2026-10-15 slate rebuilt from the v6b run, published with
`npm run publish-build`. ⚠️ **That database holds test data:** one submission Ariel made while testing,
recorded under the editor's identity. **Decided 2026-10-13 (Ariel): the database is reset and re-migrated
once, immediately before the first real build is published (2026-10-22 at the earliest; the first issue
after the editor walkthrough).** Everything in it before that reset is test data, including anything the
editor submits while trying the console; real data starts with that build. Rows in `submissions` and `issue_builds` cannot be deleted one at a time, so the reset
also removes the published 2026-10-15 build, which was a test rebuild. The reset has not been run. No
write-back to Airtable has run. `lib/mock-issue.ts` is now the demo-mode fixture only.

**TODO-0 is resolved: the premise holds.** ⚠️ *Contested 2026-10-10: ordinary picks also come from outside
the pool. See `docs/v1/V1_Ship_Plan.md` §2 and #146. Ariel chose D0 option (a), a per-slot "I'm filling this myself", on 2026-10-11 (ship plan §0 and §4); see Decision_Log §106.* Sponsored events go into a separate section, so no
console slot is ever filled from outside the candidate pool.

**Weight after Sept 13 (set 2026-09-17, Personal OS planning sitting):** NLAP holds at 3 × 3h/week.
Work order is finish R8, then bring R6 into it. **Open, not settled:** how much of R6 is actually
done — its slate has reached the editor two weeks running — and what "done enough to inject into
R8" requires. Resolve in an NLAP session before encoding it anywhere as architecture. Hours re-checked
against the log at the Sept 27 sprint boundary.

**Done 2026-10-11:** `docs/v1/V1_Ship_Plan.md` §3 items 1 (CI), 2 (`connectAirtable.js` guard, #144), 4
(repeatable producer, `scripts/issue-build/`) and 5 (console date fix, #145), each against its acceptance
test. The producer's live `prepare --fetch-pages`, `call` and `finalize` path ran
on 2026-10-11 for the 2026-10-15 issue: v6 stopped on the thin-supply gate, v6b was signed off by Ariel and sent.

**Built and tested 2026-10-11, none yet run live:** item 3 (`scripts/writeIssuePicks.js`, #149; its one
read-only dry run resolved all 15 v6b picks and found no Issues record for 2026-10-15), item 4a
(`scripts/issue-build/runWeek.js`; stubbed stages only, and it checks R1, it does not run it) and item 13a
(`scripts/weeklyComparison.js`; reproduces the hand-scored 8 of 15 for 2026-09-17, counting rule in
Decision_Log §107). Item 6: the console unit suite passes (16 passed, 2 skipped); the integration suite is
still not run. **Item 10 is half built:** `scripts/issue-build/to-bundle.js` converts a run folder to the
console contract and **refuses every real run**, because the producer does not supply `build_version`,
`seriesId`, `classification`, or a description for every event (ship-plan item 10a, #150). `publish-build.ts` does
not exist.

**Built and tested 2026-10-13, none yet run live:** item 9 (replacement checks; Decision_Log §108). The console
now assesses every swap against the current lineup (`lib/replacement-rules.ts`), warns and never refuses, and
`to-bundle.js` fills the assessment table from the producer's `replaceable_slots`. The allocator's venue match
ignores capitals and extra spaces, held to the console's copy by `scripts/venue_match_cases.json`. Item 7 is
built against fixtures (`scripts/applySubmission.js`): it maps a submission to the writer's picks file and never
calls Airtable; the live database read is a stub awaiting Neon credentials, and its "I'm filling this myself"
field is an assumption until the console writes one (#152). Item 10a is half done: the producer now supplies
`build_version` and a description for every displayed event, so a rebuilt run is refused for `seriesId` and
`classification` only (#150). Item 12's message is drafted and unsent.
The submit record carries the verdict saved with the swap event (Ariel, 2026-10-13; #151 closed), so the
console no longer reads the bundle's assessment table at all. ⚠️ The PostgreSQL integration test for this was
rewritten and has not been run.

**Done 2026-10-13, second session:** item 10a is complete: the producer writes a `series_id` and a
`classification` for every displayed event into `displayed_events.json` (Decision_Log §109; #150), and a run
finalized with this code converts with no missing-field diagnostics. Item 10 is complete:
`apps/editor-console/scripts/publish-build.ts` checks a bundle and inserts it, dry run by default. Item 11
is complete on its first acceptance test (unauthenticated page and API requests return 401; the real build
renders after sign-in). The chain ran once on real data, by hand: producer run → bundle → database → hosted
console → a submission → `applySubmission.js` dry run (15 picks, matching the submission). A run folder
finalized before 2026-10-13 is still refused by the converter and is not rewritten; the v6b bundle came from
a rebuild of that run's saved inputs, with a lineup byte-identical to the one sent.

**Done 2026-10-13, third session:** item 7's live read is wired: `applySubmission.js` reads the latest
submission for an issue date from the console's database with one read-only query, and refuses a submission
the editor reopened and has not resubmitted. Run once against the hosted database (dry run): 15 picks,
matching the published build. The console has the "I'm filling this myself" control (#152): a marked slot
keeps its pick underneath, cannot be replaced until unmarked, and records no replacement and no preference
pair; the submission lists the marked slots and the bridge skips them. The swap-reason question now also
appears above the alternatives after a swap, and the submit dialog lists swaps with no reason (#153; what an
unreasoned swap means is unchanged, Decision_Log §108). Migration `0003` (allows the `self_fill` event) is
applied to the hosted database. Item 6: the PostgreSQL integration suite ran once by hand against a Neon
branch copied from production, 3 passed. Item 4a: `runWeek.js` ran end to end on real data for 2026-10-22
with `--skip-r1` (217 candidates scored, 88 to the model, no repairs), a rerun repeated no paid call, and the
run converted and passed the `publish-build` dry run. That run was a rehearsal on a pool last refreshed
2026-10-11; its R7 and run folders were deleted so the real week is not pinned to its snapshot.

**Done 2026-10-14:** Swap warnings no longer count a slot marked "I'm filling this myself" (`674e296`; the
editor's own pick in that slot is his to check). `generateBlurbs.js` makes one model call per event, so copy can
only land on the row it was written for; it now has an offline test in CI. `applySubmission.js` prints which
database it reads and where the URL came from. A writer test covers a self-filled gap in a section. Item 3's
bounded review (#149) returned READY with no blockers, and a second review (Codex) agreed. Item 6: CI now runs
the PostgreSQL suite on a throwaway Neon branch made from an empty `ci-empty` parent, unproven until its first
GitHub run. Evidence for items 14 and 16 is on #147 and #133.

**Not yet run:** the writer's live `--apply` (item 3, #149), blurbs and export after a console submission,
`runWeek.js`'s R1 freshness stage (skipped in the rehearsal; n8n was down), and the "I'm filling this
myself" control against the hosted database (tried in demo mode only). `generateBlurbs.js`'s per-event prompt
has not yet been run against the real model. CI's PostgreSQL job (`editor-console-db`) ran once on GitHub
(2026-10-14, run 38591282358): branch created and deleted, 2 of 3 tests passed, and the first test timed out at
vitest's 5-second default while applying every migration to a cold branch. Until it passes, the integration
suite is unproven in CI.

**Next:** Ariel walks the editor through the console at their next meeting (item 12; decided 2026-10-13 in
place of a written message; no date set). The first real week is the first issue after that meeting:
`runWeek.js` → `to-bundle.js` → reset and re-migrate the console database (with Ariel's go at that moment) →
`publish-build`. Until then the emailed preview continues as before. Item 3's first live `--apply`
still needs Ariel's go and its own bounded review. The ship plan's new §0 states the destination (an editor-run week) and
stages the work as Stage A (items 1–14, Ariel runs the commands) and Stage B (items 15–17, the buttons);
**where V1 closes is not settled.** D0 is chosen (Decision_Log §106), so it no longer
blocks items 9, 10 and 13. That doc
is the planning artifact for the remaining path to a first complete release — **it is a working doc, not a
status source**, and its filename is deliberately outside `/start`'s `docs/r*/R*_Scope.md` glob, so this
pointer is how it is found.

**How R6 and R8 combine into a first complete release is deferred to that session and is not settled
here.** A plan exists and Ariel approved it as a draft only; the release-structure question was
explicitly parked.

---

## 1. Outcome

By delivery, the editor opens one link, reviews a prebuilt issue for Families, Couples and Golden
Age, replaces picks he disagrees with, and submits once. Every decision he submits survives to the
Beehiiv export with its provenance recorded.

Local Aroma and Trust Me Recipe stay in Airtable, unchanged.

**Why it is worth building:** a qualifying submitted swap yields a preference pair — the model
ranked A above B, the editor chose B. That is training signal R6's ranker does not have and cannot
reconstruct after the fact. Broken-listing swaps, unclassified swaps, undone swaps and infeasible
comparisons yield nothing.

---

## 2. Settled

Ariel's decisions. Where a bracket cites review or code, that is the evidence, not the authority.

- **Three sections only** — Families, Couples, Golden Age. Local Aroma and Trust Me Recipe are out
  entirely, not read-only.
- **Draft-then-submit.** Only the final submitted state yields preference pairs.
- **The console never writes to Airtable.** It records an append-only submission; Ariel's reconcile
  script applies it. [Decision_Log §96]
- **Reconcile order is apply → generate blurbs → lock**, and must satisfy §4's invariant.
- **Ordering reaches the console through one adapter.** No scalar-score assumption. R6 drops into
  the adapter if it lands. [Decision_Log §87]
- **Provenance is captured at interaction time or it does not exist.**
- **Prefer / broken-listing is one dismissible tap, never a form.** Unclassified swaps are logged
  and excluded from training.
- **Nate selects the host.** He operates it, he picks it.
- **Beehiiv stays a manual paste**, unchanged.

### Pair-evidence contract

A submitted replacement becomes ranking evidence only when all of the following hold:

- The editor explicitly classified the final replacement as preferred. Broken-listing and
  unclassified replacements remain audit events and never become training pairs.
- The final submitted event is compared with the slot's original event. Intermediate exploration
  is not evidence: A→B→C yields at most C over A; returning to A yields no pair.
- Both events were feasible for the same slot at decision time, including the date window, venue
  constraint, lock state, cross-issue assignment and recurring-series collapse.
- The interaction preserved the displayed choice set and order, ordering/model version, original
  ranks, feasibility assessment and whether the editor opened the source link. Missing provenance
  marks the event incomplete and excludes it from training without blocking submission.

An untouched pick is not preference evidence; the editor may not have reviewed its alternatives.

---

## 3. The shape

```
Ariel        trigger ingestion + R7 scoring                      (manual — TODO-1)
  |
pipeline     allocator selects the collective 5 per section      (buildIssues.js)
  |
Ariel        W9: section alternatives + replacement assessment   <-- does not exist
  |
Nate         console renders the built issue + alternatives
  |
editor       review, replace, undo, submit once
  |
Nate         submission recorded append-only with provenance     NO Airtable write
  |
Ariel        reconcile: validate -> apply -> generateBlurbs -> lock
  |
Ariel        pushToBeehiiv, pasted by hand                       (unchanged)
```

The console is a review surface with no production authority. Reconcile is the only writer, it is
Ariel's, and it is where both failure modes are closed.

---

## 4. The write path

Two failure modes. Verified against the files 2026-08-28.

1. **An unlocked swap is deleted on the next allocation run.** `connectAirtable.js:218` deletes
   every unlocked IssueItem on current and future issues and rebuilds from the model's picks.
   Silent and destructive. Published history is safe — `fetchIssues()` drops `date < today`.
2. **Locking it first blocks the export.** `generateBlurbs.js:270` skips locked rows, so a row
   locked before copy exists never gets `DisplayTitle`/`Description`/`CTA`. `pushToBeehiiv.js:209`
   then throws, naming the section and slot. Loud and blocking, not silent.

A third path is genuinely silent and not yet covered: **re-pointing an existing row's `Candidate`
link** leaves stale copy that passes the 209 guard, so the export renders the previous event's
blurb under the new event's URL. The write contract must invalidate copy on any re-pointed row.

`apply → generate blurbs → lock` avoids the first two. **An order is not a safe operation** — if
reconcile dies after apply and before lock, the editor's choices sit unlocked, waiting for failure
1, and the allocator's rebuild looks plausible.

**Chosen W1 invariant:** a failed reconcile reruns against the same immutable submission and
deterministically converges, with no duplicate effects. W6 implements and tests this guarantee.

Also: `pushToBeehiiv.js:106` selects rows by `SEARCH(TARGET_DATE, {Name})`. Any row whose `Name`
does not reproduce `connectAirtable.js`'s exact string vanishes silently from the export.

---

## 5. Work packages

| # | Package | Owner | Status |
|---|---|---|---|
| W1 | Write-and-state contract | **Ariel** — due CP1 | ✅ Settled 2026-09-10 |
| W2 | Console: shell, layout, swap/undo, draft, interaction log | Nate | 🟡 Partial — fixture flow passed; bounded UI/content corrections remain |
| W3 | Console hosting + deploy — **day one, not last** | Nate | ⬜ Not evidenced |
| W4 | Read layer against real scored data | Nate | ⬜ Not started |
| W5 | Append-only submission + provenance capture | Nate | 🟡 Implemented; PostgreSQL path unverified |
| W6 | Reconcile script + durable per-attempt run receipt | **Ariel** | ⬜ Not started |
| W7 | Acceptance/fallbacks + PostgreSQL/API integration tests, failure injection and CI | **Ariel** | 🟡 Fixture checks passed; system evidence remains |
| W8 | Pipeline hosting migration | Nate — TODO-1 | ⏸ Deferred / open decision |
| **W9** | **Assembly / choice-set contract** | **Ariel** (semantics + fixtures) | ⬜ Not started |

**W1 — settled write-and-state contract.** [Decision_Log §98]

- A draft is mutable and auto-saved. The editor may leave and resume it without submitting.
- Submit creates an immutable revision containing: submission ID; issue and built-issue version;
  editor identity; submitted time; the final ordered five for each included section; every
  original→replacement change; and the editor's recorded reason for each change.
- The submitted revision, not mutable browser state, is the input to reconciliation. Reconcile
  refuses a submission whose issue/build identity does not match its target.
- Reconcile deterministically converges on safe rerun against the same submission. Each attempt
  records its stage and outcome; retrying after interruption completes the remaining work without
  duplicate effects.
- The operation order is validate → apply → generate blurbs → lock. The issue becomes locked only
  after the full operation succeeds. The latest successfully applied revision is the authoritative
  editorial decision for that issue, and Airtable must match it.
- A lock prevents accidental mutation; it is not permanent. An explicit **Reopen for editing**
  action creates a new editable revision while preserving the previous submission and processing
  history. Resubmission reconciles the new revision, then locks it after success.
- At most one revision for an issue may be the current editable draft or active reconciliation
  target. How Nate exposes these states is implementation detail; these guarantees are not.

**W6 must make every reconciliation attempt auditable.** Its durable receipt names the immutable
submission and issue-build version, records the terminal outcome and last completed stage, and
reports applied/rejected/incomplete counts. A failed attempt remains distinguishable from a
successful no-change rerun; logs alone are not the receipt.

**W7 proves the state boundary, not only the pure domain functions.** The credential-free CI path
runs tests, lint and the production build. A separately configured, isolated PostgreSQL test path
exercises command and submit transactions, stale revisions, duplicate requests and the interruption
points in Acceptance #8. It must never point at the live console database.

**W9 exists because nothing produces alternatives.** `buildIssues.js:372` returns
`[{IssueDate, ItemID, Section, Slot}]` — selected picks only. W9 defines one logical assembly
boundary around that planner: consume an ordered pool; return the collective five-event set per
section, section-level alternatives, and a contextual assessment when an alternative is proposed
against a selected event (`clean`, `override` or `unavailable`, with a reason). The same alternative
may be clean against one selected event and conflict against another because the other four remain
fixed.

For delivery, `buildIssues.js` remains the sole production planner. W9 must not restate its rules in
a second writer. A future replacement runs read-only against identical inputs and records slate
diffs; at cutover, `connectAirtable.js` invokes exactly one planner, and the legacy planner is retired
or reduced to a wrapper. This closes the silent failure where two planners produce different,
plausible `IssueItems` from the same pool.

Nate owns presentation, not these semantics. Drag-and-drop remains out of the committed delivery.

---

## 6. Open decisions

**TODO-0 — Can the editor complete an issue in a replace-from-bench console?** **RESOLVED
2026-09-01: yes.** Paid events go into a separate section, so no slot is filled from outside the
candidate pool. No manual-insert feature. `meetings/2026-07-19.md`'s *"~2 of 5 events to be
sponsorships"* is superseded — intent that did not become practice. `R8_Nate_Kickoff.md` §6's
instruction to avoid assuming a selection is filled only from the section's alternatives is **withdrawn**;
correct at CP1. Still unvalidated, non-blocking: whether the alternative set expresses his editorial
operations — splitting similar events across sections, balancing cities issue-wide. Both were
re-scored as reasons to swap, not operations the UI must add. First exposure is the live session.

**TODO-1 — Is the pipeline hosted for delivery, or does Ariel keep triggering it?** Due CP1.
*Against:* the migration is the biggest available schedule risk — #111 rewrote all 51 nodes and
reported success, and the BiblioCommons fix exists only in the running container.
*For:* the editor asked for it directly on 08-20. Hosting later also *deletes* the run-ingestion
button rather than making him press it.
*Safe to defer:* the button is additive and changes nothing Nate builds now.
*Answer:* ______

**TODO-2 — What does `Lock` mean after a submit?** Due CP1, part of W1.
*Lean:* lock the whole submitted issue after blurbs generate. Not per-swap — that degrades the
field's meaning. Must satisfy §4's invariant.
*Answer:* Lock the whole issue only after successful apply and blurb generation. Reopening creates
a new revision and preserves the applied revision and audit history.

**TODO-3 — Section-alternative count (`K`), and what a card shows.** Editor validates.
`K` is the number R8 initially displays, distinct from R6's enrichment depth `M`. Choose it from
observed editor use; no permanent value is set in advance.
*Answer:* ______

**TODO-4 — What orders the alternatives on day one?** Due before the scoring run.
*Lean:* `P(include) × P(section)` per section, labelled "suggested" — never "best". §87/§93 forbid
the stronger claim.
*Answer:* ______

**TODO-5 — If R6 lands first, does it cut over before delivery?** *Lean:* **no.** Build the adapter
so it can, exercise the seam after R8. Changing his ordering before he has ever used the console
means a bad reaction cannot be attributed to the tool or the ranking. That is a measurement
problem, not only a risk.
*Answer:* ______

**TODO-6 — Do we tell the editor his source-link opens are recorded?** *Lean:* yes, plainly. §93
makes link consumption the confound that decides whether a swap is ranker evidence at all. Silent
tracking is the wrong precedent with a client.
*Answer:* ______

**TODO-7 — The two fallback procedures.** Due CP3.
*Lean:* (a) *before reconcile* — Airtable is untouched, he finishes there as today; (b) *after
partial reconcile* — per §4's chosen invariant. Written, not improvised. No preference pairs are
inferred from a fallback session.
*Answer:* Before reconcile, retain the draft and use the existing Airtable process if necessary.
After partial reconcile, retry the same immutable submission and deterministically converge; do
not infer preference pairs from a fallback session.

**TODO-8 — If Nate's CP1 estimate does not fit, what drops, in order?** Write the list before CP1,
not during it.
*Answer:* ______

---

## 7. Acceptance

Observable scenarios. **No numeric targets** — the evidence supports none.

1. Normal review and submit; Airtable matches what he saw; blurbs and export run clean.
2. Replace then undo → final state equals original → **no pair derived**.
3. A→B→C yields exactly one pair (C over A), not two.
4. A swap tapped "broken listing", and any *unclassified* swap, never enters the trainable set.
5. **Allocator rerun after reconcile:** every submitted slot intact and still blurb-generable.
6. Stale view at submit → refuses, explains, offers reload. Never overwrites.
7. Interrupted submit, retried → no duplicate rows, no duplicate events.
8. **Interrupted reconcile, rerun → correct final state, blurbs and locks, no duplicate effects.**
   Tested at four points: before apply, mid-apply, after apply / before blurbs, after blurbs /
   before lock.
9. **Reconcile cannot run against the wrong submission**; an applied submission is refused or
   converges, per §4.
10. A pre-locked slot is visibly immutable and unchanged.
11. Opening a source link is recorded and returns him to his place, draft intact.
12. Airtable unavailable → says so plainly, draft not lost, nothing half-written.
13. Both fallback procedures work and are documented before the first live session.
14. **One real Sunday, observed not surveyed:** did he finish, where did he stall, did he open
    Airtable anyway, what did he ask for that wasn't there.
15. One alternative can be clean against one selected event and require an override or be
    unavailable against another; each result carries the correct reason.
16. Any future planner runs read-only and is diffed before cutover; production invokes exactly one
    planner for a given pool.
17. A clean CI run executes the credential-free tests, lint and production build; the isolated
    PostgreSQL suite proves command/submit transaction and retry behaviour before live use.
18. Every reconcile attempt leaves a durable receipt with its submission/build identity, outcome,
    last completed stage and applied/rejected/incomplete counts.

---

## 8. Explicitly out

R6 ranking as a delivery dependency (the adapter ships; cutover is TODO-5) · a new click/CTOR
collection system or click-optimized R6 objective [Decision_Log §99] · Local Aroma and Trust
Me Recipe in any form · blurbs or Beehiiv triggered from the console · the Decision_Log §94
model-deployment tranche · search, filters, history, drag-and-drop · visible model scores or
explanations · any reason taxonomy beyond the two-way tap · real accounts (one link, one password)
· mobile · dashboards · notifications · three-solo-weeks proof · Mississauga portability.

**Deferred items become scheduled gates, not reopened scope.**

---

## 9. Risks

| Risk | Read |
|---|---|
| **Nate has not confirmed a start** | The delivery date was committed before he estimated. No checkpoint fires until he starts. Needs a drop-dead date after which Ariel builds it or moves the date. |
| Candidate supply is thin on the live Sunday | Three sources at zero (#128), Facebook intake stale (#114). Thin sections would read as a console failure and would not be one. Check the pool twice before the live session. |
| `workflows/NLAP R1.json` divergence | The repo copy 403s on BiblioCommons; the fix lives only in the running container. **Do not import that file before the live session.** |
| Trust Me Recipe code/doc drift | `buildIssues.js:9` gives it `min 1 / max 2` while the data rule says manual-only (#134). **Do not change the allocator this release** — it would alter issue composition during the validation window. |
| Nothing on disk records the delivery commitment | `meetings/2026-08-27.md` Decisions section is entirely `TODO(ariel)`. Write down what was promised, and to whom. |
| A hand-built console breaks the config-only promise | Roadmap addendum #5 assumes Mississauga onboarding needs no code changes. Worth knowing now. |

---

## 10. Post-R8 gates

Named, owned, explicitly not part of delivery:

- **PROVEN** — three consecutive solo editor Sundays, once the manual-trigger dependency is gone;
  record completion time, swaps, fallbacks, failed submissions and operator intervention per run.
- **HOSTED** — unattended pipeline scheduling (#62), if TODO-1 lands "not hosted".
- **RANKED** — R6 cutover, if TODO-5 lands "not before delivery".
- **PORTABLE** — Mississauga config-only onboarding.
- The Decision_Log §94 model-deployment tranche.
