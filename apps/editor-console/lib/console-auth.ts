/**
 * The console's login: one username and password, typed once on the /login page. After that a
 * signed cookie keeps the browser signed in for 90 days. proxy.ts checks the cookie on every page
 * and every /api route.
 *
 * Production mode fails closed: with no credentials configured, every request is refused.
 * Demo mode serves only the checked-in fixture and has no login.
 *
 * The cookie holds an expiry time and a signature of that time. The signing key is made from the
 * username and password, so there is no extra secret to manage, and changing the password signs
 * everyone out. The password itself is never in the cookie. Someone holding a valid cookie could
 * try guessing the password offline against its signature, so the password needs to be long.
 */

type Env = Record<string, string | undefined>;

export type LoginSetup =
  | { kind: "demo" }
  | { kind: "not_configured" }
  | { kind: "configured"; user: string; password: string };

export const SESSION_COOKIE = "vb_console_session";

const SESSION_SECONDS = 90 * 24 * 60 * 60;

// The only paths a signed-out browser may reach. /login and its form's route must match exactly.
// Everything in /_next/static/ is the build's own CSS and JavaScript, which hold no issue data:
// the workspace reaches the browser only through the signed-in page and /api routes.
const EXEMPT_PATHS = new Set(["/login", "/api/login"]);
const EXEMPT_PREFIX = "/_next/static/";

export function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATHS.has(pathname) || pathname.startsWith(EXEMPT_PREFIX);
}

export function readLoginSetup(env: Env = process.env): LoginSetup {
  if (env.EDITOR_CONSOLE_MODE?.trim() === "demo") return { kind: "demo" };

  const user = env.CONSOLE_AUTH_USER?.trim();
  const password = env.CONSOLE_AUTH_PASSWORD;
  if (!user || !password) return { kind: "not_configured" };
  return { kind: "configured", user, password };
}

// Compares every character whatever the result, so timing does not reveal a near miss.
function sameText(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function credentialsMatch(
  setup: Extract<LoginSetup, { kind: "configured" }>,
  user: string,
  password: string,
): boolean {
  // Both are always compared, so a wrong username costs the same as a wrong password.
  const userMatches = sameText(user, setup.user);
  const passwordMatches = sameText(password, setup.password);
  return userMatches && passwordMatches;
}

async function sign(
  setup: Extract<LoginSetup, { kind: "configured" }>,
  text: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    // JSON keeps the parts apart, so "ab" + "c" and "a" + "bc" give different keys.
    encoder.encode(JSON.stringify(["vb-console-session-v1", setup.user, setup.password])),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSessionValue(
  setup: Extract<LoginSetup, { kind: "configured" }>,
  now: number = Date.now(),
): Promise<string> {
  const expiresAt = String(now + SESSION_SECONDS * 1000);
  return `${expiresAt}.${await sign(setup, expiresAt)}`;
}

export async function isValidSession(
  value: string | undefined,
  setup: Extract<LoginSetup, { kind: "configured" }>,
  now: number = Date.now(),
): Promise<boolean> {
  const match = /^(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!match) return false;
  const [, expiresAt, signature] = match;
  // The signature is checked first, and in full, whether or not the time has passed.
  const signatureMatches = sameText(signature, await sign(setup, expiresAt));
  return signatureMatches && Number(expiresAt) > now;
}

export function sessionCookieOptions(env: Env = process.env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
