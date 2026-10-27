# Launchpad Master Plan

What Launchpad is and why it works the way it does. `SPRINTS.md` says in what order it gets built, and `DEVELOPMENT_WORKFLOW.md` says how the work is done.

- Last updated: 2026-10-22
- Build window: Thursday 2026-10-22 to Saturday 2026-10-24.

## The idea

> A pad where project ideas are assembled before you build them. A new idea starts as the base of a rocket. Each session with the chat adds another part, and the plan stays saved. When you are ready to start developing, you launch it.

A full-stack web app for phone and desktop. Anyone can sign up with an email and a password. To use the chat they save their own Claude API key, which the server stores encrypted.

## Decisions

| Topic         | Decision                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat          | A built-in Claude chat, one rocket part per session                                                                                                                              |
| Accounts      | Public email and password sign-up. Verification and reset links are printed to the API console for now; a real email provider comes with hosting                                 |
| Claude key    | Bring your own key. Stored encrypted on the server (AES-256-GCM), only the last 4 characters ever shown, checked when saved                                                      |
| Model         | `claude-opus-5-5` by default. The user can pick `claude-sonnet-5-5` or `claude-haiku-5-5` in Settings                                                                            |
| Parts         | Six fixed parts, attached in order                                                                                                                                               |
| Phone chat    | A session opens as a full-screen chat. After **Attach part** the user lands back on the rocket and sees the part go on                                                           |
| Launch output | `PLAN.md` plus a kickoff prompt for a coding assistant, both built from the six parts with a template (no extra Claude call)                                                     |
| Palette       | **Twilight**: indigo-black, white, and grey with a violet accent. The purple-to-blue gradient appears only on the rocket                                                         |
| Theme         | Follows the device's light or dark setting. A manual toggle is a later phase                                                                                                     |
| Claude's tone | **Friendly coach**: one or two questions at a time, points out a gap once and gently, short replies                                                                              |
| Rocket art    | Flat, clean shapes: solid fills with a gradient, and dashed ghost outlines for missing parts                                                                                     |
| First run     | An empty pad with a getting-started card. Nothing blocks writing parts by hand                                                                                                   |
| Transcripts   | Kept, and shown read-only and collapsed under the part they produced. Deleted with the rocket or the account                                                                     |
| Cost display  | A token count per session under the chat, and monthly totals by model in Settings. No dollar amounts                                                                             |
| Rebuilding    | A part older than an earlier part that was changed shows a quiet "May need review" note, computed from timestamps                                                                |
| Phone install | A web app manifest and icons, so "Add to Home Screen" opens full screen. No service worker and no offline mode                                                                   |
| Landing page  | A short pitch and a read-only sample rocket (fictional "Recipe Swap"), with its six parts and `PLAN.md`                                                                          |
| Stack         | Express and Next with Prisma, Better Auth, and Zod. No OpenAPI spec for now: the Zod schemas in `packages/shared` are the contract                                               |
| Hosting       | Render is a later phase. It is documented below and the app is kept deploy-ready, but nothing paid is built                                                                      |
| Paid model    | Later: a monthly subscription with included tokens on a platform key. Not built; every Claude call records its tokens now so the numbers exist                                   |
| Scheduling    | Core first (Sprints 1–10). Sprint 11 is a stretch sprint for the sample landing, the token line and totals, past sessions, the review note, and the manifest. Sprint 12 finishes |

### Defaults

- **Engine:** the new-idea form asks for a name, a one-line pitch, and an optional "Why this matters to you". The pitch becomes the Engine's summary, and the "why" becomes its first point.
- **Limits:** at most 20 rockets per user, as a guard on public sign-up.
- **Confirmations:** launching asks "Launching locks this rocket. Continue?". Deleting a rocket asks for confirmation. Deleting an account asks for the password.
- **Part wording:** the parts keep their rocket names with the plan section beside them ("Fuel tank · Problem & people"), so the metaphor and the meaning both show.
- **Claude's replies:** shown as plain text with line breaks. No Markdown is rendered.

---

## 1. What the app is

### The rocket: six parts, built bottom to top

