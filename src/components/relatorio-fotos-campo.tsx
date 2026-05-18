"use client";

import { useRef } from "react";
import { resizeImageFileToJpegDataUrl } from "@/lib/resize-image-data-url";

type Props = {
  fotos: string[];
  onChange: (urls: string[]) => void;
  /** Máximo de fotos no relatório (default 8). */
  maxFotos?: number;
  className?: string;
};

/**
 * Tirar foto (móvel) ou escolher da galeria; imagens ficam como data URL no estado.
 */
export function RelatorioFotosCampo({
  fotos,
  onChange,
  maxFotos = 8,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const room = maxFotos - fotos.length;
    if (room <= 0) return;
    const slice = Array.from(files).slice(0, room);
    const next = [...fotos];
    for (const f of slice) {
      try {
        next.push(await resizeImageFileToJpegDataUrl(f));
      } catch {
        /* ignora ficheiros inválidos */
      }
    }
    onChange(next);
    e.target.value = "";
  }

  function remover(i: number) {
    onChange(fotos.filter((_, j) => j !== i));
  }

  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 ${className}`}>
      <p className="mb-2 text-sm font-medium text-[var(--text)]">
        Fotos de campo no relatório
      </p>
      <p className="mb-3 text-xs text-[var(--muted)]">
        No telemóvel pode usar a câmara; no computador, escolha ficheiros da galeria.
        As fotos aparecem no PDF abaixo da grelha (máx. {maxFotos}).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={fotos.length >= maxFotos}
        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {fotos.length >= maxFotos
          ? "Limite de fotos atingido"
          : "Tirar foto / adicionar imagens"}
      </button>
      {fotos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {fotos.map((src, i) => (
            <li
              key={`${i}-${src.slice(0, 24)}`}
              className="relative h-24 w-24 overflow-hidden rounded-md border border-[var(--border)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remover(i)}
                className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-bl bg-red-600 text-sm font-bold text-white hover:bg-red-700"
                aria-label={`Remover foto ${i + 1}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
