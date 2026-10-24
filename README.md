# Launchpad

A pad where project ideas are assembled before you build them. A new idea starts as the base of a rocket. Each session with the chat adds another part, and the plan stays saved. When you are ready to start developing, you launch it.

**Status:** building. The build runs from 2026-10-22 to 2026-10-24. The plan is in `docs/`, and the checks that every later sprint is held to are in place. The app itself arrives in Sprint 2b.

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

Use Node 24 (see `.nvmrc`). Run `npm install` once, then:

- `npm run verify` runs the public-repo check, the type check, lint, the format check, and the tests.
- `npm run build` builds the workspaces.

## Running it

The app arrives in Sprint 2b. The quick start will be added here then.
