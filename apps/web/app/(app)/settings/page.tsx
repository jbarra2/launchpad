import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";
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
          <dd>{user.email}</dd>
        </dl>
        <SignOutButton />
      </section>
    </>
  );
}
