// A full page load after signing in or out, so the server renders the next page with the new
// session. Kept in its own file so tests can replace it.

export function navigate(url: string): void {
  window.location.assign(url);
}

export function replaceLocation(url: string): void {
  window.location.replace(url);
}
