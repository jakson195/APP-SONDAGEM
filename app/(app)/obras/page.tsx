"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";

type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
  local: string;
  empresaId: number;
};

export default function ObrasPage() {
  const [obras, setObras] = useState<ObraListItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNome, setEditingNome] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/obra"));
        const data = await r.json();
        if (!r.ok) {
          if (!cancelled) {
            setErro(
              typeof data.error === "string" ? data.error : "Erro ao carregar obras",
            );
            setObras([]);
          }
          return;
        }
        if (!cancelled && Array.isArray(data)) {
          setObras(data as ObraListItem[]);
        }
      } catch {
        if (!cancelled) {
          setErro("Falha de rede");
          setObras([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function guardarNomeObra(id: number) {
    const nome = editingNome.trim();
    if (!nome) {
      setErro("O nome da obra não pode ficar vazio.");
      return;
    }

    setMutatingId(id);
    setErro(null);
    setMensagem(null);
    try {
      const r = await fetch(apiUrl(`/api/obra/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(typeof data.error === "string" ? data.error : "Erro ao editar obra");
        return;
      }
      setObras((prev) => prev.map((o) => (o.id === id ? { ...o, nome } : o)));
      setEditingId(null);
      setEditingNome("");
      setMensagem(`Obra #${id} renomeada para "${nome}".`);
    } catch {
      setErro("Falha de rede ao editar obra.");
    } finally {
      setMutatingId(null);
    }
  }

  async function excluirObra(o: ObraListItem) {
    const ok = window.confirm(
      `Excluir a obra "${o.nome}"? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;

    setMutatingId(o.id);
    setErro(null);
    setMensagem(null);
    try {
      const r = await fetch(apiUrl(`/api/obra/${o.id}`), { method: "DELETE" });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(typeof data.error === "string" ? data.error : "Erro ao excluir obra");
        return;
      }
      setObras((prev) => prev.filter((obra) => obra.id !== o.id));
      if (editingId === o.id) {
        setEditingId(null);
        setEditingNome("");
      }
      setMensagem(`Obra "${o.nome}" apagada.`);
    } catch {
      setErro("Falha de rede ao excluir obra.");
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <div className="max-w-2xl text-[var(--text)]">
      <h1 className="mb-4 text-2xl font-bold">Obras</h1>
      <p className="mb-4 max-w-xl text-sm text-[var(--muted)]">
        Em cada obra encontra o <strong className="text-[var(--text)]">mapa Google</strong>, marcação
        de furos com GPS e exportação KML/GPX (estilo campo / Avenza). Abra a obra abaixo.
      </p>

      <Link
        href="/obra"
        className="inline-block rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
      >
        + Nova obra
      </Link>

      {erro && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}
      {mensagem && (
        <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300" role="status">
          {mensagem}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {obras.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
          >
            <span>
              <span className="font-medium">
                #{o.id} · {o.nome}
              </span>
              <span className="text-[var(--muted)]"> — {o.cliente}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/obra/${o.id}`}
                className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
              >
                Mapa e furos
              </Link>
              <button
                type="button"
                onClick={() => {
                  setErro(null);
                  setMensagem(null);
                  setEditingId(o.id);
                  setEditingNome(o.nome);
                }}
                disabled={mutatingId === o.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold hover:bg-black/[0.04] disabled:opacity-50 dark:hover:bg-white/[0.06]"
              >
                Editar nome
              </button>
              <button
                type="button"
                onClick={() => void excluirObra(o)}
                disabled={mutatingId === o.id}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
              >
                Excluir
              </button>
            </div>
            {editingId === o.id && (
              <div className="mt-2 flex w-full flex-wrap gap-2">
                <input
                  value={editingNome}
                  onChange={(e) => setEditingNome(e.target.value)}
                  className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
                  placeholder="Novo nome da obra"
                />
                <button
                  type="button"
                  onClick={() => void guardarNomeObra(o.id)}
                  disabled={mutatingId === o.id}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setEditingNome("");
                  }}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  Cancelar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!erro && obras.length === 0 && (
        <p className="mt-4 text-sm text-[var(--muted)]">Nenhuma obra registada.</p>
      )}
    </div>
  );
}
