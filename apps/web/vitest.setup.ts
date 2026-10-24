import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import * as matchers from "vitest-axe/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

expect.extend(matchers);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
