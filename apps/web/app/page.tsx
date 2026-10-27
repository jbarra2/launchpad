import { APP_NAME } from "@launchpad/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AFTER_SIGN_IN } from "@/lib/safe-path";
import { peekSessionUser } from "@/lib/session";

export default async function HomePage() {
  // A signed-in person goes straight to their ideas. If that cannot be checked, the page still
  // shows, because it holds nothing private.
  if (await peekSessionUser()) {
    redirect(AFTER_SIGN_IN);
  }
  return (
    <main id="main-content" tabIndex={-1} className="landing">
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
