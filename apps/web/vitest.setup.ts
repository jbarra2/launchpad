import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import * as matchers from "vitest-axe/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

expect.extend(matchers);

// jsdom has the dialog element but not its methods. This stand-in opens and closes it the way a
// browser does, including the close event, so the confirm dialogs can be tested. The browser walk
// checks the real thing.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (this.open) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // The node-environment tests (the proxy) have no sessionStorage.
  globalThis.sessionStorage?.clear();
  vi.clearAllMocks();
});
