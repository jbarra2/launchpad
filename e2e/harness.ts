import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { startFakeAnthropic, type FakeAnthropic } from "./fake-anthropic.js";

// Runs the built API and the built web app on this machine, against the test database, so a test
// can drive the whole path a browser takes: the web origin, the /api rewrite, the proxy, the pages.

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WEB_PORT = 3199;
export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

// What a child process needs from the operating system to start. Nothing else is passed on: the
// test runner sets NODE_ENV=test and VITEST, which would switch the API to its in-memory outbox,
// and a developer's shell could point it at a real database. The API still fills any setting it
// is not given from the root .env, and CI has none, so every setting it needs is given below.
const OS_VARIABLES = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SystemDrive",
  "windir",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
];

// Plain records: Next's types make NODE_ENV required on NodeJS.ProcessEnv, and the web app's child
// is meant to start without it.
type Env = Record<string, string | undefined>;

export function childEnv(extra: Record<string, string>, source: Env = process.env): Env {
  const env: Env = {};
  for (const name of OS_VARIABLES) {
    if (source[name] !== undefined) {
      env[name] = source[name];
    }
  }
  return { ...env, ...extra };
}

function answers(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Refuses a port that anything answers on, so a test never signs someone up through a dev server. */
export async function assertPortFree(port: number): Promise<void> {
  for (const host of ["127.0.0.1", "::1"]) {
    if (await answers(port, host)) {
      throw new Error(
        `Port ${port} is in use. Stop whatever is running there (such as npm run dev) and try again.`,
      );
    }
  }
}

/** Server output with the tokens from links taken out, for a failure message. */
export function redact(text: string): string {
  return text
    .replace(/token=[^&\s]+/g, "token=[redacted]")
    .replace(/\/reset-password\/[^?\s]+/g, "/reset-password/[redacted]");
}

export const MAIL_LINE =
  /^\[mail\] (email-verification|password-reset|account-exists) link for (\S+): (\S+)$/;

export type MailKind = "email-verification" | "password-reset" | "account-exists";

export interface Stack {
  apiOrigin: string;
  /** The newest link of this kind printed for this address, waiting for it if needed. */
  mail(kind: MailKind, to: string, timeoutMs?: number): Promise<string>;
  db: import("../apps/api/src/generated/prisma/client.js").PrismaClient;
  /** The stand-in for Anthropic that the API calls, with what each request carried. */
  anthropic: FakeAnthropic;
  /** Everything the two servers have printed so far. */
  output(): string;
  stop(): Promise<void>;
}

function hasStopped(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitFor(
  url: string,
  timeoutMs: number,
  failure: string,
  child?: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && hasStopped(child)) {
      throw new Error(failure);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 200) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(failure);
}

function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill();
  });
}

// The line the API prints once it is listening (apps/api/src/index.ts).
const API_READY = /^Launchpad API listening on /;

/** The API address fixed into the web build, which is where the built app will look for it. */
export function builtApiOrigin(buildDir = path.join(repoRoot, "apps/web/.next")): string {
  const file = path.join(buildDir, "required-server-files.json");
  const built = JSON.parse(fs.readFileSync(file, "utf8")) as {
    config?: { env?: { API_INTERNAL_URL?: unknown } };
  };
  const origin = built.config?.env?.API_INTERNAL_URL;
  if (typeof origin !== "string" || !origin) {
    throw new Error("The web build has no API address. Run `npm run build` again.");
  }
  return new URL(origin).origin;
}

async function waitForLine(
  output: string[],
  pattern: RegExp,
  child: ChildProcess,
  timeoutMs: number,
  failure: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasStopped(child)) {
      throw new Error(failure);
    }
    if (output.some((line) => pattern.test(line))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(failure);
}

