"use client";

import { deleteAccountBody } from "@launchpad/shared";
import { FormField } from "@/components/a11y/form-field";
import { textOf } from "@/components/auth/form-helpers";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { authErrorMessage, authPost } from "@/lib/auth-client";
import { replaceLocation } from "@/lib/navigate";

/** Deleting the account always asks for the password, so a borrowed session cannot do it. */
export function DeleteAccount() {
  return (
    <ConfirmDialog
      trigger="Delete account…"
      title="Delete your account?"
      confirmLabel="Delete account"
      busyLabel="Deleting…"
      danger
      onConfirm={async (data) => {
        const parsed = deleteAccountBody.safeParse({ password: textOf(data, "password") });
        if (!parsed.success) {
          return parsed.error.issues[0]?.message ?? "Enter your password.";
        }
        const result = await authPost("/delete-user", parsed.data);
        if (result.ok) {
          // Replace, so Back does not return to a page of the deleted account.
          replaceLocation("/?notice=account-deleted");
          return null;
        }
        return authErrorMessage(result, "We could not delete your account. Try again.");
      }}
    >
      <p>
        This deletes your account and every idea on your pad. It cannot be undone. Enter your
        password to confirm.
      </p>
      <FormField label="Password">
        <input name="password" type="password" autoComplete="current-password" />
      </FormField>
    </ConfirmDialog>
  );
}
