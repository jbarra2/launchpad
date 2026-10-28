import { APP_NAME, PART_KINDS } from "@launchpad/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Rocket } from "@/components/rocket";
import { AFTER_SIGN_IN } from "@/lib/safe-path";
import { pick, single } from "@/lib/search-params";
import { peekSessionUser } from "@/lib/session";

const NOTICES: Record<string, string> = {
  "account-deleted": "Your account and all its ideas are deleted.",
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  // A signed-in person goes straight to their ideas. If that cannot be checked, the page still
  // shows, because it holds nothing private.
  if (await peekSessionUser()) {
    redirect(AFTER_SIGN_IN);
  }
  const notice = pick(NOTICES, single((await searchParams).notice));
  return (
    <main id="main-content" tabIndex={-1} className="landing">
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <div className="landing-art">
        <Rocket parts={PART_KINDS} idPrefix="landing" label="A rocket with all six parts on" />
      </div>
      <h1>{APP_NAME}</h1>
      <p className="lead">Ideas are assembled here before you build them.</p>
      <p>
        Each idea is a rocket with six parts. Build each part by hand or in a short chat, then
        launch it into a plan you can hand to a coding assistant.
      </p>
      <p className="actions">
        <Link href="/sign-up" className="button-link">
          Create an account
        </Link>
        <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
