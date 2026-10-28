import { PART_KINDS } from "@launchpad/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import { Rocket, rocketLabel } from "./rocket";

describe("Rocket", () => {
  it("is one image whose name lists the parts that are on", async () => {
    const { container } = render(<Rocket parts={["engine", "fuel"]} idPrefix="c1" />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Rocket, 2 of 6 parts: Engine, Fuel tank");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("draws one group per part: filled when on, a dashed ghost when missing", () => {
    const { container } = render(<Rocket parts={["engine", "fuel"]} idPrefix="c1" />);
    const groups = [...container.querySelectorAll("g[data-part]")];
    expect(groups.map((g) => g.getAttribute("data-part"))).toEqual([...PART_KINDS]);
    const state = Object.fromEntries(
      groups.map((g) => [g.getAttribute("data-part"), g.getAttribute("data-state")]),
    );
    expect(state).toEqual({
      engine: "on",
      fuel: "on",
      body: "missing",
      avionics: "missing",
      fins: "missing",
      nose: "missing",
    });
    expect(container.querySelector('g[data-part="engine"] path')).toHaveAttribute(
      "fill",
      "url(#rocket-fill-c1)",
    );
    expect(container.querySelector('g[data-part="nose"]')).toHaveClass("rocket-ghost");
    expect(container.querySelector('g[data-part="nose"] path')).toHaveAttribute("fill", "none");
  });

  it("gives each rocket on a page its own gradient, and keeps the id to safe characters", () => {
    const { container } = render(
      <>
        <Rocket parts={["engine"]} idPrefix="c1" />
        <Rocket parts={["engine"]} idPrefix={'c2" onload="x'} />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids).toEqual(["rocket-fill-c1", "rocket-fill-c2onloadx"]);
  });

  it("can take a label of its own", () => {
    render(<Rocket parts={PART_KINDS} idPrefix="landing" label="A rocket with all six parts on" />);
    expect(screen.getByRole("img")).toHaveAccessibleName("A rocket with all six parts on");
  });

  it("names all six in order when complete", () => {
    expect(rocketLabel([...PART_KINDS].reverse())).toBe(
      "Rocket, 6 of 6 parts: Engine, Fuel tank, Body, Avionics, Fins, Nose cone",
    );
  });
});
