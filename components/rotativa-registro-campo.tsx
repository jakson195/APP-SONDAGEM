"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CampoFuroLocalizacaoSecao } from "@/components/campo-furo-localizacao-secao";
import {
  PerfilEstratigrafico,
  type CamadaEstratigrafica,
} from "@/components/perfil-estratigrafico";
import { RelatorioFotosCampo } from "@/components/relatorio-fotos-campo";
import { RotativaRelatorioSoilsulPdf } from "@/components/rotativa-relatorio-soilsul-pdf";
import { aguardarMapaPdfNoDom } from "@/lib/aguardar-mapa-pdf-dom";
import { html2canvasReportOptions } from "@/lib/html2canvas-report-options";
import { QUALIDADES_RQD, classificarRQD } from "@/lib/rqd";
import { LS_ROTATIVA_NOME } from "@/lib/sondagem-nome-storage";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";
import { waitReportImagesLoaded } from "@/lib/wait-report-images";
import { TIPOS_ROCHA } from "@/lib/tipos-rocha";
import { apiUrl } from "@/lib/api-url";

const COR_PADRAO = "#cccccc";
const escalaPxPorMetro = 60;
const ROT_DADOS_V = 1 as const;

export type Linha = {
  de: number;
  ate: number;
  tipo: string;
  cor: string;
  rqd: number;
  recuperacao: number;
  descricao: string;
  qualidade: string;
};

export function linhasRotativaToPerfil(linhas: Linha[]): CamadaEstratigrafica[] {
  const out: CamadaEstratigrafica[] = [];
  for (const l of linhas) {
    const topo = Math.min(l.de, l.ate);
    const base = Math.max(l.de, l.ate);
    if (!(base > topo)) continue;
    const material = (l.tipo || l.descricao || "").trim() || "—";
    out.push({
      topo,
      base,
      cor: l.cor?.trim() ? l.cor : COR_PADRAO,
      material,
    });
  }
  out.sort((a, b) => a.topo - b.topo);
  return out;
}

function parseLinha(row: unknown): Linha | null {
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    de: Number(r.de) || 0,
    ate: Number(r.ate) || 0,
    tipo: typeof r.tipo === "string" ? r.tipo : "",
    cor: typeof r.cor === "string" ? r.cor : COR_PADRAO,
    rqd: Math.min(100, Math.max(0, Number(r.rqd) || 0)),
    recuperacao: Math.min(100, Math.max(0, Number(r.recuperacao) || 0)),
    descricao: typeof r.descricao === "string" ? r.descricao : "",
    qualidade: typeof r.qualidade === "string" ? r.qualidade : "",
  };
}

export function normalizeRotativaDadosCampo(raw: unknown): {
  linhas: Linha[];
  obraNome: string;
  cliente: string;
  localObra: string;
  refObra: string;
  dataInicio: string;
  dataFim: string;
  nivelAgua: string;
  cotaBoca: string;
  revestimento: string;
  coordN: string;
  coordE: string;
  paginaPdf: number;
  totalPaginasPdf: number;
  responsavel: string;
  enderecoEmpresa: string;
  mapaRelLatStr: string;
  mapaRelLngStr: string;
  fotosRelatorio: string[];
} | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const linhas: Linha[] = [];
  if (Array.isArray(o.linhas)) {
    for (const row of o.linhas) {
      const p = parseLinha(row);
      if (p) linhas.push(p);
    }
  }
  const s = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : "";
  const n = (k: string, d: number) => {
    const v = Number(o[k]);
    return Number.isFinite(v) ? Math.max(1, Math.round(v)) : d;
  };
  const fotos: string[] = [];
  if (Array.isArray(o.fotosRelatorio)) {
    for (const x of o.fotosRelatorio) {
      if (typeof x === "string" && x.length > 0) fotos.push(x);
    }
  }
  return {
    linhas,
    obraNome: s("obraNome"),
    cliente: s("cliente"),
    localObra: s("localObra"),
    refObra: s("refObra"),
    dataInicio: s("dataInicio"),
    dataFim: s("dataFim"),
    nivelAgua: s("nivelAgua") || "Não medido",
    cotaBoca: s("cotaBoca"),
    revestimento: s("revestimento"),
    coordN: s("coordN"),
    coordE: s("coordE"),
    paginaPdf: n("paginaPdf", 1),
    totalPaginasPdf: n("totalPaginasPdf", 1),
    responsavel: s("responsavel"),
    enderecoEmpresa:
      s("enderecoEmpresa") || "Rua Flávio Pires, 131, Araranguá - SC",
    mapaRelLatStr: s("mapaRelLatStr"),
    mapaRelLngStr: s("mapaRelLngStr"),
    fotosRelatorio: fotos,
  };
}

