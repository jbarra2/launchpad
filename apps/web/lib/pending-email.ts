import { EMAIL_MAX, sendVerificationBody } from "@launchpad/shared";

// The address a link was just sent to, for the check-email screen. It stays in this tab only, and
// never goes in the page address, where it would end up in history and in logs.
const KEY = "launchpad.pending-email";

export function rememberPendingEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // Storage can be blocked. The screen then asks for the address instead.
  }
}

export function readPendingEmail(): string | null {
  try {
    const email = sessionStorage.getItem(KEY);
    // A value the form would refuse counts as none, so the screen asks for the address instead of
    // offering a resend that cannot be sent.
    return email &&
      email.length <= EMAIL_MAX &&
      sendVerificationBody.shape.email.safeParse(email).success
      ? email
      : null;
  } catch {
    return null;
  }
}

export function forgetPendingEmail(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
