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
