import { useCallback, useEffect, useMemo, useState } from "react";
import { getAnmLeilaoApiBase } from "../../lib/anm-leilao-api-base";
import { useLeilaoStore } from "../../store/leilaoStore";
import { useLayerStore } from "../../store/layerStore";
import { RODADA_COLORS, formatLeilaoDate, LEILAO_CATEGORIA_LABELS, rodadaLabel } from "../../layers/leilao";
import type { LeilaoCategoriaToggleKey } from "../../layers/leilao";

const UF_OPTIONS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

type RodadaMeta = {
  rodada: number;
  nome: string;
  areas_count: number;
  data_leilao?: string | null;
  data_oferta_pub?: string | null;
  data_encerramento?: string | null;
};

type ImportStatusResponse = {
  lastJob?: {
    uf?: string;
    status?: string;
    message?: string;
    areas_imported?: number;
    progress_pct?: number;
  } | null;
  totalAreas?: number;
  leilaoAreas?: number;
  upcomingAreas?: number;
};

type UpcomingSummary = {
  proximaRodada?: {
    rodada?: number;
    nome?: string;
    data_leilao?: string | null;
    data_oferta_pub?: string | null;
  } | null;
  porCategoria?: Record<string, number>;
};

const CATEGORIA_KEYS: LeilaoCategoriaToggleKey[] = ["confirmada", "prevista", "candidata", "historica"];

async function fetchRodadasAndStats(): Promise<{
  rodadas: RodadaMeta[];
  stats: { totalAreas?: number; leilaoAreas?: number; upcomingAreas?: number };
  upcoming: UpcomingSummary;
}> {
  const base = getAnmLeilaoApiBase();
  const [lr, st, up] = await Promise.all([
    fetch(`${base}/mining/leiloes`).then((r) => r.json()),
    fetch(`${base}/mining/import/status`).then((r) => r.json()),
    fetch(`${base}/mining/leiloes/upcoming`).then((r) => r.json()).catch(() => ({})),
  ]);
  return {
    rodadas: lr.rodadas ?? [],
    stats: {
      totalAreas: st.totalAreas,
      leilaoAreas: st.leilaoAreas,
      upcomingAreas: st.upcomingAreas,
    },
    upcoming: up as UpcomingSummary,
  };
}

