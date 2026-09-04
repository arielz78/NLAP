# ADR 0007: Isolate alternative ordering behind an adapter

- **Status:** Accepted
- **Date:** 2026-09-04
- **Deciders:** Ariel (meaning of ranking), Nate (application boundary)
- **Scope:** Alternative-order consumption

## Context

R8 must ship before the final R6 ranking model is guaranteed to exist. The interim ordering uses R7
viability and section outputs, which are decision-support signals rather than a defensible measure
of the universally "best" event. The current ranking input can contain two values per event, not one
scalar score.

If components read model-specific fields or invent a generic `score`, replacing the ordering model
would require UI, API, persistence, and test changes. It would also encourage the interface to expose
or over-interpret numbers whose meaning is not stable.

## Considered options

### Standardize every model on a scalar `score`

Creates a convenient interface but discards model-specific structure and falsely implies that all
current and future ordering systems produce the same quantity.

### Let the frontend sort raw model fields

Couples presentation to one scoring formula, leaks model semantics into the UI, and makes provenance
and cutover behavior difficult to audit.

### Give each model a separate consumer path

Preserves its native output but spreads conditional behavior through the application and makes a
cutover larger than necessary.

### Use one ordering adapter

Contains model-specific interpretation upstream and gives the console an ordered list plus opaque,
versioned provenance.

## Decision

All alternative ordering reaches the assembly contract through one adapter interface.

Conceptually, the adapter consumes a section-aware candidate pool and returns:

- candidate identities in display order;
- adapter identity and version;
- source model/recipe identity;
- input and output hashes or equivalent reproducibility metadata;
- opaque model-specific signals retained for audit but not required by the UI.

The console consumes the order and provenance. It does not sort candidates, depend on a scalar
`score`, or display model scores or explanations.

The interim R7-based ordering and a future R6 ranker implement the same adapter boundary. A future
cutover changes the selected adapter and records a new issue-build version; it does not rewrite old
builds or submissions.

The product labels the list as "suggested" or uses no quality claim. It must not describe the order
as "best" until separate evidence authorizes that interpretation.

## Consequences

### Positive

- R8 can ship without making R6 a delivery dependency.
- Ranking changes do not require a frontend schema migration.
- Historical decisions retain the exact ordering provenance under which they were made.
- Model-specific signals remain available for analysis without anchoring the editor.
- Old and new ordering implementations can be compared on identical inputs.

### Negative

- The adapter is an additional interface and must be versioned and tested.
- Opaque signals are less convenient for ad hoc UI features.
- A poorly designed adapter could conceal information later needed for audit, so provenance cannot
  be reduced to only ordered IDs.

### Follow-up constraints

- Do not name a persisted field simply `score` unless a later ADR defines one stable cross-model
  meaning.
- R6 cutover timing and the initial ordering formula remain product decisions outside this ADR.
- Record the adapter version on every issue build and relevant interaction event.
- Run any future planner or ordering implementation read-only and diff its output before cutover.

## References

- [R8 kickoff §6: ordering](../R8_Nate_Kickoff.md)
- [R8 scope TODO-4 and TODO-5](../R8_Scope.md)
- [Decision Log §87 and §95](../../Decision_Log.md)
