# ADR 0006: Consume a versioned assembly contract

- **Status:** Accepted
- **Date:** 2026-09-04
- **Deciders:** Ariel (assembly semantics), Nate (consumer architecture)
- **Scope:** Pipeline-to-console read boundary

## Context

The current allocator returns selected assignments only. It does not return the section-level
alternatives or contextual replacement assessments the console needs. Those assessments are not a
simple property of an alternative: the same event may be clean against one selected event, require
an editorial override against another, or be unavailable because the other four selected events
remain fixed.

The relevant rules include date eligibility, section membership, recurring-series collapse,
one-venue-per-section constraints, cross-issue assignment, and locks. Reimplementing them in the UI
would create a second planner whose plausible output could diverge silently from production.

The console also needs a stable input that can be saved with drafts and submissions. Reading a live
mixture of Airtable records and model artifacts on each page load would make it impossible to prove
which issue and alternatives the editor actually reviewed.

## Considered options

### Let the console query raw Airtable and model outputs

Avoids an explicit assembly step but couples the app to multiple schemas, requires it to join and
interpret operational state, and prevents an immutable view of what was presented.

### Reproduce allocator constraints in the console

Makes interactive filtering easy but creates two independently changing implementations of
production rules. Divergence would be difficult to notice because both results could look valid.

### Supply selected events and a flat ranked pool only

Leaves replacement validity to the UI and cannot express candidate-to-selection contextual results.

### Produce a versioned assembly bundle upstream

Keeps product semantics with the existing planner boundary and gives the console a deterministic,
auditable input document.

## Decision

Introduce one versioned assembly contract between the pipeline and the console.

For each issue, the contract supplies:

- a stable issue identity, issue date, build identity, creation time, and contract version;
- the collective five selected events for each included section;
- one ordered section-level alternative list;
- stable candidate, recurring-series, and occurrence identities plus display fields;
- contextual replacement assessments for an alternative proposed against a selected event;
- assessment result `clean`, `override`, or `unavailable`, with a machine-readable and displayable
  reason;
- ordering/model provenance and input hashes sufficient to identify how the list was produced;
- lock and other state required to render immutable selections correctly.

The console treats the supplied selection and assessment semantics as authoritative. It does not
recompute allocator rules. When a draft changes, it uses the assessment corresponding to the
proposed alternative and currently selected event and records that assessment in the interaction
event.

Each published bundle is immutable. A newly assembled issue receives a new build identity rather
than modifying a bundle already used by an editor. Drafts and submissions name exactly one build.

`buildIssues.js` remains the sole production planner for delivery. Any future planner runs read-only
against identical inputs and records slate differences before an atomic cutover; two planners never
write competing IssueItems.

## Consequences

### Positive

- The console can start against realistic fixtures before live integration.
- The editor's displayed issue and choice set can be reconstructed exactly.
- Stale-state detection reduces to comparing immutable build identities and draft revisions.
- Constraint and override explanations remain consistent with the upstream planner.
- Future scoring and planner changes can occur behind a stable consumer boundary.

### Negative

- W9 must be implemented before live alternatives exist.
- The contract needs schema validation, versioning, fixtures, and compatibility tests.
- A full contextual assessment matrix may be larger than a flat candidate list, although R8's
  section sizes are small.
- A contract defect can still make the console faithfully display the wrong choice set, so upstream
  assembly needs its own tests.

### Follow-up constraints

- Keep visible-alternative count `K`, enrichment depth, scoring policy, and card contents configurable
  or contract-versioned; they are not settled by this ADR.
- Preserve stable identities; titles are display values, not keys.
- Validate bundles at ingestion and reject unknown contract versions.
- Include golden fixtures covering one alternative that has different assessments against different
  selected events.

## References

- [R8 scope §5: W9 assembly contract](../R8_Scope.md)
- [R8 kickoff §6: choice-set contract](../R8_Nate_Kickoff.md)
- [Decision Log §87 amendment](../../Decision_Log.md)
