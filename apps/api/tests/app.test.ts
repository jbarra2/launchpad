import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("api", () => {
  it("answers ok with the app name from the shared package", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, name: "Launchpad" });
  });
});
