"use client";

// Shown when a signed-in page cannot load, for example while the server is restarting. The
// session check refuses the page in that case, so nothing of the account is shown.
export default function SignedInError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert" className="notice notice-error">
      <h1>We could not load this page</h1>
      <p>Wait a moment, then try again.</p>
      <button type="button" className="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
