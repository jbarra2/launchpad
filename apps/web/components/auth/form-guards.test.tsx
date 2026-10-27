import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckEmail } from "./check-email";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";
import { fetchMock, submit, type } from "./test-helpers";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { navigate } = await import("@/lib/navigate");

const PASSWORD = "A-long-enough-password-1";

interface FormCase {
  name: string;
  form: () => ReactElement;
  fill: () => void;
  button: string;
  busy: string;
}

const forms: FormCase[] = [
  {
    name: "sign-in",
    form: () => <SignInForm next="/pad" />,
    fill: () => {
      type("Email", "ana@example.com");
      type("Password", PASSWORD);
    },
    button: "Sign in",
    busy: "Signing in…",
  },
  {
    name: "sign-up",
    form: () => <SignUpForm />,
    fill: () => {
      type("Name", "Ana");
      type("Email", "ana@example.com");
      type("Password", PASSWORD);
    },
    button: "Create account",
    busy: "Creating your account…",
  },
  {
    name: "check-email",
    form: () => <CheckEmail />,
    fill: () => type("Email", "ana@example.com"),
    button: "Send the link again",
    busy: "Sending…",
  },
  {
    name: "forgot-password",
    form: () => <ForgotPasswordForm />,
    fill: () => type("Email", "ana@example.com"),
    button: "Send the reset link",
    busy: "Sending…",
  },
  {
    name: "reset-password",
    form: () => <ResetPasswordForm token="t0k3n" />,
    fill: () => {
      type("New password", PASSWORD);
      type("Type it again", PASSWORD);
    },
    button: "Set the new password",
    busy: "Saving…",
  },
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe.each(forms)("the $name form", ({ form, fill, button, busy }) => {
  it("ignores a second press while the first is on its way", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(form());
    fill();
    submit(button);
    const pending = await screen.findByRole("button", { name: busy });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    submit(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response(JSON.stringify({ message: "x" }), { status: 500 })));
  });

  it("can be sent again after a refusal, with its button back to normal", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "x" }), { status: 500 }));
    render(form());
    fill();
    submit(button);
    const again = await screen.findByRole("button", { name: button });
    expect(again).not.toHaveAttribute("aria-disabled");
    submit(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe.each(forms.filter(({ name }) => ["sign-in", "sign-up", "reset-password"].includes(name)))(
  "the $name form, brought back by the Back button",
  ({ form, fill, button, busy }) => {
    it("can be used again, not left waiting on the request it sent before", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "u1" } })));
      render(form());
      fill();
      submit(button);
      // It went on to the next page, so it stays busy until the page is shown again.
      await screen.findByRole("button", { name: busy });
      const restored = new Event("pageshow");
      Object.defineProperty(restored, "persisted", { value: true });
      act(() => {
        window.dispatchEvent(restored);
      });
      const again = await screen.findByRole("button", { name: button });
      expect(again).not.toHaveAttribute("aria-disabled");
      submit(button);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });
  },
);

const destinations: Record<string, string> = {
  "sign-in": "/pad",
  "sign-up": "/check-email",
  "reset-password": "/sign-in?notice=password-reset",
};

describe.each(forms.filter(({ name }) => name in destinations))(
  "the $name form, after its page load was stopped",
  ({ name, form, fill, button, busy }) => {
    it("goes on again when pressed, without sending the request twice", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "u1" } })));
      render(form());
      fill();
      submit(button);
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(destinations[name]));
      submit(busy);
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenLastCalledWith(destinations[name]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  },
);
