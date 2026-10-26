import { APP_NAME } from "@launchpad/shared";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
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
      <body>{children}</body>
    </html>
  );
}
