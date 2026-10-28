import { PASSWORD_HINT, PASSWORD_UNCHANGED } from "@launchpad/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegion } from "@/components/a11y/live-region";
import { axe } from "@/test-utils/axe";
import { CheckEmail } from "./check-email";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";
import { answerWith, fetchMock, sentBody, submit, type } from "./test-helpers";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { navigate } = await import("@/lib/navigate");

const PASSWORD = "A-long-enough-password-1";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("every auth form", () => {
  it.each([
    ["sign-in", <SignInForm key="a" next="/pad" />],
    ["sign-up", <SignUpForm key="b" />],
    ["check-email", <CheckEmail key="c" />],
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

describe("SignUpForm's name", () => {
  it("counts down as it is typed, and keeps text past the limit", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("80 of 80 characters left");
    type("Name", `  ${"n".repeat(82)}  `);
    expect(screen.getByText("2 characters too many")).toHaveClass("field-count-over");
    expect(screen.getByLabelText("Name")).toHaveValue(`  ${"n".repeat(82)}  `);
  });
});

describe("SignUpForm's name error", () => {
  it("goes as soon as the name is right", async () => {
    render(<SignUpForm />);
    type("Name", "n".repeat(81));
    fireEvent.submit(screen.getByRole("form", { name: "Create an account" }));
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    type("Name", "n".repeat(80));
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });
});

describe("SignInForm", () => {
  it("announces an error on a field that already has focus, as after Enter in it", () => {
    render(
      <LiveRegion>
        <SignInForm next="/pad" />
      </LiveRegion>,
    );
    type("Email", "nope");
    type("Password", PASSWORD);
    screen.getByLabelText("Email").focus();
    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Enter a valid email address.");
  });

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
    // An unconfirmed account gets this same answer, so the words cover it too.
    const alert = await screen.findByText(
      /We could not sign you in with that email and password\. If you signed up recently, confirm your address with the newest link we emailed you\./,
    );
    expect(screen.queryByText("Invalid email or password")).toBeNull();
    // The alert takes focus in an effect after its words appear.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    expect(alert).toContainElement(screen.getByRole("link", { name: "Reset your password." }));
    expect(navigate).not.toHaveBeenCalled();
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

  it("names every rule for the password under the field", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(PASSWORD_HINT);
  });

  it("refuses a short password with the shared rule, before calling the server", () => {
    render(<SignUpForm />);
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", "short");
    submit("Create account");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      `${PASSWORD_HINT} Use at least 12 characters for the password. Add an uppercase letter and a number.`,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Password"));
  });

  it.each([
    ["correct-horse-battery", "Add an uppercase letter and a number."],
    ["Correct horse battery 9", "Take out the spaces."],
  ])("names everything %j is missing in one error, before calling the server", (value, error) => {
    render(<SignUpForm />);
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", value);
    submit("Create account");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      `${PASSWORD_HINT} ${error}`,
    );
  });

  it("announces a rule a password breaks when the field already has focus, and only then", () => {
    render(
      <LiveRegion>
        <SignUpForm />
      </LiveRegion>,
    );
    type("Name", "Ana");
    type("Email", "ana@example.com");
    type("Password", "short");
    submit("Create account");
    // Focus moved to the field, which reads its error, so nothing is announced as well.
    expect(screen.getByRole("status")).toHaveTextContent("");
    fireEvent.submit(screen.getByRole("form", { name: "Create an account" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Use at least 12 characters for the password. Add an uppercase letter and a number.",
    );
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
    render(<CheckEmail />);
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/mallory/)).toBeNull();
    // The same words whether or not the address already had an account, so they reveal nothing.
    expect(screen.getByText(/We sent a message to/)).toHaveTextContent(
      "If the address is new, open the link in it to confirm the address, then sign in. If the address already has an account, the message says so.",
    );
    submit("Send the link again");
    expect(await screen.findByText(/If that address needs a link/)).toBeInTheDocument();
    expect(sentBody()).toEqual({
      email: "ana@example.com",
      callbackURL: "/sign-in?notice=verified",
    });
    window.history.replaceState(null, "", "/");
  });

  it("refuses an address that is not one before calling the server", () => {
    render(<CheckEmail />);
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
    render(<CheckEmail />);
    expect(screen.getByText(/We sent you a message/)).toBeInTheDocument();
    type("Email", "ana@example.com");
    submit("Send the link again");
    await waitFor(() => expect(sentBody()).toMatchObject({ email: "ana@example.com" }));
  });

  it("says what to do when nothing arrives", () => {
    render(<CheckEmail />);
    expect(screen.getByText(/We sent you a message/)).toHaveTextContent(
      "If nothing comes, sign in or reset your password with the links below.",
    );
  });

  it("announces an error on the address field when it already has focus", () => {
    render(
      <LiveRegion>
        <CheckEmail />
      </LiveRegion>,
    );
    type("Email", "nope");
    screen.getByLabelText("Email").focus();
    fireEvent.submit(screen.getByRole("form", { name: "Send the link again" }));
    expect(fetchMock).not.toHaveBeenCalled();
    // The live region comes after the page, past the form's own status line.
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("Enter a valid email address.");
  });

  it("shows the same page whatever the address bar holds", () => {
    // Nothing on it may depend on whether an address has an account, and an old link that still
    // carries a reason changes nothing.
    window.history.replaceState(null, "", "/check-email?reason=unverified");
    // React numbers the ids it makes in the order things render, so those are set aside.
    const html = (container: HTMLElement) => container.innerHTML.replace(/_r_\w+_/g, "id");
    const { container, unmount } = render(<CheckEmail />);
    const withReason = html(container);
    unmount();
    window.history.replaceState(null, "", "/check-email");
    const { container: plain } = render(<CheckEmail />);
    expect(html(plain)).toBe(withReason);
    window.history.replaceState(null, "", "/");
  });

  it("offers a reset", () => {
    render(<CheckEmail />);
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("says to wait when too many links were asked for", async () => {
    sessionStorage.setItem("launchpad.pending-email", "ana@example.com");
    answerWith(429, { message: "Too many requests." });
    render(<CheckEmail />);
    submit("Send the link again");
    expect(await screen.findByText(/too many tries/)).toBeInTheDocument();
  });
});

describe("ForgotPasswordForm", () => {
  it("announces an error on the address field when it already has focus", () => {
    render(
      <LiveRegion>
        <ForgotPasswordForm />
      </LiveRegion>,
    );
    type("Email", "nope");
    screen.getByLabelText("Email").focus();
    fireEvent.submit(screen.getByRole("form", { name: "Reset your password" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Enter a valid email address.");
  });

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

  it("names every rule for the password under the field", () => {
    render(<ResetPasswordForm token="t0k3n" />);
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(PASSWORD_HINT);
  });

  it("refuses a password that breaks a rule, before calling the server", () => {
    render(<ResetPasswordForm token="t0k3n" />);
    type("New password", "correct-horse-battery");
    type("Type it again", "correct-horse-battery");
    submit("Set the new password");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
      `${PASSWORD_HINT} Add an uppercase letter and a number.`,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("New password"));
  });

  it("asks for a different password when it is the current one, at the field, and lets them retry", async () => {
    answerWith(400, PASSWORD_UNCHANGED);
    render(<ResetPasswordForm token="t0k3n" />);
    type("New password", PASSWORD);
    type("Type it again", PASSWORD);
    submit("Set the new password");
    await waitFor(() =>
      expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
        `${PASSWORD_HINT} ${PASSWORD_UNCHANGED.message}`,
      ),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("New password"));
    expect(screen.queryByText(/could not change the password/)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    answerWith(200, { status: true });
    type("New password", `${PASSWORD}2`);
    type("Type it again", `${PASSWORD}2`);
    submit("Set the new password");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sign-in?notice=password-reset"));
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(PASSWORD_HINT);
  });

  it("announces a rule the new password breaks when the field already has focus", () => {
    render(
      <LiveRegion>
        <ResetPasswordForm token="t0k3n" />
      </LiveRegion>,
    );
    type("New password", "short");
    type("Type it again", "short");
    screen.getByLabelText("New password").focus();
    fireEvent.submit(screen.getByRole("form", { name: "Set a new password" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Use at least 12 characters for the password. Add an uppercase letter and a number.",
    );
  });

  it("announces the same-password answer when the field already has focus, as after Enter in it", async () => {
    answerWith(400, PASSWORD_UNCHANGED);
    render(
      <LiveRegion>
        <ResetPasswordForm token="t0k3n" />
      </LiveRegion>,
    );
    type("New password", PASSWORD);
    type("Type it again", PASSWORD);
    screen.getByLabelText("New password").focus();
    fireEvent.submit(screen.getByRole("form", { name: "Set a new password" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(PASSWORD_UNCHANGED.message),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("New password"));
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
