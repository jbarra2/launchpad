import { describe, expect, it } from "vitest";
import {
  apiKeyBody,
  apiKeyState,
  chatSession,
  MESSAGE_MAX,
  meResponse,
  messageBody,
  partDraft,
} from "../src/index.js";

const ESCAPE = String.fromCodePoint(0x1b);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("apiKeyBody", () => {
  // Made-up keys, short enough that they cannot be mistaken for real ones.
  it("accepts a key in the shape Anthropic makes, trimmed", () => {
    expect(apiKeyBody.parse({ key: "  sk-ant-good-1234  " })).toEqual({ key: "sk-ant-good-1234" });
  });

  it("refuses anything that is not one unbroken key, with a sentence", () => {
    for (const key of ["", "   ", "hello", "sk-ant-", "sk-ant-a b", "sk-ant-a\nb", "sk-a-1234"]) {
      expect(apiKeyBody.safeParse({ key }).success, JSON.stringify(key)).toBe(false);
    }
    expect(messages(apiKeyBody.safeParse({ key: "hello" }))).toEqual([
      "A Claude key starts with sk-ant- and has no spaces. Check what you pasted.",
    ]);
    expect(messages(apiKeyBody.safeParse({}))).toEqual(["Paste your Claude key."]);
  });

  it("caps the length", () => {
    expect(apiKeyBody.safeParse({ key: `sk-ant-${"a".repeat(193)}` }).success).toBe(true);
    expect(messages(apiKeyBody.safeParse({ key: `sk-ant-${"a".repeat(194)}` }))).toEqual([
      "That is longer than a Claude key. Check what you pasted.",
    ]);
  });

  it("refuses a field it does not have, such as an owner", () => {
    expect(apiKeyBody.safeParse({ key: "sk-ant-good-1234", userId: "u2" }).success).toBe(false);
  });
});

describe("the key a page may see", () => {
  it("is none, or a status with the last 4 characters and the time it was checked", () => {
    expect(apiKeyState.parse({ status: "none" })).toEqual({ status: "none" });
    const checkedAt = new Date().toISOString();
    expect(apiKeyState.parse({ status: "valid", last4: "abcd", checkedAt })).toEqual({
      status: "valid",
      last4: "abcd",
      checkedAt,
    });
  });

  it("drops anything else, so a key cannot leave through it", () => {
    const parsed = meResponse.parse({
      user: { id: "u1", name: "Ana", email: "ana@example.com" },
      apiKey: {
        status: "valid",
        last4: "abcd",
        checkedAt: new Date().toISOString(),
        key: "sk-ant-good-1234",
        ciphertext: "x",
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("sk-ant");
    expect(JSON.stringify(parsed)).not.toContain("ciphertext");
  });

  it("refuses more than 4 characters of a key", () => {
    const checkedAt = new Date().toISOString();
    expect(apiKeyState.safeParse({ status: "valid", last4: "1234abcd", checkedAt }).success).toBe(
      false,
    );
  });
});

describe("messageBody", () => {
  it("accepts a message over several lines, trimmed, with Windows line breaks stored as plain", () => {
    expect(messageBody.parse({ text: "  My cousins.\r\nMostly photos.  " })).toEqual({
      text: "My cousins.\nMostly photos.",
    });
  });

  it("caps a message at 2,000 characters", () => {
    expect(messageBody.safeParse({ text: "m".repeat(MESSAGE_MAX) }).success).toBe(true);
    expect(messages(messageBody.safeParse({ text: "m".repeat(MESSAGE_MAX + 1) }))).toEqual([
      "Use 2000 characters or fewer for the message.",
    ]);
  });

  it("refuses an empty message, control characters, and invisible ones", () => {
    expect(messages(messageBody.safeParse({ text: "  \n " }))).toEqual(["Write a message first."]);
    expect(messageBody.safeParse({ text: `a${ESCAPE}[2Jb` }).success).toBe(false);
    expect(messages(messageBody.safeParse({ text: `a${RIGHT_TO_LEFT_OVERRIDE}b` }))).toEqual([
      "The message has invisible characters in it. Type it again instead of pasting it.",
    ]);
  });

  it("refuses a field it does not have", () => {
    expect(messageBody.safeParse({ text: "hi", role: "assistant" }).success).toBe(false);
  });
});

describe("chatSession", () => {
  it("drops fields it does not list, and takes ids only in the database's shape", () => {
    const base = { rocketId: "r1", part: "fuel", status: "open", messages: [] };
    const parsed = chatSession.parse({ ...base, id: "s1", userId: "owner", model: "x" });
    expect(parsed).toEqual({ ...base, id: "s1" });
    expect(chatSession.safeParse({ ...base, id: "../me" }).success).toBe(false);
  });
});

describe("partDraft", () => {
  it("is a summary and a list of points", () => {
    expect(partDraft.parse({ summary: "S", points: ["a"] })).toEqual({
      summary: "S",
      points: ["a"],
    });
    expect(partDraft.safeParse({ summary: "S" }).success).toBe(false);
  });
});
