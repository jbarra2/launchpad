import {
  PART_KINDS,
  ROCKET_LIMIT,
  type PartKind,
  type RocketDetail,
  type RocketSummary,
} from "@launchpad/shared";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";

const user = { id: "u1", name: "Ana", email: "ana@example.com" };
const requireUser = vi.fn(async (_path: string) => user);
vi.mock("@/lib/session", () => ({ requireUser: (p: string) => requireUser(p) }));
const getRockets = vi.fn(async (): Promise<RocketSummary[]> => []);
const getRocket = vi.fn(async (_id: string): Promise<RocketDetail> => detail());
vi.mock("@/lib/rockets", () => ({
  getRockets: () => getRockets(),
  getRocket: (id: string) => getRocket(id),
}));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pad",
  notFound: () => {
    throw new Error("not-found");
  },
}));

const { default: PadPage } = await import("./pad/page");
const { default: NewIdeaPage } = await import("./pad/new/page");
const { default: RocketPage } = await import("./rockets/[id]/page");
const { default: PartPage } = await import("./rockets/[id]/parts/[kind]/page");
const { default: AppLayout } = await import("./layout");

const NOW = "2026-10-27T15:00:00.000Z";

function detail(kinds: readonly PartKind[] = ["engine"], launched = false): RocketDetail {
  return {
    id: "crocket1",
    name: "Recipe Swap",
    pitch: "Trade family recipes with people you trust.",
    status: launched ? "launched" : "building",
    parts: kinds.map((kind) => ({
      kind,
      summary: `The ${kind} summary.\nSecond line.`,
      points: [`A ${kind} point`],
      source: "manual",
      updatedAt: NOW,
    })),
    launchedAt: launched ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function summary(id: string, name: string, parts: PartKind[], launched = false): RocketSummary {
  return {
    id,
    name,
    status: launched ? "launched" : "building",
    parts,
    launchedAt: launched ? NOW : null,
    updatedAt: NOW,
  };
}

const search = (query: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(query) }) as never;
const rocketProps = (query: Record<string, string> = {}, id = "crocket1") =>
  ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) }) as never;
const partProps = (kind: string, id = "crocket1") =>
  ({ params: Promise.resolve({ id, kind }) }) as never;

beforeEach(() => {
  getRockets.mockResolvedValue([]);
  getRocket.mockImplementation(async () => detail());
});

describe("a page whose session check refuses", () => {
  it("stops there, before it asks for any idea", async () => {
    for (const page of [
      () => RocketPage(rocketProps()),
      () => PartPage(partProps("fuel")),
      () => NewIdeaPage(),
      () => PadPage(search()),
    ]) {
      requireUser.mockRejectedValueOnce(new Error("redirect:/sign-in"));
      await expect(page()).rejects.toThrow("redirect:/sign-in");
    }
    expect(getRocket).not.toHaveBeenCalled();
    expect(getRockets).not.toHaveBeenCalled();
  });
});

