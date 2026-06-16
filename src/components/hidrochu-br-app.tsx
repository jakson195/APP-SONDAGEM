"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ajustarGumbelChow,
  tabelaQuantis,
} from "@/lib/hidrochu/gumbel-chow";
import {
  intensidadeIdf,
  IDF_PADRAO_CURTA,
  type CoefIdf,
} from "@/lib/hidrochu/idf";
import { parseSerie } from "@/lib/hidrochu/parse-serie";
import { PERIODOS_RETORNO } from "@/lib/hidrochu/types";
import {
  acumuladoDias,
  maxDiariaRecente,
  serieMaximasAnuaisValores,
} from "@/lib/hidrochu-br/daily-series";
import {
  buscarEstacoes,
  carregarCatalogoBrasil,
  estacaoPorCodigo,
  UFS_BR,
  type CatalogoBrasil,
} from "@/lib/hidrochu-br/estacoes-catalog";
import { preverEnchenteFromSerie } from "@/lib/hidrochu-br/flood-predict";
import { autoImportFromFonte, bulkImportNacional, fetchEstacoesApi } from "@/lib/hidrochu-br/auto-import-client";
import { FONTES_HIDRO_BR } from "@/lib/hidrochu-br/sources";
import type {
  ContextoEnchenteInformado,
  EstacaoBrasil,
  FonteHidrologica,
  HidroBrPersisted,
  PrevisaoEnchenteResult,
  RegistroDiarioBr,
} from "@/lib/hidrochu-br/types";

const LS_KEY = "datageo-digital:hidrochu-br-v1";

