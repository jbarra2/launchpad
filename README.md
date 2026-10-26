# Launchpad

A pad where project ideas are assembled before you build them. A new idea starts as the base of a rocket. Each session with the chat adds another part, and the plan stays saved. When you are ready to start developing, you launch it.

**Status:** building. The build runs from 2026-10-22 to 2026-10-24. The plan is in `docs/`, the checks that every later sprint is held to are in place, and the two apps start and talk to each other. Accounts come next.

## How it will work

- Every idea is a rocket with six parts: Engine (the idea), Fuel tank (problem and people), Body (features), Avionics (tech and data), Fins (risks), and Nose cone (build plan).
- A chat session with Claude interviews you about one part. Claude drafts it, you edit it, and you attach it. You can also write any part yourself.
- When all six parts are attached, you launch the rocket and get a `PLAN.md` and a kickoff prompt to hand to a coding assistant.
- It works on a phone and on a desktop.
- To use the chat you save your own Claude API key. The server stores it encrypted and never shows it again.

## Stack

npm workspaces on Node 24:

- `apps/api`: Express 5, Prisma 7 on Postgres 17, Better Auth, Zod 4.
- `apps/web`: Next 16, React 19, plain CSS.
- `packages/shared`: Zod schemas and types.

## Documents

- [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md): what the product is and why, with screens and wireframes.
- [docs/SPRINTS.md](docs/SPRINTS.md): the order of work and the "done when" for each sprint.
- [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md): how the work is reviewed, committed, and closed out each day.
- [LOG.md](LOG.md): a running record of what was asked and what changed.

## Checks

Use Node 24 (see `.nvmrc`) and have Docker running. Run `npm install` once, then:

- `npm run db:test:up` starts the test database on port 5443. It lives in memory and the tests clear it, so it never holds anything that matters. The tests need it.
- `npm run verify` runs the public-repo check, the type check, lint, the format check, and the tests.
- `npm run build` builds the workspaces.

## Running it

1. Use Node 24 (see `.nvmrc`), have Docker running, and run `npm install`.
2. Run `npm run db:up`. It starts the database on port 5442.
3. Copy `.env.example` to `.env`, and set `BETTER_AUTH_SECRET` to a new secret. The file shows the command that makes one. The other values work as they are.
4. Run `npm run db:migrate` to create the tables.
5. Run `npm run dev`. It builds the shared package, then starts it in watch mode beside the API and the web app.
6. Open <http://localhost:3100>.

There is no email provider yet. When you sign up, or ask for a password reset, the link is printed in the API's terminal output. Open it in the browser.

The browser only talks to the web app on port 3100, which passes `/api/*` on to the API on port 4100. `http://localhost:3100/api/health` answers `{"ok":true}` when both are up and the API can reach its database. The API only listens to this machine, so it is reached through the web app. If the API's output says a port is busy or a setting is wrong, the rest of the run keeps going. Fix the problem, stop the run with Ctrl+C, and run `npm run dev` again. If you change `PORT`, change `API_INTERNAL_URL` to match. `npm run db:down` stops the database and keeps its data.
