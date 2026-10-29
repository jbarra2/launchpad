import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_PREFIX,
  deleteAccountBody,
  forgotPasswordBody,
  meResponse,
  PASSWORD_HINT,
  PASSWORD_UNCHANGED,
  resetLinkQuery,
  resetPasswordBody,
  sendVerificationBody,
  signInBody,
  signUpBody,
  VERIFIED_LANDING,
  verifyEmailQuery,
} from "../src/index.js";

const password = "A-long-enough-password-1";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message ?? "";
}

describe("signUpBody", () => {
  const valid = { name: "Ana", email: "ana@example.com", password, callbackURL: VERIFIED_LANDING };

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
    expect(signUpBody.safeParse({ ...valid, password: `Aa1${"p".repeat(9)}` }).success).toBe(true);
    expect(signUpBody.safeParse({ ...valid, password: `Aa1${"p".repeat(125)}` }).success).toBe(
      true,
    );
    const short = signUpBody.safeParse({ ...valid, password: `Aa1${"p".repeat(8)}` });
    expect(short.success).toBe(false);
    expect(firstMessage(short)).toBe("Use at least 12 characters for the password.");
    const long = signUpBody.safeParse({ ...valid, password: `Aa1${"p".repeat(126)}` });
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

// Sign-up and reset both set a new password, so both must hold it to the same rules.
describe.each([
  [
    "signUpBody",
    (value: string) =>
      signUpBody.safeParse({
        name: "Ana",
        email: "ana@example.com",
        password: value,
        callbackURL: VERIFIED_LANDING,
      }),
  ],
  [
    "resetPasswordBody",
    (value: string) => resetPasswordBody.safeParse({ token: "abc", newPassword: value }),
  ],
])("a new password in %s", (_name, parse) => {
  function problem(value: string): string {
    const result = parse(value);
    expect(result.success, JSON.stringify(value)).toBe(false);
    // One sentence per problem, all in one message, so the form shows everything at once.
    expect(result.error?.issues).toHaveLength(1);
    return firstMessage(result);
  }

  it("is accepted with an uppercase letter, a lowercase letter, and a number", () => {
    expect(parse("Correct-horse-9").success).toBe(true);
    // Any symbol is welcome. None is required.
    expect(parse("Correcthorse9").success).toBe(true);
    expect(parse("Correct!@#$%^&*()_+horse9").success).toBe(true);
  });

  it.each([
    ["an uppercase letter", "correct-horse-9", "Add an uppercase letter."],
    ["a lowercase letter", "CORRECT-HORSE-9", "Add a lowercase letter."],
    ["a number", "Correct-horse-nine", "Add a number."],
  ])("names %s when only that is missing", (_rule, value, message) => {
    expect(problem(value)).toBe(message);
  });

  it("names everything that is missing in one sentence", () => {
    expect(problem("correct-horse-nine")).toBe("Add an uppercase letter and a number.");
    expect(problem("CORRECT-HORSE-NINE")).toBe("Add a lowercase letter and a number.");
    expect(problem("!!!!----____")).toBe(
      "Add an uppercase letter, a lowercase letter, and a number.",
    );
  });

  it("puts the length first, then the missing kinds, then the spaces", () => {
    expect(problem("short")).toBe(
      "Use at least 12 characters for the password. Add an uppercase letter and a number.",
    );
    expect(problem("Short 1")).toBe(
      "Use at least 12 characters for the password. Take out the spaces.",
    );
    expect(problem(`${"p".repeat(129)} `)).toBe(
      "Use at most 128 characters for the password. Add an uppercase letter and a number. Take out the spaces.",
    );
  });

  it.each([
    ["a space", " "],
    ["a tab", "\t"],
    ["a new line", "\n"],
    ["a carriage return", "\r"],
    ["a no-break space", "\u00a0"],
    ["an em space", "\u2003"],
    ["an ideographic space", "\u3000"],
    ["a line separator", "\u2028"],
    ["a paragraph separator", "\u2029"],
    ["a vertical tab", "\v"],
    ["a thin space", "\u2009"],
    ["a narrow no-break space", "\u202f"],
    ["a byte order mark", "\ufeff"],
    ["a zero-width space", "\u200b"],
    ["a word joiner", "\u2060"],
    ["a Mongolian vowel separator", "\u180e"],
    ["a next-line character", "\u0085"],
    ["a null character", "\u0000"],
    ["a delete character", "\u007f"],
    ["a soft hyphen", "\u00ad"],
    ["a combining grapheme joiner", "\u034f"],
    ["a Hangul filler", "\u3164"],
    ["a halfwidth Hangul filler", "\uffa0"],
    ["a Hangul choseong filler", "\u115f"],
    ["a Hangul jungseong filler", "\u1160"],
    ["a blank Braille pattern", "\u2800"],
    ["a left-to-right mark", "\u200e"],
    ["a right-to-left mark", "\u200f"],
    ["an Arabic letter mark", "\u061c"],
    ["a left-to-right override", "\u202d"],
    ["a right-to-left isolate", "\u2067"],
    ["an invisible function application", "\u2061"],
    ["an invisible separator", "\u2063"],
    ["a Mongolian variation selector", "\u180b"],
    ["an interlinear annotation anchor", "\ufff9"],
    ["a Khmer inherent vowel", "\u17b4"],
    ["a musical begin-beam control", "\u{1d173}"],
  ])("refuses %s anywhere in it", (_label, space) => {
    for (const value of [
      `${space}Correct-horse-9`,
      `Correct${space}horse-9`,
      `Correct-horse-9${space}`,
    ]) {
      expect(problem(value)).toBe("Take out the spaces.");
    }
  });

  it("counts capitals, small letters, and digits from any script that has them", () => {
    expect(parse("Écoleçàùî-123").success).toBe(true);
    expect(parse("ÜBER-straße-7").success).toBe(true);
    expect(problem("écoleçàùî-123")).toBe("Add an uppercase letter.");
    expect(parse("ПАРОЛЬ-пароль-1").success).toBe(true);
    expect(problem("ПАРОЛЬ-ПАРОЛЬ-1")).toBe("Add a lowercase letter.");
    // An Arabic-Indic three is a number.
    expect(parse("Correct-horse-\u0663").success).toBe(true);
  });

  it("keeps the joiners that shape an emoji or a script, which are not spaces", () => {
    expect(parse("Correct-horse-9\u{1F468}\u200d\u{1F469}\u200d\u{1F467}").success).toBe(true);
    // A heart drawn as an emoji, and a flag built from tag characters.
    expect(parse("Correct-horse-9\u2764\ufe0f").success).toBe(true);
    expect(
      parse("Correct-horse-9\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}")
        .success,
    ).toBe(true);
    expect(parse("Correct-horse-9\u0645\u06cc\u200c\u062e\u0648\u0627\u0645").success).toBe(true);
  });

  it("counts length the way Better Auth does, in UTF-16 units", () => {
    // Three characters and five emoji are 13 units, so they meet the floor of 12.
    expect(parse(`Aa1${"\u{1F600}".repeat(5)}`).success).toBe(true);
    // 127 units and one emoji are 129.
    expect(problem(`Aa1${"p".repeat(124)}\u{1F600}`)).toBe(
      "Use at most 128 characters for the password.",
    );
  });

  it("asks for a password when it is empty", () => {
    expect(problem("")).toBe("Enter a password.");
  });

  it("names the rule in words, never in Zod's own wording, when it is not text", () => {
    const result = parse(42 as unknown as string);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Enter a password.");
  });
});

describe("a password someone already has", () => {
  // An account made before the rules signs in and deletes with the password it has. Judging it here
  // would also hint at the rules to someone guessing.
  const old = "an old pass phrase";

  it("is not judged by the rules for a new one, at sign-in", () => {
    expect(
      signInBody.safeParse({
        email: "ana@example.com",
        password: old,
        callbackURL: VERIFIED_LANDING,
      }).success,
    ).toBe(true);
  });

  it("is not judged by the rules for a new one, when deleting the account", () => {
    expect(deleteAccountBody.safeParse({ password: old }).success).toBe(true);
  });
});

describe("PASSWORD_HINT", () => {
  it("names every rule a new password has to meet", () => {
    expect(PASSWORD_HINT).toBe(
      "12 to 128 characters, with an uppercase letter, a lowercase letter, and a number. No spaces.",
    );
  });
});

describe("PASSWORD_UNCHANGED", () => {
  it("is a code the form can match, with a sentence a person can act on", () => {
    expect(PASSWORD_UNCHANGED).toEqual({
      code: "PASSWORD_UNCHANGED",
      message: "Choose a password that is different from your current one.",
    });
  });
});

describe("every body schema", () => {
  it.each([
    [
      "signInBody",
      signInBody,
      { email: "ana@example.com", password: "x", callbackURL: VERIFIED_LANDING },
    ],
    [
      "forgotPasswordBody",
      forgotPasswordBody,
      { email: "ana@example.com", redirectTo: "/reset-password" },
    ],
    [
      "sendVerificationBody",
      sendVerificationBody,
      { email: "ana@example.com", callbackURL: VERIFIED_LANDING },
    ],
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
    expect(
      signInBody.safeParse({
        email: "ana@example.com",
        password: "x",
        callbackURL: VERIFIED_LANDING,
      }).success,
    ).toBe(true);
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
  it("accepts an email, with the sign-in page as the only place to land after verifying", () => {
    expect(
      sendVerificationBody.safeParse({ email: "ana@example.com", callbackURL: VERIFIED_LANDING })
        .success,
    ).toBe(true);
  });

  it("refuses a bad email", () => {
    expect(sendVerificationBody.safeParse({ email: "nope" }).success).toBe(false);
    expect(sendVerificationBody.safeParse({}).success).toBe(false);
  });
});

describe("the landing place of a verification link", () => {
  const elsewhere = [
    "/sign-in",
    "/pad",
    "/",
    "//evil.example",
    "/.//evil.example",
    "/%2e//evil.example",
    "/x/..//evil.example",
    "/	/evil.example",
    "https://evil.example",
    "javascript:alert(1)",
  ];

  it("is the sign-in page", () => {
    expect(VERIFIED_LANDING).toBe("/sign-in?notice=verified");
  });

  it.each([
    ["signUpBody", signUpBody, { name: "Ana", email: "ana@example.com", password }],
    ["signInBody", signInBody, { email: "ana@example.com", password: "x" }],
    ["sendVerificationBody", sendVerificationBody, { email: "ana@example.com" }],
    ["verifyEmailQuery", verifyEmailQuery, { token: "t0k3n" }],
  ])("is the only one %s accepts, and it is required", (_name, schema, base) => {
    expect(schema.safeParse({ ...base, callbackURL: VERIFIED_LANDING }).success).toBe(true);
    // Without it Better Auth would mail a link to "/", which the API refuses.
    expect(schema.safeParse(base).success).toBe(false);
    for (const callbackURL of elsewhere) {
      const result = schema.safeParse({ ...base, callbackURL });
      expect(result.success, callbackURL).toBe(false);
      expect(firstMessage(result)).toBe("That link has to land on the sign-in page.");
    }
  });
});

describe("verifyEmailQuery", () => {
  it("wants a token, and refuses a link with no token or with anything else added", () => {
    expect(
      verifyEmailQuery.safeParse({ token: "t0k3n", callbackURL: VERIFIED_LANDING }).success,
    ).toBe(true);
    expect(verifyEmailQuery.safeParse({ token: "t0k3n" }).success).toBe(false);
    expect(verifyEmailQuery.safeParse({}).success).toBe(false);
    expect(verifyEmailQuery.safeParse({ token: "" }).success).toBe(false);
    expect(verifyEmailQuery.safeParse({ token: "t".repeat(4_001) }).success).toBe(false);
    expect(verifyEmailQuery.safeParse({ token: "t0k3n", next: "/pad" }).success).toBe(false);
  });
});

describe("resetLinkQuery", () => {
  it("lets a reset link land on the reset page and nowhere else", () => {
    expect(resetLinkQuery.safeParse({ callbackURL: "/reset-password" }).success).toBe(true);
    for (const callbackURL of [
      "/pad",
      "/reset-password?x=1",
      "/.//evil.example",
      "//evil.example",
    ]) {
      expect(resetLinkQuery.safeParse({ callbackURL }).success, callbackURL).toBe(false);
    }
    expect(resetLinkQuery.safeParse({}).success).toBe(false);
    expect(resetLinkQuery.safeParse({ callbackURL: "/reset-password", extra: "x" }).success).toBe(
      false,
    );
  });
});

describe("AUTH_COOKIE_PREFIX", () => {
  it("names the session cookie that the web app and the API both use", () => {
    expect(AUTH_COOKIE_PREFIX).toBe("launchpad");
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
  const apiKey = { status: "none" } as const;

  it("holds the signed-in person and the state of their Claude key, and nothing else", () => {
    expect(meResponse.parse({ user, apiKey })).toEqual({ user, apiKey });
  });

  it("drops fields that are not in the contract, such as a password hash or a token", () => {
    const parsed = meResponse.parse({
      user: { ...user, password: "hash", token: "t", emailVerified: true },
      apiKey,
      session: { token: "t" },
    });
    expect(parsed).toEqual({ user, apiKey });
  });

  it("refuses a response with no user, or with no key state", () => {
    expect(meResponse.safeParse({ apiKey }).success).toBe(false);
    expect(meResponse.safeParse({ user }).success).toBe(false);
  });
});
