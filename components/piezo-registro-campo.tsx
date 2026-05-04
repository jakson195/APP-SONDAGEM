"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampoFuroLocalizacaoSecao } from "@/components/campo-furo-localizacao-secao";
import { LabeledInput, LabeledTextarea } from "@/components/labeled-field";
import {
  PerfilEstratigrafico,
  type CamadaEstratigrafica,
} from "@/components/perfil-estratigrafico";
import { PiezoRelatorioPdf } from "@/components/piezo-relatorio-pdf";
import { RelatorioFotosCampo } from "@/components/relatorio-fotos-campo";
import { aguardarMapaPdfNoDom } from "@/lib/aguardar-mapa-pdf-dom";
import { html2canvasReportOptions } from "@/lib/html2canvas-report-options";
import { LS_POCOS_NOME } from "@/lib/sondagem-nome-storage";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";
import { waitReportImagesLoaded } from "@/lib/wait-report-images";
import { TIPOS_ROCHA } from "@/lib/tipos-rocha";
import { apiUrl } from "@/lib/api-url";

const PIEZO_DADOS_V = 1 as const;
const COR_PADRAO_CAMADA = "#cccccc";

type Leitura = {
  data: string;
  nivel: string;
  obs: string;
};

type CamadaGeol = {
  de: string;
  ate: string;
  tipo: string;
  cor: string;
  descricao: string;
};

function parseProfundidadeM(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function camadasGeolToPerfil(rows: CamadaGeol[]): CamadaEstratigrafica[] {
  const out: CamadaEstratigrafica[] = [];
  for (const row of rows) {
    const a = parseProfundidadeM(row.de);
    const b = parseProfundidadeM(row.ate);
    if (a == null || b == null) continue;
    const topo = Math.min(a, b);
    const base = Math.max(a, b);
    if (!(base > topo)) continue;
    const material =
      (row.tipo || row.descricao || "").trim() || "—";
    out.push({
      topo,
      base,
      cor: row.cor?.trim() || COR_PADRAO_CAMADA,
      material,
    });
  }
  out.sort((x, y) => x.topo - y.topo);
  return out;
}

function parseCamadaGeol(row: unknown): CamadaGeol | null {
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  let tipo = typeof r.tipo === "string" ? r.tipo : "";
  let cor = typeof r.cor === "string" ? r.cor : COR_PADRAO_CAMADA;
  const descricao = typeof r.descricao === "string" ? r.descricao : "";
  if (!tipo && descricao) {
    const hit = TIPOS_ROCHA.find((t) => t.nome === descricao);
    if (hit) {
      tipo = hit.nome;
      cor = hit.cor;
    }
  }
  return {
    de: typeof r.de === "string" ? r.de : "",
    ate: typeof r.ate === "string" ? r.ate : "",
    tipo,
    cor,
    descricao,
  };
}

function parseLeitura(row: unknown): Leitura | null {
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    data: typeof r.data === "string" ? r.data : "",
    nivel: typeof r.nivel === "string" ? r.nivel : "",
    obs: typeof r.obs === "string" ? r.obs : "",
  };
}

