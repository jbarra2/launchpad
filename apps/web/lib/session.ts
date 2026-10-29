import { meResponse, type ApiKeyState, type MeResponse } from "@launchpad/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiUnavailableError, apiFetch } from "./api";
import { hasSessionCookie } from "./auth-cookies";
import { safeNextPath } from "./safe-path";

export type SessionUser = MeResponse["user"];

/** /api/me, or null when nobody is signed in. Asked once per request, and not at all without a cookie. */
const getMe = cache(async (): Promise<MeResponse | null> => {
  if (!hasSessionCookie((await headers()).get("cookie"))) {
    return null;
  }
  const response = await apiFetch("/api/me");
  if (response.status === 401) {
    return null;
  }
  if (response.status !== 200) {
    throw new ApiUnavailableError();
  }
  const parsed = meResponse.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiUnavailableError();
  }
  return parsed.data;
});

/** The signed-in person, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getMe())?.user ?? null;
}

/**
 * Whether the signed-in person has a Claude key that works, and its last 4 characters. The API
 * never sends more of the key than that, so neither can a page. Call it after requireUser.
 */
export async function getApiKeyState(): Promise<ApiKeyState> {
  return (await getMe())?.apiKey ?? { status: "none" };
}

/**
 * Every signed-in page calls this itself. A layout is not enough, because it does not run again
 * when a person moves between the pages under it.
 */
export async function requireUser(path: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const next = safeNextPath(path);
    redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  }
  return user;
}

/** For public pages: the signed-in person if there is one, and null if the API cannot say. */
export async function peekSessionUser(): Promise<SessionUser | null> {
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
}
