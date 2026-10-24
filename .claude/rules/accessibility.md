---
description: Accessibility rules for every screen and component in the web app
paths:
  - "apps/web/**/*.tsx"
---

# Accessibility

- Every interactive control has a keyboard path and an accessible name.
- Use the shared pieces in `apps/web/components/a11y/` once Sprint 4 creates them: `FormField` for labelled inputs and errors, `LiveRegion` for announcements, and `SkipLink` as the first focusable element, pointing at `#main-content`.
- Announce changes that have no focus move: "Claude is thinking…", a new reply, a part attached, a key saved. Use `aria-live`, and do not move focus into the middle of a conversation.
- Status is text, never colour alone. "3 of 6 parts" is words, not just a filled icon.
- Navigation is `<nav aria-label>` with real links and `aria-current`. Do not build tablists from links.
- Anything that goes to another page is a link, not a `<button>`, so the address can be bookmarked. Style the link as a button when it should look like one.
- A table has `<th scope="col">` and a `<caption>`.
- The rocket illustration is `role="img"` with an `aria-label` that lists the attached parts.
- Phone, tablet, and desktop show the same actions. Do not hide a control behind hover or drop it at a narrow width.
- Touch targets are at least 44×44 CSS pixels.
- Keep a visible `:focus-visible` outline on everything that takes focus.
- Colour pairs reach 4.5:1 for text. See `web-ui.md` for the palette.
- Animations (the attach and the liftoff) stop under `prefers-reduced-motion: reduce`. The state still changes, with no movement.
- An empty list is `role="status"`. An API failure is `role="alert"`.
- Do not name a prop `role` (jsx-a11y rejects it).
- Every new component gets a `vitest-axe` assertion in its test.
