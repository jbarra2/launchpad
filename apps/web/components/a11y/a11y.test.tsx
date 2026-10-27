import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import { FormField } from "./form-field";
import { LiveRegion, useAnnouncer } from "./live-region";
import { SkipLink } from "./skip-link";

describe("FormField", () => {
  it("labels the control and describes it by its hint", async () => {
    const { container } = render(
      <FormField label="Password" hint="12 to 128 characters.">
        <input name="password" type="password" />
      </FormField>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAccessibleDescription("12 to 128 characters.");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("marks the control invalid and reads the error with the hint", async () => {
    const { container } = render(
      <FormField label="Password" hint="12 to 128 characters." error="Use at least 12 characters.">
        <input name="password" type="password" />
      </FormField>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("12 to 128 characters. Use at least 12 characters.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps an id the control already has", () => {
    render(
      <FormField label="Email">
        <input id="the-email" name="email" />
      </FormField>,
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "the-email");
  });
});

function Speaker({ words }: { words: string }) {
  const announce = useAnnouncer();
  return (
    <button type="button" onClick={() => announce(words)}>
      Say it
    </button>
  );
}

describe("LiveRegion", () => {
  it("reads a message politely, and reads the same words again when they are said twice", async () => {
    const { container } = render(
      <LiveRegion>
        <Speaker words="Part attached." />
      </LiveRegion>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    act(() => fireEvent.click(screen.getByRole("button")));
    const first = region.firstElementChild;
    expect(region).toHaveTextContent("Part attached.");

    act(() => fireEvent.click(screen.getByRole("button")));
    expect(region).toHaveTextContent("Part attached.");
    expect(region.firstElementChild).not.toBe(first);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SkipLink", () => {
  it("moves focus to the main content without changing the address", async () => {
    const { container } = render(
      <>
        <SkipLink />
        <main id="main-content" tabIndex={-1}>
          <h1>Page</h1>
        </main>
      </>,
    );
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveAttribute("href", "#main-content");
    const event = fireEvent.click(link);
    expect(event).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(await axe(container)).toHaveNoViolations();
  });
});
