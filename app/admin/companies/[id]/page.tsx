"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import type { ObraStatus, SubscriptionStatus } from "@prisma/client";
import { OBRA_STATUS_LABEL } from "@/lib/obra-status";

const STATUSES = ["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"] as const;

type CompanyDetail = {
  id: number;
  name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo: string | null;
  plan: string | null;
  status: SubscriptionStatus;
  createdAt: string;
  user: {
    id: number;
    email: string;
    name: string | null;
    systemRole: string;
  };
  obras: {
    id: number;
    nome: string;
    cliente: string;
    local: string;
    status: ObraStatus;
  }[];
  _count: { obras: number; memberships: number; equipes: number };
};

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(apiUrl(`/api/admin/companies/${id}`), {
        credentials: "include",
      });
      const data = (await r.json()) as { company?: CompanyDetail; error?: string };
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : "Erro ao carregar.");
        setCompany(null);
        return;
      }
      setCompany(data.company ?? null);
    } catch {
      setError("Falha de rede.");
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!company) return;
    setMsg(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      cnpj: String(fd.get("cnpj") ?? "").trim() || null,
      phone: String(fd.get("phone") ?? "").trim() || null,
      email: String(fd.get("email") ?? "").trim() || null,
      address: String(fd.get("address") ?? "").trim() || null,
      logo: String(fd.get("logo") ?? "").trim() || null,
      plan: String(fd.get("plan") ?? "").trim() || null,
      status: String(fd.get("status") ?? company.status),
      userId: (() => {
        const u = String(fd.get("userId") ?? "").trim();
        if (!u) return undefined;
        const n = Number(u);
        return Number.isFinite(n) ? n : undefined;
      })(),
    };
    if (!payload.name) {
      setError("Nome é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(apiUrl(`/api/admin/companies/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = (await r.json()) as { company?: CompanyDetail; error?: string };
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : "Erro ao guardar.");
        return;
      }
      setMsg("Alterações guardadas.");
      await load();
      router.refresh();
    } catch {
      setError("Falha de rede.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!company) return;
    if (
      !confirm(
        `Eliminar definitivamente «${company.name}»? Obras e dados ligados serão removidos em cascata.`,
      )
    ) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      const r = await fetch(apiUrl(`/api/admin/companies/${id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const data = (await r.json()) as { error?: string };
        setError(typeof data.error === "string" ? data.error : "Erro ao excluir.");
        return;
      }
      router.push("/admin/companies");
      router.refresh();
    } catch {
      setError("Falha de rede.");
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-slate-500">
        A carregar…
      </div>
    );
  }

  if (!company) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-red-600 dark:text-red-400">{error ?? "Não encontrado."}</p>
        <Link href="/admin/companies" className="mt-4 inline-block text-teal-600 underline">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/companies"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Empresas
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            Criada em {new Date(company.createdAt).toLocaleString("pt-PT")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/empresa/${company.id}/gestao`}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-700"
          >
            Gestão org. <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={removing}
            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            {removing ? "A excluir…" : "Excluir"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {msg && (
        <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
          {msg}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={(ev) => void onSubmit(ev)}
          className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50 lg:col-span-2"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dados da empresa
          </h2>
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              Nome
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={company.name}
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
                defaultValue={company.cnpj ?? ""}
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
                defaultValue={company.phone ?? ""}
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
              defaultValue={company.email ?? ""}
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
              defaultValue={company.address ?? ""}
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
              defaultValue={company.logo ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="plan" className="text-sm font-medium">
                Plano
              </label>
              <input
                id="plan"
                name="plan"
                defaultValue={company.plan ?? ""}
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
                defaultValue={company.status}
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
              ID do utilizador dono
            </label>
            <input
              id="userId"
              name="userId"
              type="number"
              min={1}
              defaultValue={company.user.id}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <p className="mt-1 text-xs text-slate-500">
              Atual: {company.user.name ?? company.user.email} ({company.user.systemRole})
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
          >
            {saving ? "A guardar…" : "Guardar alterações"}
          </button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Resumo
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-slate-500">Obras</span>
                <span className="font-medium tabular-nums">{company._count.obras}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">Membros</span>
                <span className="font-medium tabular-nums">
                  {company._count.memberships}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">Equipas</span>
                <span className="font-medium tabular-nums">{company._count.equipes}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Projetos (obras)
            </h3>
            {company.obras.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhuma obra.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
                {company.obras.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/obra/${o.id}`}
                      className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      {o.nome}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {OBRA_STATUS_LABEL[o.status]} · {o.cliente} · {o.local}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
