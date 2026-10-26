import { afterEach, describe, expect, it, vi } from "vitest";
import { heldSignUps, lockSignUp, unlockSignUp } from "../src/lib/sign-up-lock.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("the sign-up lock", () => {
  it("lets sign-ups for different addresses run at the same time", async () => {
    const a = {};
    const b = {};
    await lockSignUp(a, "a@example.com");
    await lockSignUp(b, "b@example.com");
    unlockSignUp(a);
    unlockSignUp(b);
  });

  it("makes a second sign-up for the same address wait until the first lets go", async () => {
    const order: string[] = [];
    const first = {};
    const second = {};
    await lockSignUp(first, "a@example.com");
    const waiting = lockSignUp(second, "a@example.com").then(() => order.push("second got it"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([]);
    order.push("first lets go");
    unlockSignUp(first);
    await waiting;
    expect(order).toEqual(["first lets go", "second got it"]);
    unlockSignUp(second);
  });

  it("serves three sign-ups for one address in the order they came", async () => {
    const order: number[] = [];
    const owners = [{}, {}, {}];
    const runs = owners.map(async (owner, index) => {
      await lockSignUp(owner, "a@example.com");
      order.push(index);
      await new Promise((resolve) => setTimeout(resolve, 5));
      unlockSignUp(owner);
    });
    await Promise.all(runs);
    expect(order).toEqual([0, 1, 2]);
  });

  it("forgets an address once nobody holds or waits for it", async () => {
    const owner = {};
    await lockSignUp(owner, "a@example.com");
    expect(heldSignUps()).toBe(1);
    unlockSignUp(owner);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(heldSignUps()).toBe(0);
  });

  it("gives an address back by itself if a sign-up never does", async () => {
    vi.useFakeTimers();
    const stuck = {};
    const next = {};
    await lockSignUp(stuck, "a@example.com");
    let got = false;
    const waiting = lockSignUp(next, "a@example.com").then(() => {
      got = true;
    });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(got).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await waiting;
    expect(got).toBe(true);
    unlockSignUp(next);
  });

  it("does nothing when an owner that holds nothing lets go", () => {
    expect(() => unlockSignUp({})).not.toThrow();
  });
});
