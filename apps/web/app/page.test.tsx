import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import HomePage from "./page";

describe("the home page", () => {
  it("shows the app name as the page heading", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Launchpad" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<HomePage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
