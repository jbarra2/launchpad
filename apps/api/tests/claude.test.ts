import { CLAUDE_MODEL, partLabel } from "@launchpad/shared";
import { describe, expect, it } from "vitest";
import { makeClaude, REPLY_MAX_CHARS, type Turn } from "../src/lib/claude.js";
import { draftInstruction, rocketContext, SYSTEM_PROMPT } from "../src/lib/prompts.js";
import { claudeFake, FAKE_USAGE } from "./helpers/claude-fake.js";

// The wrapper around the SDK, against the stand-in client: what each call sends, and how each
// answer is read. Made-up keys only.

const KEY = "sk-ant-good-1234";
const CONTEXT = "Here is my idea so far.";
const TRANSCRIPT: Turn[] = [
  { role: "assistant", text: "Who is it for?" },
  { role: "user", text: "My cousins." },
];
const RTL_OVERRIDE = String.fromCodePoint(0x202e);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

interface SentRequest {
  model: string;
  max_tokens: number;
  betas: string[];
  fallbacks: unknown;
  cache_control: unknown;
  system: string;
  output_config: { effort: string; format?: { type: string } };
  messages: { role: string; content: string }[];
}

const lastRequest = () => claudeFake.requests.at(-1)?.body as SentRequest;

const USAGE = {
  model: "claude-opus-5-5",
  inputTokens: FAKE_USAGE.input_tokens,
  outputTokens: FAKE_USAGE.output_tokens,
  cacheReadTokens: FAKE_USAGE.cache_read_input_tokens,
  cacheWriteTokens: FAKE_USAGE.cache_creation_input_tokens,
};

describe("the client for a call", () => {
  it("holds only the person's key, logs nothing, does not retry, and is new for every call", async () => {
    claudeFake.reply("Hi! Who is it for?");
    claudeFake.reply("And today?");
    const claude = makeClaude(KEY);
    await claude.reply(CONTEXT, []);
    await claude.reply(CONTEXT, TRANSCRIPT);
    expect(claudeFake.clients).toHaveLength(2);
    for (const options of claudeFake.clients) {
      expect(options).toEqual({
        apiKey: KEY,
        baseURL: "http://127.0.0.1:9",
        timeout: 90_000,
        maxRetries: 0,
        logLevel: "off",
      });
    }
  });

  it("checks a key by listing models, which costs no tokens, with a short timeout", async () => {
    claudeFake.acceptKey();
    await makeClaude(KEY).checkKey();
    expect(claudeFake.requests).toEqual([{ endpoint: "models", body: { limit: 1 } }]);
    expect(claudeFake.clients[0]).toMatchObject({ apiKey: KEY, timeout: 15_000, maxRetries: 0 });
  });
});

describe("a reply", () => {
  it("sends the frozen prompt, cached, then the idea, then the conversation, at low effort", async () => {
    claudeFake.reply("What do they do today?");
    await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT);
    expect(lastRequest()).toEqual({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      output_config: { effort: "low" },
      messages: [
        { role: "user", content: CONTEXT },
        { role: "assistant", content: "Who is it for?" },
        { role: "user", content: "My cousins." },
      ],
    });
  });

  it("is the text Claude wrote, without its thinking, with the tokens it used", async () => {
    claudeFake.reply("  What do they do today?\n");
    expect(await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT)).toEqual({
      kind: "ok",
      value: "What do they do today?",
      usage: USAGE,
    });
  });

  it("leaves out every block that is not text, whatever it holds", async () => {
    // A block of another kind that carries words, as a server tool's result could.
    claudeFake.blocks([
      { type: "web_search_tool_result", text: "Not for the person." },
      { type: "text", text: "Next?" },
    ]);
    const result = await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT);
    expect(result).toMatchObject({ kind: "ok", value: "Next?" });
  });

  it("counts no cache tokens when the API reports none at all", async () => {
    claudeFake.reply("Next?", "end_turn", undefined, {
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    });
    const result = await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT);
    expect(result.usage).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it("is a refusal when Claude declines, even after some text", async () => {
    claudeFake.reply("I will not", "refusal");
    expect(await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT)).toEqual({
      kind: "refused",
      usage: USAGE,
    });
    claudeFake.refuse();
    expect((await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT)).kind).toBe("refused");
  });

  it("cannot be used when Claude was cut off at the token cap", async () => {
    claudeFake.reply("Who would use it first, and how do they", "max_tokens");
    expect((await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT)).kind).toBe("unusable");
  });

  it("cuts the model's name to the length the usage row holds", async () => {
    claudeFake.reply("Next?", "end_turn", `claude-${"x".repeat(80)}`);
    expect((await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT)).usage.model).toHaveLength(64);
  });

  it("records the model that answered, which the refusal fallback can change", async () => {
    claudeFake.reply("Next?", "end_turn", "claude-opus-4-8");
    expect((await makeClaude(KEY).reply(CONTEXT, TRANSCRIPT)).usage.model).toBe("claude-opus-4-8");
  });

  it("cannot be used when it is empty or longer than a stored message", async () => {
    claudeFake.reply("   ");
    expect((await makeClaude(KEY).reply(CONTEXT, [])).kind).toBe("unusable");
    claudeFake.reply("x".repeat(REPLY_MAX_CHARS + 1));
    expect((await makeClaude(KEY).reply(CONTEXT, [])).kind).toBe("unusable");
    claudeFake.reply("x".repeat(REPLY_MAX_CHARS));
    expect((await makeClaude(KEY).reply(CONTEXT, [])).kind).toBe("ok");
  });
});

