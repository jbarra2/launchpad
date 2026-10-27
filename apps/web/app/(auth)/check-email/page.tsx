import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckEmail } from "@/components/auth/check-email";
import { AFTER_SIGN_IN } from "@/lib/safe-path";
import { single } from "@/lib/search-params";
import { peekSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/check-email">) {
  if (await peekSessionUser()) {
    redirect(AFTER_SIGN_IN);
  }
  const params = await searchParams;
  return <CheckEmail unverified={single(params.reason) === "unverified"} />;
}
