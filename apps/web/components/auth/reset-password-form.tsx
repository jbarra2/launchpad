"use client";

import { PASSWORD_MAX, PASSWORD_MIN, RESET_PAGE, resetPasswordBody } from "@launchpad/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormField } from "@/components/a11y/form-field";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { authErrorMessage, authPost } from "@/lib/auth-client";
import { navigate } from "@/lib/navigate";
import {
  fieldErrors,
  focusFirstError,
  textOf,
  useResetWhenRestored,
  type FieldErrors,
} from "./form-helpers";

const ORDER = ["newPassword", "confirm"];

export function ResetPasswordForm({ token }: { token: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  // Where the form went once it succeeded. A press after that, if the page load was stopped, goes
  // there again rather than doing nothing.
  const wentTo = useRef<string | null>(null);
  useResetWhenRestored(
    useCallback(() => {
      pending.current = false;
      wentTo.current = null;
      setBusy(false);
    }, []),
  );
  const alert = useFormAlert();

  // The token leaves the address bar and the list of pages in this tab's history, so it is not
  // sent on as a Referer or shown in that list later. It waits a tick: Next's router
  // patches history.replaceState in an effect that runs after this one, and the patched version keeps
  // the router's own state and tells it the new address, so Back and later renders stay right.
  useEffect(() => {
    const timer = window.setTimeout(() => window.history.replaceState(null, "", RESET_PAGE), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (wentTo.current) {
      navigate(wentTo.current);
      return;
    }
    if (pending.current) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = resetPasswordBody.safeParse({ token, newPassword: textOf(data, "newPassword") });
    const found: FieldErrors = parsed.success ? {} : fieldErrors(parsed.error);
    if (!found.newPassword && textOf(data, "confirm") !== textOf(data, "newPassword")) {
      found.confirm = "The two passwords do not match.";
    }
    alert.clear();
    if (!parsed.success || found.confirm) {
      // In the page before focus moves, so the error is read with the field.
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ORDER);
      if (found.token) {
        alert.show(found.token);
      }
      return;
    }
    setErrors({});

    pending.current = true;
    setBusy(true);
    const result = await authPost("/reset-password", parsed.data);
    if (result.ok) {
      wentTo.current = "/sign-in?notice=password-reset";
      navigate("/sign-in?notice=password-reset");
      return;
    }
    pending.current = false;
    setBusy(false);
    alert.show(
      authErrorMessage(result, "We could not change the password. Try again."),
      result.code === "INVALID_TOKEN"
        ? { href: "/forgot-password", label: "Ask for a new link." }
        : undefined,
    );
  }

  return (
    <form method="post" noValidate aria-label="Set a new password" onSubmit={onSubmit}>
      <FormAlert id="reset-alert" alert={alert.alert} alertRef={alert.ref} />
      <FormField
        label="New password"
        hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`}
        error={errors.newPassword}
      >
        <input name="newPassword" type="password" autoComplete="new-password" />
      </FormField>
      <FormField label="Type it again" error={errors.confirm}>
        <input name="confirm" type="password" autoComplete="new-password" />
      </FormField>
      <button type="submit" className="button" aria-disabled={busy || undefined}>
        {busy ? "Saving…" : "Set the new password"}
      </button>
    </form>
  );
}
