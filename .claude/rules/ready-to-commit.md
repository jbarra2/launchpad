---
description: What to do before staging a sprint commit, and when asked "is this ready to commit?"
---

# Ready to commit

Before staging a sprint commit, review the work in that turn. Do not stage first and review after. Security and stability come before a green check. A hidden button is not access control: every query is scoped to the signed-in user, and a test must show that another user's rocket gets 404.

1. Re-read the code this sprint added or changed. Check who can reach each write, that a part and its session close together in one transaction, that a failed write leaves the data unchanged, and that the user's Claude key is never logged or returned.
2. Check the screen. A function is never staged without its screen, and a screen is never staged without its function. The assistant walks the screen in a real browser at phone (390), tablet (768), and desktop (1280) widths, in light and dark, with the keyboard, and checks for sideways scroll, console errors, failed requests, tap targets, and accessibility including contrast. What looks and feels right is still for me to judge.
3. Review the uncommitted diff for mistakes, secrets (Claude keys, `CREDENTIAL_KEY`, `BETTER_AUTH_SECRET`), local paths, the name of any private project, and files that must stay untracked (`.env`, generated Prisma code, `.public-check.local`).
4. Run `npm run verify` once it exists. If it fails and you cannot fix it, stop, say what fails, and do not stage.
5. Review to the depth the change's risk calls for. An ordinary sprint gets `/code-review` once. A sprint marked **xhigh** in `docs/SPRINTS.md`, and any sprint that touches sign-in, permissions, keys, deleting data, public endpoints, or dependencies, gets the full set: abuse cases written as tests before building, a mutation check of each protection (break it on purpose and see a test fail), an independent security review and a review of the tests, and a repeat of the reviews until a round finds nothing High or Medium (at most 3 rounds, then ask me).
6. If something is wrong, fix it before staging.
7. Add or update this sprint's entry in `LOG.md`. Read it for personal details first.
8. Stage only the files that belong in the commit, including `LOG.md`. Then check what will be committed, not only the working tree, which can differ: run the public-repo rules (the `findProblems` export of `scripts/check-public.mjs`, with the terms in `.public-check.local`) over every staged file as the index holds it, and list any staged file that must stay untracked. If anything turns up, unstage or fix it before going on.
9. Suggest a short commit message that says what changed, about 10 to 15 words. Run the same rules over the message, and keep sprint names out of it. Go longer only when the commit is large or important enough to need it. Then give a Push check in about a dozen lines: what changed, the evidence (the gate and its test count, the new tests and mutation results, the live run, the review rounds and what they fixed), what was not verified, what still needs my own testing, the residual risk, and whether it is safe to push.
10. Do not create the commit. The user makes every commit and every push.
11. After the user says they pushed, run the same rules over every commit the push added, files and messages both, then read the CI run. A finding there is already public, so say so at once and ask what to do.

When the user asks whether the work is ready to commit, do this same check and the staging in that turn. Do not only answer yes or no.
