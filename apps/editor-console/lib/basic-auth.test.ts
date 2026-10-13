import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "../proxy";
import { checkBasicAuth } from "./basic-auth";

const env = {
  EDITOR_CONSOLE_MODE: "production",
  CONSOLE_AUTH_USER: "editor",
  CONSOLE_AUTH_PASSWORD: "correct horse: battery",
};

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;

describe("console login: the credential check", () => {
  it("allows the right username and password", () => {
    expect(checkBasicAuth(basic("editor", "correct horse: battery"), env)).toBe("allowed");
  });

  it("denies a request with no credentials", () => {
    expect(checkBasicAuth(null, env)).toBe("denied");
    expect(checkBasicAuth("", env)).toBe("denied");
  });

  it("denies a wrong password, a wrong username and a near miss", () => {
    expect(checkBasicAuth(basic("editor", "wrong"), env)).toBe("denied");
    expect(checkBasicAuth(basic("someone", "correct horse: battery"), env)).toBe("denied");
    expect(checkBasicAuth(basic("editor", "correct horse: batter"), env)).toBe("denied");
    expect(checkBasicAuth(basic("editor", "correct horse: battery "), env)).toBe("denied");
  });

  it("denies a malformed header or another scheme", () => {
    expect(checkBasicAuth("Basic not-base64!!", env)).toBe("denied");
    expect(checkBasicAuth(`Basic ${Buffer.from("no-colon").toString("base64")}`, env)).toBe(
      "denied",
    );
    expect(checkBasicAuth("Bearer abc", env)).toBe("denied");
  });

  it("accepts the scheme in any letter case", () => {
    const header = basic("editor", "correct horse: battery").replace("Basic", "basic");
    expect(checkBasicAuth(header, env)).toBe("allowed");
  });

  it("refuses everyone in production when no login is configured", () => {
    const header = basic("editor", "correct horse: battery");
    for (const missing of ["CONSOLE_AUTH_USER", "CONSOLE_AUTH_PASSWORD"] as const) {
      expect(checkBasicAuth(header, { ...env, [missing]: undefined })).toBe("not_configured");
      expect(checkBasicAuth(header, { ...env, [missing]: "" })).toBe("not_configured");
    }
    expect(checkBasicAuth(basic("", ""), { EDITOR_CONSOLE_MODE: "production" })).toBe(
      "not_configured",
    );
  });

  it("refuses when the mode is missing: only explicit demo mode has no login", () => {
    expect(checkBasicAuth(null, {})).toBe("not_configured");
    expect(checkBasicAuth(null, { EDITOR_CONSOLE_MODE: "demo" })).toBe("allowed");
  });
});

describe("console login: every route", () => {
  afterEach(() => vi.unstubAllEnvs());

  const configure = () => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  };
  const request = (path: string, authorization?: string) =>
    new NextRequest(`https://console.example${path}`, {
      headers: authorization ? { authorization } : undefined,
    });

  const paths = [
    "/",
    "/api/workspace",
    "/api/drafts/20000000-0000-4000-8000-000000000001/submit",
    "/api/issue-builds/20000000-0000-4000-8000-000000000001/submissions",
    "/_next/static/chunk.js",
  ];

  it("answers 401 with a Basic challenge on pages and API routes alike", () => {
    configure();
    for (const path of paths) {
      const response = proxy(request(path));
      expect(response.status, path).toBe(401);
      expect(response.headers.get("www-authenticate"), path).toMatch(/^Basic realm=/);
    }
  });

  it("lets a signed-in request through on every route", () => {
    configure();
    for (const path of paths) {
      const response = proxy(request(path, basic("editor", "correct horse: battery")));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("answers 503 and no challenge when the login is not configured", () => {
    vi.stubEnv("EDITOR_CONSOLE_MODE", "production");
    vi.stubEnv("CONSOLE_AUTH_USER", "");
    vi.stubEnv("CONSOLE_AUTH_PASSWORD", "");
    const response = proxy(request("/api/workspace", basic("editor", "anything")));
    expect(response.status).toBe(503);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });
});
