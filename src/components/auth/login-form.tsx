"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  next: string;
};

export function LoginForm({ next }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: String(formData.get("email") ?? "").trim(),
          password: String(formData.get("password") ?? ""),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Falha ao entrar.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(new FormData(event.currentTarget));
        }}
        className="space-y-5"
      >
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@empresa.com"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text)]">
              Palavra-passe
            </label>
            <Link href="/recuperar-senha" className="text-xs font-medium text-[var(--accent)] hover:underline">
              Recuperar acesso
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="dg-btn-primary w-full py-2.5 disabled:opacity-70"
        >
          {loading ? "A entrar..." : "Entrar"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-[var(--accent)] hover:underline">
          Criar empresa
        </Link>
      </p>
    </>
  );
}
