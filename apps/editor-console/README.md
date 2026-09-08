# R8 editor console

This package is the W2 implementation slice for R8. It is deliberately separate
from the existing CommonJS production pipeline and never writes to Airtable.

## Run locally

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, the console runs against the checked-in issue fixture and
stores the draft in browser storage so the replace → undo → refresh → submit flow
can be demonstrated safely.

## PostgreSQL / Neon

Copy `.env.example` to `.env.local`, set its server-only `DATABASE_URL`, then
apply the checked-in schema and load the demo issue build. The scripts load the
console's `.env.local` automatically:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

The app switches to PostgreSQL automatically when it can load an `issue_builds`
row. Browser code never receives the connection string. Draft mutations use an
expected revision, update the JSONB draft snapshot, and append their interaction
event in one SQL statement. Submissions are immutable and are not reconciled to
Airtable in this package.

## Verify

```bash
npm test
npm run lint
npm run build
```

The domain tests cover replacement, undo, final-state pair derivation, and an
unavailable replacement. Database integration requires an explicitly configured
test database and is not exercised by the credential-free suite.
