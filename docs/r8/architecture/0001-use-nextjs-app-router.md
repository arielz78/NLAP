# ADR 0001: Use Next.js App Router for the editor console

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decider:** Nate
- **Scope:** R8 editor-console application

## Context

R8 needs one laptop-oriented review screen, not a general editorial platform. The screen must load
an already assembled issue, support replace and undo, persist a draft across refreshes, record
interaction provenance, and submit one durable result. Browser code must not hold service
credentials, so the application needs a server boundary even though the visible product is one
page.

The delivery window is short and the kickoff requires a working hosted deployment at the beginning
of the build. A separate single-page frontend and API service would add deployment, configuration,
and contract-management work without serving an independent scaling or ownership need. The existing
NLAP scripts remain CommonJS Node.js and must not be migrated merely to accommodate the console.

## Decision drivers

- One codebase and deployment for the page and its server endpoints.
- Type-safe contracts across UI actions, draft persistence, and submission APIs.
- Server-only handling of database and application secrets.
- Fast mock-first development and preview deployments.
- A clear boundary between interactive client state and durable server state.
- Minimal operational surface for a one-editor, once-weekly workflow.

## Considered options

### Next.js App Router

Provides React rendering, client components for the interactive lineup, and Route Handlers for the
small HTTP API in one application. It is directly supported by the selected host in ADR 0003.

### React with Vite and a separate Node.js API

Would make the frontend/backend split explicit, but requires two build targets, cross-origin or
reverse-proxy configuration, duplicated deployment setup, and a separately maintained API boundary.
R8 has no independent scaling reason for that split.

### SvelteKit, Remix/React Router, or another full-stack framework

These can satisfy the requirements. They do not offer a project-specific advantage large enough to
outweigh the deployment path, React ecosystem, and direct hosting integration of Next.js for this
build.

### Airtable Interfaces or a static browser-only application

Airtable Interfaces would keep the editor in the system R8 is intended to replace and cannot safely
implement the required submission and provenance semantics. A browser-only application would have
nowhere trustworthy to store secrets or durable drafts and submissions.

## Decision

Build the R8 editor console as a TypeScript Next.js application using the App Router.

- Use Server Components for the initial authenticated issue load where useful.
- Use Client Components only for the interactive review state: section navigation, replace, undo,
  lightweight classification, and submit feedback.
- Use Route Handlers for browser commands and machine-to-machine endpoints. The reconciliation
  script needs an ordinary HTTP contract; it must not depend on browser-only Server Action details.
- Keep durable state on the server. Client state may provide responsive interaction but is not the
  source of truth after an acknowledged command.
- Place the console in its own application package so its TypeScript/ES-module configuration does
  not require conversion of the existing CommonJS pipeline.
- Do not introduce a separate API service, GraphQL layer, or real-time transport for V1.

## Consequences

### Positive

- The UI and backend boundary ship and deploy together.
- Shared TypeScript types can describe issue bundles, commands, events, and submissions.
- Secrets and database access remain in server code.
- The application can expose both editor-facing routes and a narrow reconciliation API.
- The framework supports the mock-first CP2 workflow without precluding later integration.

### Negative

- The console adopts React and Next.js conventions not used by the existing CommonJS scripts.
- Care is required to prevent accidental server/client boundary leaks.
- Framework upgrades and serverless behavior become application maintenance concerns.
- Some Next.js capability will remain unused because R8 intentionally has only one product screen.

### Follow-up constraints

- Do not migrate existing pipeline scripts into Next.js Route Handlers as part of R8.
- Do not put allocation or replacement-feasibility rules in React components; ADR 0006 defines the
  upstream contract for those semantics.
- Keep the HTTP boundary small and explicit so the app remains portable to another Node.js host if
  ADR 0003 is later superseded.

## References

- [R8 scope](../R8_Scope.md)
- [R8 kickoff brief](../R8_Nate_Kickoff.md)
- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Next.js Route Handlers documentation](https://nextjs.org/docs/app/getting-started/route-handlers)
