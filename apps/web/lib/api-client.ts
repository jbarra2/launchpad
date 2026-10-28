import { NETWORK_MESSAGE, TOO_MANY_MESSAGE } from "./auth-client";

// Browser calls to Launchpad's own API through the same-origin /api rewrite, with the session cookie.
// Its `error` sentences are written for people (see http-errors.md), so a page shows them as they
// come, up to a length; anything else gets the page's own sentence.

export interface FieldDetail {
  path: string;
  message: string;
}

export type ApiFailure = {
  ok: false;
  status: number;
  message?: string;
  details: FieldDetail[];
};
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const MESSAGE_MAX = 300;
const DETAILS_MAX = 8;

function sentence(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MESSAGE_MAX
    ? value
    : undefined;
}

function detailsOf(value: unknown): FieldDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, DETAILS_MAX)
    .filter(
      (d): d is FieldDetail =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as FieldDetail).path === "string" &&
        sentence((d as FieldDetail).message) !== undefined,
    );
}

export async function apiSend<T = unknown>(
  method: "POST" | "PUT" | "DELETE",
  path: `/api/${string}`,
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return { ok: false, status: 0, details: [] };
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: sentence(data?.error),
      details: detailsOf(data?.details),
    };
  }
  return { ok: true, data: data as T };
}

export const SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again to continue.";

/** A sentence the person can act on, for a failed call. */
export function apiErrorMessage(result: ApiFailure, fallback: string): string {
  if (result.status === 0) {
    return NETWORK_MESSAGE;
  }
  if (result.status === 401) {
    return SIGNED_OUT_MESSAGE;
  }
  if (result.status === 429) {
    return TOO_MANY_MESSAGE;
  }
  // A 500's sentence is general on purpose, and the page's own is more use.
  if (result.status >= 500) {
    return fallback;
  }
  return result.message ?? fallback;
}

/** The first message for each field, from the API's `details`. */
export function detailErrors(details: FieldDetail[]): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const { path, message } of details) {
    const field = path.split(".")[0];
    if (field && !errors[field]) {
      errors[field] = message;
    }
  }
  return errors;
}
