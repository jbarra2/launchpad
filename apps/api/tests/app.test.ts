import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /health", () => {
  it("answers ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("sends the security headers and does not name the framework", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("caching", () => {
  it("forbids it on an answer, on an unknown route, and on a refused body", async () => {
    const answer = await request(app).get("/health");
    const unknown = await request(app).get("/no-such-route");
    const refused = await request(app)
      .post("/health")
      .set("content-type", "application/json")
      .send("{not json");
    for (const response of [answer, unknown, refused]) {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.etag).toBeUndefined();
    }
  });
});

describe("requests the API refuses", () => {
  it("answers an unknown route with a sentence and does not repeat the address", async () => {
    const response = await request(app).get("/no-such-route-7f3a");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Nothing was found at that address." });
    expect(response.text).not.toContain("no-such-route-7f3a");
  });

  it("answers a body that is not JSON with 400 and no stack", async () => {
    const response = await request(app)
      .post("/health")
      .set("content-type", "application/json")
      .send("{not json");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "That request could not be read. Try again." });
    expect(response.text).not.toMatch(/node_modules|\.ts:\d+|SyntaxError/);
  });

  it("answers a body over 32 kb with 413", async () => {
    const response = await request(app)
      .post("/health")
      .send({ text: "x".repeat(40_000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "That is too much to send at once. Shorten it and try again.",
    });
  });

  it("answers a body in an unsupported charset with 415", async () => {
    const response = await request(app)
      .post("/health")
      .set("content-type", "application/json; charset=iso-8859-1")
      .send("{}");
    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: "That request could not be read. Try again." });
  });

  it("answers an encoding it does not support with 415", async () => {
    const response = await request(app)
      .post("/health")
      .set("content-type", "application/json")
      .set("content-encoding", "x-not-a-real-encoding")
      .send("{}");
    expect(response.status).toBe(415);
  });

  it.each(["gzip", "deflate", "br"])(
    "answers a %s body that does not unpack with 400, and does not log a fault",
    async (encoding) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await request(app)
        .post("/health")
        .set("content-type", "application/json")
        .set("content-encoding", encoding)
        .send("{}");
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "That request could not be read. Try again." });
      expect(log).not.toHaveBeenCalled();
    },
  );
});
