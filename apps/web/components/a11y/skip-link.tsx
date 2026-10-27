"use client";

import type { MouseEvent } from "react";

/** The first thing Tab reaches. It moves focus to the page's main content. */
export function SkipLink() {
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById("main-content");
    if (main) {
      // Focus moves without adding #main-content to the address.
      event.preventDefault();
      main.focus();
    }
  }

  return (
    <a className="skip-link" href="#main-content" onClick={skip}>
      Skip to main content
    </a>
  );
}