function normalizePiezoDadosCampo(raw: unknown): {
  leituras: Leitura[];
  obraNome: string;
  cliente: string;
  localObra: string;
  refObra: string;
  dataInstalacao: string;
  diametro: string;
  comprimentoFiltro: string;
  tipoFiltro: string;
  profundidadeTotal: string;
  cotaBoca: string;
  coordN: string;
  coordE: string;
  notasInstalacao: string;
  paginaPdf: number;
  totalPaginasPdf: number;
  responsavel: string;
  enderecoEmpresa: string;
  mapaRelLatStr: string;
  mapaRelLngStr: string;
  fotosRelatorio: string[];
  dataInicio: string;
  dataFim: string;
  dataRelatorio: string;
  cotaSuperficie: string;
  cotaBocaCano: string;
  coordFuso: string;
  crea: string;
  rodapeContato: string;
  nivelAgua: string;
  equipamento: string;
  diametroInstalacao: string;
  tuboRevestimento: string;
  bentonite: string;
  preFiltro: string;
  seloSanitario: string;
  acabamento: string;
  camadasGeologicas: CamadaGeol[];
} | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const leituras: Leitura[] = [];
  if (Array.isArray(o.leituras)) {
    for (const row of o.leituras) {
      const p = parseLeitura(row);
      if (p) leituras.push(p);
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
  const camadasGeologicas: CamadaGeol[] = [];
  if (Array.isArray(o.camadasGeologicas)) {
    for (const row of o.camadasGeologicas) {
      const p = parseCamadaGeol(row);
      if (p) camadasGeologicas.push(p);
    }
  }
  return {
    leituras,
    obraNome: s("obraNome"),
    cliente: s("cliente"),
    localObra: s("localObra"),
    refObra: s("refObra"),
    dataInstalacao: s("dataInstalacao"),
    diametro: s("diametro"),
    comprimentoFiltro: s("comprimentoFiltro"),
    tipoFiltro: s("tipoFiltro"),
    profundidadeTotal: s("profundidadeTotal"),
    cotaBoca: s("cotaBoca"),
    coordN: s("coordN"),
    coordE: s("coordE"),
    notasInstalacao: s("notasInstalacao"),
    paginaPdf: n("paginaPdf", 1),
    totalPaginasPdf: n("totalPaginasPdf", 1),
    responsavel: s("responsavel"),
    enderecoEmpresa:
      s("enderecoEmpresa") || "Rua Flávio Pires, 131, Araranguá - SC",
    mapaRelLatStr: s("mapaRelLatStr"),
    mapaRelLngStr: s("mapaRelLngStr"),
    fotosRelatorio: fotos,
    dataInicio: s("dataInicio"),
    dataFim: s("dataFim"),
    dataRelatorio: s("dataRelatorio"),
    cotaSuperficie: s("cotaSuperficie"),
    cotaBocaCano: s("cotaBocaCano"),
    coordFuso: s("coordFuso") || "22 S",
    crea: s("crea"),
    rodapeContato: s("rodapeContato"),
    nivelAgua: s("nivelAgua"),
    equipamento: s("equipamento") || "TRADO MECANIZADO",
    diametroInstalacao: s("diametroInstalacao"),
    tuboRevestimento: s("tuboRevestimento"),
    bentonite: s("bentonite"),
    preFiltro: s("preFiltro"),
    seloSanitario: s("seloSanitario"),
    acabamento: s("acabamento"),
    camadasGeologicas,
  };
}

export type PiezoRegistroCampoProps = {
  furoId?: number;
};

export function PiezoRegistroCampo({ furoId }: PiezoRegistroCampoProps) {
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [codigoPoco, setCodigoPoco] = useState("");
  const [nomePersistReady, setNomePersistReady] = useState(false);
  const [obraNome, setObraNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [localObra, setLocalObra] = useState("");
  const [refObra, setRefObra] = useState("");
  const [dataInstalacao, setDataInstalacao] = useState("");
  const [diametro, setDiametro] = useState("");
  const [comprimentoFiltro, setComprimentoFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [profundidadeTotal, setProfundidadeTotal] = useState("");
  const [cotaBoca, setCotaBoca] = useState("");
  const [coordN, setCoordN] = useState("");
  const [coordE, setCoordE] = useState("");
  const [notasInstalacao, setNotasInstalacao] = useState("");
  const [paginaPdf, setPaginaPdf] = useState(1);
  const [totalPaginasPdf, setTotalPaginasPdf] = useState(1);
  const [responsavel, setResponsavel] = useState("");
  const [enderecoEmpresa, setEnderecoEmpresa] = useState(
    "Rua Flávio Pires, 131, Araranguá - SC",
  );
  const [mapaRelLatStr, setMapaRelLatStr] = useState("");
  const [mapaRelLngStr, setMapaRelLngStr] = useState("");
  const [fotosRelatorio, setFotosRelatorio] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dataRelatorio, setDataRelatorio] = useState("");
  const [cotaSuperficie, setCotaSuperficie] = useState("");
  const [cotaBocaCano, setCotaBocaCano] = useState("");
  const [coordFuso, setCoordFuso] = useState("22 S");
  const [crea, setCrea] = useState("");
  const [rodapeContato, setRodapeContato] = useState("");
  const [nivelAgua, setNivelAgua] = useState("");
  const [equipamento, setEquipamento] = useState("TRADO MECANIZADO");
  const [diametroInstalacao, setDiametroInstalacao] = useState("");
  const [tuboRevestimento, setTuboRevestimento] = useState("");
  const [bentonite, setBentonite] = useState("");
  const [preFiltro, setPreFiltro] = useState("");
  const [seloSanitario, setSeloSanitario] = useState("");
  const [acabamento, setAcabamento] = useState("0");
  const [camadasGeologicas, setCamadasGeologicas] = useState<CamadaGeol[]>(
    [],
  );
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

  const perfil = useMemo(
    () => camadasGeolToPerfil(camadasGeologicas),
    [camadasGeologicas],
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
      if ((j.tipo ?? j.tipoCampo) !== "piezo") {
        setLoadError(
          "Este furo não é um registo piezomérico. Abra-o no módulo correto.",
        );
        return;
      }
      setCodigoPoco(typeof j.codigo === "string" ? j.codigo : "");
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

      const dc = normalizePiezoDadosCampo(j.dadosCampo);
      if (dc) {
        if (dc.leituras.length > 0) setLeituras(dc.leituras);
        setObraNome(dc.obraNome || baseObra);
        setCliente(dc.cliente || baseCliente);
        setLocalObra(dc.localObra || baseLocal);
        setRefObra(dc.refObra);
        setDataInstalacao(dc.dataInstalacao);
        setDiametro(dc.diametro);
        setComprimentoFiltro(dc.comprimentoFiltro);
        setTipoFiltro(dc.tipoFiltro);
        setProfundidadeTotal(dc.profundidadeTotal);
        setCotaBoca(dc.cotaBoca);
        setCoordN(dc.coordN);
        setCoordE(dc.coordE);
        setNotasInstalacao(dc.notasInstalacao);
        setPaginaPdf(dc.paginaPdf);
        setTotalPaginasPdf(dc.totalPaginasPdf);
        setResponsavel(dc.responsavel);
        setEnderecoEmpresa(dc.enderecoEmpresa);
        setFotosRelatorio(dc.fotosRelatorio);
        setDataInicio(dc.dataInicio);
        setDataFim(dc.dataFim);
        setDataRelatorio(dc.dataRelatorio);
        setCotaSuperficie(dc.cotaSuperficie);
        setCotaBocaCano(dc.cotaBocaCano);
        setCoordFuso(dc.coordFuso);
        setCrea(dc.crea);
        setRodapeContato(dc.rodapeContato);
        setNivelAgua(dc.nivelAgua);
        setEquipamento(dc.equipamento);
        setDiametroInstalacao(dc.diametroInstalacao);
        setTuboRevestimento(dc.tuboRevestimento);
        setBentonite(dc.bentonite);
        setPreFiltro(dc.preFiltro);
        setSeloSanitario(dc.seloSanitario);
        setAcabamento(dc.acabamento);
        if (dc.camadasGeologicas.length > 0) {
          setCamadasGeologicas(dc.camadasGeologicas);
        }
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
    const v = localStorage.getItem(LS_POCOS_NOME);
    if (v !== null) setCodigoPoco(v);
    setNomePersistReady(true);
  }, [comFuro, carregarFuro]);

  useEffect(() => {
    if (!nomePersistReady || comFuro) return;
    localStorage.setItem(LS_POCOS_NOME, codigoPoco.trim());
  }, [codigoPoco, nomePersistReady, comFuro]);

  function buildDadosCampo() {
    return {
      v: PIEZO_DADOS_V,
      leituras,
      obraNome,
      cliente,
      localObra,
      refObra,
      dataInstalacao,
      diametro,
      comprimentoFiltro,
      tipoFiltro,
      profundidadeTotal,
      cotaBoca,
      coordN,
      coordE,
      notasInstalacao,
      paginaPdf,
      totalPaginasPdf,
      responsavel,
      enderecoEmpresa,
      mapaRelLatStr,
      mapaRelLngStr,
      fotosRelatorio,
      dataInicio,
      dataFim,
      dataRelatorio,
      cotaSuperficie,
      cotaBocaCano,
      coordFuso,
      crea,
      rodapeContato,
      nivelAgua,
      equipamento,
      diametroInstalacao,
      tuboRevestimento,
      bentonite,
      preFiltro,
      seloSanitario,
      acabamento,
      camadasGeologicas,
    };
  }

  function adicionarCamadaGeol() {
    setCamadasGeologicas((prev) => [
      ...prev,
      { de: "", ate: "", tipo: "", cor: COR_PADRAO_CAMADA, descricao: "" },
    ]);
  }

  function atualizarCamadaGeol(
    index: number,
    campo: keyof CamadaGeol,
    valor: string,
  ) {
    setCamadasGeologicas((prev) => {
      const novo = [...prev];
      novo[index] = { ...novo[index], [campo]: valor };
      return novo;
    });
  }

  function selecionarTipoCamada(index: number, nome: string) {
    setCamadasGeologicas((prev) => {
      const novo = [...prev];
      if (!nome) {
        novo[index] = {
          ...novo[index],
          tipo: "",
          cor: COR_PADRAO_CAMADA,
        };
        return novo;
      }
      const tipo = TIPOS_ROCHA.find((t) => t.nome === nome);
      if (!tipo) return prev;
      novo[index] = { ...novo[index], tipo: tipo.nome, cor: tipo.cor };
      return novo;
    });
  }

  async function guardarProjeto() {
    if (!comFuro || furoId == null) return;
    const codigo = codigoPoco.trim();
    if (!codigo) {
      setProjetoMsg({
        type: "err",
        text: "Indique o nome / código do poço antes de guardar.",
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

  function adicionarLeitura() {
    setLeituras([
      ...leituras,
      {
        data: "",
        nivel: "",
        obs: "",
      },
    ]);
  }

  function atualizarLeitura<K extends keyof Leitura>(
    index: number,
    campo: K,
    valor: Leitura[K],
  ) {
    setLeituras((prev) => {
      const novo = [...prev];
      novo[index] = { ...novo[index], [campo]: valor };
      return novo;
    });
  }

  async function gerarPDF() {
    const el = pdfRef.current;
    if (!el) return;
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
      const safe = (codigoPoco.trim() || "piezo").replace(/[^\w.-]+/g, "_");
      pdf.save(`relatorio-piezometrico-${safe}.pdf`);
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
              obraIdMapa != null ? `/pocos?obraId=${obraIdMapa}` : "/pocos"
            }
            className="font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            ← Lista piezométrica desta obra
          </Link>
          <span className="text-[var(--muted)]">Furo #{furoId}</span>
        </div>
      )}

      <h1 className="mb-2 text-2xl font-semibold text-[var(--text)]">
        Poços piezométricos / monitoramento
      </h1>
      <p className="mb-4 max-w-3xl text-sm text-[var(--muted)]">
        Registo de instalação, leituras de nível, mapa WGS84 opcional e fotos no
        PDF.
      </p>
      {obraIdMapa != null && (
        <p className="mb-4 text-sm">
          <Link
            href={`/pocos/mapa-carga-hidraulica?obraId=${obraIdMapa}`}
            className="font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Mapa de carga hidráulica (interpolação entre poços desta obra)
          </Link>
        </p>
      )}

      {loadError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      )}

      <div className="mb-6 max-w-xl">
        <label
          className="block text-sm font-medium text-[var(--text)]"
          htmlFor="poco-nome-identificacao"
        >
          Nome / código do poço
        </label>
        <input
          id="poco-nome-identificacao"
          value={codigoPoco}
          onChange={(e) => setCodigoPoco(e.target.value)}
          placeholder="ex.: PZ 01, PZ 02"
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
                    href={`/pocos?obraId=${obraIdMapa}`}
                    className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Ver PZ 01, PZ 02…
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
          codigoFuro={codigoPoco}
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
          onClick={adicionarLeitura}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
        >
          + Adicionar leitura
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

      {leituras.length > 0 && (
        <div className="mb-8 overflow-x-auto">
          <table className="w-full border-collapse border border-[var(--border)] text-sm">
            <thead className="bg-[var(--surface)]">
              <tr className="text-[var(--text)]">
                <th className="border border-[var(--border)] p-2">Data</th>
                <th className="border border-[var(--border)] p-2">Nível (m)</th>
                <th className="border border-[var(--border)] p-2">Obs.</th>
                <th className="w-10 border border-[var(--border)] p-2" />
              </tr>
            </thead>
            <tbody>
              {leituras.map((row, i) => (
                <tr key={i}>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      value={row.data}
                      onChange={(e) =>
                        atualizarLeitura(i, "data", e.target.value)
                      }
                      placeholder="dd/mm/aaaa"
                      className="w-full min-w-[7rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      value={row.nivel}
                      onChange={(e) =>
                        atualizarLeitura(i, "nivel", e.target.value)
                      }
                      className="w-full min-w-[5rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td className="border border-[var(--border)] p-1">
                    <input
                      value={row.obs}
                      onChange={(e) =>
                        atualizarLeitura(i, "obs", e.target.value)
                      }
                      className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-sm"
                    />
                  </td>
                  <td className="border border-[var(--border)] p-1 text-center">
                    <button
                      type="button"
                      aria-label="Remover linha"
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() =>
                        setLeituras((prev) => prev.filter((_, j) => j !== i))
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

      <section
        className="mt-6 border-t border-[var(--border)] pt-8"
        aria-label="Relatório PDF"
      >
        <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
          Relatório (PDF)
        </h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          O PDF segue o modelo de boletim SOILSUL (poço de monitoramento): cabeçalho,
          perfis esquemáticos, grelha técnica, legenda, mapa, leituras e fotos.
        </p>

        <div className="mb-4 print:hidden">
          <RelatorioFotosCampo
            fotos={fotosRelatorio}
            onChange={setFotosRelatorio}
            maxFotos={8}
          />
        </div>

        <div
          className="mb-4 rounded-lg border-2 border-sky-400/70 bg-sky-50/90 p-3 dark:border-sky-600 dark:bg-sky-950/40 print:hidden"
        >
          <label
            htmlFor="piezo-na-boletim"
            className="text-sm font-semibold text-[var(--text)]"
          >
            N<sub>a</sub> — nível d&apos;água (boletim)
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Profundidade em metros (ex.: 2,40). Usa a coluna N<sub>a</sub> no PDF e
            a linha azul no perfil. É diferente das leituras por data na tabela
            acima.
          </p>
          <input
            id="piezo-na-boletim"
            value={nivelAgua}
            onChange={(e) => setNivelAgua(e.target.value)}
            className="mt-2 w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm font-medium"
            inputMode="decimal"
            placeholder="ex.: 2,40"
            autoComplete="off"
          />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 print:hidden">
          <LabeledInput
            id="piezo-pdf-obra"
            label="Obra"
            value={obraNome}
            onChange={(e) => setObraNome(e.target.value)}
            placeholder="Nome da obra"
          />
          <LabeledInput
            id="piezo-pdf-cliente"
            label="Cliente"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-local"
            label="Local"
            value={localObra}
            onChange={(e) => setLocalObra(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-ref"
            label="Ref."
            value={refObra}
            onChange={(e) => setRefObra(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-data-instal"
            label="Data instalação"
            value={dataInstalacao}
            onChange={(e) => setDataInstalacao(e.target.value)}
            placeholder="dd/mm/aaaa"
          />
          <LabeledInput
            id="piezo-pdf-diametro"
            label="Diâmetro (ex.: 2 pol.)"
            value={diametro}
            onChange={(e) => setDiametro(e.target.value)}
          />
          <p className="col-span-2 text-xs text-[var(--muted)] sm:col-span-2">
            <strong className="text-[var(--text)]">Instalação / perfil do poço (PDF):</strong>{" "}
            tubo liso e ranhurado — dados de obra,{" "}
            <strong className="text-[var(--text)]">não</strong> confundir com as
            camadas geológicas (secção abaixo). Metros alimentam a coluna de tubagem
            no boletim.
          </p>
          <LabeledInput
            id="piezo-pdf-tubo-liso"
            label="Tubo liso — revestimento (m)"
            value={tuboRevestimento}
            onChange={(e) => setTuboRevestimento(e.target.value)}
            title="Comprimento do tubo liso — parte superior da coluna tubagem"
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-tubo-ranh"
            label="Tubo ranhurado — compr. filtro / tela (m)"
            value={comprimentoFiltro}
            onChange={(e) => setComprimentoFiltro(e.target.value)}
            title="Comprimento do tubo ranhurado — parte inferior da coluna tubagem"
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-tipo-filtro"
            label="Tipo filtro / tela (descrição)"
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            wrapperClassName="sm:col-span-2"
          />
          <LabeledInput
            id="piezo-pdf-prof-total"
            label="Profundidade total (m)"
            value={profundidadeTotal}
            onChange={(e) => setProfundidadeTotal(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-cota-boca"
            label="Cota boca (m)"
            value={cotaBoca}
            onChange={(e) => setCotaBoca(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-coord-n"
            label="Coord. N (SIRGAS2000)"
            value={coordN}
            onChange={(e) => setCoordN(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-coord-e"
            label="Coord. E (SIRGAS2000)"
            value={coordE}
            onChange={(e) => setCoordE(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-fuso"
            label="Fuso UTM"
            value={coordFuso}
            onChange={(e) => setCoordFuso(e.target.value)}
            placeholder="ex.: 22 S"
          />
          <LabeledInput
            id="piezo-pdf-data-ini"
            label="Data início sondagem (boletim)"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-data-fim"
            label="Data término sondagem"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-data-rel"
            label="Data do relatório / boletim"
            value={dataRelatorio}
            onChange={(e) => setDataRelatorio(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-cota-sup"
            label="Cota superfície (m)"
            value={cotaSuperficie}
            onChange={(e) => setCotaSuperficie(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-cota-boca-cano"
            label="Cota boca do cano (m)"
            value={cotaBocaCano}
            onChange={(e) => setCotaBocaCano(e.target.value)}
            inputMode="decimal"
            placeholder="Se vazio, usa cota boca"
          />
          <LabeledInput
            id="piezo-pdf-equip"
            label="Equipamento"
            value={equipamento}
            onChange={(e) => setEquipamento(e.target.value)}
            placeholder="ex.: TRADO MECANIZADO"
            wrapperClassName="sm:col-span-2"
          />
          <LabeledInput
            id="piezo-pdf-diam-inst"
            label="Diâmetro instalação (pol. ou mm)"
            value={diametroInstalacao}
            onChange={(e) => setDiametroInstalacao(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-bentonita"
            label="Bentonita (m)"
            value={bentonite}
            onChange={(e) => setBentonite(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-pre-filtro"
            label="Pré-filtro (m)"
            value={preFiltro}
            onChange={(e) => setPreFiltro(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-selo"
            label="Selo sanitário (m)"
            value={seloSanitario}
            onChange={(e) => setSeloSanitario(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-acabamento"
            label="Acabamento"
            value={acabamento}
            onChange={(e) => setAcabamento(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-crea"
            label="CREA (nº registo)"
            value={crea}
            onChange={(e) => setCrea(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-rodape"
            label="Rodapé: telefone / site (opcional)"
            value={rodapeContato}
            onChange={(e) => setRodapeContato(e.target.value)}
          />
          <LabeledInput
            id="piezo-pdf-lat"
            label="Latitude mapa PDF (WGS84 °)"
            value={mapaRelLatStr}
            onChange={(e) => setMapaRelLatStr(e.target.value)}
            inputMode="decimal"
          />
          <LabeledInput
            id="piezo-pdf-lng"
            label="Longitude mapa PDF (WGS84 °)"
            value={mapaRelLngStr}
            onChange={(e) => setMapaRelLngStr(e.target.value)}
            inputMode="decimal"
          />
          <p className="text-xs text-[var(--muted)] sm:col-span-2 print:hidden">
            Sem coordenadas WGS84 válidas, o PDF não mostra o mapa estático.
          </p>
          <LabeledInput
            id="piezo-pdf-pagina"
            label="Página"
            type="number"
            min={1}
            value={paginaPdf}
            onChange={(e) =>
              setPaginaPdf(Math.max(1, Number(e.target.value) || 1))
            }
          />
          <LabeledInput
            id="piezo-pdf-total-pag"
            label="Total páginas"
            type="number"
            min={1}
            value={totalPaginasPdf}
            onChange={(e) =>
              setTotalPaginasPdf(Math.max(1, Number(e.target.value) || 1))
            }
          />
          <LabeledTextarea
            id="piezo-pdf-notas"
            label="Notas de instalação (opcional)"
            value={notasInstalacao}
            onChange={(e) => setNotasInstalacao(e.target.value)}
            rows={2}
            wrapperClassName="sm:col-span-2"
          />
          <LabeledInput
            id="piezo-pdf-resp"
            label="Responsável técnico"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            wrapperClassName="sm:col-span-2"
          />
          <LabeledInput
            id="piezo-pdf-endereco"
            label="Endereço (rodapé)"
            value={enderecoEmpresa}
            onChange={(e) => setEnderecoEmpresa(e.target.value)}
            wrapperClassName="sm:col-span-2"
          />
        </div>

        <div className="mb-6 print:hidden">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
            Camadas geológicas (boletim)
          </h3>
          <p className="mb-2 text-xs text-[var(--muted)]">
            <strong className="text-[var(--text)]">Perfil geológico</strong> (litologia
            da sondagem) — dados à parte do{" "}
            <strong className="text-[var(--text)]">perfil do poço</strong> (tubos e
            anular), preenchido acima. Material e cores alinhados à rotativa (CPRM).
          </p>
          <button
            type="button"
            onClick={adicionarCamadaGeol}
            className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)]"
          >
            + Camada
          </button>
          {camadasGeologicas.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[var(--surface)] text-left text-[var(--text)]">
                      <th className="border border-[var(--border)] p-2">De (m)</th>
                      <th className="border border-[var(--border)] p-2">Até (m)</th>
                      <th className="border border-[var(--border)] p-2">
                        Material
                      </th>
                      <th className="border border-[var(--border)] p-2">
                        Descrição
                      </th>
                      <th className="border border-[var(--border)] p-2">Cor</th>
                      <th className="w-10 border border-[var(--border)] p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {camadasGeologicas.map((row, i) => (
                      <tr key={i}>
                        <td className="border border-[var(--border)] p-1">
                          <input
                            value={row.de}
                            onChange={(e) =>
                              atualizarCamadaGeol(i, "de", e.target.value)
                            }
                            className="w-full min-w-[4rem] rounded border border-[var(--border)] bg-[var(--card)] p-1"
                          />
                        </td>
                        <td className="border border-[var(--border)] p-1">
                          <input
                            value={row.ate}
                            onChange={(e) =>
                              atualizarCamadaGeol(i, "ate", e.target.value)
                            }
                            className="w-full min-w-[4rem] rounded border border-[var(--border)] bg-[var(--card)] p-1"
                          />
                        </td>
                        <td className="border border-[var(--border)] p-1">
                          <select
                            value={row.tipo}
                            onChange={(e) =>
                              selecionarTipoCamada(i, e.target.value)
                            }
                            className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--text)]"
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
                              atualizarCamadaGeol(i, "descricao", e.target.value)
                            }
                            className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1"
                          />
                        </td>
                        <td
                          className="h-10 w-12 min-w-[2.5rem] border border-[var(--border)] p-0"
                          style={{ backgroundColor: row.cor }}
                          title={row.tipo || row.cor}
                          aria-label={
                            row.tipo ? `Cor: ${row.tipo}` : "Sem material"
                          }
                        />
                        <td className="border border-[var(--border)] p-1 text-center">
                          <button
                            type="button"
                            aria-label="Remover camada"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() =>
                              setCamadasGeologicas((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
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
              <div className="mt-4 print:hidden">
                <p className="mb-2 text-xs font-medium text-[var(--text)]">
                  Pré-visualização — perfil estratigráfico
                </p>
                {perfil.length > 0 ? (
                  <PerfilEstratigrafico dados={perfil} />
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    Indique profundidades válidas em <strong>De</strong> e{" "}
                    <strong>Até</strong> (m) para desenhar a coluna.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => void gerarPDF()}
          disabled={pdfLoading}
          className="mb-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50 print:hidden"
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

        <PiezoRelatorioPdf
          ref={pdfRef}
          leituras={leituras}
          meta={{
            pocoCodigo: codigoPoco,
            cliente,
            obra: obraNome,
            local: localObra,
            ref: refObra,
            dataInstalacao,
            dataInicio,
            dataFim,
            dataRelatorio,
            diametro,
            comprimentoFiltro,
            tipoFiltro,
            profundidadeTotal,
            cotaBoca,
            cotaSuperficie,
            cotaBocaCano: cotaBocaCano.trim() || cotaBoca,
            coordN,
            coordE,
            coordFuso,
            notasInstalacao,
            pagina: paginaPdf,
            totalPaginas: totalPaginasPdf,
            responsavel,
            crea,
            endereco: enderecoEmpresa,
            rodapeContato: rodapeContato.trim() || undefined,
            nivelAgua,
            equipamento,
            diametroInstalacao,
            tuboRevestimento,
            bentonite,
            preFiltro,
            seloSanitario,
            acabamento,
            camadasGeologicas,
            mapaLatitude: mapCoordsForPdf?.lat,
            mapaLongitude: mapCoordsForPdf?.lng,
            mapaZoom: 16,
            fotosCampo:
              fotosRelatorio.length > 0 ? fotosRelatorio : undefined,
          }}
        />
      </section>
    </div>
  );
}
