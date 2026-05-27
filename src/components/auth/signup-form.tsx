"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: String(formData.get("companyName") ?? "").trim(),
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          password: String(formData.get("password") ?? ""),
          cnpj: String(formData.get("cnpj") ?? "").trim() || null,
          phone: String(formData.get("phone") ?? "").trim() || null,
          address: String(formData.get("address") ?? "").trim() || null,
          companyEmail: String(formData.get("companyEmail") ?? "").trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        company?: { slug: string };
      };
      if (!response.ok) {
        setError(data.error ?? "Falha ao criar a conta.");
        return;
      }
      router.push(data.company?.slug ? `/cliente/${data.company.slug}` : "/dashboard");
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
        className="space-y-4"
      >
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="companyName" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Nome da empresa
          </label>
          <input
            id="companyName"
            name="companyName"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Nome do responsável
            </label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="companyEmail" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Email comercial
            </label>
            <input
              id="companyEmail"
              name="companyEmail"
              type="email"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Email de acesso
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Palavra-passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cnpj" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              CNPJ
            </label>
            <input
              id="cnpj"
              name="cnpj"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Telefone
            </label>
            <input
              id="phone"
              name="phone"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
            />
          </div>
        </div>
        <div>
          <label htmlFor="address" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Endereço
          </label>
          <textarea
            id="address"
            name="address"
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          {loading ? "A criar conta..." : "Criar empresa e entrar"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Já tem acesso?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
