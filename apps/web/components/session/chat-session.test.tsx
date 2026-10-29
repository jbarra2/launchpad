import type { ChatSession } from "@launchpad/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegion } from "@/components/a11y/live-region";
import { answerWith, fetchMock, sentBody, type } from "@/components/auth/test-helpers";
import { axe } from "@/test-utils/axe";
import { ChatSessionView, THINKING } from "./chat-session";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { navigate } = await import("@/lib/navigate");

const NOW = "2026-10-28T10:00:00.000Z";
const OPENER = "Hi! Who would use Recipe Swap first?";

function session(messages: ChatSession["messages"] = []): ChatSession {
  return { id: "s1", rocketId: "crocket1", part: "fuel", status: "open", messages };
}

const opened = () => session([{ id: "m1", role: "assistant", text: OPENER, createdAt: NOW }]);

function view(chat = opened(), keyStatus: "none" | "valid" | "invalid" = "valid") {
  return render(
    <LiveRegion>
      <ChatSessionView rocketId="crocket1" session={chat} keyStatus={keyStatus} />
    </LiveRegion>,
  );
}

const reply = (text: string, at = "m3") => ({
  messages: [
    { id: "m2", role: "user", text: "My cousins.", createdAt: NOW },
    { id: at, role: "assistant", text, createdAt: NOW },
  ],
});

async function sendForm() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Message to Claude" }));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.mocked(navigate).mockClear();
});

