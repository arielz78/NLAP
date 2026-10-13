import { NextResponse, type NextRequest } from "next/server";

import { AUTH_REALM, checkBasicAuth } from "./lib/basic-auth";

// No matcher: this runs on every request, pages and /api routes alike.
export function proxy(request: NextRequest) {
  const verdict = checkBasicAuth(request.headers.get("authorization"));
  if (verdict === "allowed") return NextResponse.next();

  if (verdict === "not_configured") {
    return new NextResponse(
      "The console login is not configured. Set CONSOLE_AUTH_USER and CONSOLE_AUTH_PASSWORD.",
      { status: 503 },
    );
  }

  return new NextResponse("Sign in to open the console.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
    },
  });
}
