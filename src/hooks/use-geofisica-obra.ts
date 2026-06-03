"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { useObraModulos } from "@/components/obra-context";

export type GeofisicaObraListItem = {
  id: number;
  nome: string;
  cliente: string;
};

/**
 * Sincroniza a obra activa (contexto global + ?obraId=) e carrega a lista de obras.
 */
export function useGeofisicaObra() {
  const searchParams = useSearchParams();
  const { selectedObraId, setObraContext, obraNome } = useObraModulos();
  const [obras, setObras] = useState<GeofisicaObraListItem[]>([]);
  const [obrasLoading, setObrasLoading] = useState(true);
  const [obrasError, setObrasError] = useState<string | null>(null);

  const obraIdFromUrl = searchParams?.get("obraId");
  const urlObraId =
    obraIdFromUrl && obraIdFromUrl !== ""
      ? Number(obraIdFromUrl)
      : Number.NaN;

  useEffect(() => {
    if (!Number.isFinite(urlObraId) || urlObraId < 1) return;
    if (selectedObraId === urlObraId) return;
    setObraContext(urlObraId);
  }, [urlObraId, selectedObraId, setObraContext]);

  const reloadObras = useCallback(async () => {
    setObrasLoading(true);
    setObrasError(null);
    try {
      const r = await fetch(apiUrl("/api/obra"), {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await r.json().catch(() => null)) as
        | GeofisicaObraListItem[]
        | { error?: string }
        | null;
      if (!r.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          !Array.isArray(data) &&
          typeof data.error === "string"
            ? data.error
            : r.status === 401
              ? "Sessão expirada — faça login novamente."
              : "Erro ao carregar obras.";
        setObras([]);
        setObrasError(msg);
        return;
      }
      if (!Array.isArray(data)) {
        setObras([]);
        setObrasError("Resposta inválida ao listar obras.");
        return;
      }
      setObras(
        data.map((o) => ({
          id: o.id,
          nome: o.nome,
          cliente: o.cliente ?? "",
        })),
      );
      if (data.length === 0) {
        setObrasError(
          "Nenhuma obra encontrada. Crie uma em «Nova obra» ou peça acesso à empresa.",
        );
      }
    } catch {
      setObras([]);
      setObrasError("Falha de rede ao carregar obras.");
    } finally {
      setObrasLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadObras();
  }, [reloadObras]);

  const selectObra = useCallback(
    (id: number | null) => {
      setObraContext(id);
    },
    [setObraContext],
  );

  return {
    obras,
    obrasLoading,
    obrasError,
    reloadObras,
    selectedObraId,
    obraNome,
    selectObra,
  };
}
