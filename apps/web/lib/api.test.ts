// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const incoming = vi.hoisted(() => ({ cookie: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(incoming.cookie ? { cookie: incoming.cookie } : {}),
}));

const { ApiUnavailableError, apiFetch } = await import("./api");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  incoming.cookie = null;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("apiFetch", () => {
  it("calls the API at the address fixed into the build, without caching", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await apiFetch("/api/me");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test:4100/api/me");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  it("passes on only this app's cookies from the browser's request", async () => {
    incoming.cookie = "other=secret; launchpad.session_token=a.b%3D";
    await apiFetch("/api/me");
    const sent = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(sent.get("cookie")).toBe("launchpad.session_token=a.b%3D");
  });

  it("refuses a path that would point the call at another host", async () => {
    await expect(apiFetch("@evil.example/x" as `/api/${string}`)).rejects.toThrow();
    await expect(apiFetch("//evil.example/api/x" as `/api/${string}`)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an API it cannot reach as unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(apiFetch("/api/me")).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
