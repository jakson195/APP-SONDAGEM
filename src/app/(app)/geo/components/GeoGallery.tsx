"use client";

import type { GeoPhoto, StreetFrame } from "../types";

type GeoGalleryProps = {
  photos: GeoPhoto[];
  frames: StreetFrame[];
  selectedPhotoId: number | null;
  selectedFrameId: string | null;
  onSelectPhoto: (photoId: number) => void;
  onSelectFrame: (frameId: string) => void;
};

function formatCoord(value: number | null): string {
  return value == null ? "n/d" : value.toFixed(6);
}

function formatDate(value: string | null): string {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Sem data";
}

export function GeoGallery({
  photos,
  frames,
  selectedPhotoId,
  selectedFrameId,
  onSelectPhoto,
  onSelectFrame,
}: GeoGalleryProps) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">Galeria GEO</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Fotos geotag e frames gerados do vídeo, prontos para mapa e viewer.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-medium">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300">
            {photos.length} fotos
          </span>
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-indigo-700 dark:text-indigo-300">
            {frames.length} frames
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Fotos georreferenciadas
          </h3>
          {photos.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
              Ainda não há fotos GEO neste contexto.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {photos.map((photo) => {
                const selected = selectedPhotoId === photo.id;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onSelectPhoto(photo.id)}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-500/5"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-emerald-400/60"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.imageUrl}
                      alt={photo.originalName ?? `Foto GEO ${photo.id}`}
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {photo.originalName ?? `Foto #${photo.id}`}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                        {photo.latitude.toFixed(6)}, {photo.longitude.toFixed(6)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {formatDate(photo.capturedAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Frames de rua
          </h3>
          {frames.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
              Ainda não há frames de vídeo para o viewer.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {frames.map((frame) => {
                const selected = selectedFrameId === frame.id;
                return (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => onSelectFrame(frame.id)}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-500/5"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-indigo-400/60"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frame.imageUrl}
                      alt={`Frame ${frame.frameIndex + 1}`}
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        Vídeo {frame.videoId.slice(0, 8)} · frame {frame.frameIndex + 1}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                        {formatCoord(frame.latitude)}, {formatCoord(frame.longitude)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Heading {frame.heading != null ? `${frame.heading.toFixed(1)}°` : "n/d"} ·{" "}
                        {formatDate(frame.timestamp)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
