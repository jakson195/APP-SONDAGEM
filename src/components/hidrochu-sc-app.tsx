"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ESTACOES_SC_DEMO } from "@/lib/hidrochu/estacoes-demo";
import {
  buscarMunicipio,
  carregarCatalogoHidroChu,
  coeficientesIdfMunicipio,
  estacaoDoMunicipio,
  listaMunicipiosCatalogo,
  type HidroChuCatalog,
} from "@/lib/hidrochu/hidrochu-catalog";
import type { EstacaoScDemo } from "@/lib/hidrochu/estacoes-demo";
import {
  ajustarGumbelChow,
  estatisticasDeSerie,
  tabelaQuantis,
} from "@/lib/hidrochu/gumbel-chow";
import {
  alturaIdf,
  IDF_PADRAO_CURTA,
  IDF_PADRAO_LONGA,
  intensidadeIdf,
  type CoefIdf,
} from "@/lib/hidrochu/idf";
import { analiseMesOcorrencia, MESES } from "@/lib/hidrochu/mes-ocorrencia";
import { parseSerie } from "@/lib/hidrochu/parse-serie";
import { gerarRelatorioHidroChuSC } from "@/lib/hidrochu/report-text";
import type { HidroChuDuracaoInput, HidroChuEstacao } from "@/lib/hidrochu/types";
import { PERIODOS_RETORNO } from "@/lib/hidrochu/types";

const LS_KEY = "datageo-digital:hidrochu-sc-v2";

