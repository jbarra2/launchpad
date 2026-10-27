import { z } from "zod";

// The contract for the sign-in forms and for the API that checks them. Every text field has a cap,
// and each refusal is a sentence a person can act on.

export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const TOKEN_MAX = 200;

// The `error` on each `z.string` is what a missing or mistyped field says. Without it Zod's own
// wording, such as "expected string, received undefined", would reach the person.
const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .max(EMAIL_MAX, `Use an email address of ${EMAIL_MAX} characters or fewer.`)
  .pipe(z.email("Enter a valid email address."));

export const PASSWORD_HINT = `${PASSWORD_MIN} to ${PASSWORD_MAX} characters, with an uppercase letter, a lowercase letter, and a number. No spaces.`;

// A reset that would set the password the account already has. The API answers with this code and
// the reset form shows the sentence at the password field.
export const PASSWORD_UNCHANGED = {
  code: "PASSWORD_UNCHANGED",
  message: "Choose a password that is different from your current one.",
} as const;

// Capitals and small letters from any script that has them count, so an accented capital is a
// capital, and so do digits from any script. A script without capitals, such as Arabic or Chinese,
// does not meet the two letter rules on its own.
const KINDS = [
  { pattern: /\p{Lu}/u, name: "an uppercase letter" },
  { pattern: /\p{Ll}/u, name: "a lowercase letter" },
  { pattern: /\p{Nd}/u, name: "a number" },
];
// Any kind of space is refused, and so are control characters and the characters that show as
// nothing (the default-ignorable ones, such as direction marks, the zero-width space, and the soft
// hyphen, and the interlinear annotation marks) or as a blank (the blank Braille pattern), since a
// password holding one could not be typed again. The joiners and selectors that build an emoji or
// shape a script are part of the character they join, and are allowed: U+200C, U+200D, the two
// emoji presentation selectors, and the tags that spell out a flag.
const BLANK = /[\p{White_Space}\p{Cc}\p{Default_Ignorable_Code_Point}\u2800\ufff9-\ufffb]/u;
const PART_OF_A_CHARACTER = new Set([0x200c, 0x200d, 0xfe0e, 0xfe0f]);
const FIRST_TAG = 0xe0020;
const LAST_TAG = 0xe007f;

function hasBlank(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (PART_OF_A_CHARACTER.has(code) || (code >= FIRST_TAG && code <= LAST_TAG)) {
      continue;
    }
    if (BLANK.test(char)) {
      return true;
    }
  }
  return false;
}

function inWords(names: string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** Each rule a new password breaks, as a sentence, in the order the hint names them. */
function passwordProblems(value: string): string[] {
  if (value === "") {
    return ["Enter a password."];
  }
  const problems: string[] = [];
  // Counted in UTF-16 units, as Better Auth counts them, so the two never disagree.
  if (value.length < PASSWORD_MIN) {
    problems.push(`Use at least ${PASSWORD_MIN} characters for the password.`);
  } else if (value.length > PASSWORD_MAX) {
    problems.push(`Use at most ${PASSWORD_MAX} characters for the password.`);
  }
  const missing = KINDS.filter(({ pattern }) => !pattern.test(value)).map(({ name }) => name);
  if (missing.length > 0) {
    problems.push(`Add ${inWords(missing)}.`);
  }
  if (hasBlank(value)) {
    problems.push("Take out the spaces.");
  }
  return problems;
}

// A new password meets every rule, and a refusal names all it breaks in one message, so the form
// shows everything at once. A sign-in does not judge the password at all, so an account made before
// a rule still signs in, and someone guessing gets "wrong email or password", not a hint.
const newPassword = z.string({ error: "Enter a password." }).superRefine((value, ctx) => {
  const problems = passwordProblems(value);
  if (problems.length > 0) {
    ctx.addIssue({ code: "custom", message: problems.join(" ") });
  }
});

const existingPassword = z
  .string({ error: "Enter your password." })
  .min(1, "Enter your password.")
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters for the password.`);

// The session cookie is `launchpad.session_token` (`__Secure-launchpad.session_token` over https).
// The API sets it and the web app looks for it, so both read the prefix from here.
export const AUTH_COOKIE_PREFIX = "launchpad";

// Where a verification link sends a person once the address is confirmed. It does not sign them
// in. Better Auth adds the reason to this address when a link fails, and it can fold a path such as
// "/.//x" into "//x", another site, while doing so. Every link, and every request that asks for
// one, must name this page and no other. A request that left it out would be mailed a link to "/",
// which the API then refuses, so it is required.
export const VERIFIED_LANDING = "/sign-in?notice=verified";

const verifiedLanding = z.literal(VERIFIED_LANDING, {
  error: "That link has to land on the sign-in page.",
});

// Every body schema is strict: a field the form does not have is refused, not ignored. Better Auth
// would store some of them (an `image` of any size, for one), and a hook cannot remove a field it
// is not meant to keep.
export const signUpBody = z.strictObject({
  name: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, "Enter your name.")
    .max(NAME_MAX, `Use a name of ${NAME_MAX} characters or fewer.`),
  email,
  password: newPassword,
  callbackURL: verifiedLanding,
});

export const signInBody = z.strictObject({
  email,
  password: existingPassword,
  callbackURL: verifiedLanding,
});

// The reset link lands on the page named here, with the token added to its address. Without a page
// the link has nowhere to land and does not work, and a page of the sender's choosing would put
// the token on it, so the reset page is the only one that may be named.
export const RESET_PAGE = "/reset-password";

export const forgotPasswordBody = z.strictObject({
  email,
  redirectTo: z.literal(RESET_PAGE, { error: "Reset links have to land on the reset page." }),
});

export const sendVerificationBody = z.strictObject({
  email,
  callbackURL: verifiedLanding,
});

// The query of the two links in emails, checked before Better Auth follows them. Each may land on
// one page only, so a link someone else wrote cannot send a person anywhere else.
const LINK_TOKEN_MAX = 4_000;

export const verifyEmailQuery = z.strictObject({
  token: z
    .string({ error: "That link is not valid." })
    .min(1, "That link is not valid.")
    .max(LINK_TOKEN_MAX, "That link is not valid."),
  callbackURL: verifiedLanding,
});

export const resetLinkQuery = z.strictObject({
  callbackURL: z.literal(RESET_PAGE, { error: "Reset links have to land on the reset page." }),
});

export const resetPasswordBody = z.strictObject({
  token: z
    .string({ error: "That reset link is not valid." })
    .min(1, "That reset link is not valid.")
    .max(TOKEN_MAX, "That reset link is not valid."),
  newPassword,
});

// Deleting an account always asks for the password, so a borrowed session cannot do it.
export const deleteAccountBody = z.strictObject({
  password: existingPassword,
});

export type SignUpBody = z.infer<typeof signUpBody>;
export type SignInBody = z.infer<typeof signInBody>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;
export type SendVerificationBody = z.infer<typeof sendVerificationBody>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;
export type DeleteAccountBody = z.infer<typeof deleteAccountBody>;
