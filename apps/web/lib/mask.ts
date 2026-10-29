// What a page shows of a value only its owner should read in full. The page masks it on the server,
// so the full value is never in the HTML or handed to a component in the browser.

const DOTS = "•••";

/**
 * An email address with most of it hidden: "ana.lopez@example.com" becomes "an•••@e•••.com". At
 * most two characters of the name show, and never more than half of it. The domain shows its first
 * character and its last part. Three dots stand for any length, so the length is hidden too.
 * Anything that is not shaped like an address comes back as dots alone.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  // Characters, not UTF-16 units, so nothing is cut in half.
  const local = Array.from(email.slice(0, Math.max(at, 0)));
  const domain = email.slice(at + 1);
  if (at < 0 || local.length === 0 || domain === "") {
    return DOTS;
  }
  const shown = local.slice(0, Math.min(2, Math.floor(local.length / 2))).join("");
  const labels = domain.split(".");
  const first = Array.from(labels[0] ?? "")[0] ?? "";
  const ending = labels.length > 1 ? `.${labels.at(-1)}` : "";
  return `${shown}${DOTS}@${first}${DOTS}${ending}`;
}

/**
 * A saved Claude key, shown by its last 4 characters only: "••••abcd". The API never sends more of
 * the key than those 4, so this only formats them.
 */
export function maskKey(last4: string): string {
  return `••••${last4.slice(-4)}`;
}
