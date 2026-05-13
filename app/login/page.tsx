"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Mountain } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get("next");
  const next =
    nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/dashboard";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        systemRole?: string;
      };
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : "Falha no login.");
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Falha de rede.");
      setLoading(false);
    }
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
            Entrar na área de trabalho
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
                {error}
              </p>
            )}
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
                Palavra-passe
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
              {loading ? "A entrar…" : "Entrar"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            Conta de super administrador: credenciais em{" "}
            <code className="rounded bg-[var(--surface)] px-1">MASTER_ADMIN_*</code>{" "}
            após <code className="rounded bg-[var(--surface)] px-1">npm run db:seed</code>{" "}
            (papel <code className="rounded bg-[var(--surface)] px-1">MASTER_ADMIN</code> ou{" "}
            <code className="rounded bg-[var(--surface)] px-1">SUPER_ADMIN</code>).
          </p>
        </div>

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          <Link
            href="/dashboard"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Continuar para a app (sem sessão)
          </Link>
          {" · "}
          <Link href="/login?next=/adm" className="font-medium text-[var(--accent)] hover:underline">
            Login → ADM mestre
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
          A carregar…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
