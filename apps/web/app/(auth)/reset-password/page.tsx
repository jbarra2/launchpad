import { resetPasswordBody } from "@launchpad/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { single } from "@/lib/search-params";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = single(params.token);
  const failed = params.error !== undefined;

  // The form takes the token out of the address bar, so a reload arrives here with none. The link
  // in the email still works then, so the page says to open it again rather than that it expired.
  if (!failed && params.token === undefined) {
    return (
      <>
        <h1>Set a new password</h1>
        <p role="status" className="notice">
          Open the reset link from your email again to set a new password.
        </p>
        <p className="form-links">
          <Link href="/forgot-password">Ask for a new link</Link>
        </p>
      </>
    );
  }

  // A failed link arrives with `error=`. A token the schema would refuse cannot work either.
  const usable = !failed && resetPasswordBody.shape.token.safeParse(token).success;
  if (!usable || !token) {
    return (
      <>
        <h1>Set a new password</h1>
        <p role="alert" className="notice notice-error">
          That reset link has expired or was already used.
        </p>
        <p>
          <Link href="/forgot-password" className="button-link">
            Ask for a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Set a new password</h1>
      <p>Setting a new password signs this account out everywhere it is signed in.</p>
      <ResetPasswordForm token={token} />
    </>
  );
}
