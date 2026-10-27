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

  if (!hasSessionCookie(cookieHeader)) {
    return isPublic ? NextResponse.next() : signInRedirect(request);
  }

  const { state, setCookies } = await checkSession(cookieHeader);
  // A signed-in visitor on a sign-in page is sent on by the page itself, from the same answer it
  // renders with. One check per direction means the two can never disagree into a loop.
  const response =
    state === "signed-out" && !isPublic ? signInRedirect(request) : NextResponse.next();
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
