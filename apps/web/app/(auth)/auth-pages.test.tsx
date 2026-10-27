import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerWith, fetchMock, submit, type } from "@/components/auth/test-helpers";
import { axe } from "@/test-utils/axe";

const session = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string },
}));
vi.mock("@/lib/session", () => ({ peekSessionUser: async () => session.user }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));

const { navigate } = await import("@/lib/navigate");
const { default: SignInPage } = await import("./sign-in/page");
const { default: SignUpPage } = await import("./sign-up/page");
const { default: ResetPasswordPage } = await import("./reset-password/page");
const { default: CheckEmailPage } = await import("./check-email/page");
const { default: ForgotPasswordPage } = await import("./forgot-password/page");

type Params = Record<string, string | string[] | undefined>;
const props = (params: Params) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(params),
});

async function signInWith(params: Params) {
  render(await SignInPage(props(params) as never));
  answerWith(200, { user: { id: "u1" } });
  type("Email", "ana@example.com");
  type("Password", "A-long-enough-password-1");
  submit("Sign in");
}

beforeEach(() => {
  session.user = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("the sign-in page", () => {
  it("returns a person to the page they asked for after signing in", async () => {
    await signInWith({ next: "/settings" });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings"));
  });

  it.each([
    ["another site", "//evil.example"],
    ["a scheme", "https://evil.example"],
    ["the API", "/api/me"],
    ["a sign-in page", "/sign-in"],
  ])("sends a person to the pad when next points at %s", async (_label, next) => {
    await signInWith({ next });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pad"));
  });

  it("ignores next when it is given twice", async () => {
    await signInWith({ next: ["/settings", "//evil.example"] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pad"));
  });

  it("sends a person who is already signed in on, and only to a safe page", async () => {
    session.user = { id: "u1", name: "Ana", email: "ana@example.com" };
    await expect(SignInPage(props({ next: "//evil.example" }) as never)).rejects.toThrow(
      /^redirect:\/pad$/,
    );
    await expect(SignInPage(props({ next: "/settings" }) as never)).rejects.toThrow(
      /^redirect:\/settings$/,
    );
  });

  it("confirms a verified address", async () => {
    const { container } = render(await SignInPage(props({ notice: "verified" }) as never));
    expect(screen.getByRole("status")).toHaveTextContent("Your email address is confirmed.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each([
    ["TOKEN_EXPIRED", "That link has expired. Sign in with your password to get a new link."],
    [
      "INVALID_TOKEN",
      "That link is not valid. Sign in with your password to get a new link if you need one.",
    ],
    ["USER_NOT_FOUND", "That link is for an account that no longer exists."],
  ])(
    "says a %s link failed, even though the link also carried the confirmed notice",
    async (error, words) => {
      render(await SignInPage(props({ notice: "verified", error }) as never));
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(words);
      expect(screen.queryByText(/is confirmed/)).toBeNull();
    },
  );

  it("never says confirmed for a failed link, whatever its code", async () => {
    for (const error of ["SOMETHING_NEW", "toString", ""]) {
      const { unmount } = render(await SignInPage(props({ notice: "verified", error }) as never));
      expect(screen.queryByText(/is confirmed/)).toBeNull();
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent("That link did not work.");
      unmount();
    }
  });

  it("shows no notice that is not on its list", async () => {
    render(await SignInPage(props({ notice: "Your account is locked. Call 555-0100" }) as never));
    expect(screen.queryByText(/locked/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows only its own words for a link error, even a name every object has", async () => {
    render(await SignInPage(props({ error: "toString" }) as never));
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("That link did not work.");
    expect(screen.queryByText(/function/)).toBeNull();
  });

  it("always offers a way to reset the password", async () => {
    render(await SignInPage(props({}) as never));
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});

describe("the sign-up page", () => {
  it("shows the form, and sends a signed-in person to the pad", async () => {
    const { container } = render(await SignUpPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Create an account" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    session.user = { id: "u1", name: "Ana", email: "ana@example.com" };
    await expect(SignUpPage()).rejects.toThrow(/^redirect:\/pad$/);
  });
});

describe("the reset page", () => {
  it("shows the form for a token from a link", async () => {
    render(await ResetPasswordPage(props({ token: "t0k3n" }) as never));
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it.each([
    ["a failed link", { error: "INVALID_TOKEN" }],
    ["a failed link that also carries a token", { error: "INVALID_TOKEN", token: "t0k3n" }],
    ["a token longer than any real one", { token: "t".repeat(201) }],
    ["two tokens", { token: ["a", "b"] }],
  ])("explains %s and shows no form", async (_label, params) => {
    const { container } = render(await ResetPasswordPage(props(params) as never));
    expect(screen.getByRole("alert")).toHaveTextContent("expired or was already used");
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("the reset page after a reload", () => {
  it("says to open the link again, because the link itself still works", async () => {
    const { container } = render(await ResetPasswordPage(props({}) as never));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Open the reset link from your email again",
    );
    expect(screen.queryByText(/expired/)).toBeNull();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("the check-email and forgot-password pages", () => {
  it("send a signed-in person to the pad from check-email", async () => {
    session.user = { id: "u1", name: "Ana", email: "ana@example.com" };
    await expect(CheckEmailPage()).rejects.toThrow(/^redirect:\/pad$/);
  });

  it("say the same thing on check-email whatever the page address holds", async () => {
    // Nothing on the page may depend on whether an address has an account. The page takes no
    // props, so an old link that still carries a reason cannot change it.
    expect(CheckEmailPage.length).toBe(0);
    // React numbers the ids it makes in the order things render, so those are set aside.
    const html = (container: HTMLElement) => container.innerHTML.replace(/_r_\w+_/g, "id");
    // Next hands every page its props, so the page is given an address with a reason, as Next would.
    const withProps = CheckEmailPage as (props: unknown) => ReturnType<typeof CheckEmailPage>;
    const { container, unmount } = render(await withProps(props({ reason: "unverified" })));
    const withReason = html(container);
    unmount();
    const { container: plain } = render(await CheckEmailPage());
    expect(screen.getByText(/We sent you a message/)).toBeInTheDocument();
    expect(html(plain)).toBe(withReason);
  });

  it("render with no axe violations", async () => {
    const { container } = render(<ForgotPasswordPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
