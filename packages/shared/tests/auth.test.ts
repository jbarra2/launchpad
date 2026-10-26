import { describe, expect, it } from "vitest";
import {
  deleteAccountBody,
  forgotPasswordBody,
  meResponse,
  resetPasswordBody,
  sendVerificationBody,
  signInBody,
  signUpBody,
} from "../src/index.js";

const password = "a-long-enough-password";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message ?? "";
}

describe("signUpBody", () => {
  const valid = { name: "Ana", email: "ana@example.com", password };

  it("accepts a name, an email, and a password of 12 or more characters", () => {
    expect(signUpBody.safeParse(valid).success).toBe(true);
  });

  it("trims the name and refuses an empty one", () => {
    expect(signUpBody.parse({ ...valid, name: "  Ana  " }).name).toBe("Ana");
    expect(signUpBody.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("caps the name at 80 characters", () => {
    expect(signUpBody.safeParse({ ...valid, name: "n".repeat(80) }).success).toBe(true);
    expect(signUpBody.safeParse({ ...valid, name: "n".repeat(81) }).success).toBe(false);
  });

  it("caps the email at 254 characters and refuses one that is not an address", () => {
    const longLocal = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(60)}.com`;
    expect(longLocal.length).toBeGreaterThan(254);
    expect(signUpBody.safeParse({ ...valid, email: longLocal }).success).toBe(false);
    expect(signUpBody.safeParse({ ...valid, email: "not an address" }).success).toBe(false);
  });

  it("wants a password of 12 to 128 characters, with a sentence that says so", () => {
    expect(signUpBody.safeParse({ ...valid, password: "p".repeat(12) }).success).toBe(true);
    expect(signUpBody.safeParse({ ...valid, password: "p".repeat(128) }).success).toBe(true);
    const short = signUpBody.safeParse({ ...valid, password: "p".repeat(11) });
    expect(short.success).toBe(false);
    expect(firstMessage(short)).toBe("Use at least 12 characters for the password.");
    const long = signUpBody.safeParse({ ...valid, password: "p".repeat(129) });
    expect(long.success).toBe(false);
    expect(firstMessage(long)).toBe("Use at most 128 characters for the password.");
  });

  it("refuses a missing field", () => {
    expect(signUpBody.safeParse({ email: valid.email, password }).success).toBe(false);
  });

  it("refuses a field that the form does not have, such as an image of any size", () => {
    expect(signUpBody.safeParse({ ...valid, image: "i".repeat(1_000_000) }).success).toBe(false);
    expect(signUpBody.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });
});

describe("every body schema", () => {
  it.each([
    ["signInBody", signInBody, { email: "ana@example.com", password: "x" }],
    [
      "forgotPasswordBody",
      forgotPasswordBody,
      { email: "ana@example.com", redirectTo: "/reset-password" },
    ],
    ["sendVerificationBody", sendVerificationBody, { email: "ana@example.com" }],
    ["resetPasswordBody", resetPasswordBody, { token: "abc", newPassword: password }],
    ["deleteAccountBody", deleteAccountBody, { password: "x" }],
  ])("%s refuses a field it does not list", (_name, schema, valid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, extra: "field" }).success).toBe(false);
  });
});

describe("a missing field", () => {
  it.each([
    ["signUpBody", signUpBody],
    ["signInBody", signInBody],
    ["forgotPasswordBody", forgotPasswordBody],
    ["sendVerificationBody", sendVerificationBody],
    ["resetPasswordBody", resetPasswordBody],
    ["deleteAccountBody", deleteAccountBody],
  ])("is named in a sentence by %s, never in Zod's own wording", (_name, schema) => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    for (const issue of result.error?.issues ?? []) {
      expect(issue.message).not.toMatch(/invalid input|expected .* received/i);
      expect(issue.message).toMatch(/\.$/);
    }
  });

  it("asks for the password when a delete has none", () => {
    expect(firstMessage(deleteAccountBody.safeParse({}))).toBe("Enter your password.");
  });
});

describe("signInBody", () => {
  it("accepts an email and a password", () => {
    expect(signInBody.safeParse({ email: "ana@example.com", password: "x" }).success).toBe(true);
  });

  it("refuses an empty password and one over 128 characters, and does not judge the minimum", () => {
    expect(signInBody.safeParse({ email: "ana@example.com", password: "" }).success).toBe(false);
    expect(
      signInBody.safeParse({ email: "ana@example.com", password: "p".repeat(129) }).success,
    ).toBe(false);
  });
});

describe("forgotPasswordBody", () => {
  const valid = { email: "ana@example.com", redirectTo: "/reset-password" };

  it("wants an email and the reset page as the place the link lands", () => {
    expect(forgotPasswordBody.safeParse(valid).success).toBe(true);
  });

  it("refuses a request with no redirect, because its link would have nowhere to land", () => {
    expect(forgotPasswordBody.safeParse({ email: valid.email }).success).toBe(false);
  });

  it("refuses any other place for the link to land, on this site or off it", () => {
    // The reset token is added to this address, so only the reset page may be named.
    for (const redirectTo of [
      "/pad",
      "/reset-password/extra",
      "/reset-password?next=/pad",
      "https://evil.example/x",
      "//evil.example/x",
      "javascript:alert(1)",
    ]) {
      expect(forgotPasswordBody.safeParse({ ...valid, redirectTo }).success).toBe(false);
    }
  });

  it("refuses a bad email", () => {
    expect(forgotPasswordBody.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});

describe("sendVerificationBody", () => {
  it("accepts an email, with an optional place inside the site to land after verifying", () => {
    expect(sendVerificationBody.safeParse({ email: "ana@example.com" }).success).toBe(true);
    expect(
      sendVerificationBody.safeParse({ email: "ana@example.com", callbackURL: "/sign-in" }).success,
    ).toBe(true);
  });

  it("refuses a place that leaves the site, and a bad email", () => {
    for (const callbackURL of [
      "https://evil.example/x",
      "//evil.example/x",
      "javascript:alert(1)",
    ]) {
      expect(
        sendVerificationBody.safeParse({ email: "ana@example.com", callbackURL }).success,
      ).toBe(false);
    }
    expect(sendVerificationBody.safeParse({ email: "nope" }).success).toBe(false);
    expect(sendVerificationBody.safeParse({}).success).toBe(false);
  });
});

describe("resetPasswordBody", () => {
  it("wants a token and a new password of 12 to 128 characters", () => {
    expect(resetPasswordBody.safeParse({ token: "abc", newPassword: password }).success).toBe(true);
    expect(resetPasswordBody.safeParse({ token: "abc", newPassword: "short" }).success).toBe(false);
    expect(resetPasswordBody.safeParse({ token: "", newPassword: password }).success).toBe(false);
    expect(
      resetPasswordBody.safeParse({ token: "t".repeat(201), newPassword: password }).success,
    ).toBe(false);
  });
});

describe("deleteAccountBody", () => {
  it("needs the password, because a session alone must not delete an account", () => {
    expect(deleteAccountBody.safeParse({ password: "x" }).success).toBe(true);
    expect(deleteAccountBody.safeParse({}).success).toBe(false);
    expect(deleteAccountBody.safeParse({ password: "" }).success).toBe(false);
    expect(deleteAccountBody.safeParse({ password: "p".repeat(129) }).success).toBe(false);
  });
});

describe("meResponse", () => {
  const user = { id: "u1", name: "Ana", email: "ana@example.com" };

  it("holds the signed-in person and nothing else", () => {
    expect(meResponse.parse({ user })).toEqual({ user });
  });

  it("drops fields that are not in the contract, such as a password hash or a token", () => {
    const parsed = meResponse.parse({
      user: { ...user, password: "hash", token: "t", emailVerified: true },
    });
    expect(parsed).toEqual({ user });
  });

  it("refuses a response with no user", () => {
    expect(meResponse.safeParse({}).success).toBe(false);
  });
});
