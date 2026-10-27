import { meResponse, type MeResponse } from "@launchpad/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiUnavailableError, apiFetch } from "./api";
import { hasSessionCookie } from "./auth-cookies";
import { safeNextPath } from "./safe-path";

export type SessionUser = MeResponse["user"];

/** The signed-in person, or null. Asked once per request, and not at all without a cookie. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
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
  return parsed.data.user;
});

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
