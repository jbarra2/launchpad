import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatDay, formatLocalDay } from "@/lib/format";
import { LocalDay } from "./local-day";

// Late evening on the US west coast, already the next day in UTC.
const ISO = "2026-10-28T00:30:00.000Z";

describe("LocalDay", () => {
  it("runs in the pinned zone, or these tests could not tell local from UTC", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
  });

  it("renders the day in UTC on the server, so both sides start from the same words", () => {
    expect(renderToString(<LocalDay iso={ISO} />)).toContain(formatDay(ISO));
  });

  it("shows the viewer's own day once in the browser, with the exact time kept for machines", () => {
    render(<LocalDay iso={ISO} />);
    const time = screen.getByText(formatLocalDay(ISO));
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", ISO);
  });

  it("prints the viewer's day, which here is a day before the UTC one", () => {
    expect(formatLocalDay(ISO)).toBe("Oct 27, 2026");
    expect(formatDay(ISO)).toBe("Oct 28, 2026");
  });

  it("starts from the UTC day on the server and moves to the local one", () => {
    expect(renderToString(<LocalDay iso={ISO} />)).toContain("Oct 28, 2026");
    render(<LocalDay iso={ISO} />);
    expect(screen.getByText("Oct 27, 2026")).toHaveAttribute("dateTime", ISO);
  });
});
