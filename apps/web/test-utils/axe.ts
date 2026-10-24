import { configureAxe } from "vitest-axe";

// jsdom has no canvas and no layout, so axe cannot measure colour contrast here and prints an error
// for every piece of text. Contrast is checked on the colour tokens (see web-ui.md) and in the
// browser walk at 390, 768, and 1280. Every other axe rule stays on.
export const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
