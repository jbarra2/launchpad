import type { Metadata } from "next";
import { ApiKeySection } from "@/components/api-key-form";
import { DeleteAccount } from "@/components/delete-account";
import { SignOutButton } from "@/components/sign-out-button";
import { maskEmail } from "@/lib/mask";
import { pick, single } from "@/lib/search-params";
import { getApiKeyState, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

const NOTICES: Record<string, string> = {
  "key-saved": "Your Claude key is saved. Anthropic accepted it.",
  "key-removed": "Your Claude key is removed.",
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser("/settings");
  const apiKey = await getApiKeyState();
  const notice = pick(NOTICES, single((await searchParams).notice));
  return (
    <div className="narrow">
      <h1>Settings</h1>
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <section aria-labelledby="key-heading" className="settings-section">
        <h2 id="key-heading">Claude key</h2>
        <ApiKeySection state={apiKey} />
      </section>
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
      <section aria-labelledby="delete-heading" className="settings-section">
        <h2 id="delete-heading">Delete account</h2>
        <p>Your account and every idea on your pad are deleted for good.</p>
        <DeleteAccount />
      </section>
    </div>
  );
}
