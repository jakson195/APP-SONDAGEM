"use client";

import { useState } from "react";
import {
  utmDeWgs84,
  wgs84DeUtm,
  wgsDeInputsLatLng,
} from "@/lib/coordenadas-utm-campo";

type Props = {
  coordN: string;
  coordE: string;
  fuso: string;
  latStr: string;
  lngStr: string;
  onCoordN: (v: string) => void;
  onCoordE: (v: string) => void;
  onFuso: (v: string) => void;
  onLatStr: (v: string) => void;
  onLngStr: (v: string) => void;
  /** Recentra o mapa após atualizar WGS a partir de N/E. */
  onMapRecenter?: () => void;
  /** Grava lat/lng no servidor (modo furo guardado). */
  onPersistirWgs?: (lat: number, lng: number) => Promise<void>;
  compact?: boolean;
};

export function CoordenadasUtmFuroPanel({
  coordN,
  coordE,
  fuso,
  latStr,
  lngStr,
  onCoordN,
  onCoordE,
  onFuso,
  onLatStr,
  onLngStr,
  onMapRecenter,
  onPersistirWgs,
  compact = false,
}: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function aplicarCoordenadasNoMapa() {
    setMsg(null);
    const wgs = wgs84DeUtm(coordN, coordE, fuso);
    if (!wgs) {
      setMsg(
        "Verifique Norte, Este e fuso (ex.: 22S). Valores devem ser numéricos.",
      );
      return;
    }
    setBusy(true);
    try {
      onLatStr(wgs.lat.toFixed(6));
      onLngStr(wgs.lng.toFixed(6));
      onMapRecenter?.();
      if (onPersistirWgs) {
        await onPersistirWgs(wgs.lat, wgs.lng);
      }
      setMsg("Mapa atualizado com as coordenadas UTM indicadas.");
    } catch {
      setMsg("Erro ao gravar posição no servidor.");
    } finally {
      setBusy(false);
    }
  }

  function recalcularUtmDeWgs() {
    setMsg(null);
    const wgs = wgsDeInputsLatLng(latStr, lngStr);
    if (!wgs) {
      setMsg("Defina latitude e longitude (WGS84) ou toque no mapa.");
      return;
    }
    const utm = utmDeWgs84(wgs.lat, wgs.lng, fuso);
    if (!utm) {
      setMsg("Não foi possível calcular UTM para este ponto.");
      return;
    }
    onCoordN(utm.norte);
    onCoordE(utm.este);
    onFuso(utm.fuso);
    setMsg("N/E calculados a partir do ponto no mapa (SIRGAS2000 / UTM WGS84).");
  }

  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--card)] print:hidden ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
        Coordenadas UTM (N / E)
      </h3>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Ao tocar no mapa ou usar GPS, <strong className="text-[var(--text)]">Norte</strong> e{" "}
        <strong className="text-[var(--text)]">Este</strong> são calculados automaticamente.
        Pode editar N/E e clicar em «Atualizar mapa» para mover o pino.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-[var(--muted)]">
          Coord. Norte (N)
          <input
            type="text"
            inputMode="decimal"
            value={coordN}
            onChange={(e) => onCoordN(e.target.value)}
            placeholder="ex.: 7.123.456,78"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)]"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--muted)]">
          Coord. Este (E)
          <input
            type="text"
            inputMode="decimal"
            value={coordE}
            onChange={(e) => onCoordE(e.target.value)}
            placeholder="ex.: 512.345,67"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)]"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--muted)]">
          Fuso UTM
          <input
            type="text"
            value={fuso}
            onChange={(e) => onFuso(e.target.value)}
            placeholder="ex.: 22S"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)]"
          />
        </label>
        <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void aplicarCoordenadasNoMapa()}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Atualizar mapa
          </button>
          <button
            type="button"
            onClick={recalcularUtmDeWgs}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--card)]"
          >
            Recalcular N/E do mapa
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[var(--muted)]">
          Latitude WGS84 (°)
          <input
            type="text"
            inputMode="decimal"
            value={latStr}
            onChange={(e) => onLatStr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--muted)]">
          Longitude WGS84 (°)
          <input
            type="text"
            inputMode="decimal"
            value={lngStr}
            onChange={(e) => onLngStr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
          />
        </label>
      </div>
      {msg && (
        <p
          className={`mt-2 text-xs ${
            msg.includes("Erro") || msg.includes("Verifique")
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
          role="status"
        >
          {msg}
        </p>
      )}
    </div>
  );
}