export function LeilaoFilterPanel() {
  const {
    ufs,
    rodadas,
    dataInicio,
    dataFim,
    substancia,
    setUfs,
    toggleRodada,
    setDataInicio,
    setDataFim,
    setSubstancia,
    importStatus,
    setImportStatus,
    categorias,
    toggleCategoria,
  } = useLeilaoStore();
  const setVisible = useLayerStore((s) => s.setVisible);
  const showUpcomingOutline = useLayerStore((s) => s.visible.mining_leilao_upcoming ?? true);
  const applyLeilaoOnlyLayers = useLayerStore((s) => s.applyLeilaoOnlyLayers);
  const [rodadaMeta, setRodadaMeta] = useState<RodadaMeta[]>([]);
  const [stats, setStats] = useState<{
    totalAreas?: number;
    leilaoAreas?: number;
    upcomingAreas?: number;
  }>({});
  const [upcoming, setUpcoming] = useState<UpcomingSummary>({});
  const [syncing, setSyncing] = useState(false);
  const [predicting, setPredicting] = useState(false);

  const metaByRodada = useMemo(
    () => Object.fromEntries(rodadaMeta.map((r) => [r.rodada, r])),
    [rodadaMeta],
  );

  const refreshMeta = useCallback(async () => {
    try {
      const { rodadas: rd, stats: st, upcoming: up } = await fetchRodadasAndStats();
      setRodadaMeta(rd);
      setStats(st);
      setUpcoming(up);
    } catch {
      /* API offline */
    }
  }, []);

  useEffect(() => {
    applyLeilaoOnlyLayers();
  }, [applyLeilaoOnlyLayers]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta, importStatus]);

  const pollSyncJob = async (uf: string) => {
    const base = getAnmLeilaoApiBase();
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => window.setTimeout(r, 2000));
      const st = (await fetch(`${base}/mining/import/status`).then((r) => r.json())) as ImportStatusResponse;
      const job = st.lastJob;
      if (!job || job.uf !== uf) continue;
      if (job.status === "running" || job.status === "pending") {
        setImportStatus(job.message ?? `A sincronizar ${uf}… (${job.progress_pct ?? 0}%)`);
        continue;
      }
      if (job.status === "done") {
        setImportStatus(`${uf}: ${job.areas_imported?.toLocaleString("pt-BR") ?? 0} processos importados`);
        await refreshMeta();
        return;
      }
      if (job.status === "failed") {
        setImportStatus(`Falha em ${uf}: ${job.message ?? "erro desconhecido"}`);
        return;
      }
    }
    setImportStatus(`Sync ${uf} demorou demais — verifique o backend`);
  };

  const syncUf = async (uf: string) => {
    setImportStatus(`A iniciar sync ${uf}…`);
    const res = await fetch(`${getAnmLeilaoApiBase()}/mining/import/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { mode?: string; taskId?: string; uf?: string };
    if (data.mode === "inline" || data.mode === "celery") {
      await pollSyncJob(uf);
    }
  };

  const syncSelectedUfs = async () => {
    const toSync = ufs.length > 0 ? ufs : ["MG"];
    setSyncing(true);
    try {
      for (const uf of toSync) {
        await syncUf(uf);
      }
    } catch (e) {
      setImportStatus(e instanceof Error ? e.message : "Falha no sync");
    } finally {
      setSyncing(false);
      window.setTimeout(() => setImportStatus(null), 12_000);
    }
  };

  const runPrediction = async () => {
    setPredicting(true);
    try {
      const res = await fetch(`${getAnmLeilaoApiBase()}/mining/enrich/predict`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { proximaRodada?: number; porCategoria?: Record<string, number> };
      setImportStatus(
        `Previsão: rodada ${data.proximaRodada ?? "?"} · ${
          data.porCategoria?.prevista?.toLocaleString("pt-BR") ?? 0
        } previstas`,
      );
      await refreshMeta();
    } catch (e) {
      setImportStatus(e instanceof Error ? e.message : "Falha na previsão");
    } finally {
      setPredicting(false);
      window.setTimeout(() => setImportStatus(null), 10_000);
    }
  };

  const rodadaNumbers = rodadaMeta.length > 0
    ? rodadaMeta.map((r) => r.rodada)
    : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const proxima = upcoming.proximaRodada;
  const porCat = upcoming.porCategoria ?? {};

  return (
    <aside className="pointer-events-auto absolute left-3 top-3 z-10 flex max-h-[calc(100vh-5rem)] w-72 flex-col overflow-y-auto rounded-xl border border-amber-500/30 bg-[#0b0e14]/95 p-3 text-xs text-slate-300 shadow-2xl backdrop-blur-md">
      <div className="mb-3 border-b border-white/10 pb-2">
        <h1 className="text-sm font-bold tracking-wide text-amber-300">ANM · Leilão SOPLE</h1>
        <p className="text-[10px] text-slate-400">SIGMINE + rodadas de leilão</p>
        {stats.totalAreas != null && (
          <p className="mt-1 text-[10px] text-amber-200/80">
            {stats.leilaoAreas?.toLocaleString("pt-BR") ?? 0} áreas leilão ·{" "}
            {stats.upcomingAreas?.toLocaleString("pt-BR") ?? 0} próximas ·{" "}
            {stats.totalAreas.toLocaleString("pt-BR")} processos
          </p>
        )}
      </div>

      <section className="mb-3 rounded-lg border border-violet-500/25 bg-violet-950/20 p-2">
        <p className="mb-1 font-medium text-violet-200">Próximos leilões</p>
        {proxima ? (
          <p className="text-[10px] leading-relaxed text-slate-300">
            {proxima.nome ?? `${proxima.rodada}ª rodada`} — leilão{" "}
            {formatLeilaoDate(proxima.data_leilao)} · oferta{" "}
            {formatLeilaoDate(proxima.data_oferta_pub)}
          </p>
        ) : (
          <p className="text-[10px] text-slate-500">Sem rodada futura cadastrada</p>
        )}
        <ul className="mt-2 space-y-0.5">
          {CATEGORIA_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between text-[10px] text-slate-400">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={categorias[key]}
                  onChange={() => toggleCategoria(key)}
                />
                <span>{LEILAO_CATEGORIA_LABELS[key]}</span>
              </label>
              <span className="tabular-nums text-violet-200/80">
                {(porCat[key] ?? 0).toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={predicting || syncing}
          onClick={() => void runPrediction()}
          className="mt-2 w-full rounded-lg border border-violet-500/40 bg-violet-900/40 py-1.5 text-violet-100 hover:bg-violet-800/50 disabled:opacity-50"
        >
          {predicting ? "A calcular previsão…" : "Actualizar previsão SOPLE"}
        </button>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={showUpcomingOutline}
            onChange={(e) => setVisible("mining_leilao_upcoming", e.target.checked)}
          />
          Contorno áreas próximas (MVT upcoming)
        </label>
      </section>

      <section className="mb-3">
        <p className="mb-1 font-medium text-amber-200">UF</p>
        <div className="flex flex-wrap gap-1">
          {UF_OPTIONS.map((uf) => (
            <button
              key={uf}
              type="button"
              onClick={() =>
                setUfs(
                  ufs.includes(uf) ? ufs.filter((x) => x !== uf) : [...ufs, uf],
                )
              }
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                ufs.includes(uf)
                  ? "bg-amber-600 text-white"
                  : "bg-white/10 text-slate-400 hover:bg-white/15"
              }`}
            >
              {uf}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {ufs.length === 0 ? "Nenhuma UF — mapa mostra todo o Brasil" : `Mapa filtrado: ${ufs.join(", ")}`}
        </p>
      </section>

      <section className="mb-3">
        <p className="mb-1 font-medium text-amber-200">Rodada SOPLE</p>
        <div className="space-y-1">
          {rodadaNumbers.map((n) => {
            const meta = metaByRodada[n];
            return (
              <label key={n} className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={rodadas.length === 0 || rodadas.includes(n)}
                  onChange={() => toggleRodada(n)}
                />
                <span
                  className="mt-0.5 inline-block h-2 w-3 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: `rgb(${(RODADA_COLORS[n] ?? [180, 180, 180]).slice(0, 3).join(",")})`,
                  }}
                />
                <span className="leading-tight">
                  <span className="block">{meta?.nome ?? rodadaLabel(n)}</span>
                  <span className="text-[10px] text-slate-500">
                    Leilão: {formatLeilaoDate(meta?.data_leilao)}
                    {meta?.areas_count != null && meta.areas_count > 0
                      ? ` · ${meta.areas_count.toLocaleString("pt-BR")} áreas`
                      : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Vazio = todas as rodadas</p>
        <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="mb-1 text-[10px] font-medium text-amber-200/90">Legenda ANM</p>
          <ul className="space-y-0.5">
            {rodadaNumbers.map((n) => {
              const meta = metaByRodada[n];
              return (
                <li key={`leg-${n}`} className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span
                    className="inline-block h-2.5 w-4 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: `rgb(${(RODADA_COLORS[n] ?? [180, 180, 180]).slice(0, 3).join(",")})`,
                    }}
                  />
                  <span>
                    {meta?.nome ?? rodadaLabel(n)} — {formatLeilaoDate(meta?.data_leilao)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="mb-3 space-y-2">
        <label className="block">
          <span className="text-slate-400">Leilão de</span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">Leilão até</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">Substância</span>
          <input
            type="text"
            value={substancia}
            placeholder="ex: OURO, FERRO"
            onChange={(e) => setSubstancia(e.target.value)}
            className="mt-0.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1"
          />
        </label>
      </section>

      <section className="border-t border-white/10 pt-3">
        <p className="mb-1 font-medium text-amber-200">Importar SIGMINE</p>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncSelectedUfs()}
          className="mb-1 w-full rounded-lg bg-amber-600 py-1.5 text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {syncing
            ? "A importar…"
            : ufs.length > 0
              ? `Importar ${ufs.join(", ")}`
              : "Importar MG (padrão)"}
        </button>
        {importStatus && <p className="text-[10px] text-amber-300">{importStatus}</p>}
        <p className="mt-1 text-[10px] text-slate-500">
          Baixa processos ANM por UF (SIGMINE). Selecione RS, SC, etc. antes de importar.
        </p>
      </section>
    </aside>
  );
}
