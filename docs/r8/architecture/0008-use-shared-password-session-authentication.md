# ADR 0008: Use shared-password session authentication

- **Status:** Proposed — requires Ariel's approval
- **Date:** 2026-09-04
- **Proposer:** Nate
- **Approver:** Ariel
- **Scope:** Editor authentication for V1

## Context

R8 has one editor and one weekly laptop session. The editor should normally open a direct issue link
without account setup, organization navigation, or repeated login ceremony. Nevertheless, the app
exposes unpublished candidate and issue information and accepts durable submissions, so an
unguessable URL alone is not a sufficient security boundary.

The kickoff explicitly excludes real user-account management and requires the authentication
mechanism to be reviewed with Ariel. Authentication for machine endpoints is a separate concern:
the issue-build publisher and reconciliation script must not use the editor's browser session.

## Decision drivers

- Minimal recurring friction for one non-technical editor.
- No signup, password-reset, invitation, or role-management product work.
- Server-enforced access to pages and mutation endpoints.
- Revocable credentials and expiring sessions.
- Separation between human authentication and machine-to-machine authorization.

## Considered options

### Unguessable link only

Has the least friction but turns browser history, forwarded messages, analytics, and leaked URLs into
credentials. It is difficult to revoke one exposure without changing the route.

### Full user accounts or third-party identity provider

Provides individual identities and recovery flows, but adds onboarding and login ceremony for one
known editor. Those capabilities are explicitly outside V1 scope.

### Email magic links

Avoids a remembered password but makes every expired session depend on email delivery and an extra
application switch during a time-sensitive Sunday workflow.

### Hosting-platform deployment protection

Can protect previews, but may require platform membership or plan-specific behavior and couples the
editor experience to deployment administration.

### One shared password with a persistent signed session

Adds one initial authentication step while keeping later issue links direct. It fits the one-editor
scope without creating an account system.

## Proposed decision

Protect the editor console with one shared password and a persistent server-issued session cookie.

- Store only a slow password hash and authentication secrets in host-managed server configuration.
- Verify the password server-side and issue an encrypted or signed cookie with `HttpOnly`, `Secure`,
  `SameSite=Lax`, a bounded lifetime, and a rotation strategy.
- Enforce the session in the server data-access layer for every editor page and mutation endpoint;
  hiding UI controls is not authorization.
- Use an opaque issue route for convenience and accidental-discovery resistance, but never treat the
  route itself as the credential.
- Rate-limit password attempts and log authentication failures without logging the supplied secret.
- Use separate service credentials for issue-build publication and submission reconciliation.
- Attribute V1 interaction events to the editor session, not to a claimed individual identity.

The exact session lifetime and password-delivery channel are operational details to approve before
acceptance.

## Consequences

### Positive

- The editor normally signs in once and subsequently lands directly on the current issue.
- No account, email-delivery, role, or password-reset subsystem is required.
- Server and machine authorization remain distinct.
- The password and session can be rotated if a link or device is compromised.

### Negative

- A shared secret cannot distinguish people if it is redistributed.
- There is no self-service recovery flow.
- Password rotation requires an out-of-band communication step.
- Custom session implementation requires careful cookie, CSRF, rate-limit, and secret handling.

### Conditions for acceptance

- Ariel approves the shared-password mechanism.
- The session lifetime and credential-delivery method are documented.
- All state-changing endpoints verify both authentication and request origin/CSRF protections.
- Preview deployments do not share the production editor credential or production database.

## References

- [R8 kickoff §7: decision rights](../R8_Nate_Kickoff.md)
- [R8 scope §8: V1 excludes real accounts](../R8_Scope.md)
- [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication)
