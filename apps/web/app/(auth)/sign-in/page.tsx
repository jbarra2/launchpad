import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { AFTER_SIGN_IN, safeNextPath } from "@/lib/safe-path";
import { single } from "@/lib/search-params";
import { peekSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

// Only these words ever reach the page. A value in the address that is not on a list shows nothing.
const NOTICES: Record<string, string> = {
  verified: "Your email address is confirmed. Sign in to continue.",
  "password-reset": "Your password is changed. Sign in with the new one.",
  "signed-out": "You are signed out.",
};

// A verification link that fails lands here with `error=` added to the notice it was given.
const LINK_ERRORS: Record<string, string> = {
  // Signing in with the right password mails a new link, though the answer itself is the same as
  // for a wrong password, so these do not promise that signing in will work.
  TOKEN_EXPIRED: "That link has expired. Sign in with your password to get a new link.",
  INVALID_TOKEN:
    "That link is not valid. Sign in with your password to get a new link if you need one.",
  USER_NOT_FOUND: "That link is for an account that no longer exists. Create a new account.",
};

const LINK_FAILED =
  "That link did not work. Sign in with your password to get a new link if you need one.";

function pick(list: Record<string, string>, key: string | undefined): string | undefined {
  return key && Object.hasOwn(list, key) ? list[key] : undefined;
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(single(params.next)) ?? AFTER_SIGN_IN;
  if (await peekSessionUser()) {
    redirect(next);
  }
  // Any error means the link did not work, so the "confirmed" notice it also carries never shows.
  // A code that is not on the list gets the general sentence.
  const linkError =
    params.error === undefined
      ? undefined
      : (pick(LINK_ERRORS, single(params.error)) ?? LINK_FAILED);
  const notice = linkError ? undefined : pick(NOTICES, single(params.notice));

  return (
    <>
      <h1>Sign in</h1>
      {linkError ? (
        <p role="alert" className="notice notice-error">
          {linkError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}
