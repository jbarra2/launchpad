import { env } from "../config/env.js";

// "account-exists" tells the owner of an address that someone tried to sign up with it.
export type MailKind = "email-verification" | "password-reset" | "account-exists";

// Each message is a link. A verification or reset link carries a single-use token, so it is a way
// into an account. The account-exists link is the sign-in or reset page, with no token.
export interface Mail {
  kind: MailKind;
  to: string;
  url: string;
}

// A real email provider is one more implementation of this. It sends in the background, through
// Better Auth's `advanced.backgroundTasks`, so that how long a send takes cannot show whether an
// address has an account.
export interface Mailer {
  send(mail: Mail): void | Promise<void>;
}

/** Tests read links from here instead of a mailbox. */
export const outbox: Mail[] = [];

const outboxMailer: Mailer = {
  send(mail) {
    outbox.push(mail);
  },
};

// Development only: the link is printed where the person running the app can open it.
const consoleMailer: Mailer = {
  send(mail) {
    console.info(`[mail] ${mail.kind} link for ${mail.to}: ${mail.url}`);
  },
};

export function makeMailer(nodeEnv: string, transport: string): Mailer {
  if (nodeEnv === "test") {
    return outboxMailer;
  }
  if (transport === "console") {
    // config/env.ts refuses this in production too. This is the second lock on the same door.
    if (nodeEnv === "production") {
      throw new Error("The console mail transport cannot run in production.");
    }
    return consoleMailer;
  }
  throw new Error("No mail transport is set up.");
}

interface ThrottleOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

// The rate limits on the auth routes count by the address a request came from. Someone who changes
// address can still send many messages to one person, so this counts by the address a message goes
// to. A message over the limit is dropped without an error, so the answer to the caller is the same
// as for any other request, and the log line leaves the address out.
export function throttleMailer(
  inner: Mailer,
  { max, windowMs, now = Date.now }: ThrottleOptions,
): Mailer & { reset(): void } {
  const sent = new Map<string, number[]>();
  return {
    async send(mail) {
      const at = now();
      const key = mail.to.toLowerCase();
      const recent = (sent.get(key) ?? []).filter((time) => at - time < windowMs);
      if (recent.length >= max) {
        sent.set(key, recent);
        console.warn("[mail] Not sent: too many messages to one address in a short time.");
        return;
      }
      recent.push(at);
      sent.set(key, recent);
      // An address that is never written to again would stay in the map, so old ones are swept.
      if (sent.size > 10_000) {
        for (const [address, times] of sent) {
          if (times.every((time) => at - time >= windowMs)) {
            sent.delete(address);
          }
        }
      }
      await inner.send(mail);
    },
    reset() {
      sent.clear();
    },
  };
}

const transport = makeMailer(env.NODE_ENV, env.MAIL_TRANSPORT);
const WINDOW_MS = 15 * 60 * 1000;

const throttled = throttleMailer(transport, { max: 5, windowMs: WINDOW_MS });

// Notices that someone tried to sign up with an address have a count of their own, one per address
// in the window. A stranger can cause them, so they must never use up the links the owner asks for,
// and the owner needs only one to know.
const noticesThrottled = throttleMailer(transport, { max: 1, windowMs: WINDOW_MS });

/** Verification and reset links. */
export const mailer: Mailer = throttled;

/** Notices a stranger can cause, such as a sign-up with an address that has an account. */
export const noticeMailer: Mailer = noticesThrottled;

/** For tests: forgets how many messages each address has had. */
export const resetMailThrottle = (): void => {
  throttled.reset();
  noticesThrottled.reset();
};
