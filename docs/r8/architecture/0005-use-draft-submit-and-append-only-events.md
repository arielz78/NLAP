# ADR 0005: Use draft-then-submit with append-only interaction events

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decider:** Ariel (decision semantics)
- **Implementer:** Nate
- **Scope:** Editor workflow and console state model

## Context

The editor must be able to explore replacements, undo them, refresh or close the page, resume later,
and submit once. At the same time, R8 is intended to capture valid ranking-preference evidence.

The raw sequence of clicks is not itself the training label. If the editor moves from A to B and
then B to C, the final state can support C over the original A; it does not prove B over A or C over
B. An unchanged selection is not evidence that the editor compared it with every alternative. A
broken-listing replacement is a pipeline defect, not an editorial preference.

Overwriting one mutable decision record would destroy the information needed to distinguish these
cases. Writing every provisional selection to production would also expose incomplete work to the
downstream pipeline.

## Considered options

### Persist every swap as the current production selection

Makes Airtable mirror the screen immediately, but violates ADR 0004 and turns provisional actions
into downstream state.

### Store only the final submitted lineup

Is simple but loses the displayed choice set, ordering provenance, feasibility at decision time,
source-link consumption, undo history, and classification needed to interpret changes.

### Treat each swap as a preference pair

Produces more apparent labels but creates contradictory and false evidence from exploration,
undoes, broken listings, and infeasible choices.

### Mutable draft plus append-only raw events and immutable submission

Separates resume state, audit evidence, and the final decision boundary. Preference pairs can be
derived later under explicit rules.

## Decision

Use three distinct state forms:

1. **Draft:** one mutable, refresh-surviving representation of the editor's current selections,
   tied to an immutable issue build and carrying an integer revision.
2. **Interaction events:** append-only commands such as source-link opened, replacement proposed,
   replacement accepted, undo, and classification supplied or skipped. Each event has a stable
   client-generated ID so retries are idempotent.
3. **Submission:** an immutable snapshot of the final draft, its issue-build version, final draft
   revision, idempotency key, and provenance-completeness state.

For an acknowledged state-changing command, the server persists the interaction event and advances
the draft revision in one database transaction. Commands include their expected revision; a stale
command is rejected rather than merged silently.

Only a submitted final state may produce preference pairs. Pair derivation follows these rules:

- unchanged original selection: no pair;
- replace followed by undo to the original: no pair;
- A to B to C with final C: at most C over original A;
- final change marked broken listing: no ranking pair;
- unclassified, infeasible, or provenance-incomplete comparison: retained for audit, excluded from
  training.

Browser storage may cache an unsent command for recovery, but it is not authoritative once the
server acknowledges a revision.

## Consequences

### Positive

- Refreshes and accidental closes do not erase acknowledged work.
- The audit trail remains intact without pretending intermediate actions are labels.
- Submission creates an explicit, immutable boundary for reconciliation.
- Stable event and submission IDs make request retries safe.
- Training data can be regenerated when pair-qualification logic evolves without rewriting raw
  history.

### Negative

- The state model is more involved than saving one JSON document.
- The client must handle revision conflicts and failed command acknowledgements.
- Append-only event volume grows indefinitely, though expected R8 volume is small.
- Pair derivation becomes a separately tested process rather than an incidental click handler.

### Follow-up constraints

- Never update or delete raw interaction events to make derived data look cleaner.
- Record incomplete provenance explicitly; do not drop the event or block issue submission solely
  because it cannot train the ranker.
- Make saved, submitted, and applied states visually distinct.
- Test duplicate requests, refresh recovery, A-to-B-to-C, undo, and stale revision behavior before
  production use.

## References

- [R8 concept §3: preference-pair rules](../R8_Editor_Console_Concept.md)
- [R8 kickoff §5: interaction recording](../R8_Nate_Kickoff.md)
- [R8 scope §7: acceptance scenarios](../R8_Scope.md)
