import { beforeEach, vi } from "vitest";
import { claudeFake } from "../helpers/claude-fake.js";

// No test reaches Anthropic. The SDK's client is swapped for a stand-in in every test file, while
// its error classes stay the real ones, so the app's handling of them is tested as it runs.
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  const { FakeAnthropic } = await import("../helpers/claude-fake.js");
  return { ...real, default: FakeAnthropic, Anthropic: FakeAnthropic };
});

beforeEach(() => {
  claudeFake.reset();
});
