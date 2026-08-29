# R8 Scope — The Editor Console

> ⚠️ **DRAFT, 2026-08-28 (rev 2, after external review). Deliberately thin.**
> Settled items are stated in one line. Everything unsettled is a `TODO(ariel):` fence
> carrying the actual question, its owner and its due date — **not** a paragraph of prose
> pretending to be a decision. Fences get filled as Sunday 08-30, CP1 and the CP2 demo
> answer them. Do not write speculative prose into this doc; a blank cannot drift, a
> hedged paragraph does.

**Owner:** Ariel · **Builder:** Nate · **Committed delivery:** Tuesday 2026-09-08
**Type: Release-working.** Decisions home in `docs/Decision_Log.md`; chronological recaps in
`Execution_Log.md`.

**Read order:** this doc → `docs/r8/R8_Editor_Console_Concept.md` (captured product reasoning,
2026-08-20; its §3 pair rules and §5 write trap are load-bearing) → `docs/Decision_Log.md` §87, §93, §94
→ `meetings/2026-07-19.md` §"The process, in his numbers" (the only unprompted account of the
editor's real workflow) → `meetings/2026-08-20.md` (concept acceptance) and `meetings/2026-08-27.md`
(hosting options).

---

## 0. Status Snapshot (2026-08-28)

Single source of truth for "where are we." `/start` reads this.

**R8 is OPEN**, ahead of the R6 gate described in `R8_Editor_Console_Concept.md`'s header. It was
opened by a delivery commitment made to the editor for 2026-09-08. That header is superseded; the
concept doc's *content* still governs.

**R7 and R8 are both open in parallel.** R7 is in closeout only — `docs/r7/R7_Closeout_Checklist.md`
holds the remaining dispositions and no R7 work is on the critical path. **R8 is the active release
for session purposes**; read this snapshot first, R7's second.

`TODO(ariel):` CLAUDE.md's Session Start section still names R7 as the sole active release and
routes `/start` to `docs/r7/R7_Scope.md`. Update it, or every session reopens R7 while the R8 clock
runs.

**Where things stand:** nothing built. The contract (W1) is being written. Nate has not started.
**Blocking everything:** TODO-0 below — whether the editor's Sunday task is expressible in this
console at all.

**NEXT:** Sunday 2026-08-30 workflow-completion session with the editor (TODO-0), then CP1.

---

## 1. Outcome

**One sentence:** by 2026-09-08 the editor can open one link, review a prebuilt issue for
Families, Couples and Golden Age, replace picks he disagrees with, and submit — and every
decision he submits survives to the Beehiiv export with its provenance recorded.

**User outcome.** Sunday: one URL, three sections of 5 picks plus a ranked bench, replace,
submit once, done. Local Aroma and Trust Me Recipe stay in Airtable as today.

**Why it's worth building.** A *qualifying* submitted swap can yield a preference pair — the model
ranked A above B, the editor chose B. Broken-listing swaps, unclassified swaps, undone swaps and
infeasible comparisons yield nothing (§8). That is training signal R6's ranker does not have and
cannot be reconstructed after the fact.

---

## 2. The calendar

Weekdays verified 2026-08-28. **Where a weekday and a date disagree anywhere else, the date wins.**

| Date | Day | What |
|---|---|---|
| 2026-08-30 | Sun | **Editor workflow-completion session (TODO-0).** |
| 2026-09-01 | Tue | **CP1** — contract final out, Nate's proposal back. |
| 2026-09-03 | Thu | **CP2** — survival demo. |
| 2026-09-05 | Sat | **CP3** — feature freeze; Ariel drives the full flow. |
| **2026-09-08** | **Tue** | **Committed delivery.** Built and rehearsable. |
| 09-11 – 09-12 | Fri–Sat | Ariel rehearses the full flow alone. |
| **2026-09-13** | **Sun** | **First real editor use.** |

Sept 9–12 is not slack — it is the rehearsal window that makes 09-13 survivable. Do not spend it.

**What 09-08 can claim:** built, hosted, a submission demonstrated to survive an allocator rerun
and still generate blurbs, provenance captured, a written fallback.
**What it cannot claim:** validated by the editor · unattended operation · editor operating solo ·
three solo weeks · models deployed to R2 · ordering validated as good · Mississauga portability.

---

## 3. Settled

One line each. **Ariel's decisions, all of them** — where a bracket cites reviews or code, that is
the *evidence* he decided on, not the authority. Agent consensus is evidence; it is not a decision.
Rationale for the two architectural calls homes in `Decision_Log`.

- **Three sections only** — Families, Couples, Golden Age. Local Aroma and Trust Me Recipe are
  out of the console entirely, not read-only. [Ariel, 08-28]
- **Draft-then-submit.** Only the final submitted state yields preference pairs. [Ariel, 08-28 — `TODO(ariel):` Decision_Log entry]
- **The console never writes to Airtable.** It records an append-only submission; Ariel runs a
  reconcile script that applies it. [Ariel, 08-28 — `TODO(ariel):` Decision_Log entry; see §4]
- **Reconcile order is apply → generate blurbs → lock**, and it must satisfy §6's failure
  invariant. Order alone is necessary, not sufficient. [Ariel, 08-28, on the code constraints in §6]
- **Ordering reaches the console through one adapter.** No scalar-score assumption anywhere.
  R6 drops into the adapter if it lands; the cutover is a separate decision (TODO-5). [Decision_Log §87]
- **Provenance is captured at interaction time or it does not exist.** [Concept §3]
- **Prefer / broken-listing is one dismissible tap, never a form.** Unclassified swaps are logged
  and excluded from training — never defaulted to "prefer". [Concept §3]
- **Nate selects the host.** He operates it, he picks it. [`meetings/2026-08-27.md` §5]
- **Beehiiv stays manual paste**, unchanged. [Concept §6]

---

## 4. The shape

```
Ariel        trigger ingestion + R7 scoring        (manual — see TODO-1)
  |
pipeline     allocator selects 5 picks per section  (buildIssues.js)
  |
Ariel        CHOICE-SET BUILDER: assemble the feasible bench per slot   <-- W9, does not exist
  |
Nate         console reads the built issue + bench, renders it
  |
editor       review, replace, undo, submit once
  |
Nate         submission recorded append-only with provenance — NO Airtable write
  |
Ariel        reconcile script: validate -> apply -> generateBlurbs -> lock
  |
Ariel        pushToBeehiiv, pasted by hand (unchanged)
```

The console is a review surface with no production authority. The reconcile script is the only
thing that writes, it is Ariel's, and it is where both silent-failure modes are closed.

---

## 5. Work packages and ownership

| # | Package | Owner | Notes |
|---|---|---|---|
| W1 | Write-and-state contract | **Ariel** | See §5b for what it must define. Draft 08-28, **final at CP1**. |
| W2 | Console: shell, layout, swap/undo, draft, interaction log | **Nate** | Starts 08-28 on fixtures. |
| W3 | Console hosting + deploy | **Nate** | **Day one, not last.** A hello-world deploy on 08-31 makes it a non-event. |
| W4 | Read layer against real scored data | **Nate** | Consumes W9's output. Needs the 09-02 snapshot. |
| W5 | Append-only submission + provenance capture | **Nate** | Frontend is the only source for choice-set, ranks and link-opens. |
| W6 | Reconcile script | **Ariel** | Authored alone. Extends the `integrityCheck.js` pattern. |
| W7 | Acceptance scenarios + fallback procedure | **Ariel** | |
| W8 | Pipeline hosting migration | **Nate** | `TODO-1` — in or out. |
| **W9** | **Choice-set / snapshot builder** | **Ariel** (semantics + fixtures) → Nate consumes | **NEW, and on the critical path.** See below. |

**W9 exists because nothing produces a bench.** `buildIssues.js:372` exports `buildIssues`, which
returns `[{IssueDate, ItemID, Section, Slot}]` — **selected picks only, no alternates.** Something
must assemble the feasible alternate set per slot while honouring date-window eligibility,
recurring-series collapse, one-venue-per-section, cross-issue assignment, locked slots and
section-specific ordering. Those rules live in `buildIssues.js` and **any divergence is a silent
defect**, so the semantics are Ariel's. Without W9, Nate either invents product logic or builds
against a fixture that can never become production data.

`TODO(ariel):` does W9 reuse `buildIssues.js`'s constraint functions directly, or restate them?
Reuse is safer and is the default. Due CP1.

### 5b. What W1 must define

Not implementation — required behaviour. Three areas, all Ariel's semantics:

1. **The write contract** — what a submit applies, in what order, and what `Lock` means afterwards (TODO-2).
2. **The failure invariant** — §6's rule for what a partially-applied reconcile guarantees.
3. **The submission→reconcile handoff** — the most dangerous boundary in the system, because Nate
   owns one side and Ariel the other, and neither spec currently covers it. It must guarantee: a
   successful submission is durable; it has an immutable identifier; it names the built-issue
   version it belongs to; a console restart or redeploy cannot lose it; Ariel cannot reconcile the
   wrong one; and reconcile records that a submission has been applied. *How* it is exposed —
   API, file, table — is Nate's.

### 5c. Decision rights

Ariel decides anything that changes a number, product meaning, production state, or what becomes
training evidence. Nate decides stack, architecture, state management, data layer, hosting
mechanics, sequencing, estimates, task breakdown. Nate *proposes* and Ariel *accepts* the auth
mechanism and the provenance instrumentation.

**Nate escalates only when** a choice would write production state, change an editorial rule,
change what becomes a training pair, or slip the delivery date. Nothing else. Ariel does not
review his task list.

### 5d. Checkpoints — three, no more

| | Date | Day | What |
|---|---|---|---|
| **CP1** | 09-01 | Tue | Ariel hands the **final** contract; Nate hands back **his own** architecture, sequence, estimates and risks. Both directions, one meeting. |
| **CP2** | 09-03 | Thu | **Survival demo.** Swap → submit → reconcile → rerun the allocator → the swap is still there → blurbs generate for it. This demo is the specification. |
| **CP3** | 09-05 | Sat | Feature freeze + Ariel drives the full flow as the editor. |

**What Nate has before CP1** (so W2/W3/W5 are not blocked by W1 being unfinished): the fixture
shape, the three-section layout, swap/undo, draft persistence, the interaction-event list, and the
prohibition on production writes. **What can still move at CP1:** lock semantics, the reconcile
handoff, and anything TODO-0 changes.

**CP1 is a scope gate, not a status meeting.** The delivery date was committed before Nate
estimated; that commitment is not evidence the scope fits.

`TODO(ariel):` if Nate's CP1 estimate does not fit the remaining capacity, what drops
automatically — in order? Write the list before CP1, not during it.
*Answer:* ______

---

## 6. The write path: two failure modes and one invariant

The first is silent. The second is loud but blocking. Verified against the files 2026-08-28.

1. **An unlocked swap is deleted on the next allocation run.**
   `connectAirtable.js:218` `deleteUnlockedIssueItems()` deletes every unlocked IssueItem on
   current and future issues and rebuilds from the model's picks. Blast radius is current +
   future only; `fetchIssues()` drops `date < today`, so published history is safe.
2. **…but locking it first blocks the export.**
   `generateBlurbs.js:270` filters `!i.lock` — it *skips locked rows*, so a row locked before copy
   is generated never gets `DisplayTitle`/`Description`/`CTA`. `pushToBeehiiv.js:209` then filters
   for any item missing those fields and **throws** before rendering, naming the section and slot.
   The export cannot run until it is unpicked.
   ⚠️ **Corrected 2026-08-28 after review.** An earlier draft claimed this rendered a blank bullet
   silently — `pushToBeehiiv.js:113–117` does default those fields to `''` and `renderSlot()` does
   emit the bullet unconditionally, but the `main()` guard 90 lines away makes that path
   unreachable. Loud, not silent. **The architecture is unchanged:** failure 1 alone is silent and
   destructive and independently requires both the no-console-writes rule and the fixed order.

   **The genuinely silent variant is different and is not yet covered.** If reconcile re-points an
   existing row's `Candidate` link instead of creating a new row, the copy fields are non-empty but
   *stale* — the guard passes and the export renders the previous event's blurb under the new
   event's URL. `TODO(ariel):` the 09-01 write contract must invalidate copy on any re-pointed row.

`apply → generate blurbs → lock` is the only order that avoids both. **But an order is not a safe
operation.** If reconcile dies after apply and before lock, the editor's choices sit in Airtable
*unlocked*, waiting for failure 1 — and the allocator's rebuild looks entirely plausible.

**Required invariant (W1 must state which):** either
**(a)** a failed reconcile can be rerun against the same submission and deterministically converges
to the submitted state with no duplicate effects; or
**(b)** a failed reconcile restores the pre-reconcile IssueItems before reporting failure.
Mechanism is Nate's. The guarantee is Ariel's.

**This also splits the fallback in two.** §7 TODO-7's "Airtable stays untouched, he finishes there"
is true *before* reconcile starts and **false after partial application.** Both regimes need a
written procedure.

**Also:** `pushToBeehiiv.js:106` selects rows by `SEARCH(TARGET_DATE, {Name})`. Any row whose
`Name` does not reproduce `connectAirtable.js`'s exact string vanishes silently from the export.

---

## 7. Open decisions

Each is a real question with an owner and a date. Fill in place; do not answer in prose elsewhere.

**`TODO(ariel):` TODO-0 — Can the editor complete an issue in a replace-from-bench console at all?**
Owner: **editor validates**. Due: **Sun 2026-08-30.** ⚠️ **This blocks everything — it is the
premise the whole scope rests on.**

The 08-20 meeting validated *prebuilt over browse* ("a built-and-editable issue is better than a
ranked list he picks from"). It did **not** validate that every operation he needs is expressible
as replacing one pick with one bench item.

Method: **watch him build a real issue and note every point where he would have to leave the
console.** Not "what do you want" — he cannot spec a UI, and asking produces feature requests
rather than task requirements. The test is completion, not preference.

First question, because it is the one that could make the console unusable:
**are sponsorship placements live yet?** `meetings/2026-07-19.md` records forward intent —
*"~2 of 5 events to be sponsorships… post-scoring slot swap."* If ~40% of slots are filled from
outside the candidate pool and the console can only offer bench items, **he cannot finish an issue
in it.** If that intent is not yet in practice, the question defers.

Lower-priority, non-blocking observations from the same notes: he has split two similar events
across sections (*"one with alcohol into couples and the other one in families"*) and balances
cities across the whole issue. Both are believed to be *reasons* for a swap rather than operations
the UI must add — confirm, do not assume.
*Answer:* ______

**`TODO(ariel):` TODO-1 — Is the pipeline hosted for 09-08, or does Ariel keep triggering it?**
Owner: Ariel. Due: CP1 (09-01).
*Against:* the migration is the biggest available schedule risk — #111 rewrote all 51 nodes and
reported success, and the working BiblioCommons fix exists only in the running container, not in
`workflows/NLAP R1.json`. 09-08 explicitly cannot claim unattended operation either way.
*For:* **the editor asked for it directly** — 08-20, *"ingestion should run on a schedule by
default, with a manual run-it-now available."* Hosting later is also structurally better: a
scheduled Sunday run *deletes* the run-ingestion button rather than making him press it.
*Safe to defer because* the button is additive — it changes nothing Nate builds now.
*Answer:* ______

**`TODO(ariel):` TODO-2 — What does `Lock` mean after a submit?**
Owner: Ariel. Due: CP1 (part of W1).
*Lean:* lock the whole submitted issue, after blurbs generate. Not per-swap — that degrades the
field's meaning. Must satisfy §6's invariant.
*Answer:* ______

**`TODO(ariel):` TODO-3 — Bench size (k), and what a card shows.**
Owner: Ariel proposes / **editor validates**. Due: Sun 08-30.
*Lean:* k=5. Ask him what he needs to judge an event in three seconds. Secondary to TODO-0 — do not
let it eat that session.
*Answer:* ______

**`TODO(ariel):` TODO-4 — What orders the bench on day one?**
Owner: Ariel. Due: 09-02, before the scoring run.
*Lean:* `P(include) × P(section)` per section, labelled "suggested" — never "best". §87/§93 forbid
the stronger claim.
*Answer:* ______

**`TODO(ariel):` TODO-5 — If R6 lands ~09-04, does it cut over before 09-08?**
Owner: Ariel. Due: 09-06.
*Lean:* **no.** Build the adapter so it can, then exercise that seam after R8. Changing the
editor's ordering days before delivery — before he has ever used the console — means a bad reaction
on 09-13 cannot be attributed to the tool or the ranking. That is a measurement problem, not only a
risk one.
*Answer:* ______

**`TODO(ariel):` TODO-6 — Do we tell the editor his source-link opens are recorded?**
Owner: Ariel. Due: Sun 08-30.
*Lean:* yes, plainly. §93 makes link consumption the confound that decides whether a swap is
ranker evidence at all; silent tracking is the wrong precedent with a client.
*Answer:* ______

**`TODO(ariel):` TODO-7 — The two fallback procedures.**
Owner: Ariel. Due: 09-05.
*Lean:* (a) *before reconcile* — Airtable stays live and untouched, he finishes there as today;
(b) *after partial reconcile* — per §6's chosen invariant. Written down, not improvised. No
preference pairs are inferred from a fallback session.
*Answer:* ______

---

## 8. Acceptance

Observable scenarios. **No numeric targets** — the evidence supports none, and none should be invented.

1. Normal review and submit; Airtable matches what he saw; blurbs and export run clean.
2. Replace then undo → final state equals original → **no pair derived**.
3. A→B→C yields exactly one pair (C over A), not two.
4. A swap tapped "broken listing" — and any *unclassified* swap — never enters the trainable set.
5. **Allocator rerun after reconcile:** every submitted slot intact **and** still blurb-generable.
6. Stale view at submit → refuses, explains, offers reload. Never overwrites.
7. Interrupted **submit**, retried → no duplicate rows, no duplicate events.
8. **Interrupted reconcile, rerun → correct final Airtable state, correct blurbs, correct locks,
   no duplicate effects.** Tested at each of the four failure points: before apply, mid-apply,
   after apply / before blurbs, after blurbs / before lock.
9. **Reconcile cannot be run against the wrong submission**, and an already-applied submission is
   either refused or converges (per §6's invariant).
10. A pre-locked slot is visibly immutable and unchanged.
11. Opening a source link is recorded and returns him to his place with the draft intact.
12. Airtable unavailable → says so plainly, draft not lost, nothing half-written.
13. Both fallback procedures work and are documented before 09-13.
14. **One real Sunday (09-13), observed not surveyed:** did he finish, where did he stall, did he
    open Airtable anyway, what did he ask for that wasn't there.

---

## 9. Explicitly out

**R6 ranking is not a delivery dependency** — the adapter ships, the cutover is TODO-5 · Local Aroma
and Trust Me Recipe in any form · blurbs or Beehiiv triggered from the console · the Decision_Log
§94 model-deployment tranche · search, filters, history, drag-and-drop · visible model scores or
explanations · any reason taxonomy beyond the two-way tap · real accounts (one link, one password) ·
mobile · dashboards · notifications · three-solo-weeks proof · Mississauga portability.

**Deferred items become scheduled gates, not reopened scope.**

---

## 10. Risks

| Risk | Read |
|---|---|
| **TODO-0 comes back "no"** | The interaction model is wrong and Nate is building the wrong app. Cheapest possible discovery is 08-30; the alternative is finding out on 09-13. This is why TODO-0 is first. |
| Candidate supply is thin on 09-13 | Three sources at zero (#128), Facebook intake stale (#114). Thin sections would read as a console failure and would not be one. **Check the pool on 09-02 and again 09-11.** |
| `workflows/NLAP R1.json` divergence | The repo copy 403s on BiblioCommons; the fix lives only in the running container. **Do not import that file before 09-13.** |
| Trust Me Recipe code/doc drift | `buildIssues.js:9` gives it `min 1 / max 2` while the data rule says manual-only. File an issue; **do not change the allocator this release** — it would alter issue composition during the validation window. |
| Nothing on disk records the 09-08 commitment | `meetings/2026-08-27.md` Decisions section is entirely `TODO(ariel)`. Write down what was actually promised, and to whom. |
| A hand-built console breaks the config-only promise | Roadmap addendum #5: Mississauga onboarding assumes no code changes. Worth knowing now, not in October. |
| Commitment preceded estimate | CP1's scope gate (§5d) is the only control. Without a pre-written drop list it will not fire. |

---

## 11. Post-R8 gates

Named, owned, and explicitly not part of 09-08:

- **PROVEN** — three consecutive solo editor Sundays. Earliest 09-13 / 09-20 / 09-27, and only
  once the manual-trigger dependency is gone.
- **HOSTED** — unattended pipeline scheduling (#62), if TODO-1 lands "not hosted".
- **RANKED** — R6 cutover, if TODO-5 lands "not before 09-08".
- **PORTABLE** — Mississauga config-only onboarding.
- The Decision_Log §94 model-deployment tranche.
