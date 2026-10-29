"use client";

import { apiKeyBody, type ApiKeyState } from "@launchpad/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormField } from "@/components/a11y/form-field";
import { useResetWhenRestored } from "@/components/auth/form-helpers";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { LocalDay } from "@/components/local-day";
import { apiSend, claudeErrorMessage, detailErrors } from "@/lib/api-client";
import { maskKey } from "@/lib/mask";
import { replaceLocation } from "@/lib/navigate";

export const CONSOLE_KEYS_URL = "https://platform.claude.com/settings/keys";

/**
 * The Claude key part of Settings. The page hands it the key's state from the API, which holds the
 * last 4 characters at most, so the key itself never reaches the browser after it is typed.
 */
export function ApiKeySection({ state }: { state: ApiKeyState }) {
  const [replacing, setReplacing] = useState(false);
  const replaceButton = useRef<HTMLButtonElement>(null);
  const saved = state.status === "none" ? null : state;

  // The button that was pressed is gone, so focus goes where the person is going.
  function cancel() {
    flushSync(() => setReplacing(false));
    replaceButton.current?.focus();
  }
  return (
    <>
      {saved ? (
        <>
          <p>
            Saved key <span className="key-mask">{maskKey(saved.last4)}</span>
            <span className="visually-hidden"> (only its last 4 characters are shown)</span>,
            checked <LocalDay iso={saved.checkedAt} />.
          </p>
          {saved.status === "invalid" ? (
            <p className="notice notice-error">
              This key no longer works. Replace it to keep building parts with Claude.
            </p>
          ) : null}
        </>
      ) : (
        <p>No key yet. Without one, you can still write every part yourself.</p>
      )}
      {saved && !replacing ? (
        <div className="form-actions">
          <button
            ref={replaceButton}
            type="button"
            className="button"
            onClick={() => setReplacing(true)}
          >
            Replace key
          </button>
          <RemoveKeyButton />
        </div>
      ) : (
        <ApiKeyForm onCancel={saved ? cancel : undefined} focusOnOpen={replacing} />
      )}
      <p className="muted key-note">
        Your key is encrypted and used only for your own chats. Make one in the{" "}
        <a href={CONSOLE_KEYS_URL} target="_blank" rel="noreferrer">
          Claude Console under API keys
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
        . What your chats cost is billed to your Anthropic account.
      </p>
    </>
  );
}

function ApiKeyForm({ onCancel, focusOnOpen }: { onCancel?: () => void; focusOnOpen: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const keyField = useRef<HTMLInputElement>(null);
  // Opened by Replace key, whose button is now gone: the field takes the focus.
  useEffect(() => {
    if (focusOnOpen) {
      keyField.current?.focus();
    }
  }, [focusOnOpen]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const alert = useFormAlert();
  useResetWhenRestored(
    useCallback(() => {
      pending.current = false;
      setBusy(false);
    }, []),
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const form = event.currentTarget;
    const field = form.elements.namedItem("key") as HTMLInputElement;
    alert.clear();
    const parsed = apiKeyBody.safeParse({ key: field.value });
    if (!parsed.success) {
      flushSync(() => setError(parsed.error.issues[0]?.message));
      field.focus();
      return;
    }
    setError(undefined);
    pending.current = true;
    setBusy(true);
    const result = await apiSend("PUT", "/api/me/api-key", parsed.data);
    if (result.ok) {
      // The page loads again from the server, which shows the saved key's last 4 characters.
      field.value = "";
      replaceLocation("/settings?notice=key-saved");
      return;
    }
    pending.current = false;
    setBusy(false);
    const fromApi = detailErrors(result.details).key;
    if (fromApi) {
      flushSync(() => setError(fromApi));
      field.focus();
      return;
    }
    alert.show(claudeErrorMessage(result, "We could not check the key. Try again."));
  }

  return (
    <form method="post" noValidate aria-label="Claude key" onSubmit={onSubmit}>
      <FormAlert id="key-alert" alert={alert.alert} alertRef={alert.ref} />
      <FormField
        label="Your Claude key"
        hint="It starts with sk-ant-. Anthropic checks it before it is saved."
        error={error}
      >
        <input
          ref={keyField}
          name="key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </FormField>
      <div className="form-actions">
        <button type="submit" className="button" aria-disabled={busy || undefined}>
          {busy ? "Checking…" : "Save and check"}
        </button>
        {onCancel ? (
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function RemoveKeyButton() {
  return (
    <ConfirmDialog
      trigger="Remove key"
      title="Remove your Claude key?"
      confirmLabel="Remove key"
      busyLabel="Removing…"
      danger
      description={
        <p>Chats with Claude stop until you save a key again. Your ideas and parts stay.</p>
      }
      onConfirm={async () => {
        const result = await apiSend("DELETE", "/api/me/api-key");
        if (result.ok) {
          replaceLocation("/settings?notice=key-removed");
          return null;
        }
        return claudeErrorMessage(result, "We could not remove the key. Try again.");
      }}
    />
  );
}
