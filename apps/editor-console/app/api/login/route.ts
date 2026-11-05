import { NextResponse, type NextRequest } from "next/server";

import {
  createSessionValue,
  credentialsMatch,
  readLoginSetup,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/console-auth";

export const dynamic = "force-dynamic";

// These two fixed paths are the only places this route sends anyone; nothing in the request can
// change them. 303 makes the browser load the next page with GET, so reloading it never resends
// the password.
function redirectTo(location: "/" | "/login?error=1") {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const setup = readLoginSetup();
  if (setup.kind === "demo") return redirectTo("/");
  if (setup.kind === "not_configured") {
    return new NextResponse("The console login is not configured.", { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const user = form?.get("username");
  const password = form?.get("password");
  if (
    typeof user !== "string" ||
    typeof password !== "string" ||
    !credentialsMatch(setup, user, password)
  ) {
    return redirectTo("/login?error=1");
  }

  const response = redirectTo("/");
  response.cookies.set(SESSION_COOKIE, await createSessionValue(setup), sessionCookieOptions());
  return response;
}
