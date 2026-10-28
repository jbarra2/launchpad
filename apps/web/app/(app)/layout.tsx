import { APP_NAME } from "@launchpad/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";

// No session check here: a layout does not run again when a person moves between its pages, so
// each page calls requireUser() itself (see app/(app)/signed-in-pages.test.ts).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <Link href="/pad" className="site-name">
          {APP_NAME}
        </Link>
        <MainNav />
      </header>
      <main id="main-content" tabIndex={-1} className="app-main">
        {children}
      </main>
    </>
  );
}
