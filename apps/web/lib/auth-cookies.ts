import { AUTH_COOKIE_PREFIX } from "@launchpad/shared";

// Better Auth adds __Secure- over https. Both names are always accepted: `next start` runs as
// production even when the API beside it runs in development and sets the plain one.
export const SESSION_COOKIE_NAMES = [
  `${AUTH_COOKIE_PREFIX}.session_token`,
  `__Secure-${AUTH_COOKIE_PREFIX}.session_token`,
];

const APP_COOKIE_PREFIXES = [`${AUTH_COOKIE_PREFIX}.`, `__Secure-${AUTH_COOKIE_PREFIX}.`];

function pairsOf(header: string | null): string[] {
  return (header ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean);
}

function nameOf(pair: string): string {
  const equals = pair.indexOf("=");
  return equals === -1 ? pair : pair.slice(0, equals);
}

/** Whether the Cookie header holds a session cookie with a value. It does not check the session. */
export function hasSessionCookie(header: string | null): boolean {
  return pairsOf(header).some((pair) => {
    const name = nameOf(pair);
    return SESSION_COOKIE_NAMES.includes(name) && pair.length > name.length + 1;
  });
}

/**
 * This app's cookies from a Cookie header, exactly as the browser sent them. The signed values are
 * never decoded and encoded again, and cookies that other sites on localhost set stay behind.
 */
export function authCookieHeader(header: string | null): string {
  return pairsOf(header)
    .filter((pair) => APP_COOKIE_PREFIXES.some((prefix) => nameOf(pair).startsWith(prefix)))
    .join("; ");
}
