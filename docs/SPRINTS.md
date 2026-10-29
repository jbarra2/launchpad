# Launchpad Sprint Guide

How to build [MASTER_PLAN.md](MASTER_PLAN.md) in three days. The master plan is the source of truth for _what_ and _why_. This file is the source of truth for _in what order, and by when_.

- Last updated: 2026-10-28
- Progress: Sprints 1 (2026-10-22), 2a (2026-10-23), 2b (2026-10-26), 3 (2026-10-26), 4 (2026-10-27), 5, 6, and 10 (2026-10-27) are done. Sprints 7, 8, and 9 are in progress.
- Deadline: the first plan ended Saturday 2026-10-24. On 2026-10-26 the rest of the core was re-planned to finish in one session, with the features listed under _Re-plan_ moved to _Later_.
- Branching: sprint work lands on `develop`. `develop` runs CI and does not deploy. `main` is what a host would publish later. The user merges `develop` into `main` after Sprint 12.
- Size: one sprint is one commit stop. If a sprint is sprawling, stop at the first **Done when** and move the rest to the next sprint or to the _Later_ list.

---

## How to run a sprint

1. Read the sprint and the master-plan sections it cites. Do not start from memory.
2. Stay on `develop`.
3. Write tests first whenever the sprint says so.
4. Implement until **Done when** is true. Run the **Verify** command.
5. Review before staging, and again before the sprint is marked done. Re-read the code this sprint changed. Another user's data must be refused by the API, with a test for that refusal. `npm run verify` is green. Walk the sprint's paths. For UI, repeat at phone (390), tablet (768), and desktop (1280). The diff has no secrets, no local paths, and no private project name, and error bodies are a sentence a person can act on. Fix what you find in this sprint. Do not start the next one with a known bug.
6. Add the sprint's entry to `LOG.md`, stage only the files that belong in the commit, and suggest a short message. The user commits and pushes.
7. A sprint is done once its commit is in and the GitHub check on `develop` is green. Sprint 1 has no check yet, so its commit is enough. Do not mark it done in a commit of its own. The next sprint's commit writes the dated status line, the progress line, and the row in the map below.

Rules that apply to every sprint after Sprint 2a (when `npm run verify` exists). A red CI check is not merged.

- No secrets in git. New env names go in `.env.example` with an empty value.
- New endpoint: add the Zod schema to `packages/shared`, then a success test and a failure test, then the handler.
- New UI: keyboard path, accessible name, axe assertion. The words on screen do not name npm, Postgres, the API, or a server command.
- Default: a route is authenticated. Exceptions are deliberate.
- A function and its screen ship in the same commit. A function is never staged without its screen.
- While `eslint.config.mjs` parses TypeScript with Babel, check whether `typescript-eslint` allows the TypeScript version in `package.json` (see `.claude/rules/typescript-eslint.md`).
- Tests mock the Anthropic SDK. Nothing in CI touches the network.
- If `npm run verify` is red at the end of a session, do not start the next sprint. Fix or revert.

---

## Map to the master plan

| Sprint | When           | Outcome                                          | Status      |
| ------ | -------------- | ------------------------------------------------ | ----------- |
| 1      | Thu 2026-10-22 | The plan, rules, and log are in the repo         | Done        |
| 2a     | Thu 2026-10-22 | The gate: verify and CI                          | Done        |
| 2b     | Thu 2026-10-22 | App skeleton: API, web page, and the rewrite     | Done        |
| 3      | Fri 2026-10-23 | Accounts API: sign-up, verify, reset, delete     | Done        |
| 4      | Fri 2026-10-23 | Auth screens, tokens, and the signed-in shell    | Done        |
| 5      | Fri 2026-10-23 | Rockets and parts API                            | Done        |
| 6      | Fri 2026-10-23 | The pad and the rocket page, built by hand       | Done        |
| 7      | Fri 2026-10-23 | Saved Claude key and model choice                | In progress |
| 8      | Sat 2026-10-24 | Interview chat                                   | In progress |
| 9      | Sat 2026-10-24 | Build the part: draft, edit, attach              | In progress |
| 10     | Sat 2026-10-24 | Launch, export, delete account                   | Done        |
| 11     | Sat 2026-10-24 | Stretch: five optional extras                    | Not started |
| 12     | Sat 2026-10-24 | Finish: accessibility, phone pass, security pass | Not started |

