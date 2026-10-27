"use client";

import { sendVerificationBody } from "@launchpad/shared";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { VERIFIED_LANDING, authErrorMessage, authPost } from "@/lib/auth-client";
import { readPendingEmail } from "@/lib/pending-email";
import { fieldErrors, focusFirstError, textOf, type FieldErrors } from "./form-helpers";

const SENT =
  "If that address needs a link, a new one is on its way. If nothing arrives, wait 15 minutes before asking again.";

function noChanges() {
  return () => {};
}

/** Where sign-up sends a person. The words do not depend on whether the address had an account. */
export function CheckEmail() {
  // The address comes from this tab's storage only, never from the page address. The server has no
  // storage, so it renders the version without an address.
  const email = useSyncExternalStore(noChanges, readPendingEmail, () => null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const pending = useRef(false);
  const alert = useFormAlert();
  const announce = useAnnouncer();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const form = event.currentTarget;
    const parsed = sendVerificationBody.safeParse({
      email: email ?? textOf(new FormData(form), "email"),
      callbackURL: VERIFIED_LANDING,
    });
    alert.clear();
    setSent(false);
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ["email"], announce);
      return;
    }
    setErrors({});

    pending.current = true;
    setBusy(true);
    const result = await authPost("/send-verification-email", parsed.data);
    pending.current = false;
    setBusy(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    alert.show(authErrorMessage(result, "We could not send the link. Try again."));
  }

  return (
    <>
      <h1>Check your email</h1>
      {/* The same words whether or not the address already had an account, so the page shows
          nobody which addresses do. The message itself says which it is. */}
      <p>
        {email ? (
          <>
            We sent a message to <strong>{email}</strong>.
          </>
        ) : (
          "We sent you a message."
        )}{" "}
        If the address is new, open the link in it to confirm the address, then sign in. If the
        address already has an account, the message says so. Messages can take a minute to arrive.
        If nothing comes, sign in or reset your password with the links below.
      </p>

      <form method="post" noValidate aria-label="Send the link again" onSubmit={onSubmit}>
        <FormAlert id="check-email-alert" alert={alert.alert} alertRef={alert.ref} />
        {email ? null : (
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
        )}
        <button type="submit" className="button" aria-disabled={busy || undefined}>
          {busy ? "Sending…" : "Send the link again"}
        </button>
        <div role="status" className="form-status">
          {sent ? <p>{SENT}</p> : null}
        </div>
      </form>

      <p className="form-links">
        <Link href="/sign-in">Sign in</Link>
        <Link href="/forgot-password">Forgot your password?</Link>
        <Link href="/sign-up">Use a different address</Link>
      </p>
    </>
  );
}
