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

## 3. The gate (Claude Code)

**Asked:**

Continue from the last session, which meant building the gate. Along the way I chose from the options
offered: bring over the rules my other project has that this one lacks, and move the test runner to
Vitest 4 after the install reported advisories on version 3.

**What came back / what changed:**

- Set up the three workspaces (`packages/shared`, `apps/api`, `apps/web`) with TypeScript 7, one
  config each, and one trivial source file and one trivial test per workspace.
- Added Prettier, ESLint 9 with the Babel parser and jsx-a11y errors on the web app, and Vitest
  projects for shared, api, web, and the scripts. Ran Prettier over the planning documents, and
  only the table alignment changed.
- The install reported 2 critical and 1 moderate advisories, all in Vitest 3's runner. Moving to
  Vitest 4 cleared them, and `npm audit` now reports none. Vitest 4 needed one type file for the
  jest-dom and axe matchers. Axe's colour-contrast rule is off in jsdom, which cannot measure it, so
  the contrast of the colour tokens gets checked when they are built.
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
- Marked the planning work done in `docs/SPRINTS.md`, and changed the workflow so that a done mark
  is written with the next piece of work and not in a commit of its own.
- Reviewed the new files and fixed what the review found. The public check now looks inside files
  with NUL bytes, such as UTF-16 with no byte order mark, recognizes this app's own secrets and web
  tokens, matches sensitive file names in any case, and no longer reads a lower-case route as a user
  folder. Tests read the shared package from its source, the root build runs every workspace's
  build, unused imports and variables are type errors, and the script itself is now type-checked.

## 4. App skeleton (Claude Code)

**Asked:**

Continue from the last session, which meant building the app skeleton. I approved the new packages
the plan needed (Next, Express, Zod, a TypeScript runner for the API, a tool to run the three dev
processes together, and the Next lint rules), and chose to add the security-headers package now
instead of with the accounts work.

**What came back / what changed:**

- API: validated settings with a clear message that never repeats a value, `createApp()` with
  security headers, a 32 kb JSON limit and `GET /health`, and a start file that handles a busy port
  and shuts down cleanly. Every error leaves as a sentence a person can act on: a route that does
  not exist gets 404, a body that is not JSON, too large, or corrupt gets 400, 413, or 415, and
  anything unplanned gets a generic 500. The log for a 500 holds the error's class and code, never
  its message or stack. Every API response forbids caching.
- Web: a placeholder home page on port 3100 that reads the app name from the shared package, a
  layout whose viewport lets the phone keyboard shrink the page, and a `next.config.ts` that sends
  `/api/health` and then the rest of `/api/*` to the API. The wait for the API is the Claude timeout
  plus 30 seconds, so Next never cuts off a call the API is still allowed to finish. It takes only
  the two settings it needs from the root `.env`, so the API's secrets never reach Next. Pages send
  the security headers, and a production build adds Strict-Transport-Security.
- Confirmed in the installed Next that the proxy timeout option is `experimental.proxyTimeout`. It
  is in the type definitions but not in the docs.
- `npm run dev` now builds the shared package, then runs it in watch mode beside the API and the web
  app. The API listens to this machine alone outside production. ESLint gained Next's rules, and the
  README has a quick start.
- Found along the way: Express 5 passes a listen error to the callback, so a busy port has to be
  handled there. The body parser accepts any UTF charset, so only a non-UTF one is refused as 415.
  Next reads the rewrite when it builds, so the API address has to be set for the build too, and
  `.env.example` now says so.
- The review of the diff found corrupt compressed bodies answered with 500, a 500 log that held the
  whole error, caching headers on `/health` only, an API reachable from the network in development,
  untested `.env` loading, and a missing log entry. All were fixed, with a test for each.
- Checked live: `npm run dev` served the page, `/api/health` answered through Next, an unknown
  `/api` path got the API's own JSON 404, the API was not reachable by the machine's network
  address, and the built API and `next start` ran from `dist` and `.next`.
- `npm run verify` and `npm run build` pass, with 184 tests (125 before). `npm audit` reports 0.
- Marked the gate work done in `docs/SPRINTS.md` with this commit, as the workflow says.

## 5. Accounts API (Claude Code)

**Asked:**

