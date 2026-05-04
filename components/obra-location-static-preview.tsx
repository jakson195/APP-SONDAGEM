"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-url";

type Props = {
  lat: number;
  lng: number;
  obraId: number;
  obraNome: string;
};

/**
 * Pré-visualização e descarga do PNG gerado por /api/map-location (Google Static Maps).
 */
export function ObraLocationStaticPreview({ lat, lng, obraId, obraNome }: Props) {
  const [zoom, setZoom] = useState(16);

  const src = useMemo(
    () =>
      apiUrl(
        `/api/map-location?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&zoom=${zoom}`,
      ),
    [lat, lng, zoom],
  );

  const safeName = obraNome.replace(/[^\w.-]+/g, "_").slice(0, 40) || "obra";

  return (
    <section
      className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
      aria-label="Mapa de localização estático"
    >
      <h3 className="text-base font-semibold text-[var(--text)]">
        Mapa de localização
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Imagem gerada a partir do ponto definido acima (Google Static Maps). Útil para
        anexar a relatórios ou impressão.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <span className="text-[var(--muted)]">Zoom</span>
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value) || 16)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
          >
            {[12, 13, 14, 15, 16, 17, 18, 19].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <a
          href={src}
          download={`mapa-localizacao-${safeName}-${obraId}.png`}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-500/10 dark:text-teal-400"
        >
          Descarregar PNG
        </a>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          Abrir imagem
        </a>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt={`Mapa de localização — ${obraNome}`}
          className="h-auto w-full max-w-[640px] object-cover"
        />
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        É necessária a API <strong className="text-[var(--text)]">Maps Static API</strong>{" "}
        na chave Google (além do mapa interativo). Pode usar a mesma chave em{" "}
        <code className="rounded bg-black/5 px-1 text-[11px] dark:bg-white/10">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        ou definir{" "}
        <code className="rounded bg-black/5 px-1 text-[11px] dark:bg-white/10">
          GOOGLE_MAPS_API_KEY
        </code>{" "}
        só no servidor.
      </p>
    </section>
  );
}
