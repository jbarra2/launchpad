import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DRAFT, GOOD_KEY, NEXT_QUESTION, OPENER } from "./fake-anthropic.js";
import { startStack, type Stack } from "./harness.js";
import { get, post, send, signedInPerson } from "./http.js";

// A part built by chatting with Claude, through the built web app and the built API, with Claude
// answered by the stand-in in fake-anthropic.ts: save a key, start a session, answer, take the
// draft, and attach it. The key never shows again after it is typed.

let stack: Stack;
// Made up, and only ever used by this test.
const password = "Correct-horse-battery-9"; // public-check: allow secret
let ana = "";
let rocketId = "";
let sessionId = "";

beforeAll(async () => {
  stack = await startStack();
  ana = await signedInPerson(stack, "ana@example.com", password);
  const idea = await post(
    "/api/rockets",
    { name: "Recipe Swap", pitch: "Trade family recipes with people you trust." },
    ana,
  );
  rocketId = ((await idea.json()) as { id: string }).id;
});

afterAll(async () => {
  await stack?.stop();
});

describe("the Claude key", () => {
  it("is refused when Anthropic does not accept it, and nothing is saved", async () => {
    const response = await send("PUT", "/api/me/api-key", { key: "sk-ant-e2e-bad" }, ana);
    expect(response.status).toBe(400);
    expect(await stack.db.apiCredential.count()).toBe(0);
  });

  it("is saved once Anthropic accepts it, and shows only its last 4 characters", async () => {
    const response = await send("PUT", "/api/me/api-key", { key: GOOD_KEY }, ana);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ status: "valid", last4: "good" });
    expect(text).not.toContain(GOOD_KEY);
    const settings = await get("/settings", ana);
    const html = await settings.text();
    expect(html).toContain("••••good");
    expect(html).not.toContain(GOOD_KEY);
  });
});

describe("a part built with Claude", () => {
  it("starts a session for the next part, with Claude's first question", async () => {
    const page = await (await get(`/rockets/${rocketId}`, ana)).text();
    expect(page).toContain("Start session");
    const response = await post(`/api/rockets/${rocketId}/sessions`, {}, ana);
    expect(response.status).toBe(201);
    const session = (await response.json()) as {
      id: string;
      part: string;
      messages: { text: string }[];
    };
    expect(session.part).toBe("fuel");
    expect(session.messages.map((m) => m.text)).toEqual([OPENER]);
    sessionId = session.id;
  });

  it("shows the session page, with the conversation as text", async () => {
    const response = await get(`/rockets/${rocketId}/session`, ana);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Session · Fuel tank");
    expect(html).toContain(OPENER);
  });

  it("answers a message", async () => {
    const response = await post(
      `/api/sessions/${sessionId}/messages`,
      { text: "My cousins." },
      ana,
    );
    expect(response.status).toBe(200);
    const sent = (await response.json()) as { messages: { role: string; text: string }[] };
    expect(sent.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "My cousins."],
      ["assistant", NEXT_QUESTION],
    ]);
  });

  it("drafts the part, and saves nothing until it is attached", async () => {
    const response = await post(`/api/sessions/${sessionId}/draft`, {}, ana);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DRAFT);
    expect(await stack.db.part.count({ where: { rocketId } })).toBe(1);
  });

  it("attaches the part from the chat, closing the session, and puts it in the plan", async () => {
    const edited = { ...DRAFT, summary: `${DRAFT.summary} Edited.` };
    const response = await send(
      "PUT",
      `/api/rockets/${rocketId}/parts/fuel`,
      { ...edited, sessionId },
      ana,
    );
    expect(response.status).toBe(200);
    const rocket = (await response.json()) as {
      parts: { kind: string; source: string; summary: string }[];
      openSession: unknown;
    };
    expect(rocket.parts[1]).toMatchObject({
      kind: "fuel",
      source: "chat",
      summary: edited.summary,
    });
    expect(rocket.openSession).toBeNull();
    const plan = await (await get(`/api/rockets/${rocketId}/plan.md`, ana)).text();
    expect(plan).toContain(edited.summary);
    const page = await (await get(`/rockets/${rocketId}?attached=fuel`, ana)).text();
    expect(page).toContain("The Fuel tank is attached.");
  });

  it("sent Anthropic only the person's key, and asked for the refusal fallback", () => {
    const calls = stack.anthropic.requests;
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /v1/models",
      "GET /v1/models",
      "POST /v1/messages",
      "POST /v1/messages",
      "POST /v1/messages",
    ]);
    for (const call of calls.slice(1)) {
      expect(call.authorization).toBe(`Bearer ${GOOD_KEY}`);
      expect(call.apiKeyHeader).toBeUndefined();
    }
    for (const call of calls.filter((c) => c.path === "/v1/messages")) {
      expect(call.beta).toContain("server-side-fallback-2026-07-01");
      expect(call.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default" });
    }
  });
});

describe("what leaves the servers", () => {
  it("never holds the key: no page, no answer, no line printed", async () => {
    for (const path of ["/pad", "/settings", `/rockets/${rocketId}`]) {
      expect(await (await get(path, ana)).text(), path).not.toContain(GOOD_KEY);
    }
    expect(await (await get("/api/me", ana)).text()).not.toContain(GOOD_KEY);
    expect(stack.output()).not.toContain(GOOD_KEY);
    expect(stack.output()).not.toContain("sk-ant");
  });

  // Pages that read nothing from the request too, such as forgot-password and the 404 page: built
  // ahead of time, they would carry no nonce and their scripts would be blocked.
  it.each([
    ["/", undefined],
    ["/sign-in", undefined],
    ["/sign-up", undefined],
    ["/forgot-password", undefined],
    ["/reset-password", undefined],
    ["/check-email", undefined],
    ["/pad", "ana"],
    ["/no-such-page", "ana"],
  ])("sends %s with a policy that runs only scripts carrying its own nonce", async (path, who) => {
    const response = await get(path, who ? ana : undefined);
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toContain("unsafe-inline");
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) {
      expect(tag).toContain(`nonce="${nonce}"`);
    }
    const again = await get(path, who ? ana : undefined);
    expect(again.headers.get("content-security-policy")).not.toBe(policy);
  });
});

describe("deleting the account", () => {
  it("removes the key, the sessions, their messages, and the usage", async () => {
    const response = await post("/api/auth/delete-user", { password }, ana);
    expect(response.status).toBe(200);
    expect(await stack.db.apiCredential.count()).toBe(0);
    expect(await stack.db.chatSession.count()).toBe(0);
    expect(await stack.db.chatMessage.count()).toBe(0);
    expect(await stack.db.usageEvent.count()).toBe(0);
    expect(await stack.db.keyCheck.count()).toBe(0);
  });
});
