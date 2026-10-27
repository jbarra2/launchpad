"use client";

import { PASSWORD_HINT, signUpBody } from "@launchpad/shared";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { VERIFIED_LANDING, authErrorMessage, authPost } from "@/lib/auth-client";
import { navigate } from "@/lib/navigate";
import { rememberPendingEmail } from "@/lib/pending-email";
import {
  fieldErrors,
  focusFirstError,
  textOf,
  useResetWhenRestored,
  type FieldErrors,
} from "./form-helpers";

const ORDER = ["name", "email", "password"];

export function SignUpForm() {
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
    const parsed = signUpBody.safeParse({
      name: textOf(data, "name"),
      email: textOf(data, "email"),
      password: textOf(data, "password"),
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
    const result = await authPost("/sign-up/email", parsed.data);
    if (result.ok) {
      // The answer is the same for a new address and one that already has an account, so the next
      // screen is too.
      rememberPendingEmail(parsed.data.email);
      wentTo.current = "/check-email";
      navigate("/check-email");
      return;
    }
    pending.current = false;
    setBusy(false);
    alert.show(authErrorMessage(result, "We could not create the account. Try again."));
  }

  return (
    <form method="post" noValidate aria-label="Create an account" onSubmit={onSubmit}>
      <FormAlert id="sign-up-alert" alert={alert.alert} alertRef={alert.ref} />
      <FormField label="Name" error={errors.name}>
        <input name="name" type="text" autoComplete="name" />
      </FormField>
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
      <FormField label="Password" hint={PASSWORD_HINT} error={errors.password}>
        <input name="password" type="password" autoComplete="new-password" />
      </FormField>
      <button type="submit" className="button" aria-disabled={busy || undefined}>
        {busy ? "Creating your account…" : "Create account"}
      </button>
      <p className="form-links">
        <Link href="/sign-in">Already have an account? Sign in</Link>
      </p>
    </form>
  );
}
