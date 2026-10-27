import { PASSWORD_UNCHANGED } from "@launchpad/shared";
import { APIError } from "better-auth/api";
import type { AuthContext } from "better-auth";

// The reset identifier Better Auth writes for a token, in `/request-password-reset`, and looks up in
// `/reset-password`.
const RESET_PREFIX = "reset-password:";

/**
 * Throws a 400 when a reset would set the password the account already has. Only the account the
 * token belongs to is compared. A token that is unknown or expired is left to Better Auth, which
 * refuses it the same way as before, so the check costs nothing and says nothing without a good
 * one. It runs before the reset, so a refusal leaves the token, the sessions and the account as
 * they were.
 */
export async function refuseUnchangedPassword(
  context: AuthContext,
  token: string,
  newPassword: string,
): Promise<void> {
  const verification = await context.internalAdapter.findVerificationValue(
    `${RESET_PREFIX}${token}`,
  );
  if (!verification || verification.expiresAt < new Date()) {
    return;
  }
  const account = await context.internalAdapter.findCredentialAccount(verification.value);
  if (!account?.password) {
    return;
  }
  if (await context.password.verify({ hash: account.password, password: newPassword })) {
    throw new APIError("BAD_REQUEST", { ...PASSWORD_UNCHANGED });
  }
}
