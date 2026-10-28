import { PART_KINDS, type PartKind } from "@launchpad/shared";

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Oct 27, 2026". In UTC, so the server and the browser always print the same day. */
export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}

/** The same, in the time zone of whatever runs it: for the browser, the viewer's own. */
export function formatLocalDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/** "3 of 6 parts", "Ready to launch", or "Launched". Status in words, never colour alone. */
export function progressText(parts: readonly PartKind[], launched: boolean): string {
  if (launched) {
    return "Launched";
  }
  if (parts.length === PART_KINDS.length) {
    return "Ready to launch";
  }
  return `${parts.length} of ${PART_KINDS.length} parts`;
}

/** "1 part to go", "4 parts to go". */
export function partsToGo(parts: readonly PartKind[]): string {
  const left = PART_KINDS.length - parts.length;
  return `${left} ${left === 1 ? "part" : "parts"} to go`;
}
