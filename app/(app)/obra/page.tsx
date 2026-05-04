"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";

type EmpresaOpt = { id: number; nome: string };

export default function NovaObraPage() {
  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [local, setLocal] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [novaEmpresaNome, setNovaEmpresaNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarEmpresas = useCallback(async () => {
    setLoadingEmpresas(true);
    setErro(null);
    try {
      const r = await fetch(apiUrl("/api/empresas"));
      const data = await r.json();
      if (!r.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Erro ao carregar empresas",
        );
        setEmpresas([]);
        return;
      }
      const list = Array.isArray(data) ? (data as EmpresaOpt[]) : [];
      setEmpresas(list);
      setEmpresaId((prev) => {
        if (prev && list.some((e) => String(e.id) === prev)) return prev;
        return list[0] ? String(list[0].id) : "";
      });
    } catch {
      setErro("Falha de rede ao carregar empresas");
      setEmpresas([]);
    } finally {
      setLoadingEmpresas(false);
    }
  }, []);

  useEffect(() => {
    void carregarEmpresas();
  }, [carregarEmpresas]);

  async function criarEmpresa() {
    const n = novaEmpresaNome.trim();
    if (!n) {
      setErro("Indique o nome da empresa.");
      return;
    }
    setErro(null);
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/empresas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Não foi possível criar a empresa",
        );
        return;
      }
      setNovaEmpresaNome("");
      await carregarEmpresas();
      if (typeof data.id === "number") {
        setEmpresaId(String(data.id));
      }
    } catch {
      setErro("Falha de rede ao criar empresa");
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    setErro(null);

    const eid = Number(empresaId);
    if (!Number.isFinite(eid)) {
      setErro("Crie ou selecione uma empresa antes de guardar a obra.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/obra"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          cliente: cliente.trim(),
          local: local.trim(),
          empresaId: eid,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Não foi possível criar a obra",
        );
        return;
      }

      alert("Obra criada");
      setNome("");
      setCliente("");
      setLocal("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg text-[var(--text)]">
      <div className="mb-4">
        <Link
          href="/obras"
          className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          ← Obras
        </Link>
      </div>

      <h1 className="mb-4 text-2xl font-bold">Nova obra</h1>

      <p className="mb-4 text-sm text-[var(--muted)]">
        Cada obra pertence a uma <strong>empresa</strong>. Se a lista estiver vazia,
        cria primeiro a empresa abaixo — sem isso, o servidor não aceita guardar
        (nem o nome do cliente).
      </p>

      {loadingEmpresas ? (
        <p className="mb-3 text-sm text-[var(--muted)]">A carregar empresas…</p>
      ) : empresas.length === 0 ? (
        <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="mb-2 font-medium text-amber-800 dark:text-amber-200">
            Nenhuma empresa na base de dados.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Nome da empresa"
              value={novaEmpresaNome}
              onChange={(e) => setNovaEmpresaNome(e.target.value)}
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void criarEmpresa()}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Criar empresa
            </button>
          </div>
        </div>
      ) : (
        <label className="mb-4 block text-sm text-[var(--muted)]">
          Empresa
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--text)]"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome} (id {e.id})
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-3">
        <input
          placeholder="Nome da obra"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        />
        <input
          placeholder="Cliente"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        />
        <input
          placeholder="Local"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        />
      </div>

      {erro && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={() => void salvar()}
        disabled={loading || loadingEmpresas || empresas.length === 0}
        className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "A guardar…" : "Salvar obra"}
      </button>
    </div>
  );
}
