"use client";

import { useCallback, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useResetWhenRestored } from "@/components/auth/form-helpers";

interface ConfirmDialogProps {
  /** The words on the button that opens the dialog. */
  trigger: ReactNode;
  title: string;
  /**
   * What will happen. It is the dialog's description, so a screen reader reads it out when the
   * dialog opens, wherever focus lands.
   */
  description: ReactNode;
  /** Any field the action needs. It stays out of the description. */
  children?: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  danger?: boolean;
  /**
   * Runs the action. Answers null once it has gone through (the page then moves on), or a sentence
   * to show in the dialog.
   */
  onConfirm: (data: FormData) => Promise<string | null>;
}

/**
 * A native modal dialog that confirms an action. Cancel comes first, so it is what a stray Enter or a
 * quick tap lands on, and Escape closes it. The browser keeps focus inside while it is open and
 * returns it to the button that opened it.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  danger = false,
  onConfirm,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  // A page brought back by the Back button comes back as it was left: busy, with the dialog open.
  useResetWhenRestored(
    useCallback(() => {
      pending.current = false;
      setBusy(false);
      dialog.current?.close();
    }, []),
  );

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const form = event.currentTarget;
    pending.current = true;
    setBusy(true);
    setError(null);
    const problem = await onConfirm(new FormData(form));
    if (problem === null) {
      // The page is moving on. The button stays busy until it does.
      return;
    }
    pending.current = false;
    setBusy(false);
    setError(problem);
    // Back to the field, if there is one, so the person can try again straight away.
    form.querySelector("input")?.select();
  }

  return (
    <>
      <button
        type="button"
        className={danger ? "button button-danger" : "button"}
        onClick={open}
        aria-haspopup="dialog"
      >
        {trigger}
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setError(null)}
      >
        <form method="post" noValidate onSubmit={onSubmit}>
          <h2 id={titleId}>{title}</h2>
          <div id={descriptionId}>{description}</div>
          {children}
          <p role="alert" className="inline-alert">
            {error}
          </p>
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className={danger ? "button button-danger" : "button"}
              aria-disabled={busy || undefined}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
