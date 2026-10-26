import { afterEach, describe, expect, it, vi } from "vitest";
import { mailer, makeMailer, outbox, throttleMailer, type Mail } from "../src/lib/mailer.js";

const mail = {
  kind: "password-reset",
  to: "ana@example.com",
  url: "http://localhost:3100/api/auth/reset-password/abc",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("makeMailer", () => {
  it("keeps mail in the outbox under test, so a test reads the link and nothing is printed", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await makeMailer("test", "console").send(mail);
    expect(outbox).toEqual([mail]);
    expect(log).not.toHaveBeenCalled();
  });

  it("prints the link in the API terminal during development", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await makeMailer("development", "console").send(mail);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain(mail.url);
    expect(outbox).toEqual([]);
  });

  it("refuses to print links in production, even if the settings check were skipped", () => {
    expect(() => makeMailer("production", "console")).toThrow(/production/);
  });
});

describe("throttleMailer", () => {
  const to = (address: string): Mail => ({ ...mail, to: address });
  const MINUTE = 60_000;

  function setup(max = 3, windowMs = 15 * MINUTE) {
    const sent: Mail[] = [];
    let now = 0;
    const mailer = throttleMailer(
      {
        send(message) {
          sent.push(message);
        },
      },
      { max, windowMs, now: () => now },
    );
    return { mailer, sent, advance: (ms: number) => (now += ms) };
  }

  it("sends up to the limit to one address and drops the rest, without an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mailer, sent } = setup(3);
    for (let i = 0; i < 6; i += 1) {
      await mailer.send(to("ana@example.com"));
    }
    expect(sent).toHaveLength(3);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("never puts the address in the log line about a dropped message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mailer } = setup(1);
    await mailer.send(to("ana@example.com"));
    await mailer.send(to("ana@example.com"));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("ana@example.com");
  });

  it("counts each address on its own, whatever the case", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mailer, sent } = setup(1);
    await mailer.send(to("ana@example.com"));
    await mailer.send(to("ANA@Example.com"));
    await mailer.send(to("ben@example.com"));
    expect(sent.map((message) => message.to)).toEqual(["ana@example.com", "ben@example.com"]);
  });

  it("starts counting again once the window has passed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mailer, sent, advance } = setup(2, 15 * MINUTE);
    await mailer.send(to("ana@example.com"));
    await mailer.send(to("ana@example.com"));
    await mailer.send(to("ana@example.com"));
    expect(sent).toHaveLength(2);
    advance(15 * MINUTE + 1);
    await mailer.send(to("ana@example.com"));
    expect(sent).toHaveLength(3);
  });

  it("counts a message to any kind of link toward the same limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mailer, sent } = setup(2);
    await mailer.send({ ...to("ana@example.com"), kind: "email-verification" });
    await mailer.send({ ...to("ana@example.com"), kind: "password-reset" });
    await mailer.send({ ...to("ana@example.com"), kind: "email-verification" });
    expect(sent).toHaveLength(2);
  });

  it("forgets every count when reset", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mailer, sent } = setup(1);
    await mailer.send(to("ana@example.com"));
    mailer.reset();
    await mailer.send(to("ana@example.com"));
    expect(sent).toHaveLength(2);
  });
});

describe("the mailer the app uses", () => {
  it("sends at most 5 messages to one address in 15 minutes, and drops the rest without an error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 8; i += 1) {
      await mailer.send({ ...mail, to: "flood@example.com" });
    }
    expect(outbox.filter((message) => message.to === "flood@example.com")).toHaveLength(5);
    await mailer.send({ ...mail, to: "someone-else@example.com" });
    expect(outbox.filter((message) => message.to === "someone-else@example.com")).toHaveLength(1);
  });
});
