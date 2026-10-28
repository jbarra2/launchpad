import {
  rocketDetail,
  rocketIdParam,
  rocketList,
  type RocketDetail,
  type RocketSummary,
} from "@launchpad/shared";
import { notFound } from "next/navigation";
import { ApiUnavailableError, apiFetch } from "./api";

// Server reads of the signed-in person's ideas, for server pages only. The page has checked the
// session with requireUser() first; the API checks it again and scopes every answer to it.

async function parsed<T>(
  response: Response,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
) {
  if (response.status !== 200) {
    throw new ApiUnavailableError();
  }
  const result = schema.safeParse(await response.json().catch(() => null));
  if (!result.success) {
    throw new ApiUnavailableError();
  }
  return result.data;
}

export async function getRockets(): Promise<RocketSummary[]> {
  return (await parsed(await apiFetch("/api/rockets"), rocketList)).rockets;
}

/**
 * One of the person's ideas. An id that could not name one is the 404 page before any call, so an
 * address is never built from it. Someone else's idea, or a deleted one, is the 404 page too.
 */
export async function getRocket(id: string): Promise<RocketDetail> {
  if (!rocketIdParam.safeParse(id).success) {
    notFound();
  }
  const response = await apiFetch(`/api/rockets/${id}`);
  if (response.status === 404) {
    notFound();
  }
  return parsed(response, rocketDetail);
}
