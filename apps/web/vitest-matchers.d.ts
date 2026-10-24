import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import type { AxeMatchers } from "vitest-axe";

// Vitest 4 extends `Matchers`. The type files that jest-dom and vitest-axe ship still extend
// `Assertion`, which no longer picks them up, so the matchers are declared here.
declare module "vitest" {
  interface Matchers<T = any> extends TestingLibraryMatchers<any, T>, AxeMatchers {}
}
