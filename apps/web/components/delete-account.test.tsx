import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerWith, fetchMock, sentBody } from "@/components/auth/test-helpers";
import { axe } from "@/test-utils/axe";
import { DeleteAccount } from "./delete-account";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { replaceLocation } = await import("@/lib/navigate");

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function open() {
  const result = render(<DeleteAccount />);
  fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
  const dialog = result.container.querySelector("dialog")!;
  const password = dialog.querySelector('input[name="password"]') as HTMLInputElement;
  return { ...result, dialog, password };
}

async function confirm(dialog: HTMLDialogElement) {
  await act(async () => {
    fireEvent.submit(dialog.querySelector("form")!);
  });
}

describe("DeleteAccount", () => {
  it("asks for the password in a dialog that says what goes", async () => {
    const { container, dialog, password } = open();
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveTextContent("every idea on your pad");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reads out what goes when it opens, and never the typed password", () => {
    const { dialog, password } = open();
    fireEvent.change(password, { target: { value: "typed-password" } });
    expect(dialog).toHaveAccessibleDescription(
      "This deletes your account and every idea on your pad. It cannot be undone. Enter your password to confirm.",
    );
  });

  it("sends nothing without a password", async () => {
    const { dialog } = open();
    await confirm(dialog);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog.querySelector('[role="alert"]')).toHaveTextContent("Enter your password.");
  });

  it("deletes with the password and replaces the page with the landing page", async () => {
    answerWith(200, { success: true });
    const { dialog, password } = open();
    fireEvent.change(password, { target: { value: "Correct-horse-battery-9" } });
    await confirm(dialog);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/delete-user");
    expect(sentBody()).toEqual({ password: "Correct-horse-battery-9" });
    expect(replaceLocation).toHaveBeenCalledWith("/?notice=account-deleted");
  });

  it("says a wrong password is wrong, and keeps the account", async () => {
    answerWith(400, { code: "INVALID_PASSWORD", message: "Invalid password" });
    const { dialog, password } = open();
    fireEvent.change(password, { target: { value: "not-the-password" } });
    await confirm(dialog);
    expect(dialog.querySelector('[role="alert"]')).toHaveTextContent(
      "That password is not right. Try again.",
    );
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("says when there have been too many tries", async () => {
    answerWith(429, { message: "Too many requests" });
    const { dialog, password } = open();
    fireEvent.change(password, { target: { value: "x" } });
    await confirm(dialog);
    expect(dialog.querySelector('[role="alert"]')).toHaveTextContent("too many tries");
  });
});
