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

// A new password has a floor. A sign-in does not judge the length, so a person with an old
// password gets "wrong email or password" and not a hint about the rules.
const newPassword = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters for the password.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters for the password.`);

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
