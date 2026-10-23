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

## Access

- Deny by default. Every route needs a session except `/health` and `/api/auth/*`, and each exception is deliberate.
- Every query for a rocket, part, session, message, key, or usage row is scoped to the signed-in user. Another user's id gets **404**, not 403, and a test must prove it.
- Hiding a control is not enough. The API refuses the action before the body is trusted, and a test shows the refusal. A launched rocket refuses edits with 409.

## Data

- Validate every write with the shared Zod schemas, and give every text field a size cap.
- Use parameterised queries only. Prisma's query methods are parameterised. Raw SQL uses the tagged template, never string building.
- Filter and cap in the database. Never load a table and slice it in code.
- A part and its closing session are written in one transaction. So are a rocket and its Engine.

## Claude calls

- Render Claude's output as text, never as HTML.
- Cap the work: 30 user messages per session, one reply in flight per session, and 60 Claude calls per user per hour.
- Write a `UsageEvent` for every call from `response.usage`.
- Tests mock the SDK. No test and no CI run makes a network call.