| #   | Part          | Plan section     | What the session covers                                | Made by                     |
| --- | ------------- | ---------------- | ------------------------------------------------------ | --------------------------- |
| 1   | **Engine**    | The idea         | Name, one-line pitch, why it matters                   | The new-idea form (no chat) |
| 2   | **Fuel tank** | Problem & people | Who it is for, their problem, what they do today       | Chat session                |
| 3   | **Body**      | Features         | v1 must-haves, later, out of scope                     | Chat session                |
| 4   | **Avionics**  | Tech & data      | Stack, what data is stored, outside services           | Chat session                |
| 5   | **Fins**      | Risks & unknowns | Hardest part, open questions, what could sink it       | Chat session                |
| 6   | **Nose cone** | Build plan       | Milestones, first sprint, how you will know it is done | Chat session                |

- **Contents:** every part has a **summary** (up to 600 characters) and up to **8 points** (up to 200 characters each).
- **Order:** parts are attached in order, and a session always targets the next missing part.
- **Changing a part:** a finished part can be **rebuilt** with a new session or **edited by hand**.
- **Without a key:** **Write it myself** fills the same form with no chat, so the app works with no API key.
- **Launch:** unlocks when all six parts are attached.

### Chat session flow

1. **Start.** The user taps **Start session: Fuel tank**.
   - The API opens a `ChatSession` for that part. Only one session can be open per rocket.
   - Claude writes the first question, with the rocket so far as context.
2. **Interview.** Claude asks one or two questions at a time and the user answers.
   - Messages are capped at 2,000 characters, and a session at 30 user messages.
   - Only one reply can be in flight at a time.
   - "Claude is thinking…" shows in an `aria-live` region while waiting.
3. **Build this part.** Claude is called with structured output and returns a draft `{ summary, points[] }`. Nothing is saved yet.
4. **Attach.** The draft opens in an editable form, and the user adjusts it and taps **Attach part**.
   - The part is saved and the session is closed in one transaction.
   - The SVG rocket animates the new part into place.
5. **End session.** This discards the session, and nothing is attached.

### Launch and export

- **Launch** (needs all six parts) sets the rocket to `LAUNCHED`. A liftoff animation plays, which is static under `prefers-reduced-motion`. The rocket becomes read-only (the API refuses edits with 409) and moves to the **Launched** shelf.
- **Export** gives two files, each with a **Copy** button and a **Download** link. Both also work before launch.
  - **`PLAN.md`**:
    ```md
    # Recipe Swap

    > Trade family recipes with people you trust.

    ## The idea · ## Problem & people · ## Features · ## Tech & data · ## Risks & unknowns · ## Build plan
    ```
  - **`KICKOFF.md`**: a ready-to-paste prompt for a coding assistant, filled in from the parts with a template and no Claude call:
    > I'm starting a new project. The plan is below. Read it, then propose the project skeleton and a first sprint built from the "Build plan" section. Ask before choosing anything the plan leaves open. _(then the full plan)_

### Screens

| Route                                 | Who        | Contents                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                   | signed out | A short pitch, **Sign up** / **Sign in**, and the rocket illustration. **Sprint 11:** a sample finished rocket (read-only, fictional "Recipe Swap": the rocket, its six parts, and its `PLAN.md`), with no database. A signed-in user is sent to `/pad`                      |
| `/sign-up`, `/sign-in`                | signed out | Email and password (12–128 characters); sign-up also asks for a name                                                                                                                                                                                                         |
| `/check-email`                        | signed out | "We sent a link to …", with a resend button                                                                                                                                                                                                                                  |
| `/forgot-password`, `/reset-password` | signed out | The password-reset link flow                                                                                                                                                                                                                                                 |
| `/pad`                                | signed in  | Grid of rocket cards (mini rocket, name, "3 of 6 parts" or "Ready to launch"), **+ New idea**, then the **Launched** shelf. With no rockets, a **Getting started** card: create your first idea, optionally add a Claude key (with how to get one), or use "Write it myself" |
| `/pad/new`                            | signed in  | Name (up to 80), pitch (up to 200), and an optional "why". Creates the rocket and its Engine                                                                                                                                                                                 |
| `/rockets/[id]`                       | owner only | The rocket and the parts list (the plan). **Sprint 11:** each part gets a collapsed **Past sessions** section with read-only transcripts (they are kept from the start). **Start / Continue session**, **Write it myself**, Launch, Export                                   |
| `/rockets/[id]/session`               | owner only | The open session. **Phone:** a full-screen chat with a back arrow. **Desktop:** the rocket column on the left and the chat on the right. Attaching returns to `/rockets/[id]?attached=<kind>`, which plays the attach animation                                              |
| `/settings`                           | signed in  | API key, chat model, usage this month (Sprint 11), sign out, delete account                                                                                                                                                                                                  |

