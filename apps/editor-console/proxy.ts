import { NextResponse, type NextRequest } from "next/server";

import {
  isExemptPath,
  isValidSession,
  readLoginSetup,
  SESSION_COOKIE,
} from "./lib/console-auth";

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

// No matcher: this runs on every request, pages and /api routes alike.
export async function proxy(request: NextRequest) {
  const setup = readLoginSetup();
  if (setup.kind === "demo") return NextResponse.next();

  if (setup.kind === "not_configured") {
    return new NextResponse(
      "The console login is not configured. Set CONSOLE_AUTH_USER and CONSOLE_AUTH_PASSWORD.",
      { status: 503 },
    );
  }

  const { pathname } = request.nextUrl;
  const signedIn = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, setup);

  // A bookmarked login page should not ask someone already signed in to sign in again.
  if (signedIn && pathname === "/login") return redirectTo(request, "/");
  if (signedIn || isExemptPath(pathname)) return NextResponse.next();

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    // JSON, because the console reads every /api answer as JSON and shows its `error` text.
    // No WWW-Authenticate header, so the browser never opens its own sign-in popup.
    return NextResponse.json(
      {
        error:
          "You have been signed out, so your last change was not saved. Changes saved earlier are safe. If you were typing in an event of your own, copy it somewhere first, then choose Sign in again.",
      },
      { status: 401 },
    );
  }

  return redirectTo(request, "/login");
}
