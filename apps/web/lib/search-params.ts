/** One value from a page's search params. A repeated name (`?a=1&a=2`) counts as none. */
export function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The words for a key from a fixed list. A key that is not on the list shows nothing. */
export function pick(list: Record<string, string>, key: string | undefined): string | undefined {
  return key && Object.hasOwn(list, key) ? list[key] : undefined;
}
