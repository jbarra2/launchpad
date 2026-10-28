import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="landing">
      <h1>Nothing is here</h1>
      <p>The address may be wrong, or the page may have moved.</p>
      <p className="actions">
        <Link href="/" className="button-link">
          Go to Launchpad
        </Link>
      </p>
    </main>
  );
}
