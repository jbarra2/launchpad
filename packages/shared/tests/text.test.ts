import { describe, expect, it } from "vitest";
import {
  createRocketBody,
  measuredLength,
  NAME_MAX,
  partBody,
  PITCH_MAX,
  POINT_MAX,
  ROCKET_NAME_MAX,
  signUpBody,
  SUMMARY_MAX,
  VERIFIED_LANDING,
} from "../src/index.js";

// A live counter must say "too many" exactly when submitting would be refused, so the length it
// shows has to be the length each rule measures.

const pad = (core: string) => `  ${core}  `;

describe("measuredLength", () => {
  it("leaves out spaces at either end and counts a Windows line break once", () => {
    expect(measuredLength("  abc  ")).toBe(3);
    expect(measuredLength("a\r\nb")).toBe(3);
    expect(measuredLength("a\rb")).toBe(3);
    expect(measuredLength("\r\n  \r\n")).toBe(0);
  });

  it("agrees with the idea's name, pitch, and why at their caps", () => {
    const idea = { name: "N", pitch: "P" };
    for (const [field, max] of [
      ["name", ROCKET_NAME_MAX],
      ["pitch", PITCH_MAX],
      ["why", POINT_MAX],
    ] as const) {
      const atCap = pad("x".repeat(max));
      const over = pad("x".repeat(max + 1));
      expect(measuredLength(atCap)).toBe(max);
      expect(createRocketBody.safeParse({ ...idea, [field]: atCap }).success, field).toBe(true);
      expect(measuredLength(over)).toBe(max + 1);
      expect(createRocketBody.safeParse({ ...idea, [field]: over }).success, field).toBe(false);
    }
  });

  it("agrees with the summary at its cap, Windows line breaks included", () => {
    const core = "x\r\n".repeat(SUMMARY_MAX / 2 - 1) + "xx";
    const atCap = pad(core);
    expect(measuredLength(atCap)).toBe(SUMMARY_MAX);
    expect(partBody.safeParse({ summary: atCap, points: [] }).success).toBe(true);
    const over = pad(`${core}y`);
    expect(measuredLength(over)).toBe(SUMMARY_MAX + 1);
    expect(partBody.safeParse({ summary: over, points: [] }).success).toBe(false);
  });

  it("agrees with a point and with the sign-up name at their caps", () => {
    expect(partBody.safeParse({ summary: "s", points: [pad("p".repeat(POINT_MAX))] }).success).toBe(
      true,
    );
    expect(
      partBody.safeParse({ summary: "s", points: [pad("p".repeat(POINT_MAX + 1))] }).success,
    ).toBe(false);
    const person = {
      email: "ana@example.com",
      password: "A-long-enough-password-1",
      callbackURL: VERIFIED_LANDING,
    };
    expect(signUpBody.safeParse({ ...person, name: pad("n".repeat(NAME_MAX)) }).success).toBe(true);
    expect(signUpBody.safeParse({ ...person, name: pad("n".repeat(NAME_MAX + 1)) }).success).toBe(
      false,
    );
    expect(measuredLength(pad("n".repeat(NAME_MAX)))).toBe(NAME_MAX);
  });
});
