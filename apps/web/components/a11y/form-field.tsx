import { cloneElement, isValidElement, useId, type ReactElement } from "react";
import { FieldCount, type Count } from "./field-count";

interface ControlProps {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** A live count under the control, for a field with a character limit. */
  count?: Count;
  children: ReactElement<ControlProps>;
}

/**
 * A labelled control with its hint, its count, and its error. The control is given the id the
 * label points at, and is described by the others in that order, so a screen reader reads them
 * together.
 */
export function FormField({ label, hint, error, count, children }: FormFieldProps) {
  const generated = useId();
  const id = children.props.id ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const countId = count ? `${id}-count` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [children.props["aria-describedby"], hintId, countId, errorId].filter(Boolean).join(" ") ||
    undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {control}
      {count && countId ? <FieldCount id={countId} count={count} /> : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