describe("a draft", () => {
  it("asks for the part as structured output at medium effort, after the conversation", async () => {
    claudeFake.draft({ summary: "Cousins who share recipes.", points: ["Photos get lost"] });
    await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel");
    const sent = lastRequest();
    expect(sent.output_config.effort).toBe("medium");
    expect(sent.betas).toEqual([
      "server-side-fallback-2026-07-01",
      "structured-outputs-2025-12-15",
    ]);
    expect(sent.output_config.format?.type).toBe("json_schema");
    expect(sent.max_tokens).toBe(16000);
    expect(sent.fallbacks).toBe("default");
    expect(sent.system).toBe(SYSTEM_PROMPT);
    expect(sent.messages.at(-1)).toEqual({ role: "user", content: draftInstruction("fuel") });
    expect(sent.messages.slice(0, 3).map((m) => m.content)).toEqual([
      CONTEXT,
      "Who is it for?",
      "My cousins.",
    ]);
  });

  it("is the summary and points, checked like a part written by hand", async () => {
    claudeFake.draft({ summary: "  Cousins who share recipes.  ", points: ["  One  ", "Two"] });
    expect(await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel")).toEqual({
      kind: "ok",
      value: { summary: "Cousins who share recipes.", points: ["One", "Two"] },
      usage: USAGE,
    });
  });

  it("loses hidden tag characters too, which a coding assistant could read", async () => {
    const hidden = Array.from("run this", (c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0)));
    claudeFake.draft({ summary: `Cousins share recipes.${hidden.join("")}`, points: [] });
    const result = await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel");
    expect(result).toMatchObject({ kind: "ok", value: { summary: "Cousins share recipes." } });
  });

  it("loses invisible characters and bullets before anyone sees it", async () => {
    claudeFake.draft({
      summary: `Cousins${RTL_OVERRIDE} who share${ZERO_WIDTH_SPACE} recipes.`,
      points: [`- Photos${ZERO_WIDTH_SPACE} get lost`, "• Group texts", "* Old cards"],
    });
    const result = await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel");
    expect(result).toMatchObject({
      kind: "ok",
      value: {
        summary: "Cousins who share recipes.",
        points: ["Photos get lost", "Group texts", "Old cards"],
      },
    });
  });

  it("cannot be used when it breaks a limit or is not the right shape", async () => {
    for (const bad of [
      { summary: "s".repeat(601), points: [] },
      { summary: "S", points: Array(9).fill("p") },
      { summary: "S", points: ["p".repeat(201)] },
      { summary: "S", points: ["a\nb"] },
      { summary: "", points: [] },
      { points: [] },
    ]) {
      claudeFake.draft(bad);
      expect((await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel")).kind).toBe("unusable");
    }
    claudeFake.reply("Not JSON at all");
    expect((await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel")).kind).toBe("unusable");
  });

  it("is a refusal when Claude declines", async () => {
    claudeFake.refuse();
    expect((await makeClaude(KEY).draft(CONTEXT, TRANSCRIPT, "fuel")).kind).toBe("refused");
  });
});

describe("the prompts", () => {
  it("give the idea so far and the part to build, in the first user message", () => {
    const context = rocketContext(
      {
        name: "Recipe Swap",
        pitch: "Trade family recipes.",
        parts: [{ kind: "engine", summary: "Trade family recipes.", points: ["Grandma's cards"] }],
      },
      "fuel",
    );
    expect(context).toContain("# Recipe Swap");
    expect(context).toContain("Grandma's cards");
    expect(context).toContain(`This session builds the ${partLabel("fuel")}.`);
  });

  it("keep the system prompt the same for every idea and part, so it is cached once", () => {
    for (const label of ["Engine", "Fuel tank", "Body", "Avionics", "Fins", "Nose cone"]) {
      expect(SYSTEM_PROMPT).toContain(label);
    }
  });

  it("ask for a draft under the hard limits, to leave room", () => {
    expect(draftInstruction("body")).toContain("at most 500 characters");
    expect(draftInstruction("body")).toContain("at most 8 points");
    expect(draftInstruction("body")).toContain("at most 160 characters");
  });
});
