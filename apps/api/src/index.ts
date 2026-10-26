import { APP_NAME } from "@launchpad/shared";
import { env } from "./config/env.js";
import { createApp } from "./app.js";

// Behind a host's own network only its proxy reaches the API, so production listens on every
// interface. Anywhere else the API listens to this machine alone, so that nothing else on the
// network can call it without going through the web app.
const host = env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

// Express 5 hands a listen error, such as a busy port, to this callback.
const server = createApp().listen(env.PORT, host, (error?: Error) => {
  if (error) {
    const busy = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
    console.error(busy ? `Port ${env.PORT} is already in use.` : error.message);
    process.exit(1);
  }
  console.log(`${APP_NAME} API listening on http://localhost:${env.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // A Claude call in flight may take longer than a person wants to wait for a restart.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => process.exit(0));
  });
}
