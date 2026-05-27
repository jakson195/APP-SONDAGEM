import Link from "next/link";
import { Mountain } from "lucide-react";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(13,148,136,0.18),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(45,212,191,0.12),transparent)]"
        aria-hidden
      />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-lg shadow-teal-900/20">
            <Mountain className="h-7 w-7" strokeWidth={2} />
          </div>
          <Link href="/" className="text-xl font-semibold tracking-tight text-[var(--text)]">
            DataGeo Digital
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
            {title}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
          {children}
        </div>

        {footer ? (
          <div className="mt-8 text-center text-sm text-[var(--muted)]">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
