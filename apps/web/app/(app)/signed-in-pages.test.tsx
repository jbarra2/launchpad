import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";

const here = path.dirname(fileURLToPath(import.meta.url));

function pagesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return pagesUnder(full);
    }
    return entry.name === "page.tsx" ? [full] : [];
  });
}

describe("every signed-in page", () => {
  it("checks the session itself, because the layout above it does not run on every visit", () => {
    const pages = pagesUnder(here);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const page of pages) {
      // The page's own address, so a sign-in returns the person to it. A [param] segment is
      // written as ${param} in a template string.
      const segments = path.relative(here, path.dirname(page)).split(path.sep);
      const route = segments
        .map((segment) =>
          /^\[.+\]$/.test(segment)
            ? "\\$\\{[^}]+\\}"
            : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("/");
      const call = new RegExp(`await requireUser\\(["\`]/${route}["\`]\\)`);
      // A call that has been commented out does not count.
      const source = fs
        .readFileSync(page, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source, path.relative(here, page)).toMatch(call);
    }
  });
});

describe("the helpers that call the API from the server", () => {
  // Next fixes the API's address into any bundle that reads it, so these may be imported only
  // from files that never run in the browser. Every import in the web app is checked, by alias or
  // relative path, with names or for its side effects alone, not only files marked "use client".
  const webRoot = path.resolve(here, "../..");
  const sources = fs
    .readdirSync(webRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !/[\\/](node_modules|\.next)[\\/]/.test(file))
    .filter((file) => !/\.test\.tsx?$/.test(file));

  function importsOf(file: string): string[] {
    const source = fs.readFileSync(file, "utf8");
    const specifiers = [...source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map(
      (m) => m[1]!,
    );
    return specifiers
      .map((specifier) =>
        specifier.startsWith("@/")
          ? path.join(webRoot, specifier.slice(2))
          : specifier.startsWith(".")
            ? path.resolve(path.dirname(file), specifier)
            : null,
      )
      .filter((target): target is string => target !== null)
      .map((target) =>
        path
          .relative(webRoot, target)
          .split(path.sep)
          .join("/")
          .replace(/\.tsx?$/, ""),
      );
  }

  function importersOf(target: string): string[] {
    return sources
      .filter((file) => importsOf(file).includes(target))
      .map((file) => path.relative(webRoot, file).split(path.sep).join("/"));
  }

  it("keeps the API's address to the proxy and the server fetch helper", () => {
    expect(importersOf("lib/api-origin").sort()).toEqual(["lib/api.ts", "proxy.ts"]);
  });

  it("keeps the server fetch helper to the session and rocket helpers", () => {
    expect(importersOf("lib/api").sort()).toEqual(["lib/rockets.ts", "lib/session.ts"]);
  });

  it.each(["lib/session", "lib/rockets"])("keeps %s to server pages", (helper) => {
    const importers = importersOf(helper);
    expect(importers.length).toBeGreaterThan(2);
    for (const file of importers) {
      expect(file).toMatch(/^app\/.*(page|layout)\.tsx$/);
      expect(fs.readFileSync(path.join(webRoot, file), "utf8")).not.toMatch(/["']use client["']/);
    }
  });
});

const user = { id: "u1", name: "Ana", email: "ana@example.com" };
const requireUser = vi.fn(async (_path: string) => user);
vi.mock("@/lib/session", () => ({ requireUser: (p: string) => requireUser(p) }));
const getRockets = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/rockets", () => ({ getRockets: () => getRockets() }));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/pad" }));

const { default: PadPage } = await import("./pad/page");
const { default: SettingsPage } = await import("./settings/page");
const { default: AppLayout } = await import("./layout");

beforeEach(() => {
  requireUser.mockClear();
  getRockets.mockResolvedValue([]);
});

const noSearch = { searchParams: Promise.resolve({}) } as never;

describe("a signed-in page whose session check refuses", () => {
  it("renders nothing and lets the redirect through", async () => {
    requireUser.mockRejectedValueOnce(new Error("redirect:/sign-in?next=%2Fpad"));
    await expect(PadPage(noSearch)).rejects.toThrow("redirect:/sign-in?next=%2Fpad");
    requireUser.mockRejectedValueOnce(new Error("redirect:/sign-in?next=%2Fsettings"));
    await expect(SettingsPage()).rejects.toThrow("redirect:/sign-in?next=%2Fsettings");
  });
});

describe("the pad", () => {
  it("says it is empty, as a status, inside the signed-in layout", async () => {
    const { container } = render(<AppLayout>{await PadPage(noSearch)}</AppLayout>);
    expect(requireUser).toHaveBeenCalledWith("/pad");
    expect(screen.getByRole("heading", { level: 1, name: "The pad" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No ideas yet.");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Settings", () => {
  it("shows the account and holds Sign out", async () => {
    const { container } = render(<AppLayout>{await SettingsPage()}</AppLayout>);
    expect(requireUser).toHaveBeenCalledWith("/settings");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows only part of the email, and the full address is nowhere in the page", async () => {
    const { container } = render(<AppLayout>{await SettingsPage()}</AppLayout>);
    expect(screen.getByText("a•••@e•••.com")).toBeInTheDocument();
    // A screen reader is told why it reads dots.
    expect(screen.getByText("a•••@e•••.com").closest("dd")).toHaveTextContent(
      "a•••@e•••.com (partly hidden)",
    );
    expect(container.innerHTML).not.toContain("ana@");
    expect(container.innerHTML).not.toContain("example");
  });
});
