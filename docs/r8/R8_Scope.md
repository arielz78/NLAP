# R8 Scope — The Editor Console

**Owner:** Ariel · **Builder:** Nate · **Committed delivery:** 2026-09-08

**Type: Release-working.** Decisions home in `docs/Decision_Log.md`. Session recaps in
`logs/R8_Log.md`. Everything Nate-facing — scope of his build, decision rights, checkpoints —
homes in `docs/r8/R8_Nate_Kickoff.md`. This doc does not restate any of it.

**Read order:** this doc → `docs/r8/R8_Editor_Console_Concept.md` (§3 pair rules, §5 write trap) →
`docs/Decision_Log.md` §87, §93, §94, §95, §96.

---

## 0. Status (2026-09-01)

R8 is open ahead of the R6 gate, on a delivery commitment to the editor. R7 is closeout-only and
off the critical path.

Nothing is built. Nate has not started and has not confirmed a start date.

**TODO-0 is resolved: the premise holds.** Sponsored events go into a separate section, so no
console slot is ever filled from outside the candidate pool.

**Next:** CP1 — the write contract to Nate, and the kickoff-brief corrections it now needs.

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

**Required invariant, W1 must state which:**
**(a)** a failed reconcile reruns against the same submission and deterministically converges, with
no duplicate effects; or
**(b)** a failed reconcile restores the pre-reconcile IssueItems before reporting failure.

Mechanism is Nate's. The guarantee is Ariel's.

Also: `pushToBeehiiv.js:106` selects rows by `SEARCH(TARGET_DATE, {Name})`. Any row whose `Name`
does not reproduce `connectAirtable.js`'s exact string vanishes silently from the export.

---

## 5. Work packages

| # | Package | Owner |
|---|---|---|
| W1 | Write-and-state contract | **Ariel** — due CP1 |
| W2 | Console: shell, layout, swap/undo, draft, interaction log | Nate |
| W3 | Console hosting + deploy — **day one, not last** | Nate |
| W4 | Read layer against real scored data | Nate |
| W5 | Append-only submission + provenance capture | Nate |
| W6 | Reconcile script | **Ariel** |
| W7 | Acceptance scenarios + fallback procedures | **Ariel** |
| W8 | Pipeline hosting migration | Nate — TODO-1 |
| **W9** | **Assembly / choice-set contract** | **Ariel** (semantics + fixtures) |

**W1 must define three things**, all Ariel's semantics: what a submit applies and in what order,
including what `Lock` means afterwards (TODO-2); §4's failure invariant; and the
submission→reconcile handoff. The handoff is the most dangerous boundary in the system — Nate owns
one side, Ariel the other, and neither spec covers it. It must guarantee that a successful
submission is durable, carries an immutable identifier, names the built-issue version it belongs
to, survives a console restart, cannot be reconciled against the wrong one, and is recorded as
applied. How it is exposed is Nate's.

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
*Answer:* ______

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
*Answer:* ______

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

---

## 8. Explicitly out

R6 ranking as a delivery dependency (the adapter ships; cutover is TODO-5) · Local Aroma and Trust
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

- **PROVEN** — three consecutive solo editor Sundays, once the manual-trigger dependency is gone.
- **HOSTED** — unattended pipeline scheduling (#62), if TODO-1 lands "not hosted".
- **RANKED** — R6 cutover, if TODO-5 lands "not before delivery".
- **PORTABLE** — Mississauga config-only onboarding.
- The Decision_Log §94 model-deployment tranche.