describe("the pad", () => {
  it("shows Getting started when there are no ideas, with a way to create the first", async () => {
    const { container } = render(<AppLayout>{await PadPage(search())}</AppLayout>);
    expect(screen.getByRole("status")).toHaveTextContent("No ideas yet.");
    const start = screen.getByRole("region", { name: "Getting started" });
    expect(within(start).getByRole("link", { name: "Create your first idea" })).toHaveAttribute(
      "href",
      "/pad/new",
    );
    expect(screen.getByRole("link", { name: "New idea" })).toHaveAttribute("href", "/pad/new");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows a card per idea with its progress in words, and the launched ones on their own shelf", async () => {
    getRockets.mockResolvedValue([
      summary("c1", "Recipe Swap", ["engine", "fuel", "body"]),
      summary("c2", "Study Buddy", [...PART_KINDS]),
      summary("c3", "Plant Diary", [...PART_KINDS], true),
    ]);
    const { container } = render(<AppLayout>{await PadPage(search())}</AppLayout>);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
    const building = screen.getByRole("region", { name: "Ideas being built" });
    expect(within(building).getByRole("link", { name: "Recipe Swap" })).toHaveAttribute(
      "href",
      "/rockets/c1",
    );
    expect(within(building).getByText("3 of 6 parts")).toBeInTheDocument();
    expect(within(building).getByText("Ready to launch")).toBeInTheDocument();
    expect(within(building).getByRole("img", { name: /Rocket, 3 of 6 parts/ })).toBeVisible();

    const shelf = screen.getByRole("region", { name: "Launched" });
    expect(shelf.querySelector(".rocket-card-status")).toHaveTextContent("Launched Oct 27, 2026");
    expect(
      within(shelf).getByRole("link", { name: "Download PLAN.md for Plant Diary" }),
    ).toHaveAttribute("href", "/api/rockets/c3/plan.md");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("swaps New idea for a sentence once the pad holds 20 ideas", async () => {
    getRockets.mockResolvedValue(
      Array.from({ length: ROCKET_LIMIT }, (_, i) => summary(`c${i}`, `Idea ${i}`, ["engine"])),
    );
    render(<AppLayout>{await PadPage(search())}</AppLayout>);
    expect(screen.queryByRole("link", { name: "New idea" })).toBeNull();
    expect(screen.getByText(/You have 20 ideas, the most the pad holds/)).toBeInTheDocument();
  });

  it("says an idea was deleted, and shows no notice that is not on its list", async () => {
    const { unmount } = render(await PadPage(search({ notice: "deleted" })));
    expect(screen.getByText("The idea is deleted.")).toHaveAttribute("role", "status");
    unmount();
    getRockets.mockResolvedValue([summary("c1", "Recipe Swap", ["engine"])]);
    render(await PadPage(search({ notice: "Call 555-0100 to unlock" })));
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toContain("555");
  });
});

describe("New idea", () => {
  it("checks the session and holds the form", async () => {
    const { container } = render(<AppLayout>{await NewIdeaPage()}</AppLayout>);
    expect(requireUser).toHaveBeenCalledWith("/pad/new");
    expect(screen.getByRole("form", { name: "New idea" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the limit instead of the form at 20 ideas", async () => {
    getRockets.mockResolvedValue(
      Array.from({ length: ROCKET_LIMIT }, (_, i) => summary(`c${i}`, `Idea ${i}`, ["engine"])),
    );
    render(await NewIdeaPage());
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByText(/You have 20 ideas/)).toBeInTheDocument();
  });
});

describe("the rocket page", () => {
  it("checks the session for its own address, then shows the rocket and the plan in order", async () => {
    getRocket.mockResolvedValue(detail(["engine", "fuel"]));
    const { container } = render(<AppLayout>{await RocketPage(rocketProps())}</AppLayout>);
    expect(requireUser).toHaveBeenCalledWith("/rockets/crocket1");
    expect(getRocket).toHaveBeenCalledWith("crocket1");
    expect(screen.getByRole("heading", { level: 1, name: "Recipe Swap" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Rocket, 2 of 6 parts: Engine, Fuel tank" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 6 parts")).toBeInTheDocument();
    expect(screen.getByText("4 parts to go before launch.")).toBeInTheDocument();

    const plan = screen.getByRole("region", { name: "The plan" });
    const items = within(plan)
      .getAllByRole("listitem")
      .filter((li) => li.querySelector("h3"));
    expect(items.map((li) => li.querySelector("h3")?.textContent)).toEqual([
      "Engine · The idea",
      "Fuel tank · Problem & people",
      "Body · Features",
      "Avionics · Tech & data",
      "Fins · Risks & unknowns",
      "Nose cone · Build plan",
    ]);
    expect(within(plan).getByRole("link", { name: "Edit the Engine" })).toHaveAttribute(
      "href",
      "/rockets/crocket1/parts/engine",
    );
    expect(
      within(plan).getByRole("link", { name: "Write it myself for the Body" }),
    ).toHaveAttribute("href", "/rockets/crocket1/parts/body");
    expect(within(plan).getAllByText("Not written yet")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Launch" })).toBeNull();
    expect(screen.getByRole("link", { name: "Download PLAN.md" })).toHaveAttribute(
      "href",
      "/api/rockets/crocket1/plan.md",
    );
    expect(screen.getByRole("link", { name: "Download KICKOFF.md" })).toHaveAttribute(
      "href",
      "/api/rockets/crocket1/kickoff.md",
    );
    expect(screen.getByRole("button", { name: "Delete idea" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps a summary's line breaks as text", async () => {
    render(await RocketPage(rocketProps()));
    const summaryText = screen.getByText(/The engine summary\./);
    expect(summaryText).toHaveClass("plan-summary");
    expect(summaryText.textContent).toBe("The engine summary.\nSecond line.");
  });

  it("offers Launch once all six parts are on", async () => {
    getRocket.mockResolvedValue(detail([...PART_KINDS]));
    const { container } = render(<AppLayout>{await RocketPage(rocketProps())}</AppLayout>);
    expect(screen.getByText("Ready to launch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Write it myself/ })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is read-only once launched: no Edit, no Write, no Launch, and the date in words", async () => {
    getRocket.mockResolvedValue(detail([...PART_KINDS], true));
    const { container } = render(<AppLayout>{await RocketPage(rocketProps())}</AppLayout>);
    expect(screen.queryByRole("link", { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Write it myself/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Launch" })).toBeNull();
    expect(screen.getByText(/The idea is locked/)).toHaveTextContent(
      "Launched Oct 27, 2026. The idea is locked.",
    );
    expect(screen.getByRole("link", { name: "Download PLAN.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete idea" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says which part was saved, from the list of kinds only", async () => {
    const { unmount } = render(await RocketPage(rocketProps({ saved: "fuel" })));
    expect(screen.getByRole("status")).toHaveTextContent("The Fuel tank is saved.");
    unmount();
    render(await RocketPage(rocketProps({ saved: "<script>" })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lets the 404 from the rocket helper through", async () => {
    getRocket.mockRejectedValueOnce(new Error("not-found"));
    await expect(RocketPage(rocketProps())).rejects.toThrow("not-found");
  });
});

describe("the part page", () => {
  it("writes the next part, with an empty form", async () => {
    const { container } = render(<AppLayout>{await PartPage(partProps("fuel"))}</AppLayout>);
    expect(requireUser).toHaveBeenCalledWith("/rockets/crocket1/parts/fuel");
    expect(screen.getByRole("heading", { level: 1, name: "Write the Fuel tank" })).toBeVisible();
    expect(screen.getByLabelText("Summary")).toHaveValue("");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/rockets/crocket1",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("edits a part that is on, filled with what it says", async () => {
    getRocket.mockResolvedValue(detail(["engine", "fuel"]));
    render(await PartPage(partProps("engine")));
    expect(screen.getByRole("heading", { level: 1, name: "Edit the Engine" })).toBeVisible();
    expect(screen.getByLabelText("Summary")).toHaveValue("The engine summary.\nSecond line.");
    expect(screen.getByLabelText("Points")).toHaveValue("A engine point");
    expect(screen.getByText("1 of 8 points")).toBeInTheDocument();
  });

  it("says which part comes first instead of a form for a part out of order", async () => {
    render(await PartPage(partProps("body")));
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByText("Add the Fuel tank before the Body.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write the Fuel tank" })).toHaveAttribute(
      "href",
      "/rockets/crocket1/parts/fuel",
    );
  });

  it("shows no form on a launched idea", async () => {
    getRocket.mockResolvedValue(detail([...PART_KINDS], true));
    render(await PartPage(partProps("engine")));
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByText(/has launched/)).toBeInTheDocument();
  });

  it("is the 404 page for a part that does not exist, before asking for the idea", async () => {
    await expect(PartPage(partProps("wings"))).rejects.toThrow("not-found");
    expect(getRocket).not.toHaveBeenCalled();
  });
});