const TABS = [
  { id: "estacao", label: "Estações Brasil" },
  { id: "importar", label: "Importar ANA / CSV" },
  { id: "calculos", label: "Chuvas e IDF" },
  { id: "enchentes", label: "Previsão enchentes (IA)" },
  { id: "fontes", label: "Fontes de dados" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded border border-[var(--border)] bg-[var(--card)] p-3">
      <legend className="px-1 text-xs font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function fmt(n: number, d = 1) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

const NIVEL_COR: Record<PrevisaoEnchenteResult["nivel"], string> = {
  baixo: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  moderado: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  alto: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
  critico: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
};

export function HidroChuBrApp() {
  const [catalogo, setCatalogo] = useState<CatalogoBrasil | null>(null);
  const [tab, setTab] = useState<TabId>("estacao");
  const [uf, setUf] = useState("SC");
  const [busca, setBusca] = useState("");
  const [estacao, setEstacao] = useState<EstacaoBrasil | null>(null);
  const [serie, setSerie] = useState<RegistroDiarioBr[]>([]);
  const [serie1dia, setSerie1dia] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataIni, setDataIni] = useState("2015-01-01");
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [codManual, setCodManual] = useState("");
  const [idfCurta, setIdfCurta] = useState<CoefIdf>(IDF_PADRAO_CURTA);
  const [previsao, setPrevisao] = useState<PrevisaoEnchenteResult | null>(null);
  const [ctx, setCtx] = useState<ContextoEnchenteInformado>({
    saturacaoSolo: 0.4,
    impermeabilizacao: 0.35,
    alertaOficial: "nenhum",
  });
  const [fontePreferida, setFontePreferida] = useState<FonteHidrologica>("ANA");
  const [autoImport, setAutoImport] = useState(true);
  const [catalogoFonte, setCatalogoFonte] = useState<"seed" | "ana">("seed");
  const [estacoesAna, setEstacoesAna] = useState<EstacaoBrasil[]>([]);
  const [catalogoLabel, setCatalogoLabel] = useState("seed");
  const [maxBulk, setMaxBulk] = useState(10);
  const [tipoCatalogo, setTipoCatalogo] = useState<"" | "Pluviometrica" | "Fluviometrica">(
    "Pluviometrica",
  );
  const [soTelemetrica, setSoTelemetrica] = useState(false);
  const [bulkResumo, setBulkResumo] = useState<string | null>(null);
  const [seriesNacionais, setSeriesNacionais] = useState<Record<string, RegistroDiarioBr[]>>({});

  const selecionarEstacaoRef = useRef<(e: EstacaoBrasil) => void>(() => {});

  useEffect(() => {
    carregarCatalogoBrasil()
      .then((c) => {
        setCatalogo(c);
        const list = buscarEstacoes(c, { uf: "SC" });
        const preferida =
          list.find((e) => e.codigo === "02652000") ??
          list.find((e) => e.codigo === "02650000") ??
          list[0];
        if (preferida) selecionarEstacaoRef.current(preferida);
      })
      .catch(() => setImportMsg("Catálogo nacional não carregou."));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as HidroBrPersisted;
      if (p.serie1dia) setSerie1dia(p.serie1dia);
      if (p.contextoEnchente) setCtx(p.contextoEnchente);
      if (p.estacaoAtiva) setEstacao(p.estacaoAtiva);
      if (p.fontePreferida) setFontePreferida(p.fontePreferida);
      if (p.autoImportEnabled != null) setAutoImport(p.autoImportEnabled);
      const cod = p.estacoesFavoritas?.[0];
      if (cod && p.series?.[cod]) setSerie(p.series[cod]!);
      if (p.series && Object.keys(p.series).length > 1) setSeriesNacionais(p.series);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback(() => {
    if (!estacao) return;
    const p: HidroBrPersisted = {
      estacoesFavoritas: [estacao.codigo],
      series: { [estacao.codigo]: serie },
      estacaoAtiva: estacao,
      serie1dia,
      contextoEnchente: ctx,
      fontePreferida,
      autoImportEnabled: autoImport,
      ultimaImportacao: new Date().toISOString(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  }, [estacao, serie, serie1dia, ctx, fontePreferida, autoImport]);

  const aplicarImportacao = useCallback(
    (regs: RegistroDiarioBr[], avisos: string[], fonteUsada: string, est?: EstacaoBrasil) => {
      if (regs.length < 3) {
        setImportMsg(
          [...avisos, "Menos de 3 registos — tente outra fonte ou CSV manual."].join(" "),
        );
        return false;
      }
      setSerie(regs);
      const maxAnuais = serieMaximasAnuaisValores(regs);
      const serie1 = maxAnuais.length >= 5 ? maxAnuais.join("\n") : serie1dia;
      if (maxAnuais.length >= 5) setSerie1dia(serie1);
      setImportMsg(
        avisos.length
          ? `Importação (${fonteUsada}): ${regs.length} registos.\n${avisos.join("\n")}`
          : `Importação (${fonteUsada}): ${regs.length} registos.`,
      );
      const estSave = est ?? estacao;
      if (estSave) {
        const p: HidroBrPersisted = {
          estacoesFavoritas: [estSave.codigo],
          series: { [estSave.codigo]: regs },
          estacaoAtiva: estSave,
          serie1dia: serie1,
          contextoEnchente: ctx,
          fontePreferida,
          autoImportEnabled: autoImport,
          ultimaImportacao: new Date().toISOString(),
        };
        localStorage.setItem(LS_KEY, JSON.stringify(p));
      }
      return true;
    },
    [estacao, serie1dia, ctx, fontePreferida, autoImport],
  );

  const importarAutomatico = useCallback(
    async (est: EstacaoBrasil, fonte?: FonteHidrologica) => {
      setLoading(true);
      setImportMsg(`A importar de ${fonte ?? fontePreferida ?? est.fonte}…`);
      try {
        const data = await autoImportFromFonte({
          estacao: est,
          fonte: fonte ?? fontePreferida,
          dataInicio: dataIni,
          dataFim: dataFim,
        });
        aplicarImportacao(data.registros, data.avisos, data.fonteUsada, est);
      } catch (e) {
        setImportMsg(e instanceof Error ? e.message : "Erro na importação automática");
      } finally {
        setLoading(false);
      }
    },
    [fontePreferida, dataIni, dataFim, aplicarImportacao],
  );

  const selecionarEstacao = useCallback(
    (e: EstacaoBrasil) => {
      setEstacao(e);
      setCodManual(e.codigo);
      setFontePreferida(e.fonte);
      if (autoImport) void importarAutomatico(e, e.fonte);
    },
    [autoImport, importarAutomatico],
  );

  selecionarEstacaoRef.current = selecionarEstacao;

  const carregarCatalogoAna = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setImportMsg(`A carregar inventário ANA (${uf})…`);
      try {
        const data = await fetchEstacoesApi({
          uf,
          q: busca || undefined,
          fonte: "ana",
          refresh,
          tipo: tipoCatalogo || undefined,
          telemetrica: soTelemetrica ? "1" : undefined,
        });
        setEstacoesAna(data.estacoes);
        setCatalogoLabel(data.fonte);
        setImportMsg(
          data.aviso
            ? `Catálogo ANA: ${data.total} estações (${uf}).\n${data.aviso}`
            : `Catálogo ANA: ${data.total} estações em ${uf}.`,
        );
      } catch (e) {
        setImportMsg(e instanceof Error ? e.message : "Erro ao carregar catálogo ANA");
      } finally {
        setLoading(false);
      }
    },
    [uf, busca, tipoCatalogo, soTelemetrica],
  );

  const importarNacional = useCallback(async () => {
    setLoading(true);
    setBulkResumo(null);
    setImportMsg(`Importação nacional (${uf}) — até ${maxBulk} estações…`);
    try {
      const data = await bulkImportNacional({
        uf,
        fonteCatalogo: "ana",
        tipo: tipoCatalogo || undefined,
        telemetrica: soTelemetrica ? "1" : undefined,
        dataInicio: dataIni,
        dataFim: dataFim,
        fonte: fontePreferida,
        maxEstacoes: maxBulk,
      });
      setSeriesNacionais((prev) => ({ ...prev, ...data.series }));
      const fav = Object.keys(data.series);
      const p: HidroBrPersisted = {
        estacoesFavoritas: fav,
        series: { ...seriesNacionais, ...data.series },
        estacaoAtiva: estacao ?? undefined,
        serie1dia,
        contextoEnchente: ctx,
        fontePreferida,
        autoImportEnabled: autoImport,
        ultimaImportacao: new Date().toISOString(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(p));
      const firstOk = data.itens.find((i) => i.ok);
      if (firstOk && data.series[firstOk.codigo]) {
        setSerie(data.series[firstOk.codigo]!);
        setEstacao({
          codigo: firstOk.codigo,
          nome: firstOk.nome,
          uf,
          municipio: "",
          tipo: "Pluviometrica",
          latitude: 0,
          longitude: 0,
          fonte: "ANA",
        });
      }
      setBulkResumo(
        `${data.sucesso}/${data.processadas} com série · ${Object.keys(data.series).length} guardadas`,
      );
      setImportMsg(
        [
          `Importação nacional: ${data.sucesso} OK, ${data.falhas} falhas (${data.processadas} processadas).`,
          ...data.avisos,
          data.itens
            .slice(0, 8)
            .map((i) => `${i.codigo} ${i.nome}: ${i.ok ? i.total + " reg (" + i.fonteUsada + ")" : "falhou"}`)
            .join("\n"),
          data.itens.length > 8 ? `… e mais ${data.itens.length - 8} estações` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Erro na importação nacional");
    } finally {
      setLoading(false);
    }
  }, [
    uf,
    tipoCatalogo,
    soTelemetrica,
    dataIni,
    dataFim,
    fontePreferida,
    maxBulk,
    estacao,
    serie1dia,
    ctx,
    autoImport,
    seriesNacionais,
  ]);

  const estacoesFiltradas = useMemo(() => {
    if (catalogoFonte === "ana") {
      let list = estacoesAna;
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        list = list.filter(
          (e) =>
            e.nome.toLowerCase().includes(q) ||
            e.municipio.toLowerCase().includes(q) ||
            e.codigo.includes(q),
        );
      }
      return list.slice(0, 300);
    }
    if (!catalogo) return [];
    return buscarEstacoes(catalogo, { uf, q: busca });
  }, [catalogo, catalogoFonte, estacoesAna, uf, busca]);

  const valoresGumbel = useMemo(() => {
    const fromSerie = serieMaximasAnuaisValores(serie);
    if (fromSerie.length >= 5) return fromSerie;
    return parseSerie(serie1dia);
  }, [serie, serie1dia]);

  const gumbel = useMemo(() => {
    if (valoresGumbel.length < 5) return null;
    return ajustarGumbelChow({ duracaoDias: 1, valores: valoresGumbel });
  }, [valoresGumbel]);

  const p1Tr10 = useMemo(() => {
    if (!gumbel) return 80;
    const row = tabelaQuantis(gumbel).find((r) => r.T === 10);
    return row?.x ?? 80;
  }, [gumbel]);

  const importarAna = useCallback(async () => {
    const cod = (codManual || estacao?.codigo)?.trim();
    if (!cod) {
      setImportMsg("Informe o código da estação ANA.");
      return;
    }
    const est =
      estacao ??
      (catalogo ? estacaoPorCodigo(catalogo, cod) : null) ??
      ({
        codigo: cod,
        nome: cod,
        uf: "BR",
        municipio: "",
        tipo: "Pluviometrica" as const,
        latitude: 0,
        longitude: 0,
        fonte: "ANA" as const,
      } satisfies EstacaoBrasil);
    await importarAutomatico(est, "ANA");
    setTab("calculos");
  }, [codManual, estacao, catalogo, importarAutomatico]);

  const importarCsv = useCallback(
    async (text: string) => {
      const cod = (codManual || estacao?.codigo)?.trim();
      if (!cod) {
        setImportMsg("Defina o código da estação antes do CSV.");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/hidrochu-br/ana/serie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codEstacao: cod, csvText: text }),
        });
        const data = (await res.json()) as {
          registros?: RegistroDiarioBr[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "CSV inválido");
        const regs = data.registros ?? [];
        setSerie(regs);
        const maxAnuais = serieMaximasAnuaisValores(regs);
        if (maxAnuais.length >= 5) setSerie1dia(maxAnuais.join("\n"));
        setImportMsg(`CSV: ${regs.length} registos importados.`);
        setTab("calculos");
      } catch (e) {
        setImportMsg(e instanceof Error ? e.message : "Erro CSV");
      } finally {
        setLoading(false);
      }
    },
    [codManual, estacao],
  );

  const calcularEnchente = useCallback(async () => {
    if (!estacao || serie.length < 3) {
      setImportMsg("Importe série diária (mín. 3 dias) antes da previsão.");
      return;
    }
    setLoading(true);
    try {
      const i1h = intensidadeIdf(idfCurta, 10, 60);
      const res = await fetch("/api/hidrochu-br/flood/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estacao,
          serieDiaria: serie,
          p1diaTr10Mm: p1Tr10,
          i1hTr10MmH: i1h,
          contexto: ctx,
        }),
      });
      const data = (await res.json()) as PrevisaoEnchenteResult & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setPrevisao(data);
      persist();
    } catch (e) {
      const local = preverEnchenteFromSerie(estacao, serie, {
        p1diaTr10Mm: p1Tr10,
        i1hTr10MmH: intensidadeIdf(idfCurta, 10, 60),
        contexto: ctx,
      });
      setPrevisao(local);
      if (!local) {
        setImportMsg(e instanceof Error ? e.message : "Erro na previsão");
      }
    } finally {
      setLoading(false);
    }
  }, [estacao, serie, p1Tr10, idfCurta, ctx, persist]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--text)] sm:text-2xl">
          HidroBrasil — Hidrologia nacional
        </h1>
        <p className="text-sm text-[var(--muted)]">
          DataGeo Digital · Cálculos em nível Brasil · ANA, INMET, CPRM · Previsão
          de enchentes por IA (dados coletados + contexto informado)
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.id
                ? "bg-teal-600 text-white"
                : "text-[var(--muted)] hover:bg-[var(--muted)]/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {importMsg && (
        <p
          className={`whitespace-pre-line rounded-lg border px-3 py-2 text-sm ${
            importMsg.includes("(Demo)")
              ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
              : "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-100"
          }`}
        >
          {importMsg}
        </p>
      )}

      {tab === "estacao" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Fonte e importação automática">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoImport}
                onChange={(e) => setAutoImport(e.target.checked)}
              />
              Importar automaticamente ao selecionar estação
            </label>
            <label className="mt-2 block text-xs">
              Fonte preferida
              <select
                value={fontePreferida}
                onChange={(e) => setFontePreferida(e.target.value as FonteHidrologica)}
                className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              >
                {FONTES_HIDRO_BR.filter((f) => f.status !== "planejado").map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            {estacao && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void importarAutomatico(estacao)}
                className="mt-2 w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "A importar…" : `Importar agora (${fontePreferida})`}
              </button>
            )}
          </Panel>
          <Panel title="Filtro nacional">
            <div className="mb-2 flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={catalogoFonte === "seed"}
                  onChange={() => setCatalogoFonte("seed")}
                />
                Catálogo seed (30)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={catalogoFonte === "ana"}
                  onChange={() => setCatalogoFonte("ana")}
                />
                ANA inventário (UF)
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                {UFS_BR.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Nome, município ou código ANA"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="min-w-[12rem] flex-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </div>
            {catalogoFonte === "ana" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={tipoCatalogo}
                  onChange={(e) =>
                    setTipoCatalogo(e.target.value as typeof tipoCatalogo)
                  }
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                >
                  <option value="">Todos os tipos</option>
                  <option value="Pluviometrica">Pluviométricas</option>
                  <option value="Fluviometrica">Fluviométricas</option>
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={soTelemetrica}
                    onChange={(e) => setSoTelemetrica(e.target.checked)}
                  />
                  Só telemétricas
                </label>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void carregarCatalogoAna(false)}
                  className="rounded bg-teal-600/90 px-2 py-1 text-xs text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Carregar ANA
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void carregarCatalogoAna(true)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]/10"
                >
                  Actualizar
                </button>
              </div>
            )}
            <p className="mt-2 text-xs text-[var(--muted)]">
              {catalogoFonte === "ana"
                ? estacoesAna.length
                  ? `${estacoesFiltradas.length} listadas · ${estacoesAna.length} no inventário ANA (${uf})${estacoesFiltradas.length < estacoesAna.length ? " — use busca para filtrar" : ""}`
                  : "Carregue o inventário ANA para esta UF (milhares de estações)."
                : catalogo
                  ? `${estacoesFiltradas.length} estações (catálogo seed: ${catalogo.estacoes.length})`
                  : "Carregando…"}
            </p>
          </Panel>
          <Panel title="Estação selecionada">
            <ul className="max-h-48 overflow-y-auto text-sm">
              {estacoesFiltradas.map((e) => (
                <li key={e.codigo}>
                  <button
                    type="button"
                    onClick={() => selecionarEstacao(e)}
                    className={`w-full rounded px-2 py-1 text-left hover:bg-[var(--muted)]/10 ${
                      estacao?.codigo === e.codigo ? "bg-teal-600/15 font-medium" : ""
                    }`}
                  >
                    {e.codigo} — {e.nome} ({e.uf}) · {e.tipo}
                  </button>
                </li>
              ))}
            </ul>
            {estacao && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {estacao.municipio} · {estacao.bacia ?? "—"} ·{" "}
                {estacao.latitude.toFixed(3)}, {estacao.longitude.toFixed(3)}
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "importar" && (
        <div className="grid gap-4">
          <Panel title="Importação nacional (lote ANA)">
            <p className="text-xs text-[var(--muted)]">
              Importa séries de várias estações da UF seleccionada. Use catálogo{" "}
              <strong>ANA inventário</strong> na aba Estações para cobertura nacional por
              estado (~22 000 pluviométricas no Brasil).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs">UF: <strong>{uf}</strong></span>
              <select
                value={maxBulk}
                onChange={(e) => setMaxBulk(Number(e.target.value))}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                {[5, 10, 15, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    Máx. {n} estações
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={loading}
                onClick={() => void importarNacional()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "A importar lote…" : "Importar UF (lote ANA)"}
              </button>
            </div>
            {bulkResumo && (
              <p className="mt-2 text-xs font-medium text-teal-800 dark:text-teal-200">
                {bulkResumo} · {Object.keys(seriesNacionais).length} séries em memória local
              </p>
            )}
          </Panel>
          <Panel title="Importação automática por fonte">
            <p className="text-xs text-[var(--muted)]">
              ANA (TelemetriaWS) com fallback INMET; ou INMET com fallback ANA. Período
              abaixo aplica-se a todas as fontes.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="date"
                value={dataIni}
                onChange={(e) => setDataIni(e.target.value)}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
              <button
                type="button"
                disabled={loading || !estacao}
                onClick={() => estacao && void importarAutomatico(estacao)}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Importar automaticamente
              </button>
            </div>
          </Panel>
          <Panel title="ANA — TelemetriaWS / HidroWeb">
            <div className="flex flex-wrap gap-2">
              <input
                value={codManual}
                onChange={(e) => setCodManual(e.target.value)}
                placeholder="Código ANA (8 dígitos)"
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={dataIni}
                onChange={(e) => setDataIni(e.target.value)}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void importarAna()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "Importando…" : "Buscar série ANA (chuva)"}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Se a API pública falhar, exporte CSV em{" "}
              <a
                href="https://www.snirh.gov.br/hidroweb/"
                className="text-teal-700 underline"
                target="_blank"
                rel="noreferrer"
              >
                snirh.gov.br/hidroweb
              </a>{" "}
              e importe abaixo.
            </p>
          </Panel>
          <Panel title="CSV / TSV (ANA, INMET, manual)">
            <label className="block cursor-pointer rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm hover:bg-[var(--muted)]/5">
              Selecionar ficheiro CSV
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const text = await f.text();
                  await importarCsv(text);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <textarea
              className="mt-2 h-24 w-full rounded border border-[var(--border)] p-2 font-mono text-xs"
              placeholder="Ou cole: data;chuva_mm (uma linha por dia)"
              onBlur={(e) => {
                if (e.target.value.trim().length > 20) {
                  void importarCsv(e.target.value);
                }
              }}
            />
          </Panel>
          {serie.length > 0 && (
            <p className="text-sm">
              Série ativa: <strong>{serie.length}</strong> dias · P7d ={" "}
              <strong>{fmt(acumuladoDias(serie, 7))}</strong> mm · P24h ={" "}
              <strong>{fmt(maxDiariaRecente(serie, 1))}</strong> mm
            </p>
          )}
        </div>
      )}

      {tab === "calculos" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Máximas anuais (Gumbel-Chow)">
            <textarea
              value={serie1dia}
              onChange={(e) => setSerie1dia(e.target.value)}
              className="h-32 w-full rounded border border-[var(--border)] p-2 font-mono text-xs"
              placeholder="Máximas anuais 1 dia (mm), uma por linha"
            />
            {gumbel && (
              <p className="mt-2 text-xs">
                n={gumbel.n} · α={fmt(gumbel.alpha, 3)} · β={fmt(gumbel.beta, 2)}{" "}
                · K-S {gumbel.ksOk ? "OK" : "revisar"}
              </p>
            )}
          </Panel>
          <Panel title="Períodos de retorno">
            {gumbel ? (
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th>T (a)</th>
                    <th>P (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {tabelaQuantis(gumbel).map((r) => (
                    <tr key={r.T}>
                      <td>{r.T}</td>
                      <td>{fmt(r.x, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Mínimo 5 máximas anuais (importe série ou cole valores).
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "enchentes" && (
        <div className="grid gap-4">
          <Panel title="Contexto informado (IA)">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Saturação solo (0–1)
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ctx.saturacaoSolo ?? 0.4}
                  onChange={(e) =>
                    setCtx((c) => ({
                      ...c,
                      saturacaoSolo: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="text-xs">
                Impermeabilização (0–1)
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ctx.impermeabilizacao ?? 0.35}
                  onChange={(e) =>
                    setCtx((c) => ({
                      ...c,
                      impermeabilizacao: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="text-xs">
                Alerta oficial
                <select
                  value={ctx.alertaOficial ?? "nenhum"}
                  onChange={(e) =>
                    setCtx((c) => ({
                      ...c,
                      alertaOficial: e.target
                        .value as ContextoEnchenteInformado["alertaOficial"],
                    }))
                  }
                  className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1"
                >
                  <option value="nenhum">Nenhum</option>
                  <option value="atenção">Atenção</option>
                  <option value="alerta">Alerta</option>
                  <option value="emergência">Emergência</option>
                </select>
              </label>
              <label className="text-xs sm:col-span-2">
                Observações de campo / comunidade
                <textarea
                  value={ctx.observacoes ?? ""}
                  onChange={(e) =>
                    setCtx((c) => ({ ...c, observacoes: e.target.value }))
                  }
                  className="mt-1 h-16 w-full rounded border border-[var(--border)] p-2 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={loading || !estacao}
              onClick={() => void calcularEnchente()}
              className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Calcular previsão de enchente (IA)
            </button>
          </Panel>

          {previsao && (
            <div
              className={`rounded-xl border p-4 ${NIVEL_COR[previsao.nivel]}`}
            >
              <h3 className="text-lg font-bold capitalize">
                Risco {previsao.nivel} — score {previsao.score}/100
              </h3>
              <p className="mt-1 text-sm">
                Prob. evento significativo: 24 h → {previsao.probabilidade24h}% ·
                72 h → {previsao.probabilidade72h}%
              </p>
              <p className="mt-1 text-xs opacity-80">Modelo: {previsao.modelo}</p>
              <ul className="mt-3 list-disc pl-5 text-sm">
                {previsao.recomendacoes.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <table className="mt-4 w-full text-xs">
                <thead>
                  <tr>
                    <th>Fator</th>
                    <th>Contrib.</th>
                  </tr>
                </thead>
                <tbody>
                  {previsao.fatores
                    .sort((a, b) => b.contribuicao - a.contribuicao)
                    .map((f) => (
                      <tr key={f.id}>
                        <td>{f.label}</td>
                        <td>{(f.contribuicao * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "fontes" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {FONTES_HIDRO_BR.map((f) => (
            <div
              key={f.id}
              className="rounded-lg border border-[var(--border)] p-3 text-sm"
            >
              <h3 className="font-semibold">{f.nome}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{f.descricao}</p>
              <p className="mt-2 text-xs">
                Formatos: {f.formatos.join(", ")} ·{" "}
                <span
                  className={
                    f.status === "ativo"
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }
                >
                  {f.status}
                </span>
              </p>
              {f.status === "ativo" && f.id !== "Manual" && estacao && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void importarAutomatico(estacao, f.id as FonteHidrologica)
                  }
                  className="mt-2 rounded-lg border border-teal-600/50 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-600/20 dark:text-teal-200"
                >
                  Importar automaticamente desta fonte
                </button>
              )}
              {f.url !== "#" && (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-teal-700 underline"
                >
                  Abrir portal
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Santa Catarina (294 municípios EPAGRI): use{" "}
        <a href="/hidrologia/chuvas-sc" className="text-teal-700 underline">
          HidroChuSC
        </a>
        . Mapa 3D nacional (ANA + CPRM):{" "}
        <a href="/hidrologia/hidrogeo-brasil" className="text-teal-700 underline">
          HidroGeo Brasil
        </a>
        .
      </p>
    </div>
  );
}