Sprints 1–10 are the core. Sprint 11 runs only if Sprint 10 is done and green, and stops at the cutoff on Saturday. Sprint 12 runs either way.

**Effort: xhigh** is reserved for the sprints that hold money, keys, or accounts: Sprints 3, 7, and 12. Those get the full set of checks in `.claude/rules/ready-to-commit.md`, which includes `/security-review`. Everything else runs at the default effort.

---

## Sprint 1 — Plan in the repo

**Status: done (2026-10-22).**

**Phase: setup.** Write down the plan so every later sprint starts from a document, not from memory.

### Work

- Write `CLAUDE.md`, `docs/MASTER_PLAN.md`, `docs/SPRINTS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, and `LOG.md` with entry 1.
- Add `.claude/settings.json` and the rules in `.claude/rules/`.
- Add `.env.example`, `.nvmrc`, `.gitattributes`, `.prettierrc.json`, `.gitignore`, and a README.
- Work on `develop`.

### Verify

```bash
git status
```

Only the Sprint 1 files appear. Read each document against `MASTER_PLAN.md`, and read `LOG.md` for personal details, local paths, and the name of any private project.

**Done when:** the documents match the master plan, nothing in them names a private project or a local path, and the commit is in. There is no CI yet, so there is no check to wait for.

---

## Sprint 2a — The gate

**Status: done (2026-10-23).**

**Phase: setup.** The checks every later sprint is held to, built before any product code. Each workspace holds one trivial source file and one trivial test, which later sprints replace.

### Work

- npm workspaces `apps/api`, `apps/web`, and `packages/shared`, scope `@launchpad/*`. TypeScript 7 with one tsconfig per workspace. Shared builds to `dist/`, so it is built before api and web.
- Prettier first: run `prettier --write` on the Sprint 1 documents, which were written by hand. The config is already in the repo.
- ESLint 9 flat config with the Babel parser, and jsx-a11y as errors on `apps/web`.
- Vitest 4 projects for api, web, and shared, with `fileParallelism: false`. Vitest 3 carried advisories in its test runner, so the gate starts on 4. The web project uses jsdom, Testing Library, and `vitest-axe`, with an axe smoke test on a trivial component. jsdom cannot measure colour contrast, so that rule is off in tests and Sprint 4 checks the contrast of the colour tokens. The API project uses supertest. The test database arrives in Sprint 3.
- `scripts/check-public.mjs` and its test, wired as `npm run check:public` and the first step of `verify`. It fails on an email address, a path into a user folder, a key or token shape, and a database, `.env`, or key file in a tracked or new file. It prints only the file, the line, and the rule. It does not flag words about accounts or plans, because this app is about them. Personal terms go in `.public-check.local`, which is listed in `.git/info/exclude`.
- Root scripts `typecheck`, `lint`, `format`, `format:check`, `test`, `check:public`, and `build`, and `verify` = `check:public && typecheck && lint && format:check && test`. `build` runs each workspace's `build` in order, and the web build arrives in Sprint 2b.
- `.git/info/exclude` gets `.public-check.local`, `apps/web/AGENTS.md`, and `apps/web/CLAUDE.md` (the last two are generated by `next dev` and stay untracked).
- `.github/workflows/ci.yml`: Node 24 from `.nvmrc`, `npm ci`, `npm run verify`, then `npm run build`, on push and pull request to `develop` and `main`. Read-only permissions and pinned actions.
- The first push shows whether CI works (Node version, a lockfile made on Windows, line endings) while the change is still small.

### Verify

```bash
npm run verify && npm run build
```

**Done when:** `npm run verify` and `npm run build` pass locally, and the GitHub check on `develop` is green.

---

## Sprint 2b — App skeleton

**Status: done (2026-10-26).**

**Phase: setup.** The two apps start and talk to each other, with no product code.

### Work

- `apps/api`: validated `config/env.ts`, `createApp()` in `app.ts`, `index.ts` that listens on `PORT` (4100), and `GET /health` returning `{ ok: true }`, with a supertest test.
- `apps/web`: a placeholder home page on port 3100, the web `build` script, and `next.config.ts` rewriting `/api/:path*` to `API_INTERNAL_URL`. Raise the rewrite's proxy timeout for long Claude calls. Confirm the option name in `node_modules/next/dist/docs/`.
- The root `dev` script runs shared, api, and web together, with `predev` building shared first.
- A README quick start.

### Verify

```bash
npm run verify && npm run build
```

**Done when:** `npm run dev` serves the page, `/api/health` answers through Next, `npm run verify` and `npm run build` pass, and the GitHub check on `develop` is green.

---

## Sprint 3 — Accounts API

**Status: done (2026-10-26).**

**Effort: xhigh.** Sign-up is public, and a verification or reset link is a way into someone's account. It has to be right, not only working.

**Phase: accounts.**

### Work

- `docker-compose.yml`: `db` on port 5442 and `db-test` on port 5443 with `tmpfs`, so Launchpad can run beside other projects, and the scripts `db:up`, `db:test:up`, and `db:test:reset`.
- The test-database wiring: a global setup that applies migrations to `db-test`, and a reset between tests.
- Prisma 7 with `@prisma/adapter-pg`. The Better Auth tables (`user`, `session`, `account`, `verification`, `rateLimit`) and the first migration. `GET /health` now also runs `SELECT 1`.
- Better Auth with email and password:
  - sign-up on, `requireEmailVerification`, `autoSignIn: false`;
  - a verification email on sign-up and on an unverified sign-in, and `autoSignInAfterVerification`;
  - password reset by link, and delete-user on;
  - passwords of 12 to 128 characters;
  - database-backed rate limits (tighter for sign-up and delete-user), with the origin and CSRF checks kept on;
  - sessions in Postgres, 24 hours sliding, `cookiePrefix: "launchpad"`, httpOnly, `sameSite: "lax"`, secure in production;
  - tokens stripped from JSON bodies.
- `lib/mailer.ts`: the console transport prints the link in the API terminal, tests use an outbox, and production refuses to start with the console transport.
- Mount order in `app.ts`: helmet, then `/api/auth/{*any}` **before** `express.json()`, then `requireTrustedOrigin` and `requireSession` on `/api`, then the JSON parser, the routes, and the error handler.
- `GET /api/me`.
- CI gains a `postgres:17-alpine` service container with a health check and `TEST_DATABASE_URL`, then generates the Prisma client and applies migrations before `verify`.
- Check whether sign-up reveals which emails already exist. If it does, return the same success and the same "check your email" result for both cases.
- Tests, written first:
  - sign-up sends a link and creates no session;
  - an unverified sign-in is refused and sends a link again;
  - following the link from the outbox verifies the account;
  - reset works and ends the old sessions;
  - delete-user removes the user and everything under it;
  - `/api/me` without a session gets 401;
  - the verification link, followed through the web origin, works.

### Verify

```bash
npm run verify
```

**Done when:** the tests above pass, and an unverified account cannot sign in.

---

## Sprint 4 — Auth screens and shell

**Status: done (2026-10-27).**

**Phase: accounts.**

### Work

- The Twilight tokens in `globals.css`: dark by default through `prefers-color-scheme`, with light remapping the same tokens. Check every colour pair for 4.5:1.
- `proxy.ts` refreshes the session cookie and redirects a signed-out visitor to `/sign-in?next=`. `next` is checked so it stays inside the site. The public paths are `/`, `/sign-up`, `/sign-in`, `/check-email`, `/forgot-password`, and `/reset-password`.
- `lib/api.ts` (`apiFetch` for server components, forwarding cookies) and `auth-client.ts`.
- The shared accessibility pieces in `components/a11y/`: `FormField`, `LiveRegion`, `SkipLink`.
- The screens: sign-up, sign-in, check-email with a resend, forgot-password, reset-password. A signed-in header with The pad and Settings. Sign out is on Settings, at every width. An empty `/pad`, and a Settings page with the account and Sign out.
- Tests: component tests with an axe assertion, and tests for the proxy and the `next` check.
- An end-to-end test over HTTP that CI runs after the build: sign up through the web app, open the link from the API console, sign in, and land on the pad, plus the signed-out redirect.

### Verify

```bash
npm run verify
```

**Done when:** a new person signs up, opens the link printed in the API console, signs in, and lands on an empty `/pad`, at 390 and 1280 widths.

---

## Sprint 5 — Rockets API

**Status: done (2026-10-27).**

**Phase: rockets.**

### Work

- Prisma models `Rocket`, `Part`, `ChatSession`, and `ChatMessage`, and the enums. The raw-SQL migration adds one open session per rocket, `cardinality(points) <= 8`, and the launched-status check. The schema has a comment pointing to it.
- Zod schemas in `packages/shared`: the part kinds and their order, the limits (name 80, pitch 200, summary 600, 8 points of 200 each), and the request bodies.
- Endpoints, every one scoped to the signed-in user:
  - `GET` and `POST /api/rockets`, with at most 20 rockets per user. The Engine is written in the same transaction (the pitch becomes its summary, the optional "why" its first point).
  - `GET`, `PATCH`, and `DELETE /api/rockets/:id`.
  - `PUT /api/rockets/:id/parts/:kind`, which accepts the next part or an existing one, and returns 409 when out of order or when the rocket is launched.
  - `POST /api/rockets/:id/launch`, which returns 409 unless all six parts are attached.
- Tests, written first: part order; the limits, refused both by the schema and by the database checks; 404 for another user's rocket on every route; a launched rocket refuses edits with 409; launch with five parts is 409; the rocket and its Engine roll back together; the 21st rocket is refused.

### Verify

```bash
npm run verify
```

**Done when:** the tests above pass.

---

## Sprint 6 — The pad and the rocket page

**Status: done (2026-10-27).**

**Phase: rockets.** A function and its screen ship together.

### Work

- `/pad`: a grid of rocket cards (a small rocket, the name, "3 of 6 parts" or "Ready to launch"), **+ New idea**, and the **Launched** shelf. With no rockets, a **Getting started** card: create an idea, optionally add a Claude key in Settings with a note on getting one, or use "Write it myself".
- `/pad/new`: name, pitch, and an optional "Why this matters to you".
- The `Rocket` SVG component: one `<g>` per part, gradient fills, dashed ghosts for missing parts, `role="img"` with an `aria-label` listing the attached parts.
- `/rockets/[id]`: the rocket and the plan list, **Write it myself** for the next part, **Edit** for an attached part, and delete with a confirmation.
- A plain landing page at `/`: the pitch, Sign up and Sign in, and the rocket illustration.
- Layout from `web-ui.md`: one column on a phone, two from 64rem.
- Tests: component tests with axe, and the empty and getting-started states.

### Verify

```bash
npm run verify
```

**Done when:** a rocket can be built fully by hand on a phone-width screen, and the walk at 390, 768, and 1280 passes.

---

## Sprint 7 — API key and model

**Status: in progress.**

**Effort: xhigh.** This sprint stores other people's paid credentials. A leak costs them money.

**Phase: Claude.**

### Work

- Prisma models `ApiCredential` and `UserSettings`.
- `lib/credentials.ts`: AES-256-GCM with a random 12-byte IV on every write and the user's id as the associated data. `keyVersion` allows rotation. `CREDENTIAL_KEY` is validated at boot: base64, exactly 32 bytes.
- `lib/claude.ts`: `makeClaude(apiKey)` returns `reply`, `draft`, and `checkKey`. It makes a new client on every call. `checkKey` uses `models.list()`, which costs no tokens. Tests use a fake.
- `PUT /api/me/api-key`: check the key, encrypt it, store it, and return only `{ last4, status }`. A rejected key is not stored. `DELETE /api/me/api-key` removes it. `PATCH /api/me/settings` takes `{ model }` from three allowed values. `GET /api/me` shows the key status.
- The Settings page: paste and **Save and check**, Replace, Remove, a note on how to get a key, and the model picker (Opus 5.5 by default, Sonnet 5.5, Haiku 5.5).
- Tests, written first:
  - the stored value is not the key, and a wrong id as associated data fails to decrypt;
  - one user's row cannot be read as another's;
  - the key appears in no response body and no log line, including on errors;
  - a rejected key is refused and not stored;
  - Remove deletes the row;
  - a model outside the allowed three is a 400.

### Verify

```bash
npm run verify
```

**Done when:** a good key saves and shows `••••abcd`, a bad key is refused and not stored, the key appears in no response or log (tested), and Remove works.

If Friday runs late, this sprint moves to Saturday morning and the cut list starts.

---

## Sprint 8 — Interview chat

**Status: in progress.**

**Phase: Claude.**

### Work

- Prisma model `UsageEvent`.
- `POST /api/rockets/:id/sessions` opens a session for the next part, or returns the open one, and Claude writes the first question. With no saved key it returns 409 with "Add your Claude key in Settings." `GET /api/sessions/:id` returns the messages. `POST /api/sessions/:id/messages` returns Claude's reply. `POST /api/sessions/:id/close` discards the session.
- The Claude call, as in `MASTER_PLAN.md`: the user's chosen model, effort `low`, a frozen system prompt (the friendly coach plus the six part guides) cached with `cache_control`, then the rocket so far and the transcript. Turn on the refusal fallback and confirm its exact shape in the Claude API reference while writing the code.
- Error mapping to the sentences in `http-errors.md`, and a key that Anthropic rejects is marked invalid.
- Caps: 2,000 characters per message, 30 user messages per session, one reply in flight, 60 Claude calls per user per hour. A `UsageEvent` for every call.
- `/rockets/[id]/session`: the transcript, the composer, a "Claude is thinking…" status in an `aria-live` region, **Build this part** and **End session**. Full screen on a phone, rocket column beside the chat on desktop. With no key, the panel says so and links to Settings.
- Tests, with the fake client: the reply is saved; a second message while one is in flight is refused; the 31st message is refused; each error class maps to its status and sentence; a 401 marks the key invalid; a `UsageEvent` is written; another user's session is 404; no key is 409.

### Verify

```bash
npm run verify
```

**Done when:** a real key runs a full interview at phone width and on desktop, and the mocked-SDK tests cover 401, 402, 429, 5xx, and refusal.

---

## Sprint 9 — Build the part

**Status: in progress.**

**Phase: Claude.**

### Work

- `POST /api/sessions/:id/draft`: `messages.parse` with `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`, at effort `medium`. The result is validated again with the shared part schema and is not saved. If it cannot be used, return 503 with "Claude's draft could not be used. Try again."
- The draft form: an editable summary and points, with **Attach part**.
- Attach: `PUT /api/rockets/:id/parts/:kind` takes an optional `sessionId`. With it, the part is written with source `chat` and the session is closed in the same transaction.
- On return to the rocket page (`?attached=<kind>`) the new part slides in. The movement stops under reduced motion.
- Rebuild: starting a session for an attached part replaces it when the new draft is attached.
- Tests: the draft is not saved; attach writes the part and closes the session together, and if either write fails neither happens; an unusable draft is a 503 and changes nothing; rebuild replaces the part; another user's session is 404.

### Verify

```bash
npm run verify
```

**Done when:** session, draft, edit, attach leaves the part on the rocket and in the plan.

---

## Sprint 10 — Launch and export

**Status: done (2026-10-27).**

**Phase: launch.**

### Work

- **Launch** on the rocket page, with "Launching locks this rocket. Continue?". The liftoff animation plays, and it is static under reduced motion. A launched rocket is read-only on screen, and the API refuses edits with 409. It moves to the **Launched** shelf.
- `GET /api/rockets/:id/plan.md` and `GET /api/rockets/:id/kickoff.md`, both `text/markdown`. The kickoff is a template wrapped around the plan, with no Claude call. **Copy** and **Download** for each. Both also work before launch.
- Delete account in Settings, with the password. The tests check that everything under the user is gone.
- Tests: launch needs all six parts; a launched rocket refuses a part write, a rename, and a new session; both exports contain every part; another user's export is 404; deleting the account removes rockets, parts, sessions, messages, the saved key, and usage rows.

### Verify

```bash
npm run verify
```

**Done when:** a six-part rocket launches and exports both files, and a launched rocket refuses edits (API test).

---

## Sprint 11 — Stretch

Runs only if Sprint 10 is done and green, in this order, and stops at the cutoff below. An unfinished item moves to the _Later_ list. Nothing is left half-built.

### Work

- **(a) Sample rocket on the landing page.** Static fictional data ("Recipe Swap") in `packages/shared`, shown read-only with the same `Rocket` component, its six parts, and its `PLAN.md`. No database.
- **(b) Token line and usage totals.** `GET /api/sessions/:id` returns the session's token total, shown as "This session: N tokens". `GET /api/me/usage` and a "Usage this month" section in Settings, by model.
- **(c) Past sessions.** `GET /api/rockets/:id/sessions?part=`, and a collapsed, read-only transcript under each part.
- **(d) "May need review".** A part older than an earlier part that was changed shows a quiet note, computed from `updatedAt` with no new column. Saving the part clears it.
- **(e) Home-screen install.** A web app manifest and icons. No service worker and no offline mode. Confirm the manifest API in `node_modules/next/dist/docs/`.

### Verify

```bash
npm run verify
```

**Done when:** each item works at 390 and 1280 and has its test.

**The cutoff:** Sprint 12 starts by 3:00 pm on Saturday whether or not this sprint is finished.

---

## Sprint 12 — Finish

**Effort: xhigh.** The last pass over everything that handles accounts and keys.

**Phase: finish.**

### Work

- Accessibility pass: axe on every screen, a keyboard-only path through sign-up, a session, and launch, and a reduced-motion check.
- A pass on a real phone over the local network: run dev on `0.0.0.0` and add the network origin to the trusted origins in `.env`. Include "Add to Home Screen" if (e) was built.
- The README run guide.
- A final `/code-review` and `/security-review` of the whole tree, committed on its own.
- Mark the sprints done, and tell the user the tree is ready to merge.

### Verify

```bash
npm run verify
```

**Done when:** `npm run verify` and CI are green and the full walk passes. The user then merges `develop` into `main`.

---

## Re-plan (2026-10-26)

The rest of the core is built in one session, in stops that each leave a working product. Each stop is one commit:

1. Sprint 4: the sign-in screens and the signed-in shell.
2. Sprints 5, 6, and 10: rockets built by hand, launch, and export.
3. Sprints 7, 8, and 9: the saved key and the Claude chat.
4. Sprint 12: the finish pass.

No test, review, or walk is cut. These features move to _Later_ and are not built in this session:

- The model picker and `UserSettings`. The chat uses Opus 5.5 (cut list item 3).
- Rebuilding an attached part with a new session. Editing it by hand stays (item 2).
- The liftoff and attach animations. The states are shown without movement (item 1).
- Renaming or re-pitching a rocket, `PATCH /api/rockets/:id` (item 4).
- The Copy buttons. Download stays (item 5).
- All of Sprint 11.

The second stop builds `Rocket` and `Part` only. `ChatSession` and `ChatMessage`, the one-open-session index, and the tests that need them (a launched rocket refuses a new session; deleting the account removes sessions and messages) come with the chat in the third stop. The Getting started card gains its Claude key line once Settings has the key.

Decided for the third stop (2026-10-28):

- Chats use Claude Opus 5.5 through `@anthropic-ai/sdk`, with the server-side refusal fallback. A refusal is a 422.
- Every part field and chat message refuses invisible direction and zero-width characters, and Claude's drafts have them removed before they are shown. `KICKOFF.md` is not fenced: the person edits and attaches every draft.
- The draft opens on the session screen, in place of the answer box.
- Writing the session's part by hand closes the open session in the same write, so an open session always builds the next part and a launched idea never has one.
- Checking a key is capped at 10 per person per hour, and the 60 calls an hour count calls in flight.
- Every page carries a Content-Security-Policy with a nonce, so every page is rendered per request.

---

## Cut list if the core is behind

Cut the first item first.

1. Liftoff and attach animations (show static states)
2. Rebuilding a part (hand edit still works)
3. The model picker (Opus 5.5 only)
4. Rename or re-pitch a rocket
5. The Copy button (keep Download)

Everything in Sprint 11 is already optional, so it is dropped before any of these.

**Never cut:** key encryption, ownership checks, email verification, "Write it myself", the phone layout, and export.

---

## Later

Outside the three days:

- A Light / Dark / Auto toggle in Settings that remembers the choice.
- An OpenAPI spec for the API, with a lint step. Zod 4 can convert the shared schemas to JSON Schema as a starting point.
- Hosting on Render, and a real email provider (see the hosting section of `MASTER_PLAN.md`).
- A monthly subscription with included tokens on a platform key.
- Any Sprint 11 item that did not get built.
- From the 2026-10-26 re-plan: the model picker, rebuilding an attached part, the liftoff and attach animations, renaming or re-pitching a rocket, and the Copy buttons.

---

## Suggested calendar

| Day                      | Sprints                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| Thu 2026-10-22 (evening) | 1, 2a, 2b                                                                  |
| Fri 2026-10-23           | 3, 4, 5, 6, 7 (7 may slide to Saturday morning)                            |
| Sat 2026-10-24           | 8, 9, 10; then 11 until 3:00 pm; then 12 (starts by 3:00 pm at the latest) |

If `npm run verify` is red at the end of a session, do not start the next sprint. Fix or revert.
