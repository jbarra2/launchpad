import { describe, expect, it } from "vitest";
import {
  buildKickoffMarkdown,
  buildPlanMarkdown,
  canWritePart,
  createRocketBody,
  KICKOFF_INTRO,
  nextPartKind,
  NOT_WRITTEN,
  PART_INFO,
  PART_KINDS,
  partBody,
  partKindParam,
  partLabel,
  rocketDetail,
  rocketIdParam,
  rocketListQuery,
  rocketSummary,
} from "../src/index.js";

const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);
const ESCAPE = String.fromCodePoint(0x1b);

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("the six parts", () => {
  it("go bottom to top, each with its rocket name and plan section", () => {
    expect(PART_KINDS).toEqual(["engine", "fuel", "body", "avionics", "fins", "nose"]);
    expect(partLabel("fuel")).toBe("Fuel tank · Problem & people");
    expect(PART_INFO.nose).toEqual({ name: "Nose cone", section: "Build plan" });
  });

  it("are written in order: the next missing one, or any that is on already", () => {
    expect(nextPartKind(["engine"])).toBe("fuel");
    expect(nextPartKind([...PART_KINDS])).toBeNull();
    expect(canWritePart(["engine", "fuel"], "body")).toBe(true);
    expect(canWritePart(["engine", "fuel"], "engine")).toBe(true);
    expect(canWritePart(["engine", "fuel"], "avionics")).toBe(false);
  });
});

