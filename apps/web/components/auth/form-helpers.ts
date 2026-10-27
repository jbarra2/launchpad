import { useEffect } from "react";

export type FieldErrors = Partial<Record<string, string>>;

// The shape of a shared schema's refusal. The web app reads it without depending on zod itself.
interface SchemaError {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}

/** The first message for each field, from a shared schema's refusal. */
export function fieldErrors(error: SchemaError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/**
 * Moves focus to the first field, in the form's order, that has an error, so a screen reader reads
 * the field with its error. When that field has focus already, as after Enter in it, focus does not
 * move and nothing would be read, so the error is announced instead.
 */
export function focusFirstError(
  form: HTMLFormElement,
  errors: FieldErrors,
  order: string[],
  announce: (message: string) => void,
): void {
  const first = order.find((name) => errors[name]);
  const message = first ? errors[first] : undefined;
  const control = first ? form.elements.namedItem(first) : null;
  if (!message || !(control instanceof HTMLElement)) {
    return;
  }
  if (document.activeElement === control) {
    announce(message);
  } else {
    control.focus();
  }
}

export function textOf(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * A page restored from the back/forward cache comes back exactly as it was left, which for a form
 * that went on to the next page is mid-request, with its button busy. This puts it back.
 */
export function useResetWhenRestored(reset: () => void): void {
  useEffect(() => {
    function onShow(event: PageTransitionEvent) {
      if (event.persisted) {
        reset();
      }
    }
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [reset]);
}
