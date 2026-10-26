// What Better Auth's logger prints. It hands over an error object next to its message, and that
// object can hold a connection string, a query, an email, or a password hash. Only the message is
// printed, and for an error the message is the error's name. Nothing below a warning is printed,
// because some of those lines name an email address.
export function authLog(level: string, message: string, ..._details: unknown[]): void {
  if (level === "error") {
    console.error(`[auth] ${message}`);
  } else if (level === "warn") {
    console.warn(`[auth] ${message}`);
  }
}
