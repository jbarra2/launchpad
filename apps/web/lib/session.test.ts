// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const incoming = vi.hoisted(() => ({ cookie: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(incoming.cookie ? { cookie: incoming.cookie } : {}),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

const { getApiKeyState, getSessionUser, peekSessionUser, requireUser } = await import("./session");
const { ApiUnavailableError } = await import("./api");

const fetchMock = vi.fn<typeof fetch>();
const ana = { id: "u1", name: "Ana", email: "ana@example.com" };
const noKey = { status: "none" } as const;

function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  incoming.cookie = "launchpad.session_token=abc";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("getApiKeyState", () => {
  it("is what /api/me says about the key: a status and the last 4 characters at most", async () => {
    const saved = { status: "valid", last4: "abcd", checkedAt: "2026-10-28T10:00:00.000Z" };
    fetchMock.mockResolvedValue(answer(200, { user: ana, apiKey: { ...saved, key: "sk-ant-x" } }));
    expect(await getApiKeyState()).toEqual(saved);
  });

  it("is none when nobody is signed in", async () => {
    incoming.cookie = null;
    expect(await getApiKeyState()).toEqual({ status: "none" });
  });
});

describe("getSessionUser", () => {
  it("asks nobody when the browser sent no session cookie", async () => {
    incoming.cookie = "other=1";
    expect(await getSessionUser()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the person from /api/me, and only the fields in the contract", async () => {
    fetchMock.mockResolvedValue(
      answer(200, { user: { ...ana, passwordHash: "x" }, apiKey: noKey }),
    );
    expect(await getSessionUser()).toEqual(ana);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("http://api.test:4100/api/me");
  });

  it("returns null when the API says the session is gone", async () => {
    fetchMock.mockResolvedValue(answer(401, { error: "Sign in to continue." }));
    expect(await getSessionUser()).toBeNull();
  });

  it("reports any other answer as the API being unavailable", async () => {
    fetchMock.mockResolvedValue(answer(500, { error: "x" }));
    await expect(getSessionUser()).rejects.toBeInstanceOf(ApiUnavailableError);
    fetchMock.mockResolvedValue(answer(200, { nobody: true }));
    await expect(getSessionUser()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("does not take a person from an answer that is not a 200, whatever its body says", async () => {
    fetchMock.mockResolvedValue(answer(503, { user: ana }));
    await expect(getSessionUser()).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});

describe("requireUser", () => {
  it("returns the signed-in person", async () => {
    fetchMock.mockResolvedValue(answer(200, { user: ana, apiKey: noKey }));
    expect(await requireUser("/pad")).toEqual(ana);
  });

  it("sends a signed-out visitor to sign in, with the page to come back to", async () => {
    fetchMock.mockResolvedValue(answer(401, {}));
    await expect(requireUser("/pad")).rejects.toThrow("redirect:/sign-in?next=%2Fpad");
  });

  it("lets an API outage reach the error screen, instead of sending the person to sign in", async () => {
    fetchMock.mockResolvedValue(answer(500, { error: "x" }));
    await expect(requireUser("/pad")).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("drops a page that is not safe to come back to", async () => {
    incoming.cookie = null;
    await expect(requireUser("//evil.example")).rejects.toThrow(/^redirect:\/sign-in$/);
  });
});

describe("peekSessionUser", () => {
  it("returns the signed-in person", async () => {
    fetchMock.mockResolvedValue(answer(200, { user: ana, apiKey: noKey }));
    expect(await peekSessionUser()).toEqual(ana);
  });

  it("never throws, so a public page still shows when the API is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await peekSessionUser()).toBeNull();
  });
});
