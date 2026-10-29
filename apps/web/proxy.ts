import { NextResponse, type NextRequest } from "next/server";
import { apiOrigin } from "@/lib/api-origin";
import { authCookieHeader, hasSessionCookie } from "@/lib/auth-cookies";
import { safeNextPath } from "@/lib/safe-path";

// The pages a signed-out visitor may open. Matched exactly: "/sign-in/x" and "/Sign-In" are not
// on the list, so they are treated like any other page.
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/sign-up",
  "/sign-in",
  "/check-email",
  "/forgot-password",
  "/reset-password",
]);

const SESSION_CHECK_TIMEOUT_MS = 3_000;

type SessionState = "signed-in" | "signed-out" | "unknown";

interface SessionCheck {
  state: SessionState;
  setCookies: string[];
}

// Asks the API whether the session cookie still names a session. Better Auth renews a session that
// is over an hour old, and server components cannot set cookies, so the renewed cookie is passed
// on from here. Without it a session would end a day after sign-in however often it was used.
async function checkSession(cookieHeader: string | null): Promise<SessionCheck> {
  try {
    const response = await fetch(`${apiOrigin()}/api/auth/get-session`, {
      headers: { accept: "application/json", cookie: authCookieHeader(cookieHeader) },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
    });
    if (response.status === 401) {
      return { state: "signed-out", setCookies: response.headers.getSetCookie() };
    }
    if (response.status !== 200) {
      return { state: "unknown", setCookies: [] };
    }
    const unreadable = Symbol("unreadable");
    const body = (await response.json().catch(() => unreadable)) as
      { user?: { id?: unknown } } | null | typeof unreadable;
    // Better Auth answers null for a session that has ended. Any other shape is a surprise, so the
    // page decides from its own check rather than the two disagreeing into a redirect loop.
    if (body === null) {
      return { state: "signed-out", setCookies: response.headers.getSetCookie() };
    }
    if (body !== unreadable && typeof body?.user?.id === "string") {
      return { state: "signed-in", setCookies: response.headers.getSetCookie() };
    }
    return { state: "unknown", setCookies: [] };
  } catch {
    return { state: "unknown", setCookies: [] };
  }
}

/**
 * The Content-Security-Policy for a page. Scripts run only with this request's nonce, which Next
 * reads from the request's own header and puts on its scripts and styles, and nothing loads from
 * another site. Development adds what Next's dev server needs: eval for React's error overlay, and
 * the styles it injects without a nonce.
 */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** 16 random bytes in base64, new for every request. */
function makeNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/** Lets the page render, with the policy on the request (for Next) and on the response. */
function render(request: NextRequest, policy: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

function signInRedirect(request: NextRequest): NextResponse {
  const signIn = new URL("/sign-in", request.nextUrl);
  signIn.search = "";
  const next = safeNextPath(request.nextUrl.pathname + request.nextUrl.search);
  if (next) {
    signIn.searchParams.set("next", next);
  }
  return NextResponse.redirect(signIn, 307);
}

/**
 * An early check only. Every page that shows a person's data checks the session again itself
 * (`requireUser`), and every API route checks it too, so a request that gets past here because the
 * API could not be reached still sees nothing it should not.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const isPublic = PUBLIC_PATHS.has(request.nextUrl.pathname);
  const cookieHeader = request.headers.get("cookie");
  const policy = contentSecurityPolicy(makeNonce(), process.env.NODE_ENV === "development");

  if (!hasSessionCookie(cookieHeader)) {
    return isPublic ? render(request, policy) : signInRedirect(request);
  }

  const { state, setCookies } = await checkSession(cookieHeader);
  // A signed-in visitor on a sign-in page is sent on by the page itself, from the same answer it
  // renders with. One check per direction means the two can never disagree into a loop.
  const response =
    state === "signed-out" && !isPublic ? signInRedirect(request) : render(request, policy);
  // Onto the redirect too: an ended session's cookie is cleared, so it is not checked again on
  // every page.
  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico$).*)"],
};
