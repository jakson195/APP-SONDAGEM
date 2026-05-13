"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";

type EmpresaRow = { id: number; nome: string };

export default function GestaoEmpresaPickerPage() {
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl("/api/me/empresas-gestao"), {
          credentials: "include",
        });
        const data = (await r.json()) as { empresas?: EmpresaRow[]; error?: string };
        if (!r.ok) {
          if (!cancel) {
            setErro(
              typeof data.error === "string"
                ? data.error
                : "Não foi possível carregar. Inicie sessão como administrador de empresa ou ADM mestre.",
            );
            setEmpresas([]);
          }
          return;
        }
        if (!cancel) {
          setEmpresas(Array.isArray(data.empresas) ? data.empresas : []);
          setErro(null);
        }
      } catch {
        if (!cancel) {
          setErro("Falha de rede.");
          setEmpresas([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-[var(--text)]">
        Gestão por empresa
      </h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Escolha uma empresa para gerir utilizadores, equipas e módulos contratados.
        É necessário ser <strong>administrador</strong> dessa empresa ou{" "}
        <strong>ADM mestre</strong>.
      </p>

      {loading && <p className="text-sm text-[var(--muted)]">A carregar…</p>}
      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {erro}{" "}
          <Link href="/login" className="font-medium underline">
            Iniciar sessão
          </Link>
        </p>
      )}

      {!loading && !erro && empresas.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          Não tem empresas para gerir. Crie uma obra com empresa nova ou peça a um
          administrador para o promover a ADMIN.
        </p>
      )}

      <ul className="space-y-2">
        {empresas.map((e) => (
          <li key={e.id}>
            <Link
              href={`/empresa/${e.id}/gestao`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--text)] transition-colors hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-950/30"
            >
              <span className="font-medium">{e.nome}</span>
              <span className="ml-2 text-xs text-[var(--muted)]">#{e.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
