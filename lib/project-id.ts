/** Human-readable project ID, e.g. `PRJ-20260429-A1B2C3` (date + short unique segment). */
export function generateProjectCode(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const seg = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PRJ-${y}${m}${day}-${seg}`;
}

/** Display ISO `createdAt` in the UI (locale-aware). */
export function formatProjectCreatedAt(iso: string, locale?: string): string {
  const loc =
    locale ??
    (typeof navigator !== "undefined" ? navigator.language : "pt-BR");
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(loc, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
