import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { AFTER_SIGN_IN } from "@/lib/safe-path";
import { peekSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await peekSessionUser()) {
    redirect(AFTER_SIGN_IN);
  }
  return (
    <>
      <h1>Create an account</h1>
      <p>We will send a link to your email address to confirm it before you sign in.</p>
      <SignUpForm />
    </>
  );
}
