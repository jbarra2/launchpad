import {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import {
  badRequest,
  gatewayTimeout,
  HttpError,
  paymentRequired,
  serviceUnavailable,
  tooManyRequests,
} from "../errors/http-error.js";

// Every failed Claude call becomes a sentence the person can act on. The SDK's own message is never
// passed on or logged: it can hold Anthropic's wording or a piece of what was sent.

export const KEY_REJECTED = "Anthropic did not accept your key. Replace it in Settings.";
export const KEY_REJECTED_ON_SAVE = "Anthropic did not accept that key. Check it and try again.";
export const KEY_NOT_ALLOWED =
  "Anthropic did not let this key use Claude. Check the key's workspace in the Claude Console.";
export const OUT_OF_CREDIT = "Your Anthropic account is out of credit.";
export const RATE_LIMITED = "Anthropic is limiting your key; try again in a minute.";
export const CLAUDE_BUSY = "Claude is busy; try again.";
export const CLAUDE_SLOW = "Claude took too long; try again.";
const UNEXPECTED = "Something went wrong on our side. Try again in a moment.";

/**
 * Anthropic answers an account with too little credit with a 400 whose message says so, as well as
 * with a 402. The SDK has no class for either, so the 400 is known by its words.
 */
function isOutOfCredit(error: unknown): boolean {
  if (error instanceof APIError && (error.status === 402 || error.type === "billing_error")) {
    return true;
  }
  if (!(error instanceof BadRequestError)) {
    return false;
  }
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === "string" && /credit balance/i.test(message);
}

/**
 * The answer for an error thrown by a Claude call, checked most specific first, or undefined for
 * an error that is not the SDK's. `keyRejected` is the sentence for a key Anthropic refused.
 */
export function claudeHttpError(error: unknown, keyRejected = KEY_REJECTED): HttpError | undefined {
  if (error instanceof AuthenticationError) {
    return badRequest(keyRejected);
  }
  if (error instanceof PermissionDeniedError) {
    return badRequest(KEY_NOT_ALLOWED);
  }
  if (error instanceof RateLimitError) {
    return tooManyRequests(RATE_LIMITED);
  }
  // A 500 from Anthropic, and a 529 when it is overloaded.
  if (error instanceof InternalServerError) {
    return serviceUnavailable(CLAUDE_BUSY);
  }
  // The timeout is the more specific of the two, though both get the same sentence.
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return gatewayTimeout(CLAUDE_SLOW);
  }
  if (isOutOfCredit(error)) {
    return paymentRequired(OUT_OF_CREDIT);
  }
  if (error instanceof AnthropicError) {
    // Anything else from the SDK is a request this app got wrong. The class and the status are
    // enough to find it.
    const status = error instanceof APIError ? (error.status ?? "no status") : "no status";
    console.error(`Claude call failed: ${error.constructor.name} (${status})`);
    return new HttpError(500, UNEXPECTED);
  }
  return undefined;
}
