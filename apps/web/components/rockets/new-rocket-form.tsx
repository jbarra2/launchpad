"use client";

import {
  createRocketBody,
  measuredLength,
  PITCH_MAX,
  POINT_MAX,
  ROCKET_NAME_MAX,
  rocketIdParam,
} from "@launchpad/shared";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { textCount } from "@/components/a11y/field-count";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import {
  fieldErrors,
  focusFirstError,
  textOf,
  useResetWhenRestored,
  type FieldErrors,
} from "@/components/auth/form-helpers";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { apiErrorMessage, apiSend, detailErrors } from "@/lib/api-client";
import { navigate } from "@/lib/navigate";

type Field = "name" | "pitch" | "why";

const ORDER: Field[] = ["name", "pitch", "why"];

// Each field's own rule, so its error goes as soon as the field is right.
const RULES = createRocketBody.shape;

export function NewRocketForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  // Each field's length as its limit measures it, for the live count under it.
  const [lengths, setLengths] = useState<Record<Field, number>>({ name: 0, pitch: 0, why: 0 });
  // The counts are announced only once the person has typed here.
  const [typed, setTyped] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
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

  // A box can hold text before React does: typed before the page finished loading, or put back by
  // the browser on Back. Each count starts from what its box holds.
  useLayoutEffect(() => {
    const data = new FormData(formRef.current ?? undefined);
    setLengths({
      name: measuredLength(textOf(data, "name")),
      pitch: measuredLength(textOf(data, "pitch")),
      why: measuredLength(textOf(data, "why")),
    });
  }, []);

  function track(field: Field) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      setTyped(true);
      setLengths((last) => ({ ...last, [field]: measuredLength(value) }));
      if (RULES[field].safeParse(value).success) {
        setErrors((last) => (last[field] ? { ...last, [field]: undefined } : last));
      }
    };
  }

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
    const parsed = createRocketBody.safeParse({
      name: textOf(data, "name"),
      pitch: textOf(data, "pitch"),
      why: textOf(data, "why"),
    });
    alert.clear();
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ORDER, announce);
      return;
    }
    setErrors({});

    pending.current = true;
    setBusy(true);
    const result = await apiSend<{ id?: unknown } | null>("POST", "/api/rockets", parsed.data);
    if (result.ok) {
      // The new idea's page, if the answer names it in the shape an id has. The pad lists it
      // either way, so an answer that does not still lands somewhere useful.
      const id = rocketIdParam.safeParse(result.data?.id);
      wentTo.current = id.success ? `/rockets/${id.data}?notice=created` : "/pad";
      navigate(wentTo.current);
      return;
    }
    pending.current = false;
    setBusy(false);
    const found = detailErrors(result.details);
    if (Object.keys(found).length > 0) {
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ORDER, announce);
      return;
    }
    alert.show(apiErrorMessage(result, "We could not create the idea. Try again."));
  }

  return (
    <form ref={formRef} method="post" noValidate aria-label="New idea" onSubmit={onSubmit}>
      <FormAlert id="new-idea-alert" alert={alert.alert} alertRef={alert.ref} />
      <FormField
        label="Name"
        error={errors.name}
        count={textCount(lengths.name, ROCKET_NAME_MAX, "The name", !typed)}
      >
        <input name="name" type="text" autoComplete="off" onChange={track("name")} />
      </FormField>
      <FormField
        label="Pitch"
        hint="One line that says what it is."
        error={errors.pitch}
        count={textCount(lengths.pitch, PITCH_MAX, "The pitch", !typed)}
      >
        <input name="pitch" type="text" autoComplete="off" onChange={track("pitch")} />
      </FormField>
      <FormField
        label="Why this matters to you (optional)"
        hint="It becomes the Engine's first point."
        error={errors.why}
        count={textCount(lengths.why, POINT_MAX, "Why this matters", !typed)}
      >
        <input name="why" type="text" autoComplete="off" onChange={track("why")} />
      </FormField>
      <button type="submit" className="button" aria-disabled={busy || undefined}>
        {busy ? "Creating…" : "Create idea"}
      </button>
    </form>
  );
}
