import { ROCKET_LIMIT } from "@launchpad/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { NewRocketForm } from "@/components/rockets/new-rocket-form";
import { getRockets } from "@/lib/rockets";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New idea" };

export default async function NewIdeaPage() {
  await requireUser("/pad/new");
  // The API refuses the 21st idea whatever this page shows. This only spares the typing.
  const full = (await getRockets()).length >= ROCKET_LIMIT;
  return (
    <div className="narrow">
      <p className="back-link">
        <Link href="/pad">
          <span aria-hidden="true" className="lead-mark">
            ‹
          </span>
          The pad
        </Link>
      </p>
      <h1>New idea</h1>
      {full ? (
        <p className="notice">
          You have {ROCKET_LIMIT} ideas, the most the pad holds. Delete one on the pad to add
          another.
        </p>
      ) : (
        <>
          <p>Start with a name and a one-line pitch. They become the rocket&apos;s Engine.</p>
          <NewRocketForm />
        </>
      )}
    </div>
  );
}
