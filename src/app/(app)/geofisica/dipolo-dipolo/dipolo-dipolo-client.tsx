"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invertDipolo2DSmoothRes2dinvLike } from "@/lib/geofisica/dipolo2d/smooth-invert-2d";
import { loadSolodataLinha12Demo } from "@/lib/geofisica/dipolo2d/solodata-linha-demo";
import { solodataLinhaToReadings } from "@/lib/geofisica/dipolo2d/solodata-linha-readings";
import {
  defaultSolodataLinhaState,
  type SolodataLinhaState,
} from "@/lib/geofisica/dipolo2d/solodata-linha-types";
import type { Dipolo2DInvertParams } from "@/lib/geofisica/dipolo2d/types";
import type { Dipolo2DReading } from "@/lib/geofisica/dipolo2d/types";
import { downloadTextFile } from "@/lib/field-export-kml-gpx";
import { SolodataLinhaSheet } from "./solodata-linha-sheet";

const STORAGE = "datageo-digital-geofisica-dipolo2d-v1";

type TabId = "dados" | "pseudo" | "modelo" | "ajustes";

function log10ToColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.25) {
    const u = x / 0.25;
    return [20 + 40 * u, 30 + 100 * u, 120 + 135 * u];
  }
  if (x < 0.5) {
    const u = (x - 0.25) / 0.25;
    return [60 + 80 * u, 130 + 100 * u, 255 - 55 * u];
  }
  if (x < 0.75) {
    const u = (x - 0.5) / 0.25;
    return [140 + 80 * u, 230 - 30 * u, 200 - 100 * u];
  }
  const u = (x - 0.75) / 0.25;
  return [220 + 35 * u, 200 - 50 * u, 100 - 40 * u];
}

