import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";

export const fetchMock = vi.fn<typeof fetch>();

export function answerWith(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

/** The JSON body of the nth call to fetch. */
export function sentBody(call = 0): unknown {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body));
}

export function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

export function submit(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}
