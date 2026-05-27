"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

const STATUSES = ["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"] as const;

export default function NewCompanyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      setError("Nome é obrigatório.");
      return;
    }
    const payload = {
      name,
      slug: String(fd.get("slug") ?? "").trim() || undefined,
      cnpj: String(fd.get("cnpj") ?? "").trim() || null,
      phone: String(fd.get("phone") ?? "").trim() || null,
      email: String(fd.get("email") ?? "").trim() || null,
      address: String(fd.get("address") ?? "").trim() || null,
      logo: String(fd.get("logo") ?? "").trim() || null,
      primaryColor: String(fd.get("primaryColor") ?? "").trim() || null,
      portalEnabled: fd.get("portalEnabled") === "on",
      shareReportsEnabled: fd.get("shareReportsEnabled") === "on",
      plan: String(fd.get("plan") ?? "").trim() || null,
      status: String(fd.get("status") ?? "ACTIVE"),
      ownerName: String(fd.get("ownerName") ?? "").trim() || undefined,
      ownerEmail: String(fd.get("ownerEmail") ?? "").trim() || undefined,
      ownerPassword: String(fd.get("ownerPassword") ?? "") || undefined,
      userId: (() => {
        const u = String(fd.get("userId") ?? "").trim();
        if (!u) return undefined;
        const n = Number(u);
        return Number.isFinite(n) ? n : undefined;
      })(),
    };

    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/admin/companies"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = (await r.json()) as { company?: { id: number }; error?: string };
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : "Erro ao criar.");
        return;
      }
      if (data.company?.id) {
        router.push(`/admin/companies/${data.company.id}`);
        router.refresh();
        return;
      }
      setError("Resposta inválida.");
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/companies"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Empresas
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Nova empresa</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Pode vincular um utilizador existente pelo ID ou criar já o responsável com email e
        palavra-passe via Supabase Auth.
      </p>

      {error && (
        <p
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={(ev) => void onSubmit(ev)}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50"
      >
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Nome <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <p className="mt-1 text-xs text-slate-500">
            O slug do portal pode ser gerado automaticamente.
          </p>
        </div>
        <div>
          <label htmlFor="slug" className="text-sm font-medium">
            Slug do portal
          </label>
          <input
            id="slug"
            name="slug"
            placeholder="gerado-automaticamente"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cnpj" className="text-sm font-medium">
              CNPJ
            </label>
            <input
              id="cnpj"
              name="cnpj"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-medium">
              Telefone
            </label>
            <input
              id="phone"
              name="phone"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email comercial
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div>
          <label htmlFor="address" className="text-sm font-medium">
            Morada
          </label>
          <textarea
            id="address"
            name="address"
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div>
          <label htmlFor="logo" className="text-sm font-medium">
            URL do logo
          </label>
          <input
            id="logo"
            name="logo"
            type="url"
            placeholder="https://…"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="primaryColor" className="text-sm font-medium">
              Cor principal do portal
            </label>
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              defaultValue="#0F766E"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="portalEnabled"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              Ativar portal do cliente
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="shareReportsEnabled"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              Permitir compartilhamento de relatórios
            </label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ownerName" className="text-sm font-medium">
              Nome do responsável
            </label>
            <input
              id="ownerName"
              name="ownerName"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label htmlFor="ownerEmail" className="text-sm font-medium">
              Email de acesso do responsável
            </label>
            <input
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ownerPassword" className="text-sm font-medium">
            Palavra-passe inicial do responsável
          </label>
          <input
            id="ownerPassword"
            name="ownerPassword"
            type="password"
            minLength={8}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <p className="mt-1 text-xs text-slate-500">
            Preencha estes campos para criar o utilizador dono no Supabase Auth.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="plan" className="text-sm font-medium">
              Plano
            </label>
            <input
              id="plan"
              name="plan"
              placeholder="ex. pro, enterprise"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label htmlFor="status" className="text-sm font-medium">
              Estado
            </label>
            <select
              id="status"
              name="status"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="userId" className="text-sm font-medium">
            ID do utilizador dono existente (opcional)
          </label>
          <input
            id="userId"
            name="userId"
            type="number"
            min={1}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
          >
            {loading ? "A guardar…" : "Criar empresa"}
          </button>
          <Link
            href="/admin/companies"
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium dark:border-slate-700"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
