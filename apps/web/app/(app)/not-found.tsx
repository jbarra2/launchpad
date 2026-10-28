import Link from "next/link";

// Shown inside the signed-in layout for an idea that is not this person's, was deleted, or never
// was. The words are the same in every case, so they do not say whose an idea is.
export default function SignedInNotFound() {
  return (
    <div className="narrow">
      <h1>Nothing is here</h1>
      <p>That idea may have been deleted, or the address may be wrong.</p>
      <p>
        <Link href="/pad" className="button-link">
          Back to the pad
        </Link>
      </p>
    </div>
  );
}