Someone else's rocket or session returns 404, never 403.

### Wireframes

**Rocket page, desktop (64rem and wider): two columns**

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Launchpad                                                    The pad   Settings│
├───────────────────────────────┬───────────────────────────────────────────────┤
│ ‹ The pad                     │ Session · Fuel tank: Problem & people         │
│ Recipe Swap                   │ ┌───────────────────────────────────────────┐ │
│ Trade family recipes with…    │ │ Claude  Who would use Recipe Swap first,  │ │
│                               │ │         and how do they share recipes now?│ │
│            /\     Nose ┄┄     │ │ You     My cousins. Mostly photos in a    │ │
│           /  \                │ │         group text that get lost.         │ │
│          | ┄┄ |   Avionics ┄┄ │ │ Claude  …                                 │ │
│          | ┄┄ |   Body ┄┄     │ └───────────────────────────────────────────┘ │
│          |▓▓▓▓|   Fuel tank ✓ │ ┌───────────────────────────────┐ ┌────────┐  │
│         /|▓▓▓▓|\  Fins ┄┄     │ │ Type your answer…             │ │  Send  │  │
│          [████]   Engine ✓    │ └───────────────────────────────┘ └────────┘  │
│          2 of 6 parts         │ [ Build this part ]          [ End session ]  │
│ ── The plan ───────────────── │                                               │
│ ✓ Engine · The idea     Edit  │                                               │
│ ✓ Fuel tank · Problem   Edit  │   ┄┄ = dashed ghost outline of a missing part │
│ ○ Body · Features   ← next    │                                               │
│ ○ Avionics  ○ Fins  ○ Nose    │                                               │
│ [ Launch ] 4 parts to go      │                                               │
│ [ Export PLAN.md ]            │                                               │
└───────────────────────────────┴───────────────────────────────────────────────┘
```

**Phone (about 390px wide): the rocket page, then the session as a full-screen chat**

```
/rockets/[id]                    /rockets/[id]/session
┌────────────────────────────┐   ┌────────────────────────────┐
│ Launchpad    Pad  Settings │   │ ‹ Recipe Swap · Fuel tank  │
│ ‹ Recipe Swap              │   ├────────────────────────────┤
│           /\  ┄            │   │ Claude  Who would use it   │
│          |┄┄|              │   │         first?             │
│          |▓▓|  2 of 6      │ → │ You     My cousins…        │
│         /[██]\             │   │ Claude  How do they share  │
│ The plan                   │   │         recipes today?     │
│ ✓ Engine   ✓ Fuel tank     │   │                            │
│ ○ Body ← next              │   ├────────────────────────────┤
│ [ Start session ]          │   │ [Type your answer…       ] │
│ [ Write it myself ]        │   │ [Build part]      [ Send ] │  ← sticky, stays
│ [ Export ]  [ Launch ]     │   └────────────────────────────┘    above the keyboard
└────────────────────────────┘
After "Attach part", the user goes back to the rocket page and the new part slides into place.
```

**The pad** (phone: one card per row; desktop: an auto-fill grid, minimum 14rem)

```
The pad                                            [ + New idea ]
┌────────────┐ ┌────────────┐ ┌────────────┐
│    /\      │ │            │ │    /\      │
│   |▓▓|     │ │            │ │   |▓▓|     │
│  /[██]\    │ │   [██]     │ │  /[██]\    │
│ Recipe Swap│ │ Bike Log   │ │ Study Buddy│
│ 3 of 6     │ │ 1 of 6     │ │ Ready ▲    │
└────────────┘ └────────────┘ └────────────┘
Launched
┌────────────┐
│ Plant Diary│  Launched Oct 24 · Export
└────────────┘
```

**Settings**

```
Claude API key
  Saved key ••••••••abcd · checked Oct 23        [ Replace ] [ Remove ]
  (no key yet) [ paste key …………… ] [ Save and check ]
  Your key is encrypted and used only for your own chats.
