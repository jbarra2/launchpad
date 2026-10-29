/**
 * The length a text field's cap is measured against: after trimming, with a Windows line break
 * counted as one character, in UTF-16 units as Zod counts. A live counter that uses this agrees
 * with the refusal on submit.
 */
export function measuredLength(value: string): number {
  return value.replace(/\r\n?/g, "\n").trim().length;
}

// Characters that hide in text: every format character (Unicode category Cf), such as the
// direction overrides, the zero-width space, and the tag characters that can spell out a whole
// hidden sentence, and every character Unicode says to show as nothing (Default_Ignorable_Code_Point),
// such as the variation selectors that can carry hidden data and the letters that draw as blank
// space. A part's text is pasted into a coding assistant later, so nothing in it may be hidden. The
// two joiners that build emoji and some scripts stay allowed, and so do the two selectors that pick
// text or emoji style. Written as code points so that this file holds none of them.
const ALLOWED = [0x200c, 0x200d, 0xfe0e, 0xfe0f];
const char = (code: number) => String.fromCodePoint(code);
const INVISIBLE_CLASS = `[[\\p{Cf}\\p{Default_Ignorable_Code_Point}]--[${ALLOWED.map(char).join("")}]]`;
const INVISIBLE = new RegExp(INVISIBLE_CLASS, "v");
const INVISIBLE_ALL = new RegExp(INVISIBLE_CLASS, "gv");

/** True when the text holds a character that changes its direction or hides in it. */
export function hasInvisible(value: string): boolean {
  return INVISIBLE.test(value);
}

/** The text without those characters, for text written by Claude before a person reviews it. */
export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE_ALL, "");
}
