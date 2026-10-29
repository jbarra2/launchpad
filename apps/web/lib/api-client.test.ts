import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorMessage,
  apiSend,
  claudeErrorMessage,
  detailErrors,
  SIGNED_OUT_MESSAGE,
} from "./api-client";
import { NETWORK_MESSAGE } from "./auth-client";
import { formatDay, partsToGo, progressText } from "./format";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

describe("apiSend", () => {
  it("sends JSON to the same origin with the cookie, and never follows a redirect", async () => {
    answer(200, { id: "c1" });
    const result = await apiSend("PUT", "/api/rockets/c1/parts/fuel", { summary: "s" });
    expect(result).toEqual({ ok: true, data: { id: "c1" } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/rockets/c1/parts/fuel");
    expect(init).toMatchObject({
      method: "PUT",
      credentials: "same-origin",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: '{"summary":"s"}',
    });
  });

  it("sends no body and no content type when there is nothing to send", async () => {
    answer(204, undefined);
    expect(await apiSend("DELETE", "/api/rockets/c1")).toEqual({ ok: true, data: null });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: {}, body: undefined });
  });

  it("keeps the API's sentence and field details, and drops what is not shaped like them", async () => {
    answer(400, {
      error: "Some of what you entered is not valid. Check it and try again.",
      details: [
        { path: "points.2", message: "Use 200 characters or fewer for the point." },
        { path: "x", message: "m".repeat(301) },
        { path: 5, message: "no" },
        "junk",
      ],
    });
    const result = await apiSend("POST", "/api/rockets", {});
    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "Some of what you entered is not valid. Check it and try again.",
      details: [{ path: "points.2", message: "Use 200 characters or fewer for the point." }],
    });
  });

  it("answers status 0 when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await apiSend("POST", "/api/rockets", {})).toEqual({
      ok: false,
      status: 0,
      details: [],
    });
  });
});

describe("apiErrorMessage", () => {
  const fallback = "We could not save it. Try again.";

  it("passes the API's own sentence through for a refusal", () => {
    expect(
      apiErrorMessage(
        { ok: false, status: 409, message: "Add the Fuel tank first.", details: [] },
        fallback,
      ),
    ).toBe("Add the Fuel tank first.");
  });

  it("uses its own words for no connection, an ended session, too many tries, and a fault", () => {
    expect(apiErrorMessage({ ok: false, status: 0, details: [] }, fallback)).toMatch(/reach/);
    expect(apiErrorMessage({ ok: false, status: 401, message: "x", details: [] }, fallback)).toBe(
      SIGNED_OUT_MESSAGE,
    );
    expect(
      apiErrorMessage({ ok: false, status: 429, message: "x", details: [] }, fallback),
    ).toMatch(/too many tries/);
    expect(apiErrorMessage({ ok: false, status: 500, message: "x", details: [] }, fallback)).toBe(
      fallback,
    );
    expect(apiErrorMessage({ ok: false, status: 409, details: [] }, fallback)).toBe(fallback);
  });
});

describe("detailErrors", () => {
  it("keeps the first message for each top-level field", () => {
    expect(
      detailErrors([
        { path: "points.3", message: "first" },
        { path: "points.4", message: "second" },
        { path: "summary", message: "summary" },
      ]),
    ).toEqual({ points: "first", summary: "summary" });
  });
});

describe("the words for progress and dates", () => {
  it("says how far along an idea is", () => {
    expect(progressText(["engine", "fuel", "body"], false)).toBe("3 of 6 parts");
    expect(progressText(["engine", "fuel", "body", "avionics", "fins", "nose"], false)).toBe(
      "Ready to launch",
    );
    expect(progressText(["engine"], true)).toBe("Launched");
    expect(partsToGo(["engine", "fuel", "body", "avionics", "fins"])).toBe("1 part to go");
    expect(partsToGo(["engine"])).toBe("5 parts to go");
  });

  it("prints a day in UTC, the same on the server and in the browser", () => {
    // Already Oct 28 in UTC, and still Oct 27 in the zone the tests run in.
    expect(formatDay("2026-10-28T00:30:00.000Z")).toBe("Oct 28, 2026");
  });
});

describe("claudeErrorMessage", () => {
  const failure = (status: number, message?: string) => ({
    ok: false as const,
    status,
    message,
    details: [],
  });

  it("shows the API's sentence for a limit or a problem with Claude", () => {
    expect(claudeErrorMessage(failure(429, "This session has 30 answers."), "x")).toBe(
      "This session has 30 answers.",
    );
    expect(claudeErrorMessage(failure(503, "Claude is busy; try again."), "x")).toBe(
      "Claude is busy; try again.",
    );
    expect(claudeErrorMessage(failure(504, "Claude took too long; try again."), "x")).toBe(
      "Claude took too long; try again.",
    );
  });

  it("keeps the page's own sentence for a 500, or when there is none", () => {
    expect(
      claudeErrorMessage(failure(500, "Something went wrong on our side."), "Try again."),
    ).toBe("Try again.");
    expect(claudeErrorMessage(failure(409), "Try again.")).toBe("Try again.");
  });

  it("says when the network or the sign-in is the problem", () => {
    expect(claudeErrorMessage(failure(0), "x")).toBe(NETWORK_MESSAGE);
    expect(claudeErrorMessage(failure(401, "Sign in to continue."), "x")).toBe(SIGNED_OUT_MESSAGE);
  });
});
