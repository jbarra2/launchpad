import { APP_NAME } from "@launchpad/shared";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { LiveRegion } from "@/components/a11y/live-region";
import { SkipLink } from "@/components/a11y/skip-link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "A pad where project ideas are assembled before you build them.",
};

// The keyboard on a phone shrinks the page instead of covering the chat box (see web-ui.md).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

// Every page is rendered for its request, so Next can put that request's nonce on its scripts
// (see the Content-Security-Policy in proxy.ts). A page built ahead of time would have none.
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <LiveRegion>{children}</LiveRegion>
      </body>
    </html>
  );
}
