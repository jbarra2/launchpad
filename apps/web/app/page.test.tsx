import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";

const session = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/session", () => ({ peekSessionUser: async () => session.user }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

const { default: HomePage } = await import("./page");

const props = (query: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(query) }) as never;

beforeEach(() => {
  session.user = null;
});

describe("the home page", () => {
  it("shows the app name, and links to create an account and to sign in", async () => {
    render(await HomePage(props()));
    expect(screen.getByRole("heading", { level: 1, name: "Launchpad" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("sends a signed-in person to the pad", async () => {
    session.user = { id: "u1" };
    await expect(HomePage(props())).rejects.toThrow(/^redirect:\/pad$/);
  });

  it("has no axe violations", async () => {
    const { container } = render(await HomePage(props()));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the whole rocket", async () => {
    render(await HomePage(props()));
    expect(screen.getByRole("img", { name: "A rocket with all six parts on" })).toBeInTheDocument();
  });

  it("says the account is deleted, and shows no notice that is not on its list", async () => {
    const { unmount } = render(await HomePage(props({ notice: "account-deleted" })));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your account and all its ideas are deleted.",
    );
    unmount();
    render(await HomePage(props({ notice: "Your account is locked" })));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
