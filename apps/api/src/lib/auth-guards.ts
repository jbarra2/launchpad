import {
  deleteAccountBody,
  forgotPasswordBody,
  resetPasswordBody,
  sendVerificationBody,
  signInBody,
  signUpBody,
} from "@launchpad/shared";
import { APIError } from "better-auth/api";
import type { ZodType } from "zod";

// Better Auth ships more endpoints than this app uses, and each one is a way to change an account.
// Only these are reachable. Anything else is a 404, even for a signed-in person. Add a path here
// when a screen needs it, together with its test.
export const ALLOWED_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/get-session",
  "/verify-email",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/delete-user",
]);

// The same list as a check on the address a request arrived at, so Express can refuse an unlisted
// path before Better Auth sees it. Better Auth counts every path it is shown toward a rate limit,
// and a path nobody listed would otherwise add a row to the database for each new one. A segment
// that starts with a colon stands for any one segment.
function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LISTED_AUTH_PATTERNS: readonly RegExp[] = [...ALLOWED_AUTH_PATHS].map(
  (template) =>
    new RegExp(
      `^${template
        .split("/")
        .map((segment) => (segment.startsWith(":") ? "[^/]+" : escapeForRegExp(segment)))
        .join("/")}$`,
    ),
);

/** Whether a path, relative to /api/auth and with no query, is one the app lists. */
export function isListedAuthPath(path: string): boolean {
  return LISTED_AUTH_PATTERNS.some((pattern) => pattern.test(path));
}

// Better Auth sets no size caps of its own. The shared schemas set them, for the sign-in screens
// and for this check alike.
const BODY_SCHEMAS: Record<string, ZodType> = {
  "/sign-up/email": signUpBody,
  "/sign-in/email": signInBody,
  "/send-verification-email": sendVerificationBody,
  "/request-password-reset": forgotPasswordBody,
  "/reset-password": resetPasswordBody,
  "/delete-user": deleteAccountBody,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Throws a 400 with a sentence from the shared schema when the body does not fit. Otherwise it
 * returns the body as the schema read it, with names and emails trimmed. The caller hands that to
 * Better Auth in place of the raw one, so a name padded with spaces cannot get past its cap.
 * A path with no schema returns nothing.
 */
export function validateAuthBody(
  path: string,
  body: unknown,
  query: unknown,
): Record<string, unknown> | undefined {
  const schema = BODY_SCHEMAS[path];
  if (!schema) {
    return undefined;
  }
  let input = body;
  if (path === "/reset-password") {
    // The token may come in the link's query instead of the body.
    const fromBody = isRecord(body) ? body.token : undefined;
    const fromQuery = isRecord(query) ? query.token : undefined;
    input = { ...(isRecord(body) ? body : {}), token: fromBody ?? fromQuery };
  }
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data as Record<string, unknown>;
  }
  const issue = result.error.issues[0];
  const message =
    issue && issue.path.length > 0 ? issue.message : "Check what you entered and try again.";
  throw new APIError("BAD_REQUEST", { message, code: "INVALID_INPUT" });
}

const SECRET_KEYS = new Set(["token", "accessToken", "refreshToken", "idToken"]);

/**
 * Better Auth echoes session tokens in several JSON bodies. The cookie is httpOnly, so a script
 * cannot read it, and a body that carried the token would hand it to one anyway. This removes
 * every such key at any depth, so an endpoint added later cannot leak one either.
 */
export function withoutTokens(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutTokens);
  }
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEYS.has(key))
      .map(([key, inner]) => [key, withoutTokens(inner)]),
  );
}