describe("createRocketBody", () => {
  const valid = { name: "Recipe Swap", pitch: "Trade family recipes with people you trust." };

  it("accepts a name and a pitch, and trims both", () => {
    expect(createRocketBody.parse({ name: "  Recipe Swap ", pitch: " A pitch. " })).toEqual({
      name: "Recipe Swap",
      pitch: "A pitch.",
    });
  });

  it("caps the name at 80 and the pitch at 200, measured after trimming", () => {
    expect(createRocketBody.safeParse({ ...valid, name: `  ${"n".repeat(80)}  ` }).success).toBe(
      true,
    );
    expect(messages(createRocketBody.safeParse({ ...valid, name: "n".repeat(81) }))).toEqual([
      "Use 80 characters or fewer for the name.",
    ]);
    expect(createRocketBody.safeParse({ ...valid, pitch: "p".repeat(200) }).success).toBe(true);
    expect(createRocketBody.safeParse({ ...valid, pitch: "p".repeat(201) }).success).toBe(false);
  });

  it("refuses an empty name or pitch with a sentence", () => {
    expect(messages(createRocketBody.safeParse({ ...valid, name: "   " }))).toEqual([
      "Enter a name for the idea.",
    ]);
    expect(messages(createRocketBody.safeParse({ name: "x" }))).toEqual([
      "Enter a one-line pitch.",
    ]);
  });

  it("keeps the name and the pitch to one line, with no control characters", () => {
    for (const bad of [
      "a\nb",
      "a\rb",
      `a${LINE_SEPARATOR}b`,
      `a${PARAGRAPH_SEPARATOR}b`,
      "a\tb",
      `a${ESCAPE}[31mb`,
    ]) {
      expect(createRocketBody.safeParse({ ...valid, name: bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
      expect(createRocketBody.safeParse({ ...valid, pitch: bad }).success).toBe(false);
    }
    expect(messages(createRocketBody.safeParse({ ...valid, name: "a\nb" }))).toEqual([
      "Keep the name to one line.",
    ]);
  });

  it("takes an optional why of up to 200 characters, and drops an empty one", () => {
    expect(createRocketBody.parse({ ...valid, why: "  Family.  " }).why).toBe("Family.");
    expect(createRocketBody.parse({ ...valid, why: "   " })).not.toHaveProperty("why", "");
    expect(createRocketBody.parse({ ...valid, why: "" }).why).toBeUndefined();
    expect(createRocketBody.safeParse({ ...valid, why: "w".repeat(200) }).success).toBe(true);
    expect(createRocketBody.safeParse({ ...valid, why: "w".repeat(201) }).success).toBe(false);
    expect(createRocketBody.safeParse({ ...valid, why: "a\nb" }).success).toBe(false);
    expect(createRocketBody.safeParse({ ...valid, why: 5 }).success).toBe(false);
  });

  it("refuses a field the form does not have, such as an owner", () => {
    expect(createRocketBody.safeParse({ ...valid, userId: "someone-else" }).success).toBe(false);
    expect(createRocketBody.safeParse({ ...valid, status: "launched" }).success).toBe(false);
  });
});

describe("partBody", () => {
  const valid = { summary: "Cousins who share recipes as photos.", points: ["One", "Two"] };

  it("accepts a summary and up to 8 points, trimmed", () => {
    expect(partBody.parse({ summary: "  S  ", points: ["  a  "] })).toEqual({
      summary: "S",
      points: ["a"],
    });
    expect(partBody.safeParse({ ...valid, points: [] }).success).toBe(true);
    expect(partBody.safeParse({ ...valid, points: Array(8).fill("p") }).success).toBe(true);
  });

  it("refuses a ninth point", () => {
    expect(messages(partBody.safeParse({ ...valid, points: Array(9).fill("p") }))).toEqual([
      "Use 8 points or fewer.",
    ]);
  });

  it("caps the summary at 600 and each point at 200", () => {
    expect(partBody.safeParse({ ...valid, summary: "s".repeat(600) }).success).toBe(true);
    expect(messages(partBody.safeParse({ ...valid, summary: "s".repeat(601) }))).toEqual([
      "Use 600 characters or fewer for the summary.",
    ]);
    expect(partBody.safeParse({ ...valid, points: ["p".repeat(200)] }).success).toBe(true);
    expect(messages(partBody.safeParse({ ...valid, points: ["p".repeat(201)] }))).toEqual([
      "Use 200 characters or fewer for the point.",
    ]);
  });

  it("lets a summary run over lines, stores Windows line endings as plain ones, and counts those", () => {
    expect(partBody.parse({ ...valid, summary: "one\r\ntwo\rthree" }).summary).toBe(
      "one\ntwo\nthree",
    );
    // 300 Windows line breaks are 600 characters as sent and 300 once stored.
    const summary = "\r\n".repeat(150) + "x" + "\r\n".repeat(150) + "y".repeat(299);
    expect(partBody.parse({ ...valid, summary }).summary.length).toBeLessThanOrEqual(600);
  });

  it("refuses other control characters in the summary", () => {
    expect(partBody.safeParse({ ...valid, summary: `a${ESCAPE}[2Jb` }).success).toBe(false);
    expect(partBody.safeParse({ ...valid, summary: `a${LINE_SEPARATOR}b` }).success).toBe(false);
    expect(partBody.safeParse({ ...valid, summary: "a\tb" }).success).toBe(true);
  });

  it("refuses an empty summary, an empty point, and a point over two lines", () => {
    expect(messages(partBody.safeParse({ ...valid, summary: " \n " }))).toEqual([
      "Write a summary.",
    ]);
    expect(messages(partBody.safeParse({ ...valid, points: ["  "] }))).toEqual([
      "A point cannot be empty.",
    ]);
    expect(partBody.safeParse({ ...valid, points: [`a${PARAGRAPH_SEPARATOR}b`] }).success).toBe(
      false,
    );
    expect(partBody.safeParse({ ...valid, summary: `a${PARAGRAPH_SEPARATOR}b` }).success).toBe(
      false,
    );
    expect(partBody.safeParse({ ...valid, points: ["a\nb"] }).success).toBe(false);
  });

  it("refuses points sent as anything but a list of words, and unknown fields", () => {
    expect(partBody.safeParse({ ...valid, points: "a\nb" }).success).toBe(false);
    expect(partBody.safeParse({ ...valid, points: [1] }).success).toBe(false);
    expect(partBody.safeParse({ summary: "s" }).success).toBe(false);
    expect(partBody.safeParse({ ...valid, source: "chat" }).success).toBe(false);
  });
});

describe("the address parts", () => {
  it("takes an id only in the shape the database makes", () => {
    expect(rocketIdParam.safeParse("cmabc123def456ghi789jkl01").success).toBe(true);
    for (const bad of ["", "../me", "a/b", "ABC", "a".repeat(41), "a b", "%2e%2e"]) {
      expect(rocketIdParam.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("takes a part kind only from the list", () => {
    expect(partKindParam.safeParse("fuel").success).toBe(true);
    expect(partKindParam.safeParse("FUEL").success).toBe(false);
    expect(partKindParam.safeParse("wings").success).toBe(false);
  });

  it("takes a status filter of building or launched, and nothing else", () => {
    expect(rocketListQuery.parse({})).toEqual({});
    expect(rocketListQuery.parse({ status: "launched" })).toEqual({ status: "launched" });
    expect(rocketListQuery.safeParse({ status: "LAUNCHED" }).success).toBe(false);
    expect(rocketListQuery.safeParse({ status: ["building", "launched"] }).success).toBe(false);
    expect(rocketListQuery.safeParse({ userId: "x" }).success).toBe(false);
  });
});

describe("the answers' ids", () => {
  it("are only ever in the shape the database makes, since pages build addresses from them", () => {
    const now = new Date().toISOString();
    const base = { name: "N", status: "building", parts: [], launchedAt: null, updatedAt: now };
    expect(rocketSummary.safeParse({ ...base, id: "c1" }).success).toBe(true);
    for (const id of ["../settings", "c1/../me", "C1", ""]) {
      expect(rocketSummary.safeParse({ ...base, id }).success, id).toBe(false);
      expect(rocketDetail.safeParse({ ...base, id, pitch: "P", createdAt: now }).success, id).toBe(
        false,
      );
    }
  });
});

describe("rocketDetail", () => {
  it("drops a field it does not list, such as the owner's id", () => {
    const now = new Date().toISOString();
    const parsed = rocketDetail.parse({
      id: "c1",
      name: "N",
      pitch: "P",
      status: "building",
      parts: [],
      launchedAt: null,
      createdAt: now,
      updatedAt: now,
      userId: "owner",
    });
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("the exported files", () => {
  const rocket = {
    name: "Recipe Swap",
    pitch: "Trade family recipes with people you trust.",
    parts: [
      { kind: "engine" as const, summary: "Recipes stay in the family.", points: ["Why: Gran"] },
      { kind: "fuel" as const, summary: "Cousins.\nThey lose photos.", points: [] },
    ],
  };

  it("PLAN.md holds the name, the pitch, and every section in order", () => {
    const plan = buildPlanMarkdown(rocket);
    expect(
      plan.startsWith("# Recipe Swap\n\n> Trade family recipes with people you trust.\n"),
    ).toBe(true);
    const at = PART_KINDS.map((kind) => plan.indexOf(`## ${PART_INFO[kind].section}`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(plan).toContain("## The idea\n\nRecipes stay in the family.\n\n- Why: Gran");
    expect(plan).toContain("## Problem & people\n\nCousins.\nThey lose photos.\n\n## Features");
    expect(plan).toContain(`## Build plan\n\n${NOT_WRITTEN}\n`);
    expect(plan.endsWith("\n")).toBe(true);
  });

  it("KICKOFF.md is the prompt with the whole plan under it", () => {
    const kickoff = buildKickoffMarkdown(rocket);
    expect(kickoff.startsWith(KICKOFF_INTRO)).toBe(true);
    expect(kickoff.endsWith(buildPlanMarkdown(rocket))).toBe(true);
  });
});
