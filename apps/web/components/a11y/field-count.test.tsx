import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";

const announce = vi.fn();
vi.mock("./live-region", () => ({ useAnnouncer: () => announce }));

const { characterCount, FieldCount, textCount } = await import("./field-count");
const { FormField } = await import("./form-field");

beforeEach(() => {
  announce.mockClear();
});

describe("characterCount", () => {
  it("says how many are left, out of how many", () => {
    expect(characterCount(44, 200)).toEqual({ text: "156 of 200 characters left", over: false });
    expect(characterCount(199, 200)).toEqual({ text: "1 of 200 characters left", over: false });
    expect(characterCount(200, 200)).toEqual({ text: "0 of 200 characters left", over: false });
  });

  it("says how many are too many once past the limit", () => {
    expect(characterCount(201, 200)).toEqual({ text: "1 character too many", over: true });
    expect(characterCount(203, 200)).toEqual({ text: "3 characters too many", over: true });
  });
});

describe("FieldCount", () => {
  const count = (length: number) => textCount(length, 10, "The name");

  it("shows the count, and marks it over in words and in its style", async () => {
    const { container, rerender } = render(<FieldCount id="c" count={count(4)} />);
    expect(screen.getByText("6 of 10 characters left")).not.toHaveClass("field-count-over");
    rerender(<FieldCount id="c" count={count(12)} />);
    expect(screen.getByText("2 characters too many")).toHaveClass(
      "field-count",
      "field-count-over",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces going over the limit and coming back, and nothing on each key", () => {
    const { rerender } = render(<FieldCount id="c" count={count(8)} />);
    rerender(<FieldCount id="c" count={count(9)} />);
    rerender(<FieldCount id="c" count={count(10)} />);
    expect(announce).not.toHaveBeenCalled();
    rerender(<FieldCount id="c" count={count(11)} />);
    rerender(<FieldCount id="c" count={count(12)} />);
    expect(announce.mock.calls).toEqual([["The name is over its 10-character limit."]]);
    rerender(<FieldCount id="c" count={count(10)} />);
    expect(announce.mock.calls.at(-1)).toEqual(["The name is within its limit again."]);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("follows the count without a word while it is quiet, and speaks once it is not", () => {
    const quiet = (length: number) => textCount(length, 10, "The name", true);
    const { rerender } = render(<FieldCount id="c" count={quiet(4)} />);
    rerender(<FieldCount id="c" count={quiet(12)} />);
    expect(screen.getByText("2 characters too many")).toHaveClass("field-count-over");
    expect(announce).not.toHaveBeenCalled();
    rerender(<FieldCount id="c" count={count(13)} />);
    expect(announce).not.toHaveBeenCalled();
    rerender(<FieldCount id="c" count={count(9)} />);
    expect(announce.mock.calls).toEqual([["The name is within its limit again."]]);
  });

  it("announces nothing when a field starts out over its limit", () => {
    render(<FieldCount id="c" count={count(15)} />);
    expect(announce).not.toHaveBeenCalled();
  });
});

describe("FormField with a count", () => {
  it("describes the control by its hint, then its count, then its error", async () => {
    const { container } = render(
      <FormField
        label="Pitch"
        hint="One line."
        error="Too long."
        count={textCount(3, 5, "The pitch")}
      >
        <input id="pitch" />
      </FormField>,
    );
    expect(screen.getByLabelText("Pitch")).toHaveAttribute(
      "aria-describedby",
      "pitch-hint pitch-count pitch-error",
    );
    expect(screen.getByLabelText("Pitch")).toHaveAccessibleDescription(
      "One line. 2 of 5 characters left Too long.",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("adds nothing when there is no count", () => {
    render(
      <FormField label="Email">
        <input id="email" />
      </FormField>,
    );
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-describedby");
    expect(document.querySelector(".field-count")).toBeNull();
  });
});