export type RotativaRegistroCampoProps = {
  furoId?: number;
};

export function RotativaRegistroCampo({ furoId }: RotativaRegistroCampoProps) {
  const [dados, setDados] = useState<Linha[]>([]);
  const [codigoFuro, setCodigoFuro] = useState("");
  const [nomePersistReady, setNomePersistReady] = useState(false);
  const [obraNome, setObraNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [localObra, setLocalObra] = useState("");
  const [refObra, setRefObra] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [nivelAgua, setNivelAgua] = useState("Não medido");
  const [cotaBoca, setCotaBoca] = useState("");
  const [revestimento, setRevestimento] = useState("");
  const [coordN, setCoordN] = useState("");
  const [coordE, setCoordE] = useState("");
  const [paginaPdf, setPaginaPdf] = useState(1);
  const [totalPaginasPdf, setTotalPaginasPdf] = useState(1);
  const [responsavel, setResponsavel] = useState("");
  const [enderecoEmpresa, setEnderecoEmpresa] = useState(
    "Rua Flávio Pires, 131, Araranguá - SC",
  );
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfErro, setPdfErro] = useState<string | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [fotosRelatorio, setFotosRelatorio] = useState<string[]>([]);
  const [mapaRelLatStr, setMapaRelLatStr] = useState("");
  const [mapaRelLngStr, setMapaRelLngStr] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [obraIdMapa, setObraIdMapa] = useState<number | null>(null);
  const [obraRefMapa, setObraRefMapa] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [projetoSaving, setProjetoSaving] = useState(false);
  const [projetoMsg, setProjetoMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [campoMapaReady, setCampoMapaReady] = useState(false);

  const mapCoordsForPdf = useMemo(
    () => wgsPairFromInputs(mapaRelLatStr, mapaRelLngStr),
    [mapaRelLatStr, mapaRelLngStr],
  );

  const escalaPdfPxPorMetro = 48;

  const dadosRQD = useMemo(
    () =>
      dados.map((l) => ({
        prof: l.ate,
        RQD: l.rqd,
      })),
    [dados],
  );

  const perfil = useMemo(() => linhasRotativaToPerfil(dados), [dados]);

  const comFuro = furoId != null && Number.isFinite(furoId);

  const carregarFuro = useCallback(async () => {
    if (!comFuro || furoId == null) return;
    setLoadError(null);
    setCampoMapaReady(false);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`));
      const j = (await r.json()) as {
        error?: string;
        codigo?: string;
        tipo?: string;
        tipoCampo?: string;
        dadosCampo?: unknown;
        latitude?: number | null;
        longitude?: number | null;
        obraId?: number;
        obra?: {
          nome?: string;
          cliente?: string;
          local?: string;
          latitude?: number | null;
          longitude?: number | null;
        };
      };
      if (!r.ok) {
        setLoadError(
          typeof j.error === "string" ? j.error : "Erro ao carregar furo",
        );
        return;
      }
      if ((j.tipo ?? j.tipoCampo) !== "rotativa") {
        setLoadError(
          "Este furo não é um registo de sondagem rotativa. Abra-o no módulo correto.",
        );
        return;
      }
      setCodigoFuro(typeof j.codigo === "string" ? j.codigo : "");
      const o = j.obra;
      const baseObra = String(o?.nome ?? "");
      const baseCliente = String(o?.cliente ?? "");
      const baseLocal = String(o?.local ?? "");
      if (typeof j.obraId === "number" && Number.isFinite(j.obraId)) {
        setObraIdMapa(j.obraId);
      } else {
        setObraIdMapa(null);
      }
      const olat = o?.latitude;
      const olng = o?.longitude;
      if (
        olat != null &&
        olng != null &&
        Number.isFinite(olat) &&
        Number.isFinite(olng)
      ) {
        setObraRefMapa({ lat: olat, lng: olng });
      } else {
        setObraRefMapa(null);
      }

      const dc = normalizeRotativaDadosCampo(j.dadosCampo);
      if (dc) {
        if (dc.linhas.length > 0) setDados(dc.linhas);
        setObraNome(dc.obraNome || baseObra);
        setCliente(dc.cliente || baseCliente);
        setLocalObra(dc.localObra || baseLocal);
        setRefObra(dc.refObra);
        setDataInicio(dc.dataInicio);
        setDataFim(dc.dataFim);
        setNivelAgua(dc.nivelAgua);
        setCotaBoca(dc.cotaBoca);
        setRevestimento(dc.revestimento);
        setCoordN(dc.coordN);
        setCoordE(dc.coordE);
        setPaginaPdf(dc.paginaPdf);
        setTotalPaginasPdf(dc.totalPaginasPdf);
        setResponsavel(dc.responsavel);
        setEnderecoEmpresa(dc.enderecoEmpresa);
        setFotosRelatorio(dc.fotosRelatorio);
      } else {
        setObraNome(baseObra);
        setCliente(baseCliente);
        setLocalObra(baseLocal);
      }

      const fLat = j.latitude;
      const fLng = j.longitude;
      if (
        fLat != null &&
        fLng != null &&
        Number.isFinite(fLat) &&
        Number.isFinite(fLng)
      ) {
        setMapaRelLatStr(fLat.toFixed(6));
        setMapaRelLngStr(fLng.toFixed(6));
      } else if (
        olat != null &&
        olng != null &&
        Number.isFinite(olat) &&
        Number.isFinite(olng)
      ) {
        setMapaRelLatStr(olat.toFixed(6));
        setMapaRelLngStr(olng.toFixed(6));
      } else if (dc?.mapaRelLatStr) {
        setMapaRelLatStr(dc.mapaRelLatStr);
        setMapaRelLngStr(dc.mapaRelLngStr);
      }
      setCampoMapaReady(true);
    } catch {
      setLoadError("Falha de rede ao carregar o furo.");
    }
  }, [comFuro, furoId]);

  useEffect(() => {
    if (comFuro) {
      setNomePersistReady(true);
      void carregarFuro();
      return;
    }
    setCampoMapaReady(true);
    const v = localStorage.getItem(LS_ROTATIVA_NOME);
    if (v !== null) setCodigoFuro(v);
    setNomePersistReady(true);
  }, [comFuro, carregarFuro]);

  useEffect(() => {
    if (!nomePersistReady || comFuro) return;
    localStorage.setItem(LS_ROTATIVA_NOME, codigoFuro.trim());
  }, [codigoFuro, nomePersistReady, comFuro]);

  function buildDadosCampo() {
    return {
      v: ROT_DADOS_V,
      linhas: dados,
      obraNome,
      cliente,
      localObra,
      refObra,
      dataInicio,
      dataFim,
      nivelAgua,
      cotaBoca,
      revestimento,
      coordN,
      coordE,
      paginaPdf,
      totalPaginasPdf,
      responsavel,
      enderecoEmpresa,
      mapaRelLatStr,
      mapaRelLngStr,
      fotosRelatorio,
    };
  }

  async function guardarProjeto() {
    if (!comFuro || furoId == null) return;
    const codigo = codigoFuro.trim();
    if (!codigo) {
      setProjetoMsg({
        type: "err",
        text: "Indique o nome da sondagem antes de guardar.",
      });
      return;
    }
    setProjetoMsg(null);
    setProjetoSaving(true);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          dadosCampo: buildDadosCampo(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao guardar projeto",
        );
      }
      setProjetoMsg({ type: "ok", text: "Projeto guardado na obra." });
    } catch (e) {
      setProjetoMsg({
        type: "err",
        text: e instanceof Error ? e.message : "Erro ao guardar",
      });
    } finally {
      setProjetoSaving(false);
    }
  }

  function adicionar() {
    const n = dados.length;
    setDados([
      ...dados,
      {
        de: n,
        ate: n + 1,
        tipo: "",
        cor: COR_PADRAO,
        rqd: 0,
        recuperacao: 0,
        descricao: "",
        qualidade: "",
      },
    ]);
  }

  function atualizar<K extends keyof Linha>(
    index: number,
    campo: K,
    valor: Linha[K],
  ) {
    setDados((prev) => {
      const novo = [...prev];
      novo[index] = { ...novo[index], [campo]: valor };
      return novo;
    });
  }

  function selecionarTipo(index: number, nome: string) {
    setDados((prev) => {
      const novo = [...prev];
      if (!nome) {
        novo[index] = {
          ...novo[index],
          tipo: "",
          cor: COR_PADRAO,
        };
        return novo;
      }
      const tipo = TIPOS_ROCHA.find((t) => t.nome === nome);
      if (!tipo) return prev;
      novo[index] = { ...novo[index], tipo: tipo.nome, cor: tipo.cor };
      return novo;
    });
  }

  async function gerarPDF() {
    const el = pdfRef.current;
    if (!el || dados.length === 0) {
      setPdfErro("Adicione pelo menos um intervalo antes de gerar o PDF.");
      return;
    }

    setPdfErro(null);
    setPdfLoading(true);
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const esperaMapa = mapCoordsForPdf != null;
      const esperaFotos = fotosRelatorio.length > 0;
      await new Promise((r) =>
        setTimeout(r, esperaMapa || esperaFotos ? 1100 : 600),
      );
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      await aguardarMapaPdfNoDom(el, 25_000);
      await waitReportImagesLoaded(el, 30_000);

      const canvas = await html2canvas(el, html2canvasReportOptions());

      if (canvas.width < 2 || canvas.height < 2) {
        throw new Error(
          "A captura saiu vazia. Alarga a janela do browser e tente de novo.",
        );
      }

      const imgData = canvas.toDataURL("image/png");
      if (!imgData || imgData.length < 100) {
        throw new Error("Não foi possível converter a página para imagem.");
      }

      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const safe = (codigoFuro.trim() || "rotativa").replace(/[^\w.-]+/g, "_");
      pdf.save(`relatorio-rotativa-${safe}.pdf`);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Erro desconhecido ao gerar o PDF.";
      setPdfErro(msg);
      console.error(e);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">
        Sondagem rotativa
      </h1>

      <nav
        className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 print:hidden"
        aria-label="Secções do registo"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Sondagem rotativa
        </p>
        <ul className="mt-2 space-y-1 font-mono text-sm leading-relaxed text-[var(--text)]">
          <li>
            <a
              href="#rotativa-dados-furo"
              className="text-teal-700 hover:underline dark:text-teal-400"
            >
              ├── Dados do furo
            </a>
          </li>
          <li>
            <a
              href="#rotativa-amostras"
              className="text-teal-700 hover:underline dark:text-teal-400"
            >
              ├── Amostras
            </a>
          </li>
          <li>
            <a
              href="#rotativa-perfil-estratigrafico"
              className="text-teal-700 hover:underline dark:text-teal-400"
            >
              ├── Perfil estratigráfico ✅
            </a>
          </li>
          <li>
            <Link
              href={
                obraIdMapa != null
                  ? `/rotativa/perfil-geologico?obraId=${obraIdMapa}`
                  : "/rotativa/perfil-geologico"
              }
              className="text-teal-700 hover:underline dark:text-teal-400"
            >
              ├── PERFIL geológico (interpretação entre SR)
            </Link>
          </li>
          <li>
            <a
              href="#rotativa-relatorio-pdf"
              className="text-teal-700 hover:underline dark:text-teal-400"
            >
              └── Relatório PDF
            </a>
          </li>
        </ul>
      </nav>

      {loadError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      )}

      <section
        id="rotativa-dados-furo"
        className="scroll-mt-6 border-b border-[var(--border)] pb-8"
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
          Dados do furo
        </h2>
        {comFuro && furoId != null && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={
                obraIdMapa != null
                  ? `/rotativa?obraId=${obraIdMapa}`
                  : "/rotativa"
              }
              className="font-medium text-teal-600 hover:underline dark:text-teal-400"
            >
              ← Lista rotativa desta obra
            </Link>
            <span className="text-[var(--muted)]">Furo #{furoId}</span>
          </div>
        )}

        <div className="mb-4 max-w-xl">
          <label
            className="block text-sm font-medium text-[var(--text)]"
            htmlFor="rot-nome-sondagem"
          >
            Nome da sondagem
          </label>
          <input
            id="rot-nome-sondagem"
            value={codigoFuro}
            onChange={(e) => setCodigoFuro(e.target.value)}
            placeholder="ex.: SR 01, SR 02"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {comFuro ? (
              <>
                Nome e grelha ficam na obra com{" "}
                <strong className="text-[var(--text)]">Guardar projeto</strong>{" "}
                (secção Amostras).
                {obraIdMapa != null && (
                  <>
                    {" "}
                    <Link
                      href={`/rotativa?obraId=${obraIdMapa}`}
                      className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                    >
                      Ver SR 01, SR 02…
                    </Link>
                  </>
                )}
              </>
            ) : (
              "Guardado neste dispositivo (aparece no PDF). Para vários registos na mesma obra, use o hub com obra."
            )}
          </p>
        </div>

        {comFuro && furoId != null && campoMapaReady && !loadError && (
          <CampoFuroLocalizacaoSecao
            furoId={furoId}
            codigoFuro={codigoFuro}
            obraRefMapa={obraRefMapa}
            mapaRelLatStr={mapaRelLatStr}
            mapaRelLngStr={mapaRelLngStr}
            onMapaRelLatStr={setMapaRelLatStr}
            onMapaRelLngStr={setMapaRelLngStr}
          />
        )}
      </section>

      <section
        id="rotativa-amostras"
        className="scroll-mt-6 border-b border-[var(--border)] py-8"
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
          Amostras
        </h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Intervalos com profundidade, material (litologia), RQD, recuperação e
          descrição.
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={adicionar}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            + Adicionar intervalo
          </button>
          {comFuro && (
            <button
              type="button"
              disabled={projetoSaving || !!loadError}
              onClick={() => void guardarProjeto()}
              className="rounded border-2 border-teal-600 bg-[var(--card)] px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-50 disabled:opacity-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-950/40"
            >
              {projetoSaving ? "A guardar…" : "Guardar projeto"}
            </button>
          )}
        </div>
        {projetoMsg && (
          <p
            className={`mb-4 text-sm ${
              projetoMsg.type === "ok"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
            role={projetoMsg.type === "err" ? "alert" : "status"}
          >
            {projetoMsg.text}
          </p>
        )}

        <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-[var(--border)] text-sm">
          <thead className="bg-[var(--surface)]">
            <tr className="text-[var(--text)]">
              <th className="border border-[var(--border)] p-2 font-semibold">
                De (m)
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                Até (m)
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                Material
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                RQD (%)
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                Qualidade
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                Rec (%)
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                Descrição
              </th>
              <th className="border border-[var(--border)] p-2 font-semibold">
                Cor
              </th>
            </tr>
          </thead>

          <tbody>
            {dados.map((l, i) => (
              <tr key={i} className="text-[var(--text)]">
                <td className="border border-[var(--border)] p-2 text-center">
                  {l.de}
                </td>
                <td className="border border-[var(--border)] p-2 text-center">
                  {l.ate}
                </td>

                <td className="border border-[var(--border)] p-2">
                  <select
                    value={l.tipo}
                    onChange={(e) => selecionarTipo(i, e.target.value)}
                    className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text)]"
                  >
                    <option value="">Selecionar</option>
                    {TIPOS_ROCHA.map((t) => (
                      <option key={t.nome} value={t.nome}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="border border-[var(--border)] p-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={l.rqd}
                    onChange={(e) =>
                      atualizar(i, "rqd", Number(e.target.value) || 0)
                    }
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1"
                  />
                </td>

                <td className="border border-[var(--border)] p-2">
                  <select
                    value={l.qualidade}
                    onChange={(e) =>
                      atualizar(i, "qualidade", e.target.value)
                    }
                    className="w-full min-w-[8.5rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs text-[var(--text)]"
                    title={
                      l.qualidade.trim()
                        ? "Qualidade manual"
                        : `Automático: ${classificarRQD(l.rqd)}`
                    }
                  >
                    <option value="">
                      Automático ({classificarRQD(l.rqd)})
                    </option>
                    {QUALIDADES_RQD.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="border border-[var(--border)] p-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={l.recuperacao}
                    onChange={(e) =>
                      atualizar(i, "recuperacao", Number(e.target.value) || 0)
                    }
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1"
                  />
                </td>

                <td className="border border-[var(--border)] p-2">
                  <input
                    type="text"
                    value={l.descricao}
                    onChange={(e) =>
                      atualizar(i, "descricao", e.target.value)
                    }
                    className="w-full min-w-[12rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-left"
                  />
                </td>

                <td
                  className="h-10 w-14 min-w-[3rem] border border-[var(--border)] p-0"
                  style={{ backgroundColor: l.cor }}
                  title={l.tipo || l.cor}
                  aria-label={l.tipo ? `Cor: ${l.tipo}` : "Sem material"}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>

      <section
        id="rotativa-perfil-estratigrafico"
        className="scroll-mt-6 border-b border-[var(--border)] py-8"
      >
        <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
          Perfil estratigráfico
        </h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Coluna com materiais (escala {escalaPxPorMetro} px/m) e gráfico RQD ×
          profundidade.
        </p>
        {dados.length > 0 ? (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="shrink-0 print:hidden">
              {perfil.length > 0 ? (
                <PerfilEstratigrafico
                  dados={perfil}
                  escalaPxPorM={escalaPxPorMetro}
                  larguraPx={208}
                />
              ) : (
                <p className="max-w-xs text-xs text-[var(--muted)]">
                  Defina profundidades com <strong>De</strong> inferior a{" "}
                  <strong>Até</strong> (m) para desenhar a coluna estratigráfica.
                </p>
              )}
            </div>

            <div
              className="min-h-[280px] min-w-0 flex-1"
              aria-label="Gráfico RQD versus profundidade"
            >
              <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
                RQD × profundidade (cota até)
              </h3>
              <div className="h-[280px] w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dadosRQD}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    opacity={0.6}
                  />
                  <XAxis
                    type="number"
                    dataKey="RQD"
                    domain={[0, 100]}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    label={{
                      value: "RQD (%)",
                      position: "insideBottom",
                      offset: -4,
                      fill: "var(--muted)",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="prof"
                    reversed
                    domain={[0, "dataMax"]}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    label={{
                      value: "Prof. até (m)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--muted)",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text)",
                    }}
                    formatter={(value, name) => [
                      value != null ? String(value) : "—",
                      name === "prof" ? "Prof. até (m)" : "RQD (%)",
                    ]}
                    labelFormatter={() => ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="prof"
                    name="prof"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "var(--accent)" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Adicione intervalos em <strong>Amostras</strong> para visualizar o
            perfil e o gráfico RQD.
          </p>
        )}
      </section>

      <section
        id="rotativa-relatorio-pdf"
        className="scroll-mt-6 border-t border-[var(--border)] pt-8"
        aria-label="Relatório PDF"
      >
        <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
          Relatório PDF
        </h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Preenche o cabeçalho (opcional) e gera o PDF no padrão técnico
            (cabeçalho, perfuração RS/BQ, perfil com hachuras, gráfico e
            legendas).
          </p>

          <div className="mb-4 print:hidden">
            <RelatorioFotosCampo
              fotos={fotosRelatorio}
              onChange={setFotosRelatorio}
              maxFotos={8}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 print:hidden">
            <input
              placeholder="Obra"
              value={obraNome}
              onChange={(e) => setObraNome(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Local"
              value={localObra}
              onChange={(e) => setLocalObra(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Ref. (ex.: pedágio)"
              value={refObra}
              onChange={(e) => setRefObra(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Data início (ex.: 14/04/2025)"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Data fim"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Nível d'água (ou Não medido)"
              value={nivelAgua}
              onChange={(e) => setNivelAgua(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Cota boca do furo (m)"
              value={cotaBoca}
              onChange={(e) => setCotaBoca(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Revestimento (m)"
              value={revestimento}
              onChange={(e) => setRevestimento(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Coord. N (SIRGAS2000)"
              value={coordN}
              onChange={(e) => setCoordN(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Coord. E (SIRGAS2000)"
              value={coordE}
              onChange={(e) => setCoordE(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Latitude mapa PDF (WGS84 °)"
              value={mapaRelLatStr}
              onChange={(e) => setMapaRelLatStr(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
              inputMode="decimal"
            />
            <input
              placeholder="Longitude mapa PDF (WGS84 °)"
              value={mapaRelLngStr}
              onChange={(e) => setMapaRelLngStr(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
              inputMode="decimal"
            />
            <p className="text-xs text-[var(--muted)] sm:col-span-2 print:hidden">
              Mapa no relatório: graus decimais WGS84 (opcional). Sem coordenadas,
              o PDF não inclui o bloco de mapa.
            </p>
            <input
              type="number"
              min={1}
              placeholder="Página"
              value={paginaPdf}
              onChange={(e) =>
                setPaginaPdf(Math.max(1, Number(e.target.value) || 1))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              type="number"
              min={1}
              placeholder="Total páginas"
              value={totalPaginasPdf}
              onChange={(e) =>
                setTotalPaginasPdf(Math.max(1, Number(e.target.value) || 1))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
            />
            <input
              placeholder="Responsável técnico"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="Endereço da empresa (rodapé)"
              value={enderecoEmpresa}
              onChange={(e) => setEnderecoEmpresa(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm sm:col-span-2"
            />
          </div>

          <button
            type="button"
            onClick={() => void gerarPDF()}
            disabled={pdfLoading || dados.length === 0}
            className="mb-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 print:hidden"
          >
            {pdfLoading ? "A gerar PDF…" : "Gerar PDF"}
          </button>
          {dados.length === 0 && (
            <p className="mb-2 text-xs text-[var(--muted)] print:hidden">
              Adicione pelo menos um intervalo em Amostras para gerar o PDF.
            </p>
          )}

          {pdfErro && (
            <p
              className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 print:hidden"
              role="alert"
            >
              {pdfErro}
            </p>
          )}

        {dados.length > 0 && (
          <RotativaRelatorioSoilsulPdf
            ref={pdfRef}
            linhas={dados}
            dadosRQD={dadosRQD}
            escalaPxPorMetro={escalaPdfPxPorMetro}
            meta={{
              furoCodigo: codigoFuro,
              cliente,
              obra: obraNome,
              local: localObra,
              ref: refObra,
              dataInicio,
              dataFim,
              nivelAgua,
              cotaBoca,
              revestimento,
              coordN,
              coordE,
              pagina: paginaPdf,
              totalPaginas: totalPaginasPdf,
              responsavel,
              endereco: enderecoEmpresa,
              fotosCampo:
                fotosRelatorio.length > 0 ? fotosRelatorio : undefined,
              mapaLatitude: mapCoordsForPdf?.lat,
              mapaLongitude: mapCoordsForPdf?.lng,
              mapaZoom: 16,
            }}
          />
        )}
      </section>
    </div>
  );
}