describe("the conversation", () => {
  it("shows who said what, in order, with the answer box and its live count", async () => {
    const { container } = view();
    const items = within(
      screen.getByRole("list", { name: "Conversation with Claude" }),
    ).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([`Claude${OPENER}`]);
    type("Your answer", "My cousins.");
    expect(screen.getByLabelText("Your answer")).toHaveAccessibleDescription(
      expect.stringContaining("1989 of 2000 characters left"),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows Claude's words as text, never as markup", () => {
    const { container } = view(
      session([
        {
          id: "m1",
          role: "assistant",
          text: '<img src="x" onerror="alert(1)"><script>alert(2)</script>',
          createdAt: NOW,
        },
      ]),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>alert\(2\)<\/script>/)).toBeInTheDocument();
  });

  it("says when the key is missing or refused, with the way to Settings", () => {
    view(opened(), "none");
    expect(screen.getByText(/Your Claude key is no longer saved/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

describe("the page's markup", () => {
  it("puts no form inside another, which a browser would undo when it reads the page", () => {
    const { container } = view();
    expect(container.querySelector("form form")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute("form", "chat-composer");
  });
});

describe("sending a message", () => {
  it("posts it, shows the reply, empties the box, and keeps focus where it was", async () => {
    answerWith(200, reply("How do they share recipes today?"));
    view();
    const box = screen.getByLabelText("Your answer");
    box.focus();
    type("Your answer", "  My cousins.  ");
    await sendForm();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/s1/messages");
    expect(sentBody()).toEqual({ text: "My cousins." });
    expect(screen.getByText("How do they share recipes today?")).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(document.activeElement).toBe(box);
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
      "Claude: How do they share recipes today?",
    );
  });

  it("keeps the words and says what went wrong when it fails", async () => {
    answerWith(429, { error: "This session has 30 answers, the most it holds." });
    view();
    type("Your answer", "One more.");
    await sendForm();
    expect(screen.getByRole("alert")).toHaveTextContent("This session has 30 answers");
    expect(screen.getByLabelText("Your answer")).toHaveValue("One more.");
  });

  it("refuses an empty or over-long message at the box, and sends nothing", async () => {
    view();
    await sendForm();
    expect(screen.getByLabelText("Your answer")).toHaveAccessibleDescription(
      expect.stringContaining("Write a message first."),
    );
    type("Your answer", "m".repeat(2001));
    await sendForm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows that Claude is thinking while it waits", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    view();
    type("Your answer", "My cousins.");
    act(() => {
      fireEvent.submit(screen.getByRole("form", { name: "Message to Claude" }));
    });
    expect(screen.getByText(THINKING, { selector: ".chat-status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await act(async () => finish(new Response(JSON.stringify(reply("Next?")), { status: 200 })));
    expect(screen.queryByText(THINKING, { selector: ".chat-status" })).not.toBeInTheDocument();
  });

  it("asks for nothing else while Claude is answering", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    view();
    type("Your answer", "My cousins.");
    act(() => {
      fireEvent.submit(screen.getByRole("form", { name: "Message to Claude" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Build this part" }));
    act(() => {
      fireEvent.submit(screen.getByRole("form", { name: "Message to Claude" }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response(JSON.stringify(reply("Next?")), { status: 200 })));
  });

  it("sends on Enter with a mouse and keyboard, and not with Shift+Enter", async () => {
    answerWith(200, reply("Next?"));
    view();
    type("Your answer", "My cousins.");
    const box = screen.getByLabelText("Your answer");
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("adds a line on Enter on a touch screen, where Send sends", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" }));
    view();
    type("Your answer", "My cousins.");
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Your answer"), { key: "Enter" });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("building the part", () => {
  const draft = { summary: "Cousins who share recipes.", points: ["Photos get lost"] };

  async function openDraft() {
    answerWith(200, draft);
    view();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Build this part" }));
    });
  }

  it("shows Claude's draft in the part form, ready to edit, with focus on its heading", async () => {
    await openDraft();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/s1/draft");
    const heading = screen.getByRole("heading", { name: "Draft: Fuel tank" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByLabelText("Summary")).toHaveValue(draft.summary);
    expect(screen.getByLabelText("Points")).toHaveValue("Photos get lost");
    expect(screen.queryByRole("form", { name: "Message to Claude" })).not.toBeInTheDocument();
  });

  it("attaches the edited part from this session, then goes back to the idea", async () => {
    await openDraft();
    type("Summary", "Cousins who share recipes as photos.");
    answerWith(200, {});
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Draft of the Fuel tank" }));
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/rockets/crocket1/parts/fuel");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(sentBody(1)).toEqual({
      summary: "Cousins who share recipes as photos.",
      points: ["Photos get lost"],
      sessionId: "s1",
    });
    expect(navigate).toHaveBeenCalledWith("/rockets/crocket1?attached=fuel");
  });

  it("keeps an answer that was not sent yet while the draft is open", async () => {
    answerWith(200, draft);
    view();
    type("Your answer", "Half an answer");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Build this part" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to the chat" }));
    expect(screen.getByLabelText("Your answer")).toHaveValue("Half an answer");
    expect(screen.getByLabelText("Your answer")).toHaveAccessibleDescription(
      expect.stringContaining("1986 of 2000 characters left"),
    );
  });

  it("goes back to the chat without attaching, with focus in the answer box", async () => {
    await openDraft();
    fireEvent.click(screen.getByRole("button", { name: "Back to the chat" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Your answer"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says what went wrong when Claude cannot write the draft", async () => {
    answerWith(503, { error: "Claude's draft could not be used. Try again." });
    view();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Build this part" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Claude's draft could not be used.");
  });
});

describe("a session with no first question yet", () => {
  it("asks Claude again for it, without opening a new session", async () => {
    answerWith(200, opened());
    view(session());
    expect(screen.getByText("Claude has not asked its first question yet.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask Claude to start" }));
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rockets/crocket1/sessions");
    expect(screen.getByText(OPENER)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Your answer"));
  });

  it("loads the page again when the session it answers with is another one", async () => {
    answerWith(200, { ...opened(), id: "s2", part: "body" });
    view(session());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask Claude to start" }));
    });
    expect(navigate).toHaveBeenCalledWith("/rockets/crocket1/session");
    expect(screen.queryByText(OPENER)).not.toBeInTheDocument();
  });
});

describe("ending the session", () => {
  it("asks first, then closes it and goes back to the idea", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("dialog", { name: "End this session?" });
    // The chat cannot be reopened, so the dialog says so, and how to keep the work.
    expect(dialog).toHaveAccessibleDescription(
      "Once you end it, you can't come back to this chat, and a new session for the Fuel tank starts over without these messages. Nothing is attached. To keep what you've worked out, choose Build this part, then Attach part.",
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "End session" }));
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/s1/close");
    expect(navigate).toHaveBeenCalledWith("/rockets/crocket1?notice=ended");
  });
});
