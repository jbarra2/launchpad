---
description: Styling, colour tokens, and the phone and desktop layout for the web app
paths:
  - "apps/web/**/*.tsx"
  - "apps/web/**/*.css"
---

# Web UI

## Styling

- Plain CSS in `apps/web/app/globals.css`. No Tailwind, no CSS modules, and no UI or state library.
- Colours are tokens in `:root`: `--bg`, `--surface`, `--text`, `--muted`, `--accent`, and `--accent-2`. The device's setting picks dark or light with `prefers-color-scheme`, and light remaps the same tokens.
- The Twilight values are in `docs/MASTER_PLAN.md`. Check any new colour pair for 4.5:1 before using it.
- `--accent-2` and the purple-to-blue gradient are decoration only, used on the rocket. Never put text on the gradient, and never use `--accent-2` for text.
- Buttons are solid `--accent`, with dark text in dark mode and white text in light mode.
- Claude's replies are plain text with `white-space: pre-wrap`.

## Layout

- One layout that reflows.
  - Under 48rem: one column.
  - Tablet: the rocket above the chat.
  - From 64rem: the rocket column beside the chat.
- On a phone, a session is a full-screen chat at `/rockets/[id]/session`, with a back arrow. After a part is attached the user returns to the rocket page, where it slides into place.
- The chat composer is sticky with `padding-bottom: env(safe-area-inset-bottom)`. The page uses `100dvh`, and the viewport export sets `interactiveWidget: "resizes-content"` so the keyboard does not cover the input.
- Inputs use 16px text so iOS does not zoom.
- On a touch screen (`pointer: coarse`) Enter adds a new line and Send sends. On desktop Enter sends and Shift+Enter adds a new line.

## Words on screen

The words on screen do not name npm, Postgres, the API, or a server command. They say what happened and what to do next.

## Checking

Walk every UI change at 390, 768, and 1280 pixels wide before marking a sprint done.
