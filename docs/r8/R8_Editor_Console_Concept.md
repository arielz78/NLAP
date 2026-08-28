# R8 (parked) — The Editor Console

> ⚠️ **NOT AN ACTIVE RELEASE. NOT A SCOPE DOC. NO STATUS LIVES HERE.**
> R8 does not open until R6 closes. R7 is active; R6 is next. Nothing in this file is a
> commitment, a plan, or a current state. It is a captured concept from one off-critical-path
> session (2026-08-20) so the thinking is not re-derived later.
>
> If you are a `/start` reading this: ignore it. Status is `docs/r7/R7_Scope.md`.

**Captured:** 2026-08-20 · **Gate:** R6 complete
**Companion artifacts:** `meetings/2026-08-20.md` (editor review) ·
prototype: https://claude.ai/code/artifact/38529734-3c85-4036-83fe-a21b0f9c7b48

---

## 1. What it is

A web console that is the **face of the pipeline** for a non-technical editor. He opens one
link on a laptop, sees a fully built issue, swaps what he disagrees with, approves. He never
opens n8n, never opens Airtable, never runs a script.

Shown to the editor 2026-08-20 as a prototype rendered with real candidates from the
14–23 Aug window. **He agreed with the concept and raised no objections.** Nothing new
surfaced, which means no constraint discovered in that meeting changes the design.

⚠️ **Read this narrowly.** Agreement in a demo evidences *concept acceptance only*. It is not
evidence of adoption, and it does not validate the workflow — he has not used it on a Sunday.

## 2. The shape

Editor's proposed flow was three buttons: (1) run ingestion, (2) build + review the issue,
(3) generate blurbs. Applying "delete the requirement" pressure collapses 1 and 3 into
automation, leaving **one editor action: Approve issue**.

**That collapse is contingent on infrastructure, not on design** — see §4. While n8n runs
on a local laptop, buttons 1 and 3 are not deletable, because "on a schedule" does not exist.

Per section: 5 allocated picks, k ranked alternates, one Replace action.
Sections with model support: Families / Couples / Golden Age. **Local Aroma and
Trust Me Recipe are unranked by any current model** — unresolved whether they belong on
the screen at all.

## 3. The part that carries the value

Every swap is a **preference pair**: the model ranked A above B, the editor chose B. This is
training signal R6's ranker does not currently have, and it is generated as a by-product of
the editor doing his normal job — no separate labelling sitting.

**The capture must split two cases and only two:**
- *Prefer the other one* → trainable ranking pair
- *This listing is wrong / cancelled / duplicate* → pipeline defect, **must never train the ranker**

One click, dismissible. A larger reason taxonomy produces sparse fake precision and suppresses
swap volume. If capture ever feels like a form, volume goes to zero.

⚠️ **Do not default an un-answered swap to "prefer."** That silently converts pipeline defects
into training pairs — the exact corruption the split exists to prevent. **Unclassified swaps are
logged and excluded from training** unless "prefer" was expressed through a deliberately designed
action. The design problem is therefore how to make classification feel free, not which default
to pick.

**Rules for what counts as a pair** (not obvious; getting them wrong silently poisons the
training set):
- An **untouched pick is not evidence of preference** — he may never have read the alternates.
  Never infer preference from non-action.
- **A→B→C does not mean B beat A.** Only the final submitted state yields pairs; intermediate
  swaps are audit log, not labels.
- Both candidates must have been **feasible for the same slot** at decision time — date window,
  venue constraint, lock state, **cross-issue assignment, and recurring-series collapse** — or
  the action is not preference evidence.
- A pair is only interpretable with its **provenance**: ordering/model version, the original
  ranks, the choice set actually displayed, and **whether the editor opened the source link**.
  Per `Decision_Log` §93, a decision informed by information the model never saw is an
  end-to-end information failure, not evidence the ranker misordered its own input.

## 4. The real blocker is infrastructure, not design

**n8n runs on a local laptop.** If the machine is closed on Sunday morning, nothing runs.
So "put ingestion on a schedule" is not a free simplification — it requires the pipeline to
run without Ariel present. That is **#62**, and it is the long pole for this entire concept.

Dependency order: host the pipeline → the console becomes a thin face over something that
runs on its own. Note what this does to the button count: **hosted scheduling removes the
need for button 1 rather than turning it into one** — a manual "run now" survives only as a
fallback. Approval then triggers the downstream blurb job.

⚠️ **The blurb/Beehiiv step is only "Low effort" once jobs run unattended.** `pushToBeehiiv.js`
today emits five HTML snippets for **manual paste** — there is no unattended publication path.
The §7 rating assumes hosting is already done.

## 5. The write-path trap (verified in code)

`deleteUnlockedIssueItems()` — `scripts/connectAirtable.js:218` — deletes unlocked IssueItems
and rebuilds them. **An editor swap that is not locked silently vanishes on the next
`connectAirtable.js` (allocation) run.**

