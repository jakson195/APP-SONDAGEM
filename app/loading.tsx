export default function Loading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent dark:border-teal-400"
        aria-hidden
      />
      <p className="text-sm text-[var(--muted)]">A carregar…</p>
    </div>
  );
}
