/**
 * The length a text field's cap is measured against: after trimming, with a Windows line break
 * counted as one character, in UTF-16 units as Zod counts. A live counter that uses this agrees
 * with the refusal on submit.
 */
export function measuredLength(value: string): number {
  return value.replace(/\r\n?/g, "\n").trim().length;
}
