import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The only settings this file takes from the root .env. The file also holds the API's secrets, and
// Next has no use for them, so nothing else is read into this process.
const WANTED = ["API_INTERNAL_URL", "ANTHROPIC_TIMEOUT_MS"] as const;

const DEFAULT_API_URL = "http://localhost:4100";
const DEFAULT_CLAUDE_TIMEOUT_MS = 90_000;
// Next waits for the API a little longer than the API waits for Claude, so Next never cuts off a
// call the API is still allowed to finish.
const PROXY_MARGIN_MS = 30_000;

export interface ApiSettings {
  origin: string;
  proxyTimeoutMs: number;
}

type Source = Record<string, string | undefined>;

// An error here names the setting and never repeats its value, because a URL can carry a password.
export function readApiSettings(source: Source): ApiSettings {
  let url: URL;
  try {
    url = new URL(source.API_INTERNAL_URL || DEFAULT_API_URL);
  } catch {
    throw new Error("API_INTERNAL_URL must be a web address, such as http://localhost:4100.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_INTERNAL_URL must start with http:// or https://.");
  }

  const timeout = Number(source.ANTHROPIC_TIMEOUT_MS || DEFAULT_CLAUDE_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 600_000) {
    throw new Error(
      "ANTHROPIC_TIMEOUT_MS must be a whole number of milliseconds between 1000 and 600000.",
    );
  }

  // Only the origin is kept, so a path, a query, or a password on the URL never reaches a rewrite.
  return { origin: url.origin, proxyTimeoutMs: timeout + PROXY_MARGIN_MS };
}

// The named variables from a .env file. A missing file is fine, because a host sets them itself.
export function readEnvFile(file: string): Source {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
  const parsed = parseEnv(text);
  return Object.fromEntries(WANTED.map((name) => [name, parsed[name]]));
}

// A variable that is really set wins over the file, and an empty one counts as unset.
export function loadApiSettings(env: Source, file: string): ApiSettings {
  const fromFile = readEnvFile(file);
  return readApiSettings(
    Object.fromEntries(WANTED.map((name) => [name, env[name] || fromFile[name]])),
  );
}

// The health route goes first, so Sprint 3's session check on the rest of /api has no exception.
export function apiRewrites(origin: string) {
  return [
    { source: "/api/health", destination: `${origin}/health` },
    { source: "/api/:path*", destination: `${origin}/api/:path*` },
  ];
}

// The Content-Security-Policy is set in proxy.ts, because it carries a new nonce for every page.
export function securityHeaders(production: boolean) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    // Only this host, and only over https: a browser ignores the header on plain http.
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ];
}

// Next reads the rewrites when the web app is built and keeps them in what it builds, so
// API_INTERNAL_URL has to be set for `npm run build`, not only for `npm run start`. The same
// origin goes to server code (proxy.ts and lib/api.ts, through lib/api-origin.ts) by `env`, which
// Next also fixes into the build, so the two can never disagree. Only server code reads it.
export function buildConfig(
  { origin, proxyTimeoutMs }: ApiSettings,
  { production = false }: { production?: boolean } = {},
): NextConfig {
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    env: { API_INTERNAL_URL: origin },
    experimental: { proxyTimeout: proxyTimeoutMs },
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders(production) }];
    },
    async rewrites() {
      return apiRewrites(origin);
    },
  };
}

// A function, so that importing this file in a test reads no .env.
export default function nextConfig(): NextConfig {
  return buildConfig(loadApiSettings(process.env, path.join(repoRoot, ".env")), {
    production: process.env.NODE_ENV === "production",
  });
}