Chat model
  (•) Claude Opus 5.5: best plans   ( ) Sonnet 5.5   ( ) Haiku 5.5: cheapest
Usage this month
  Opus 5.5 · 41,200 tokens in · 9,800 out
Account
  ana@example.com   [ Sign out ]   [ Delete account… ]
```

### Look and feel

- **Palette:** Twilight. The tokens live in `:root`, and the device's setting picks dark or light with `prefers-color-scheme`. Every pair below was checked for contrast.

  | Token         | Dark      | Light     | Contrast (dark / light)                                   |
  | ------------- | --------- | --------- | --------------------------------------------------------- |
  | `--bg`        | `#0E0B1F` | `#F6F5FB` |                                                           |
  | `--surface`   | `#1A1633` | `#FFFFFF` |                                                           |
  | `--text`      | `#F4F3FA` | `#15122B` | 17.5 / 16.8 : 1 on bg                                     |
  | `--muted`     | `#A9A5C8` | `#5F5B7A` | 8.2 / 5.9 : 1 on bg                                       |
  | `--accent`    | `#8B6CFF` | `#5B3FD9` | 5.2 / 6.1 : 1 on bg                                       |
  | `--accent-2`  | `#4F8CFF` |           | Gradient end; decoration only, never used for text        |
  | `--on-accent` | `#0E0B1F` | `#FFFFFF` | Text on a button: 5.2 / 6.6 : 1 on accent                 |
  | `--danger`    | `#FF8A8A` | `#B42318` | Error text: 8.5 / 6.1 : 1 on bg, 7.7 / 6.6 : 1 on surface |
  - Buttons are solid accent: dark text in dark mode (5.2:1) and white text in light mode (6.6:1).
  - Any new color pair added during the build gets the same check.

- **The rocket:**
  - Flat, clean shapes in one inline SVG component, with one `<g>` per part. The fills use the `--accent` to `--accent-2` gradient.
  - A missing part is a dashed ghost outline, and a new part slides in with a CSS transform.
  - It has `role="img"` and an `aria-label` such as "Rocket, 2 of 6 parts: Engine, Fuel tank".
- **Status and text:**
  - Status is always shown as text, never by color alone.
  - Claude's replies are plain text (`white-space: pre-wrap`), never HTML.

---

## 2. Architecture

### Stack

npm workspaces under the `@launchpad/*` scope, on Node 24 (`.nvmrc`):

- **`apps/api`:** Express 5, helmet, Prisma 7 with `@prisma/adapter-pg` on Postgres 17, Better Auth, Zod 4, and `@anthropic-ai/sdk`. The contract is the Zod schemas in `packages/shared`, which validate every request body. There is no OpenAPI spec for now.
- **`apps/web`:** Next 16 App Router, React 19, plain CSS with tokens in `globals.css` (no Tailwind).
- **`packages/shared`:** Zod schemas and types (part kinds, limits, request bodies).
- **Tests:** Vitest 4 projects. The API tests use supertest against a real test database. The web tests use Testing Library and `vitest-axe`. The Anthropic SDK is mocked in every test, so no test and no CI run touches the network.
- **Tooling:** ESLint 9 flat config with the Babel parser (TypeScript 7), Prettier, docker-compose, and GitHub Actions CI.

```
browser ──▶ Next  (apps/web, :3100) ──rewrite /api/*──▶ Express (apps/api, :4100) ──▶ Postgres (:5442; tests :5443)
                                                            └──▶ api.anthropic.com  (that user's own key)
```

The browser only talks to Next, so there is no CORS. The ports are chosen so Launchpad can run beside other local projects.

### Data model (Prisma)

The Better Auth tables (`user`, `session`, `account`, `verification`, `rateLimit`) come first. Then:

