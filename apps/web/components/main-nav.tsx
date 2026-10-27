"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/pad", label: "The pad" },
  { href: "/settings", label: "Settings" },
];

/** The signed-in navigation. Sign out lives on Settings, at every width. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="main-nav">
      <ul>
        {LINKS.map((link) => {
          const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link href={link.href} aria-current={current ? "page" : undefined}>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
