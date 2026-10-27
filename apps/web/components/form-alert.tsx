"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

export interface Alert {
  key: number;
  message: string;
  link?: { href: string; label: string };
}

/** The state behind a form's alert. Showing a message moves focus to it. */
export function useFormAlert() {
  const [alert, setAlert] = useState<Alert | null>(null);
  const nextKey = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (alert) {
      ref.current?.focus();
    }
  }, [alert]);

  return {
    alert,
    ref,
    show(message: string, link?: Alert["link"]) {
      nextKey.current += 1;
      setAlert({ key: nextKey.current, message, link });
    },
    clear() {
      setAlert(null);
    },
  };
}

interface FormAlertProps {
  id: string;
  alert: Alert | null;
  alertRef: RefObject<HTMLDivElement | null>;
}

/**
 * A form's error. The alert region stays mounted, so a screen reader is already watching it when
 * the words arrive. It takes focus so the person lands on the reason the form did not go through.
 */
export function FormAlert({ id, alert, alertRef }: FormAlertProps) {
  return (
    <div role="alert" id={id} className="form-alert" ref={alertRef} tabIndex={-1}>
      {alert ? (
        <p key={alert.key}>
          {alert.message}
          {alert.link ? (
            <>
              {" "}
              <Link href={alert.link.href}>{alert.link.label}</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
