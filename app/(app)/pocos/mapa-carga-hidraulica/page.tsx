"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  PiezoHydraulicHeadMap,
  type PiezoWellHead,
} from "@/components/piezo-hydraulic-head-map";
import { apiUrl } from "@/lib/api-url";
import { samplePiezoHeadM } from "@/lib/piezo-sample-head";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";

type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
};

type FuroList = { id: number; codigo: string };

type FuroApi = {
  id: number;
  codigo: string;
  latitude: number | null;
  longitude: number | null;
  dadosCampo?: unknown;
};

function latLngFromFuro(f: FuroApi): { lat: number; lng: number } | null {
  if (
    f.latitude != null &&
    f.longitude != null &&
    Number.isFinite(f.latitude) &&
    Number.isFinite(f.longitude)
  ) {
    return { lat: f.latitude, lng: f.longitude };
  }
  const dc =
    f.dadosCampo != null && typeof f.dadosCampo === "object"
      ? (f.dadosCampo as Record<string, unknown>)
      : null;
  if (!dc) return null;
  const p = wgsPairFromInputs(
    typeof dc.mapaRelLatStr === "string" ? dc.mapaRelLatStr : "",
    typeof dc.mapaRelLngStr === "string" ? dc.mapaRelLngStr : "",
  );
  return p ? { lat: p.lat, lng: p.lng } : null;
}

export default function MapaCargaHidraulicaPage() {
  const searchParams = useSearchParams();
  const obraIdQuery = Number(searchParams.get("obraId") || "");

  const [obras, setObras] = useState<ObraListItem[]>([]);
  const [obraId, setObraId] = useState<number | null>(
    Number.isFinite(obraIdQuery) ? obraIdQuery : null,
  );
  const [wells, setWells] = useState<PiezoWellHead[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/obra"));
        const data = await r.json();
        if (cancelled || !r.ok || !Array.isArray(data)) return;
        const lista = data as ObraListItem[];
        setObras(lista);
        if (obraId == null && lista[0]?.id != null) setObraId(lista[0].id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [obraId]);

  const carregar = useCallback(async (oid: number) => {
    setLoading(true);
    setErro(null);
    try {
      const rList = await fetch(apiUrl(`/api/obra/${oid}/furos/piezo`));
      const raw = (await rList.json().catch(() => [])) as unknown;
      if (!rList.ok || !Array.isArray(raw)) {
        setErro("Não foi possível carregar os poços desta obra.");
        setWells([]);
        return;
      }
      const lista = raw as FuroList[];
      const detalhes = await Promise.all(
        lista.map(async (row): Promise<PiezoWellHead | null> => {
          const rf = await fetch(apiUrl(`/api/furo/${row.id}`));
          const j = (await rf.json().catch(() => ({}))) as FuroApi;
          if (!rf.ok) return null;
          const head = samplePiezoHeadM(j.dadosCampo);
          const ll = latLngFromFuro(j);
          if (!head || !ll) return null;
          return {
            id: j.id,
            codigo: j.codigo ?? row.codigo,
            lat: ll.lat,
            lng: ll.lng,
            headM: head.headM,
            depthM: head.depthM,
            fonte: head.fonte,
          };
        }),
      );
      setWells(detalhes.filter((x): x is PiezoWellHead => x != null));
    } catch {
      setErro("Falha de rede ao montar o mapa.");
      setWells([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (obraId != null && Number.isFinite(obraId)) {
      void carregar(obraId);
    } else {
      setWells([]);
    }
  }, [obraId, carregar]);

  const obraNome = obras.find((o) => o.id === obraId)?.nome ?? "—";

  return (
    <div className="space-y-5 p-6 text-[var(--text)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa — carga hidráulica</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Modelo interpretativo a partir dos poços de monitoramento (interpolação + isolinhas +
            escoamento).
          </p>
        </div>
        <Link
          href={obraId != null ? `/pocos?obraId=${obraId}` : "/pocos"}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          ← Voltar aos poços
        </Link>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="block text-sm font-medium" htmlFor="mapa-ch-obra">
          Obra
        </label>
        <select
          id="mapa-ch-obra"
          value={obraId ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            setObraId(Number.isFinite(v) ? v : null);
          }}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
        >
          <option value="">— Escolher obra —</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} — {o.cliente}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Obra: <strong className="text-[var(--text)]">{obraNome}</strong> · Poços com dados:{" "}
          {wells.length}
        </p>
      </div>

      {loading && (
        <p className="text-sm text-[var(--muted)]">A gerar campo e isolinhas…</p>
      )}
      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}

      {!loading && !erro && wells.length > 0 && (
        <PiezoHydraulicHeadMap wells={wells} />
      )}

      {!loading && !erro && wells.length === 0 && obraId != null && (
        <p className="text-sm text-[var(--muted)]">
          Nenhum poço desta obra tem ao mesmo tempo posição (latitude/longitude ou mapa relativo) e
          valores para calcular carga (cota boca + nível/Nₐ).
        </p>
      )}
    </div>
  );
}
