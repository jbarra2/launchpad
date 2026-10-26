import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { WEB_ORIGIN, createVerifiedUser, get, post } from "./helpers/auth.js";

describe("GET /api/me", () => {
  it("answers 401 with a sentence when nobody is signed in", async () => {
    const response = await get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Sign in to continue." });
  });

  it("answers with the signed-in person and nothing else", async () => {
    const { cookie, userId } = await createVerifiedUser("ana@example.com", "Ana");
    const response = await get("/api/me", { cookie });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: userId, name: "Ana", email: "ana@example.com" },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|hash/i);
  });

  it("answers 401 once the session has expired", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await get("/api/me", { cookie })).status).toBe(401);
  });

  it("takes the person from the session and from nothing else the request says", async () => {
    const ana = await createVerifiedUser("ana@example.com", "Ana");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const response = await get(`/api/me?userId=${ben.userId}`, { cookie: ana.cookie });
    expect(response.body.user.id).toBe(ana.userId);
  });
});

describe("every route under /api needs a session", () => {
  it.each(["/api/me", "/api/no-such-route", "/api/rockets", "/api/auth"])(
    "answers GET %s with 401 when nobody is signed in",
    async (path) => {
      expect((await get(path)).status).toBe(401);
    },
  );

  it("answers 401 before it reads a body that is not valid", async () => {
    const response = await post("/api/me", {}).set("content-type", "application/json").send("{bad");
    expect(response.status).toBe(401);
  });

  it("answers an unknown route 404 once the person is signed in", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    expect((await get("/api/no-such-route", { cookie })).status).toBe(404);
  });
});

describe("a change that comes from another site", () => {
  it("is refused with 403, whether the browser says so or the origin does", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    const byOrigin = await post("/api/me", {}, { cookie, origin: "https://evil.example" });
    expect(byOrigin.status).toBe(403);
    const byFetchSite = await post("/api/me", {}, { cookie }).set("Sec-Fetch-Site", "cross-site");
    expect(byFetchSite.status).toBe(403);
  });

  it("is refused when a cookie comes with no origin at all", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    expect((await post("/api/me", {}, { cookie, origin: null })).status).toBe(403);
  });

  it("lets the web app's own origin through to the route", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    // /api/me has no POST route, so an allowed origin ends at 404 and not 403.
    expect((await post("/api/me", {}, { cookie, origin: WEB_ORIGIN })).status).toBe(404);
  });
});
