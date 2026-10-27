import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";
import { maskEmail } from "@/lib/mask";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  return (
    <>
      <h1>Settings</h1>
      <section aria-labelledby="account-heading" className="settings-section">
        <h2 id="account-heading">Account</h2>
        <dl className="details">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Email</dt>
          {/* Masked here on the server, so the full address never reaches the browser. */}
          <dd>
            <span>{maskEmail(user.email)}</span>{" "}
            <span className="visually-hidden">(partly hidden)</span>
          </dd>
        </dl>
        <SignOutButton />
      </section>
    </>
  );
}
