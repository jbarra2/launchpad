import { chatSession, sessionIdParam, type ChatSession } from "@launchpad/shared";
import { notFound } from "next/navigation";
import { ApiUnavailableError, apiFetch } from "./api";

// Server reads of the signed-in person's chat sessions, for server pages only. The page has checked
// the session with requireUser() first; the API checks it again and scopes every answer to it.

/**
 * One of the person's chat sessions. An id that could not name one is the 404 page before any call,
 * and someone else's session, or one that is gone, is the 404 page too.
 */
export async function getChatSession(id: string): Promise<ChatSession> {
  if (!sessionIdParam.safeParse(id).success) {
    notFound();
  }
  const response = await apiFetch(`/api/sessions/${id}`);
  if (response.status === 404) {
    notFound();
  }
  if (response.status !== 200) {
    throw new ApiUnavailableError();
  }
  const parsed = chatSession.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiUnavailableError();
  }
  return parsed.data;
}
