import { APP_NAME } from "@launchpad/shared";
import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <LiveRegion>{children}</LiveRegion>
      </body>
    </html>
  );
}
