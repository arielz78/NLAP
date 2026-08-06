Mid-session orientation. Fires when the thread has spawned subtopics and you can
no longer say what the original question was or whether the work in front of you
is on the critical path.

This is **not** a summary. A summary tells you what happened; this tells you what
of it was necessary. Read the transcript back to the last point where a clear
objective was stated, then produce the six sections below **in order**. Read-only:
print and stop. No file edits, no issue filing, no commits. "Let me just record
this properly" is itself the drag this command exists to stop.

**All six headings always appear.** When a section has nothing to report, print the
heading with a one-line statement to that effect — never omit it. A missing heading
reads as an oversight; an explicit "nothing here" is a finding. Under heavy sprawl,
compress sections 1–4 to their shortest honest form; do not drop them.

---

## 1. The question you started on

Restate it in one or two sentences, in its **narrowest defensible form** — the
version that could actually be answered and closed, not the version it grew into.

Pull it from where the objective was last stated plainly, not from the most recent
message. The most recent message is usually already three tangents deep, and
restating from there reproduces the drift instead of exposing it.

If the original question was never stated cleanly, say so — that is itself the
finding, and it explains the sprawl.

## 2. The drift

Name the pattern that got us here, concretely, in a short paragraph. Not "we
explored several areas." Say what actually happened, e.g.:

> A backfill check turned into a six-arm experimental design. Each discovered
> caveat was promoted to a prerequisite rather than recorded, so the entry
> condition for answering the original question kept receding.

Then trace the chain that produced it, using the actual steps from this session:

```text
Implement feature
→ discover caveat
→ promote caveat to blocker
→ design broader experiment
→ discover another caveat
```

Be honest about who drove it. If Claude expanded the scope, say Claude expanded
the scope. If the user chased a tangent, say that. A diagnosis that blames nobody
describes nothing.

**If there was no drift, print exactly that** — "No drift — all subtopics were
load-bearing." — and move on. Keep the heading. Manufacturing a drift narrative to
fill the template is worse than reporting a clean session.

## 3. What answering it actually requires

The minimal ordered path to close the original question. Usually 3–6 steps. This
is the control against which everything in section 4 gets measured — write it
before classifying anything, or the classification will just ratify whatever is
already in flight.

State it as a numbered list of concrete actions, not areas of concern.

## 4. The tangents, classified

Every subtopic this stretch spawned, as a table. **Each row carries a reason, not
just a label** — the reason is the whole point, because it is what stops the same
caveat from being re-promoted an hour later.

| Tangent | Classification | Why |
|---|---|---|
| … | Block / Block *X* only / Fix in the same pass / Defer | one or two sentences of mechanism |

Classify with the **five-part blocker test**. A caveat blocks only if all five have
strong answers:

1. What exact output, decision, or state would be wrong?
2. What concrete mechanism makes it wrong?
3. Would the wrong result still look plausible?
4. Would an already-planned downstream check catch it before it does harm?
5. What is the smallest correction required right now?

The compressed form:

```text
Silent + plausible + consequential + not caught later   = BLOCK
Loud, reversible, detectable, speculative, suboptimal   = DEFER
```

Two refinements that matter more than the binary:

- **Scope the block.** Most real blockers block one specific step, not the whole
  path — "blocks deployment, not offline experimentation" is a different and far
  cheaper finding than "blocks." Say which step.
- **Cheap deterministic fixes are not blockers.** If the correction is a known,
  narrow, mechanical rule and it is cheaper to apply than to reason about, classify
  it `Fix in the same pass` and move on — but **do not perform it during
  `/zoom-out`**. This command classifies; the next pass executes. Do not spend a
  classification debate on it either.

Missing any one of the five makes it DEFER. Record it in the table and continue.

## 5. The boundary

An explicit in/out list for the rest of this work. Both halves, stated as
commitments — the out-list is the load-bearing half, because an unstated
exclusion gets silently re-included the next time it comes up.

**In scope:** the steps from section 3, plus anything section 4 proved blocking.

**Out of scope:** everything else, named individually. Not "other optimizations" —
name them, e.g. "no uncapped arm, no factorial experiment, no search for the
globally optimal text recipe."

Then state the **reopening rule** in one line: a new caveat does not reopen this
work unless it passes the five-part proof against the next action specifically.

If a pass/fail rule has to be frozen before results are seen, say so here and flag
it as the one thing that must be settled before running. Choosing it after seeing
the numbers is not a judgment call, it is a different experiment.

## 6. → The single next action

**One bolded line.** The one thing to do next, picked by what unblocks the most —
not a ranked list, not "start with X and then Y."

Add half a sentence on what it unblocks.

If the next action is a **decision rather than a task**, say so explicitly: "this is
a call, not a build." A decision misfiled as a task is how a session ends with
docs updated and the critical path unmoved.

---

## Constraints

- **Read-only.** Print and stop. Never edit files, file issues, commit, or start
  the work you just identified. If the next action is obvious and cheap, still
  stop — the user decides whether to run it.
- **Do not propose new work.** This command reclassifies work that already exists.
  Inventing a seventh consideration is the exact failure it is meant to catch.
- **Do not soften the drift diagnosis.** If most of the session was off the
  critical path, say that in a sentence. The honest read is the deliverable.
- **Length: fits on one screen.** If the classification table needs more than about
  eight rows, the session sprawled further than a table can usefully hold. Say so,
  compress sections 1–4 hard — the table becomes grouped themes rather than
  individual tangents — and put the remaining weight in sections 5 and 6. All six
  headings still appear.
