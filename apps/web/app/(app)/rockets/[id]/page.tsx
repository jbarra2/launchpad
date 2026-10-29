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
import { StartSessionButton } from "@/components/rockets/start-session-button";
import { LocalDay } from "@/components/local-day";
import { partsToGo, progressText } from "@/lib/format";
import { getRocket } from "@/lib/rockets";
import { pick, single } from "@/lib/search-params";
import { getApiKeyState, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Idea" };

const NOTICES: Record<string, string> = {
  created: "Your idea is on the pad, with its Engine. Add the Fuel tank next.",
  launched: "Launched. The idea is locked, and its plan is ready to download.",
  ended: "The session has ended. Nothing was attached.",
};

function partNotice(kind: string | undefined, done: string): string | undefined {
  const parsed = partKindParam.safeParse(kind);
  return parsed.success ? `The ${PART_INFO[parsed.data].name} is ${done}.` : undefined;
}

/** How the next part can be built with Claude: in the open session, a new one, or not yet. */
type ChatState = "open" | "start" | "no-key" | "invalid-key";

function PartItem({
  rocketId,
  kind,
  part,
  isNext,
  locked,
  chat,
}: {
  rocketId: string;
  kind: (typeof PART_KINDS)[number];
  part: PartResponse | undefined;
  isNext: boolean;
  locked: boolean;
  chat: ChatState;
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
        <div className="plan-next">
          {chat === "open" ? (
            <Link href={`/rockets/${rocketId}/session`} className="button-link">
              Continue session<span className="visually-hidden"> for the {name}</span>
            </Link>
          ) : chat === "start" ? (
            <StartSessionButton rocketId={rocketId} kind={kind} />
          ) : null}
          <Link
            href={href}
            className={
              chat === "open" || chat === "start" ? "button-link button-secondary" : "button-link"
            }
          >
            Write it myself<span className="visually-hidden"> for the {name}</span>
          </Link>
          {chat === "no-key" ? (
            <p className="muted">
              <Link href="/settings">Add a Claude key in Settings</Link> to build this part by
              chatting with Claude.
            </p>
          ) : chat === "invalid-key" ? (
            <p className="muted">
              Your Claude key no longer works. <Link href="/settings">Replace it in Settings</Link>{" "}
              to build this part with Claude.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default async function RocketPage({ params, searchParams }: PageProps<"/rockets/[id]">) {
  const { id } = await params;
  await requireUser(`/rockets/${id}`);
  const query = await searchParams;
  const notice =
    pick(NOTICES, single(query.notice)) ??
    partNotice(single(query.saved), "saved") ??
    partNotice(single(query.attached), "attached");
  const rocket = await getRocket(id);
  const apiKey = await getApiKeyState();
  const attached = rocket.parts.map((part) => part.kind);
  const launched = rocket.status === "launched";
  const next = nextPartKind(attached);
  const chat: ChatState =
    rocket.openSession?.part === next
      ? "open"
      : apiKey.status === "valid"
        ? "start"
        : apiKey.status === "invalid"
          ? "invalid-key"
          : "no-key";

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
                chat={chat}
              />
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