const TABS = [
  { id: "estacao", label: "Seleção da Estação" },
  { id: "estatisticas", label: "Estatísticas" },
  { id: "chuvas", label: "Chuvas máximas" },
  { id: "multi", label: "1 a 10 dias" },
  { id: "idf", label: "Equação IDF" },
  { id: "bell", label: "Equação Bell" },
  { id: "relacoes", label: "Relações entre durações" },
  { id: "mes", label: "Mês de ocorrência" },
  { id: "relatorio", label: "Relatórios" },
  { id: "sobre", label: "Sobre" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={`rounded border border-[var(--border)] bg-[var(--card)] p-3 ${className}`}
    >
      <legend className="px-1 text-xs font-semibold text-[var(--text)]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function HidroChuScApp() {
  const [catalogo, setCatalogo] = useState<HidroChuCatalog | null>(null);
  const [catalogoErro, setCatalogoErro] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("estacao");
  const [municipio, setMunicipio] = useState("Abelardo Luz");
  const [estIdx, setEstIdx] = useState(0);
  const [estacao, setEstacao] = useState<HidroChuEstacao>(ESTACOES_SC_DEMO[0]);
  const [serie1dia, setSerie1dia] = useState("");
  const [statsExtra, setStatsExtra] = useState("");
  const [mesContagens, setMesContagens] = useState(
    "4,5,1,0,7,3,2,3,1,3,1,5",
  );
  const [duracaoDias, setDuracaoDias] = useState(1);
  const [intConf, setIntConf] = useState(95);
  const [nivelKs, setNivelKs] = useState(5);
  const [relatorio, setRelatorio] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [chartLogX, setChartLogX] = useState(true);
  const [chartGrid, setChartGrid] = useState(true);
  const [idfCurta, setIdfCurta] = useState(IDF_PADRAO_CURTA);
  const [idfLonga, setIdfLonga] = useState(IDF_PADRAO_LONGA);
  const [idfT, setIdfT] = useState(10);
  const [idfDur, setIdfDur] = useState(5);
  const [relacaoT, setRelacaoT] = useState(2);
  const [relacaoP1dia, setRelacaoP1dia] = useState(100);

  useEffect(() => {
    carregarCatalogoHidroChu()
      .then((cat) => {
        setCatalogo(cat);
        setCatalogoErro(null);
        const coef = coeficientesIdfMunicipio(cat);
        setIdfCurta(coef.curta);
        setIdfLonga(coef.longa);
      })
      .catch(() =>
        setCatalogoErro("Catálogo EPAGRI/HidroChu não carregado — apenas estações demo."),
      );
  }, []);

  const municipiosLista = useMemo(
    () => (catalogo ? listaMunicipiosCatalogo(catalogo) : ["Abelardo Luz", "Meleiro", "Antônio Carlos"]),
    [catalogo],
  );

  const dadosMunicipio = useMemo(
    () => (catalogo ? buscarMunicipio(catalogo, municipio) : undefined),
    [catalogo, municipio],
  );

  useEffect(() => {
    if (!dadosMunicipio) return;
    setRelacaoP1dia(dadosMunicipio.p1dia10);
    if (catalogo) {
      const coef = coeficientesIdfMunicipio(catalogo);
      setIdfCurta(coef.curta);
      setIdfLonga(coef.longa);
    }
  }, [dadosMunicipio, catalogo]);

  const estacoesMun = useMemo(
    () => ESTACOES_SC_DEMO.filter((e) => e.municipio === municipio),
    [municipio],
  );

  const estacaoDemo = estacoesMun[estIdx] ?? estacoesMun[0];

  const selecionarEstacao = useCallback((e: EstacaoScDemo) => {
    setEstacao({
      nome: e.nome,
      municipio: e.municipio,
      codigo: e.codigo,
      latitude: e.latitude,
      longitude: e.longitude,
      altitude: e.altitude,
      fonte: e.fonte,
      anoInicial: e.anoInicial,
      anoFinal: e.anoFinal,
    });
  }, []);

  useEffect(() => {
    const demo = estacoesMun[estIdx] ?? estacoesMun[0];
    if (demo) {
      selecionarEstacao(demo);
      return;
    }
    setEstacao(estacaoDoMunicipio(municipio, dadosMunicipio));
  }, [municipio, estIdx, estacoesMun, dadosMunicipio, selecionarEstacao]);

  const duracoes = useMemo((): HidroChuDuracaoInput[] => {
    const lista: HidroChuDuracaoInput[] = [];
    const v1 = parseSerie(serie1dia);
    if (v1.length > 0) {
      lista.push({ duracaoDias: 1, valores: v1, ...estatisticasDeSerie(v1) });
    }
    for (const linha of statsExtra.split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#")) continue;
      const p = t.split(/[;\t]+/).map((x) => x.trim().replace(",", "."));
      if (p.length < 4) continue;
      const dur = Number(p[0]);
      const media = Number(p[1]);
      const desvio = Number(p[2]);
      if (!Number.isFinite(dur) || dur < 2 || dur > 10) continue;
      if (!Number.isFinite(media) || !Number.isFinite(desvio)) continue;
      lista.push({
        duracaoDias: dur,
        media,
        desvio,
        assimetria: Number(p[3]) || 0,
        maior: Number(p[4]) || media,
        menor: Number(p[5]) || media,
      });
    }
    return lista;
  }, [serie1dia, statsExtra]);

  const fitAtivo = useMemo(() => {
    const d =
      duracoes.find((x) => x.duracaoDias === duracaoDias) ??
      duracoes.find((x) => x.duracaoDias === 1);
    if (!d) return null;
    try {
      return ajustarGumbelChow(d);
    } catch {
      return null;
    }
  }, [duracoes, duracaoDias]);

  const quants = fitAtivo ? tabelaQuantis(fitAtivo) : [];

  const chartData = useMemo(() => {
    if (!fitAtivo) return [];
    return quants.map((q) => {
      const half = (q.x - fitAtivo.beta) * 0.12;
      return {
        T: q.T,
        x: q.x,
        li: q.x - half,
        ls: q.x + half,
      };
    });
  }, [fitAtivo, quants]);

  const multiMatrix = useMemo(() => {
    const fits = duracoes
      .map((d) => {
        try {
          return { d: d.duracaoDias, fit: ajustarGumbelChow(d) };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { d: number; fit: ReturnType<typeof ajustarGumbelChow> }[];
    return PERIODOS_RETORNO.map((T) => {
      const row: Record<string, number | string> = { T };
      for (const f of fits) {
        row[`d${f.d}`] =
          f.fit.beta +
          (1 / f.fit.alpha) * (-Math.log(-Math.log(1 - 1 / T)));
      }
      return row;
    });
  }, [duracoes]);

  const mesAnalise = useMemo(() => {
    const parts = mesContagens.split(/[,;\s]+/).map(Number);
    const arr = MESES.map((_, i) => parts[i] ?? 0);
    return analiseMesOcorrencia(arr);
  }, [mesContagens]);

  const idfInt = intensidadeIdf(
    idfDur <= idfCurta.limiteMin ? idfCurta : idfLonga,
    idfT,
    idfDur,
  );

  const calcularRelatorio = useCallback(() => {
    setErro(null);
    try {
      if (duracoes.length === 0) throw new Error("Informe dados na estação / série 1 dia.");
      setRelatorio(gerarRelatorioHidroChuSC(estacao, duracoes));
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ estacao, serie1dia, statsExtra, mesContagens }),
      );
    } catch (e) {
      setRelatorio(null);
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }, [duracoes, estacao, serie1dia, statsExtra, mesContagens]);

  const descarregar = () => {
    if (!relatorio) return;
    const blob = new Blob([relatorio], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HidroChuSC-${estacao.codigo || "estacao"}.txt`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">
            HidroChuSC — Chuvas máximas de Santa Catarina
          </h1>
          <p className="text-[11px] text-[var(--muted)]">
            DataGeo Digital · HidroChuSC v1.0
            {catalogo
              ? ` · ${catalogo.totalMunicipios} municípios (EPAGRI/HidroChu)`
              : ""}
          </p>
        </div>
      </div>

      <nav className="flex gap-0.5 overflow-x-auto border border-[var(--border)] bg-[var(--surface)] p-0.5 text-[11px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded px-2.5 py-1.5 font-medium transition ${
              tab === t.id
                ? "bg-teal-600 text-white"
                : "text-[var(--text)] hover:bg-[var(--card)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {catalogoErro && (
        <p className="text-sm text-amber-700" role="status">
          {catalogoErro}
        </p>
      )}

      {erro && (
        <p className="text-sm text-red-600" role="alert">
          {erro}
        </p>
      )}

      {tab === "estacao" && (
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <Panel title="Seleção">
              <label className="block text-xs text-[var(--muted)]">
                Município
                <select
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                  value={municipio}
                  onChange={(e) => {
                    setMunicipio(e.target.value);
                    setEstIdx(0);
                  }}
                >
                  {municipiosLista.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  disabled={estacoesMun.length === 0}
                  onClick={() => setEstIdx((i) => Math.max(0, i - 1))}
                >
                  ◀
                </button>
                <select
                  className="min-w-0 flex-1 rounded border px-1 text-xs"
                  value={estIdx}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setEstIdx(i);
                    if (estacoesMun[i]) selecionarEstacao(estacoesMun[i]);
                  }}
                >
                  {estacoesMun.map((e, i) => (
                    <option key={e.id} value={i}>
                      {e.numero} — {e.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  disabled={estacoesMun.length === 0}
                  onClick={() =>
                    setEstIdx((i) => Math.min(estacoesMun.length - 1, i + 1))
                  }
                >
                  ▶
                </button>
              </div>
              {estacoesMun.length === 0 && (
                <p className="mt-2 text-[10px] text-[var(--muted)]">
                  Sem estação pluviométrica demo neste município — use os dados
                  EPAGRI/HidroChu abaixo ou importe série ANA.
                </p>
              )}
            </Panel>
            {dadosMunicipio && catalogo && (
              <Panel title="Chuvas intensas (município)">
                <p className="mb-2 text-[10px] text-[var(--muted)]">
                  {catalogo.fonte} · T = {catalogo.periodoRetorno} anos
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                  <dt className="text-[var(--muted)]">P₁ dia</dt>
                  <dd>{fmt(dadosMunicipio.p1dia10, 1)} mm</dd>
                  <dt className="text-[var(--muted)]">I₁₅</dt>
                  <dd>{fmt(dadosMunicipio.i15_10, 1)} mm/h</dd>
                </dl>
              </Panel>
            )}
            <Panel title="Dados da estação">
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-[var(--muted)]">Município</dt>
                <dd>{estacao.municipio}</dd>
                <dt className="text-[var(--muted)]">Nome</dt>
                <dd>{estacao.nome}</dd>
                <dt className="text-[var(--muted)]">Código</dt>
                <dd>{estacao.codigo}</dd>
                <dt className="text-[var(--muted)]">Lat / Long</dt>
                <dd>
                  {estacao.latitude} · {estacao.longitude}
                </dd>
                <dt className="text-[var(--muted)]">Altitude</dt>
                <dd>{estacao.altitude} m</dd>
                <dt className="text-[var(--muted)]">Período</dt>
                <dd>
                  {estacao.anoInicial > 0
                    ? `${estacao.anoInicial} – ${estacao.anoFinal}`
                    : "— (dados municipais EPAGRI)"}
                </dd>
                {estacaoDemo && (
                  <>
                    <dt className="text-[var(--muted)]">Nº dados</dt>
                    <dd>{estacaoDemo.nDados}</dd>
                    <dt className="text-[var(--muted)]">Falhas</dt>
                    <dd>
                      {estacaoDemo.falhas} (
                      {((estacaoDemo.falhas / estacaoDemo.nDados) * 100).toFixed(2)} %)
                    </dd>
                  </>
                )}
              </dl>
            </Panel>
            <Panel title="Série 1 dia (mm)">
              <textarea
                className="h-24 w-full font-mono text-[11px]"
                value={serie1dia}
                onChange={(e) => setSerie1dia(e.target.value)}
                placeholder="Um valor por linha…"
              />
            </Panel>
            <Panel title="Estatísticas 2–10 dias (opc.)">
              <textarea
                className="h-16 w-full font-mono text-[10px]"
                value={statsExtra}
                onChange={(e) => setStatsExtra(e.target.value)}
                placeholder="2;129,46;36,92;1,32;241,4;80"
              />
            </Panel>
          </div>
          <Panel title="Mapa — estações SC (demonstração)" className="min-h-[360px]">
            <div className="relative h-[320px] rounded bg-slate-100 dark:bg-slate-900">
              <svg viewBox="-53 -28 8 12" className="h-full w-full">
                <rect x="-53" y="-28" width="8" height="12" fill="#e2e8f0" />
                {ESTACOES_SC_DEMO.map((e) => (
                  <g
                    key={e.id}
                    transform={`translate(${e.lng} ${-e.lat})`}
                    className="cursor-pointer"
                    onClick={() => {
                      setMunicipio(e.municipio);
                      const i = ESTACOES_SC_DEMO.findIndex((x) => x.id === e.id);
                      if (i >= 0) {
                        setEstIdx(
                          ESTACOES_SC_DEMO.filter((x) => x.municipio === e.municipio).findIndex(
                            (x) => x.id === e.id,
                          ),
                        );
                        selecionarEstacao(e);
                      }
                    }}
                  >
                    <polygon
                      points="0,-0.08 0.06,0.06 -0.06,0.06"
                      fill={estacao.codigo === e.codigo ? "#dc2626" : "#94a3b8"}
                      stroke="#000"
                      strokeWidth="0.01"
                    />
                    <text y="0.12" fontSize="0.08" textAnchor="middle">
                      {e.numero}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10px] shadow dark:bg-slate-800/90">
                Bacia do Rio Chapecó (referência)
              </p>
            </div>
          </Panel>
        </div>
      )}

      {tab === "estatisticas" && (
        <Panel title="Estatísticas observadas">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b">
                  <th className="py-1 pr-2">Duração</th>
                  <th className="py-1 pr-2">média</th>
                  <th className="py-1 pr-2">desv pad.</th>
                  <th className="py-1 pr-2">Assimetria</th>
                  <th className="py-1 pr-2">maior</th>
                  <th className="py-1">menor</th>
                </tr>
              </thead>
              <tbody>
                {duracoes.map((d) => {
                  try {
                    const f = ajustarGumbelChow(d);
                    return (
                      <tr key={d.duracaoDias} className="border-b border-[var(--border)]">
                        <td className="py-1">{d.duracaoDias} dia(s)</td>
                        <td>{fmt(f.media, 2)}</td>
                        <td>{fmt(f.desvio, 2)}</td>
                        <td>{fmt(f.assimetria, 2)}</td>
                        <td>{fmt(f.maior, 1)}</td>
                        <td>{fmt(f.menor, 1)}</td>
                      </tr>
                    );
                  } catch {
                    return null;
                  }
                })}
              </tbody>
            </table>
          </div>
          {!duracoes.length && (
            <p className="text-xs text-[var(--muted)]">Preencha a série na aba Estação.</p>
          )}
        </Panel>
      )}

      {(tab === "chuvas" || tab === "multi") && (
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,38%)_1fr]">
          <div className="space-y-2">
            <Panel title="Opções">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <label>
                  Duração (dias)
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="mt-0.5 w-full rounded border px-1 py-0.5"
                    value={duracaoDias}
                    onChange={(e) => setDuracaoDias(Number(e.target.value) || 1)}
                  />
                </label>
                <label>
                  Nº valores
                  <input
                    type="number"
                    readOnly
                    className="mt-0.5 w-full rounded border bg-[var(--surface)] px-1 py-0.5"
                    value={fitAtivo?.n ?? 0}
                  />
                </label>
                <label>
                  Int. Conf. (%)
                  <input
                    type="number"
                    className="mt-0.5 w-full rounded border px-1 py-0.5"
                    value={intConf}
                    onChange={(e) => setIntConf(Number(e.target.value))}
                  />
                </label>
              </div>
            </Panel>
            {fitAtivo && (
              <>
                <Panel title="Parâmetros Gumbel-Chow">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {(
                      [
                        ["Alfa", fitAtivo.alpha],
                        ["Beta", fitAtivo.beta],
                        ["Yn", fitAtivo.yn],
                        ["Sn", fitAtivo.sn],
                      ] as const
                    ).map(([lbl, val]) => (
                      <label key={lbl}>
                        {lbl}
                        <input
                          readOnly
                          className="mt-0.5 w-full rounded border bg-[var(--surface)] px-1"
                          value={val.toFixed(4)}
                        />
                      </label>
                    ))}
                  </div>
                </Panel>
                <Panel title="Teste Kolmogorov-Smirnov">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <label>
                      Nível signific. (%)
                      <input
                        type="number"
                        value={nivelKs}
                        onChange={(e) => setNivelKs(Number(e.target.value))}
                        className="mt-0.5 w-full rounded border px-1"
                      />
                    </label>
                    <label>
                      D máximo
                      <input
                        readOnly
                        value={fitAtivo.ksDMax?.toFixed(3) ?? "—"}
                        className="mt-0.5 w-full rounded border bg-[var(--surface)] px-1"
                      />
                    </label>
                    <label className="col-span-2">
                      D Crítico
                      <input
                        readOnly
                        value={fitAtivo.ksDCritico.toFixed(3)}
                        className="mt-0.5 w-full rounded border bg-[var(--surface)] px-1"
                      />
                    </label>
                  </div>
                </Panel>
              </>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={calcularRelatorio}
                className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Calcular
              </button>
              <button
                type="button"
                onClick={() => {
                  calcularRelatorio();
                  setTab("relatorio");
                }}
                className="rounded border px-3 py-1.5 text-xs"
              >
                Relatório ✓
              </button>
            </div>
            {tab === "chuvas" && quants.length > 0 && (
              <div className="overflow-x-auto rounded border text-[10px]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--surface)]">
                      <th className="px-1 py-0.5">T</th>
                      <th>P≤</th>
                      <th>P≥</th>
                      <th>Y</th>
                      <th>X</th>
                      <th>Li</th>
                      <th>Ls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quants.map((q) => {
                      const half = (q.x - (fitAtivo?.beta ?? 0)) * 0.12;
                      return (
                        <tr
                          key={q.T}
                          className={
                            q.T === 2
                              ? "bg-blue-100 dark:bg-blue-950"
                              : q.T === 100
                                ? "bg-amber-100 dark:bg-amber-950"
                                : ""
                          }
                        >
                          <td className="px-1">{q.T}</td>
                          <td>{q.pLe.toFixed(4)}</td>
                          <td>{q.pGe.toFixed(4)}</td>
                          <td>{q.y.toFixed(4)}</td>
                          <td>{q.x.toFixed(1)}</td>
                          <td>{(q.x - half).toFixed(1)}</td>
                          <td>{(q.x + half).toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "multi" && multiMatrix.length > 0 && (
              <div className="overflow-x-auto text-[9px]">
                <table className="w-full border">
                  <thead>
                    <tr>
                      <th>T</th>
                      {duracoes.map((d) => (
                        <th key={d.duracaoDias}>{d.duracaoDias}d</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {multiMatrix.map((row) => (
                      <tr key={String(row.T)}>
                        <td>{row.T}</td>
                        {duracoes.map((d) => (
                          <td key={d.duracaoDias}>
                            {typeof row[`d${d.duracaoDias}`] === "number"
                              ? (row[`d${d.duracaoDias}`] as number).toFixed(1)
                              : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Panel title="Precipitação (mm) × Período de retorno">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    {chartGrid && <CartesianGrid strokeDasharray="3 3" />}
                    <XAxis
                      dataKey="T"
                      scale={chartLogX ? "log" : "linear"}
                      domain={chartLogX ? [1, 100] : ["auto", "auto"]}
                      label={{ value: "T (anos)", position: "insideBottom", offset: -2 }}
                    />
                    <YAxis label={{ value: "mm", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="x" name="Estimado" stroke="#dc2626" dot />
                    <Line type="monotone" dataKey="li" name="Li" stroke="#22c55e" strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="ls" name="Ls" stroke="#a855f7" strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-xs text-[var(--muted)]">
                  Calcular após informar série
                </p>
              )}
            </Panel>
            <Panel title="Formatação do gráfico">
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={chartLogX}
                  onChange={(e) => setChartLogX(e.target.checked)}
                />
                Eixo X logarítmico
              </label>
              <label className="mt-1 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={chartGrid}
                  onChange={(e) => setChartGrid(e.target.checked)}
                />
                Linhas de grade
              </label>
            </Panel>
          </div>
        </div>
      )}

      {tab === "idf" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {catalogo && (
            <p className="col-span-full text-[11px] text-[var(--muted)] lg:col-span-2">
              {municipio}: equação IDF regional SC (HidroChu) — {catalogo.idfRegional.nota ?? catalogo.fonte}
            </p>
          )}
          <Panel title="Equação geral: i = K·T^m / (t+b)^n">
            <IdfCoefTable label="t ≤ 120 min" coef={idfCurta} onChange={setIdfCurta} />
            <IdfCoefTable label="120 < t ≤ 1440 min" coef={idfLonga} onChange={setIdfLonga} className="mt-3" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <label>
                T (anos)
                <input type="number" value={idfT} onChange={(e) => setIdfT(Number(e.target.value))} className="mt-0.5 w-full border rounded px-1" />
              </label>
              <label>
                t (min)
                <input type="number" value={idfDur} onChange={(e) => setIdfDur(Number(e.target.value))} className="mt-0.5 w-full border rounded px-1" />
              </label>
            </div>
            <p className="mt-2 text-[11px]">
              i = <strong>{fmt(idfInt, 2)}</strong> mm/h · h ={" "}
              <strong>{fmt(alturaIdf(idfInt, idfDur), 2)}</strong> mm
            </p>
          </Panel>
          <Panel title="Intensidade × Duração">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={[5, 10, 15, 30, 60, 120, 240, 360, 720, 1440].map((t) => ({
                  t,
                  i: intensidadeIdf(t <= 120 ? idfCurta : idfLonga, idfT, t),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" label={{ value: "min", position: "insideBottom" }} />
                <YAxis label={{ value: "mm/h", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Line type="monotone" dataKey="i" stroke="#2563eb" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {tab === "bell" && (
        <Panel title="Equação Bell (em desenvolvimento)">
          <p className="text-xs text-[var(--muted)]">
            Fórmula Pt,T = (a·ln(T)+b)(c·t^d − e)·P10;60 — use o HidroChuSC.exe para
            coeficientes calibrados por estação. No web, utilize IDF e Gumbel-Chow.
          </p>
        </Panel>
      )}

      {tab === "relacoes" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Dados">
            <label className="text-[11px]">
              T (anos)
              <input type="number" value={relacaoT} onChange={(e) => setRelacaoT(Number(e.target.value))} className="mt-0.5 w-full border rounded px-1" />
            </label>
            <label className="mt-2 block text-[11px]">
              P 1 dia (mm)
              <input type="number" value={relacaoP1dia} onChange={(e) => setRelacaoP1dia(Number(e.target.value))} className="mt-0.5 w-full border rounded px-1" />
            </label>
          </Panel>
          <Panel title="Relação Pd/P1 dia × Duração">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={[5, 30, 60, 360, 720, 1440].map((min) => ({
                  min,
                  rel:
                    min <= 60
                      ? 0.2 + (min / 60) * 0.4
                      : 0.6 + ((min - 60) / 1380) * 0.35,
                }))}
              >
                <CartesianGrid />
                <XAxis dataKey="min" />
                <YAxis domain={[0, 1.2]} />
                <Line type="monotone" dataKey="rel" stroke="#0d9488" />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              Curva ilustrativa (Brasil Cetesb / SC) — calibração completa no desktop.
            </p>
          </Panel>
        </div>
      )}

      {tab === "mes" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,32%)_1fr]">
          <div className="space-y-2">
            <Panel title="Duração (dias)">
              <input type="number" value={duracaoDias} readOnly className="w-full border rounded px-1 text-sm" />
            </Panel>
            <Panel title="Contagens por mês (Jan…Dez)">
              <input
                value={mesContagens}
                onChange={(e) => setMesContagens(e.target.value)}
                className="w-full font-mono text-[11px] border rounded px-1"
                placeholder="4,5,1,0,7,…"
              />
            </Panel>
            <Panel title="Opções">
              <dl className="text-[11px] space-y-1">
                <div className="flex justify-between">
                  <dt>Freq. esperada</dt>
                  <dd>{fmt(mesAnalise.freqEsperada, 2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Qui-quadrado calc.</dt>
                  <dd>{fmt(mesAnalise.quiCalc, 2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Qui-quadrado tab.</dt>
                  <dd>{fmt(mesAnalise.quiTab, 2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Valor p</dt>
                  <dd>{mesAnalise.pValor.toFixed(4)}</dd>
                </div>
              </dl>
            </Panel>
            <button type="button" onClick={calcularRelatorio} className="rounded bg-teal-600 px-3 py-1 text-xs text-white">
              Relatório
            </button>
          </div>
          <Panel title="Mês de ocorrência do evento máximo">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mesAnalise.linhas}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="n" name="Nº ocorrências" fill="#dc2626" label={{ position: "top", fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {tab === "relatorio" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button type="button" onClick={calcularRelatorio} className="rounded bg-teal-600 px-4 py-2 text-sm text-white">
              Gerar relatório
            </button>
            {relatorio && (
              <button type="button" onClick={descarregar} className="rounded border px-4 py-2 text-sm">
                Descarregar .txt
              </button>
            )}
          </div>
          <pre className="max-h-[480px] overflow-auto rounded border bg-[var(--card)] p-3 font-mono text-[11px] whitespace-pre-wrap">
            {relatorio ?? "Clique em Gerar relatório."}
          </pre>
        </div>
      )}

      {tab === "sobre" && (
        <Panel title="Sobre">
          <p className="text-sm text-[var(--text)]">
            <strong>HidroChuSC v1.0 (web)</strong> — módulo DataGeo Digital para chuvas
            máximas em Santa Catarina. Reimplementa Gumbel-Chow, tabelas de retorno, IDF e
            relatório texto. Executável original:{" "}
            <code className="text-xs">HidroChuSC.exe</code>.
          </p>
        </Panel>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          className="rounded border px-4 py-1.5 text-sm"
          onClick={() => window.history.back()}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function IdfCoefTable({
  label,
  coef,
  onChange,
  className = "",
}: {
  label: string;
  coef: CoefIdf;
  onChange: (c: CoefIdf) => void;
  className?: string;
}) {
  const fields: (keyof CoefIdf)[] = ["K", "m", "b", "n"];
  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-medium">{label}</p>
      <div className="grid grid-cols-4 gap-1 text-[10px]">
        {fields.map((k) => (
          <label key={k}>
            {k}
            <input
              type="number"
              step="any"
              className="mt-0.5 w-full rounded border px-0.5"
              value={coef[k]}
              onChange={(e) =>
                onChange({ ...coef, [k]: Number(e.target.value) || 0 })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
