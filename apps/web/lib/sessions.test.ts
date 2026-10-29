import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn<(path: string) => Promise<Response>>());
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  apiFetch: (path: string) => apiFetch(path),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

const { getChatSession } = await import("./sessions");
const { ApiUnavailableError } = await import("./api");

const session = {
  id: "s1",
  rocketId: "crocket1",
  part: "fuel",
  status: "open",
  messages: [{ id: "m1", role: "assistant", text: "Hi!", createdAt: "2026-10-28T10:00:00.000Z" }],
};

function answer(status: number, body: unknown) {
  apiFetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("getChatSession", () => {
  it("is the 404 page for an id that could not name a session, without calling the API", async () => {
    for (const id of ["../me", "s1/../../me", "CAPS", "", "a".repeat(41)]) {
      await expect(getChatSession(id), id).rejects.toThrow("not-found");
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("asks for the session at its own address and answers what the schema allows", async () => {
    answer(200, { ...session, model: "x", userId: "owner" });
    const result = await getChatSession("s1");
    expect(apiFetch).toHaveBeenCalledWith("/api/sessions/s1");
    expect(result).toEqual(session);
  });

  it("is the 404 page when the API says the session is not this person's", async () => {
    answer(404, { error: "That chat session was not found." });
    await expect(getChatSession("s1")).rejects.toThrow("not-found");
  });

  it("is the error page for any other answer, or one in the wrong shape", async () => {
    answer(500, { error: "x" });
    await expect(getChatSession("s1")).rejects.toBeInstanceOf(ApiUnavailableError);
    answer(200, { ...session, id: "../me" });
    await expect(getChatSession("s1")).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
