---
description: What to do before staging a sprint commit, and when asked "is this ready to commit?"
---

# Ready to commit

Before staging a sprint commit, review the work in that turn. Do not stage first and review after. Security and stability come before a green check. A hidden button is not access control: every query is scoped to the signed-in user, and a test must show that another user's rocket gets 404.

1. Re-read the code this sprint added or changed. Check who can reach each write, that a part and its session close together in one transaction, that a failed write leaves the data unchanged, and that the user's Claude key is never logged or returned.
2. Check the screen. A function is never staged without its screen, and a screen is never staged without its function.
3. Review the uncommitted diff for mistakes, secrets (Claude keys, `CREDENTIAL_KEY`, `BETTER_AUTH_SECRET`), local paths, the name of any private project, and files that must stay untracked (`.env`, generated Prisma code, `.public-check.local`).
4. Run `npm run verify` once it exists. If it fails and you cannot fix it, stop, say what fails, and do not stage.
5. Run `/code-review` on the diff. Sprints marked **xhigh** in `docs/SPRINTS.md` also get `/security-review`.
6. If something is wrong, fix it before staging.
7. Add or update this sprint's entry in `LOG.md`. Read it for personal details first.
8. Stage only the files that belong in the commit, including `LOG.md`.
9. Suggest a short commit message that says what changed, about 10 to 15 words. Go longer only when the commit is large or important enough to need it.
10. Do not create the commit. The user makes every commit and every push.

When the user asks whether the work is ready to commit, do this same check and the staging in that turn. Do not only answer yes or no.
