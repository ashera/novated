// ISO 3166-1 alpha-2 country code → English display name, via the built-in Intl
// data (no dependency; works in both Node and the browser). Pure + isomorphic so
// it's safe to import from client components and server code alike.
let display: Intl.DisplayNames | null = null;

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    display ??= new Intl.DisplayNames(["en"], { type: "region" });
    return display.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
