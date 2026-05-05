"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  LeituraCampoVES,
  ModeloDuasCamadas,
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

const STORAGE_KEY = "soilsul-geofisica-ves-leituras-v1";
const STORAGE_SCHLUM_ROWS = "soilsul-geofisica-ves-schlum-leituras-v1";
const STORAGE_SCHLUM_MN = "soilsul-geofisica-ves-schlum-mnhalf-v1";
const STORAGE_DIPOLO_ROWS = "soilsul-geofisica-ves-dipolo-rows-v1";
const STORAGE_DIPOLO_A = "soilsul-geofisica-ves-dipolo-a-v1";
const STORAGE_METODO = "soilsul-geofisica-ves-metodo-v1";
const STORAGE_MODEL = "soilsul-geofisica-ves-modelo-v1";

type MetodoVES = "wenner" | "schlumberger" | "dipolo";

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

function toRowsW(leituras: LeituraCampoVES[]): RowW[] {
  return leituras.map((L) => ({ ...L, id: uid() }));
}

function fromRowsW(rows: RowW[]): LeituraCampoVES[] {
  return rows.map(({ abHalfM, rhoApparentOhmM }) => ({
    abHalfM,
    rhoApparentOhmM,
  }));
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
  const [tab, setTab] = useState<"dados" | "perfil" | "inversao">("dados");
  const [metodo, setMetodo] = useState<MetodoVES>("wenner");
  const [rowsW, setRowsW] = useState<RowW[]>([]);
  const [rowsSchlum, setRowsSchlum] = useState<RowW[]>([]);
  const [rowsD, setRowsD] = useState<RowD[]>([]);
  const [schlumbergerMnHalf, setSchlumbergerMnHalf] = useState("0.5");
  const [dipoloAM, setDipoloAM] = useState("25");
  const [rho1Input, setRho1Input] = useState("100");
  const [modH1, setModH1] = useState("5");
  const [modRho2, setModRho2] = useState("25");
  const [inversao, setInversao] = useState<{
    model: ModeloDuasCamadas;
    rmseLog: number;
    syntheticRho: number[];
  } | null>(null);

  const dipoloAVal = Number(dipoloAM.replace(",", "."));
  const schlumbergerBVal = Number(schlumbergerMnHalf.replace(",", "."));

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
        const p = JSON.parse(rawSchlum) as LeituraCampoVES[];
        if (Array.isArray(p) && p.length)
          setRowsSchlum(toRowsW(p.filter((x) => x && x.abHalfM > 0)));
      }
      const mnSt = localStorage.getItem(STORAGE_SCHLUM_MN);
      if (mnSt) setSchlumbergerMnHalf(mnSt);
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

  const persistSchlum = useCallback((r: RowW[], mn: string) => {
    try {
      localStorage.setItem(STORAGE_SCHLUM_ROWS, JSON.stringify(fromRowsW(r)));
      localStorage.setItem(STORAGE_SCHLUM_MN, mn);
    } catch {
      /* ignore */
    }
  }, []);

  const persistInversao = useCallback(
    (inv: typeof inversao) => {
      try {
        if (inv) localStorage.setItem(STORAGE_MODEL, JSON.stringify(inv));
        else localStorage.removeItem(STORAGE_MODEL);
      } catch {
        /* ignore */
      }
    },
    [],
  );

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

  const sortedLeiturasSchlum = useMemo(() => {
    const b = schlumbergerBVal;
    if (!(b > 0)) return [];
    const L = fromRowsW(rowsSchlum).filter(
      (x) =>
        x.abHalfM > b &&
        x.rhoApparentOhmM > 0 &&
        Number.isFinite(x.abHalfM) &&
        Number.isFinite(x.rhoApparentOhmM),
    );
    return [...L].sort((a, b2) => a.abHalfM - b2.abHalfM);
  }, [rowsSchlum, schlumbergerBVal]);

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
      })),
    [sortedLeiturasSchlum],
  );

  const chartDataInversao = useMemo(() => {
    if (!inversao) return [];
    if (metodo === "wenner") {
      if (sortedLeiturasW.length === 0) return [];
      return sortedLeiturasW.map((L, i) => ({
        x: L.abHalfM,
        medido: L.rhoApparentOhmM,
        modelo: inversao.syntheticRho[i] ?? Number.NaN,
      }));
    }
    if (metodo === "schlumberger") {
      if (sortedLeiturasSchlum.length === 0) return [];
      return sortedLeiturasSchlum.map((L, i) => ({
        x: L.abHalfM,
        medido: L.rhoApparentOhmM,
        modelo: inversao.syntheticRho[i] ?? Number.NaN,
      }));
    }
    if (sortedLeiturasD.length === 0) return [];
    return sortedLeiturasD.map((L, i) => ({
      x: L.n,
      medido: L.rhoApparentOhmM,
      modelo: inversao.syntheticRho[i] ?? Number.NaN,
    }));
  }, [
    inversao,
    metodo,
    sortedLeiturasW,
    sortedLeiturasSchlum,
    sortedLeiturasD,
  ]);

  const chartDataProfundidade = useMemo(() => {
    if (!inversao) return [];
    const { h1M, rho1OhmM, rho2OhmM } = inversao.model;
    const zmax = Math.max(25, h1M * 5);
    return [
      { depth: 0, rho: rho1OhmM },
      { depth: h1M, rho: rho1OhmM },
      { depth: h1M, rho: rho2OhmM },
      { depth: zmax, rho: rho2OhmM },
    ];
  }, [inversao]);

  const setMetodoComPersist = (m: MetodoVES) => {
    setMetodo(m);
    persistMetodo(m);
    setInversao(null);
    persistInversao(null);
  };

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
    persistSchlum([], schlumbergerMnHalf);
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
      const n = [...r, { id: uid(), abHalfM: 1, rhoApparentOhmM: 50 }];
      persistSchlum(n, schlumbergerMnHalf);
      return n;
    });
  };

  const loadDemoSchlum = () => {
    const n = toRowsW(DEMO_WENNER);
    setRowsSchlum(n);
    persistSchlum(n, schlumbergerMnHalf);
    setInversao(null);
    persistInversao(null);
  };

  const updateRowSchlum = (id: string, patch: Partial<LeituraCampoVES>) => {
    setRowsSchlum((prev) => {
      const n = prev.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      );
      persistSchlum(n, schlumbergerMnHalf);
      return n;
    });
  };

  const removeRowSchlum = (id: string) => {
    setRowsSchlum((prev) => {
      const n = prev.filter((x) => x.id !== id);
      persistSchlum(n, schlumbergerMnHalf);
      return n;
    });
  };

  const onSchlumMnChange = (v: string) => {
    setSchlumbergerMnHalf(v);
    try {
      localStorage.setItem(STORAGE_SCHLUM_MN, v);
    } catch {
      /* ignore */
    }
  };

  const onDipoloAChange = (v: string) => {
    setDipoloAM(v);
    try {
      localStorage.setItem(STORAGE_DIPOLO_A, v);
    } catch {
      /* ignore */
    }
  };

  const runInversion = () => {
    const rho1 = Number(rho1Input.replace(",", "."));
    if (metodo === "wenner") {
      const inv = invertWennerTwoLayerGrid(sortedLeiturasW, rho1);
      setInversao(inv);
      persistInversao(inv);
    } else if (metodo === "schlumberger") {
      if (!(schlumbergerBVal > 0)) return;
      const inv = invertSchlumbergerTwoLayerGrid(
        sortedLeiturasSchlum,
        schlumbergerBVal,
        rho1,
      );
      setInversao(inv);
      persistInversao(inv);
    } else {
      if (!(dipoloAVal > 0)) return;
      const inv = invertDipoloDipoloTwoLayerGrid(
        sortedLeiturasD,
        dipoloAVal,
        rho1,
      );
      setInversao(inv);
      persistInversao(inv);
    }
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
          ? schlumbergerBVal > 0
            ? forwardSchlumbergerFromModel(
                sortedLeiturasSchlum,
                schlumbergerBVal,
                model,
              )
            : []
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
      leiturasRho.length > 0
        ? Math.sqrt(
            leiturasRho.reduce((acc, rm, i) => {
              const a = Math.log10(rm);
              const b = Math.log10(Math.max(1e-12, syn[i]!));
              return acc + (a - b) ** 2;
            }, 0) / leiturasRho.length,
          )
        : 0;
    const inv = { model, rmseLog: err, syntheticRho: syn };
    setInversao(inv);
    persistInversao(inv);
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
    sortedLeiturasSchlum.length >= 3 &&
    schlumbergerBVal > 0 &&
    Number.isFinite(schlumbergerBVal);
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
            SEV — Wenner, Schlumberger e dipolo-dipolo
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            <strong>Wenner:</strong> AB/2 e ρa. <strong>Schlumberger:</strong> AB/2 (s), MN/2
            (b) fixo na série e ρa (exige s &gt; b). <strong>Dipolo-dipolo:</strong>{" "}
            <em>a</em> (m), <em>n</em> ≥ 1 e ρa. Modelo: 2 camadas (imagens). Inversão: grelha
            + refinamento com ρ₁ fixa.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setMetodoComPersist("wenner")}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                metodo === "wenner"
                  ? "bg-gray-800 text-white dark:bg-gray-700"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              Wenner
            </button>
            <button
              type="button"
              onClick={() => setMetodoComPersist("schlumberger")}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                metodo === "schlumberger"
                  ? "bg-gray-800 text-white dark:bg-gray-700"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              Schlumberger
            </button>
            <button
              type="button"
              onClick={() => setMetodoComPersist("dipolo")}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                metodo === "dipolo"
                  ? "bg-gray-800 text-white dark:bg-gray-700"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              Dipolo-dipolo
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabBtn("dados", "Dados de campo")}
            {tabBtn("perfil", "Perfil aparente")}
            {tabBtn("inversao", "Inversão")}
          </div>
        </div>
      </div>

      {tab === "dados" && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
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
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    MN/2 (m) — meio-espalhamento potencial, constante na série
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    className="mt-1 w-32 rounded border border-[var(--border)] bg-white px-2 py-2 dark:bg-gray-900"
                    value={schlumbergerMnHalf}
                    onChange={(e) => onSchlumMnChange(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Em cada linha: AB/2 = s (m) e ρa. Requer s &gt; MN/2 em todas as leituras válidas.
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
                    <th className="py-2 pr-4 font-medium">AB/2 = s (m)</th>
                    <th className="py-2 pr-4 font-medium">ρa (Ω·m)</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rowsSchlum.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)]/60">
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          className="w-28 rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
                          value={row.abHalfM || ""}
                          onChange={(e) =>
                            updateRowSchlum(row.id, {
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
                            updateRowSchlum(row.id, {
                              rhoApparentOhmM: Number(e.target.value),
                            })
                          }
                        />
                      </td>
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
                  ))}
                </tbody>
              </table>
              {rowsSchlum.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  Sem linhas. Defina MN/2, adicione s e ρa ou carregue o exemplo.
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
          <h2 className="text-lg font-semibold text-[var(--text)]">
            Perfil de resistividade aparente
          </h2>
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
            <div className="h-[360px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={
                    metodo === "wenner"
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
                    name="Medido"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
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
          </div>

          <div className="rounded-lg border border-dashed border-[var(--border)] p-4">
            <p className="text-sm font-medium text-[var(--text)]">Modelo manual (opcional)</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
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
              <button
                type="button"
                onClick={aplicarModeloManual}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
              >
                Desenhar curva modelo
              </button>
            </div>
          </div>

          {inversao && nOkInv && (
            <>
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
              <p className="text-xs text-[var(--muted)]">
                RMSE (log₁₀ ρ):{" "}
                <span className="font-mono">{inversao.rmseLog.toFixed(4)}</span>
              </p>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                  Medido vs modelo (log–log em ρ; eixo X: {xAxisLabelInv})
                </h3>
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
            </>
          )}

          {!nOkInv && (
            <p className="text-sm text-[var(--muted)]">
              {metodo === "wenner"
                ? "São necessárias pelo menos 3 leituras Wenner válidas."
                : metodo === "schlumberger"
                  ? "Schlumberger: MN/2 > 0 e pelo menos 3 leituras com AB/2 > MN/2."
                  : "Dipolo-dipolo: defina a > 0 e pelo menos 3 leituras com n ≥ 1."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
