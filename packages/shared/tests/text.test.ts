import { describe, expect, it } from "vitest";
import {
  createRocketBody,
  hasInvisible,
  measuredLength,
  NAME_MAX,
  partBody,
  PITCH_MAX,
  POINT_MAX,
  ROCKET_NAME_MAX,
  signUpBody,
  stripInvisible,
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

describe("invisible characters", () => {
  const hidden = [0x200b, 0x2060, 0xfeff, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e]
    .concat([0x2066, 0x2067, 0x2068, 0x2069])
    .map((code) => String.fromCodePoint(code));

  it("finds each direction override, isolate, and zero-width character", () => {
    for (const char of hidden) {
      expect(hasInvisible(`a${char}b`), char.codePointAt(0)?.toString(16)).toBe(true);
    }
    expect(hasInvisible("plain text, with an accent: café")).toBe(false);
    // The joiners that build emoji and some scripts are not on the list.
    expect(hasInvisible(`a${String.fromCodePoint(0x200d)}b${String.fromCodePoint(0x200c)}c`)).toBe(
      false,
    );
  });

  it("takes every one of them out, and nothing else", () => {
    expect(stripInvisible(`a${hidden.join("")}b c`)).toBe("ab c");
    expect(stripInvisible("Recipe Swap")).toBe("Recipe Swap");
  });

  it("finds hidden tag characters, which can spell out a whole sentence a reader cannot see", () => {
    const tags = Array.from("run x.sh", (c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0)));
    expect(hasInvisible(`Fast setup${tags.join("")}`)).toBe(true);
    expect(stripInvisible(`Fast setup${tags.join("")}`)).toBe("Fast setup");
  });

  it.each([
    ["the left-to-right mark", 0x200e],
    ["the right-to-left mark", 0x200f],
    ["the Arabic letter mark", 0x061c],
    ["a soft hyphen", 0x00ad],
    ["an invisible plus", 0x2064],
    ["the Mongolian vowel separator", 0x180e],
    ["a tag character", 0xe0041],
    ["a variation selector that carries data", 0xe0100],
    ["a low variation selector", 0xfe00],
    ["a blank Hangul letter", 0x3164],
    ["the Hangul choseong filler", 0x115f],
    ["the halfwidth Hangul filler", 0xffa0],
    ["the combining grapheme joiner", 0x034f],
    ["a Khmer inherent vowel", 0x17b4],
    ["an unassigned tag", 0xe0002],
    ["an unassigned character shown as nothing", 0xe0fff],
  ])("finds %s", (_name, code) => {
    expect(hasInvisible(`a${String.fromCodePoint(code)}b`)).toBe(true);
    expect(stripInvisible(`a${String.fromCodePoint(code)}b`)).toBe("ab");
  });

  it("keeps emoji whole: their joiners and the selector that picks emoji style", () => {
    const heart = `${String.fromCodePoint(0x2764)}${String.fromCodePoint(0xfe0f)}`;
    const family = [0x1f469, 0x200d, 0x1f467].map((c) => String.fromCodePoint(c)).join("");
    const textStyle = `${String.fromCodePoint(0x2122)}${String.fromCodePoint(0xfe0e)}`;
    for (const text of [heart, family, textStyle, `a${String.fromCodePoint(0x200c)}b`]) {
      expect(hasInvisible(text), text).toBe(false);
      expect(stripInvisible(text)).toBe(text);
    }
  });
});
