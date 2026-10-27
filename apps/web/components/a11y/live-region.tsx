"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const AnnouncerContext = createContext<(message: string) => void>(() => {});

/**
 * One polite live region for the whole app, for changes that move no focus. Each message gets a new
 * key, so the same words said twice are read twice.
 */
export function LiveRegion({ children }: { children: ReactNode }) {
  const [said, setSaid] = useState({ key: 0, message: "" });
  const announce = useCallback(
    (message: string) => setSaid((last) => ({ key: last.key + 1, message })),
    [],
  );

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {said.message ? <span key={said.key}>{said.message}</span> : null}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): (message: string) => void {
  return useContext(AnnouncerContext);
}
