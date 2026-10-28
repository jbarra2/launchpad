import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegion } from "@/components/a11y/live-region";
import { answerWith, fetchMock, sentBody, type } from "@/components/auth/test-helpers";
import { axe } from "@/test-utils/axe";
import { NewRocketForm } from "./new-rocket-form";
import { PartForm, pointsOf, pointsProblem } from "./part-form";
import { DeleteRocketButton, LaunchButton } from "./rocket-actions";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
const { navigate, replaceLocation } = await import("@/lib/navigate");

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

async function submitForm(name: string) {
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name }));
  });
}

describe("NewRocketForm", () => {
  it("posts the idea and goes to its page", async () => {
    answerWith(201, { id: "cnew1" });
    const { container } = render(<NewRocketForm />);
    expect(await axe(container)).toHaveNoViolations();
    type("Name", "  Recipe Swap ");
    type("Pitch", "Trade family recipes.");
    await submitForm("New idea");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rockets");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(sentBody()).toEqual({ name: "Recipe Swap", pitch: "Trade family recipes." });
    expect(navigate).toHaveBeenCalledWith("/rockets/cnew1?notice=created");
  });

  it("shows each problem at its field, focuses the first, and sends nothing", async () => {
    render(<NewRocketForm />);
    type("Pitch", "p".repeat(201));
    await submitForm("New idea");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
      expect.stringContaining("Enter a name for the idea."),
    );
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Pitch")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the limit sentence from the API as an alert", async () => {
    answerWith(409, {
      error: "You have 20 ideas, the most the pad holds. Delete one to make room.",
    });
    render(<NewRocketForm />);
    type("Name", "One more");
    type("Pitch", "A pitch.");
    await submitForm("New idea");
    expect(screen.getByRole("alert")).toHaveTextContent("You have 20 ideas");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("goes to the pad when the answer does not name the new idea", async () => {
    for (const body of [{}, { id: "../settings" }, null]) {
      fetchMock.mockReset();
      // Cleared each time, so each answer has to send the person on by itself.
      vi.mocked(navigate).mockClear();
      answerWith(201, body);
      const { unmount } = render(<NewRocketForm />);
      type("Name", "Recipe Swap");
      type("Pitch", "Trade family recipes.");
      await submitForm("New idea");
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith("/pad");
      unmount();
    }
  });

  it("says the connection failed when there is no answer", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    render(<NewRocketForm />);
    type("Name", "One more");
    type("Pitch", "A pitch.");
    await submitForm("New idea");
    expect(screen.getByRole("alert")).toHaveTextContent("We could not reach Launchpad.");
  });
});

describe("New idea's live counts", () => {
  it("count each field down as it is typed, as the rules measure it", () => {
    render(<NewRocketForm />);
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("80 of 80 characters left");
    type("Name", "  Recipe Swap  ");
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("69 of 80 characters left");
    type("Why this matters to you (optional)", "w".repeat(200));
    expect(screen.getByLabelText("Why this matters to you (optional)")).toHaveAccessibleDescription(
      expect.stringContaining("0 of 200 characters left"),
    );
  });

  it("keep text past the limit and say how much too long it is", () => {
    render(<NewRocketForm />);
    type("Pitch", "p".repeat(203));
    expect(screen.getByLabelText("Pitch")).toHaveValue("p".repeat(203));
    expect(screen.getByText("3 characters too many")).toHaveClass("field-count-over");
    type("Pitch", "p".repeat(200));
    expect(screen.getByText("0 of 200 characters left")).not.toHaveClass("field-count-over");
  });

  it("clear a field's error as soon as the field is right, and not before", async () => {
    render(<NewRocketForm />);
    type("Name", "Recipe Swap");
    type("Pitch", "p".repeat(203));
    await submitForm("New idea");
    const pitch = screen.getByLabelText("Pitch");
    expect(pitch).toHaveAttribute("aria-invalid", "true");
    type("Pitch", "p".repeat(201));
    expect(pitch).toHaveAttribute("aria-invalid", "true");
    expect(pitch).toHaveAccessibleDescription(
      expect.stringContaining("Use 200 characters or fewer for the pitch."),
    );
    type("Pitch", "p".repeat(200));
    expect(pitch).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Use 200 characters or fewer for the pitch.")).toBeNull();
    // Another field's error stays until that field is right.
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  it("tell a screen reader once when a field goes over and once when it comes back", () => {
    render(
      <LiveRegion>
        <NewRocketForm />
      </LiveRegion>,
    );
    const status = screen.getByRole("status");
    type("Name", "n".repeat(81));
    expect(status).toHaveTextContent("The name is over its 80-character limit.");
    type("Name", "n".repeat(80));
    expect(status).toHaveTextContent("The name is within its limit again.");
  });
});

describe("the points box", () => {
  it("takes one point per line and leaves blank lines out", () => {
    expect(pointsOf("  one \n\n two\r\nthree\r  \n")).toEqual(["one", "two", "three"]);
  });

  it("names the problem: too many points, or which one is too long", () => {
    expect(pointsProblem(Array(9).fill("p"))).toBe("Use 8 points or fewer. There are 9.");
    expect(pointsProblem(["ok", "p".repeat(201)])).toBe(
      "Point 2 is over 200 characters. Shorten it or split it in two.",
    );
    expect(pointsProblem(Array(8).fill("p".repeat(200)))).toBeUndefined();
  });
});

describe("PartForm", () => {
  it("counts the points as they are typed, as part of the box's description", async () => {
    const { container } = render(<PartForm rocketId="c1" kind="fuel" />);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByLabelText("Points")).toHaveAccessibleDescription(
      expect.stringContaining("0 of 8 points"),
    );
    type("Points", "one\n\ntwo\n");
    expect(screen.getByText("2 of 8 points")).toHaveClass("field-count");
    expect(screen.getByText("2 of 8 points")).not.toHaveClass("field-count-over");
  });

  it("says live when there are too many points, or which one is too long", () => {
    render(<PartForm rocketId="c1" kind="fuel" />);
    type("Points", Array(9).fill("p").join("\n"));
    expect(screen.getByText("9 of 8 points: 1 too many")).toHaveClass("field-count-over");
    type("Points", `ok\n  ${"p".repeat(205)}  `);
    expect(screen.getByText("2 of 8 points. Point 2 is 5 characters too long")).toHaveClass(
      "field-count-over",
    );
    type("Points", `ok\n${"p".repeat(201)}`);
    expect(screen.getByText("2 of 8 points. Point 2 is 1 character too long")).toBeVisible();
    type("Points", `ok\n${"p".repeat(200)}`);
    expect(screen.getByText("2 of 8 points")).not.toHaveClass("field-count-over");
  });

  it("counts the summary from the text it is editing, without the spaces at either end", () => {
    render(<PartForm rocketId="c1" kind="engine" initial={{ summary: "Cousins.", points: [] }} />);
    expect(screen.getByLabelText("Summary")).toHaveAccessibleDescription(
      expect.stringContaining("592 of 600 characters left"),
    );
    type("Summary", `  ${"s".repeat(600)}  `);
    expect(screen.getByText("0 of 600 characters left")).toBeVisible();
    type("Summary", "s".repeat(602));
    expect(screen.getByText("2 characters too many")).toHaveClass("field-count-over");
    expect(screen.getByLabelText("Summary")).toHaveValue("s".repeat(602));
  });

  it("saves the part and returns to the rocket", async () => {
    answerWith(200, {});
    render(<PartForm rocketId="c1" kind="fuel" />);
    type("Summary", "Cousins who share recipes.");
    type("Points", "Photos get lost\n\nGroup texts");
    await submitForm("The Fuel tank");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rockets/c1/parts/fuel");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(sentBody()).toEqual({
      summary: "Cousins who share recipes.",
      points: ["Photos get lost", "Group texts"],
    });
    expect(navigate).toHaveBeenCalledWith("/rockets/c1?saved=fuel");
  });

  it("refuses a ninth point or a long one at the field, and sends nothing", async () => {
    render(
      <LiveRegion>
        <PartForm rocketId="c1" kind="fuel" />
      </LiveRegion>,
    );
    type("Summary", "S");
    type("Points", Array(9).fill("p").join("\n"));
    await submitForm("The Fuel tank");
    expect(screen.getByLabelText("Points")).toHaveAccessibleDescription(
      expect.stringContaining("Use 8 points or fewer. There are 9."),
    );
    type("Points", `ok\n${"p".repeat(201)}`);
    await submitForm("The Fuel tank");
    expect(screen.getByLabelText("Points")).toHaveAccessibleDescription(
      expect.stringContaining("Point 2 is over 200 characters."),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the summary's and the points' errors once each is right", async () => {
    render(<PartForm rocketId="c1" kind="fuel" />);
    type("Summary", "s".repeat(601));
    type("Points", Array(9).fill("p").join("\n"));
    await submitForm("The Fuel tank");
    expect(screen.getByLabelText("Summary")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Points")).toHaveAttribute("aria-invalid", "true");
    type("Summary", "s".repeat(600));
    expect(screen.getByLabelText("Summary")).not.toHaveAttribute("aria-invalid");
    type("Points", `${Array(7).fill("p").join("\n")}\n${"q".repeat(201)}`);
    expect(screen.getByLabelText("Points")).toHaveAttribute("aria-invalid", "true");
    type("Points", Array(8).fill("p").join("\n"));
    expect(screen.getByLabelText("Points")).not.toHaveAttribute("aria-invalid");
  });

  it("needs a summary", async () => {
    render(<PartForm rocketId="c1" kind="fuel" />);
    await submitForm("The Fuel tank");
    expect(screen.getByLabelText("Summary")).toHaveFocus();
    expect(screen.getByLabelText("Summary")).toHaveAccessibleDescription(
      expect.stringContaining("Write a summary."),
    );
  });

  it("shows why the API refused, such as a launched idea", async () => {
    answerWith(409, { error: "This idea has launched, so it can no longer change." });
    render(<PartForm rocketId="c1" kind="engine" initial={{ summary: "S", points: ["a"] }} />);
    await submitForm("The Engine");
    expect(screen.getByRole("alert")).toHaveTextContent("This idea has launched");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not show a server fault's own words", async () => {
    answerWith(500, { error: "Something went wrong on our side. Try again in a moment." });
    render(<PartForm rocketId="c1" kind="engine" initial={{ summary: "S", points: [] }} />);
    await submitForm("The Engine");
    expect(screen.getByRole("alert")).toHaveTextContent("We could not save the Engine. Try again.");
  });
});

describe("Launch and Delete idea", () => {
  it("launch asks first, then posts and shows the launched page", async () => {
    answerWith(200, {});
    const { container } = render(<LaunchButton rocketId="c1" name="Recipe Swap" />);
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));
    expect(container.querySelector("dialog")).toHaveTextContent(
      "Launching locks this rocket. Continue?",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.submit(container.querySelector("dialog form")!);
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rockets/c1/launch");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(navigate).toHaveBeenCalledWith("/rockets/c1?notice=launched");
  });

  it("delete asks first, then deletes and replaces the page with the pad", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { container } = render(<DeleteRocketButton rocketId="c1" name="Recipe Swap" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    expect(container.querySelector("dialog")).toHaveTextContent("It cannot be undone.");
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.submit(container.querySelector("dialog form")!);
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rockets/c1");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(replaceLocation).toHaveBeenCalledWith("/pad?notice=deleted");
  });
});
