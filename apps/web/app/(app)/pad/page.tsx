import { ROCKET_LIMIT, type RocketSummary } from "@launchpad/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Rocket } from "@/components/rocket";
import { LocalDay } from "@/components/local-day";
import { progressText } from "@/lib/format";
import { getRockets } from "@/lib/rockets";
import { pick, single } from "@/lib/search-params";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "The pad" };

const NOTICES: Record<string, string> = {
  deleted: "The idea is deleted.",
};

const LIMIT_REACHED = `You have ${ROCKET_LIMIT} ideas, the most the pad holds. Delete one to add another.`;

function RocketCard({ rocket }: { rocket: RocketSummary }) {
  const launched = rocket.status === "launched";
  return (
    <li className="rocket-card">
      <Rocket parts={rocket.parts} idPrefix={rocket.id} size="small" />
      <h3 className="rocket-card-name">
        <Link href={`/rockets/${rocket.id}`} className="rocket-card-link">
          {rocket.name}
        </Link>
      </h3>
      <p className="rocket-card-status">
        {launched && rocket.launchedAt ? (
          <>
            Launched <LocalDay iso={rocket.launchedAt} />
          </>
        ) : (
          progressText(rocket.parts, false)
        )}
      </p>
      {launched ? (
        <a href={`/api/rockets/${rocket.id}/plan.md`} download className="rocket-card-download">
          Download PLAN.md<span className="visually-hidden"> for {rocket.name}</span>
        </a>
      ) : null}
    </li>
  );
}

function GettingStarted() {
  return (
    <section aria-labelledby="getting-started-heading" className="getting-started">
      <h2 id="getting-started-heading">Getting started</h2>
      <ol>
        <li>
          <Link href="/pad/new">Create your first idea</Link>: a name and a one-line pitch. That is
          its Engine.
        </li>
        <li>
          Add the other five parts one at a time. <strong>Write it myself</strong> opens a short
          form for each.
        </li>
        <li>When all six are on, launch it and download its plan.</li>
      </ol>
    </section>
  );
}

export default async function PadPage({ searchParams }: PageProps<"/pad">) {
  await requireUser("/pad");
  const notice = pick(NOTICES, single((await searchParams).notice));
  const rockets = await getRockets();
  const building = rockets.filter((rocket) => rocket.status === "building");
  const launched = rockets.filter((rocket) => rocket.status === "launched");
  const full = rockets.length >= ROCKET_LIMIT;

  return (
    <>
      <div className="page-head">
        <h1>The pad</h1>
        {full ? null : (
          <Link href="/pad/new" className="button-link">
            <span aria-hidden="true" className="lead-mark">
              +
            </span>
            New idea
          </Link>
        )}
      </div>
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      {full ? <p className="notice">{LIMIT_REACHED}</p> : null}
      {rockets.length === 0 ? (
        <>
          <p role="status" className="empty-state">
            No ideas yet. Your ideas will appear here.
          </p>
          <GettingStarted />
        </>
      ) : null}
      {building.length > 0 ? (
        <section aria-labelledby="building-heading">
          <h2 id="building-heading" className="visually-hidden">
            Ideas being built
          </h2>
          <ul className="rocket-grid">
            {building.map((rocket) => (
              <RocketCard key={rocket.id} rocket={rocket} />
            ))}
          </ul>
        </section>
      ) : null}
      {launched.length > 0 ? (
        <section aria-labelledby="launched-heading" className="launched-shelf">
          <h2 id="launched-heading">Launched</h2>
          <ul className="rocket-grid">
            {launched.map((rocket) => (
              <RocketCard key={rocket.id} rocket={rocket} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
