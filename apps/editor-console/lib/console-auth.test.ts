import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "../app/api/login/route";
import { proxy } from "../proxy";
import {
  createSessionValue,
  credentialsMatch,
  isExemptPath,
  isValidSession,
  readLoginSetup,
  SESSION_COOKIE,
} from "./console-auth";

const USER = "editor";
const PASSWORD = "correct horse: battery";
const setup = { kind: "configured", user: USER, password: PASSWORD } as const;
const DAY = 24 * 60 * 60 * 1000;

const configure = (password = PASSWORD) => {
  vi.stubEnv("EDITOR_CONSOLE_MODE", "production");
  vi.stubEnv("CONSOLE_AUTH_USER", USER);
  vi.stubEnv("CONSOLE_AUTH_PASSWORD", password);
};

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://console.example${path}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : undefined,
  });

const loginRequest = (fields: Record<string, string>) =>
  new NextRequest("https://console.example/api/login", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

const passedThrough = (response: Response) =>
  response.status === 200 && response.headers.get("x-middleware-next") === "1";

afterEach(() => vi.unstubAllEnvs());

describe("console login: the setup", () => {
  it("is not configured when either value is missing or the mode is missing", () => {
    expect(readLoginSetup({ CONSOLE_AUTH_PASSWORD: "x" }).kind).toBe("not_configured");
    expect(readLoginSetup({ CONSOLE_AUTH_USER: "x" }).kind).toBe("not_configured");
    expect(readLoginSetup({ CONSOLE_AUTH_USER: " ", CONSOLE_AUTH_PASSWORD: "x" }).kind).toBe(
      "not_configured",
    );
    expect(readLoginSetup({}).kind).toBe("not_configured");
  });

  it("has no login only in explicit demo mode", () => {
    expect(readLoginSetup({ EDITOR_CONSOLE_MODE: "demo" }).kind).toBe("demo");
    expect(readLoginSetup({ EDITOR_CONSOLE_MODE: "production" }).kind).toBe("not_configured");
  });
});

describe("console login: the credential check", () => {
  it("accepts only the exact username and password", () => {
    expect(credentialsMatch(setup, USER, PASSWORD)).toBe(true);
    expect(credentialsMatch(setup, USER, "wrong")).toBe(false);
    expect(credentialsMatch(setup, "someone", PASSWORD)).toBe(false);
    expect(credentialsMatch(setup, USER, "correct horse: batter")).toBe(false);
    expect(credentialsMatch(setup, USER, `${PASSWORD} `)).toBe(false);
    expect(credentialsMatch(setup, "", "")).toBe(false);
  });
});

describe("console login: the session cookie", () => {
  const now = 1_800_000_000_000;

  it("accepts a fresh value and never contains the password", async () => {
    const value = await createSessionValue(setup, now);
    expect(await isValidSession(value, setup, now)).toBe(true);
    expect(value).not.toContain(PASSWORD);
    expect(value).not.toContain(Buffer.from(PASSWORD).toString("base64"));
  });

  it("lasts 90 days and no longer", async () => {
    const value = await createSessionValue(setup, now);
    expect(await isValidSession(value, setup, now + 90 * DAY - 1)).toBe(true);
    expect(await isValidSession(value, setup, now + 90 * DAY)).toBe(false);
    expect(await isValidSession(value, setup, now + 91 * DAY)).toBe(false);
  });

  it("refuses a missing or malformed value", async () => {
    for (const value of [undefined, "", "abc", ".", "1.", ".abc", "1.2.3", `${now}.short`]) {
      expect(await isValidSession(value, setup, now), String(value)).toBe(false);
    }
  });

  it("refuses a tampered expiry and a tampered signature", async () => {
    const value = await createSessionValue(setup, now);
    const [expiresAt, signature] = value.split(".");
    const later = String(Number(expiresAt) + 365 * DAY);
    const changedLetter = signature[0] === "A" ? "B" : "A";

    expect(await isValidSession(`${later}.${signature}`, setup, now)).toBe(false);
    expect(await isValidSession(`0${expiresAt}.${signature}`, setup, now)).toBe(false);
    expect(
      await isValidSession(`${expiresAt}.${changedLetter}${signature.slice(1)}`, setup, now),
    ).toBe(false);
  });

  it("stops working when the password or the username changes", async () => {
    const value = await createSessionValue(setup, now);
    expect(await isValidSession(value, { ...setup, password: "a new password" }, now)).toBe(false);
    expect(await isValidSession(value, { ...setup, user: "someone" }, now)).toBe(false);
  });
});

describe("console login: the login route", () => {
  const good = { username: USER, password: PASSWORD };

  it("sets the cookie and sends the browser to /", async () => {
    configure();
    vi.stubEnv("NODE_ENV", "production");
    const response = await login(loginRequest(good));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(new RegExp(`Max-Age=${90 * 24 * 60 * 60}`, "i"));
    expect(setCookie).not.toContain("battery");

    const value = response.cookies.get(SESSION_COOKIE)?.value;
    expect(passedThrough(await proxy(request("/", value)))).toBe(true);
  });

  it("does not mark the cookie Secure outside production, for local work over http", async () => {
    configure();
    const response = await login(loginRequest(good));
    expect(response.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("sends wrong credentials back to the login page with no cookie", async () => {
    configure();
    const attempts: Record<string, string>[] = [
      { username: USER, password: "wrong" },
      { username: "someone", password: PASSWORD },
      { username: USER },
      {},
    ];
    for (const fields of attempts) {
      const response = await login(loginRequest(fields));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/login?error=1");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("treats a body that is not a form as wrong credentials", async () => {
    configure();
    const response = await login(
      new NextRequest("https://console.example/api/login", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.headers.get("location")).toBe("/login?error=1");
  });

  it("ignores any destination in the request", async () => {
    configure();
    const response = await login(
      new NextRequest("https://console.example/api/login?next=https://evil.example", {
        method: "POST",
        body: new URLSearchParams({ ...good, next: "https://evil.example" }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(response.headers.get("location")).toBe("/");
  });

  it("answers 503 with no cookie when no login is configured", async () => {
    vi.stubEnv("EDITOR_CONSOLE_MODE", "production");
    vi.stubEnv("CONSOLE_AUTH_USER", "");
    vi.stubEnv("CONSOLE_AUTH_PASSWORD", "");
    const response = await login(loginRequest(good));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets no cookie in demo mode", async () => {
    vi.stubEnv("EDITOR_CONSOLE_MODE", "demo");
    const response = await login(loginRequest(good));
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("console login: the exemption list", () => {
  it("covers only the login page, its route and the build's static files", () => {
    expect(isExemptPath("/login")).toBe(true);
    expect(isExemptPath("/api/login")).toBe(true);
    expect(isExemptPath("/_next/static/chunks/app.js")).toBe(true);
  });

  it("does not stretch to anything nearby", () => {
    for (const path of [
      "/",
      "/login/",
      "/login/extra",
      "/loginx",
      "/Login",
      "/api/login/extra",
      "/api/loginx",
      "/api/workspace",
      "/_next/static",
      "/_next/staticx/a.js",
      "/_next/image",
      "/_next/data/a.json",
      "/favicon.ico",
    ]) {
      expect(isExemptPath(path), path).toBe(false);
    }
  });

  it("cannot be walked out of with dots in the path", async () => {
    configure();
    for (const path of [
      "/_next/static/../../api/workspace",
      "/_next/static/%2e%2e/%2e%2e/api/workspace",
    ]) {
      expect((await proxy(request(path))).status, path).toBe(401);
    }
    expect((await proxy(request("/login/../api/workspace"))).status).toBe(401);
  });
});

describe("console login: every route", () => {
  // Reads the real app folder, so a route added later is covered without changing this test.
  const appFolder = fileURLToPath(new URL("../app", import.meta.url));
  const routes = readdirSync(appFolder, { recursive: true, encoding: "utf8" })
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => /(^|\/)(page\.tsx|route\.ts)$/.test(file))
    .map((file) => {
      const folder = file.replace(/(^|\/)(page\.tsx|route\.ts)$/, "");
      const path = `/${folder}`.replace(/\[[^\]]+\]/g, "20000000-0000-4000-8000-000000000001");
      return path;
    });
  const apiRoutes = routes.filter((path) => path.startsWith("/api/") && path !== "/api/login");
  const pages = routes.filter((path) => !path.startsWith("/api/") && path !== "/login");

  it("found the routes it should be guarding", () => {
    expect(pages).toContain("/");
    expect(apiRoutes).toContain("/api/workspace");
    expect(apiRoutes.length).toBeGreaterThanOrEqual(5);
    expect(routes).toContain("/login");
    expect(routes).toContain("/api/login");
  });

  it("sends a signed-out page request to /login with no popup", async () => {
    configure();
    for (const path of [...pages, "/some-page-that-does-not-exist"]) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname, path).toBe("/login");
      expect(new URL(response.headers.get("location")!).search, path).toBe("");
      expect(response.headers.get("www-authenticate"), path).toBeNull();
    }
  });

  it("answers a signed-out /api request with a 401 the console can read, and no popup", async () => {
    configure();
    for (const path of [...apiRoutes, "/api/some-route-that-does-not-exist"]) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(401);
      expect(response.headers.get("www-authenticate"), path).toBeNull();
      expect(response.headers.get("location"), path).toBeNull();
      const body = (await response.json()) as { error: string };
      expect(body.error, path).toMatch(/signed out/);
    }
  });

  it("treats tampered and expired cookies like no cookie", async () => {
    configure();
    const expired = await createSessionValue(setup, Date.now() - 91 * DAY);
    const valid = await createSessionValue(setup);
    const [expiresAt, signature] = valid.split(".");
    const tampered = `${Number(expiresAt) + DAY}.${signature}`;
    for (const cookie of [expired, tampered, "junk"]) {
      expect((await proxy(request("/api/workspace", cookie))).status).toBe(401);
      expect((await proxy(request("/", cookie))).status).toBe(307);
      expect(passedThrough(await proxy(request("/login", cookie)))).toBe(true);
    }
  });

  it("ignores the old Basic header", async () => {
    configure();
    const response = await proxy(
      new NextRequest("https://console.example/api/workspace", {
        headers: {
          authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`,
        },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("lets a signed-in request through on every route", async () => {
    configure();
    const cookie = await createSessionValue(setup);
    for (const path of [...pages, ...apiRoutes, "/_next/static/chunk.js"]) {
      expect(passedThrough(await proxy(request(path, cookie))), path).toBe(true);
    }
  });

  it("sends someone already signed in from /login to /", async () => {
    configure();
    const response = await proxy(request("/login", await createSessionValue(setup)));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("lets a signed-out browser reach only the exempt paths", async () => {
    configure();
    for (const path of ["/login", "/api/login", "/_next/static/chunk.js"]) {
      expect(passedThrough(await proxy(request(path))), path).toBe(true);
    }
  });

  it("signs out a cookie made before a password change", async () => {
    configure("the old password");
    const cookie = await createSessionValue({ ...setup, password: "the old password" });
    expect(passedThrough(await proxy(request("/", cookie)))).toBe(true);

    configure("the new password");
    expect((await proxy(request("/", cookie))).status).toBe(307);
    expect((await proxy(request("/api/workspace", cookie))).status).toBe(401);
  });

  it("answers 503 everywhere, including the login page, when no login is configured", async () => {
    vi.stubEnv("EDITOR_CONSOLE_MODE", "production");
    vi.stubEnv("CONSOLE_AUTH_USER", "");
    vi.stubEnv("CONSOLE_AUTH_PASSWORD", "");
    const cookie = await createSessionValue(setup);
    for (const path of ["/", "/login", "/api/login", "/api/workspace", "/_next/static/chunk.js"]) {
      const response = await proxy(request(path, cookie));
      expect(response.status, path).toBe(503);
      expect(response.headers.get("www-authenticate"), path).toBeNull();
    }
  });

  it("answers 503 when the mode is missing too: only explicit demo mode has no login", async () => {
    vi.stubEnv("EDITOR_CONSOLE_MODE", "");
    vi.stubEnv("CONSOLE_AUTH_USER", "");
    vi.stubEnv("CONSOLE_AUTH_PASSWORD", "");
    expect((await proxy(request("/"))).status).toBe(503);
  });

  it("lets everything through in demo mode", async () => {
    vi.stubEnv("EDITOR_CONSOLE_MODE", "demo");
    for (const path of ["/", "/login", "/api/workspace"]) {
      expect(passedThrough(await proxy(request(path))), path).toBe(true);
    }
  });
});
