import type { NextFunction, Request, Response } from "express";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  badRequest,
  conflict,
  gatewayTimeout,
  HttpError,
  notFound,
  paymentRequired,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
} from "../src/errors/http-error.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { errorHandler } from "../src/middleware/error-handler.js";

// A small app whose only route throws what the test gives it, behind the real error handler.
function appThatThrows(thrown: unknown) {
  const app = express();
  app.get("/boom", () => {
    throw thrown;
  });
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpError helpers", () => {
  it.each([
    ["badRequest", badRequest, 400],
    ["unauthorized", unauthorized, 401],
    ["paymentRequired", paymentRequired, 402],
    ["notFound", notFound, 404],
    ["conflict", conflict, 409],
    ["tooManyRequests", tooManyRequests, 429],
    ["serviceUnavailable", serviceUnavailable, 503],
    ["gatewayTimeout", gatewayTimeout, 504],
  ] as const)("%s carries status %i", (_name, helper, status) => {
    const error = helper("A sentence.");
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(status);
    expect(error.message).toBe("A sentence.");
  });
});

describe("errorHandler", () => {
  it("sends an HttpError's status and sentence", async () => {
    const response = await request(
      appThatThrows(conflict("Add the Fuel tank before the Body.")),
    ).get("/boom");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Add the Fuel tank before the Body." });
  });

  it("answers a Zod failure with 400 and a path and message for each issue", async () => {
    const schema = z.object({ name: z.string().min(1), pitch: z.string() });
    const thrown = schema.safeParse({ name: "", pitch: 4 }).error;
    const response = await request(appThatThrows(thrown)).get("/boom");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Some of what you entered is not valid. Check it and try again.",
    );
    expect(response.body.details).toHaveLength(2);
    for (const detail of response.body.details) {
      expect(Object.keys(detail).sort()).toEqual(["message", "path"]);
    }
    expect(response.body.details.map((d: { path: string }) => d.path)).toEqual(["name", "pitch"]);
  });

  it("lists at most 8 issues", async () => {
    const shape = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}`, z.string()]));
    const thrown = z.object(shape).safeParse({}).error;
    const response = await request(appThatThrows(thrown)).get("/boom");
    expect(response.body.details).toHaveLength(8);
  });

  it("answers an unknown error with a generic 500 and logs the error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = new Error("connection string postgresql://user:hunter2@host/db refused");
    const response = await request(appThatThrows(thrown)).get("/boom");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Something went wrong on our side. Try again in a moment.",
    });
    expect(response.text).not.toContain("hunter2");
    expect(response.text).not.toMatch(/node_modules|\.ts:\d+/);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("logs only the class and code of an unknown error, never its message or stack", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = Object.assign(new TypeError("connection string with a password refused"), {
      code: "P2002",
    });
    await request(appThatThrows(thrown)).get("/boom");
    expect(log.mock.calls).toEqual([["Unexpected error: TypeError (P2002)"]]);
  });

  it("answers an address it cannot read with the 404 for any missing page, and logs nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = Object.assign(new URIError("Failed to decode param '%E0'"), { status: 400 });
    const response = await request(appThatThrows(thrown)).get("/boom");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Nothing was found at that address." });
    expect(log).not.toHaveBeenCalled();
  });

  it("hands the error on when the response has already started", () => {
    const next = vi.fn();
    const thrown = new Error("late");
    errorHandler(
      thrown,
      {} as Request,
      { headersSent: true } as unknown as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledWith(thrown);
  });
});

describe("a refusal from the database that a route did not catch", () => {
  const INVALID = "Some of what you entered is not valid. Check it and try again.";
  const CHANGED = "That changed while you were saving. Reload the page and try again.";
  const GONE = "That is no longer there. Reload the page.";

  // Shaped as Prisma 7 throws them through the Postgres adapter. The message and `meta` hold the
  // refused row, which must never reach the person or the log.
  function prismaError(code: string, originalCode?: string) {
    return new Prisma.PrismaClientKnownRequestError(
      "Database error. Failing row contains (secret-row-text)",
      {
        code,
        clientVersion: "7",
        meta: originalCode
          ? { driverAdapterError: { cause: { originalCode, detail: "secret-row-text" } } }
          : undefined,
      },
    );
  }

  it.each([
    ["a value over a cap", "P2000", undefined, 400, INVALID],
    ["a missing value", "P2011", undefined, 400, INVALID],
    ["a failed check", "P2039", "23514", 400, INVALID],
    ["a duplicate", "P2002", "23505", 409, CHANGED],
    ["two writes that collided", "P2034", "40001", 409, CHANGED],
    ["a row that is gone", "P2025", undefined, 404, GONE],
    ["a missing parent row", "P2003", "23503", 404, GONE],
  ] as const)(
    "answers %s with %i and a sentence of its own",
    async (_what, code, pg, status, sentence) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await request(appThatThrows(prismaError(code, pg))).get("/boom");
      expect(response.status).toBe(status);
      expect(response.body).toEqual({ error: sentence });
      expect(response.text).not.toContain("secret-row-text");
      expect(response.text).not.toMatch(/P20|2351|Database error/);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it("treats any other database error as a fault on our side, not as bad input", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const thrown of [
      prismaError("P2039", "P0001"),
      prismaError("P2039"),
      prismaError("P1001"),
    ]) {
      const response = await request(appThatThrows(thrown)).get("/boom");
      expect(response.status).toBe(500);
      expect(response.text).not.toContain("secret-row-text");
    }
    expect(log.mock.calls.flat().join("\n")).not.toContain("secret-row-text");
  });
});
