"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Mountain } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    router.push("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(13,148,136,0.18),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(45,212,191,0.12),transparent)]"
        aria-hidden
      />
      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-lg shadow-teal-900/20">
            <Mountain className="h-7 w-7" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
            Vision Sondagem
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Sign in to your geotechnical workspace
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-70"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            Demo: any credentials route to the dashboard.
          </p>
        </div>

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          <Link
            href="/dashboard"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Skip to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
