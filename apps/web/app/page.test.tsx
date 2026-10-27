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

beforeEach(() => {
  session.user = null;
});

describe("the home page", () => {
  it("shows the app name, and links to create an account and to sign in", async () => {
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Launchpad" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("sends a signed-in person to the pad", async () => {
    session.user = { id: "u1" };
    await expect(HomePage()).rejects.toThrow(/^redirect:\/pad$/);
  });

  it("has no axe violations", async () => {
    const { container } = render(await HomePage());
    expect(await axe(container)).toHaveNoViolations();
  });
});