```
enum PartKind { ENGINE FUEL BODY AVIONICS FINS NOSE }      enum RocketStatus { BUILDING LAUNCHED }
enum SessionStatus { OPEN CLOSED }   enum MessageRole { USER ASSISTANT }   enum CredentialStatus { VALID INVALID }

Rocket        id, userId→user (Cascade), name ≤80, pitch ≤200, status, launchedAt?, createdAt, updatedAt
              @@index([userId, status, updatedAt])
Part          id, rocketId (Cascade), kind, summary ≤600, points String[] ≤8, source chat|manual, updatedAt
              @@unique([rocketId, kind])
ChatSession   id, rocketId (Cascade), part PartKind, status, model, createdAt, closedAt?
ChatMessage   id, sessionId (Cascade), role, content ≤4000, createdAt          @@index([sessionId, createdAt])
ApiCredential userId @id (Cascade), ciphertext Bytes, iv Bytes, tag Bytes, keyVersion, last4, status, checkedAt
UserSettings  userId @id (Cascade), model  (opus-5-5 | sonnet-5-5 | haiku-5-5)
UsageEvent    id, userId (Cascade), rocketId? (SetNull), kind interview|draft, model,
              inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, createdAt   @@index([userId, createdAt])
```

A raw-SQL migration, with a comment in the schema pointing to it, adds:

- one open session per rocket (`CREATE UNIQUE INDEX … ON "ChatSession"("rocketId") WHERE status='OPEN'`);
- a check of `cardinality(points) <= 8`;
- a check that `(status='LAUNCHED') = ("launchedAt" IS NOT NULL)`.

### REST API

Every route requires a session except `/health` and `/api/auth/*`. Every query is scoped by `userId`, and another user's rocket returns **404**, not 403.

