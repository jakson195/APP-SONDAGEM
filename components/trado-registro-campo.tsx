"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampoFuroLocalizacaoSecao } from "@/components/campo-furo-localizacao-secao";
import { LabeledInput } from "@/components/labeled-field";
import { RelatorioFotosCampo } from "@/components/relatorio-fotos-campo";
import { TradoRelatorioPdf } from "@/components/trado-relatorio-pdf";
import { aguardarMapaPdfNoDom } from "@/lib/aguardar-mapa-pdf-dom";
import { html2canvasReportOptions } from "@/lib/html2canvas-report-options";
import { LS_TRADO_NOME } from "@/lib/sondagem-nome-storage";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";
import { waitReportImagesLoaded } from "@/lib/wait-report-images";
import { TIPOS_ROCHA } from "@/lib/tipos-rocha";
import { apiUrl } from "@/lib/api-url";

const TRADO_DADOS_V = 1 as const;
const COR_PADRAO = "#cccccc";
const escalaPxPorMetro = 60;

type Linha = {
  de: number;
  ate: number;
  tipo: string;
  cor: string;
  descricao: string;
  obs: string;
};

function parseLinha(row: unknown): Linha | null {
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  let tipo = typeof r.tipo === "string" ? r.tipo : "";
  let cor = typeof r.cor === "string" ? r.cor : COR_PADRAO;
  const descricao = typeof r.descricao === "string" ? r.descricao : "";
  if (!tipo && descricao) {
    const hit = TIPOS_ROCHA.find((t) => t.nome === descricao);
    if (hit) {
      tipo = hit.nome;
      cor = hit.cor;
    }
  }
  return {
    de: Number(r.de) || 0,
    ate: Number(r.ate) || 0,
    tipo,
    cor,
    descricao,
    obs: typeof r.obs === "string" ? r.obs : "",
  };
}

