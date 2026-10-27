"use client";

import { useRef, useState } from "react";
import { authErrorMessage, authPost } from "@/lib/auth-client";
import { replaceLocation } from "@/lib/navigate";

const SIGNED_OUT = "/sign-in?notice=signed-out";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  // Signed out already: a press after that, if the page load was stopped, goes on again.
  const signedOut = useRef(false);

  async function signOut() {
    if (signedOut.current) {
      replaceLocation(SIGNED_OUT);
      return;
    }
    if (pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    const result = await authPost("/sign-out", {});
    if (result.ok) {
      // Replace, so Back does not return to a page of the signed-out account.
      signedOut.current = true;
      replaceLocation(SIGNED_OUT);
      return;
    }
    pending.current = false;
    setBusy(false);
    setError(authErrorMessage(result, "We could not sign you out. Try again."));
  }

  return (
    <div className="sign-out">
      <button type="button" className="button" aria-disabled={busy || undefined} onClick={signOut}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      <p role="alert" className="inline-alert">
        {error}
      </p>
    </div>
  );
}
