# Build Log

A running record of what I asked the chat AI for and what changed.

**Chat AI used:** Claude, in Claude Code inside VS Code.

---

## 1. Three-day plan (Claude Code)

**Asked:**

A three-day plan for a new project, Launchpad, built from its card on my portfolio site: what the
app contains and looks like, a sprint setup scaled down to three days, and this log. It should be
a full-stack web app on the same stack as my other project, and it should work on a phone and on a
desktop. Over a few rounds of questions I also asked for public sign-up with email, a
bring-your-own Claude key, a purple and blue look that follows the device's light or dark
setting, and a check on whether the stack itself made sense.

**What came back / what changed:**

- Read the Launchpad card on the portfolio site, which describes a pad where ideas are built up
  like a rocket, and planned the app from it. The plan was reviewed and approved before any file
  was written.
- Chose the product shape: each idea is a rocket with six fixed parts (Engine, Fuel tank, Body,
  Avionics, Fins, Nose cone). A chat session with Claude interviews the user for one part, drafts
  it, and the user edits and attaches it. "Write it myself" fills any part by hand, so the app
  works without a key. Launching needs all six parts and produces a `PLAN.md` and a kickoff prompt
  for a coding assistant.
- Chose public email sign-up with email verification and password reset by link. The links are
  printed to the API console until a real email provider is added.
- Chose bring-your-own Claude key. The server stores it encrypted with AES-256-GCM, bound to the
  user's id, shows only the last 4 characters, and checks it with a free model-list call when it
  is saved. Opus 5.5 is the default model, with Sonnet 5.5 and Haiku 5.5 in Settings. Claude's
  tone is a friendly coach.
- Chose the look: the Twilight palette (indigo-black, white, and grey with a violet accent), a
  flat SVG rocket, and the device's light or dark setting. Checked the contrast of every colour
  pair against 4.5:1 and kept the gradient off text, because its lightest blue fails.
- Chose the phone layout: a session opens as a full-screen chat with the composer above the
  keyboard, and attaching a part returns to the rocket, where the part slides on.
- Chose the same stack as my other project (Express 5, Next 16, Prisma 7 on Postgres 17, Better
  Auth, Zod 4, Vitest) without an OpenAPI spec for now. The Zod schemas in `packages/shared` are
  the contract.
- Set the schedule as twelve sprints across 2026-10-22 to 2026-10-24: the core in Sprints 1 to
  10, a stretch sprint for the extras, and a finishing sprint that starts by 3:00 pm on Saturday
  either way. Added a cut list and a list of what is never cut.
- Added the documents that carry the plan: `CLAUDE.md`, `docs/MASTER_PLAN.md`,
  `docs/SPRINTS.md`, and `docs/DEVELOPMENT_WORKFLOW.md`, plus `.claude/settings.json` and seven
  rules in `.claude/rules/`. Added `.env.example`, `.nvmrc`, `.gitattributes`, `.prettierrc.json`,
  `.gitignore`, and a README.
- This log takes only its structure from my other projects' logs and names no other project.
- No code has been written yet. Sprint 2 starts the skeleton.

## 2. Verify and CI timing (Claude Code)

**Asked:**

When the verify script and CI should be created.

**What came back / what changed:**

- Answered that both belong at the start of the code, before any product code, so every later
  commit is checked. Adding them late would mean fixing lint and format errors across finished
  work.
- Split Sprint 2 into 2a and 2b, from the options offered. Sprint 2a builds the gate: workspaces,
  TypeScript 7, ESLint, Prettier, Vitest, the public-repo check, `npm run verify`, and CI that
  runs verify and build. Sprint 2b builds the app skeleton: the API health route, the web
  placeholder page, and the rewrite. The first push then tests CI while the change is small.
- Moved the database compose file to Sprint 3, where Prisma first needs it, and added the
  Postgres service container to Sprint 3's CI work.
- Made CI run `npm run build` as well as `verify`, so a Next build error cannot slip past the
  type check.
- Updated `docs/SPRINTS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, and `CLAUDE.md` to match.

## 3. Sprint 2a: the gate (Claude Code)

**Asked:**

Continue from the last session, which meant Sprint 2a. Along the way I chose from the options
offered: bring over the rules my other project has that this one lacks, and move the test runner to
Vitest 4 after the install reported advisories on version 3.

**What came back / what changed:**

- Set up the three workspaces (`packages/shared`, `apps/api`, `apps/web`) with TypeScript 7, one
  config each, and one trivial source file and one trivial test per workspace.
- Added Prettier, ESLint 9 with the Babel parser and jsx-a11y errors on the web app, and Vitest
  projects for shared, api, web, and the scripts. Ran Prettier over the Sprint 1 documents, and
  only the table alignment changed.
- The install reported 2 critical and 1 moderate advisories, all in Vitest 3's runner. Moving to
  Vitest 4 cleared them, and `npm audit` now reports none. Vitest 4 needed one type file for the
  jest-dom and axe matchers. Axe's colour-contrast rule is off in jsdom, which cannot measure it, so
  Sprint 4 checks the contrast of the colour tokens.
- Added `scripts/check-public.mjs` and its tests, as the first step of `npm run verify`. It flags an
  email address, a path into a user folder, a key or token shape, a Claude plan name or school
  address, a database or key file, and any term in a local file. It prints only the file, the line,
  and the rule. Words about accounts and plans are not flagged, because this app is about them.
- Added CI that runs verify and build on `develop` and `main`, with a read-only token, pinned
  actions, and install scripts off.
- Checked that the gates fail when they should: a missing `alt`, a type error, and a misformatted
  file failed lint, typecheck, and the format check.
- Brought over the rules my other project had and this one lacked: no plain `Error` thrown, 400 for
  a value the database refused, 404 for an unknown route, Prisma errors mapped in the service, the
  user taken only from the session, one shared ownership helper, sorting in the database, table
  captions, links instead of buttons for navigation, one TypeScript install, and a separate
  database and secrets for each deployment.
- Marked Sprint 1 done in the sprint guide, and changed the workflow so that a done mark is written
  in the next sprint's commit and not in a commit of its own.
- Reviewed the new files and fixed what the review found. The public check now looks inside files
  with NUL bytes, such as UTF-16 with no byte order mark, recognizes this app's own secrets and web
  tokens, matches sensitive file names in any case, and no longer reads a lower-case route as a user
  folder. Tests read the shared package from its source, the root build runs every workspace's
  build, unused imports and variables are type errors, and the script itself is now type-checked.
