// Two sign-ups for the same new address at the same moment both see no account, and then the unique
// index refuses the second insert. Better Auth turns that into an error, and an error for a free
// address is an answer that a repeated sign-up never gives, so it would tell the caller that the
// address had no account. Taking the sign-ups for one address in turn means the second one finds the
// account the first made, and answers like any repeated sign-up.
//
// The lock is kept in memory, in this process.

const tails = new Map<string, Promise<void>>();
const releases = new WeakMap<object, () => void>();

// A lock that is never given back, because an error skipped the hook that gives it back, ends here.
const MAX_HOLD_MS = 15_000;

/** Waits for any sign-up for this address that is still running, then holds the address for `owner`. */
export async function lockSignUp(owner: object, email: string): Promise<void> {
  const previous = tails.get(email) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  tails.set(email, tail);
  void tail.then(() => {
    if (tails.get(email) === tail) {
      tails.delete(email);
    }
  });

  await previous;
  const timer = setTimeout(release, MAX_HOLD_MS);
  timer.unref();
  releases.set(owner, () => {
    clearTimeout(timer);
    release();
  });
}

/** Gives the address back. Safe to call for an owner that holds nothing. */
export function unlockSignUp(owner: object): void {
  releases.get(owner)?.();
  releases.delete(owner);
}

/** For tests: how many addresses are held or waited for right now. */
export function heldSignUps(): number {
  return tails.size;
}