Continue from the last session, which meant building the accounts API: sign-up, email
verification, password reset, and account deletion, with the database, tests, and CI to go with
it. I approved the new packages (Better Auth, and Prisma with its database adapter), chose the
latest Better Auth release, and chose that a reset link also goes to an account that never
verified its address, with a finished reset counting as proof of the mailbox.

**What came back / what changed:**

- Database: a compose file with a development database on port 5442 and an in-memory test database
  on 5443, both open to this machine only. Prisma 7 with the five tables Better Auth needs, the
  first migration, and scripts to start, stop, migrate, and reset them.
- Accounts: sign-up asks for a name, an email, and a password of 12 to 128 characters, and mails a
  link that is printed in the API terminal for now. An unverified account cannot sign in, and a
  try mails a fresh link. Following the link verifies the address and sends the person on to sign in,
  and the link works through the web address. It signs nobody in, because a link that signed in
  would hand whoever opened it the account it names. A reset link lasts 30 minutes, works once, ends every older
  session, and also verifies an account that never was. Deleting an account asks for the password
  and removes the person's sessions, accounts, and reset tokens. Sessions live in Postgres for 24
  hours, renewed hourly, in an httpOnly cookie with the `launchpad.` prefix.
- Security: only the Better Auth endpoints the app uses are reachable, and every other one is a 404
  even when signed in. Every field has a size cap, a field the forms do not have is refused, names
  and emails are stored trimmed, and a refusal is a sentence taken from the shared schemas. An auth
  request over 32 kb, or with no declared length, is refused before anything reads it. Two sign-ups
  for one new address at the same moment are taken in turn, so both answer like any repeated
  sign-up. A path the app does not list is refused before Better Auth sees it, so it costs no
  database row. A reset request has to name the reset page, which is the only page the token may
  land on. No more than 5 link messages go to one address in 15 minutes, whatever the address of the
  sender. Better Auth's own log lines print the message and leave out the error that comes with it.
  Tokens are removed from every JSON body. Sign-up, sign-in, reset, verification
  resend, and delete each have their own rate limit in the database. The address those limits count
  comes from one header that the API sets itself and a client cannot, and the proxy-hop setting now
  defaults to 0 because Next adds no hop. A repeated sign-up, a wrong password, and an unknown email
  each look like the ordinary case. A change from another site is refused, and the mail transport
  that prints links cannot start in production.
- Every route under `/api` needs a session, checked before a body is read, with `GET /api/me`
  returning only the id, name, and email. `/health` now asks the database a question.
- Tests: they run against the real test database, which is migrated once and emptied before each
  test, whatever tables exist, and only if the database is a local one named for this project's
  tests. They were written first, and then every protection was broken on purpose, one at a time
  (over 20 breakages), to prove that a test notices. The ones that did not fail were backed by a
  second line of defence, and a stronger break was caught.
- Two rounds of independent review of the diff, each a code review and a security review. The first
  found that a verification link signed in whoever opened it, that unlisted sign-up fields were
  stored and a name padded with spaces got past its cap, that an auth body of any size was read
  before it was checked, that two simultaneous sign-ups showed whether an address was new, that the
  tests could empty any database an environment variable named, and that the JSON parser ran before
  the session check outside the API. The second found that a reset request without a landing page
  made a dead link, that each unlisted auth path wrote a rate-limit row, that Better Auth's own
  error log lines could carry details, that a production host could leave the proxy count unset,
  that `NODE_ENV=test` outside the test runner would drop mail without a word, and that many
  messages could be sent to one address from changing addresses. All were fixed, with a test for
  each.
- CI: a Postgres service, the one Prisma install step that runs a script on purpose, then
  generating the client and applying migrations before verify and build. The Prisma command line
  is pinned to 7.x, because npm's default is an 8.0 release candidate.
- Found along the way: a badly typed web address setting reported only "Invalid URL", and a missing
  password reported Zod's own wording. Both now name the setting or say what to enter, with a test.
- Checked live through the web port with the real database: sign-up, the printed link, sign-in
  refused before verifying, the link opened through Next (which verified and signed nobody in), a
  sign-in after it, the cookie, `/api/me`, a refused extra field, a refused delete without the
  password, a delete with it, and no rows left behind.
- `npm run verify` and `npm run build` pass, with 367 tests (184 before). `npm audit` reports 0.
- Marked the app skeleton work done in `docs/SPRINTS.md` with this commit, as the workflow says.

