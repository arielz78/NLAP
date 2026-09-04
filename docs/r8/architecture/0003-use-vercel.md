# ADR 0003: Deploy the editor console on Vercel

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decider:** Nate
- **Scope:** R8 editor-console hosting

## Context

The kickoff requires hosting and a working deployment from the beginning of implementation rather
than as a final release task. R8 has one editor, one weekly session, and a small number of short HTTP
requests. Its hosting problem is reliability and low operational friction, not scale.

ADR 0001 selects Next.js. The application needs HTTPS, server-side functions, environment-secret
management, preview deployments, logs, and a straightforward connection to the managed database in
ADR 0002.

Console hosting and pipeline hosting are separate decisions. The existing n8n ingestion workflow is
a stateful operational system with known instance/repository divergence. Moving that workflow is an
open R8 product decision and must not become an accidental dependency of deploying the console.

## Decision drivers

- Deploy the Next.js application with minimal platform configuration.
- Obtain a production URL and HTTPS immediately.
- Support preview deployments for review before production promotion.
- Keep secrets out of source control and browser bundles.
- Provide enough logs to diagnose Sunday failures.
- Avoid running or migrating n8n and long-lived pipeline work inside the console deployment.

## Considered options

### Vercel

Provides direct Next.js support, Git-based preview deployments, server functions, HTTPS, logs, and
managed-storage integrations. It has the shortest path from the selected framework to a rehearsable
deployment.

### General application hosts such as Render, Railway, or Fly.io

Could host a Node.js service and may be preferable if R8 required a continuously running process or
long background jobs. The console has neither requirement in V1, so the additional container and
service configuration provides little benefit.

### Cloudflare Workers/Pages

Offers strong edge deployment, but would introduce a different runtime and persistence integration
without a latency or scale requirement that justifies the change.

### Self-hosting on the existing laptop or another manually managed machine

Would repeat the availability problem that already prevents unattended pipeline operation. The
editor's Sunday workflow must not depend on the builder's laptop being awake.

## Decision

Deploy the R8 editor console to Vercel as a single Next.js project.

- Connect production deployment to the managed Postgres database selected in ADR 0002.
- Keep application and database regions close to one another.
- Store application, database, session, and machine-API secrets in host-managed environment
  configuration, never in source or client-exposed variables.
- Use preview deployments for changes, but keep preview and production data separated or make
  preview deployments use non-production fixtures/database branches.
- Configure the production project to build the console application package rather than treating
  the entire NLAP repository as one Next.js application.
- Do not move n8n ingestion, model execution, Airtable reconciliation, blurb generation, or Beehiiv
  export into Vercel Functions as part of this ADR.

## Consequences

### Positive

- Hosting is exercised from day one, satisfying the CP2 survival-demo premise.
- Git changes can receive reviewable preview URLs.
- HTTPS and the framework deployment path require little custom infrastructure.
- Database and application secrets remain server-side.
- The app can be redeployed without losing drafts or submissions because persistence is external.

### Negative

- The deployment is coupled to Vercel's function model, configuration, quotas, and pricing.
- Preview deployments can accidentally touch production state unless environment separation is
  enforced.
- Serverless functions are a poor home for long-lived or stateful pipeline jobs.
- Host availability does not solve upstream n8n scheduling or downstream manual publication.

### Follow-up constraints

- Establish a visible production health check and document how to inspect failed requests.
- Test cold-start and database-connect behavior before the first Sunday session.
- Protect machine endpoints independently from editor authentication.
- Treat pipeline hosting as a separate ADR only after R8 TODO-1 is decided.

## References

- [R8 kickoff: hosting first](../R8_Nate_Kickoff.md)
- [R8 scope: TODO-1 and hosting risk](../R8_Scope.md)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel storage integrations](https://vercel.com/docs/marketplace-storage)
