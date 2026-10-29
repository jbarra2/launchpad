import { partLabel } from "@launchpad/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChatSessionView } from "@/components/session/chat-session";
import { Rocket } from "@/components/rocket";
import { progressText } from "@/lib/format";
import { getRocket } from "@/lib/rockets";
import { getChatSession } from "@/lib/sessions";
import { getApiKeyState, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage({ params }: PageProps<"/rockets/[id]/session">) {
  const { id } = await params;
  await requireUser(`/rockets/${id}/session`);
  const rocket = await getRocket(id);
  // With no session open (it ended, or its part was attached), the idea's page says what is next.
  if (!rocket.openSession) {
    redirect(`/rockets/${rocket.id}`);
  }
  const session = await getChatSession(rocket.openSession.id);
  const apiKey = await getApiKeyState();
  const attached = rocket.parts.map((part) => part.kind);

  return (
    <>
      <p className="back-link">
        <Link href={`/rockets/${rocket.id}`}>
          <span aria-hidden="true" className="lead-mark">
            ‹
          </span>
          {rocket.name}
        </Link>
      </p>
      <div className="session-page">
        <div className="session-rocket">
          <Rocket parts={attached} idPrefix={rocket.id} />
          <p className="rocket-progress">{progressText(attached, false)}</p>
        </div>
        <div className="session-chat">
          <h1>{`Session · ${partLabel(session.part)}`}</h1>
          <ChatSessionView rocketId={rocket.id} session={session} keyStatus={apiKey.status} />
        </div>
      </div>
    </>
  );
}
