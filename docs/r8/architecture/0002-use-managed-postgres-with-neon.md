# ADR 0002: Use managed Postgres on Neon for console-owned state

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decider:** Nate
- **Scope:** R8 editor-console persistence

## Context

Airtable remains NLAP's production database for Candidates, Issues, and IssueItems. R8 is not a
database migration and must not create a second canonical copy of those records.

The console nevertheless owns state that does not currently exist in Airtable:

- versioned issue builds presented to the editor;
- refresh-surviving drafts;
- append-only interaction events and their provenance;
- immutable submitted selections;
- idempotency keys and application receipts;
- optimistic revision numbers used to reject stale writes.

The settled product boundary says the console does not write to Airtable. Even if that boundary were
relaxed, Airtable does not provide a transaction spanning a draft update, an interaction event, and
an immutable submission. The small data volume does not remove the need for atomicity, uniqueness,
or stale-state detection; those properties protect editorial decisions and training evidence rather
than throughput.

## Decision drivers

- Durable state across refreshes, browser restarts, and deployments.
- Transactions for command/event persistence and submission creation.
- Unique constraints for idempotent retries.
- Append-only records that remain queryable for audit and later pair derivation.
- Server-side access with no database credential in the browser.
- Low operational burden and compatibility with serverless Next.js hosting.
- A strict boundary that leaves Airtable authoritative for newsletter production data.

## Considered options

### Managed Postgres

Matches the transactional, relational, and audit requirements directly. The expected volume is
small, so managed operation is more important than scaling capacity.

### Additional tables in the production Airtable base

Would avoid a second service, but violates the settled no-Airtable-write boundary. It also couples
console deployment credentials to the production base and cannot atomically persist related record
changes.

### A separate Airtable base

Reduces production-table risk but retains non-transactional multi-record writes and creates a second
Airtable integration to reconcile. It provides fewer correctness guarantees than Postgres without
meaningfully reducing application code.

### Browser storage only

`localStorage` or IndexedDB can improve responsiveness, but cannot be the durable submission system.
They do not survive device changes or all browser clearing, cannot be consumed reliably by the
reconciliation script, and do not provide a server-verifiable audit trail.

### Object/blob storage or a key-value store

Immutable JSON submissions fit object storage, but drafts, revision checks, idempotency, event
queries, and application receipts become bespoke consistency mechanisms. A relational store is
simpler for the complete state model.

### Self-hosted SQLite

Would be adequate for the volume, but durable volumes, backups, deployment locality, and single-
instance assumptions complicate the selected serverless hosting model.

## Decision

Use a managed Neon Postgres database for state owned by the editor console.

The database connection is server-only. The browser calls authenticated application endpoints and
never receives a database credential or a direct database client.

The initial persistence boundary consists of these logical records:

- `issue_builds`: immutable, versioned input bundles supplied by the assembly boundary;
- `drafts`: mutable editor state with an integer revision and submission state;
- `interaction_events`: append-only editor actions with stable client event IDs;
- `submissions`: immutable final selections tied to one issue-build version;
- `submission_receipts`: append-only reconciliation outcomes such as accepted, applying, complete,
  or failed.

Compact issue and decision snapshots may be stored as JSONB. Stable identity, version, timestamps,
idempotency keys, and lifecycle relationships remain normal relational columns with constraints.

Do not mirror the complete Candidates or IssueItems tables into Postgres. Candidate display data in
an `issue_build` is an immutable decision snapshot, not a competing operational record.

## Consequences

### Positive

- Draft commands can update the draft and append their audit event in one transaction.
- Unique constraints make retries safe and observable.
- Submitted decisions survive application redeployments and are independently retrievable by the
  reconciliation script.
- Airtable remains the sole production source of truth for newsletter records.
- Later analysis can distinguish raw actions, final submissions, and reconciliation outcomes.

### Negative

- R8 introduces a second managed service, schema migrations, credentials, backups, and monitoring.
- The issue-build handoff must make the relationship between the two stores explicit.
- Operational costs exist even though traffic is very low.
- JSONB snapshots require versioned validation because database shape alone cannot validate their
  contents.

### Follow-up constraints

- Locate the database near the application functions.
- Apply schema changes through checked-in migrations; do not edit production tables manually as the
  normal deployment path.
- Record contract versions on JSON snapshots.
- Never expose a privileged Neon connection string to client code.
- If the no-Airtable-write product decision changes, supersede this ADR rather than silently turning
  Postgres into a full Airtable mirror.

## References

- [R8 scope: settled boundary and write-path failures](../R8_Scope.md)
- [Decision Log §96](../../Decision_Log.md)
- [Neon serverless driver and transaction options](https://neon.com/docs/serverless/serverless-driver)
- [Vercel marketplace storage](https://vercel.com/docs/marketplace-storage)
