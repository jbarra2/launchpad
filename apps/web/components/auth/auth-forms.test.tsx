import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { CheckEmail } from "./check-email";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";
import { answerWith, fetchMock, sentBody, submit, type } from "./test-helpers";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { navigate } = await import("@/lib/navigate");

const PASSWORD = "a-long-enough-password";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("every auth form", () => {
  it.each([
    ["sign-in", <SignInForm key="a" next="/pad" />],
    ["sign-up", <SignUpForm key="b" />],
    ["check-email", <CheckEmail key="c" unverified={false} />],
    ["forgot-password", <ForgotPasswordForm key="d" />],
    ["reset-password", <ResetPasswordForm key="e" token="t0k3n" />],
  ])(
    "%s posts, so Enter before the page is ready never puts a password in the address",
    async (_name, form) => {
      const { container } = render(form);
      expect(container.querySelector("form")).toHaveAttribute("method", "post");
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});

describe("SignInForm", () => {
  it("tells password managers what each field is", () => {
    render(<SignInForm next="/pad" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("signs in and goes to the page that was checked for it", async () => {
    sessionStorage.setItem("launchpad.pending-email", "ana@example.com");
    answerWith(200, { user: { id: "u1" } });
    render(<SignInForm next="/settings" />);
    type("Email", " ana@example.com ");
    type("Password", PASSWORD);
    submit("Sign in");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings"));
    // The address waiting for its link is no longer needed once the person is in.
    expect(sessionStorage.getItem("launchpad.pending-email")).toBeNull();
    expect(sentBody()).toEqual({
      email: "ana@example.com",
      password: PASSWORD,
      callbackURL: "/sign-in?notice=verified",
    });
  });

  it("asks for a missing field without calling the server, and moves focus to it", () => {
    render(<SignInForm next="/pad" />);
    type("Email", "ana@example.com");
    submit("Sign in");
    expect(fetchMock).not.toHaveBeenCalled();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Enter your password.");
    expect(document.activeElement).toBe(password);
  });

  it("moves focus to the email first when both fields are missing", () => {
    render(<SignInForm next="/pad" />);
    submit("Sign in");
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("explains a wrong password in its own words, moves focus to it, and offers a reset", async () => {
    answerWith(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
    render(<SignInForm next="/pad" />);
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Sign in");
    const alert = await screen.findByText(/That email and password do not match/);
    expect(screen.queryByText("Invalid email or password")).toBeNull();
    // The alert takes focus in an effect after its words appear.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    expect(alert).toContainElement(screen.getByRole("link", { name: "Reset your password." }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("sends an unconfirmed address to check its email, remembering it in this tab", async () => {
    answerWith(403, { message: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
    render(<SignInForm next="/pad" />);
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Sign in");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/check-email?reason=unverified"));
    expect(sessionStorage.getItem("launchpad.pending-email")).toBe("ana@example.com");
  });

  it("ignores a second press while the first is on its way", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<SignInForm next="/pad" />);
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Sign in");
    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    submit("Signing in…");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response("{}")));
  });

  it("says when Launchpad cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<SignInForm next="/pad" />);
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Sign in");
    expect(await screen.findByText(/could not reach Launchpad/)).toBeInTheDocument();
  });
});

describe("SignUpForm", () => {
  it("creates the account, remembers the address in this tab, and goes to check-email", async () => {
    answerWith(200, { user: { id: "u1" } });
    render(<SignUpForm />);
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Create account");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/check-email"));
    expect(sentBody()).toEqual({
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
      callbackURL: "/sign-in?notice=verified",
    });
    expect(sessionStorage.getItem("launchpad.pending-email")).toBe("ana@example.com");
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("ana@example.com"));
  });

  it("refuses a short password with the shared rule, before calling the server", () => {
    render(<SignUpForm />);
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", "short");
    submit("Create account");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "12 to 128 characters. Use at least 12 characters for the password.",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Password"));
  });

  it("moves focus to the first field with an error, in the order of the form", () => {
    render(<SignUpForm />);
    type("Password", "short");
    submit("Create account");
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("ignores a second press while the first is on its way", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<SignUpForm />);
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Create account");
    await screen.findByRole("button", { name: "Creating your account…" });
    submit("Creating your account…");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response("{}")));
  });

  it("shows a refusal in its own words", async () => {
    answerWith(429, { message: "Too many requests. Please try again later." });
    render(<SignUpForm />);
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", PASSWORD);
    submit("Create account");
    expect(await screen.findByText(/too many tries/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("CheckEmail", () => {
  it("names the address from this tab, never from the page address, and sends the link again", async () => {
    sessionStorage.setItem("launchpad.pending-email", "ana@example.com");
    window.history.replaceState(null, "", "/check-email?email=mallory@example.com");
    answerWith(200, { status: true });
    render(<CheckEmail unverified={false} />);
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/mallory/)).toBeNull();
    submit("Send the link again");
    expect(await screen.findByText(/If that address needs a link/)).toBeInTheDocument();
    expect(sentBody()).toEqual({
      email: "ana@example.com",
      callbackURL: "/sign-in?notice=verified",
    });
    window.history.replaceState(null, "", "/");
  });

  it("refuses an address that is not one before calling the server", () => {
    render(<CheckEmail unverified={false} />);
    type("Email", "nope");
    submit("Send the link again");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("asks for the address when this tab does not have one", async () => {
    answerWith(200, { status: true });
    render(<CheckEmail unverified={false} />);
    expect(screen.getByText(/We sent you a link/)).toBeInTheDocument();
    type("Email", "ana@example.com");
    submit("Send the link again");
    await waitFor(() => expect(sentBody()).toMatchObject({ email: "ana@example.com" }));
  });

  it("explains why sign-in sent the person here, and offers a reset", () => {
    render(<CheckEmail unverified />);
    expect(screen.getByText(/not confirmed yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("says to wait when too many links were asked for", async () => {
    sessionStorage.setItem("launchpad.pending-email", "ana@example.com");
    answerWith(429, { message: "Too many requests." });
    render(<CheckEmail unverified={false} />);
    submit("Send the link again");
    expect(await screen.findByText(/too many tries/)).toBeInTheDocument();
  });
});

describe("ForgotPasswordForm", () => {
  it("asks for a link that lands on the reset page, and answers every address the same way", async () => {
    answerWith(200, {
      status: true,
      message: "If this email exists in our system, check your email",
    });
    render(<ForgotPasswordForm />);
    type("Email", "ana@example.com");
    submit("Send the reset link");
    const done = await screen.findByText(/a reset link is on its way/);
    expect(sentBody()).toEqual({ email: "ana@example.com", redirectTo: "/reset-password" });
    expect(screen.queryByText(/exists in our system/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(done));
  });

  it("refuses an address that is not one, before calling the server", () => {
    render(<ForgotPasswordForm />);
    type("Email", "nope");
    submit("Send the reset link");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
  });

  it("says when Launchpad cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<ForgotPasswordForm />);
    type("Email", "ana@example.com");
    submit("Send the reset link");
    expect(await screen.findByText(/could not reach Launchpad/)).toBeInTheDocument();
  });
});

describe("ResetPasswordForm", () => {
  it("takes the token out of the address bar once the router has set itself up", async () => {
    window.history.replaceState(null, "", "/reset-password?token=t0k3n");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<ResetPasswordForm token="t0k3n" />);
    // Not during the first commit: Next patches replaceState in an effect that runs after this
    // form's, and only the patched version keeps the router's state.
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(replace).toHaveBeenCalledWith(null, "", "/reset-password");
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("sends the token from the link with the new password, then goes to sign in", async () => {
    answerWith(200, { status: true });
    render(<ResetPasswordForm token="t0k3n" />);
    type("New password", PASSWORD);
    type("Type it again", PASSWORD);
    submit("Set the new password");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sign-in?notice=password-reset"));
    expect(sentBody()).toEqual({ token: "t0k3n", newPassword: PASSWORD });
  });

  it("refuses two passwords that differ, before calling the server", () => {
    render(<ResetPasswordForm token="t0k3n" />);
    type("New password", PASSWORD);
    type("Type it again", `${PASSWORD}x`);
    submit("Set the new password");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Type it again")).toHaveAccessibleDescription(
      "The two passwords do not match.",
    );
  });

  it("explains an expired link, moves focus to it, and offers a new one", async () => {
    answerWith(400, { message: "Invalid token", code: "INVALID_TOKEN" });
    render(<ResetPasswordForm token="t0k3n" />);
    type("New password", PASSWORD);
    type("Type it again", PASSWORD);
    submit("Set the new password");
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    expect(screen.getByRole("link", { name: "Ask for a new link." })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
