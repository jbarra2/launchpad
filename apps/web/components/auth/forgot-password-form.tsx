"use client";

import { RESET_PAGE, forgotPasswordBody } from "@launchpad/shared";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { authErrorMessage, authPost } from "@/lib/auth-client";
import { fieldErrors, focusFirstError, textOf, type FieldErrors } from "./form-helpers";

export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pending = useRef(false);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const alert = useFormAlert();
  const announce = useAnnouncer();

  useEffect(() => {
    if (sentTo) {
      doneRef.current?.focus();
    }
  }, [sentTo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const form = event.currentTarget;
    const parsed = forgotPasswordBody.safeParse({
      email: textOf(new FormData(form), "email"),
      redirectTo: RESET_PAGE,
    });
    alert.clear();
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ["email"], announce);
      return;
    }
    setErrors({});

    pending.current = true;
    setBusy(true);
    const result = await authPost("/request-password-reset", parsed.data);
    pending.current = false;
    setBusy(false);
    // Every address gets the same answer, so the form cannot tell anyone who has an account.
    if (result.ok) {
      setSentTo(parsed.data.email);
      return;
    }
    alert.show(authErrorMessage(result, "We could not send the link. Try again."));
  }

  if (sentTo) {
    return (
      <>
        <h1>Check your email</h1>
        <p ref={doneRef} tabIndex={-1} role="status">
          If an account uses <strong>{sentTo}</strong>, a reset link is on its way. It works for 30
          minutes. If nothing arrives, wait 15 minutes before asking again.
        </p>
        <p className="form-links">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Reset your password</h1>
      <p>
        Enter the address you signed up with, and we will send you a link to set a new password.
      </p>
      <form method="post" noValidate aria-label="Reset your password" onSubmit={onSubmit}>
        <FormAlert id="forgot-alert" alert={alert.alert} alertRef={alert.ref} />
        <FormField label="Email" error={errors.email}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </FormField>
        <button type="submit" className="button" aria-disabled={busy || undefined}>
          {busy ? "Sending…" : "Send the reset link"}
        </button>
      </form>
      <p className="form-links">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </>
  );
}
