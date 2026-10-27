// Where a person goes after signing in when no other page is asked for, or the one asked for is not
// safe to send them to.
export const AFTER_SIGN_IN = "/pad";

const MAX_LENGTH = 200;
// Printable ASCII only. A browser drops tabs and line breaks from an address, so "/\t/x" would open
// "//x", another site. Spaces and characters outside ASCII have no place in a path of this app.
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;
const ENCODED_SEPARATOR = /%(2f|5c)/i;
const BASE = "http://launchpad.invalid";
// Pages that make no sense to land on after signing in. Landing on the reset page with a token in
// the address someone else chose would also put their link in front of this person.
const AUTH_PAGES = new Set([
  "/sign-in",
  "/sign-up",
  "/check-email",
  "/forgot-password",
  "/reset-password",
]);

/**
 * A page of this site that the browser may be sent to after signing in, or null. The answer is the
 * path the browser would really open, never the raw input.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) {
    return null;
  }
  if (!PRINTABLE_ASCII.test(value) || value.includes("\\")) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (ENCODED_SEPARATOR.test(value.split(/[?#]/, 1)[0] ?? "")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) {
    return null;
  }

  // The path is judged the way a server reads it: decoded, and without regard to case, because
  // Express matches routes either way. "/pad/%2e%2e/api/me" is "/api/me" by now.
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return null;
  }
  // Next sends "/reset-password/" on to "/reset-password", so the page is judged without the slash.
  const page = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (isUnder(path, "/api") || isUnder(path, "/_next") || AUTH_PAGES.has(page)) {
    return null;
  }
  // The answer gets the same check as the input: resolving "." and ".." can turn "/.//x", which
  // passed above, into "//x", which a browser opens as another site.
  if (url.pathname.startsWith("//")) {
    return null;
  }
  return url.pathname + url.search;
}

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
