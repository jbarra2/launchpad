import type { IncomingMessage, ServerResponse } from "node:http";
import { APP_NAME } from "@launchpad/shared";

// A stand-in that Sprint 2b replaces with createApp(). It reads the name from the shared package,
// so the test also proves that the workspace link and the build order work.
export function app(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, name: APP_NAME }));
}
