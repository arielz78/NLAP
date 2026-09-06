# ADR 0004: Keep the console outside the Airtable write path

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decider:** Ariel (product and production-state semantics)
- **Implementer:** Nate
- **Scope:** Console-to-production boundary

## Context

The console changes the editor's proposed issue but cannot safely apply those changes as ordinary
IssueItem updates.

The current allocator deletes every unlocked IssueItem for current and future issues and rebuilds
them. An unlocked console swap can therefore disappear on a later allocation run while the resulting
issue still looks plausible. Locking immediately fails in the opposite direction: copy generation
skips locked rows, so a newly locked selection may never receive its blurb and the export is blocked.
Repointing an existing IssueItem without invalidating copied fields creates a third, silent mismatch
between the new event and the old copy.

These risks belong to the existing production write contract, not to presentation. The person or
component implementing the review screen should not need Airtable mutation authority to solve them.

## Considered options

### Write each swap directly to IssueItems

Provides immediate production state but exposes provisional work, cannot atomically preserve the
decision event and IssueItem mutation, and allows later allocation to erase the change.

### Lock every swapped row immediately

Prevents allocator deletion but changes the meaning of `Lock`, obstructs subsequent editing, and can
cause the copy generator to skip the row.

### Modify Candidate scores, status, or section fields and rerun allocation

Pollutes global candidate truth with one issue's contextual preference, affects future issues, and
destroys clean preference provenance.

### Record a complete submission and reconcile it through a controlled writer

Keeps draft work out of production, centralizes validation and recovery, and gives the write sequence
to the component that owns Airtable semantics. It adds an explicit handoff but contains the dangerous
authority.

## Decision

The editor console performs no Airtable writes.

For V1, the console consumes a versioned issue bundle produced by the upstream assembly boundary,
so its normal editor request path does not require Airtable access. It records drafts, interaction
events, and a final submission in console-owned persistence.

An operator-run reconciliation script is the only component that translates an accepted submission
into Airtable changes. Its required sequence is:

1. Verify the immutable submission and the issue-build version it names.
2. Revalidate the complete final issue.
3. Apply the selected Candidates and invalidate candidate-derived copy on changed rows.
4. Generate blurbs.
5. Lock according to the still-to-be-settled lock policy.
6. Record an application receipt against the submission.

The console exposes the immutable submission through a machine-authenticated API. It never receives
the Airtable write credential.

This ADR records the authority boundary. It does not settle whether reconciliation guarantees
deterministic convergence on retry or restores the previous state after failure; W1 must choose one
before production use.

## Consequences

### Positive

- A frontend or console-backend defect cannot directly corrupt production newsletter tables.
- Provisional changes are not visible to copy generation or export.
- Production validation, copy invalidation, blurb generation, and lock ordering remain centralized.
- The final submission is auditable independently from its Airtable application.
- The editor can fall back to Airtable before reconciliation because production remains untouched.

### Negative

- Submission does not immediately mean Airtable has changed.
- The system has an additional handoff and an operator-run step.
- Console and production state can diverge until reconciliation completes.
- The reconciliation API, idempotency behavior, recovery rule, and fallback procedure become
  release-critical contracts.

### Follow-up constraints

- The UI must distinguish `submitted` from `applied to production`.
- A submission must be durable, immutably identified, version-bound, and impossible to apply to a
  different issue build.
- Do not infer training pairs from a fallback session completed directly in Airtable.
- Supersede this ADR explicitly if the console is ever granted production write authority.

## References

- [R8 scope §4: write path](../R8_Scope.md)
- [R8 kickoff §4](../R8_Nate_Kickoff.md)
- [Decision Log §96](../../Decision_Log.md)