function normalizeTradoDadosCampo(raw: unknown): {
  linhas: Linha[];
  obraNome: string;
  cliente: string;
  localObra: string;
  refObra: string;
  dataInicio: string;
  dataFim: string;
  nivelAgua: string;
  cotaBoca: string;
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

export type TradoRegistroCampoProps = {
  furoId?: number;
};

export function TradoRegistroCampo({ furoId }: TradoRegistroCampoProps) {
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
  const [coordN, setCoordN] = useState("");
  const [coordE, setCoordE] = useState("");
  const [paginaPdf, setPaginaPdf] = useState(1);
  const [totalPaginasPdf, setTotalPaginasPdf] = useState(1);
  const [responsavel, setResponsavel] = useState("");
  const [enderecoEmpresa, setEnderecoEmpresa] = useState(
    "Rua Flávio Pires, 131, Araranguá - SC",
  );
  const [mapaRelLatStr, setMapaRelLatStr] = useState("");
  const [mapaRelLngStr, setMapaRelLngStr] = useState("");
  const [fotosRelatorio, setFotosRelatorio] = useState<string[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfErro, setPdfErro] = useState<string | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
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
      if ((j.tipo ?? j.tipoCampo) !== "trado") {
        setLoadError(
          "Este furo não é um registo de sondagem a trado. Abra-o no módulo correto.",
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

      const dc = normalizeTradoDadosCampo(j.dadosCampo);
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
  if (!comFuro) return;

  const run = async () => {
    setNomePersistReady(true);
    await carregarFuro();
  };

  run();
}, [comFuro]);
    setCampoMapaReady(true);
    const v = localStorage.getItem(LS_TRADO_NOME);
    if (v !== null) setCodigoFuro(v);
    setNomePersistReady(true);
  }, [comFuro, carregarFuro]);

  useEffect(() => {
    if (!nomePersistReady || comFuro) return;
    localStorage.setItem(LS_TRADO_NOME, codigoFuro.trim());
  }, [codigoFuro, nomePersistReady, comFuro]);

  function buildDadosCampo() {
    return {
      v: TRADO_DADOS_V,
      linhas: dados,
      obraNome,
      cliente,
      localObra,
      refObra,
      dataInicio,
      dataFim,
      nivelAgua,
      cotaBoca,
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
    const de = n === 0 ? 0 : dados[n - 1].ate;
    setDados([
      ...dados,
      {
        de,
        ate: de + 1,
        tipo: "",
        cor: COR_PADRAO,
        descricao: "",
        obs: "",
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
      const safe = (codigoFuro.trim() || "trado").replace(/[^\w.-]+/g, "_");
      pdf.save(`relatorio-trado-${safe}.pdf`);
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
    <div className="mx-auto max-w-5xl p-6">
      {comFuro && furoId != null && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={
              obraIdMapa != null ? `/trado?obraId=${obraIdMapa}` : "/trado"
            }
            className="font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            ← Lista trado desta obra
          </Link>
          <span className="text-[var(--muted)]">Furo #{furoId}</span>
        </div>
      )}

      <h1 className="mb-2 text-2xl font-semibold text-[var(--text)]">
        Sondagem a trado
      </h1>
      <p className="mb-4 max-w-3xl text-sm text-[var(--muted)]">
        Registo por profundidade, relatório PDF com cabeçalho SOILSUL, mapa de
        localização (WGS84, opcional) e registo fotográfico de campo.
      </p>

      {loadError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      )}

      <div className="mb-6 max-w-xl">
        <label
          className="block text-sm font-medium text-[var(--text)]"
          htmlFor="trado-nome-sondagem"
        >
          Nome da sondagem
        </label>
        <input
          id="trado-nome-sondagem"
          value={codigoFuro}
          onChange={(e) => setCodigoFuro(e.target.value)}
          placeholder="ex.: ST 01, ST 02"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {comFuro ? (
            <>
              Use <strong className="text-[var(--text)]">Guardar projeto</strong>{" "}
              para gravar na obra.
              {obraIdMapa != null && (
                <>
                  {" "}
                  <Link
                    href={`/trado?obraId=${obraIdMapa}`}
                    className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Ver ST 01, ST 02…
                  </Link>
                </>
              )}
            </>
          ) : (
            "Guardado neste dispositivo (aparece no PDF)."
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={adicionar}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
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

      {dados.length > 0 && (
        <div className="mb-8 overflow-x-auto">
          <table className="w-full border-collapse border border-[var(--border)] text-sm">
            <thead className="bg-[var(--surface)]">
              <tr className="text-[var(--text)]">
                <th className="border border-[var(--border)] p-2">De (m)</th>
                <th className="border border-[var(--border)] p-2">Até (m)</th>
                <th className="border border-[var(--border)] p-2">Material</th>
                <th className="border border-[var(--border)] p-2">Descrição</th>
                <th className="border border-[var(--border)] p-2">Obs.</th>
                <th className="border border-[var(--border)] p-2">Cor</th>
                <th className="w-10 border border-[var(--border)] p-2" />
              </tr>
            </thead>
            <tbody>
              {dados.map((row, i) => (
                <tr key={i}>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      type="number"
                      step="0.01"
                      value={row.de}
                      onChange={(e) =>
                        atualizar(i, "de", Number(e.target.value) || 0)
                      }
                      className="w-full min-w-[4rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      type="number"
                      step="0.01"
                      value={row.ate}
                      onChange={(e) =>
                        atualizar(i, "ate", Number(e.target.value) || 0)
                      }
                      className="w-full min-w-[4rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td className="border border-[var(--border)] p-1">
                    <select
                      value={row.tipo}
                      onChange={(e) => selecionarTipo(i, e.target.value)}
                      className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm text-[var(--text)]"
                    >
                      <option value="">Selecionar</option>
                      {TIPOS_ROCHA.map((t) => (
                        <option key={t.nome} value={t.nome}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      value={row.descricao}
                      onChange={(e) =>
                        atualizar(i, "descricao", e.target.value)
                      }
                      className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      value={row.obs}
                      onChange={(e) => atualizar(i, "obs", e.target.value)}
                      className="w-full min-w-[8rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td
                    className="h-10 w-14 min-w-[3rem] border border-[var(--border)] p-0"
                    style={{ backgroundColor: row.cor }}
                    title={row.tipo || row.cor}
                    aria-label={row.tipo ? `Cor: ${row.tipo}` : "Sem material"}
                  />
                  <td className="border border-[var(--border)] p-1 text-center">
                    <button
                      type="button"
                      aria-label="Remover linha"
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() =>
                        setDados((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados.length > 0 && (
        <div className="mt-6 flex flex-col gap-6 print:hidden">
          <div className="shrink-0">
            <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">
              Coluna esquemática
            </h2>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Escala aproximada: {escalaPxPorMetro} px = 1 m (mesmas cores da
              rotativa)
            </p>
            <div
              className="relative mt-2 w-32 overflow-hidden rounded border border-[var(--border)]"
              role="img"
              aria-label="Perfil por intervalos"
            >
              {dados.map((l, i) => {
                const altura = Math.max((l.ate - l.de) * escalaPxPorMetro, 4);
                return (
                  <div
                    key={i}
                    className="relative border-b border-black last:border-b-0 dark:border-neutral-200"
                    style={{
                      height: altura,
                      backgroundColor: l.cor,
                    }}
                  >
                    <span
                      className="absolute left-1 top-1 text-xs text-white"
                      style={{
                        textShadow:
                          "0 0 2px #000, 0 1px 3px #000, 0 -1px 2px #000",
                      }}
                    >
                      {l.de} – {l.ate} m
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {dados.length > 0 && (
        <section
          className="mt-6 border-t border-[var(--border)] pt-8"
          aria-label="Relatório PDF"
        >
          <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
            Relatório (PDF)
          </h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Mapa: latitude e longitude em graus decimais WGS84. Fotos: até 8
            imagens no final do relatório.
          </p>

          <div className="mb-4 print:hidden">
            <RelatorioFotosCampo
              fotos={fotosRelatorio}
              onChange={setFotosRelatorio}
              maxFotos={8}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 print:hidden">
            <LabeledInput
              id="trado-pdf-obra"
              label="Obra"
              value={obraNome}
              onChange={(e) => setObraNome(e.target.value)}
            />
            <LabeledInput
              id="trado-pdf-cliente"
              label="Cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
            <LabeledInput
              id="trado-pdf-local"
              label="Local"
              value={localObra}
              onChange={(e) => setLocalObra(e.target.value)}
            />
            <LabeledInput
              id="trado-pdf-ref"
              label="Ref."
              value={refObra}
              onChange={(e) => setRefObra(e.target.value)}
            />
            <LabeledInput
              id="trado-pdf-data-ini"
              label="Data início"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              placeholder="dd/mm/aaaa"
            />
            <LabeledInput
              id="trado-pdf-data-fim"
              label="Data fim"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              placeholder="dd/mm/aaaa"
            />
            <LabeledInput
              id="trado-pdf-na"
              label="Nível d'água (m)"
              value={nivelAgua}
              onChange={(e) => setNivelAgua(e.target.value)}
              inputMode="decimal"
              placeholder="ex.: 2,40"
            />
            <LabeledInput
              id="trado-pdf-cota-boca"
              label="Cota boca (m)"
              value={cotaBoca}
              onChange={(e) => setCotaBoca(e.target.value)}
              inputMode="decimal"
            />
            <LabeledInput
              id="trado-pdf-coord-n"
              label="Coord. N (SIRGAS2000)"
              value={coordN}
              onChange={(e) => setCoordN(e.target.value)}
            />
            <LabeledInput
              id="trado-pdf-coord-e"
              label="Coord. E (SIRGAS2000)"
              value={coordE}
              onChange={(e) => setCoordE(e.target.value)}
            />
            <LabeledInput
              id="trado-pdf-lat"
              label="Latitude mapa PDF (WGS84 °)"
              value={mapaRelLatStr}
              onChange={(e) => setMapaRelLatStr(e.target.value)}
              inputMode="decimal"
            />
            <LabeledInput
              id="trado-pdf-lng"
              label="Longitude mapa PDF (WGS84 °)"
              value={mapaRelLngStr}
              onChange={(e) => setMapaRelLngStr(e.target.value)}
              inputMode="decimal"
            />
            <p className="text-xs text-[var(--muted)] sm:col-span-2 print:hidden">
              Sem latitude/longitude válidas, o PDF não inclui o mapa estático.
            </p>
            <LabeledInput
              id="trado-pdf-pagina"
              label="Página"
              type="number"
              min={1}
              value={paginaPdf}
              onChange={(e) =>
                setPaginaPdf(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <LabeledInput
              id="trado-pdf-total-pag"
              label="Total páginas"
              type="number"
              min={1}
              value={totalPaginasPdf}
              onChange={(e) =>
                setTotalPaginasPdf(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <LabeledInput
              id="trado-pdf-resp"
              label="Responsável técnico"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              wrapperClassName="sm:col-span-2"
            />
            <LabeledInput
              id="trado-pdf-endereco"
              label="Endereço (rodapé)"
              value={enderecoEmpresa}
              onChange={(e) => setEnderecoEmpresa(e.target.value)}
              wrapperClassName="sm:col-span-2"
            />
          </div>

          <button
            type="button"
            onClick={() => void gerarPDF()}
            disabled={pdfLoading}
            className="mb-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50 print:hidden"
          >
            {pdfLoading ? "A gerar PDF…" : "Gerar PDF"}
          </button>

          {pdfErro && (
            <p
              className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 print:hidden"
              role="alert"
            >
              {pdfErro}
            </p>
          )}

          <TradoRelatorioPdf
            ref={pdfRef}
            linhas={dados}
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
              coordN,
              coordE,
              pagina: paginaPdf,
              totalPaginas: totalPaginasPdf,
              responsavel,
              endereco: enderecoEmpresa,
              mapaLatitude: mapCoordsForPdf?.lat,
              mapaLongitude: mapCoordsForPdf?.lng,
              mapaZoom: 16,
              fotosCampo:
                fotosRelatorio.length > 0 ? fotosRelatorio : undefined,
            }}
          />
        </section>
      )}
    </div>
  );
}
