"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  LeituraCampoDipoloDipolo,
  LeituraCampoSchlumberger,
  LeituraCampoVES,
  ModeloDuasCamadas,
  ModeloSchlumbergerCamadas,
} from "@/lib/geofisica/types";
import {
  forwardDipoloFromModel,
  invertDipoloDipoloTwoLayerGrid,
} from "@/lib/geofisica/invert-dipolo-2layer";
import {
  forwardFromModel,
  invertWennerTwoLayerGrid,
} from "@/lib/geofisica/invert-wenner-2layer";
import {
  forwardSchlumbergerFromModel,
  invertSchlumbergerTwoLayerGrid,
} from "@/lib/geofisica/invert-schlumberger-2layer";
import {
  clampSchlumbergerModelToSurvey,
  invertSchlumbergerIpi2Win,
} from "@/lib/geofisica/invert-schlumberger-ipi2win";
import { forwardSchlumbergerPhysical } from "@/lib/geofisica/sev-forward-physical";
import { downloadTextFile } from "@/lib/field-export-kml-gpx";
import { apiUrl } from "@/lib/api-url";

const STORAGE_KEY = "soilsul-geofisica-ves-leituras-v1";
const STORAGE_SCHLUM_ROWS = "soilsul-geofisica-ves-schlum-leituras-v1";
const STORAGE_DIPOLO_ROWS = "soilsul-geofisica-ves-dipolo-rows-v1";
const STORAGE_DIPOLO_A = "soilsul-geofisica-ves-dipolo-a-v1";
const STORAGE_METODO = "soilsul-geofisica-ves-metodo-v1";
const STORAGE_MODEL = "soilsul-geofisica-ves-modelo-v1";

type MetodoVES = "wenner" | "schlumberger" | "dipolo";
type VesProjectDbItem = {
  id: number;
  nome: string;
  metodo: string;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
};
type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
};
type VesProjetoFile = {
  version: 1;
  metodo: MetodoVES;
  rowsW: LeituraCampoVES[];
  rowsSchlum: Omit<RowSchlum, "id">[];
  rowsD: Array<{ n: number; rhoApparentOhmM: number }>;
  dipoloAM: string;
  rho1Input: string;
  modH1: string;
  modRho2: string;
};

/** Inversão 2 camadas (grelha) ou multicamadas Schlumberger (Koefoed + filtro). */
type VesInversaoEstado =
  | {
      tipo: "duas-camadas";
      model: ModeloDuasCamadas;
      rmseLog: number;
      syntheticRho: number[];
    }
  | {
      tipo: "ipi2win";
      nCamadas: number;
      rhoOhmM: number[];
      hM: number[];
      rmseLog: number;
      rmsRelativoPct: number;
      syntheticRho: number[];
    };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEMO_WENNER: LeituraCampoVES[] = [
  { abHalfM: 0.5, rhoApparentOhmM: 98 },
  { abHalfM: 1, rhoApparentOhmM: 95 },
  { abHalfM: 2, rhoApparentOhmM: 88 },
  { abHalfM: 4, rhoApparentOhmM: 72 },
  { abHalfM: 8, rhoApparentOhmM: 48 },
  { abHalfM: 15, rhoApparentOhmM: 32 },
  { abHalfM: 30, rhoApparentOhmM: 24 },
  { abHalfM: 60, rhoApparentOhmM: 21 },
];

/** Exemplo dipolo-dipolo: a fixo 25 m, n crescente (tipo curva H). */
const DEMO_DIPOLO_N = [1, 2, 3, 4, 5, 6, 7, 8];
const DEMO_DIPOLO_RHO = [92, 88, 80, 68, 52, 38, 30, 26];

type RowW = LeituraCampoVES & { id: string };
type RowD = { id: string; n: number; rhoApparentOhmM: number };
type RowSchlum = {
  id: string;
  abHalfM: number;
  mnHalfM: number;
  sp1: number;
  v1: number;
  i1: number;
  sp2: number;
  v2: number;
  i2: number;
};
type SchlumEditableKey =
  | "abHalfM"
  | "mnHalfM"
  | "sp1"
  | "v1"
  | "i1"
  | "sp2"
  | "v2"
  | "i2";
const SCHLUM_EDITABLE_COLS: SchlumEditableKey[] = [
  "abHalfM",
  "mnHalfM",
  "sp1",
  "v1",
  "i1",
  "sp2",
  "v2",
  "i2",
];

function toRowsW(leituras: LeituraCampoVES[]): RowW[] {
  return leituras.map((L) => ({ ...L, id: uid() }));
}

function rmseLog10Rho(medido: number[], modelo: number[]): number {
  if (medido.length === 0 || medido.length !== modelo.length) return 0;
  return Math.sqrt(
    medido.reduce((acc, rm, i) => {
      const a = Math.log10(rm);
      const b = Math.log10(Math.max(1e-12, modelo[i]!));
      return acc + (a - b) ** 2;
    }, 0) / medido.length,
  );
}

function rmsRelativoPctArrays(medido: number[], modelo: number[]): number {
  if (medido.length === 0 || medido.length !== modelo.length) return 0;
  let s = 0;
  for (let i = 0; i < medido.length; i++) {
    const den = medido[i]! || 1e-12;
    s += ((medido[i]! - modelo[i]!) / den) ** 2;
  }
  return Math.sqrt(s / medido.length) * 100;
}

function fromRowsW(rows: RowW[]): LeituraCampoVES[] {
  return rows.map(({ abHalfM, rhoApparentOhmM }) => ({
    abHalfM,
    rhoApparentOhmM,
  }));
}

function parseInputNumber(raw: string): number {
  const clean = raw.replace(",", ".").trim();
  if (!clean) return Number.NaN;
  const n = Number(clean);
  return Number.isFinite(n) ? n : Number.NaN;
}

function inputValue(n: number): string | number {
  return Number.isFinite(n) ? n : "";
}

function avg2(a: number, b: number): number {
  const aOk = Number.isFinite(a);
  const bOk = Number.isFinite(b);
  if (aOk && bOk) return (a + b) / 2;
  if (aOk) return a;
  if (bOk) return b;
  return Number.NaN;
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : "";
}

type CamadaResistividade = {
  nome: string;
  topoM: number;
  baseM: number;
  espessuraM: number;
  rhoOhmM: number;
};

/** Pontos para LineChart stepAfter: mesma geometria que `camadasInterpretadas`. */
function stepDepthRhoFromCamadas(layers: CamadaResistividade[]): {
  depth: number;
  rho: number;
}[] {
  if (layers.length === 0) return [];
  const out: { depth: number; rho: number }[] = [];
  for (let i = 0; i < layers.length; i++) {
    const { topoM, baseM, rhoOhmM } = layers[i]!;
    out.push({ depth: topoM, rho: rhoOhmM });
    out.push({ depth: baseM, rho: rhoOhmM });
    const next = layers[i + 1];
    if (next) {
      out.push({ depth: baseM, rho: next.rhoOhmM });
    }
  }
  return out;
}

/** Converte camadas da UI em modelo do forward físico (última camada = semi-espaço). */
function camadasToSchlumbergerForwardModel(
  layers: CamadaResistividade[],
): ModeloSchlumbergerCamadas | null {
  if (layers.length < 2) return null;
  return {
    rhoOhmM: layers.map((l) => l.rhoOhmM),
    hM: layers.slice(0, -1).map((l) => l.espessuraM),
  };
}

