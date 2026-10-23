# How the work is done

This file is about process. `MASTER_PLAN.md` says what the product is, and `SPRINTS.md` says what to build in what order. This file is not a sprint log: `LOG.md` records what was asked and what changed.

## Who does what

I decide. The assistant implements, reviews, and stages. I make the commit and the push unless I explicitly say otherwise.

Before a commit I ask for a review of the diff. That review happens before anything is staged. `.claude/rules/ready-to-commit.md` has the steps.

## Review stops

I want a stop for decisions about who can do what, what is stored, and what ships before launch. I do not want a stop for a choice the plan already made.

When there are real options, put the recommended one first with the reason in parentheses, and leave the decision to me. Ask at the moment the decision comes up, with the question tool, not in a list at the end of a summary.

## Full review

At a natural break I stop new work for a full review of the whole codebase, committed on its own. One multi-reviewer round is enough. If it finds a real bug, fix it and prove the fix. Do not start another full round without asking, and say what another round would cover and roughly how long it would take.

## What done means

A sprint is done when all of these are true:

- The sprint's **Done when** is true.
- `npm run verify` passes. Sprint 1 has no verify script, and its own check applies. From Sprint 2a on, `npm run verify` is part of done.
- The sprint's commit is in and pushed, and the GitHub check on `develop` is green. Sprint 1 has no CI yet, so its commit alone is enough.
- For UI sprints, the screen has been walked at phone (390), tablet (768), and desktop (1280) widths, including with the keyboard.

A function is not done until its screen is. I do not start the next sprint while the current check is red.

## Time

Three days is short. Before any long job (a full test run, a browser walk, several agents), say roughly how long it will take. If `npm run verify` is red at the end of a session, do not start the next sprint. Fix or revert.

## Notes for later work

When a review or a build turns up something a later sprint must handle, save it to the project's memory notes in the same turn, with a **Why:** and a **How to apply:** that name the sprint it matters for. Do not leave it only in the chat. Delete the note once the work that handled it is committed. Keep it out of the repository: this repository is public.

## Close out for today

When I say "Close out for today", the assistant gets the project ready for a new session and then stops. It starts no new development, not even the next sprint.

- It checks the tree: `git status`, the latest commits, and whether `develop` is pushed. It does not commit or push.
- It reads the GitHub check on `develop` with `gh run list --branch develop`. If the sprint's commit is in and the check is green (Sprint 1 has no check, so its commit alone is enough), it marks the sprint done in `docs/SPRINTS.md`: a dated status line under the sprint heading, the progress line at the top, and the map table. If the commit is not in, or the check is red or still running, it says so and marks nothing.
- It rewrites the memory note "where we left off", replacing the last one: the branch and latest commit, what is done, what is uncommitted, the next piece of work and its **Done when**, every decision waiting on me, and anything the repo does not record, such as a limit I accepted. Design belongs in `MASTER_PLAN.md` and `SPRINTS.md`, not in the note.
- It stages only the documents it changed while closing out and suggests a short message. I make the commit.
- It ends with a short handoff: where things stand, what is waiting on me, and the first thing to do next session.

At the start of the next session the assistant reads that note first, runs `git status` and `git log` to confirm the tree matches it, and waits for me to say what to work on.
