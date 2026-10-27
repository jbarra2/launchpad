"use client";

import { signInBody } from "@launchpad/shared";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { VERIFIED_LANDING, authErrorMessage, authPost } from "@/lib/auth-client";
import { navigate } from "@/lib/navigate";
import { forgetPendingEmail } from "@/lib/pending-email";
import {
  fieldErrors,
  focusFirstError,
  textOf,
  useResetWhenRestored,
  type FieldErrors,
} from "./form-helpers";

const ORDER = ["email", "password"];

/** `next` has already been checked by the page, so it is a page of this site. */
export function SignInForm({ next }: { next: string }) {
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
  const announce = useAnnouncer();

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
    const parsed = signInBody.safeParse({
      email: textOf(data, "email"),
      password: textOf(data, "password"),
      // Where the new link lands if the address is not confirmed yet.
      callbackURL: VERIFIED_LANDING,
    });
    alert.clear();
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      // In the page before focus moves, so the error is read with the field.
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ORDER, announce);
      return;
    }
    setErrors({});

    pending.current = true;
    setBusy(true);
    const result = await authPost("/sign-in/email", parsed.data);
    if (result.ok) {
      forgetPendingEmail();
      wentTo.current = next;
      navigate(next);
      return;
    }
    pending.current = false;
    setBusy(false);
    alert.show(
      authErrorMessage(result, "We could not sign you in. Try again."),
      result.code === "INVALID_EMAIL_OR_PASSWORD"
        ? { href: "/forgot-password", label: "Reset your password." }
        : undefined,
    );
  }

  return (
    <form method="post" noValidate aria-label="Sign in" onSubmit={onSubmit}>
      <FormAlert id="sign-in-alert" alert={alert.alert} alertRef={alert.ref} />
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
      <FormField label="Password" error={errors.password}>
        <input name="password" type="password" autoComplete="current-password" />
      </FormField>
      <button type="submit" className="button" aria-disabled={busy || undefined}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="form-links">
        <Link href="/forgot-password">Forgot your password?</Link>
        <Link href="/sign-up">New here? Create an account</Link>
      </p>
    </form>
  );
}
