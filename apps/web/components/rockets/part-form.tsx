"use client";

import {
  measuredLength,
  PART_INFO,
  partBody,
  POINT_MAX,
  POINTS_MAX,
  SUMMARY_MAX,
  type PartKind,
} from "@launchpad/shared";
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { textCount, type Count } from "@/components/a11y/field-count";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import {
  focusFirstError,
  textOf,
  useResetWhenRestored,
  type FieldErrors,
} from "@/components/auth/form-helpers";
import { FormAlert, useFormAlert } from "@/components/form-alert";
import { apiErrorMessage, apiSend, detailErrors } from "@/lib/api-client";
import { navigate } from "@/lib/navigate";

const ORDER = ["summary", "points"];

/** The points as typed, one per line. Blank lines are left out. */
export function pointsOf(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The problem with the points, in the words the form shows, or undefined. */
export function pointsProblem(points: string[]): string | undefined {
  if (points.length > POINTS_MAX) {
    return `Use ${POINTS_MAX} points or fewer. There are ${points.length}.`;
  }
  const long = points.findIndex((p) => p.length > POINT_MAX);
  if (long >= 0) {
    return `Point ${long + 1} is over ${POINT_MAX} characters. Shorten it or split it in two.`;
  }
  return undefined;
}

/**
 * The live count under the points box: how many points, and the first problem with them, in the
 * same words whatever the limit that is broken.
 */
export function pointsCount(text: string, quiet = false): Count {
  const points = pointsOf(text);
  const extra = points.length - POINTS_MAX;
  const long = points.findIndex((p) => p.length > POINT_MAX);
  let line = `${points.length} of ${POINTS_MAX} points`;
  if (extra > 0) {
    line += `: ${extra} too many`;
  }
  if (long >= 0) {
    const by = points[long]!.length - POINT_MAX;
    line += `. Point ${long + 1} is ${by} ${by === 1 ? "character" : "characters"} too long`;
  }
  return {
    text: line,
    over: extra > 0 || long >= 0,
    overMessage: "The points are over their limits.",
    backMessage: "The points are within their limits again.",
    quiet,
  };
}

interface PartFormProps {
  rocketId: string;
  kind: PartKind;
  initial?: { summary: string; points: string[] };
  /**
   * Set when the form holds Claude's draft from a chat session: saving it attaches the part from
   * that session, which closes in the same write. The form then goes back to the chat instead of
   * to the idea when the person cancels.
   */
  draft?: { sessionId: string; onBackToChat: () => void };
}

export function PartForm({ rocketId, kind, initial, draft }: PartFormProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  // What the two boxes hold, as far as the live counts under them need.
  const [summaryLength, setSummaryLength] = useState(() => measuredLength(initial?.summary ?? ""));
  const [pointsText, setPointsText] = useState(() => initial?.points.join("\n") ?? "");
  // The counts are announced only once the person has typed here.
  const [typed, setTyped] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // A box can hold text before React does: typed before the page finished loading, or put back by
  // the browser on Back. Each count starts from what its box holds.
  useLayoutEffect(() => {
    const data = new FormData(formRef.current ?? undefined);
    setSummaryLength(measuredLength(textOf(data, "summary")));
    setPointsText(textOf(data, "points"));
  }, []);

  function onSummary(value: string) {
    setTyped(true);
    setSummaryLength(measuredLength(value));
    // Its error goes as soon as the summary is right.
    if (partBody.shape.summary.safeParse(value).success) {
      setErrors((last) => (last.summary ? { ...last, summary: undefined } : last));
    }
  }

  function onPoints(value: string) {
    setTyped(true);
    setPointsText(value);
    const points = pointsOf(value);
    if (!pointsProblem(points) && partBody.shape.points.safeParse(points).success) {
      setErrors((last) => (last.points ? { ...last, points: undefined } : last));
    }
  }
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
  const back = `/rockets/${rocketId}`;
  const { name } = PART_INFO[kind];

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
    const points = pointsOf(textOf(data, "points"));
    const parsed = partBody.safeParse({ summary: textOf(data, "summary"), points });
    const found: FieldErrors = {};
    const pointsError = pointsProblem(points);
    if (pointsError) {
      found.points = pointsError;
    }
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !found[field]) {
          found[field] = issue.message;
        }
      }
    }
    alert.clear();
    if (Object.keys(found).length > 0 || !parsed.success) {
      flushSync(() => setErrors(found));
      focusFirstError(form, found, ORDER, announce);
      return;
    }
    setErrors({});

    pending.current = true;
    setBusy(true);
    const body = draft ? { ...parsed.data, sessionId: draft.sessionId } : parsed.data;
    const result = await apiSend("PUT", `/api/rockets/${rocketId}/parts/${kind}`, body);
    if (result.ok) {
      wentTo.current = draft ? `${back}?attached=${kind}` : `${back}?saved=${kind}`;
      navigate(wentTo.current);
      return;
    }
    pending.current = false;
    setBusy(false);
    const fromApi = detailErrors(result.details);
    if (Object.keys(fromApi).length > 0) {
      flushSync(() => setErrors(fromApi));
      focusFirstError(form, fromApi, ORDER, announce);
      return;
    }
    const verb = draft ? "attach" : "save";
    alert.show(apiErrorMessage(result, `We could not ${verb} the ${name}. Try again.`));
  }

  return (
    <form
      ref={formRef}
      method="post"
      noValidate
      aria-label={draft ? `Draft of the ${name}` : `The ${name}`}
      onSubmit={onSubmit}
    >
      <FormAlert id="part-alert" alert={alert.alert} alertRef={alert.ref} />
      <FormField
        label="Summary"
        error={errors.summary}
        count={textCount(summaryLength, SUMMARY_MAX, "The summary", !typed)}
      >
        <textarea
          name="summary"
          rows={6}
          defaultValue={initial?.summary}
          onChange={(event) => onSummary(event.currentTarget.value)}
        />
      </FormField>
      <FormField
        label="Points"
        hint={`One point per line: up to ${POINTS_MAX} points of ${POINT_MAX} characters each.`}
        error={errors.points}
        count={pointsCount(pointsText, !typed)}
      >
        <textarea
          name="points"
          rows={8}
          defaultValue={initial?.points.join("\n")}
          onChange={(event) => onPoints(event.currentTarget.value)}
        />
      </FormField>
      <div className="form-actions">
        <button type="submit" className="button" aria-disabled={busy || undefined}>
          {draft ? (busy ? "Attaching…" : "Attach part") : busy ? "Saving…" : `Save the ${name}`}
        </button>
        {draft ? (
          <button type="button" className="button button-secondary" onClick={draft.onBackToChat}>
            Back to the chat
          </button>
        ) : (
          <Link href={back} className="button-link button-secondary">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