| Route                                            | Purpose                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET /health`                                    | Liveness check, including a database `SELECT 1`                                            |
| `/api/auth/*`                                    | Better Auth: sign-up, sign-in, verify, reset, sign-out, delete user                        |
| `GET /api/me`                                    | User, model, key status (`none` / `valid` / `invalid` with the last 4)                     |
| `PATCH /api/me/settings`                         | `{ model }`                                                                                |
| `PUT /api/me/api-key` · `DELETE /api/me/api-key` | Check with `models.list()`, then encrypt and store, returning `{ last4, status }` · remove |
| `GET /api/me/usage`                              | Tokens this month by model (Sprint 11)                                                     |
| `GET /api/rockets?status=` · `POST /api/rockets` | List mine · create, with the Engine in the same transaction                                |
| `GET` / `PATCH` / `DELETE /api/rockets/:id`      | Read with parts and the open session · rename or re-pitch · delete                         |
| `PUT /api/rockets/:id/parts/:kind`               | Write by hand or attach a part. 409 if out of order or the rocket is launched              |
| `POST /api/rockets/:id/sessions`                 | Open a session for the next part (or return the open one); Claude writes the opener        |
| `GET /api/sessions/:id`                          | Messages plus this session's token total. Closed sessions are read-only                    |
| `GET /api/rockets/:id/sessions?part=`            | Past sessions for a part: id, status, date (Sprint 11)                                     |
| `POST /api/sessions/:id/messages`                | `{ text }`, returns Claude's reply (not streamed)                                          |
| `POST /api/sessions/:id/draft`                   | `{ summary, points }`, not saved                                                           |
| `POST /api/sessions/:id/close`                   | Discard                                                                                    |
| `POST /api/rockets/:id/launch`                   | 409 unless all six parts are attached                                                      |
| `GET /api/rockets/:id/plan.md`                   | `text/markdown`                                                                            |
| `GET /api/rockets/:id/kickoff.md`                | `text/markdown`: the kickoff prompt with the plan                                          |

For every new endpoint: add the Zod request schema to `packages/shared` first, then a success test and a failure test, then the handler.

### Claude integration

All of it lives in `apps/api/src/lib/claude.ts`. Its interface is `reply`, `draft`, and `checkKey`, built by `makeClaude(apiKey)` with a fresh client on every call.

- **Interview turn:**
  - `client.messages.create` with the user's model, `max_tokens: 4000`, and `output_config: { effort: "low" }`. Opus 5.5 cannot turn thinking off, so effort is how cost is kept down.
  - The system prompt is frozen: the **friendly coach** role plus all six part guides. The coach asks one or two questions at a time, points out a gap once and gently, and keeps replies short. Top-level `cache_control: { type: "ephemeral" }` caches the prompt.
  - Then come the rocket so far, as the first user message, and the transcript.
- **Draft:** `client.messages.parse` with `output_config: { format: zodOutputFormat(PartDraft) }`, from `@anthropic-ai/sdk/helpers/zod`, at effort `medium`. The result is checked again with the same shared Zod schema as a hand-written part.
- **Refusals:** the server-side refusal fallback is on (`fallbacks: "default"` with the matching beta header). The exact shape is confirmed against the Claude API reference when the code is written. A final `stop_reason: "refusal"` shows "Claude declined that; try rephrasing."
- **Key check:** `client.models.list()`, which costs no tokens.
- **Errors**, checked most specific first, each shown as a sentence the user can act on:

  | Error                        | Status | Message                                                                                       |
  | ---------------------------- | ------ | --------------------------------------------------------------------------------------------- |
  | `AuthenticationError`        | 400    | "Anthropic did not accept your key. Replace it in Settings." The key is also marked `INVALID` |
  | Billing (402)                | 402    | "Your Anthropic account is out of credit."                                                    |
  | `RateLimitError`             | 429    | "Anthropic is limiting your key; try again in a minute."                                      |
  | `InternalServerError` or 529 | 503    | "Claude is busy; try again."                                                                  |
  | Connection or timeout        | 504    | "Claude took too long; try again."                                                            |

  The SDK's own error message is never passed through.

- **Usage:** every call writes a `UsageEvent` from `response.usage`.
- **Caps:** 30 user messages per session, one reply in flight per session, and 60 Claude calls per user per hour, counted from `UsageEvent`.

### Security

- **Key at rest:**
  - AES-256-GCM through `node:crypto`, with a random 12-byte IV on every write.
  - **The associated data is the user's id**, so a row copied to another user fails to decrypt.
  - `keyVersion` allows key rotation.
  - The key is decrypted only inside the call. It is never logged or returned, and no response schema in `packages/shared` has a key field.
  - Tests check that a wrong id fails, and that no response or log line contains the key.
- **Better Auth:**
  - Database-backed rate limits, and the origin and CSRF checks stay on.
  - Cookies are httpOnly with `sameSite=lax` and are `secure` in production. The `launchpad` prefix matters because localhost cookies ignore the port.
  - Deleting an account cascades through everything.
- **Inputs:** every write is checked with the shared Zod schemas, and every text field has a size cap.
- **Public repository:** `npm run check:public` runs in `verify` and in CI. Sample data is fictional.

### Phone and PC

- **Layout:**
  - One reflowing layout. A phone (under 48rem) gets one column, and its session is a full-screen chat at `/rockets/[id]/session`.
  - A tablet stacks the rocket above the chat, and a desktop (64rem and wider) puts the rocket column beside the chat.
  - Every action exists at every width, and nothing is hidden behind hover.
  - Touch targets are at least 44×44.
- **Phone chat:**
  - The composer is sticky, with `padding-bottom: env(safe-area-inset-bottom)` and a `100dvh` view.
  - The viewport export sets `interactiveWidget: "resizes-content"`, so the keyboard does not cover the input.
  - Inputs use 16px text, so iOS does not zoom.
- **Keys:** on desktop, Enter sends and Shift+Enter adds a new line. On touch screens (`pointer: coarse`), Enter adds a new line and the Send button sends.
- **Checking it:**
  - Each UI sprint is walked at **390 / 768 / 1280** in device mode.
  - One pass is on a real phone over the local network: run dev on `0.0.0.0` and add the network origin to the trusted origins in `.env`.

---

## 3. Render hosting (later phase: documented, not built)

**Shape A** costs about $20 a month and is meant for when there are users. Each piece is set up in `render.yaml`:

- **`launchpad-web`:** a public web service on the Starter plan.
- **`launchpad-api`:** a private service on Starter, with no public URL.
- **Database:** Render Postgres `basic-256mb`, reached by its internal URL.
- **Deploys:** auto-deploy runs from `main` only, and `develop` only runs CI.

|            | API (private service)                                                                                                          | Web                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Build      | `npm ci && npm run build -w @launchpad/shared && npm run prisma:generate -w @launchpad/api && npm run build -w @launchpad/api` | `npm ci && npm run build -w @launchpad/shared && npm run build -w @launchpad/web` |
| Pre-deploy | `npm run db:deploy -w @launchpad/api` (paid instances only)                                                                    |                                                                                   |
| Start      | `npm run start -w @launchpad/api`                                                                                              | `next start` with **no `-p`**, so it uses `PORT`                                  |
| Health     | `/health`                                                                                                                      |                                                                                   |

**Environment variables:**

- **API:**
  - `DATABASE_URL` from `fromDatabase`, as a direct connection rather than a pooler.
  - `NODE_ENV=production`.
  - `BETTER_AUTH_SECRET` with `generateValue`.
  - `BETTER_AUTH_URL` set to the web https URL.
  - `CREDENTIAL_KEY` with `sync: false`. **Back it up**: if it is lost, every user must re-enter their key.
  - `MAIL_TRANSPORT` plus the provider key, on a domain you own with SPF and DKIM.
  - `TRUST_PROXY_HOPS=1`.
- **Web:** `API_INTERNAL_URL` from the private service's `fromService … property: hostport`.
- **Both:** `NODE_VERSION=24`.

**Shape B** costs $0 and only suits a short demo.

- Both apps run as free public web services on free Postgres.
- The database expires after 30 days and is deleted 14 days later.
- Cold starts take about a minute.
- There is no pre-deploy step, so migrations run in the start command.

**Kept deploy-ready during the build, at no cost:** `PORT` is honored, `env.ts` is validated at startup, `.env.example` is complete, `npm run build` runs in CI, and the mailer is an interface.

## 4. Later

- A Light / Dark / Auto toggle in Settings that remembers the choice.
- An OpenAPI spec for the API, with a lint step. Zod 4 can convert the shared schemas to JSON Schema as a starting point.
- Any Sprint 11 item that did not get built.

### Paid model (not built)

- **Subscription:** a monthly subscription (Stripe) that includes a token allowance on a platform key, priced above Anthropic's per-token cost. Over the allowance, chat pauses until the next period, or is billed extra (decide then).
- **Still needed then:** renewal and failed-payment handling, and the rule for the over-allowance case.
- **Your own key:** stays available as an option.
- **Usage data:** `UsageEvent` already records tokens per call, per model and per user, with a timestamp. Summing by billing period gives the allowance used.

## 5. Risks and how they are handled

- **Sign-up may reveal whether an email exists.** Better Auth may return "already exists". This is tested in Sprint 3. If it leaks, both cases return the same success and the same "check your email" screen.
- **Verification links go through the Next rewrite.** `BETTER_AUTH_URL` is the web origin and `callbackURL` must be relative. A test follows the link from the outbox.
- **Opus 5.5 is slow without streaming.** Mitigations: a longer proxy timeout, effort `low`, the composer disabled while waiting, and a visible thinking status. Streaming is a later improvement.
- **TypeScript 7 and the Babel parser.** ESLint is not type-aware, so `tsc` is the type gate. Do not add `typescript-eslint` while it excludes TypeScript 7.
- **Windows.** `.gitattributes` keeps line endings as LF. Docker Desktop must be running before `db:test:up`. `verify` runs in the background if it is slow.

## 6. Verification

- `npm run verify` passes: public-repo check, typecheck, lint, format check, and tests. The API tests run against the test database with the SDK mocked.
- The GitHub check on `develop` is green for every sprint from 2a on.
- **By hand on Saturday:**
  1. Sign up and open the link from the API console.
  2. Save a real key.
  3. Create an idea and add five parts, at least one with "Write it myself".
  4. Launch and download `PLAN.md`.
  5. As a second user, confirm the first user's rocket URL returns 404.
  6. Do the walk at 390 / 768 / 1280, and once on a real phone over the local network.
- **Accessibility:** axe in component tests, a keyboard-only pass, and a reduced-motion check.
