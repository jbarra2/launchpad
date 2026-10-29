import { describe, expect, it } from "vitest";
import { decryptKey, encryptKey, UnreadableKeyError } from "../src/lib/credentials.js";

// A made-up key, short enough that it cannot be mistaken for a real one.
const KEY = "sk-ant-good-1234";

const flip = (bytes: Uint8Array, at = 0) => {
  const copy = Uint8Array.from(bytes);
  copy[at] = (copy[at] ?? 0) ^ 1;
  return copy;
};

describe("a saved key", () => {
  it("comes back for the person it was saved for", () => {
    expect(decryptKey("ana", encryptKey("ana", KEY))).toBe(KEY);
  });

  it("is not stored as the key, in any of the stored fields", () => {
    const sealed = encryptKey("ana", KEY);
    for (const field of [sealed.ciphertext, sealed.iv, sealed.tag]) {
      const text = Buffer.from(field);
      expect(text.includes(KEY)).toBe(false);
      expect(text.toString("latin1")).not.toContain("sk-ant");
    }
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
  });

  it("uses a new IV every time, so the same key never looks the same twice", () => {
    const first = encryptKey("ana", KEY);
    const second = encryptKey("ana", KEY);
    expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
  });

  it("cannot be read as another person's, because their id is the associated data", () => {
    const sealed = encryptKey("ana", KEY);
    expect(() => decryptKey("ben", sealed)).toThrow(UnreadableKeyError);
  });

  it("cannot be read once any stored byte is changed", () => {
    const sealed = encryptKey("ana", KEY);
    expect(() => decryptKey("ana", { ...sealed, ciphertext: flip(sealed.ciphertext) })).toThrow(
      UnreadableKeyError,
    );
    expect(() => decryptKey("ana", { ...sealed, iv: flip(sealed.iv) })).toThrow(UnreadableKeyError);
    expect(() => decryptKey("ana", { ...sealed, tag: flip(sealed.tag, 15) })).toThrow(
      UnreadableKeyError,
    );
  });

  it("is not read under another key version, and says so without any of the key", () => {
    const sealed = encryptKey("ana", KEY);
    expect(sealed.keyVersion).toBe(1);
    let caught: unknown;
    try {
      decryptKey("ana", { ...sealed, keyVersion: 2 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnreadableKeyError);
    expect(String((caught as Error).message)).not.toContain("sk-ant");
    expect(JSON.stringify(caught)).not.toContain("sk-ant");
  });
});
