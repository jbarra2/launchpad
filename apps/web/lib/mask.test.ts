import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask";

describe("maskEmail", () => {
  it("shows the first letters of the name, the first letter of the domain, and its ending", () => {
    expect(maskEmail("ana.lopez@example.com")).toBe("an•••@e•••.com");
  });

  it("uses the same three dots for every length, so the length is not shown either", () => {
    expect(maskEmail("anastasia.lopez.garcia@example.com")).toBe("an•••@e•••.com");
    expect(maskEmail("ana.lopez@example.com")).toBe("an•••@e•••.com");
  });

  it.each([
    ["a@example.com", "•••@e•••.com"],
    ["ab@example.com", "a•••@e•••.com"],
    ["ana@example.com", "a•••@e•••.com"],
    ["anna@example.com", "an•••@e•••.com"],
  ])("never shows more than half of the name: %s", (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it("keeps only the last part of a domain with several", () => {
    expect(maskEmail("ana.lopez@mail.example.co.test")).toBe("an•••@m•••.test");
  });

  it("hides a domain with no dot past its first letter", () => {
    expect(maskEmail("ana.lopez@localhost")).toBe("an•••@l•••");
  });

  it("splits at the last @, since a quoted name may hold one", () => {
    expect(maskEmail('"ana@home"@example.com')).toBe('"a•••@e•••.com');
  });

  it("counts letters, not halves of them, so no character is cut in two", () => {
    expect(maskEmail("Ωμέγα@παράδειγμα.ελ")).toBe("Ωμ•••@π•••.ελ");
    expect(maskEmail("😀😀😀😀@example.com")).toBe("😀😀•••@e•••.com");
  });

  it.each(["", "no-at-sign", "@example.com", "ana@", "@"])(
    "gives back only dots for something that is not an address: %j",
    (value) => {
      expect(maskEmail(value)).toBe("•••");
    },
  );

  it.each([
    "ana.lopez@example.com",
    "ben@mail.example.org",
    "c@d.test",
    "dora.the.long.named@sub.domain.example.net",
  ])("never contains the whole name or the domain's name: %s", (email) => {
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    const domainName = email.slice(at + 1).split(".")[0]!;
    const masked = maskEmail(email);
    expect(masked).not.toContain(email);
    expect(masked).not.toContain(`${local}@`);
    expect(masked).not.toContain(domainName.length > 1 ? domainName : `@${domainName}.`);
  });
});
