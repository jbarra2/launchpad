import { KEY_CHECKS_PER_HOUR } from "@launchpad/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEY_REJECTED_ON_SAVE, RATE_LIMITED } from "../src/lib/claude-errors.js";
import { decryptKey } from "../src/lib/credentials.js";
import { prisma } from "../src/lib/prisma.js";
import { createVerifiedUser, del, get, put } from "./helpers/auth.js";
import { PLANTED, sdkError, timeoutError } from "./helpers/claude-errors.js";
import { claudeFake } from "./helpers/claude-fake.js";
import { backendOf, lockWaitOrAnswer } from "./helpers/locks.js";

// Made-up keys, short enough that they cannot be mistaken for real ones.
const KEY = "sk-ant-good-1234";
const OTHER_KEY = "sk-ant-next-9876";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every console line written while `run` runs, as one string. */
async function logsDuring(run: () => Promise<unknown>): Promise<string> {
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  let calls: unknown[] = [];
  try {
    await run();
  } finally {
    // Restoring a spy empties its record, so the calls are copied first.
    calls = spies.map((spy) => [...spy.mock.calls]);
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
  return JSON.stringify(calls);
}

async function saveKey(cookie: string, key = KEY) {
  claudeFake.acceptKey();
  return put("/api/me/api-key", { key }, { cookie });
}

describe("saving a Claude key", () => {
  it("checks it with Anthropic using that key, stores it sealed, and answers with its end only", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const response = await saveKey(ana.cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "valid",
      last4: "1234",
      checkedAt: expect.any(String),
    });
    expect(response.text).not.toContain(KEY);
    expect(claudeFake.clients).toEqual([expect.objectContaining({ apiKey: KEY })]);
    expect(claudeFake.requests.map((r) => r.endpoint)).toEqual(["models"]);

    const row = await prisma.apiCredential.findUniqueOrThrow({ where: { userId: ana.userId } });
    expect(Buffer.from(row.ciphertext).includes(KEY)).toBe(false);
    expect(row).toMatchObject({ last4: "1234", status: "VALID", keyVersion: 1 });
    expect(decryptKey(ana.userId, row)).toBe(KEY);
  });

  it("shows on /api/me as its status and last 4 characters, never the key", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    expect((await get("/api/me", { cookie: ana.cookie })).body.apiKey).toEqual({
      status: "none",
    });
    await saveKey(ana.cookie);
    const me = await get("/api/me", { cookie: ana.cookie });
    expect(me.body.apiKey).toEqual({
      status: "valid",
      last4: "1234",
      checkedAt: expect.any(String),
    });
    expect(me.text).not.toContain(KEY);
    expect(me.text).not.toContain("ciphertext");
  });

  it("shows as no longer working once it was saved under another key version", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await saveKey(ana.cookie);
    await prisma.apiCredential.updateMany({ data: { keyVersion: 2 } });
    expect((await get("/api/me", { cookie: ana.cookie })).body.apiKey).toMatchObject({
      status: "invalid",
      last4: "1234",
    });
  });

  it("replaces a key Anthropic stopped accepting, and the new one works", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await saveKey(ana.cookie);
    await prisma.apiCredential.updateMany({ data: { status: "INVALID" } });
    const response = await saveKey(ana.cookie, OTHER_KEY);
    expect(response.body.status).toBe("valid");
    expect((await prisma.apiCredential.findFirstOrThrow()).status).toBe("VALID");
  });

  it("replaces the saved key, keeping one row", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await saveKey(ana.cookie);
    const response = await saveKey(ana.cookie, OTHER_KEY);
    expect(response.body.last4).toBe("9876");
    const rows = await prisma.apiCredential.findMany();
    expect(rows).toHaveLength(1);
    expect(decryptKey(ana.userId, rows[0]!)).toBe(OTHER_KEY);
  });

  it("is one person's: another person sees no key", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com");
    await saveKey(ana.cookie);
    expect((await get("/api/me", { cookie: ben.cookie })).body.apiKey).toEqual({ status: "none" });
  });
});

describe("a key Anthropic does not accept", () => {
  it("is refused with a sentence and not stored", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    claudeFake.fail(sdkError(401, "authentication_error"));
    const response = await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: KEY_REJECTED_ON_SAVE });
    expect(response.text).not.toContain(KEY);
    expect(response.text).not.toContain(PLANTED);
    expect(await prisma.apiCredential.count()).toBe(0);
  });

  it("leaves a key saved earlier as it was", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await saveKey(ana.cookie);
    const before = await prisma.apiCredential.findUniqueOrThrow({ where: { userId: ana.userId } });
    claudeFake.fail(sdkError(401, "authentication_error"));
    expect((await put("/api/me/api-key", { key: OTHER_KEY }, { cookie: ana.cookie })).status).toBe(
      400,
    );
    const after = await prisma.apiCredential.findUniqueOrThrow({ where: { userId: ana.userId } });
    expect(after).toEqual(before);
  });

  it("is not stored when the check cannot finish either", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    claudeFake.fail(sdkError(429, "rate_limit_error"));
    const limited = await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITED });
    claudeFake.fail(sdkError(529, "overloaded_error"));
    expect((await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie })).status).toBe(503);
    claudeFake.fail(timeoutError());
    expect((await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie })).status).toBe(504);
    expect(await prisma.apiCredential.count()).toBe(0);
  });
});

describe("a body that is not one key", () => {
  it("is refused before Anthropic is asked, and the answer never repeats it", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    for (const body of [
      {},
      { key: "" },
      { key: "sk-ant-good 1234" },
      { key: "not-a-key" },
      { key: KEY, userId: "someone-else" },
    ]) {
      const response = await put("/api/me/api-key", body, { cookie: ana.cookie });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.text).not.toContain("sk-ant-good");
    }
    expect(claudeFake.requests).toHaveLength(0);
    expect(await prisma.apiCredential.count()).toBe(0);
    expect(await prisma.keyCheck.count()).toBe(0);
  });
});

