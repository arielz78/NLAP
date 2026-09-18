# R8 editor console

This package is the W2 implementation slice for R8. It is deliberately separate
from the existing CommonJS production pipeline and never writes to Airtable.

## Run locally

```bash
npm install
npm run dev
```

Runtime mode is explicit. Copy `.env.example` to `.env.local` and set
`EDITOR_CONSOLE_MODE=demo` to use the checked-in issue fixture. Demo drafts and
simulated submissions live only in browser storage and are unmistakably labelled;
they never become PostgreSQL submissions.

## PostgreSQL / Neon

For the durable path, set `EDITOR_CONSOLE_MODE=production`, the server-only
`DATABASE_URL`, and a stable `EDITOR_IDENTITY`. Then apply every pending checked-in
migration and load the fixture issue build. The scripts load the console's
`.env.local` automatically:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Browser code never receives the connection string. Draft mutations use an expected
revision, update the JSONB draft snapshot, and append their interaction event in
one SQL statement. Submit creates an immutable issue revision. **Reopen for
editing** retires the old active target and creates one new current draft linked to
the prior submission; it does not mutate the submitted row. All submissions for a
build remain queryable at
`GET /api/issue-builds/{issueBuildId}/submissions`.

Production mode fails closed: missing configuration, schema/query failure, or an
empty database renders a blocking unavailable state. It never falls back to the
browser fixture. Submissions are not reconciled to Airtable in this package.

## Verify

```bash
npm test
npm run lint
npm run build
```

The credential-free suite covers replacement, slot-scoped undo, reopen semantics,
strict final-state pair derivation, and production fail-closed behavior.

The PostgreSQL/API-boundary suite must use a disposable, non-production database.
It refuses to run unless the test URL is separately supplied and explicitly
confirmed, and it refuses a test URL equal to `DATABASE_URL`:

```bash
TEST_DATABASE_URL=postgresql://... \
TEST_DATABASE_CONFIRMED_ISOLATED=yes \
npm run test:integration
```

The integration suite applies migrations, creates uniquely named fixture builds,
and leaves their immutable audit rows in that isolated database. Do not point it
at the live console database.
