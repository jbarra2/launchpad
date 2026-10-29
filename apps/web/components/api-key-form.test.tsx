import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegion } from "@/components/a11y/live-region";
import { answerWith, fetchMock, sentBody, type } from "@/components/auth/test-helpers";
import { axe } from "@/test-utils/axe";
import { ApiKeySection } from "./api-key-form";
import { StartSessionButton } from "./rockets/start-session-button";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { navigate, replaceLocation } = await import("@/lib/navigate");

// A made-up key, short enough that it cannot be mistaken for a real one.
const KEY = "sk-ant-good-1234";
const saved = { status: "valid", last4: "1234", checkedAt: "2026-10-28T10:00:00.000Z" } as const;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(navigate).mockClear();
  vi.mocked(replaceLocation).mockClear();
});

async function save() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Claude key" }));
  });
}

describe("saving a key", () => {
  it("sends the key to be checked, and reloads Settings once it is saved", async () => {
    answerWith(200, saved);
    const { container } = render(<ApiKeySection state={{ status: "none" }} />);
    expect(await axe(container)).toHaveNoViolations();
    type("Your Claude key", `  ${KEY}  `);
    await save();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/me/api-key");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(sentBody()).toEqual({ key: KEY });
    expect(replaceLocation).toHaveBeenCalledWith("/settings?notice=key-saved");
    expect(screen.getByLabelText("Your Claude key")).toHaveValue("");
  });

  it("refuses something that is not a key at the field, and sends nothing", async () => {
    render(<ApiKeySection state={{ status: "none" }} />);
    type("Your Claude key", "hello there");
    await save();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your Claude key")).toHaveAccessibleDescription(
      expect.stringContaining("A Claude key starts with sk-ant-"),
    );
  });

  it("shows Anthropic's answer as a sentence when the key is refused or the check fails", async () => {
    answerWith(400, { error: "Anthropic did not accept that key. Check it and try again." });
    render(<ApiKeySection state={{ status: "none" }} />);
    type("Your Claude key", KEY);
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("Anthropic did not accept that key.");
    answerWith(429, { error: "You have checked a key 10 times in the last hour." });
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("checked a key 10 times");
    expect(replaceLocation).not.toHaveBeenCalled();
  });
});

describe("a saved key", () => {
  it("shows its last 4 characters, and Replace opens the form with a way back", async () => {
    const { container } = render(<ApiKeySection state={saved} />);
    expect(screen.getByText("••••1234")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Your Claude key"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Your Claude key")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replace key" }));
  });

  it("is removed after a confirmation", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<ApiKeySection state={saved} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove key" }));
    const dialog = screen.getByRole("dialog", { name: "Remove your Claude key?" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove key" }));
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/me/api-key");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(replaceLocation).toHaveBeenCalledWith("/settings?notice=key-removed");
  });
});

describe("StartSessionButton", () => {
  it("opens the session, then goes to it", async () => {
    answerWith(201, {});
    const { container } = render(
      <LiveRegion>
        <StartSessionButton rocketId="crocket1" kind="fuel" />
      </LiveRegion>,
    );
    expect(await axe(container)).toHaveNoViolations();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start session for the Fuel tank" }));
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rockets/crocket1/sessions");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(navigate).toHaveBeenCalledWith("/rockets/crocket1/session");
  });

  it("opens one session however often it is pressed", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    render(<StartSessionButton rocketId="crocket1" kind="fuel" />);
    const button = screen.getByRole("button", { name: /Start session/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response(JSON.stringify({}), { status: 201 })));
  });

  it("says why when it cannot, in the API's words", async () => {
    answerWith(409, { error: "Add your Claude key in Settings to build parts with Claude." });
    render(<StartSessionButton rocketId="crocket1" kind="fuel" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start session/ }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Add your Claude key in Settings");
    expect(navigate).not.toHaveBeenCalled();
  });
});
