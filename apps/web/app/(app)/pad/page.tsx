import type { Metadata } from "next";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "The pad" };

export default async function PadPage() {
  await requireUser("/pad");
  return (
    <>
      <h1>The pad</h1>
      <p role="status" className="empty-state">
        No ideas yet. Your ideas will appear here.
      </p>
    </>
  );
}
