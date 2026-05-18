"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, FolderPlus } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { OBRA_STATUS_LABEL, OBRA_STATUS_ORDER } from "@/lib/obra-status";
import {
  defaultModulosProjetoTodosAtivos,
  MODULOS_PROJETO,
  MODULO_PROJETO_META,
  type ModuloProjetoChave,
} from "@/lib/modulos-projeto";
import { useObraModulos } from "@/components/obra-context";

type EmpresaOpt = { id: number; nome: string };

export default function NovaObraPage() {
  const { setObraContext } = useObraModulos();
  const [modulosObra, setModulosObra] = useState<Record<
    ModuloProjetoChave,
    boolean
  >>(() => defaultModulosProjetoTodosAtivos());
  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [local, setLocal] = useState("");
  const [description, setDescription] = useState("");
  const [obraStatus, setObraStatus] = useState<string>("ACTIVE");
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [novaEmpresaNome, setNovaEmpresaNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

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
      setCompanyId((prev) => {
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
    setOkMsg(null);
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
        setCompanyId(String(data.id));
      }
      setOkMsg("Empresa criada.");
    } catch {
      setErro("Falha de rede ao criar empresa");
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    setErro(null);
    setOkMsg(null);

    const cid = Number(companyId);
    if (!Number.isFinite(cid)) {
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
          description: description.trim() || undefined,
          status: obraStatus,
          companyId: cid,
          modules: modulosObra,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Não foi possível criar a obra",
        );
        return;
      }

      setOkMsg("Obra criada e associada à empresa.");
      if (typeof data.id === "number" && Number.isFinite(data.id)) {
        setObraContext(data.id);
      }
      setNome("");
      setCliente("");
      setLocal("");
      setDescription("");
      setObraStatus("ACTIVE");
      setModulosObra(defaultModulosProjetoTodosAtivos());
    } finally {
      setLoading(false);
    }
  }

  const selectedCompany = empresas.find((e) => String(e.id) === companyId);

  return (
    <div className="mx-auto max-w-4xl text-[var(--text)]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/obras"
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Obras
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <FolderPlus className="h-8 w-8 text-teal-600" />
            Nova obra
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Toda obra pertence a uma <strong className="text-[var(--text)]">empresa</strong>.
            O vínculo é guardado na base de dados e aparece em relatórios e no painel.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              <Building2 className="h-4 w-4" />
              Empresa contratante
            </h2>

            {loadingEmpresas ? (
              <p className="mt-4 text-sm text-[var(--muted)]">A carregar empresas…</p>
            ) : empresas.length === 0 ? (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="mb-3 font-medium text-amber-900 dark:text-amber-100">
                  Nenhuma empresa registada.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    placeholder="Nome da empresa"
                    value={novaEmpresaNome}
                    onChange={(e) => setNovaEmpresaNome(e.target.value)}
                    className="min-w-[12rem] flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void criarEmpresa()}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Criar empresa
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-[var(--text)]">
                  Selecionar empresa <span className="text-red-500">*</span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)]"
                  >
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedCompany && (
                  <p className="text-xs text-[var(--muted)]">
                    Obra será guardada com{" "}
                    <code className="rounded bg-[var(--surface)] px-1">companyId={selectedCompany.id}</code>
                  </p>
                )}
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 p-4">
                  <p className="mb-2 text-xs font-medium text-[var(--muted)]">
                    Adicionar empresa
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      placeholder="Nome da nova empresa"
                      value={novaEmpresaNome}
                      onChange={(e) => setNovaEmpresaNome(e.target.value)}
                      className="min-w-[10rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void criarEmpresa()}
                      className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      Criar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Dados do projeto
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium">Nome da obra *</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  placeholder="Ex.: Loteamento Norte"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Cliente *</label>
                  <input
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Local *</label>
                  <input
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição / âmbito</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Objetivo da sondagem, referências, notas internas…"
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Estado da obra</label>
                <select
                  value={obraStatus}
                  onChange={(e) => setObraStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                >
                  {OBRA_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {OBRA_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
                <legend className="px-1 text-sm font-medium text-[var(--text)]">
                  Módulos ativos nesta obra
                </legend>
                <p className="mb-3 text-xs text-[var(--muted)]">
                  O menu lateral mostra apenas estes módulos quando esta obra está
                  selecionada no contexto da aplicação.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {MODULOS_PROJETO.map((chave) => (
                    <li key={chave} className="flex items-center gap-2">
                      <input
                        id={`mod-${chave}`}
                        type="checkbox"
                        checked={modulosObra[chave]}
                        onChange={(e) =>
                          setModulosObra((prev) => ({
                            ...prev,
                            [chave]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-[var(--border)]"
                      />
                      <label
                        htmlFor={`mod-${chave}`}
                        className="cursor-pointer text-sm text-[var(--text)]"
                      >
                        {MODULO_PROJETO_META[chave].shortLabel}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </div>
          </section>

          {erro && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
              {erro}
            </p>
          )}
          {okMsg && (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
              {okMsg}
            </p>
          )}

          <button
            type="button"
            onClick={() => void salvar()}
            disabled={loading || loadingEmpresas || empresas.length === 0}
            className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 hover:bg-teal-500 disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
          >
            {loading ? "A guardar…" : "Criar obra"}
          </button>
        </div>

        <aside className="rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--card)] to-[var(--surface)] p-5 text-sm shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-[var(--text)]">Multiempresa</h3>
          <ul className="mt-3 list-inside list-disc space-y-2 text-[var(--muted)]">
            <li>Cada obra fica ligada à empresa escolhida.</li>
            <li>Utilize estados para acompanhar o ciclo de vida (rascunho → ativo → concluído).</li>
            <li>A descrição ajuda equipas e relatórios PDF.</li>
          </ul>
          <Link
            href="/gestao-empresa"
            className="mt-4 inline-flex text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            Gestão de utilizadores por empresa →
          </Link>
        </aside>
      </div>
    </div>
  );
}