## 6. Sign-in screens and the signed-in shell (Claude Code)

**Asked:**

Continue with the next piece of work and get the product working as soon as possible. Cut features
that are not essential and keep them planned for later, but cut no tests or reviews. The sign-in
screens are a centred card. The signed-in header has The pad and Settings only, and Sign out is on
Settings at every width. The sign-in path also gets an end-to-end test over HTTP that CI runs.

**What came back / what changed:**

- Screens: sign-up, sign-in, check-email with a resend, forgot-password, and reset-password, each a
  card that reflows from a phone to a desktop. A signed-in header, an empty pad, and Settings with
  the account and Sign out. The home page links to sign-up and sign-in, and sends a signed-in person
  to the pad.
- Words: every refusal is a sentence written for the screen. Better Auth's own wording never shows,
  and the only server text shown is the shared schemas' own sentences. Sign-in, forgot-password,
  and check-email answer every address the same way, and a wrong password or an unconfirmed address
  points to the password reset. A notice or an error in the page address shows only if it is on a
  fixed list.
- The redirect after sign-in: a `next` value is kept only when it is a page of this site, judged
  the way the browser and the server will read it. Control characters, backslashes, encoded
  slashes, another site, the API, Next's own files, and the sign-in pages themselves are refused,
  and the page the browser would really open is returned rather than the raw value, so "." and
  ".." cannot fold it into another site's address. A sign-in page with a trailing slash counts as
  a sign-in page.
- Links in emails: a verification link may land only on the sign-in page, and a reset link only on
  the reset page. Every request that asks for a link must name that page, and the API checks the
  landing page of a link before it follows it, so a link someone else wrote cannot send the person
  who opens it to another site, even when it fails. A failed link never says the address is
  confirmed.
- The proxy: a visitor with no session cookie is sent to sign in with the page to come back to,
  with no call to the API. With a cookie, it asks the API about the session, passes a renewed cookie
  back to the browser, and clears a dead one. It sends on only this app's cookies. When the API
  cannot be reached it lets the page decide, and every signed-in page checks the session itself. A
  test fails if a signed-in page is added without that check.
- The address of the API reaches server code from the build, the same way as the rewrites, so the
  two cannot disagree, and a test checks that it is not in the code sent to the browser.
- The session cookie's prefix is shared by the API and the web app.
- Accessibility: a skip link, one polite live region, and labelled fields whose hint and error are
  read with them. An error moves focus to itself, and a second press while a request is on its way
  does nothing. Forms post, so pressing Enter before the page is ready never puts a password in the
  address. The reset form takes the token out of the address bar once the page is ready, in a way
  that keeps Back working. The
  check-email screen reads the address from this tab only, never from the page address.
- Colours: the Twilight tokens, dark by default and light by the device setting, with two new
  tokens for button text and error text. Every pair was measured at 4.5:1 or better.
- Tests: written first for the redirect check, the cookie filter, and the proxy, then the screens,
  the pages, and the shell. Resending a verification link now has API tests too. The guarded
  database clear moved into its own file so the end-to-end test reuses it.
- End to end: the built API and web app start on a fresh test database. A new person signs up
  through the web app, opens the link the API prints, signs in, lands on the empty pad, keeps a
  renewed session, and signs out. A person who forgot their password asks for a link, opens it,
  sets a new one, and only the new one works. A signed-out visitor is sent to sign in, and a
  verification link someone else wrote is refused. The harness starts the API at the address the
  web build was made with, refuses a port that is in use, gives the servers only the settings it
  names, and empties only a local test database. CI runs it after the build.
- Forms: a second press while a request is on its way does nothing, a form can be sent again after
  a refusal, a press after success goes on to the next page again if its load was stopped, and a
  page brought back by the Back button is ready to use. Long addresses wrap on a phone.
- Three rounds of independent review, each a security review, a review of the tests, and a code
  review, by fresh agents. The first found that a `next` value with "." segments could become
  another site's address after sign-in, and that the reset form wiped the router's own history
  state. The second found that a verification link someone else wrote could send the browser to
  another site when it failed, because only Better Auth's own check looked at its landing page,
  and that a form came back busy from the back/forward cache. The third found that a request with
  no landing page was mailed a link that could not be opened. Each review also named tests that
  could not fail. All were fixed, each with a test.
