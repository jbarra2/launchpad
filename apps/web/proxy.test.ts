// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_PATHS, config, contentSecurityPolicy, proxy } from "./proxy";

const WEB = "http://localhost:3100";
const SESSION = "launchpad.session_token=abc.def%3D";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${WEB}${path}`, { headers });
}

function answer(status: number, body: unknown, setCookies: string[] = []) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of setCookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

const signedIn = { session: { id: "s1" }, user: { id: "u1" } };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/** Where a redirect sends the browser, as a path and query. */
function redirectTarget(response: Response): string | null {
  const location = response.headers.get("location");
  if (!location) {
    return null;
  }
  const url = new URL(location, WEB);
  // A redirect to another host would otherwise pass on its path alone.
  expect(url.origin).toBe(WEB);
  return url.pathname + url.search;
}

function passedThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

describe("which requests the proxy sees", () => {
  it("runs on pages, including one whose name starts with api", () => {
    for (const url of ["/", "/pad", "/sign-in", "/rockets/x", "/apiary"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    }
  });

  it("leaves the API and Next's own files alone", () => {
    for (const url of [
      "/api",
      "/api/me",
      "/api/auth/sign-in/email",
      "/_next/static/a.js",
      "/_next/image",
      "/favicon.ico",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });
});

describe("a visitor with no session cookie", () => {
  it("is sent to sign in, with the page they wanted, and the API is not asked", async () => {
    const response = await proxy(request("/pad"));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/sign-in?next=%2Fpad");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the query of the page they wanted", async () => {
    const response = await proxy(request("/rockets/a?tab=plan"));
    expect(redirectTarget(response)).toBe("/sign-in?next=%2Frockets%2Fa%3Ftab%3Dplan");
  });

  it("is sent to sign in with no next at all when the page they wanted is not safe to return to", async () => {
    const response = await proxy(request(`/${"a".repeat(220)}`));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/sign-in");
  });

  it("reaches every public page without a call to the API", async () => {
    expect(PUBLIC_PATHS).toEqual(
      new Set(["/", "/sign-up", "/sign-in", "/check-email", "/forgot-password", "/reset-password"]),
    );
    for (const path of PUBLIC_PATHS) {
      expect(passedThrough(await proxy(request(path))), path).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a path that only looks public as protected", async () => {
    for (const path of [
      "/sign-in/x",
      "/sign-inx",
      "/Sign-In",
      "/reset-password/",
      "/pad/sign-in",
    ]) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(307);
    }
  });

  it("sends a visitor to sign in, not to an error, when the address has a broken escape", async () => {
    const response = await proxy(request("/%E0%A4%A"));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/sign-in");
  });

  it("is not fooled by a cookie with the right name and no value", async () => {
    const response = await proxy(request("/pad", { cookie: "launchpad.session_token=" }));
    expect(response.status).toBe(307);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a visitor with a session cookie", () => {
  it("has the session checked with the API, sending only this app's cookies", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(answer(200, signedIn));
    await proxy(
      request("/pad", {
        cookie: `other=secret; ${SESSION}`,
        "x-forwarded-for": "203.0.113.9",
        "x-launchpad-client-ip": "203.0.113.9",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test:4100/api/auth/get-session");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(3_000);
    const sent = new Headers(init?.headers);
    expect(sent.get("cookie")).toBe(SESSION);
    expect([...sent.keys()].sort()).toEqual(["accept", "cookie"]);
  });

  it("also checks a session held in the https cookie", async () => {
    fetchMock.mockResolvedValue(answer(200, signedIn));
    const response = await proxy(
      request("/pad", { cookie: "__Secure-launchpad.session_token=abc" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(passedThrough(response)).toBe(true);
  });

  it("passes a renewed cookie back to the browser, each one as its own header", async () => {
    fetchMock.mockResolvedValue(
      answer(200, signedIn, ["launchpad.session_token=new; Path=/; HttpOnly", "b=2; Path=/"]),
    );
    const response = await proxy(request("/pad", { cookie: SESSION }));
    expect(passedThrough(response)).toBe(true);
    expect(response.headers.getSetCookie()).toEqual([
      "launchpad.session_token=new; Path=/; HttpOnly",
      "b=2; Path=/",
    ]);
  });

  it("sends a person whose session has ended to sign in, and clears the dead cookie", async () => {
    const clear = "launchpad.session_token=; Max-Age=0; Path=/; HttpOnly";
    fetchMock.mockResolvedValue(answer(200, null, [clear]));
    const response = await proxy(request("/pad", { cookie: SESSION }));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/sign-in?next=%2Fpad");
    expect(response.headers.getSetCookie()).toEqual([clear]);
  });

  it("lets a person whose session has ended reach a public page, and clears the cookie", async () => {
    const clear = "launchpad.session_token=; Max-Age=0; Path=/; HttpOnly";
    fetchMock.mockResolvedValue(answer(200, null, [clear]));
    const response = await proxy(request("/sign-in", { cookie: SESSION }));
    expect(passedThrough(response)).toBe(true);
    expect(response.headers.getSetCookie()).toEqual([clear]);
  });

  it("treats a 401 as signed out, and passes on the cookies it clears", async () => {
    const clear = "launchpad.session_token=; Max-Age=0; Path=/; HttpOnly";
    fetchMock.mockResolvedValueOnce(answer(401, { message: "no" }, [clear]));
    const response = await proxy(request("/pad", { cookie: SESSION }));
    expect(response.status).toBe(307);
    expect(response.headers.getSetCookie()).toEqual([clear]);
  });

  it("lets the page decide on an answer it cannot read, so the two checks cannot loop", async () => {
    for (const reply of [
      answer(200, {}, ["a=1"]),
      answer(200, "x"),
      answer(200, { user: {} }),
      answer(200, { user: { id: 1 } }),
      new Response("not json", { status: 200 }),
    ]) {
      fetchMock.mockResolvedValueOnce(reply);
      const response = await proxy(request("/pad", { cookie: SESSION }));
      expect(passedThrough(response)).toBe(true);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it("lets the page decide when the API cannot be reached, and passes no cookie on", async () => {
    const failures = [
      () => Promise.reject(new TypeError("fetch failed")),
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      () => Promise.resolve(answer(500, { error: "x" }, ["a=1"])),
      () => Promise.resolve(answer(502, null)),
    ];
    for (const failure of failures) {
      fetchMock.mockImplementationOnce(failure);
      const response = await proxy(request("/pad", { cookie: SESSION }));
      expect(passedThrough(response)).toBe(true);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });
});

describe("the Content-Security-Policy", () => {
  const policyOf = (response: Response) => response.headers.get("content-security-policy") ?? "";

  it("is on every page that renders, with a nonce that is new for each request", async () => {
    const first = await proxy(request("/"));
    const second = await proxy(request("/sign-in"));
    const nonces = [first, second].map((r) => /'nonce-([^']+)'/.exec(policyOf(r))?.[1]);
    expect(nonces[0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonces[1]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonces[0]).not.toBe(nonces[1]);
    // Outside development, the policy sent is the strict one.
    expect(policyOf(first)).not.toMatch(/unsafe-eval|unsafe-inline/);
    expect(policyOf(first)).toContain("upgrade-insecure-requests");
  });

  it("is handed to Next on the request too, so Next puts the nonce on its own scripts", async () => {
    fetchMock.mockResolvedValue(answer(200, signedIn));
    const response = await proxy(request("/pad", { cookie: SESSION }));
    expect(passedThrough(response)).toBe(true);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(
      policyOf(response),
    );
  });

  it("lets scripts run only with the nonce, and loads nothing from another site", () => {
    const policy = contentSecurityPolicy("abc", false);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-abc'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it("allows what the development server needs, there only", () => {
    const policy = contentSecurityPolicy("abc", true);
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy("abc", false)).toContain("upgrade-insecure-requests");
  });
});