describe("checking keys over and over", () => {
  it("is capped per person per hour, counting keys that were refused too", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    for (let i = 0; i < KEY_CHECKS_PER_HOUR; i += 1) {
      claudeFake.fail(sdkError(401, "authentication_error"));
      expect((await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie })).status).toBe(400);
    }
    const capped = await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie });
    expect(capped.status).toBe(429);
    expect(capped.body.error).toBe(
      "You have checked a key 10 times in the last hour, the most allowed. Try again later.",
    );
    expect(claudeFake.requests).toHaveLength(KEY_CHECKS_PER_HOUR);
  });

  it("cannot pass the cap with checks sent at the same moment", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await prisma.keyCheck.createMany({
      data: Array.from({ length: KEY_CHECKS_PER_HOUR - 1 }, () => ({ userId: ana.userId })),
    });
    for (let i = 0; i < 5; i += 1) {
      claudeFake.fail(sdkError(401, "authentication_error"));
    }
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie })),
    );
    expect(answers.map((r) => r.status).sort()).toEqual([400, 429, 429, 429, 429]);
    expect(await prisma.keyCheck.count()).toBe(KEY_CHECKS_PER_HOUR);
  });

  it("makes a check wait for one already under way, so the cap holds when two arrive at once", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await prisma.keyCheck.createMany({
      data: Array.from({ length: KEY_CHECKS_PER_HOUR - 1 }, () => ({ userId: ana.userId })),
    });
    let answered = false;
    let pending: Promise<{ status: number }> | undefined;
    await prisma.$transaction(
      async (tx) => {
        // Another check, part way through: it holds the person's row and has counted the 10th.
        await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${ana.userId} FOR SHARE`;
        await tx.keyCheck.create({ data: { userId: ana.userId } });
        const holder = await backendOf(tx);
        pending = put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie }).then((r) => {
          answered = true;
          return r;
        });
        await lockWaitOrAnswer(() => answered, { blockedBy: holder });
        // Without the lock it would have counted 9 and asked Anthropic.
        expect(answered).toBe(false);
      },
      { timeout: 15_000 },
    );
    expect((await pending)?.status).toBe(429);
    expect(claudeFake.requests).toHaveLength(0);
  });

  it("counts every check from the last hour, not only the last few minutes", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await prisma.keyCheck.createMany({
      data: Array.from({ length: KEY_CHECKS_PER_HOUR }, () => ({
        userId: ana.userId,
        createdAt: new Date(Date.now() - 59 * 60 * 1000),
      })),
    });
    expect((await put("/api/me/api-key", { key: KEY }, { cookie: ana.cookie })).status).toBe(429);
    expect(claudeFake.requests).toHaveLength(0);
  });

  it("counts only the last hour, and only this person", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com");
    const anHourAgo = new Date(Date.now() - 61 * 60 * 1000);
    await prisma.keyCheck.createMany({
      data: Array.from({ length: KEY_CHECKS_PER_HOUR }, () => ({
        userId: ana.userId,
        createdAt: anHourAgo,
      })),
    });
    await prisma.keyCheck.createMany({
      data: Array.from({ length: KEY_CHECKS_PER_HOUR }, () => ({ userId: ben.userId })),
    });
    expect((await saveKey(ana.cookie)).status).toBe(200);
  });
});

describe("removing the key", () => {
  it("deletes the row, and can be asked again", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await saveKey(ana.cookie);
    expect((await del("/api/me/api-key", { cookie: ana.cookie })).status).toBe(204);
    expect(await prisma.apiCredential.count()).toBe(0);
    expect((await get("/api/me", { cookie: ana.cookie })).body.apiKey).toEqual({ status: "none" });
    expect((await del("/api/me/api-key", { cookie: ana.cookie })).status).toBe(204);
  });

  it("removes only the person's own key", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com");
    await saveKey(ana.cookie);
    await del("/api/me/api-key", { cookie: ben.cookie });
    expect(await prisma.apiCredential.count()).toBe(1);
  });
});

describe("who may save or remove a key", () => {
  it("is only someone signed in, from the web app", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    expect((await put("/api/me/api-key", { key: KEY })).status).toBe(401);
    expect((await del("/api/me/api-key")).status).toBe(401);
    const foreign = { cookie: ana.cookie, origin: "https://evil.example" };
    expect((await put("/api/me/api-key", { key: KEY }, foreign)).status).toBe(403);
    expect((await del("/api/me/api-key", foreign)).status).toBe(403);
    expect(claudeFake.requests).toHaveLength(0);
  });
});

describe("the key in the log", () => {
  it("never appears, whether the key is saved, refused, or the check goes wrong", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const logs = await logsDuring(async () => {
      await saveKey(ana.cookie);
      claudeFake.fail(sdkError(401, "authentication_error"));
      await put("/api/me/api-key", { key: OTHER_KEY }, { cookie: ana.cookie });
      claudeFake.fail(sdkError(400, "invalid_request_error"));
      await put("/api/me/api-key", { key: OTHER_KEY }, { cookie: ana.cookie });
      await put("/api/me/api-key", { key: `${KEY} oops` }, { cookie: ana.cookie });
      await get("/api/me", { cookie: ana.cookie });
    });
    // The log is really read: the one line the bad request writes is there.
    expect(logs).toContain("Claude call failed: BadRequestError (400)");
    expect(logs).not.toContain("sk-ant");
    expect(logs).not.toContain(PLANTED);
  });
});
