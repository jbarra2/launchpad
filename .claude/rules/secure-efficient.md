---
description: Security and efficiency rules for the API, the database, and every Claude call
---

# Secure and efficient

This app holds people's project ideas and their Claude API keys, and the repository is public. Treat both as sensitive.

## Secrets

- Never log or return a secret: a user's Claude key, `CREDENTIAL_KEY`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, cookies, tokens, internals, or stack traces.
- A saved Claude key is encrypted with AES-256-GCM, a random 12-byte IV on every write, and the user's id as the associated data. Only the last 4 characters are ever returned. No response schema in `packages/shared` has a key field.
- Decrypt a key only inside the call that needs it. Make a new Anthropic client for each call, and never keep a client or a key in module state.
- Never pass an SDK error message through to the user. Map the error class to a sentence written for the user (see `http-errors.md`).

## On screen

- A sensitive value shown to its owner is masked, and the page masks it on the server, so the full value is never in the HTML or handed to a component in the browser. An email address uses `maskEmail` from `apps/web/lib/mask.ts` (`an•••@e•••.com`). A saved key shows its last 4 characters only. A name is not masked.
- A new sensitive field that reaches a page gets a mask in `lib/mask.ts` and a test that the full value is not in the rendered page.
- The address a person has just typed may be shown back to them in full, in the tab they typed it in and until they sign in there, so they can spot a typo, as check-email does from this tab's storage.
- Masking decides what a page shows, not who may read the value. The owner's own API answers, such as `/api/me`, still carry it, and access is still decided by the session.

## Access

- Deny by default. Every route needs a session except `/health` and `/api/auth/*`, and each exception is deliberate.
- Every query for a rocket, part, session, message, key, or usage row is scoped to the signed-in user. Another user's id gets **404**, not 403, and a test must prove it.
- The signed-in user comes from the session and nowhere else. No header, query value, or body field chooses whose data a request touches.
- Load a rocket or a session through one shared helper that takes the user's id and throws 404. Do not write the ownership check again in each route.
- Hiding a control is not enough. The API refuses the action before the body is trusted, and a test shows the refusal. A launched rocket refuses edits with 409.

## Data

- Validate every write with the shared Zod schemas, and give every text field a size cap.
- Use parameterised queries only. Prisma's query methods are parameterised. Raw SQL uses the tagged template, never string building.
- Filter, sort, and cap in the database. Never load a table and slice it in code.
- A part and its closing session are written in one transaction. So are a rocket and its Engine.

## Claude calls

- Render Claude's output as text, never as HTML.
- Cap the work: 30 user messages per session, one reply in flight per session, and 60 Claude calls per user per hour.
- Write a `UsageEvent` for every call from `response.usage`.
- Tests mock the SDK. No test and no CI run makes a network call.