type LayerAutoEstimate = {
  rho1: number;
  h1: number;
  rho2: number;
  h2?: number;
  rho3?: number;
  h3?: number;
  rho4?: number;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function corCamadaPorRho(rho: number, rhoMin: number, rhoMax: number): string {
  const logMin = Math.log10(Math.max(1e-6, rhoMin));
  const logMax = Math.log10(Math.max(rhoMin * 1.01, rhoMax));
  const logRho = Math.log10(Math.max(1e-6, rho));
  const t = clamp01((logRho - logMin) / Math.max(1e-6, logMax - logMin));
  const hue = 220 - t * 190;
  return `hsl(${hue.toFixed(0)} 78% 46%)`;
}

function medianSlice(values: number[]): number {
  const sorted = [...values]
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function estimateLayersFromCurve(
  points: Array<{ x: number; rho: number }>,
  nLayers: 2 | 3 | 4,
): LayerAutoEstimate | null {
  const p = points
    .filter((v) => v.x > 0 && v.rho > 0 && Number.isFinite(v.x) && Number.isFinite(v.rho))
    .sort((a, b) => a.x - b.x);
  if (p.length < 4) return null;

  const n = p.length;
  const head = p.slice(0, Math.max(2, Math.floor(n * 0.2)));
  const tail = p.slice(Math.max(0, n - Math.max(2, Math.floor(n * 0.2))));
  const rho1 = medianSlice(head.map((v) => v.rho));
  const rhoTail = medianSlice(tail.map((v) => v.rho));

  let idxMin = 0;
  for (let i = 1; i < n; i++) {
    if (p[i]!.rho < p[idxMin]!.rho) idxMin = i;
  }
  let idxMaxAfter = idxMin;
  for (let i = idxMin; i < n; i++) {
    if (p[i]!.rho > p[idxMaxAfter]!.rho) idxMaxAfter = i;
  }

  const xMin = p[idxMin]!.x;
  const xMax = p[n - 1]!.x;
  const rho2 = p[idxMin]!.rho;
  const rho3 = p[idxMaxAfter]!.rho;
  const h1 = Math.max(0.5, xMin);
  const h2 = Math.max(0.5, p[idxMaxAfter]!.x - xMin);

  const tailFirst = tail[0]!.rho;
  const tailLast = tail[tail.length - 1]!.rho;
  const tailTrend = Math.log10(tailLast) - Math.log10(tailFirst);
  const rho4 =
    tailTrend < -0.15
      ? Math.max(1, rho2 * 0.6)
      : tailTrend > 0.15
        ? Math.max(1, rho3 * 1.05)
        : Math.max(1, rhoTail);
  const rem = Math.max(1, xMax - (h1 + h2));
  const h3 = rem * 0.45;

  if (nLayers === 2) return { rho1, h1, rho2 };
  if (nLayers === 3) return { rho1, h1, rho2, h2, rho3 };
  return { rho1, h1, rho2, h2, rho3, h3, rho4 };
}

function calcSchlumberger(row: RowSchlum) {
  const sp = avg2(row.sp1, row.sp2);
  const v = avg2(row.v1, row.v2);
  const deltaV =
    Number.isFinite(v) && Number.isFinite(sp)
      ? v - sp
      : Number.NaN;
  const i = avg2(row.i1, row.i2);
  const vOverI =
    Number.isFinite(deltaV) && Number.isFinite(i) && i !== 0
      ? Math.abs(deltaV / i)
      : Number.NaN;
  const k =
    row.mnHalfM > 0 && row.abHalfM > row.mnHalfM
      ? (((row.abHalfM - row.mnHalfM) * (row.abHalfM + row.mnHalfM)) /
          (2 * row.mnHalfM)) *
        3.14
      : Number.NaN;
  const rhoA =
    Number.isFinite(vOverI) && Number.isFinite(k) ? vOverI * k : Number.NaN;
  return { sp, v, deltaV, i, vOverI, k, rhoA };
}

function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return Number.NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

function adjustSchlumRowToTargetRho(row: RowSchlum, targetRho: number): RowSchlum {
  const c = calcSchlumberger(row);
  if (
    !(targetRho > 0) ||
    !Number.isFinite(targetRho) ||
    !Number.isFinite(c.k) ||
    c.k <= 0 ||
    !Number.isFinite(c.sp) ||
    !Number.isFinite(c.i) ||
    c.i === 0
  ) {
    return row;
  }
  const targetVoverI = targetRho / c.k;
  const targetDeltaV = targetVoverI * c.i;
  const targetV = c.sp + targetDeltaV;
  const out = { ...row };
  const v1Ok = Number.isFinite(out.v1);
  const v2Ok = Number.isFinite(out.v2);
  if (v1Ok && v2Ok) out.v2 = 2 * targetV - out.v1;
  else if (v1Ok) out.v1 = targetV;
  else if (v2Ok) out.v2 = targetV;
  else out.v1 = targetV;
  return out;
}

function createEmptySchlumRow(): RowSchlum {
  return {
    id: uid(),
    abHalfM: Number.NaN,
    mnHalfM: Number.NaN,
    sp1: Number.NaN,
    v1: Number.NaN,
    i1: Number.NaN,
    sp2: Number.NaN,
    v2: Number.NaN,
    i2: Number.NaN,
  };
}

function sortedDipoloLeituras(
  rows: RowD[],
  aM: number,
): LeituraCampoDipoloDipolo[] {
  return rows
    .filter(
      (r) =>
        r.n >= 1 &&
        Number.isFinite(r.n) &&
        r.rhoApparentOhmM > 0 &&
        Number.isFinite(r.rhoApparentOhmM),
    )
    .map((r) => ({
      aM,
      n: Math.round(r.n),
      rhoApparentOhmM: r.rhoApparentOhmM,
    }))
    .sort((a, b) => a.n - b.n);
}

export function VesGeofisicaClient() {
  const searchParams = useSearchParams();
  const obraIdQ = searchParams.get("obraId");
  const initialObraId = obraIdQ ? Number(obraIdQ) : Number.NaN;
  const [obras, setObras] = useState<ObraListItem[]>([]);
  const [selectedObraId, setSelectedObraId] = useState<number | null>(
    Number.isFinite(initialObraId) ? initialObraId : null,
  );
  const [tab, setTab] = useState<"dados" | "perfil" | "inversao">("dados");
  const [perfilModo, setPerfilModo] = useState<"sem-inversao" | "com-inversao">(
    "sem-inversao",
  );
  const [metodo, setMetodo] = useState<MetodoVES>("schlumberger");
  const [rowsW, setRowsW] = useState<RowW[]>([]);
  const [rowsSchlum, setRowsSchlum] = useState<RowSchlum[]>([]);
  const [rowsD, setRowsD] = useState<RowD[]>([]);
  const [dipoloAM, setDipoloAM] = useState("25");
  const [rho1Input, setRho1Input] = useState("100");
  const [modH1, setModH1] = useState("5");
  const [modRho2, setModRho2] = useState("25");
  const [numCamadas, setNumCamadas] = useState<2 | 3 | 4>(2);
  const [modH2, setModH2] = useState("8");
  const [modRho3, setModRho3] = useState("120");
  const [modH3, setModH3] = useState("12");
  const [modRho4, setModRho4] = useState("250");
  const [projectName, setProjectName] = useState("SEV01");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [dbProjects, setDbProjects] = useState<VesProjectDbItem[]>([]);
  const [dbBusy, setDbBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const schlumChartWrapRef = useRef<HTMLDivElement | null>(null);
  const [draggingSchlumRowIdx, setDraggingSchlumRowIdx] = useState<number | null>(
    null,
  );
  const [inversao, setInversao] = useState<VesInversaoEstado | null>(null);
  /** Só invalida IPI2Win quando o utilizador muda o Nº camadas (evita efeitos a correr a cada update de `inversao`). */
  const numCamadasAnteriorRef = useRef(numCamadas);

  const dipoloAVal = Number(dipoloAM.replace(",", "."));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/obra"), { cache: "no-store" });
        const data = (await r.json().catch(() => [])) as ObraListItem[];
        if (!cancelled && r.ok && Array.isArray(data)) {
          setObras(data);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q =
      searchParams.get("metodo") ?? searchParams.get("m") ?? "";
    if (
      q === "wenner" ||
      q === "schlumberger" ||
      q === "dipolo"
    ) {
      setMetodo(q);
      try {
        localStorage.setItem(STORAGE_METODO, q);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const mSt = localStorage.getItem(STORAGE_METODO);
      if (
        mSt === "dipolo" ||
        mSt === "wenner" ||
        mSt === "schlumberger"
      )
        setMetodo(mSt);
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const rawLeituras = localStorage.getItem(STORAGE_KEY);
      if (rawLeituras) {
        const p = JSON.parse(rawLeituras) as LeituraCampoVES[];
        if (Array.isArray(p) && p.length)
          setRowsW(toRowsW(p.filter((x) => x && x.abHalfM > 0)));
      }
      const rawSchlum = localStorage.getItem(STORAGE_SCHLUM_ROWS);
      if (rawSchlum) {
        const p = JSON.parse(rawSchlum) as Array<
          Partial<RowSchlum> & Partial<LeituraCampoVES>
        >;
        if (Array.isArray(p) && p.length) {
          setRowsSchlum(
            p.map((x) => ({
              id: uid(),
              abHalfM: Number(x.abHalfM),
              mnHalfM: Number(x.mnHalfM),
              sp1: Number(x.sp1),
              v1: Number(x.v1),
              i1: Number(x.i1),
              sp2: Number(x.sp2),
              v2: Number(x.v2),
              i2: Number(x.i2),
            })),
          );
        }
      }
      const rawD = localStorage.getItem(STORAGE_DIPOLO_ROWS);
      if (rawD) {
        const arr = JSON.parse(rawD) as { n?: number; rhoApparentOhmM?: number }[];
        if (Array.isArray(arr) && arr.length) {
          setRowsD(
            arr
              .filter((x) => x && x.n != null && x.rhoApparentOhmM != null)
              .map((x) => ({
                id: uid(),
                n: Number(x.n),
                rhoApparentOhmM: Number(x.rhoApparentOhmM),
              })),
          );
        }
      }
      const aSt = localStorage.getItem(STORAGE_DIPOLO_A);
      if (aSt) setDipoloAM(aSt);
    } catch {
      /* ignore */
    }
  }, []);

  const persistWenner = useCallback((r: RowW[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromRowsW(r)));
    } catch {
      /* ignore */
    }
  }, []);

  const persistDipolo = useCallback((r: RowD[], a: string) => {
    try {
      localStorage.setItem(
        STORAGE_DIPOLO_ROWS,
        JSON.stringify(
          r.map(({ n, rhoApparentOhmM }) => ({ n, rhoApparentOhmM })),
        ),
      );
      localStorage.setItem(STORAGE_DIPOLO_A, a);
    } catch {
      /* ignore */
    }
  }, []);

  const persistMetodo = useCallback((m: MetodoVES) => {
    try {
      localStorage.setItem(STORAGE_METODO, m);
    } catch {
      /* ignore */
    }
  }, []);

  const persistSchlum = useCallback((r: RowSchlum[]) => {
    try {
      localStorage.setItem(STORAGE_SCHLUM_ROWS, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  }, []);

  const persistInversao = useCallback((inv: VesInversaoEstado | null) => {
    try {
      if (inv) localStorage.setItem(STORAGE_MODEL, JSON.stringify(inv));
      else localStorage.removeItem(STORAGE_MODEL);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (numCamadasAnteriorRef.current === numCamadas) return;
    numCamadasAnteriorRef.current = numCamadas;
    setInversao((prev) => {
      if (prev?.tipo !== "ipi2win") return prev;
      if (prev.nCamadas === numCamadas) return prev;
      persistInversao(null);
      return null;
    });
  }, [numCamadas, persistInversao]);

  const snapshotProjeto = useCallback((): VesProjetoFile => {
    return {
      version: 1,
      metodo,
      rowsW: fromRowsW(rowsW),
      rowsSchlum: rowsSchlum.map(({ id: _id, ...rest }) => rest),
      rowsD: rowsD.map(({ n, rhoApparentOhmM }) => ({ n, rhoApparentOhmM })),
      dipoloAM,
      rho1Input,
      modH1,
      modRho2,
    };
  }, [metodo, rowsW, rowsSchlum, rowsD, dipoloAM, rho1Input, modH1, modRho2]);

  const aplicarSnapshotProjeto = useCallback(
    (data: Partial<VesProjetoFile>) => {
      const nextMetodo: MetodoVES =
        data.metodo === "wenner" ||
        data.metodo === "schlumberger" ||
        data.metodo === "dipolo"
          ? data.metodo
          : "schlumberger";
      const nextRowsW = toRowsW(
        Array.isArray(data.rowsW)
          ? data.rowsW.filter(
              (x) => x && x.abHalfM != null && x.rhoApparentOhmM != null,
            )
          : [],
      );
      const nextRowsSchlum: RowSchlum[] = Array.isArray(data.rowsSchlum)
        ? data.rowsSchlum.map((x) => ({
            id: uid(),
            abHalfM: Number(x.abHalfM),
            mnHalfM: Number(x.mnHalfM),
            sp1: Number(x.sp1),
            v1: Number(x.v1),
            i1: Number(x.i1),
            sp2: Number(x.sp2),
            v2: Number(x.v2),
            i2: Number(x.i2),
          }))
        : [];
      const nextRowsD: RowD[] = Array.isArray(data.rowsD)
        ? data.rowsD
            .filter((x) => x && x.n != null && x.rhoApparentOhmM != null)
            .map((x) => ({
              id: uid(),
              n: Number(x.n),
              rhoApparentOhmM: Number(x.rhoApparentOhmM),
            }))
        : [];

      setMetodo(nextMetodo);
      setRowsW(nextRowsW);
      setRowsSchlum(nextRowsSchlum);
      setRowsD(nextRowsD);
      setDipoloAM(typeof data.dipoloAM === "string" ? data.dipoloAM : "25");
      setRho1Input(typeof data.rho1Input === "string" ? data.rho1Input : "100");
      setModH1(typeof data.modH1 === "string" ? data.modH1 : "5");
      setModRho2(typeof data.modRho2 === "string" ? data.modRho2 : "25");
      setInversao(null);

      persistMetodo(nextMetodo);
      persistWenner(nextRowsW);
      persistSchlum(nextRowsSchlum);
      persistDipolo(
        nextRowsD,
        typeof data.dipoloAM === "string" ? data.dipoloAM : "25",
      );
      persistInversao(null);
    },
    [persistDipolo, persistInversao, persistMetodo, persistSchlum, persistWenner],
  );

  const loadDbProjects = useCallback(async () => {
    if (selectedObraId == null || !Number.isFinite(selectedObraId)) {
      setDbProjects([]);
      return;
    }
    try {
      const res = await fetch(
        apiUrl(`/api/ves-projects?projectId=${selectedObraId}`),
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { projects?: VesProjectDbItem[] };
      setDbProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      /* ignore */
    }
  }, [selectedObraId]);

  const saveProjectToDb = useCallback(async () => {
    const nome = projectName.trim();
    if (!nome) {
      alert("Informe o nome do projeto (ex.: SEV01).");
      return;
    }
    setDbBusy(true);
    try {
      const payload = snapshotProjeto();
      let res: Response;
      if (selectedObraId == null || !Number.isFinite(selectedObraId)) {
        alert("Selecione a obra para vincular este projeto.");
        return;
      }
      if (selectedProjectId != null) {
        res = await fetch(apiUrl(`/api/ves-projects/${selectedProjectId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, metodo, payload, projectId: selectedObraId }),
        });
      } else {
        res = await fetch(apiUrl("/api/ves-projects"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, metodo, payload, projectId: selectedObraId }),
        });
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Falha ao salvar projeto no banco.");
        return;
      }
      const saved = (await res.json()) as VesProjectDbItem;
      setSelectedProjectId(saved.id);
      setProjectName(saved.nome);
      await loadDbProjects();
      alert("Projeto salvo no banco.");
    } catch {
      alert("Falha ao salvar projeto no banco.");
    } finally {
      setDbBusy(false);
    }
  }, [
    loadDbProjects,
    metodo,
    projectName,
    selectedObraId,
    selectedProjectId,
    snapshotProjeto,
  ]);

  const loadProjectFromDb = useCallback(async () => {
    if (selectedProjectId == null) {
      alert("Selecione um projeto salvo.");
      return;
    }
    setDbBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/ves-projects/${selectedProjectId}`), {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Falha ao abrir projeto.");
        return;
      }
      const item = (await res.json()) as { nome: string; payload: VesProjetoFile };
      setProjectName(item.nome ?? projectName);
      aplicarSnapshotProjeto(item.payload);
    } catch {
      alert("Falha ao abrir projeto.");
    } finally {
      setDbBusy(false);
    }
  }, [aplicarSnapshotProjeto, projectName, selectedProjectId]);

  const deleteProjectFromDb = useCallback(async () => {
    if (selectedProjectId == null) {
      alert("Selecione um projeto salvo para excluir.");
      return;
    }
    const ok = window.confirm("Excluir projeto selecionado do banco de dados?");
    if (!ok) return;
    setDbBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/ves-projects/${selectedProjectId}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Falha ao excluir projeto.");
        return;
      }
      setSelectedProjectId(null);
      await loadDbProjects();
      alert("Projeto excluído.");
    } catch {
      alert("Falha ao excluir projeto.");
    } finally {
      setDbBusy(false);
    }
  }, [loadDbProjects, selectedProjectId]);

  useEffect(() => {
    const onMouseUp = () => setDraggingSchlumRowIdx(null);
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    void loadDbProjects();
  }, [loadDbProjects]);

  useEffect(() => {
    setSelectedProjectId(null);
  }, [selectedObraId]);

  const sortedLeiturasW = useMemo(() => {
    const L = fromRowsW(rowsW).filter(
      (x) => x.abHalfM > 0 && x.rhoApparentOhmM > 0,
    );
    return [...L].sort((a, b) => a.abHalfM - b.abHalfM);
  }, [rowsW]);

  const sortedLeiturasD = useMemo(() => {
    if (!(dipoloAVal > 0)) return [];
    return sortedDipoloLeituras(rowsD, dipoloAVal);
  }, [rowsD, dipoloAVal]);

  const sortedLeiturasSchlum = useMemo<LeituraCampoSchlumberger[]>(() => {
    const L = rowsSchlum
      .map((r) => {
        const c = calcSchlumberger(r);
        return {
          abHalfM: r.abHalfM,
          mnHalfM: r.mnHalfM,
          rhoApparentOhmM: c.rhoA,
        };
      })
      .filter(
        (x) =>
          x.abHalfM > x.mnHalfM &&
          x.mnHalfM > 0 &&
          x.rhoApparentOhmM > 0 &&
          Number.isFinite(x.abHalfM) &&
          Number.isFinite(x.mnHalfM) &&
          Number.isFinite(x.rhoApparentOhmM),
      );
    return [...L].sort((a, b2) => a.abHalfM - b2.abHalfM);
  }, [rowsSchlum]);

  /** Corrige modelos IPI2Win antigos com espessuras fora de escala (m). */
  useEffect(() => {
    if (metodo !== "schlumberger" || !inversao || inversao.tipo !== "ipi2win") return;
    if (sortedLeiturasSchlum.length === 0) return;
    const espessuraForaPadrao = inversao.hM.some(
      (h) => !Number.isFinite(h) || h <= 0 || h > 400,
    );
    if (!espessuraForaPadrao) return;
    const ab2 = sortedLeiturasSchlum.map((l) => l.abHalfM);
    const data = sortedLeiturasSchlum.map((l) => l.rhoApparentOhmM);
    const abMax = Math.max(...ab2);
    const model = clampSchlumbergerModelToSurvey(
      { rhoOhmM: inversao.rhoOhmM, hM: inversao.hM },
      abMax,
      Math.min(...data),
      Math.max(...data),
    );
    const sameLen =
      model.hM.length === inversao.hM.length &&
      model.rhoOhmM.length === inversao.rhoOhmM.length;
    const unchanged =
      sameLen &&
      model.hM.every((h, i) => h === inversao.hM[i]) &&
      model.rhoOhmM.every((r, i) => r === inversao.rhoOhmM[i]);
    if (unchanged) return;

    const syntheticRho = forwardSchlumbergerPhysical(ab2, model);
    const next: VesInversaoEstado = {
      ...inversao,
      rhoOhmM: model.rhoOhmM,
      hM: model.hM,
      syntheticRho,
      rmseLog: rmseLog10Rho(data, syntheticRho),
      rmsRelativoPct: rmsRelativoPctArrays(data, syntheticRho),
    };
    setInversao(next);
    persistInversao(next);
  }, [metodo, inversao, sortedLeiturasSchlum, persistInversao]);

  const chartDataAparenteW = useMemo(
    () =>
      sortedLeiturasW.map((L) => ({
        x: L.abHalfM,
        rhoA: L.rhoApparentOhmM,
      })),
    [sortedLeiturasW],
  );

  const chartDataAparenteD = useMemo(
    () =>
      sortedLeiturasD.map((L) => ({
        x: L.n,
        rhoA: L.rhoApparentOhmM,
      })),
    [sortedLeiturasD],
  );

  const chartDataAparenteSchlum = useMemo(
    () =>
      sortedLeiturasSchlum.map((L) => ({
        x: L.abHalfM,
        rhoA: L.rhoApparentOhmM,
        rowIdx: rowsSchlum.findIndex(
          (r) => r.abHalfM === L.abHalfM && r.mnHalfM === L.mnHalfM,
        ),
      })),
    [sortedLeiturasSchlum, rowsSchlum],
  );
  const schlumValidRows = useMemo(
    () =>
      rowsSchlum
        .map((row, idx) => {
          const c = calcSchlumberger(row);
          return { idx, row, calc: c };
        })
        .filter(
          (x) =>
            x.row.abHalfM > x.row.mnHalfM &&
            x.row.mnHalfM > 0 &&
            x.calc.rhoA > 0 &&
            Number.isFinite(x.calc.rhoA),
        )
        .sort((a, b) => a.row.abHalfM - b.row.abHalfM),
    [rowsSchlum],
  );

  const camadasInterpretadas = useMemo<CamadaResistividade[]>(() => {
    if (!inversao) return [];
    if (inversao.tipo === "ipi2win") {
      const { rhoOhmM, hM } = inversao;
      const layers: CamadaResistividade[] = [];
      let topo = 0;
      const zBaseSemi = hM.reduce((s, h) => s + h, 0);
      const profundidadeFinal = Math.max(25, zBaseSemi * 2);
      for (let i = 0; i < rhoOhmM.length; i++) {
        if (i < hM.length) {
          const base = topo + hM[i]!;
          layers.push({
            nome: `Camada ${i + 1}`,
            topoM: topo,
            baseM: base,
            espessuraM: hM[i]!,
            rhoOhmM: rhoOhmM[i]!,
          });
          topo = base;
        } else {
          layers.push({
            nome: `Camada ${i + 1}`,
            topoM: topo,
            baseM: profundidadeFinal,
            espessuraM: Math.max(0.1, profundidadeFinal - topo),
            rhoOhmM: rhoOhmM[i]!,
          });
        }
      }
      return layers;
    }
    const { h1M, rho1OhmM, rho2OhmM } = inversao.model;
    const profundidadeFinal = Math.max(25, h1M * 5);
    const h2Val = Number(modH2.replace(",", "."));
    const rho3Val = Number(modRho3.replace(",", "."));
    const h3Val = Number(modH3.replace(",", "."));
    const rho4Val = Number(modRho4.replace(",", "."));

    if (numCamadas === 2) {
      return [
        {
          nome: "Camada 1",
          topoM: 0,
          baseM: h1M,
          espessuraM: h1M,
          rhoOhmM: rho1OhmM,
        },
        {
          nome: "Camada 2",
          topoM: h1M,
          baseM: profundidadeFinal,
          espessuraM: profundidadeFinal - h1M,
          rhoOhmM: rho2OhmM,
        },
      ];
    }

    if (numCamadas === 3) {
      const h2Safe = Number.isFinite(h2Val) && h2Val > 0 ? h2Val : Math.max(1, h1M);
      const base2 = Math.min(profundidadeFinal - 0.1, h1M + h2Safe);
      return [
        {
          nome: "Camada 1",
          topoM: 0,
          baseM: h1M,
          espessuraM: h1M,
          rhoOhmM: rho1OhmM,
        },
        {
          nome: "Camada 2",
          topoM: h1M,
          baseM: base2,
          espessuraM: Math.max(0.1, base2 - h1M),
          rhoOhmM: rho2OhmM,
        },
        {
          nome: "Camada 3",
          topoM: base2,
          baseM: profundidadeFinal,
          espessuraM: Math.max(0.1, profundidadeFinal - base2),
          rhoOhmM: Number.isFinite(rho3Val) && rho3Val > 0 ? rho3Val : rho2OhmM,
        },
      ];
    }

    const h2Safe = Number.isFinite(h2Val) && h2Val > 0 ? h2Val : Math.max(1, h1M);
    const h3Safe = Number.isFinite(h3Val) && h3Val > 0 ? h3Val : Math.max(1, h1M);
    const base2 = Math.min(profundidadeFinal - 0.2, h1M + h2Safe);
    const base3 = Math.min(profundidadeFinal - 0.1, base2 + h3Safe);
    return [
      {
        nome: "Camada 1",
        topoM: 0,
        baseM: h1M,
        espessuraM: h1M,
        rhoOhmM: rho1OhmM,
      },
      {
        nome: "Camada 2",
        topoM: h1M,
        baseM: base2,
        espessuraM: Math.max(0.1, base2 - h1M),
        rhoOhmM: rho2OhmM,
      },
      {
        nome: "Camada 3",
        topoM: base2,
        baseM: base3,
        espessuraM: Math.max(0.1, base3 - base2),
        rhoOhmM: Number.isFinite(rho3Val) && rho3Val > 0 ? rho3Val : rho2OhmM,
      },
      {
        nome: "Camada 4",
        topoM: base3,
        baseM: profundidadeFinal,
        espessuraM: Math.max(0.1, profundidadeFinal - base3),
        rhoOhmM: Number.isFinite(rho4Val) && rho4Val > 0 ? rho4Val : rho2OhmM,
      },
    ];
  }, [inversao, numCamadas, modH2, modRho3, modH3, modRho4]);

  /**
   * Curva modelo Schlumberger: sempre alinhada com as camadas do perfil (forward Koefoed + filtro),
   * exceto grelha 2 camadas — aí mantém-se o forward com MN/2 por leitura.
   */
  const syntheticRhoParaExibicao = useMemo(() => {
    if (!inversao) return null;
    if (metodo !== "schlumberger") return inversao.syntheticRho;
    if (inversao.tipo === "duas-camadas" && numCamadas === 2) {
      return inversao.syntheticRho;
    }
    const m = camadasToSchlumbergerForwardModel(camadasInterpretadas);
    if (!m || camadasInterpretadas.length < 2) return inversao.syntheticRho;
    const ab2 = sortedLeiturasSchlum.map((l) => l.abHalfM);
    if (ab2.length === 0) return inversao.syntheticRho;
    const out = forwardSchlumbergerPhysical(ab2, m);
    if (out.length !== ab2.length || out.some((x) => !Number.isFinite(x) || x <= 0)) {
      return inversao.syntheticRho;
    }
    return out;
  }, [inversao, metodo, numCamadas, camadasInterpretadas, sortedLeiturasSchlum]);

  const chartDataPerfilComInversao = useMemo(() => {
    if (!inversao) return [];
    const syn = syntheticRhoParaExibicao ?? inversao.syntheticRho;
    if (metodo === "wenner") {
      return sortedLeiturasW.map((L, i) => ({
        x: L.abHalfM,
        rhoA: L.rhoApparentOhmM,
        rhoModelo: syn[i] ?? Number.NaN,
      }));
    }
    if (metodo === "schlumberger") {
      return sortedLeiturasSchlum.map((L, i) => ({
        x: L.abHalfM,
        rhoA: L.rhoApparentOhmM,
        rhoModelo: syn[i] ?? Number.NaN,
      }));
    }
    return sortedLeiturasD.map((L, i) => ({
      x: L.n,
      rhoA: L.rhoApparentOhmM,
      rhoModelo: syn[i] ?? Number.NaN,
    }));
  }, [
    inversao,
    metodo,
    syntheticRhoParaExibicao,
    sortedLeiturasW,
    sortedLeiturasSchlum,
    sortedLeiturasD,
  ]);
  const chartDataInversao = useMemo(
    () =>
      chartDataPerfilComInversao.map((p) => ({
        x: p.x,
        medido: p.rhoA,
        modelo: p.rhoModelo,
      })),
    [chartDataPerfilComInversao],
  );

  const chartDataProfundidade = useMemo(() => {
    if (!inversao) return [];
    return stepDepthRhoFromCamadas(camadasInterpretadas);
  }, [inversao, camadasInterpretadas]);

  const faixaRhoCamadas = useMemo(() => {
    if (camadasInterpretadas.length === 0) return { min: 1, max: 100 };
    const valores = camadasInterpretadas.map((c) => c.rhoOhmM);
    return {
      min: Math.min(...valores),
      max: Math.max(...valores),
    };
  }, [camadasInterpretadas]);
  const profundidadeTotalCamadas = useMemo(
    () => camadasInterpretadas.at(-1)?.baseM ?? 1,
    [camadasInterpretadas],
  );

  const addRowW = () => {
    setRowsW((r) => {
      const n = [...r, { id: uid(), abHalfM: 1, rhoApparentOhmM: 50 }];
      persistWenner(n);
      return n;
    });
  };

  const addRowD = () => {
    setRowsD((r) => {
      const n = [...r, { id: uid(), n: 1, rhoApparentOhmM: 50 }];
      persistDipolo(n, dipoloAM);
      return n;
    });
  };

  const loadDemoW = () => {
    const n = toRowsW(DEMO_WENNER);
    setRowsW(n);
    persistWenner(n);
    setInversao(null);
    persistInversao(null);
  };

  const loadDemoD = () => {
    const n = DEMO_DIPOLO_N.map((nv, i) => ({
      id: uid(),
      n: nv,
      rhoApparentOhmM: DEMO_DIPOLO_RHO[i] ?? 40,
    }));
    setRowsD(n);
    persistDipolo(n, dipoloAM);
    setInversao(null);
    persistInversao(null);
  };

  const clearAll = () => {
    setRowsW([]);
    setRowsSchlum([]);
    setRowsD([]);
    setInversao(null);
    persistWenner([]);
    persistSchlum([]);
    persistDipolo([], dipoloAM);
    persistInversao(null);
  };

  const updateRowW = (id: string, patch: Partial<LeituraCampoVES>) => {
    setRowsW((prev) => {
      const n = prev.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      );
      persistWenner(n);
      return n;
    });
  };

  const updateRowD = (id: string, patch: Partial<RowD>) => {
    setRowsD((prev) => {
      const n = prev.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      );
      persistDipolo(n, dipoloAM);
      return n;
    });
  };

  const removeRowW = (id: string) => {
    setRowsW((prev) => {
      const n = prev.filter((x) => x.id !== id);
      persistWenner(n);
      return n;
    });
  };

  const removeRowD = (id: string) => {
    setRowsD((prev) => {
      const n = prev.filter((x) => x.id !== id);
      persistDipolo(n, dipoloAM);
      return n;
    });
  };

  const addRowSchlum = () => {
    setRowsSchlum((r) => {
      const n = [...r, createEmptySchlumRow()];
      persistSchlum(n);
      return n;
    });
  };

  const loadDemoSchlum = () => {
    const n = DEMO_WENNER.map((w) => ({
      id: uid(),
      abHalfM: w.abHalfM,
      mnHalfM: 0.5,
      sp1: Number.NaN,
      v1: Number.NaN,
      i1: Number.NaN,
      sp2: Number.NaN,
      v2: Number.NaN,
      i2: Number.NaN,
    }));
    setRowsSchlum(n);
    persistSchlum(n);
    setInversao(null);
    persistInversao(null);
  };

  const updateRowSchlum = (id: string, patch: Partial<RowSchlum>) => {
    setRowsSchlum((prev) => {
      const n = prev.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      );
      persistSchlum(n);
      return n;
    });
  };

  const removeRowSchlum = (id: string) => {
    setRowsSchlum((prev) => {
      const n = prev.filter((x) => x.id !== id);
      persistSchlum(n);
      return n;
    });
  };

  const pasteSchlumMatrix = (
    startRow: number,
    startCol: number,
    clipboardText: string,
  ) => {
    const rows = clipboardText
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split("\t"));
    if (rows.length === 0) return;

    setRowsSchlum((prev) => {
      const next = [...prev];
      const neededRows = startRow + rows.length;
      while (next.length < neededRows) next.push(createEmptySchlumRow());

      rows.forEach((cells, rOffset) => {
        const target = next[startRow + rOffset];
        if (!target) return;
        cells.forEach((cell, cOffset) => {
          const colIndex = startCol + cOffset;
          const key = SCHLUM_EDITABLE_COLS[colIndex];
          if (!key) return;
          target[key] = parseInputNumber(cell);
        });
      });

      persistSchlum(next);
      return next;
    });
  };

  const autoAjustarOutliersSchlum = () => {
    setRowsSchlum((prev) => {
      type Item = { idx: number; row: RowSchlum; rho: number; k: number; sp: number; i: number };
      const valid: Item[] = prev
        .map((row, idx) => {
          const c = calcSchlumberger(row);
          return { idx, row, rho: c.rhoA, k: c.k, sp: c.sp, i: c.i };
        })
        .filter(
          (x) =>
            Number.isFinite(x.rho) &&
            x.rho > 0 &&
            Number.isFinite(x.k) &&
            x.k > 0 &&
            Number.isFinite(x.sp) &&
            Number.isFinite(x.i) &&
            x.i !== 0,
        )
        .sort((a, b) => a.row.abHalfM - b.row.abHalfM);

      if (valid.length < 5) return prev;

      const next = [...prev];
      for (let i = 1; i < valid.length - 1; i++) {
        const cur = valid[i]!;
        const left = valid[i - 1]!;
        const right = valid[i + 1]!;
        const targetRho = median([left.rho, cur.rho, right.rho]);
        if (!(targetRho > 0) || !Number.isFinite(targetRho)) continue;

        const logDiff = Math.abs(Math.log10(cur.rho) - Math.log10(targetRho));
        const isOutlier = logDiff > 0.35; // ~factor 2.2 para cima/baixo
        if (!isOutlier) continue;

        next[cur.idx] = adjustSchlumRowToTargetRho(next[cur.idx]!, targetRho);
      }

      persistSchlum(next);
      return next;
    });
  };

  const ajustarManualRaSchlum = (rowIdx: number, targetRhoRaw: string) => {
    const targetRho = parseInputNumber(targetRhoRaw);
    if (!(targetRho > 0)) return;
    setRowsSchlum((prev) => {
      if (!prev[rowIdx]) return prev;
      const next = [...prev];
      next[rowIdx] = adjustSchlumRowToTargetRho(next[rowIdx]!, targetRho);
      persistSchlum(next);
      return next;
    });
  };
  const ajustarManualRaSchlumNumero = (rowIdx: number, targetRho: number) => {
    if (!(targetRho > 0) || !Number.isFinite(targetRho)) return;
    setRowsSchlum((prev) => {
      if (!prev[rowIdx]) return prev;
      const next = [...prev];
      next[rowIdx] = adjustSchlumRowToTargetRho(next[rowIdx]!, targetRho);
      persistSchlum(next);
      return next;
    });
  };

  const onSchlumChartMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (metodo !== "schlumberger") return;
    if (draggingSchlumRowIdx == null) return;
    const wrap = schlumChartWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const topPad = 20;
    const bottomPad = 30;
    const plotTop = topPad;
    const plotBottom = rect.height - bottomPad;
    const clampedY = Math.min(plotBottom, Math.max(plotTop, y));
    const t = (clampedY - plotTop) / Math.max(1, plotBottom - plotTop);

    const yVals = chartDataAparenteSchlum
      .map((p) => p.rhoA)
      .filter((v) => v > 0 && Number.isFinite(v));
    if (yVals.length < 2) return;
    const yMin = Math.min(...yVals);
    const yMax = Math.max(...yVals);
    const logMin = Math.log10(yMin);
    const logMax = Math.log10(yMax);
    const logTarget = logMax - t * (logMax - logMin);
    const targetRho = 10 ** logTarget;
    ajustarManualRaSchlumNumero(draggingSchlumRowIdx, targetRho);
  };

  const onDipoloAChange = (v: string) => {
    setDipoloAM(v);
    try {
      localStorage.setItem(STORAGE_DIPOLO_A, v);
    } catch {
      /* ignore */
    }
  };

  const salvarProjeto = () => {
    const payload = snapshotProjeto();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(
      `ves-geofisica-${metodo}-${stamp}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  };

  const abrirProjeto = () => {
    fileInputRef.current?.click();
  };

  const onProjetoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Partial<VesProjetoFile>;
      if (data.version !== 1) throw new Error("Formato de projeto inválido.");
      aplicarSnapshotProjeto(data);
    } catch {
      alert("Não foi possível abrir o projeto. Verifique o ficheiro JSON.");
    } finally {
      e.target.value = "";
    }
  };

  const runInversion = () => {
    const rho1 = Number(rho1Input.replace(",", "."));
    if (metodo === "wenner") {
      const inv = invertWennerTwoLayerGrid(sortedLeiturasW, rho1);
      const next = inv
        ? ({
            tipo: "duas-camadas",
            model: inv.model,
            rmseLog: inv.rmseLog,
            syntheticRho: inv.syntheticRho,
          } satisfies VesInversaoEstado)
        : null;
      setInversao(next);
      persistInversao(next);
    } else if (metodo === "schlumberger") {
      const inv = invertSchlumbergerTwoLayerGrid(
        sortedLeiturasSchlum,
        rho1,
      );
      const next = inv
        ? ({
            tipo: "duas-camadas",
            model: inv.model,
            rmseLog: inv.rmseLog,
            syntheticRho: inv.syntheticRho,
          } satisfies VesInversaoEstado)
        : null;
      setInversao(next);
      persistInversao(next);
    } else {
      if (!(dipoloAVal > 0)) return;
      const inv = invertDipoloDipoloTwoLayerGrid(
        sortedLeiturasD,
        dipoloAVal,
        rho1,
      );
      const next = inv
        ? ({
            tipo: "duas-camadas",
            model: inv.model,
            rmseLog: inv.rmseLog,
            syntheticRho: inv.syntheticRho,
          } satisfies VesInversaoEstado)
        : null;
      setInversao(next);
      persistInversao(next);
    }
  };

  const runInversionIpi2Win = () => {
    if (metodo !== "schlumberger") return;
    const ab2 = sortedLeiturasSchlum.map((l) => l.abHalfM);
    const data = sortedLeiturasSchlum.map((l) => l.rhoApparentOhmM);
    const out = invertSchlumbergerIpi2Win(ab2, data, numCamadas);
    if (!out) return;
    const abMax = Math.max(...ab2);
    const model = clampSchlumbergerModelToSurvey(
      out.model,
      abMax,
      Math.min(...data),
      Math.max(...data),
    );
    const syntheticRho = forwardSchlumbergerPhysical(ab2, model);
    const rmseLog = rmseLog10Rho(data, syntheticRho);
    const rmsRelativoPct = rmsRelativoPctArrays(data, syntheticRho);
    const next: VesInversaoEstado = {
      tipo: "ipi2win",
      nCamadas: numCamadas,
      rhoOhmM: model.rhoOhmM,
      hM: model.hM,
      rmseLog,
      rmsRelativoPct,
      syntheticRho,
    };
    const r = model.rhoOhmM;
    const h = model.hM;
    setRho1Input(r[0]!.toFixed(1));
    if (h[0] != null && h[0] > 0) setModH1(h[0].toFixed(2));
    setModRho2(r[1]!.toFixed(1));
    if (numCamadas >= 3) {
      if (h[1] != null && h[1] > 0) setModH2(h[1].toFixed(2));
      if (r[2] != null) setModRho3(r[2].toFixed(1));
    }
    if (numCamadas >= 4) {
      if (h[2] != null && h[2] > 0) setModH3(h[2].toFixed(2));
      if (r[3] != null) setModRho4(r[3].toFixed(1));
    }
    setInversao(next);
    persistInversao(next);
  };

  const aplicarModeloManual = () => {
    const rho1 = Number(rho1Input.replace(",", "."));
    const h1 = Number(modH1.replace(",", "."));
    const rho2 = Number(modRho2.replace(",", "."));
    if (!(rho1 > 0) || !(h1 > 0) || !(rho2 > 0)) return;
    const model: ModeloDuasCamadas = {
      rho1OhmM: rho1,
      h1M: h1,
      rho2OhmM: rho2,
    };
    const syn =
      metodo === "wenner"
        ? forwardFromModel(sortedLeiturasW, model)
        : metodo === "schlumberger"
          ? forwardSchlumbergerFromModel(sortedLeiturasSchlum, model)
          : dipoloAVal > 0
            ? forwardDipoloFromModel(sortedLeiturasD, dipoloAVal, model)
            : [];
    const leiturasRho =
      metodo === "wenner"
        ? sortedLeiturasW.map((l) => l.rhoApparentOhmM)
        : metodo === "schlumberger"
          ? sortedLeiturasSchlum.map((l) => l.rhoApparentOhmM)
          : sortedLeiturasD.map((l) => l.rhoApparentOhmM);
    const err =
      leiturasRho.length > 0 ? rmseLog10Rho(leiturasRho, syn) : 0;
    const inv: VesInversaoEstado = {
      tipo: "duas-camadas",
      model,
      rmseLog: err,
      syntheticRho: syn,
    };
    setInversao(inv);
    persistInversao(inv);
  };

  const aplicarModeloAutomatico = () => {
    const pts =
      metodo === "wenner"
        ? sortedLeiturasW.map((l) => ({ x: l.abHalfM, rho: l.rhoApparentOhmM }))
        : metodo === "schlumberger"
          ? sortedLeiturasSchlum.map((l) => ({ x: l.abHalfM, rho: l.rhoApparentOhmM }))
          : sortedLeiturasD.map((l) => ({ x: l.n, rho: l.rhoApparentOhmM }));
    const est = estimateLayersFromCurve(pts, numCamadas);
    if (!est) return;

    setRho1Input(est.rho1.toFixed(1));
    setModH1(est.h1.toFixed(2));
    setModRho2(est.rho2.toFixed(1));
    if (numCamadas >= 3) {
      setModH2((est.h2 ?? 8).toFixed(2));
      setModRho3((est.rho3 ?? est.rho2).toFixed(1));
    }
    if (numCamadas >= 4) {
      setModH3((est.h3 ?? 12).toFixed(2));
      setModRho4((est.rho4 ?? est.rho2).toFixed(1));
    }
    aplicarModeloManual();
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        tab === id
          ? "bg-teal-600 text-white shadow"
          : "bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--muted)]/10"
      }`}
    >
      {label}
    </button>
  );

  const nOkWenner = sortedLeiturasW.length >= 3;
  const nOkSchlum =
    sortedLeiturasSchlum.length >= 3;
  const nOkDipolo =
    sortedLeiturasD.length >= 3 && dipoloAVal > 0 && Number.isFinite(dipoloAVal);
  const nOkInv =
    metodo === "wenner"
      ? nOkWenner
      : metodo === "schlumberger"
        ? nOkSchlum
        : nOkDipolo;

  const xAxisLabelInv =
    metodo === "dipolo"
      ? "n (separação dipolo-dipolo)"
      : "AB/2 (m)";
  const xAxisLabelAp = metodo === "dipolo" ? "n" : "AB/2 (m)";
  const metodoTitulo =
    metodo === "wenner"
      ? "SEV — Wenner"
      : metodo === "schlumberger"
        ? "SEV — Schlumberger"
        : "SEV — Dipolo-dipolo";
  const metodoDescricao =
    metodo === "wenner"
      ? "Wenner: AB/2 e ρa. Modelo: 2 camadas (imagens). Inversão: grelha + refinamento com ρ₁ fixa."
      : metodo === "schlumberger"
        ? "Schlumberger: AB/2 e MN/2 no arranjo, com dados de campo editáveis e cálculo automático de SP, V, DeltaV, I, V/I, K e Ra. Inversão: grelha 2 camadas ou multicamadas (forward físico Koefoed + filtro, estilo IPI2Win)."
        : "Dipolo-dipolo: a (m), n ≥ 1 e ρa. Modelo: 2 camadas (imagens). Inversão: grelha + refinamento com ρ₁ fixa.";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted)]">
            <Link href="/geofisica" className="text-teal-700 hover:underline dark:text-teal-400">
              ← Geofísica
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">
            {metodoTitulo}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            {metodoDescricao}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            {tabBtn("dados", "Dados de campo")}
            {tabBtn("perfil", "Perfil aparente")}
            {tabBtn("inversao", "Inversão")}
            <select
              value={selectedObraId ?? ""}
              onChange={(e) =>
                setSelectedObraId(e.target.value ? Number(e.target.value) : null)
              }
              className="max-w-72 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm dark:bg-gray-900"
            >
              <option value="">Selecione a obra (obrigatório)</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome} — {o.cliente}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="SEV01"
              className="w-28 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm dark:bg-gray-900"
            />
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) =>
                setSelectedProjectId(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="max-w-56 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm dark:bg-gray-900"
            >
              <option value="">Projetos salvos (DB)</option>
              {dbProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={saveProjectToDb}
              disabled={dbBusy || selectedObraId == null}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {selectedProjectId ? "Atualizar DB" : "Salvar no DB"}
            </button>
            <button
              type="button"
              onClick={loadProjectFromDb}
              disabled={dbBusy || selectedObraId == null || selectedProjectId == null}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
            >
              Abrir DB
            </button>
            <button
              type="button"
              onClick={deleteProjectFromDb}
              disabled={dbBusy || selectedObraId == null || selectedProjectId == null}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Excluir DB
            </button>
            <button
              type="button"
              onClick={salvarProjeto}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)]/10"
            >
              Salvar arquivo
            </button>
            <button
              type="button"
              onClick={abrirProjeto}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)]/10"
            >
              Abrir arquivo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onProjetoFileChange}
            />
          </div>
        </div>
      </div>

      {tab === "dados" && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          {selectedObraId == null && (
            <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              Selecione a obra para criar, abrir e salvar ensaios de resistividade.
            </p>
          )}
          {metodo === "wenner" ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addRowW}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  + Linha
                </button>
                <button
                  type="button"
                  onClick={loadDemoW}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
                >
                  Carregar exemplo
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Limpar
                </button>
              </div>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-2 pr-4 font-medium">AB/2 (m)</th>
                    <th className="py-2 pr-4 font-medium">ρa (Ω·m)</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rowsW.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)]/60">
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          className="w-28 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={row.abHalfM || ""}
                          onChange={(e) =>
                            updateRowW(row.id, {
                              abHalfM: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          className="w-28 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={row.rhoApparentOhmM || ""}
                          onChange={(e) =>
                            updateRowW(row.id, {
                              rhoApparentOhmM: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeRowW(row.id)}
                          className="text-red-600 text-xs hover:underline"
                        >
                          remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowsW.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  Sem linhas. Adicione leituras ou carregue o exemplo.
                </p>
              )}
            </>
          ) : metodo === "schlumberger" ? (
            <>
              <p className="text-xs text-[var(--muted)]">
                Dados de campo editáveis por linha: AB/2, MN/2, SP1, V1, I1, SP2, V2, I2.
                Calculados automaticamente: SP, V, DeltaV, I, V/I, K e Ra.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addRowSchlum}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  + Linha
                </button>
                <button
                  type="button"
                  onClick={loadDemoSchlum}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
                >
                  Carregar exemplo
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Limpar
                </button>
              </div>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-2 pr-2 font-medium">AB/2</th>
                    <th className="py-2 pr-2 font-medium">MN/2</th>
                    <th className="py-2 pr-2 font-medium">SP1</th>
                    <th className="py-2 pr-2 font-medium">V1</th>
                    <th className="py-2 pr-2 font-medium">I1</th>
                    <th className="py-2 pr-2 font-medium">SP2</th>
                    <th className="py-2 pr-2 font-medium">V2</th>
                    <th className="py-2 pr-2 font-medium">I2</th>
                    <th className="py-2 pr-2 font-medium">SP</th>
                    <th className="py-2 pr-2 font-medium">V</th>
                    <th className="py-2 pr-2 font-medium">DeltaV</th>
                    <th className="py-2 pr-2 font-medium">I</th>
                    <th className="py-2 pr-2 font-medium">V/I</th>
                    <th className="py-2 pr-2 font-medium">K</th>
                    <th className="py-2 pr-2 font-medium">Ra</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rowsSchlum.map((row, rowIndex) => {
                    const c = calcSchlumberger(row);
                    return (
                      <tr key={row.id} className="border-b border-[var(--border)]/60">
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          className="w-20 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={inputValue(row.abHalfM)}
                          onChange={(e) =>
                            updateRowSchlum(row.id, {
                              abHalfM: parseInputNumber(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (!text.includes("\t") && !text.includes("\n")) return;
                            e.preventDefault();
                            pasteSchlumMatrix(rowIndex, 0, text);
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          className="w-20 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={inputValue(row.mnHalfM)}
                          onChange={(e) =>
                            updateRowSchlum(row.id, {
                              mnHalfM: parseInputNumber(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (!text.includes("\t") && !text.includes("\n")) return;
                            e.preventDefault();
                            pasteSchlumMatrix(rowIndex, 1, text);
                          }}
                        />
                      </td>
                      {(["sp1", "v1", "i1", "sp2", "v2", "i2"] as const).map((k, idx) => (
                        <td key={k} className="py-2 pr-2">
                          <input
                            type="number"
                            step="any"
                            className="w-20 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                            value={inputValue(row[k])}
                            onChange={(e) =>
                              updateRowSchlum(row.id, {
                                [k]: parseInputNumber(e.target.value),
                              })
                            }
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text");
                              if (!text.includes("\t") && !text.includes("\n")) return;
                              e.preventDefault();
                              pasteSchlumMatrix(rowIndex, 2 + idx, text);
                            }}
                          />
                        </td>
                      ))}
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.sp, 2)}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.v, 2)}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.deltaV, 2)}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.i, 2)}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.vOverI, 2)}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.k, 2)}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{fmt(c.rhoA, 2)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeRowSchlum(row.id)}
                          className="text-red-600 text-xs hover:underline"
                        >
                          remover
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {rowsSchlum.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  Sem linhas. Adicione uma linha e preencha os dados de campo.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Comprimento do dipolo <em>a</em> (m) — comum a todas as leituras
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    className="mt-1 w-32 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                    value={dipoloAM}
                    onChange={(e) => onDipoloAChange(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Colinear: A=0, B=a; M=(n+1)a, N=(n+2)a. Factor geométrico K = π·a·n·(n+1)·(n+2).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addRowD}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  + Linha
                </button>
                <button
                  type="button"
                  onClick={loadDemoD}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
                >
                  Carregar exemplo
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Limpar
                </button>
              </div>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-2 pr-4 font-medium">n</th>
                    <th className="py-2 pr-4 font-medium">ρa (Ω·m)</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rowsD.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)]/60">
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step={1}
                          min={1}
                          className="w-24 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={row.n || ""}
                          onChange={(e) =>
                            updateRowD(row.id, {
                              n: Math.max(1, Math.round(Number(e.target.value))),
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          className="w-28 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={row.rhoApparentOhmM || ""}
                          onChange={(e) =>
                            updateRowD(row.id, {
                              rhoApparentOhmM: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeRowD(row.id)}
                          className="text-red-600 text-xs hover:underline"
                        >
                          remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowsD.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  Sem linhas. Defina <em>a</em>, adicione n e ρa ou carregue o exemplo.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tab === "perfil" && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Perfil de resistividade aparente
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPerfilModo("sem-inversao")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  perfilModo === "sem-inversao"
                    ? "bg-teal-600 text-white"
                    : "border border-[var(--border)] hover:bg-[var(--muted)]/10"
                }`}
              >
                Perfil sem inversão
              </button>
              <button
                type="button"
                onClick={() => setPerfilModo("com-inversao")}
                disabled={!inversao}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  perfilModo === "com-inversao"
                    ? "bg-teal-600 text-white"
                    : "border border-[var(--border)] hover:bg-[var(--muted)]/10"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Perfil com inversão
              </button>
            </div>
          </div>
          {metodo === "wenner" && chartDataAparenteW.length < 2 ? (
            <p className="text-sm text-[var(--muted)]">
              Introduza pelo menos duas leituras Wenner válidas.
            </p>
          ) : metodo === "schlumberger" && chartDataAparenteSchlum.length < 2 ? (
            <p className="text-sm text-[var(--muted)]">
              Schlumberger: MN/2 &gt; 0 e pelo menos duas leituras com AB/2 &gt; MN/2.
            </p>
          ) : metodo === "dipolo" && chartDataAparenteD.length < 2 ? (
            <p className="text-sm text-[var(--muted)]">
              Introduza pelo menos duas leituras dipolo-dipolo válidas (n ≥ 1, a &gt; 0).
            </p>
          ) : (
            <div className="space-y-3">
              {metodo === "schlumberger" && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={autoAjustarOutliersSchlum}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--muted)]/10"
                    >
                      Autoajustar pontos fora da curva
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="min-w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                          <th className="px-2 py-2 font-medium">AB/2</th>
                          <th className="px-2 py-2 font-medium">MN/2</th>
                          <th className="px-2 py-2 font-medium">Ra atual</th>
                          <th className="px-2 py-2 font-medium">Ra alvo (manual)</th>
                          <th className="px-2 py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {schlumValidRows.map((item) => (
                          <tr key={item.row.id} className="border-b border-[var(--border)]/60">
                            <td className="px-2 py-2">{fmt(item.row.abHalfM, 2)}</td>
                            <td className="px-2 py-2">{fmt(item.row.mnHalfM, 2)}</td>
                            <td className="px-2 py-2 font-mono">{fmt(item.calc.rhoA, 2)}</td>
                            <td className="px-2 py-2">
                              <input
                                id={`ra-alvo-${item.row.id}`}
                                type="number"
                                step="any"
                                defaultValue={fmt(item.calc.rhoA, 2)}
                                className="w-28 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.getElementById(
                                    `ra-alvo-${item.row.id}`,
                                  ) as HTMLInputElement | null;
                                  if (!el) return;
                                  ajustarManualRaSchlum(item.idx, el.value);
                                }}
                                className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--muted)]/10"
                              >
                                Aplicar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div
                ref={schlumChartWrapRef}
                className="h-[360px] w-full min-h-[280px]"
                onMouseMove={onSchlumChartMouseMove}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={
                      perfilModo === "com-inversao" && inversao
                        ? chartDataPerfilComInversao
                        : metodo === "wenner"
                          ? chartDataAparenteW
                          : metodo === "schlumberger"
                            ? chartDataAparenteSchlum
                            : chartDataAparenteD
                    }
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      scale={metodo === "dipolo" ? "linear" : "log"}
                      domain={["auto", "auto"]}
                      label={{
                        value: xAxisLabelAp,
                        position: "insideBottom",
                        offset: -4,
                      }}
                    />
                    <YAxis
                      dataKey="rhoA"
                      type="number"
                      scale="log"
                      domain={["auto", "auto"]}
                      label={{
                        value: "ρa (Ω·m)",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip
                      formatter={(v) => {
                        const n = typeof v === "number" ? v : Number(v);
                        const s = Number.isFinite(n) ? n.toFixed(2) : String(v);
                        return [s, "ρa"];
                      }}
                      labelFormatter={(l) =>
                        metodo === "dipolo" ? `n = ${l}` : `AB/2 = ${l} m`
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="rhoA"
                      name={perfilModo === "com-inversao" && inversao ? "Campo" : "Medido"}
                      stroke="#0d9488"
                      strokeWidth={2}
                      dot={(props) => {
                        const payload = props.payload as
                          | { rowIdx?: number }
                          | undefined;
                        const rowIdx = payload?.rowIdx;
                        if (metodo === "schlumberger" && rowIdx != null && rowIdx >= 0) {
                          return (
                            <circle
                              cx={props.cx}
                              cy={props.cy}
                              r={5}
                              fill="#ecfeff"
                              stroke="#0d9488"
                              strokeWidth={2}
                              style={{ cursor: "ns-resize" }}
                              onMouseDown={() => setDraggingSchlumRowIdx(rowIdx)}
                            />
                          );
                        }
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={4}
                            fill="#ecfeff"
                            stroke="#0d9488"
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                    {perfilModo === "com-inversao" && inversao && (
                      <Line
                        type="monotone"
                        dataKey="rhoModelo"
                        name="Modelo invertido"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {metodo === "schlumberger" && (
                <p className="text-xs text-[var(--muted)]">
                  Dica: clique e arraste um ponto para cima/baixo para ajustar manualmente a
                  curva. A planilha é atualizada automaticamente.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "inversao" && (
        <div className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)]">
                ρ₁ fixa (Ω·m) — 1.ª camada
              </label>
              <input
                type="text"
                className="mt-1 w-32 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                value={rho1Input}
                onChange={(e) => setRho1Input(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={runInversion}
              disabled={!nOkInv}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Correr inversão (grelha + refinamento)
            </button>
            {metodo === "schlumberger" && (
              <button
                type="button"
                onClick={runInversionIpi2Win}
                disabled={!nOkSchlum}
                title="Usa o número de camadas selecionado em «Modelo manual» (2–4)."
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Inversão multicamadas (IPI2Win)
              </button>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-[var(--border)] p-4">
            <p className="text-sm font-medium text-[var(--text)]">Modelo manual (opcional)</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-[var(--muted)]" htmlFor="mod-camadas">
                  Nº camadas (furo)
                </label>
                <select
                  id="mod-camadas"
                  value={numCamadas}
                  onChange={(e) => setNumCamadas(Number(e.target.value) as 2 | 3 | 4)}
                  className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]" htmlFor="mod-h1">
                  h₁ (m)
                </label>
                <input
                  id="mod-h1"
                  type="number"
                  step="any"
                  value={modH1}
                  onChange={(e) => setModH1(e.target.value)}
                  className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]" htmlFor="mod-rho2">
                  ρ₂ (Ω·m)
                </label>
                <input
                  id="mod-rho2"
                  type="number"
                  step="any"
                  value={modRho2}
                  onChange={(e) => setModRho2(e.target.value)}
                  className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                />
              </div>
              {numCamadas >= 3 && (
                <>
                  <div>
                    <label className="text-xs text-[var(--muted)]" htmlFor="mod-h2">
                      h₂ (m)
                    </label>
                    <input
                      id="mod-h2"
                      type="number"
                      step="any"
                      value={modH2}
                      onChange={(e) => setModH2(e.target.value)}
                      className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]" htmlFor="mod-rho3">
                      ρ₃ (Ω·m)
                    </label>
                    <input
                      id="mod-rho3"
                      type="number"
                      step="any"
                      value={modRho3}
                      onChange={(e) => setModRho3(e.target.value)}
                      className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                    />
                  </div>
                </>
              )}
              {numCamadas >= 4 && (
                <>
                  <div>
                    <label className="text-xs text-[var(--muted)]" htmlFor="mod-h3">
                      h₃ (m)
                    </label>
                    <input
                      id="mod-h3"
                      type="number"
                      step="any"
                      value={modH3}
                      onChange={(e) => setModH3(e.target.value)}
                      className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]" htmlFor="mod-rho4">
                      ρ₄ (Ω·m)
                    </label>
                    <input
                      id="mod-rho4"
                      type="number"
                      step="any"
                      value={modRho4}
                      onChange={(e) => setModRho4(e.target.value)}
                      className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                    />
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={aplicarModeloManual}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
              >
                Desenhar curva modelo
              </button>
              <button
                type="button"
                onClick={aplicarModeloAutomatico}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Modelo automático
              </button>
            </div>
          </div>

          {inversao && nOkInv && (
            <>
              {inversao.tipo === "duas-camadas" ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-[var(--muted)]/10 p-3 text-sm">
                    <div className="text-[var(--muted)]">ρ₁</div>
                    <div className="text-lg font-semibold">
                      {inversao.model.rho1OhmM.toFixed(1)} Ω·m
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--muted)]/10 p-3 text-sm">
                    <div className="text-[var(--muted)]">h₁</div>
                    <div className="text-lg font-semibold">
                      {inversao.model.h1M.toFixed(2)} m
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--muted)]/10 p-3 text-sm">
                    <div className="text-[var(--muted)]">ρ₂</div>
                    <div className="text-lg font-semibold">
                      {inversao.model.rho2OhmM.toFixed(1)} Ω·m
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                        <th className="px-3 py-2 font-medium">Camada</th>
                        <th className="px-3 py-2 font-medium">ρ (Ω·m)</th>
                        <th className="px-3 py-2 font-medium">h (m)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inversao.rhoOhmM.map((rho, i) => (
                        <tr
                          key={`ipi-${i}`}
                          className="border-b border-[var(--border)]/60 last:border-b-0"
                        >
                          <td className="px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2 font-mono">{rho.toFixed(1)}</td>
                          <td className="px-3 py-2 font-mono">
                            {i < inversao.hM.length
                              ? inversao.hM[i]!.toFixed(2)
                              : "— (semi-espaço)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">
                RMSE (log₁₀ ρ):{" "}
                <span className="font-mono">{inversao.rmseLog.toFixed(4)}</span>
                {inversao.tipo === "ipi2win" && (
                  <>
                    {" "}
                    · RMS relativo:{" "}
                    <span className="font-mono">
                      {inversao.rmsRelativoPct.toFixed(2)}%
                    </span>
                    {" "}
                    · Modelo IPI2Win:{" "}
                    <span className="font-mono">
                      {inversao.rhoOhmM.length} ρ, {inversao.hM.length} h
                    </span>
                  </>
                )}
              </p>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                  Perfil calculado (campo vs inversão) — mesmo modelo de cálculo
                </h3>
                <p className="mb-2 text-xs text-[var(--muted)]">
                  A curva calculada e as camadas abaixo vêm do mesmo resultado de inversão.
                </p>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartDataInversao} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                      <XAxis
                        dataKey="x"
                        type="number"
                        scale={metodo === "dipolo" ? "linear" : "log"}
                        domain={["auto", "auto"]}
                        label={{
                          value: xAxisLabelInv,
                          position: "insideBottom",
                          offset: -4,
                        }}
                      />
                      <YAxis
                        type="number"
                        scale="log"
                        domain={["auto", "auto"]}
                        label={{
                          value: "ρ (Ω·m)",
                          angle: -90,
                          position: "insideLeft",
                        }}
                      />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="medido"
                        name="Campo"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="modelo"
                        name="Modelo"
                        stroke="#ea580c"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                  Modelo interpretativo (ρ em função da profundidade)
                </h3>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartDataProfundidade}
                      margin={{ top: 8, right: 16, bottom: 28, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                      <XAxis
                        type="number"
                        dataKey="depth"
                        domain={[0, "auto"]}
                        label={{
                          value: "Profundidade (m)",
                          position: "insideBottom",
                          offset: -14,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="rho"
                        domain={["auto", "auto"]}
                        label={{
                          value: "ρ (Ω·m)",
                          angle: -90,
                          position: "insideLeft",
                        }}
                      />
                      <Tooltip />
                      <Line
                        type="stepAfter"
                        dataKey="rho"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Camadas de resistividade (furo de sondagem)
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Camadas derivadas do último resultado de inversão (2 camadas ou multicamadas
                  Schlumberger).
                </p>
                <div className="grid gap-4 md:grid-cols-[180px,1fr]">
                  <div className="mx-auto h-[320px] w-[120px] overflow-hidden rounded-lg border-2 border-slate-500/70 bg-slate-50 dark:bg-slate-950">
                    {camadasInterpretadas.map((camada) => {
                      const alturaPct =
                        (camada.espessuraM / Math.max(1e-6, profundidadeTotalCamadas)) * 100;
                      return (
                        <div
                          key={camada.nome}
                          className="relative flex items-center justify-center border-b border-white/60 text-center text-[11px] font-semibold text-white last:border-b-0"
                          style={{
                            height: `${Math.max(14, alturaPct)}%`,
                            backgroundColor: corCamadaPorRho(
                              camada.rhoOhmM,
                              faixaRhoCamadas.min,
                              faixaRhoCamadas.max,
                            ),
                          }}
                        >
                          {camada.nome}
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                          <th className="px-3 py-2 font-medium">Camada</th>
                          <th className="px-3 py-2 font-medium">Topo (m)</th>
                          <th className="px-3 py-2 font-medium">Base (m)</th>
                          <th className="px-3 py-2 font-medium">Espessura (m)</th>
                          <th className="px-3 py-2 font-medium">ρ (Ω·m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {camadasInterpretadas.map((camada) => (
                          <tr key={`tbl-${camada.nome}`} className="border-b border-[var(--border)]/60 last:border-b-0">
                            <td className="px-3 py-2">{camada.nome}</td>
                            <td className="px-3 py-2 font-mono">{fmt(camada.topoM, 2)}</td>
                            <td className="px-3 py-2 font-mono">{fmt(camada.baseM, 2)}</td>
                            <td className="px-3 py-2 font-mono">{fmt(camada.espessuraM, 2)}</td>
                            <td className="px-3 py-2 font-mono">{fmt(camada.rhoOhmM, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {!nOkInv && (
            <p className="text-sm text-[var(--muted)]">
              {metodo === "wenner"
                ? "São necessárias pelo menos 3 leituras Wenner válidas."
                : metodo === "schlumberger"
                  ? "Schlumberger: pelo menos 3 leituras válidas (AB/2 > MN/2, I ≠ 0 e Ra > 0)."
                  : "Dipolo-dipolo: defina a > 0 e pelo menos 3 leituras com n ≥ 1."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
