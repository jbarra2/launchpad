/**
 * The API's address for server code (the proxy and server components). next.config.ts fixes it
 * into the build from the same setting the rewrites use, so the two always agree. Only server code
 * imports this file, so the address never reaches the browser.
 */
export function apiOrigin(): string {
  // Written out in full so Next can put the value in at build time.
  const origin = process.env.API_INTERNAL_URL;
  if (!origin) {
    throw new Error("API_INTERNAL_URL is not set for the web server (see next.config.ts).");
  }
  return origin;
}
