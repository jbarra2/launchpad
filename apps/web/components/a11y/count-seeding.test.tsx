import { act, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { NewRocketForm } from "@/components/rockets/new-rocket-form";
import { PartForm } from "@/components/rockets/part-form";
import { LiveRegion } from "./live-region";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));

// A box can hold text before React does: typed before the page finished loading, or put back by
// the browser on Back. React keeps that text when it takes over the page and fires no change for
// it, so each form reads its boxes once when it starts.

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

/** Server-renders `ui`, puts text in its boxes as a person or the browser would, then hydrates. */
async function hydrateWith(ui: ReactElement, fill: Record<string, string>) {
  const page = <LiveRegion>{ui}</LiveRegion>;
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = renderToString(page);
  for (const [name, value] of Object.entries(fill)) {
    (container.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
  }
  await act(async () => {
    root = hydrateRoot(container, page);
  });
  return container;
}

describe("a form that starts with text already in its boxes", () => {
  it("counts the sign-up name from what the box holds, without announcing it", async () => {
    await hydrateWith(<SignUpForm />, { name: "n".repeat(83) });
    expect(screen.getByText("3 characters too many")).toHaveClass("field-count-over");
    expect(screen.getByRole("status")).toHaveTextContent("");
    // Once the person types, going back within the limit is announced as usual.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "n".repeat(80) } });
    expect(screen.getByRole("status")).toHaveTextContent("The name is within its limit again.");
  });

  it("counts New idea's boxes from what they hold", async () => {
    await hydrateWith(<NewRocketForm />, { name: "  Recipe Swap  ", pitch: "p".repeat(150) });
    expect(screen.getByText("69 of 80 characters left")).toBeVisible();
    expect(screen.getByText("50 of 200 characters left")).toBeVisible();
    expect(screen.getByText("200 of 200 characters left")).toBeVisible();
  });

  it("counts a new part's summary and points from what they hold", async () => {
    await hydrateWith(<PartForm rocketId="c1" kind="fuel" />, {
      summary: "s".repeat(10),
      points: "one\ntwo",
    });
    expect(screen.getByText("590 of 600 characters left")).toBeVisible();
    expect(screen.getByText("2 of 8 points")).toBeVisible();
  });
});
