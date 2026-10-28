import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PART_KINDS } from "../packages/shared/src/rockets.js";
import { startStack, type Stack } from "./harness.js";
import { get, post, send, signedInPerson } from "./http.js";

// A rocket built by hand through the built web app, as a browser reaches it: create an idea, write
// the five other parts, see it on the pad, launch it, download both files, and delete the account.
// A second person cannot reach any of it.

let stack: Stack;
// Made up, and only ever used by this test.
const password = "Correct-horse-battery-9"; // public-check: allow secret
let ana = "";
let ben = "";
let rocketId = "";

beforeAll(async () => {
  stack = await startStack();
  ana = await signedInPerson(stack, "ana@example.com", password);
  ben = await signedInPerson(stack, "ben@example.com", password, "Ben");
});

afterAll(async () => {
  await stack?.stop();
});

describe("a rocket built by hand", () => {
  it("starts as an idea with its Engine", async () => {
    const response = await post(
      "/api/rockets",
      { name: "Recipe Swap", pitch: "Trade family recipes with people you trust.", why: "" },
      ana,
    );
    expect(response.status).toBe(201);
    const rocket = (await response.json()) as { id: string; parts: { kind: string }[] };
    expect(rocket.parts.map((part) => part.kind)).toEqual(["engine"]);
    rocketId = rocket.id;
  });

  it("takes the other five parts in order", async () => {
    for (const kind of PART_KINDS.slice(1)) {
      const response = await send(
        "PUT",
        `/api/rockets/${rocketId}/parts/${kind}`,
        { summary: `The ${kind} summary.`, points: [`A ${kind} point`] },
        ana,
      );
      expect(response.status, kind).toBe(200);
    }
  });

  it("shows on the pad, ready to launch", async () => {
    const response = await get("/pad", ana);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Recipe Swap");
    expect(html).toContain("Ready to launch");
    expect(html).toContain("Rocket, 6 of 6 parts");
  });

  it("shows its page with Launch, and a part's form", async () => {
    const page = await get(`/rockets/${rocketId}`, ana);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("The nose summary.");
    // The button itself: "Launch" alone is also in the name Launchpad.
    expect(html).toContain('aria-haspopup="dialog">Launch</button>');
    const form = await get(`/rockets/${rocketId}/parts/fuel`, ana);
    expect(form.status).toBe(200);
    expect(await form.text()).toContain("Edit the Fuel tank");
  });

  it("is a 404 page and a 404 answer for someone else", async () => {
    for (const path of [`/rockets/${rocketId}`, `/rockets/${rocketId}/parts/fuel`]) {
      const page = await get(path, ben);
      expect(page.status, path).toBe(404);
      expect(await page.text(), path).not.toContain("Recipe Swap");
    }
    for (const path of [`/api/rockets/${rocketId}`, `/api/rockets/${rocketId}/plan.md`]) {
      expect((await get(path, ben)).status, path).toBe(404);
    }
    const write = await send(
      "PUT",
      `/api/rockets/${rocketId}/parts/fuel`,
      { summary: "Taken over.", points: [] },
      ben,
    );
    expect(write.status).toBe(404);
  });

  it("launches, and then refuses a change", async () => {
    const launch = await post(`/api/rockets/${rocketId}/launch`, {}, ana);
    expect(launch.status).toBe(200);
    const edit = await send(
      "PUT",
      `/api/rockets/${rocketId}/parts/engine`,
      { summary: "Too late.", points: [] },
      ana,
    );
    expect(edit.status).toBe(409);
    const html = await (await get(`/rockets/${rocketId}`, ana)).text();
    expect(html).toContain("The idea is locked.");
    expect(html).not.toContain(`/rockets/${rocketId}/parts/`);
  });

  it("downloads PLAN.md and KICKOFF.md with every part, through the web app", async () => {
    const plan = await get(`/api/rockets/${rocketId}/plan.md`, ana);
    expect(plan.status).toBe(200);
    expect(plan.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(plan.headers.get("content-disposition")).toBe('attachment; filename="PLAN.md"');
    const text = await plan.text();
    expect(text.startsWith("# Recipe Swap\n")).toBe(true);
    for (const kind of PART_KINDS.slice(1)) {
      expect(text).toContain(`The ${kind} summary.`);
    }
    const kickoff = await get(`/api/rockets/${rocketId}/kickoff.md`, ana);
    expect(kickoff.headers.get("content-disposition")).toBe('attachment; filename="KICKOFF.md"');
    expect(await kickoff.text()).toContain(text);
  });

  it("is on the Launched shelf of the pad", async () => {
    const html = await (await get("/pad", ana)).text();
    expect(html).toContain("Launched");
    expect(html).toContain(`/api/rockets/${rocketId}/plan.md`);
  });
});

describe("deleting the account", () => {
  it("takes the person's ideas with it, and leaves the other person's", async () => {
    const bens = await post("/api/rockets", { name: "Bike Log", pitch: "Rides." }, ben);
    expect(bens.status).toBe(201);
    const response = await post("/api/auth/delete-user", { password }, ana);
    expect(response.status).toBe(200);
    expect(await stack.db.rocket.count({ where: { id: rocketId } })).toBe(0);
    expect(await stack.db.part.count({ where: { rocketId } })).toBe(0);
    expect(await stack.db.rocket.count()).toBe(1);
  });
});
