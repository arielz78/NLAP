/**
 * The console's login (ship-plan item 11): one username and password, sent by the
 * browser as HTTP Basic credentials over HTTPS. proxy.ts applies it to every page
 * and every /api route.
 *
 * Production mode fails closed: with no credentials configured, every request is
 * refused. Demo mode serves only the checked-in fixture and has no login.
 */

export type AuthVerdict = "allowed" | "denied" | "not_configured";

export const AUTH_REALM = "Vaughan Brief console";

type Env = Record<string, string | undefined>;

// Compares every character whatever the result, so timing does not reveal a near miss.
function sameText(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function decodeCredentials(header: string | null | undefined) {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? "");
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function checkBasicAuth(
  header: string | null | undefined,
  env: Env = process.env,
): AuthVerdict {
  if (env.EDITOR_CONSOLE_MODE?.trim() === "demo") return "allowed";

  const user = env.CONSOLE_AUTH_USER?.trim();
  const password = env.CONSOLE_AUTH_PASSWORD;
  if (!user || !password) return "not_configured";

  const given = decodeCredentials(header);
  if (!given) return "denied";

  // Both are always compared, so a wrong username costs the same as a wrong password.
  const userMatches = sameText(given.user, user);
  const passwordMatches = sameText(given.password, password);
  return userMatches && passwordMatches ? "allowed" : "denied";
}
