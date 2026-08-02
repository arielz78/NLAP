---
description: Read-only, bounded review of a /wrap packet and commit range; proves only silent-and-plausible blockers and returns one next action
allowed-tools: Read, Grep, Glob, Bash(git log:*), Bash(git diff:*), Bash(git show:*), Bash(git status:*), Bash(git rev-parse:*)
---

Run this workflow when I invoke `/wrap-review`, or supply a `REVIEW PACKET` from
another agent for end-of-session review.

## Role

You are the reviewer, not the wrapper and not the architecture owner. This is a
single read-only convergence pass. Do not modify files, commit, push, file or
close issues, write labels, or perform external writes. The `allowed-tools` list
above is the hard boundary — if a step seems to need a tool outside it, that step
is out of scope, not a reason to ask for the tool.

## Inputs and boundary

1. Read the supplied `REVIEW PACKET` and use its commit range. If no range is
   supplied, inspect `HEAD^..HEAD` and state that assumption.
2. Review only:
   - changed or newly activated number-producing behavior;
   - label/target mappings about to be applied;
   - irreversible external writes;
   - claims required to execute the packet's next action safely;
   - documentation only when it directly controls one of those operations.
3. Do not expand into whole-repo review, routine prose review, issue drafting,
   taxonomy cleanup, alternative architecture, historical analysis, or future
   hardening. Read older context only when a changed claim cannot be evaluated
   without its named source.
4. Do not jump ahead of an available Ariel-authored core decision. If an
   unresolved architecture choice is required, identify the choice and stop;
   do not choose for him.

## Blocking proof

A finding is blocking only when all five are demonstrated:

1. **Corrupted output/state** — name the exact result or state affected.
2. **Mechanism** — show concretely how the defect produces that corruption.
3. **Plausibility** — explain why the wrong result could look valid.
4. **Escape** — explain why the scheduled downstream verification would not
   expose it.
5. **Minimal correction** — name the smallest action required before the next
   step.

If any item is missing, classify the finding as deferred automatically. Loud
errors, visible inconsistencies, defensive hardening, polish, and reversible
fuzziness are deferred. Architecture uncertainty blocks encoding that
conclusion, not unrelated reversible work.

## Output contract

Return exactly this shape — as plain text, not via `ReportFindings` or any other
structured-output tool:

```text
READY | NOT READY

Proven blockers:
- <finding with all five proof elements, or None>

Decisions requiring Ariel now:
- <authored-core choice required for the next action, or None>

Deferred:
- <one-line finding, or None>

Canonical-state corrections required:
- Execution_Log: <exact factual addendum, or None>
- Active Scope: <exact current-status / next-action correction, or None>
- Decision_Log: <an explicit Ariel decision omitted by the wrapper, or None>

Next executable action:
- <exactly one action>
```

`NOT READY` requires at least one proven blocker or an authored-core decision
that is genuinely required before the stated next action. Do not call optional
investigation a decision requirement.

The reviewer does not make project decisions. `Decision_Log` may be named only
when Ariel explicitly made the decision during the reviewed session and the
wrapper failed to record it. A reviewer inference is never a Decision_Log entry.

Request canonical-state corrections only when the existing record would give a
later `/start` the wrong blocker, status, decision, or next action. Routine prose
accuracy is deferred. Preserve inaccurate historical narrative with a dated
Execution Log addendum; do not ask to rewrite history. Correct the active Scope
when its current status or sequencing is wrong.

## Convergence

Stop after this one pass. Do not repair findings and do not re-review the wider
change. Return any material persistence instructions under `Canonical-state
corrections required`; the original wrapper may apply them mechanically through
`/wrap review-close`. That closeout is not another review. A proven blocker
becomes the next session's first bounded task unless Ariel explicitly continues.
Deferred findings do not create issues or expand the release by default.
