import { prismaAdapter } from "@better-auth/prisma-adapter";
import { PASSWORD_MAX, PASSWORD_MIN } from "@launchpad/shared";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { env } from "../config/env.js";
import { ALLOWED_AUTH_PATHS, validateAuthBody, withoutTokens } from "./auth-guards.js";
import { authLog } from "./auth-log.js";
import { mailer } from "./mailer.js";
import { prisma } from "./prisma.js";
import { lockSignUp, unlockSignUp } from "./sign-up-lock.js";

/** Better Auth counts rate limits by the address in this header, and by nothing else. */
export const CLIENT_IP_HEADER = "x-launchpad-client-ip";

/** The only origin that may send a change that carries a cookie: the web app's own. */
export const trustedOrigin = new URL(env.BETTER_AUTH_URL).origin;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const auth = betterAuth({
  appName: "Launchpad",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [trustedOrigin],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  telemetry: { enabled: false },
  logger: { level: env.NODE_ENV === "test" ? "error" : "warn", log: authLog },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Signing up proves nothing about the address. Only the link does.
    autoSignIn: false,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    resetPasswordTokenExpiresIn: 30 * MINUTE,
    revokeSessionsOnPasswordReset: true,
    // The link goes to the mailbox and to nobody else, so it is safe for an account that never
    // verified. Otherwise someone who signed up with another person's address would hold it for
    // good: that person could neither verify nor reset.
    sendResetPassword: async ({ user, url }) => {
      await mailer.send({ kind: "password-reset", to: user.email, url });
    },
    // Clicking the link proves the person has the mailbox, which is what verification means.
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    // Following the link proves the mailbox and nothing more, and the person signs in on the next
    // screen. A link that signed in would sign in whoever opened it as whichever account it names,
    // whoever made that account and whatever password it holds. Someone could sign up with another
    // person's address and a password of their own, then wait for that person to follow a link. A
    // link planted on another page would swap a visitor's session for the planter's account.
    autoSignInAfterVerification: false,
    expiresIn: DAY,
    sendVerificationEmail: async ({ user, url }) => {
      await mailer.send({ kind: "email-verification", to: user.email, url });
    },
  },

  user: {
    deleteUser: {
      enabled: true,
      // Reset tokens keep the user's id in `value` and have no foreign key, so they are cleared here.
      // Sessions and accounts go with the user by their foreign keys.
      afterDelete: async (user) => {
        await prisma.verification.deleteMany({ where: { value: user.id } });
      },
    },
  },

  session: {
    expiresIn: DAY,
    updateAge: HOUR,
    // Stays off: a cached copy would keep a deleted or signed-out session working until it expired.
    cookieCache: { enabled: false },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: MINUTE,
    max: 100,
    customRules: {
      // Server-rendered pages ask for the session from the web server's own address, so a limit
      // per address would be shared by every person.
      "/get-session": false,
      "/sign-up/email": { window: 15 * MINUTE, max: 5 },
      "/sign-in/email": { window: MINUTE, max: 20 },
      "/send-verification-email": { window: 15 * MINUTE, max: 3 },
      "/request-password-reset": { window: 15 * MINUTE, max: 3 },
      "/reset-password": { window: 15 * MINUTE, max: 5 },
      "/delete-user": { window: 15 * MINUTE, max: 3 },
    },
  },

  advanced: {
    // Better Auth turns both checks off under NODE_ENV=test. Pinning them keeps the tests honest.
    disableOriginCheck: false,
    disableCSRFCheck: false,
    // localhost cookies ignore the port, so the prefix keeps this app apart from other local ones.
    cookiePrefix: "launchpad",
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!ALLOWED_AUTH_PATHS.has(ctx.path)) {
        throw new APIError("NOT_FOUND", { message: "Nothing was found at that address." });
      }
      const body = validateAuthBody(ctx.path, ctx.body, ctx.query);
      if (ctx.path === "/sign-up/email" && ctx.request && typeof body?.email === "string") {
        await lockSignUp(ctx.request, body.email.toLowerCase());
      }
      // The trimmed copy replaces the raw body, so a name padded with spaces keeps to its cap. The
      // schemas are strict, so no field comes along that they do not list.
      if (body) {
        return { context: { body } };
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.request) {
        unlockSignUp(ctx.request);
      }
      const returned = ctx.context.returned;
      if (isAPIError(returned) || returned === null || typeof returned !== "object") {
        return;
      }
      if (returned instanceof Response) {
        return;
      }
      return ctx.json(withoutTokens(returned) as Record<string, unknown>);
    }),
  },
});

export type AuthSession = typeof auth.$Infer.Session;
