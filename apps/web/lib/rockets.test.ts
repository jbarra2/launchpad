import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn<(path: string) => Promise<Response>>();
vi.mock("./api", async () => {
  const real = await vi.importActual<typeof import("./api")>("./api");
  return { ApiUnavailableError: real.ApiUnavailableError, apiFetch: (p: string) => apiFetch(p) };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

const { getRocket, getRockets } = await import("./rockets");
const { ApiUnavailableError } = await import("./api");

const NOW = "2026-10-27T15:00:00.000Z";
const rocket = {
  id: "crocket1",
  name: "Recipe Swap",
  pitch: "P",
  status: "building",
  parts: [],
  launchedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function answer(status: number, body: unknown) {
  apiFetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("getRocket", () => {
  it("is the 404 page for an id that could not name an idea, without calling the API", async () => {
    for (const id of ["../me", "crocket1/../../me", "CAPS", "", "a".repeat(41)]) {
      await expect(getRocket(id), id).rejects.toThrow("not-found");
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("asks for the idea at its own address and answers what the schema allows", async () => {
    answer(200, { ...rocket, userId: "owner" });
    const result = await getRocket("crocket1");
    expect(apiFetch).toHaveBeenCalledWith("/api/rockets/crocket1");
    expect(result.name).toBe("Recipe Swap");
    expect(result).not.toHaveProperty("userId");
  });

  it("is the 404 page when the API says the idea is not this person's", async () => {
    answer(404, { error: "That idea was not found." });
    await expect(getRocket("crocket1")).rejects.toThrow("not-found");
  });

  it("is the error page for any other answer, or one in the wrong shape", async () => {
    answer(500, { error: "x" });
    await expect(getRocket("crocket1")).rejects.toBeInstanceOf(ApiUnavailableError);
    answer(200, { name: "only a name" });
    await expect(getRocket("crocket1")).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});

describe("getRockets", () => {
  it("answers the list", async () => {
    answer(200, { rockets: [] });
    expect(await getRockets()).toEqual([]);
    expect(apiFetch).toHaveBeenCalledWith("/api/rockets");
  });

  it("is the error page when the list cannot be read", async () => {
    answer(401, { error: "Sign in to continue." });
    await expect(getRockets()).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
