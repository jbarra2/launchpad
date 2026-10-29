import type { ApiKeyState, ChatSession, RocketDetail } from "@launchpad/shared";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";

const user = { id: "u1", name: "Ana", email: "ana@example.com" };
const requireUser = vi.fn(async (_path: string) => user);
const getApiKeyState = vi.fn(async (): Promise<ApiKeyState> => ({ status: "none" }));
vi.mock("@/lib/session", () => ({
  requireUser: (p: string) => requireUser(p),
  getApiKeyState: () => getApiKeyState(),
}));
const getRocket = vi.fn(async (_id: string): Promise<RocketDetail> => rocket());
vi.mock("@/lib/rockets", () => ({ getRocket: (id: string) => getRocket(id) }));
const getChatSession = vi.fn(async (_id: string): Promise<ChatSession> => chat());
vi.mock("@/lib/sessions", () => ({ getChatSession: (id: string) => getChatSession(id) }));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn(), replaceLocation: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/rockets/crocket1/session",
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));

const { default: SessionPage } = await import("./rockets/[id]/session/page");
const { default: AppLayout } = await import("./layout");

const NOW = "2026-10-28T10:00:00.000Z";

function rocket(
  openSession: RocketDetail["openSession"] = { id: "s1", part: "fuel" },
): RocketDetail {
  return {
    id: "crocket1",
    name: "Recipe Swap",
    pitch: "Trade family recipes.",
    status: "building",
    parts: [
      { kind: "engine", summary: "Trade recipes.", points: [], source: "manual", updatedAt: NOW },
    ],
    openSession,
    launchedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function chat(): ChatSession {
  return {
    id: "s1",
    rocketId: "crocket1",
    part: "fuel",
    status: "open",
    messages: [{ id: "m1", role: "assistant", text: "Who would use it first?", createdAt: NOW }],
  };
}

const props = (id = "crocket1") => ({ params: Promise.resolve({ id }) }) as never;

beforeEach(() => {
  requireUser.mockClear();
  getChatSession.mockClear();
  getRocket.mockImplementation(async () => rocket());
  getApiKeyState.mockResolvedValue({ status: "valid", last4: "abcd", checkedAt: NOW });
});

describe("the session page", () => {
  it("checks the session for its own address, then shows the rocket and the open chat", async () => {
    const { container } = render(<AppLayout>{await SessionPage(props())}</AppLayout>);
    expect(requireUser).toHaveBeenCalledWith("/rockets/crocket1/session");
    expect(getChatSession).toHaveBeenCalledWith("s1");
    expect(
      screen.getByRole("heading", { level: 1, name: "Session · Fuel tank · Problem & people" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recipe Swap" })).toHaveAttribute(
      "href",
      "/rockets/crocket1",
    );
    expect(screen.getByRole("img", { name: /Rocket, 1 of 6 parts/ })).toBeInTheDocument();
    expect(screen.getByText("Who would use it first?")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("goes back to the idea when no session is open", async () => {
    getRocket.mockImplementation(async () => rocket(null));
    await expect(SessionPage(props())).rejects.toThrow("redirect:/rockets/crocket1");
  });

  it("stops at the session check, before it asks for anything", async () => {
    requireUser.mockRejectedValueOnce(new Error("redirect:/sign-in"));
    getRocket.mockClear();
    await expect(SessionPage(props())).rejects.toThrow("redirect:/sign-in");
    expect(getRocket).not.toHaveBeenCalled();
  });
});

describe("the web app's source", () => {
  // Claude's replies and every person's text are shown by React as text. Nothing may hand a string
  // to the page as markup.
  it("never sets HTML from a string", () => {
    const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if ([".next", "node_modules"].includes(entry.name)) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    walk(webRoot);
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML|innerHTML\s*=|outerHTML\s*=/);
    }
  });
});
