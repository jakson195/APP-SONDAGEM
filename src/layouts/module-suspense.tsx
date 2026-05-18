"use client";

export function ModuleSuspenseFallback({
  label = "A carregar módulo…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-8"
      role="status"
      aria-live="polite"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}
