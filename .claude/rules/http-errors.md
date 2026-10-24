---
description: How the API reports errors, so every failure is a sentence a person can act on
paths:
  - "apps/api/src/**/*.ts"
---

# HTTP errors

Use the `HttpError` helpers (`badRequest`, `notFound`, `conflict`, and so on) from `apps/api/src/errors/`. Do not build error bodies by hand, and do not throw a plain `Error`: it becomes a 500.

| Status | Use for                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- |
| 400    | Bad input, a value the database refused (a check), or Anthropic did not accept the user's key     |
| 401    | No session                                                                                        |
| 402    | The user's Anthropic account is out of credit                                                     |
| 404    | Missing, someone else's rocket or session, or a route that does not exist                         |
| 409    | The action does not fit the state: a part out of order, a launched rocket, a session already open |
| 429    | The user hit a cap, or Anthropic is limiting their key                                            |
| 500    | Unexpected. Log it (without secrets) and return a generic sentence                                |
| 503    | Claude is overloaded (529 from Anthropic)                                                         |
| 504    | The Claude call timed out                                                                         |

## Messages

A message names the thing and the next step. It never names npm, Postgres, the API, or a server command.

- BAD: `"Invalid request"`, `"Error 409"`, or an SDK message passed through.
- GOOD: `"Anthropic did not accept your key. Replace it in Settings."`
- GOOD: `"Add the Fuel tank before the Body."`

## Zod details

A validation failure returns `details` as a list of `{ path, message }`. Never return `err.issues` as it is. The `error` field is still a readable sentence when `details` is present.

## Database errors

When the service knows what a Prisma error means (a unique, foreign-key, or check failure), it catches the error there and throws the matching helper with a sentence for the user. The error handler maps any that are left in the same way, and never sends Prisma's own message.

## Claude errors

Catch the SDK's typed classes, most specific first: `AuthenticationError`, then billing (402), `RateLimitError`, `InternalServerError`, and last the connection and timeout errors. Catching one broad class loses the difference between an error to retry and one to fix.