- Every protection was broken on purpose, one at a time (over 100 breakages), to prove a test
  notices. Each was caught, apart from one check that only repeats another and is kept as a second
  line of defence.
- Checked live in a real browser at 390, 768, and 1280 pixels wide, in light and dark: every
  sign-in screen and the signed-in pad and Settings, 72 combinations with no sideways scroll, no
  console errors, no failed requests, no axe findings with contrast, 44-pixel tap targets, and a
  working Tab order.
- `npm run verify`, `npm run build`, and `npm run test:e2e` pass, with 553 tests (367 before) and
  12 end-to-end tests. No package was added or changed.

## 7. Account fixes after the first local run (Claude Code)

**Asked:**

After trying the app locally: signing up again with an address that already has an account looked
like it made a second account. Hide most of the email on Settings, and do the same for any
sensitive value shown later, with the name left as it is. A password reset should not accept the
current password, though only the most recent one needs checking. New passwords should include an
uppercase letter, a lowercase letter, and a number, and no spaces.

**What came back / what changed:**

- A second sign-up with the same address never made a second account: the address is unique, and
  the answer is the same as for a new address so that it does not show who has an account. The
  owner of the address is now mailed a notice instead: the sign-in page for a confirmed address,
  and the reset page for one that was never confirmed, since that account may be someone else's
  and a reset replaces their password. The notice is never a confirmation link. Notices have a
  count of their own, one per address in 15 minutes, so repeated sign-ups can neither flood a
  mailbox nor use up the reset and confirmation links the owner asks for. The check-email screen
  after sign-up says what happens in both cases, in the same words, and what to do if nothing
  comes.
- Sign-in answers an account whose address is not confirmed with exactly the answer a wrong
  password gets, and still mails a new link to the address. Before, someone could sign up with
  another person's address and a password of their own, then sign in with it: "not confirmed" meant
  the address had no account, and "wrong password" meant it had one. The sign-in message is now
  true in both cases, the notices on the sign-in page after a failed link say to sign in with the
  password to get a new one, and the separate "not confirmed yet" screen is gone.
- Settings shows the email masked, such as `an•••@e•••.com`. It is masked on the server, so the
  full address is not in the page, and a screen reader hears that it is partly hidden. A new rule
  says any sensitive value shown on a page later is masked the same way.
- New passwords have 12 to 128 characters, an uppercase letter, a lowercase letter, and a number.
  Spaces of any kind are refused, and so are control characters and characters that show as nothing
  or as a blank, while the joiners inside an emoji or a script are kept. Capitals, small letters,
  and digits from any script that has them count. The hint under the field lists the rules, and one
  message names everything a password is missing. Sign-in and account deletion do not judge a
  password, so an account made before the rules still works.
- A reset to the password the account already has is refused at the field with its own message.
  The link, the sessions, and the account stay as they were, so the person can type a different
  one. The check compares only with the account the link belongs to, and only for a link that is
  still good, whether its token comes in the body or the address.
- Accessibility: a form error on a field that already has focus, as after pressing Enter in it, is
  now announced, on every sign-in screen.
- Tests were written first for each change. Every protection was broken on purpose, one at a time
  (87 breakages), and a test caught each one. One more proved that the end-to-end test catches the
  full address reaching the Settings page's data. A break that no test noticed showed a line that
  had no effect, which was removed.
- Three rounds of independent review, each a security review, a review of the tests, and a code
  review, by fresh agents. The first found that signing up and then signing in could show whether
  an address had an account, and that notices shared a mail count with links, so a stranger could
  use up an owner's reset links. The second found that the sign-in message was untrue for an
  unconfirmed address, and that the test of the sign-in answer did not compare it byte for byte.
  The third found nothing serious. Smaller points from each round were fixed too, each with a test.
- Checked live in a real browser at 390, 768, and 1280 pixels wide, in light and dark: sign-up,
  sign-in with and without a failed-link notice, check-email, the reset page, and Settings, 36
  combinations with no sideways scroll, no console errors, no failed requests, no axe findings with
  contrast, 44-pixel tap targets, and a working Tab order.
- `npm run verify`, `npm run build`, and `npm run test:e2e` pass, with 710 tests (553 before) and
  14 end-to-end tests. No package was added or changed.
