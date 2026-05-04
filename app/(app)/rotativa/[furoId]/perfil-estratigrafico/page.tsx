"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  linhasRotativaToPerfil,
  normalizeRotativaDadosCampo,
} from "@/components/rotativa-registro-campo";
import { PerfilEstratigrafico } from "@/components/perfil-estratigrafico";
import { apiUrl } from "@/lib/api-url";

export default function PerfilEstratigraficoPage() {
  const params = useParams();
  const furoId = Number(params.furoId as string);

  const [codigoFuro, setCodigoFuro] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [perfilCamadas, setPerfilCamadas] = useState(
    linhasRotativaToPerfil([]),
  );

  const carregar = useCallback(async () => {
    if (!Number.isFinite(furoId)) {
      setLoadError("ID do furo inválido.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`));
      const j = (await r.json()) as {
        error?: string;
        codigo?: string;
        tipo?: string;
        tipoCampo?: string;
        dadosCampo?: unknown;
      };
      if (!r.ok) {
        setLoadError(
          typeof j.error === "string" ? j.error : "Erro ao carregar furo",
        );
        setPerfilCamadas(linhasRotativaToPerfil([]));
        return;
      }
      if ((j.tipo ?? j.tipoCampo) !== "rotativa") {
        setLoadError(
          "Este furo não é sondagem rotativa. Use o módulo correspondente.",
        );
        setPerfilCamadas(linhasRotativaToPerfil([]));
        return;
      }
      setCodigoFuro(typeof j.codigo === "string" ? j.codigo : "");
      const dc = normalizeRotativaDadosCampo(j.dadosCampo);
      setPerfilCamadas(linhasRotativaToPerfil(dc?.linhas ?? []));
    } catch {
      setLoadError("Falha de rede ao carregar o furo.");
      setPerfilCamadas(linhasRotativaToPerfil([]));
    } finally {
      setLoading(false);
    }
  }, [furoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!Number.isFinite(furoId)) {
    return (
      <div className="p-6 text-[var(--text)]">
        <p className="text-red-600 dark:text-red-400">ID do furo inválido.</p>
        <Link
          href="/rotativa"
          className="mt-4 inline-block text-sm text-[var(--accent)] underline"
        >
          Voltar à rotativa
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-5 text-[var(--text)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Perfil Estratigráfico
          </h1>
          <p className="mt-2">Furo ID: {furoId}</p>
          {codigoFuro ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Código: {codigoFuro}
            </p>
          ) : null}
        </div>
        <Link
          href={`/rotativa/${furoId}`}
          className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          Registo completo
        </Link>
      </div>

      <div className="mt-5 space-y-4">
        {loading && (
          <p className="text-sm text-[var(--muted)]">A carregar…</p>
        )}

        {loadError && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {!loading && !loadError && perfilCamadas.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Sem linhas estratigráficas neste furo. Edite o registo de campo para
            adicionar intervalos.
          </p>
        )}

        {!loading && perfilCamadas.length > 0 && (
          <>
            <p className="text-sm text-[var(--muted)]">
              Perfil e litologia por profundidade. RQD e restantes dados no
              registo completo.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <PerfilEstratigrafico
                dados={perfilCamadas}
                escalaPxPorM={48}
                larguraPx={240}
                className="rounded-md"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
