import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// A person's Claude key is stored only in this sealed form: AES-256-GCM under CREDENTIAL_KEY, with
// a new random IV for every write and the person's id as the associated data, so a row copied to
// another person cannot be opened. The key is opened only inside the call that needs it.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedKey {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  tag: Uint8Array<ArrayBuffer>;
  keyVersion: number;
}

/** A saved key that cannot be opened: changed, copied, or sealed under another version. */
export class UnreadableKeyError extends Error {
  constructor() {
    super("The saved Claude key could not be read.");
    this.name = "UnreadableKeyError";
  }
}

const secret = () => Buffer.from(env.CREDENTIAL_KEY, "base64");
const associatedData = (userId: string) => Buffer.from(userId, "utf8");
const bytes = (buffer: Buffer) => Uint8Array.from(buffer);

export function encryptKey(userId: string, key: string): SealedKey {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, secret(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(associatedData(userId));
  const ciphertext = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return {
    ciphertext: bytes(ciphertext),
    iv: bytes(iv),
    tag: bytes(cipher.getAuthTag()),
    keyVersion: env.CREDENTIAL_KEY_VERSION,
  };
}

export function decryptKey(userId: string, sealed: SealedKey): string {
  if (sealed.keyVersion !== env.CREDENTIAL_KEY_VERSION) {
    throw new UnreadableKeyError();
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, secret(), sealed.iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(associatedData(userId));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Node's own message says only that the check failed, but nothing of it is passed on.
    throw new UnreadableKeyError();
  }
}
