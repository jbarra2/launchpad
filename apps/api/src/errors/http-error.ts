// A message names the thing and the next step. It never names npm, Postgres, the API, or a server
// command. See .claude/rules/http-errors.md. Throw the result: `throw notFound("...")`.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
// Only for a request that comes from another site. Someone else's data is a 404, never a 403.
export const forbidden = (message: string) => new HttpError(403, message);
export const paymentRequired = (message: string) => new HttpError(402, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const tooManyRequests = (message: string) => new HttpError(429, message);
export const serviceUnavailable = (message: string) => new HttpError(503, message);
export const gatewayTimeout = (message: string) => new HttpError(504, message);
