import { APP_NAME } from "@launchpad/shared";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <header className="auth-brand">
        <Link href="/">{APP_NAME}</Link>
      </header>
      <main id="main-content" tabIndex={-1} className="card">
        {children}
      </main>
    </div>
  );
}
