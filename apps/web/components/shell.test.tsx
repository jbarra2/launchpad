import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { MainNav } from "./main-nav";
import { SignOutButton } from "./sign-out-button";

const path = vi.hoisted(() => ({ current: "/pad" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { replaceLocation } = await import("@/lib/navigate");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  path.current = "/pad";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("MainNav", () => {
  it("links to the pad and Settings, and marks the page you are on", async () => {
    const { container } = render(<MainNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["The pad", "Settings"]);
    expect(screen.getByRole("link", { name: "The pad" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
    expect(nav).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no Sign out, which lives on Settings", () => {
    render(<MainNav />);
    expect(screen.queryByText(/sign out/i)).toBeNull();
  });

  it("marks Settings on its own page and on a page under it", () => {
    for (const current of ["/settings", "/settings/key"]) {
      path.current = current;
      const { unmount } = render(<MainNav />);
      expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      unmount();
    }
  });

  it("does not mark a link for a page that only starts with the same letters", () => {
    path.current = "/padding";
    render(<MainNav />);
    expect(screen.getByRole("link", { name: "The pad" })).not.toHaveAttribute("aria-current");
  });
});

describe("SignOutButton", () => {
  it("signs out and replaces the page with sign-in", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    const { container } = render(<SignOutButton />);
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replaceLocation).toHaveBeenCalledWith("/sign-in?notice=signed-out"));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/sign-out");
  });

  it("goes on again when pressed after signing out, if the page load was stopped", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replaceLocation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Signing out…" }));
    expect(replaceLocation).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a second press while the first is on its way", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const busy = await screen.findByRole("button", { name: "Signing out…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response("{}")));
  });

  it("says so when sign-out fails, and stays", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText(/could not reach Launchpad/)).toBeInTheDocument();
    expect(replaceLocation).not.toHaveBeenCalled();
    // And it can be pressed again.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    const again = await screen.findByRole("button", { name: "Sign out" });
    expect(again).not.toHaveAttribute("aria-disabled");
    fireEvent.click(again);
    await waitFor(() => expect(replaceLocation).toHaveBeenCalledWith("/sign-in?notice=signed-out"));
  });
});
