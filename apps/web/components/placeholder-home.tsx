import { APP_NAME } from "@launchpad/shared";

// A stand-in that the home page renders and Sprint 6 replaces with the pad. It reads the name from
// the shared package, so the page also proves that Next resolves the workspace build.
export function PlaceholderHome() {
  return (
    <main id="main-content">
      <h1>{APP_NAME}</h1>
      <p>Ideas are assembled here before you build them.</p>
    </main>
  );
}
