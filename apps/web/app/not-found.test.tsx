import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import SignedInNotFound from "./(app)/not-found";
import NotFound from "./not-found";

describe("the pages for an address with nothing at it", () => {
  it("say so in the same words whether the idea is someone else's or was never there", async () => {
    const { container } = render(<SignedInNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Nothing is here" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to the pad" })).toHaveAttribute("href", "/pad");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("send a visitor to the front page, with its own main landmark", async () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Go to Launchpad" })).toHaveAttribute("href", "/");
    expect(await axe(container)).toHaveNoViolations();
  });
});
