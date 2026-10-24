import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import { PlaceholderHome } from "./placeholder-home";

describe("PlaceholderHome", () => {
  it("shows the app name as the page heading", () => {
    render(<PlaceholderHome />);
    expect(screen.getByRole("heading", { level: 1, name: "Launchpad" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<PlaceholderHome />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
