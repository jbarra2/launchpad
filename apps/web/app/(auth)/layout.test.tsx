import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import AuthLayout from "./layout";

describe("the sign-in layout", () => {
  it("links home and holds the page in the main region the skip link points at", async () => {
    const { container } = render(
      <AuthLayout>
        <h1>Sign in</h1>
      </AuthLayout>,
    );
    expect(screen.getByRole("link", { name: "Launchpad" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(await axe(container)).toHaveNoViolations();
  });
});