function drawModelSection(
  canvas: HTMLCanvasElement,
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = Math.min(420, Math.max(280, Math.floor(w * 0.45)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "var(--surface)";
  ctx.fillRect(0, 0, w, h);

  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < mLog.length; k++) {
    const v = mLog[k]!;
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (!(hi > lo)) {
    lo = 0;
    hi = 1;
  }
  const pad = 48;
  const plotW = w - pad - 12;
  const plotH = h - 36;
  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z0 = 0;
  const z1 = zEdges[nz]!;

  const sx = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * plotW;
  const sy = (z: number) => 16 + ((z - z0) / (z1 - z0 || 1)) * plotH;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const v = mLog[i * nz + j]!;
      const t = (v - lo) / (hi - lo || 1);
      const [r, g, b] = log10ToColor(t);
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      const xa = sx(xEdges[i]!);
      const xb = sx(xEdges[i + 1]!);
      const ya = sy(zEdges[j]!);
      const yb = sy(zEdges[j + 1]!);
      ctx.fillRect(xa, ya, Math.max(1, xb - xa), Math.max(1, yb - ya));
    }
  }

  ctx.strokeStyle = "var(--border)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, 16, plotW, plotH);
  ctx.fillStyle = "var(--muted)";
  ctx.font = "11px system-ui,sans-serif";
  ctx.fillText("Estação (m) →", pad + plotW * 0.35, h - 8);
  ctx.save();
  ctx.translate(12, 16 + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Profundidade (m) ↓", -plotH * 0.35, 0);
  ctx.restore();
}

function drawPseudoScatter(
  canvas: HTMLCanvasElement,
  readings: Dipolo2DReading[],
  factorDepth: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = Math.min(420, Math.max(280, Math.floor(w * 0.45)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "var(--surface)";
  ctx.fillRect(0, 0, w, h);

  const xs = readings.map((r) => r.stationM);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const zMax = Math.max(
    ...readings.map((r) => factorDepth * r.n * r.aM),
    1e-6,
  );
  const logs = readings.map((r) => Math.log10(Math.max(1e-12, r.rhoApparentOhmM)));
  let lo = Math.min(...logs);
  let hi = Math.max(...logs);
  if (!(hi > lo)) {
    lo -= 0.1;
    hi += 0.1;
  }

  const pad = 48;
  const plotW = w - pad - 12;
  const plotH = h - 36;
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (z: number) => 16 + (z / (zMax || 1)) * plotH;

  for (const r of readings) {
    const z = factorDepth * r.n * r.aM;
    const t = (Math.log10(Math.max(1e-12, r.rhoApparentOhmM)) - lo) / (hi - lo || 1);
    const [cr, cg, cb] = log10ToColor(t);
    ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
    const cx = sx(r.stationM);
    const cy = sy(z);
    const rad = Math.max(4, Math.min(14, plotW / (readings.length * 0.35)));
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.25)";
    ctx.stroke();
  }

  ctx.strokeStyle = "var(--border)";
  ctx.strokeRect(pad, 16, plotW, plotH);
  ctx.fillStyle = "var(--muted)";
  ctx.font = "11px system-ui,sans-serif";
  ctx.fillText("ρa (pontos) — profundidade pseudo n·a·fator", pad, h - 8);
}

const defaultParams: Dipolo2DInvertParams = {
  factorDepth: 0.37,
  sigmaXM: 8,
  sigmaZM: 4,
  lambda: 2.5,
  huberC: 0.04,
  maxIter: 8,
  nx: 22,
  nz: 14,
};

export function DipoloDipoloClient() {
  const [tab, setTab] = useState<TabId>("dados");
  const [linha, setLinha] = useState<SolodataLinhaState>(() =>
    defaultSolodataLinhaState(91),
  );
  const [defaultA, setDefaultA] = useState("15");
  const [params, setParams] = useState<Dipolo2DInvertParams>(defaultParams);
  const modelRef = useRef<HTMLCanvasElement>(null);
  const pseudoRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const j = JSON.parse(raw) as {
          linha?: SolodataLinhaState;
          defaultA?: string;
          params?: Partial<Dipolo2DInvertParams>;
        };
        if (j.linha?.rows?.length) setLinha(j.linha);
        if (j.defaultA) setDefaultA(j.defaultA);
        if (j.params) setParams((p) => ({ ...p, ...j.params }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify({ linha, defaultA, params }),
        );
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [linha, defaultA, params]);

  const aNum = useMemo(() => {
    const n = Number(defaultA.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 15;
  }, [defaultA]);

  const readings = useMemo(
    () => solodataLinhaToReadings(linha, aNum),
    [linha, aNum],
  );

  const loadDemo = useCallback(() => {
    setLinha(loadSolodataLinha12Demo());
    setDefaultA("15");
  }, []);

  const clearAll = useCallback(() => {
    setLinha(defaultSolodataLinhaState(91));
  }, []);

  const invertResult = useMemo(() => {
    if (readings.length < 4) return null;
    return invertDipolo2DSmoothRes2dinvLike(readings, params);
  }, [readings, params]);

  useEffect(() => {
    const c = modelRef.current;
    if (!c || !invertResult) return;
    drawModelSection(
      c,
      invertResult.mLog10,
      invertResult.nx,
      invertResult.nz,
      invertResult.xEdgesM,
      invertResult.zEdgesM,
    );
  }, [invertResult]);

  useEffect(() => {
    const c = pseudoRef.current;
    if (!c || readings.length === 0) return;
    drawPseudoScatter(c, readings, params.factorDepth);
  }, [readings, params.factorDepth]);

  const onResize = useCallback(() => {
    const c1 = modelRef.current;
    if (c1 && invertResult) {
      drawModelSection(
        c1,
        invertResult.mLog10,
        invertResult.nx,
        invertResult.nz,
        invertResult.xEdgesM,
        invertResult.zEdgesM,
      );
    }
    const c2 = pseudoRef.current;
    if (c2 && readings.length > 0) {
      drawPseudoScatter(c2, readings, params.factorDepth);
    }
  }, [invertResult, readings, params.factorDepth]);

  useEffect(() => {
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onResize]);

  useEffect(() => {
    const id = requestAnimationFrame(() => onResize());
    return () => cancelAnimationFrame(id);
  }, [tab, onResize]);

  const exportTsv = () => {
    const lines = ["station_m\ta_m\tn\trhoa_ohm_m"];
    for (const r of readings) {
      lines.push(`${r.stationM}\t${r.aM}\t${r.n}\t${r.rhoApparentOhmM}`);
    }
    downloadTextFile(
      `dipolo-dipolo-2d-${Date.now()}.tsv`,
      lines.join("\n"),
      "text/tab-separated-values;charset=utf-8",
    );
  };

  const tabBtn = (id: TabId, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={
        tab === id
          ? "border-b-2 border-teal-600 px-3 py-2 text-sm font-medium text-teal-800 dark:text-teal-300"
          : "border-b-2 border-transparent px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[min(100%,96rem)] space-y-4 p-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/geofisica"
            className="text-sm text-teal-700 hover:underline dark:text-teal-400"
          >
            ← Geofísica
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">
            Dipolo-Dipolo 2D — inversão RES2DINV-like
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Planilha no formato <strong>PLANILHA SOLODATA</strong> (folha LINHA 12):
            células vermelhas = dados que introduz; restantes colunas preenchem ao
            colar do Excel.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap border-b border-[var(--border)]">
        {tabBtn("dados", "Dados")}
        {tabBtn("pseudo", "Pseudoseção ρa")}
        {tabBtn("modelo", "Modelo invertido")}
        {tabBtn("ajustes", "Parâmetros")}
      </div>

      {tab === "dados" && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)]">
                <em>a</em> (m) por defeito — coluna Esp vazia
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-32 rounded border border-[var(--border)] bg-white px-2 py-2 text-sm dark:bg-gray-900"
                value={defaultA}
                onChange={(e) => setDefaultA(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDemo}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              Carregar PLANILHA SOLODATA (91 leituras)
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Limpar
            </button>
            {readings.length > 0 && (
              <button
                type="button"
                onClick={exportTsv}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
              >
                Exportar TSV
              </button>
            )}
          </div>
          <SolodataLinhaSheet
            state={linha}
            onChange={setLinha}
            defaultAM={aNum}
          />
          <p className="text-sm text-[var(--muted)]">
            Leituras para inversão (Dist + Esp + N + R ap):{" "}
            <strong>{readings.length}</strong>
            {readings.length > 0 && (
              <span className="ml-2">
                (Dist {Math.min(...readings.map((r) => r.stationM))}–
                {Math.max(...readings.map((r) => r.stationM))} m, n até{" "}
                {Math.max(...readings.map((r) => r.n))})
              </span>
            )}
          </p>
        </div>
      )}

      {tab === "pseudo" && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-sm text-[var(--muted)]">
            Profundidade pseudo = fator × n × a (fator em Parâmetros).
          </p>
          <canvas ref={pseudoRef} className="w-full rounded-lg border border-[var(--border)]" />
        </div>
      )}

      {tab === "modelo" && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {!invertResult && (
            <p className="text-sm text-[var(--muted)]">
              Precisa de pelo menos 4 leituras e parâmetros válidos (separador
              Dados).
            </p>
          )}
          {invertResult && (
            <>
              <canvas
                ref={modelRef}
                className="w-full rounded-lg border border-[var(--border)]"
              />
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[var(--muted)]">RMS log₁₀ ρ</dt>
                  <dd className="font-mono">{invertResult.rmsLog10.toFixed(4)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Rugosidade L2</dt>
                  <dd className="font-mono">
                    {invertResult.roughnessL2.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Iterações</dt>
                  <dd className="font-mono">{invertResult.iterations}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Malha</dt>
                  <dd className="font-mono">
                    {invertResult.nx}×{invertResult.nz}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      )}

      {tab === "ajustes" && (
        <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
          {(
            [
              ["factorDepth", "Fator prof. pseudo z = f·n·a", 0.05, 0.8, 0.01],
              ["sigmaXM", "σx sensibilidade (m)", 1, 80, 1],
              ["sigmaZM", "σz sensibilidade (m)", 1, 60, 1],
              ["lambda", "λ regularização", 0.1, 50, 0.1],
              ["huberC", "Huber c (log₁₀ ρ)", 0.001, 0.2, 0.001],
              ["maxIter", "Iterações IRLS", 1, 25, 1],
              ["nx", "Células X", 8, 48, 1],
              ["nz", "Células Z", 6, 32, 1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label key={key} className="block text-sm">
              <span className="text-[var(--muted)]">{label}</span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                min={min}
                max={max}
                step={step}
                value={params[key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setParams((p) => ({ ...p, [key]: v }));
                }}
              />
            </label>
          ))}
          <p className="sm:col-span-2 text-xs text-[var(--muted)]">
            Aumente λ para um modelo mais suave; diminua σx/σz para sensibilidade
            mais localizada. Huber reduz o peso de outliers em log₁₀(ρa).
          </p>
        </div>
      )}
    </div>
  );
}