export async function startStack(): Promise<Stack> {
  const apiEntry = path.join(repoRoot, "apps/api/dist/index.js");
  const webBuild = path.join(repoRoot, "apps/web/.next/BUILD_ID");
  if (!fs.existsSync(apiEntry) || !fs.existsSync(webBuild)) {
    throw new Error("Run `npm run build` first. The end-to-end tests run what was built.");
  }

  // The web build has the API's address fixed into it, and the API is started at that address.
  const apiOrigin = builtApiOrigin();
  const apiUrl = new URL(apiOrigin);
  if (!["localhost", "127.0.0.1"].includes(apiUrl.hostname)) {
    throw new Error("The end-to-end tests only start the API on this machine.");
  }
  const apiPort = Number(apiUrl.port || 80);

  // The test database only, checked by name and host in test-env.ts and again before it is emptied.
  const { testDatabaseUrl } = await import("../apps/api/tests/setup/test-env.js");
  const { default: migrate } = await import("../apps/api/tests/setup/globalSetup.js");
  const { clearTestDatabase } = await import("../apps/api/tests/setup/clear-database.js");
  const { PrismaClient } = await import("../apps/api/src/generated/prisma/client.js");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  migrate();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
  await clearTestDatabase(db);

  const output: string[] = [];
  const children: ChildProcess[] = [];
  const anthropic = await startFakeAnthropic();
  const stop = async () => {
    await Promise.all(children.map(stopChild));
    await anthropic.stop();
    await db.$disconnect();
  };

  try {
    // Checked right before each start, so nothing that started meanwhile is mistaken for ours.
    await assertPortFree(apiPort);
    const api = spawn(process.execPath, [apiEntry], {
      cwd: path.join(repoRoot, "apps/api"),
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv({
        NODE_ENV: "development",
        PORT: String(apiPort),
        TRUST_PROXY_HOPS: "0",
        DATABASE_URL: testDatabaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
        BETTER_AUTH_URL: WEB_ORIGIN,
        MAIL_TRANSPORT: "console",
        // A new one for every run, like the auth secret. Saved keys from another run cannot be read.
        CREDENTIAL_KEY: randomBytes(32).toString("base64"),
        ANTHROPIC_BASE_URL: anthropic.origin,
      }) as NodeJS.ProcessEnv,
    });
    children.push(api);
    for (const stream of [api.stdout, api.stderr]) {
      readline.createInterface({ input: stream }).on("line", (line) => output.push(line));
    }
    // Up only when the API started here says it is listening, and down the moment it exits. The
    // first start after a build has been seen to take over 30 seconds on Windows.
    await waitForLine(output, API_READY, api, 60_000, "The API did not start.");
    await waitFor(`${apiOrigin}/health`, 10_000, "The API did not answer its health check.", api);

    await assertPortFree(WEB_PORT);

    const nextBin = path.join(repoRoot, "node_modules/next/dist/bin/next");
    const web = spawn(
      process.execPath,
      [nextBin, "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"],
      {
        cwd: path.join(repoRoot, "apps/web"),
        stdio: ["ignore", "pipe", "pipe"],
        // No API_INTERNAL_URL: the web app must find the API from its build alone.
        env: childEnv({ NEXT_TELEMETRY_DISABLED: "1" }) as NodeJS.ProcessEnv,
      },
    );
    children.push(web);
    for (const stream of [web.stdout, web.stderr]) {
      readline.createInterface({ input: stream }).on("line", (line) => output.push(line));
    }
    await waitFor(
      `${WEB_ORIGIN}/api/health`,
      60_000,
      "The web app did not start, or did not reach the API. Run `npm run build` again.",
      web,
    );
    for (const child of children) {
      if (hasStopped(child)) {
        throw new Error("A server stopped right after it started.");
      }
    }
  } catch (error) {
    await stop();
    const tail = redact(output.slice(-20).join("\n"));
    throw new Error(`${(error as Error).message}\n${tail}`);
  }

  async function mail(kind: MailKind, to: string, timeoutMs = 10_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const line of [...output].reverse()) {
        const match = MAIL_LINE.exec(line);
        if (match && match[1] === kind && match[2] === to && match[3]) {
          return match[3];
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `No ${kind} link was printed for ${to}.\n${redact(output.slice(-20).join("\n"))}`,
    );
  }

  return { apiOrigin, mail, db, anthropic, output: () => output.join("\n"), stop };
}
