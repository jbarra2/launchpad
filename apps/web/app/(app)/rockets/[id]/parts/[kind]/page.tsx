import { canWritePart, nextPartKind, PART_INFO, partKindParam } from "@launchpad/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartForm } from "@/components/rockets/part-form";
import { getRocket } from "@/lib/rockets";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Write a part" };

export default async function PartPage({ params }: PageProps<"/rockets/[id]/parts/[kind]">) {
  const { id, kind: rawKind } = await params;
  await requireUser(`/rockets/${id}/parts/${rawKind}`);
  const parsedKind = partKindParam.safeParse(rawKind);
  if (!parsedKind.success) {
    notFound();
  }
  const kind = parsedKind.data;
  const rocket = await getRocket(id);
  const attached = rocket.parts.map((part) => part.kind);
  const existing = rocket.parts.find((part) => part.kind === kind);
  const { name, section } = PART_INFO[kind];
  const back = `/rockets/${rocket.id}`;
  const next = nextPartKind(attached);

  // The API refuses all of these whatever this page shows. The page says why instead of a form.
  let blocked: { message: string; link?: { href: string; label: string } } | null = null;
  if (rocket.status === "launched") {
    blocked = { message: "This idea has launched, so its parts can no longer change." };
  } else if (!canWritePart(attached, kind) && next) {
    blocked = {
      message: `Add the ${PART_INFO[next].name} before the ${name}.`,
      link: { href: `${back}/parts/${next}`, label: `Write the ${PART_INFO[next].name}` },
    };
  }

  return (
    <div className="narrow">
      <p className="back-link">
        <Link href={back}>
          <span aria-hidden="true" className="lead-mark">
            ‹
          </span>
          {rocket.name}
        </Link>
      </p>
      <h1>{`${existing ? "Edit" : "Write"} the ${name}`}</h1>
      <p className="muted">{`${section}, for ${rocket.name}`}</p>
      {blocked ? (
        <>
          <p className="notice">{blocked.message}</p>
          {blocked.link ? (
            <p>
              <Link href={blocked.link.href} className="button-link">
                {blocked.link.label}
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <>
          {rocket.openSession?.part === kind ? (
            <p className="notice">
              Saving this ends your open session with Claude for the {name}, and you can&apos;t come
              back to that chat. <Link href={`${back}/session`}>Go back to the session</Link> to
              build it with Claude instead.
            </p>
          ) : null}
          <PartForm
            rocketId={rocket.id}
            kind={kind}
            initial={existing ? { summary: existing.summary, points: existing.points } : undefined}
          />
        </>
      )}
    </div>
  );
}
