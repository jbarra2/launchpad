"use client";

import { PART_INFO, type PartKind } from "@launchpad/shared";
import { useCallback, useRef, useState } from "react";
import { useAnnouncer } from "@/components/a11y/live-region";
import { useResetWhenRestored } from "@/components/auth/form-helpers";
import { apiSend, claudeErrorMessage } from "@/lib/api-client";
import { navigate } from "@/lib/navigate";

const WRITING = "Claude is writing the first question…";

/**
 * Opens a chat session for the next part, and goes to it once Claude has asked its first question.
 * The API opens one session per idea however often this is pressed.
 */
export function StartSessionButton({ rocketId, kind }: { rocketId: string; kind: PartKind }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const announce = useAnnouncer();
  useResetWhenRestored(
    useCallback(() => {
      pending.current = false;
      setBusy(false);
    }, []),
  );

  async function start() {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    announce(WRITING);
    const result = await apiSend("POST", `/api/rockets/${rocketId}/sessions`);
    if (result.ok) {
      navigate(`/rockets/${rocketId}/session`);
      return;
    }
    pending.current = false;
    setBusy(false);
    setError(claudeErrorMessage(result, "We could not start the session. Try again."));
  }

  return (
    <div className="start-session">
      <button type="button" className="button" aria-disabled={busy || undefined} onClick={start}>
        {busy ? "Starting…" : "Start session"}
        <span className="visually-hidden"> for the {PART_INFO[kind].name}</span>
      </button>
      {busy ? (
        <p className="muted" aria-hidden="true">
          {WRITING}
        </p>
      ) : null}
      <p role="alert" className="inline-alert">
        {error}
      </p>
    </div>
  );
}
