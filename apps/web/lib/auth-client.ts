// Browser calls to Better Auth through the same-origin /api rewrite, so the session cookie it sets
// reaches the browser directly. Server wording never reaches the page: each answer is mapped to a
// sentence written here, except the shared schema's own sentences, which are already written for
// people.

type AuthPath =
  | "/sign-up/email"
  | "/sign-in/email"
  | "/sign-out"
  | "/send-verification-email"
  | "/request-password-reset"
  | "/reset-password"
  | "/delete-user";

// The one page a verification link may land on. The API refuses any other.
export { VERIFIED_LANDING } from "@launchpad/shared";

export type AuthFailure = { ok: false; status: number; code?: string; message?: string };
export type AuthResult<T> = { ok: true; data: T } | AuthFailure;

const SCHEMA_MESSAGE_MAX = 200;

export async function authPost<T = unknown>(path: AuthPath, body: unknown): Promise<AuthResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0 };
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof data?.code === "string" ? data.code : undefined,
      message: typeof data?.message === "string" ? data.message : undefined,
    };
  }
  return { ok: true, data: data as T };
}

export const NETWORK_MESSAGE = "We could not reach Launchpad. Check your connection and try again.";
export const TOO_MANY_MESSAGE =
  "That is too many tries in a short time. Wait a few minutes and try again.";

const MESSAGES: Record<string, string> = {
  // The API gives an account whose address is not confirmed, with the right password, this same
  // answer, so the words have to be true for both.
  INVALID_EMAIL_OR_PASSWORD:
    "We could not sign you in with that email and password. If you signed up recently, confirm your address with the newest link we emailed you.",
  INVALID_TOKEN: "That reset link has expired or was already used. Ask for a new one.",
  INVALID_ORIGIN: "Reload this page and try again.",
  MISSING_OR_NULL_ORIGIN: "Reload this page and try again.",
  INVALID_CALLBACK_URL: "Reload this page and try again.",
  EMAIL_ALREADY_VERIFIED: "That address is already confirmed. You can sign in.",
  INVALID_PASSWORD: "That password is not right. Try again.",
};

/** A sentence the person can act on, for a failed call. */
export function authErrorMessage(result: AuthFailure, fallback: string): string {
  if (result.status === 0) {
    return NETWORK_MESSAGE;
  }
  if (result.status === 429) {
    return TOO_MANY_MESSAGE;
  }
  if (
    result.code === "INVALID_INPUT" &&
    result.message &&
    result.message.length <= SCHEMA_MESSAGE_MAX
  ) {
    return result.message;
  }
  if (result.code && Object.hasOwn(MESSAGES, result.code)) {
    return MESSAGES[result.code]!;
  }
  return fallback;
}
