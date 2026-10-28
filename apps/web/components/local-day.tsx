"use client";

import { useEffect, useState } from "react";
import { formatDay, formatLocalDay } from "@/lib/format";

/**
 * A day in the viewer's own time zone. The server does not know it, so the page first shows the day
 * in UTC, the same on the server and in the browser, and then the browser's own day.
 */
export function LocalDay({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatDay(iso));
  useEffect(() => {
    setText(formatLocalDay(iso));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}
