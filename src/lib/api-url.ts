/**
 * Base URL for API requests. In Capacitor/static export, set NEXT_PUBLIC_APP_URL
 * to the Next server (e.g. http://192.168.1.10:3000) so /api/* resolves correctly.
 */
const raw =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_APP_URL?.trim() ?? ""
    : "";

const base = raw.replace(/\/$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
