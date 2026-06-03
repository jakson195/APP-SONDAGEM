"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyToken = searchParams?.get("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(false);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("A nova palavra-passe deve ter pelo menos 8 caracteres.");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      setLoading(false);
      return;
    }

    try {
      const endpoint = legacyToken ? "/api/auth/reset-password" : "/api/auth/update-password";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          legacyToken ? { token: legacyToken, password } : { password },
        ),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Falha ao atualizar a palavra-passe.");
        return;
      }
      setSuccess(true);
      window.setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1200);
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
        {success ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Palavra-passe atualizada. A redirecionar...
          </p>
        ) : null}
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Nova palavra-passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-sm font-medium text-[var(--text)]"
          >
            Confirmar palavra-passe
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="dg-btn-primary w-full py-2.5 disabled:opacity-70"
        >
          {loading ? "A atualizar..." : "Definir nova palavra-passe"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Voltar ao login
        </Link>
      </p>
    </>
  );
}
