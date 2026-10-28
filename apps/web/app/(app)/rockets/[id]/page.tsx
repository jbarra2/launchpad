import {
  nextPartKind,
  PART_INFO,
  PART_KINDS,
  partKindParam,
  type PartResponse,
} from "@launchpad/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Rocket } from "@/components/rocket";
import { DeleteRocketButton, LaunchButton } from "@/components/rockets/rocket-actions";
import { LocalDay } from "@/components/local-day";
import { partsToGo, progressText } from "@/lib/format";
import { getRocket } from "@/lib/rockets";
import { pick, single } from "@/lib/search-params";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Idea" };

const NOTICES: Record<string, string> = {
  created: "Your idea is on the pad, with its Engine. Add the Fuel tank next.",
  launched: "Launched. The idea is locked, and its plan is ready to download.",
};

function savedNotice(kind: string | undefined): string | undefined {
  const parsed = partKindParam.safeParse(kind);
  return parsed.success ? `The ${PART_INFO[parsed.data].name} is saved.` : undefined;
}

function PartItem({
  rocketId,
  kind,
  part,
  isNext,
  locked,
}: {
  rocketId: string;
  kind: (typeof PART_KINDS)[number];
  part: PartResponse | undefined;
  isNext: boolean;
  locked: boolean;
}) {
  const { name, section } = PART_INFO[kind];
  const href = `/rockets/${rocketId}/parts/${kind}`;
  const state = part ? "On the rocket" : isNext ? "Next" : "Not written yet";
  return (
    <li className={part ? "plan-part" : "plan-part plan-part-missing"}>
      <div className="plan-part-head">
        <h3>
          {name} <span className="plan-section">· {section}</span>
        </h3>
        <p className="plan-state">{state}</p>
      </div>
      {part ? (
        <>
          <p className="plan-summary">{part.summary}</p>
          {part.points.length > 0 ? (
            <ul className="plan-points">
              {part.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          ) : null}
          {locked ? null : (
            <Link href={href} className="plan-action">
              Edit<span className="visually-hidden"> the {name}</span>
            </Link>
          )}
        </>
      ) : isNext && !locked ? (
        <Link href={href} className="button-link">
          Write it myself<span className="visually-hidden"> for the {name}</span>
        </Link>
      ) : null}
    </li>
  );
}

export default async function RocketPage({ params, searchParams }: PageProps<"/rockets/[id]">) {
  const { id } = await params;
  await requireUser(`/rockets/${id}`);
  const query = await searchParams;
  const notice = pick(NOTICES, single(query.notice)) ?? savedNotice(single(query.saved));
  const rocket = await getRocket(id);
  const attached = rocket.parts.map((part) => part.kind);
  const launched = rocket.status === "launched";
  const next = nextPartKind(attached);

  return (
    <>
      <p className="back-link">
        <Link href="/pad">
          <span aria-hidden="true" className="lead-mark">
            ‹
          </span>
          The pad
        </Link>
      </p>
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <div className="rocket-page">
        <div className="rocket-column">
          <h1>{rocket.name}</h1>
          <p className="pitch">{rocket.pitch}</p>
          <Rocket parts={attached} idPrefix={rocket.id} />
          <p className="rocket-progress">
            {launched && rocket.launchedAt ? (
              <>
                Launched <LocalDay iso={rocket.launchedAt} />. The idea is locked.
              </>
            ) : (
              progressText(attached, false)
            )}
          </p>
          {launched ? null : next ? (
            <p className="muted">{partsToGo(attached)} before launch.</p>
          ) : (
            <LaunchButton rocketId={rocket.id} name={rocket.name} />
          )}
          <section aria-labelledby="export-heading" className="export">
            <h2 id="export-heading">Export</h2>
            <ul className="export-links">
              <li>
                <a href={`/api/rockets/${rocket.id}/plan.md`} download>
                  Download PLAN.md
                </a>
              </li>
              <li>
                <a href={`/api/rockets/${rocket.id}/kickoff.md`} download>
                  Download KICKOFF.md
                </a>
              </li>
            </ul>
            <p className="muted">
              PLAN.md is the plan. KICKOFF.md is a prompt for a coding assistant with the plan in
              it.
            </p>
          </section>
          <DeleteRocketButton rocketId={rocket.id} name={rocket.name} />
        </div>
        <section aria-labelledby="plan-heading" className="plan">
          <h2 id="plan-heading">The plan</h2>
          <ol className="plan-list">
            {PART_KINDS.map((kind) => (
              <PartItem
                key={kind}
                rocketId={rocket.id}
                kind={kind}
                part={rocket.parts.find((part) => part.kind === kind)}
                isNext={kind === next}
                locked={launched}
              />
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
