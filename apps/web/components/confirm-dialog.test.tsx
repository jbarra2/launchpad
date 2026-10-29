import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { ConfirmDialog } from "./confirm-dialog";

function setup(onConfirm = vi.fn(async () => null as string | null)) {
  const result = render(
    <ConfirmDialog
      trigger="Delete idea"
      title="Delete Recipe Swap?"
      confirmLabel="Delete idea"
      busyLabel="Deleting…"
      danger
      description={<p>This cannot be undone.</p>}
      onConfirm={onConfirm}
    />,
  );
  const dialog = result.container.querySelector("dialog")!;
  return { ...result, dialog, onConfirm };
}

describe("ConfirmDialog", () => {
  it("opens from its button, named by its title, with Cancel before the action", async () => {
    const { container, dialog } = setup();
    expect(dialog.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAccessibleName("Delete Recipe Swap?");
    // A screen reader reads the description out when the dialog opens, wherever focus lands.
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    const buttons = [...dialog.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Cancel", "Delete idea"]);
    // The action never takes focus by itself, so a stray Enter cannot confirm it. Where focus
    // lands in a real browser (Cancel) is checked in the browser walk.
    expect(dialog.querySelector('button[type="submit"]')).not.toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps its fields out of the description", () => {
    render(
      <ConfirmDialog
        trigger="Delete account…"
        title="Delete your account?"
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        description={<p>It cannot be undone.</p>}
        onConfirm={vi.fn(async () => null)}
      >
        <label>
          Password
          <input name="password" type="password" defaultValue="typed-here" />
        </label>
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    expect(dialog).toHaveAccessibleDescription("It cannot be undone.");
    expect(within(dialog).getByLabelText("Password")).toBeInTheDocument();
  });

  it("closes on Cancel and does nothing else", () => {
    const { dialog, onConfirm } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    expect(dialog.open).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action once however often it is pressed, and stays busy while the page moves on", async () => {
    let finish: (value: string | null) => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve;
        }),
    );
    const { dialog } = setup(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    const form = dialog.querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
    expect(dialog.querySelector('button[type="submit"]')).toHaveTextContent("Deleting…");
  });

  it("shows the sentence it is given when the action fails, as an alert, and clears it on close", async () => {
    const { dialog } = setup(vi.fn(async () => "We could not delete it. Try again."));
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    expect(dialog.querySelector('[role="alert"]')).toHaveTextContent(
      "We could not delete it. Try again.",
    );
    expect(dialog.querySelector('button[type="submit"]')).toHaveTextContent("Delete idea");
    act(() => dialog.close());
    expect(dialog.querySelector('[role="alert"]')).toBeEmptyDOMElement();
  });

  it("opens as a modal, so the page behind it cannot be reached", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it("can run the action again after a failure", async () => {
    const onConfirm = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("We could not delete it. Try again.")
      .mockResolvedValueOnce(null);
    const { dialog } = setup(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("is usable again when the Back button brings the page back after it went on", async () => {
    const onConfirm = vi.fn(async () => null as string | null);
    const { dialog } = setup(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    expect(dialog.querySelector('button[type="submit"]')).toHaveTextContent("Deleting…");
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    expect(dialog.open).toBe(false);
    expect(dialog.querySelector('button[type="submit"]')).toHaveTextContent("Delete idea");
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
