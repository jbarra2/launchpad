import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import SignedInError from "./error";

describe("the signed-in error screen", () => {
  it("says what happened as an alert, and tries again on request", async () => {
    const retry = vi.fn();
    const { container } = render(<SignedInError error={new Error("x")} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load this page");
    expect(screen.queryByText("x")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });
});
