import { AnthropicError } from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAUDE_BUSY,
  CLAUDE_SLOW,
  claudeHttpError,
  KEY_NOT_ALLOWED,
  KEY_REJECTED,
  KEY_REJECTED_ON_SAVE,
  OUT_OF_CREDIT,
  RATE_LIMITED,
} from "../src/lib/claude-errors.js";
import { connectionError, PLANTED, sdkError, timeoutError } from "./helpers/claude-errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a failed Claude call", () => {
  it.each([
    ["a key Anthropic does not accept", sdkError(401, "authentication_error"), 400, KEY_REJECTED],
    ["a key without access", sdkError(403, "permission_error"), 400, KEY_NOT_ALLOWED],
    ["an account out of credit", sdkError(402, "billing_error"), 402, OUT_OF_CREDIT],
    ["a key Anthropic is limiting", sdkError(429, "rate_limit_error"), 429, RATE_LIMITED],
    ["an error on Anthropic's side", sdkError(500), 503, CLAUDE_BUSY],
    ["Anthropic overloaded", sdkError(529, "overloaded_error"), 503, CLAUDE_BUSY],
    ["a call that timed out", timeoutError(), 504, CLAUDE_SLOW],
    ["a call that could not connect", connectionError(), 504, CLAUDE_SLOW],
  ])("is a sentence for %s, never the SDK's message", (_name, error, status, message) => {
    const answer = claudeHttpError(error);
    expect(answer?.status).toBe(status);
    expect(answer?.message).toBe(message);
    expect(answer?.message).not.toContain(PLANTED);
  });

  it("is out of credit when Anthropic says so with a 400, as it often does", () => {
    const lowCredit = sdkError(
      400,
      "invalid_request_error",
      "Your credit balance is too low to access the Anthropic API.",
    );
    expect(claudeHttpError(lowCredit)).toMatchObject({ status: 402, message: OUT_OF_CREDIT });
    expect(claudeHttpError(sdkError(400, "billing_error"))?.status).toBe(402);
    expect(claudeHttpError(sdkError(402, "api_error"))).toMatchObject({
      status: 402,
      message: OUT_OF_CREDIT,
    });
  });

  it("says the saved key was refused, or that the key just pasted was", () => {
    expect(claudeHttpError(sdkError(401))?.message).toBe(KEY_REJECTED);
    expect(claudeHttpError(sdkError(401), KEY_REJECTED_ON_SAVE)?.message).toBe(
      KEY_REJECTED_ON_SAVE,
    );
  });

  it("is a generic 500 for a request this app got wrong, logged by class and status only", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const error of [sdkError(400, "invalid_request_error"), sdkError(404), sdkError(413)]) {
      const answer = claudeHttpError(error);
      expect(answer?.status).toBe(500);
      expect(answer?.message).not.toContain(PLANTED);
    }
    expect(log.mock.calls).toEqual([
      ["Claude call failed: BadRequestError (400)"],
      ["Claude call failed: NotFoundError (404)"],
      ["Claude call failed: APIError (413)"],
    ]);
  });

  it("is a generic 500 for any other SDK error, such as output it could not read", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(claudeHttpError(new AnthropicError(PLANTED))?.status).toBe(500);
    expect(JSON.stringify(log.mock.calls)).not.toContain(PLANTED);
  });

  it("is left alone when it did not come from the SDK", () => {
    expect(claudeHttpError(new Error("database down"))).toBeUndefined();
    expect(claudeHttpError("a string")).toBeUndefined();
  });
});
