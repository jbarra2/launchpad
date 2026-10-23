---
description: This repository is public today. What must stay out of every tracked file and commit message.
---

# The repository is public

Anything tracked, and every commit message, is visible to anyone.

## Keep out

- The name of any private project or private repository. Say "my other project" if a reference is needed.
- Accounts, subscription or plan details, school or employer details, personal emails, and local paths (a path into a user folder).
- Real people, real inventory, and real task content in sample data. Sample data is fictional.
- Real secrets, including Claude API keys. In tests, use a made-up key shorter than 20 characters, or put `public-check: allow secret` on the line for a made-up example only.

## Where private terms live

Personal terms (your name, emails, the private project's name) go in `.public-check.local`, one per line. That file is local-only and is listed in `.git/info/exclude`, not in `.gitignore`. `npm run check:public` reads it and prints only the file, the line, and the rule, never the text. A personal term can never be waived.

## Writing

- Say what was fixed, not what is still open. A weakness that is not fixed yet stays in private notes, never in `LOG.md`, a code comment, or a commit message.
- Before writing a log entry, check that what you wrote about the asks and the results contains none of the above. Asks are summarized in plain words, not quoted. If a quote is ever used, redact the detail and mark the gap with `[…]`.
- A script that scans for these terms does not catch a name written in prose. Read what you write.

## Environment

- Secrets live in the environment. `.env` stays untracked, and `.env.example` stays tracked with every new variable name added to it.
- The app must start from `.env.example`, a seed of fictional data, and an account created through the app.