Two scoping facts that matter and are easy to get wrong:
- **The trigger is the allocation run, not R1.** R1 is n8n ingestion; a swap survives ingestion
  and dies on the next allocation.
- **The blast radius is current and future issues only.** `fetchIssues()` drops any
  `date < today`, and `fetchExistingIssueItems()` returns `[]` for items whose Issue is not in
  that map ("past issue — never touch"). Published history is not at risk.

**"Lock it or lose it" is a false binary** — persisted pins as allocator input, or a change to
the allocator's rebuild contract, are both live options. This is a semantics decision about
production data, not a bug to patch.

Also found: `scripts/buildIssues.js:9` gives Trust Me Recipe a `min 1 / max 2` quota and will
allocate it, while the written data rule says manual-only. **Code/doc drift — worth an issue.**

## 6. What Airtable becomes

It does three jobs; the console replaces one.
- **Database** (every candidate, dedup keys, n8n's upsert target) — unaffected, keep.
- **Editor UI** — the job the console is meant to take over. **Not obsolete yet**: it remains
  the fallback while section coverage (Local Aroma / Recipe), failure recovery and lock
  semantics are open. Obsolescence is the goal, not the current state.
- **IssueItems as handoff contract** (what `generateBlurbs`/`pushToBeehiiv` read) — stays, but
  stops being a surface anyone edits. Replacing it buys nothing.

## 7. Effort-relative value (2026-08-20 read)

| Piece | Internship signal | Editor value | Repeatable | Effort |
|---|---|---|---|---|
| Swap + why-capture | 5 | 3 | 5 | Med |
| Read-only console shell | 2 | 3 | 5 | Low |
| Blurb / Beehiiv trigger | 1 | 5 | 3 | Low *(only post-hosting — see §4)* |
| Write-back + Lock semantics | 1 | 5 | 3 | Med-High |
| Hosting (#62) | 1 | 5 | 4 | Med |
| Ordering model (R6) | 5 | 5 | 1 | High |

**Reads:** the swap capture wins on two lenses and loses on none — and unlike the ranker it is
fully portable to another newsletter client, because it does not depend on Vaughan's labels.
Hosting is a **blocker, not a win** — spend the minimum. The ordering model is high-effort and
non-transferable, but deferrable: the console can run on the current viability score, and every
swap made while the ordering is imperfect is training data for the thing that replaces it.

## 8. Open decisions — none of these are settled

1. **What orders the list on day one?** `P(include)`, section probability, `Score_Final`, or a
   blend. None of them currently means "best event." **This blocks an honest product test —
   not the build.** Hosting, the read-only shell and the write path all proceed without it.
   (This is the distinction that reconciles §7's "the ranker is deferrable" with the fact that
   ordering is the first real decision: the *work* is deferrable, the *claim* is not.)
2. **What does `Lock` mean** once an editor can swap — per swap, per slot, or per submitted issue?
3. **Save immediately, or draft-then-submit?** Determines draft storage, pair derivation,
   and failure recovery. (Draft-then-submit is the strong default; not decided.)
4. **How many alternates (k)?** Measurable as recall@k against past issues — where did the
   editor's actual published pick rank? Upper bound is the curve's knee; lower bound is his
   attention budget, which cannot be derived, only observed.
5. **Do Local Aroma and Trust Me Recipe appear on the screen at all?**
6. **Does the editor need last-issue history** to avoid week-to-week repetition?

## 9. Deliberately not decided here

Design process is minimal by choice — the pattern is a **lineup builder** (fixed slots, ranked
bench, swap between). Copied, not invented. No design system, no wireframe phase; visual
polish comes from a component library, not a design phase.

The prototype exposed three real ranking failures in the live week — a duplicate festival
across two sources at Couples slots 2 and 4, three online-only classes in Golden Age, and a
flat Families section of near-identical library programmes. These were shown to the editor
deliberately. They are ranking and dedup problems, not console problems.

## 10. Delegation — Nate builds, Ariel owns correctness

**Captured 2026-08-27.** Not from a build session; a reasoning capture, same purpose as the rest
of this file. **Does not open R8** — the gate in the header still stands. What it settles is *who
builds it when it opens*, so the question is not re-argued then.

**Verdict: Nate builds the console. Ariel retains ownership of system correctness and product
semantics.** Not task-level supervision — requirements, boundaries and decision support, with
Nate owning implementation.

**Why, including the argument against.** The objection was that delegating weakens the
employment signal: NLAP already evidences production ownership, applied-ML judgement and
AI-assisted delivery, but is **weaker evidence of independent coding fluency**, and building the
console solo would close exactly that gap. It was rejected on the tradeoff — the editor wants
the console soon, and **delaying a user outcome to manufacture solo-coding evidence is the wrong
trade.** The gap gets closed by a bounded component instead (below), not by owning the whole build.

**Where it fits.** `R7 eligibility/sectioning → R6 ranking → allocator constraints → editor
console review/swaps → locked IssueItems → blurbs/Beehiiv`. Nate can prototype against **mock
data** before R6 finishes, then integrate once R6's output contract stabilizes. That is what makes
parallel work possible at all — but see the caveat below.

### The split

**Ariel owns — anything where a wrong choice changes a number or corrupts state:**
- editor workflow and success criteria
- the R7 / R6 / allocator → console data contract
- lock, rerun, stale-state, idempotency and failure-recovery rules (§5 is unresolved and is his)
- meaning and schema of editor override data (§3 — the prefer/defect split is the whole value)
- acceptance tests, production validation, prioritization
- measuring adoption and operational improvement

**Nate owns — verifiable by inspection:**
- frontend and backend implementation
- authentication
- deployment mechanics
- technical sequencing and implementation-level architecture

This is the same authorship rule the repo already runs on, applied to a second person.

### The bounded solo component

To keep direct technical evidence without delaying the main build, Ariel independently builds
**one** relevant component — preferred candidate: the **integrity/audit pipeline** connecting
console decisions to IssueItems and validating submissions. It is chosen because it sits on the
correctness boundary he already owns and is off Nate's critical path.

### Collaboration

Short written requirements · PRs · twice-weekly demos · explicit decision records · Ariel runs
final end-to-end validation. Post-launch measures: editor time, fallbacks, retries, swaps,
prevented invalid actions, and weeks operated without intervention.

### Honest framing

> Led the design and delivery of a production editor console for a 13k-subscriber newsletter;
> defined data contracts and state-safety requirements, coordinated implementation with a
> software engineer, and validated the end-to-end editorial workflow.

**Do not claim personal authorship of the full-stack console if Nate wrote it.** The claim only
holds if the console ships, is adopted, has measurable outcomes, and Ariel can defend the
system-level decisions.

### ⚠️ Not ready for an unrestricted handoff

Before Nate gets an open brief, these must exist: **V1 workflow · which sections appear ·
save/submit behaviour · lock semantics · failure recovery · data contracts · acceptance tests ·
Nate's decision authority.** Several are the §8 open decisions, still unsettled. A same-day
kickoff is therefore scoped to **mock data + V1 editor workflow only** — enough to start, not a
contract. **The R7 sealed readout remains the project gate** before R7 ordering can be presented
as trustworthy.

### Review findings on the split

> **Added by Claude, 2026-08-27 5:00 PM**, from a read-only pressure-test of §10 requested by
> Ariel. Findings only — no decisions taken, nothing above this subsection was altered.

1. **Provenance capture is unassigned, and it is the one thing that cannot be retrofitted.**
   §3 requires the choice set actually displayed, the original ranks, the model version, and
   whether the editor opened the link. Three of those are facts only the frontend knows, so the
   schema is Ariel's but the sole source is Nate's implementation. Uninstrumented, the pairs look
   fine and are permanently uninterpretable — you cannot reconstruct what was on screen weeks
   later. Same gap for the §3 feasibility-at-decision-time snapshot, which nobody is told to take.
2. **The write path leaks through the words "backend implementation."** Lock semantics are
   assigned to Ariel; the write path is not. A swap written directly to IssueItems is correct by
   inspection and still dies on the next allocation run (§5) — the defect lives in the interaction
   with a script Nate does not own, so it is invisible in review of his code alone. The brief needs
   to say the console writes through an Ariel-specified contract, not straight to the table.
3. **The mock-data claim is true for the shell, overstated for the swap path.** §5's two live
   options — persisted pins as allocator input vs. changing the rebuild contract — imply
   *different* mock shapes, so the mock cannot be neutral on §5. A mock carrying a scalar `score`
   also silently presumes ranking output is one number rather than per-section probabilities plus
   constraints, which §8 #1 has not decided.
4. **The bounded solo component sits on Nate's critical path, not off it.** "Connecting console
   decisions to IssueItems" *is* the write-back path, and "validating submissions" sits on the
   submit action (also unsettled, §8 #3). It is schedule-coupled too — it cannot start until a
   console exists to audit. Re-scoped read-only — an after-the-fact checker over IssueItems plus
   the swap log, enforcing the §5 and §3 rules, extending `scripts/integrityCheck.js` — it becomes
   genuinely off-path while staying on the correctness boundary.

**Two omissions from the not-ready list:** provenance/instrumentation (above), and **hosting (#62)
is assigned to nobody anywhere in §10** despite §4 calling it the long pole for the whole concept.

**One correction to the same-day-kickoff scoping:** the list names "save/submit behaviour" as
not-ready and then scopes kickoff to "V1 editor workflow," which contains it. §8 #3 genuinely
blocks a mock start — it determines the whole frontend state model, and §3 says only the final
submitted state yields pairs, so pair derivation has no anchor without it. The other §8 items
(#1, #2, #4, #6) are correctly non-blocking for a mock; #5 is cheap to change later.
