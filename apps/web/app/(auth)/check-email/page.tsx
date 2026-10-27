import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckEmail } from "@/components/auth/check-email";
import { AFTER_SIGN_IN } from "@/lib/safe-path";
import { peekSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Check your email" };

// The page reads nothing from its address, so nothing on it can depend on whether an address has an
// account.
export default async function CheckEmailPage() {
  if (await peekSessionUser()) {
    redirect(AFTER_SIGN_IN);
  }
  return <CheckEmail />;
}
