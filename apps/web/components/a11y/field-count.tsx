"use client";

import { useEffect, useRef } from "react";
import { useAnnouncer } from "./live-region";

export interface Count {
  text: string;
  over: boolean;
  /** Said once when the field goes over its limit. */
  overMessage: string;
  /** Said once when it comes back within it. */
  backMessage: string;
  /**
   * Follow the count without announcing it: before the person has typed in the form, when the
   * count only catches up with text the box already held (typed before the page was ready, or put
   * back by the browser).
   */
  quiet?: boolean;
}

/** "156 of 200 characters left", or "3 characters too many" once past the limit. */
export function characterCount(length: number, max: number): { text: string; over: boolean } {
  const extra = length - max;
  if (extra > 0) {
    return { text: `${extra} ${extra === 1 ? "character" : "characters"} too many`, over: true };
  }
  return { text: `${max - length} of ${max} characters left`, over: false };
}

/** The count for a text field with a character limit. `label` starts a sentence: "The pitch". */
export function textCount(length: number, max: number, label: string, quiet = false): Count {
  return {
    ...characterCount(length, max),
    overMessage: `${label} is over its ${max}-character limit.`,
    backMessage: `${label} is within its limit again.`,
    quiet,
  };
}

/**
 * A live count under a field. It is part of the field's description, so a screen reader reads it
 * on focus. It is not a live region itself, because a count read out on every key is noise: only
 * going over the limit, and coming back within it, are announced.
 */
export function FieldCount({ id, count }: { id: string; count: Count }) {
  const announce = useAnnouncer();
  const wasOver = useRef(count.over);
  useEffect(() => {
    if (wasOver.current === count.over) {
      return;
    }
    wasOver.current = count.over;
    if (!count.quiet) {
      announce(count.over ? count.overMessage : count.backMessage);
    }
  }, [announce, count.over, count.quiet, count.overMessage, count.backMessage]);

  return (
    <p id={id} className={count.over ? "field-count field-count-over" : "field-count"}>
      {count.text}
    </p>
  );
}
