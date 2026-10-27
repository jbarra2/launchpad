/** One value from a page's search params. A repeated name (`?a=1&a=2`) counts as none. */
export function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
