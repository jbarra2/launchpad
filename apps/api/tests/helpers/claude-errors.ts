import { APIConnectionError, APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";

// The SDK's own error classes, made the way the SDK makes them from a response, so a test throws
// exactly what a real call would. The message planted in each one must never reach a person.

export const PLANTED = "planted-sdk-message-with-sk-ant-leak";

export function sdkError(status: number, type = "api_error", message = PLANTED): APIError {
  return APIError.generate(
    status,
    { type: "error", error: { type, message } },
    undefined,
    new Headers({ "request-id": "req_fake" }),
  );
}

export const timeoutError = () => new APIConnectionTimeoutError({ message: PLANTED });
export const connectionError = () => new APIConnectionError({ message: PLANTED });
