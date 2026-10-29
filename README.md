# Launchpad

A pad where project ideas are assembled before you build them. A new idea starts as the base of a rocket. Each session with Claude adds another part, and the plan stays saved. When all six parts are on, you launch it and take away a plan and a kickoff prompt for a coding assistant.

**Status:** the core works end to end: accounts, ideas built with Claude or by hand, launch, and export. It runs on your own machine. Hosting comes later.

## How it works

- Every idea is a rocket with six parts, built in order from the bottom: Engine (the idea), Fuel tank (problem and people), Body (features), Avionics (tech and data), Fins (risks), and Nose cone (build plan).
- Sign up, confirm your address from the link, and sign in. Your pad holds up to 20 ideas.
- A new idea needs a name and a one-line pitch, which become its Engine.
- For each next part, choose **Start session** or **Write it myself**.
  - In a session, Claude interviews you about that part, one or two questions at a time. When you are ready, **Build this part** asks Claude for a draft. You edit it and choose **Attach part**.
  - **End session** closes the chat without attaching anything. An ended chat cannot be reopened.
  - Writing a part yourself works the same way, with no key needed. An attached part can be edited by hand until launch.
- Download `PLAN.md` and `KICKOFF.md` at any time. `KICKOFF.md` is a prompt to hand to a coding assistant.
- When all six parts are on, **Launch** locks the idea.
- The screens work on a phone, a tablet, and a desktop.

### Your Claude key

The chat runs on your own Claude API key, and its calls are billed to your Anthropic account. Create a key in the [Claude Console](https://platform.claude.com/settings/keys), then paste it in **Settings** and choose **Save and check**.

- The key is checked with Anthropic before it is saved. The check costs no tokens.
- It is stored encrypted (AES-256-GCM). After saving, only its last 4 characters are ever shown.
- You can replace or remove it at any time.

Every chat uses Claude Opus 5.5. There are limits: 2,000 characters per message, 30 answers per session, and 60 Claude calls an hour per person.

## Running it

1. Use Node 24 (see `.nvmrc`), have Docker running, and run `npm install`.
2. Run `npm run db:up`. It starts the database on port 5442.
3. Copy `.env.example` to `.env`. Set `BETTER_AUTH_SECRET` and `CREDENTIAL_KEY` to two different new secrets. The file shows the command that makes each one. The other values work as they are.
4. Run `npm run db:deploy` to create the tables.
5. Run `npm run dev`. It builds the shared package, then starts it in watch mode beside the API and the web app.
6. Open <http://localhost:3100>, and sign up.

There is no email provider yet. When you sign up, or ask for a password reset, the link is printed in the API's terminal output. Open it in the browser.

The browser only talks to the web app on port 3100, which passes `/api/*` on to the API on port 4100. The API only listens to this machine. `http://localhost:3100/api/health` answers `{"ok":true}` when both are up and the API can reach its database.

- If the API's output says a port is busy or a setting is wrong, the rest of the run keeps going. Fix the problem, stop the run with Ctrl+C, and run `npm run dev` again.
- If you change `PORT`, change `API_INTERNAL_URL` to match.
- `npm run db:down` stops the database and keeps its data.
- After changing `apps/api/prisma/schema.prisma`, run `npm run db:migrate` to make and apply a migration.

## Checks

Use Node 24 and have Docker running. Run `npm install` once, then:

- `npm run db:test:up` starts the test database on port 5443. It lives in memory and the tests clear it, so it never holds anything that matters. The tests need it.
- `npm run verify` runs the public-repo check, the type check, lint, the format check, and the tests.
- `npm run build` builds the workspaces.
- `npm run test:e2e` runs the built apps against the test database and checks over HTTP, as a browser does:
  - sign-up, the emailed link, and sign-in;
  - building, launching, and exporting an idea;
  - saving a key and a full Claude session, from the first question to an attached part.

  Run `npm run build` first. It needs the test database and free ports 4100 and 3199, so stop `npm run dev` before it.

No test calls Claude. The unit tests replace Anthropic's client with a stand-in, and the end-to-end tests answer for Anthropic from a small server on your machine. CI on GitHub runs the same checks on every push and pull request to `develop` and `main`.

## Stack

npm workspaces on Node 24:

- `apps/api`: Express 5, Prisma 7 on Postgres 17, Better Auth, Zod 4, and Anthropic's TypeScript SDK.
- `apps/web`: Next 16, React 19, plain CSS.
- `packages/shared`: Zod schemas and types, the contract between the two.

## Documents

- [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md): what the product is and why, with screens and wireframes.
- [docs/SPRINTS.md](docs/SPRINTS.md): the order of work, the "done when" for each sprint, and what comes later.
- [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md): how the work is reviewed, committed, and closed out each day.
- [LOG.md](LOG.md): a running record of what was asked and what changed.

## Later

Hosting with a real email provider, a model picker, rebuilding an attached part with a new session, past sessions and token totals, and a light and dark toggle. The full list is under _Later_ in [docs/SPRINTS.md](docs/SPRINTS.md).
