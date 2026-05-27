"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { StreetFrame } from "../types";

type MapillaryViewerProps = {
  frames: StreetFrame[];
  selectedFrameId: string | null;
};

type ViewerMode = "loading" | "mapillary" | "fallback";

function formatDate(value: string | null): string {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Sem data";
}

export function MapillaryViewer({ frames, selectedFrameId }: MapillaryViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<{ moveTo?: (imageId: string) => Promise<unknown>; remove?: () => void } | null>(
    null,
  );
  const [mode, setMode] = useState<ViewerMode>("loading");
  const [warning, setWarning] = useState<string | null>(null);

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? frames[0] ?? null,
    [frames, selectedFrameId],
  );

  useEffect(() => {
    let cancelled = false;
    viewerRef.current?.remove?.();
    viewerRef.current = null;

    if (!containerRef.current || frames.length === 0) {
      setMode("fallback");
      setWarning("Envie um vídeo para gerar frames e ativar o viewer.");
      return () => {
        cancelled = true;
      };
    }

    setMode("loading");
    setWarning(null);

    void (async () => {
      try {
        await import("mapillary-js/dist/mapillary.css");
        const mapillary = (await import("mapillary-js")) as {
          Viewer?: new (options: Record<string, unknown>) => {
            moveTo?: (imageId: string) => Promise<unknown>;
            remove?: () => void;
          };
          DataProviderBase?: new (...args: unknown[]) => {
            fire?: (type: string, event: Record<string, unknown>) => void;
          };
          S2GeometryProvider?: new () => unknown;
        };

        if (!mapillary.Viewer || !mapillary.DataProviderBase || !mapillary.S2GeometryProvider) {
          throw new Error("Runtime MapillaryJS incompleto no ambiente atual.");
        }

        const groupedSequenceIds = new Map<string, string[]>();
        for (const frame of frames) {
          const sequence = groupedSequenceIds.get(frame.videoId) ?? [];
          sequence.push(frame.id);
          groupedSequenceIds.set(frame.videoId, sequence);
        }

        const imageEntities = new Map(
          frames.map((frame) => {
            const latitude = frame.latitude ?? 0;
            const longitude = frame.longitude ?? 0;
            const heading = frame.heading ?? 0;
            const entity = {
              id: frame.id,
              sequence_id: frame.videoId,
              merge_id: frame.videoId,
              captured_at: frame.timestamp ? new Date(frame.timestamp).getTime() : Date.now(),
              camera_type: "perspective",
              camera_parameters: [0.82, 0, 0],
              exif_orientation: 1,
              width: 1920,
              height: 1080,
              computed_compass_angle: heading,
              original_compass_angle: heading,
              computed_altitude: 0,
              original_altitude: 0,
              computed_geometry: { lat: latitude, lng: longitude },
              original_geometry: { lat: latitude, lng: longitude },
              computed_rotation: [Math.PI / 2, 0, 0],
              thumb: { id: `thumb-${frame.id}`, url: frame.imageUrl },
              mesh: { id: `mesh-${frame.id}`, url: `mesh://${frame.id}` },
              cluster: { id: `cluster-${frame.id}`, url: `cluster://${frame.id}` },
            };
            return [frame.id, entity];
          }),
        );

        const DataProviderBase = mapillary.DataProviderBase;
        const S2GeometryProvider = mapillary.S2GeometryProvider;

        class LocalDataProvider extends DataProviderBase {
          private readonly images: Map<string, Record<string, unknown>>;

          private readonly sequenceMap: Map<string, string[]>;

          constructor(
            images: Map<string, Record<string, unknown>>,
            sequenceMap: Map<string, string[]>,
          ) {
            super(new S2GeometryProvider());
            this.images = images;
            this.sequenceMap = sequenceMap;
          }

          getCoreImages(cellId: string) {
            return Promise.resolve({
              cell_id: cellId,
              images: Array.from(this.images.values()),
            });
          }

          getImages(imageIds: string[]) {
            return Promise.resolve(
              imageIds.map((id) => ({
                node_id: id,
                node: this.images.get(id) ?? null,
              })),
            );
          }

          getSpatialImages(imageIds: string[]) {
            return this.getImages(imageIds);
          }

          getSequence(sequenceId: string) {
            const imageIds = this.sequenceMap.get(sequenceId);
            if (!imageIds) {
              return Promise.reject(new Error(`Sequência ${sequenceId} não encontrada.`));
            }
            return Promise.resolve({
              id: sequenceId,
              image_ids: imageIds,
            });
          }

          getImageBuffer(url: string) {
            return fetch(url).then(async (response) => {
              if (!response.ok) {
                throw new Error(`Falha ao obter imagem ${url}.`);
              }
              return response.arrayBuffer();
            });
          }

          getMesh() {
            return Promise.resolve({ faces: [], vertices: [] });
          }

          getCluster() {
            return Promise.resolve({
              points: {},
              reference: { lat: 0, lng: 0, alt: 0 },
            });
          }

          getImageTiles() {
            return Promise.reject(new Error("Image tiles desativados para provider local."));
          }
        }

        const provider = new LocalDataProvider(imageEntities, groupedSequenceIds);
        const viewer = new mapillary.Viewer({
          container: containerRef.current,
          dataProvider: provider,
          imageTiling: false,
          component: {
            cover: false,
          },
        });

        if (cancelled) {
          viewer.remove?.();
          return;
        }

        viewerRef.current = viewer;
        setMode("mapillary");

        if (selectedFrame) {
          await viewer.moveTo?.(selectedFrame.id);
        }
      } catch (error) {
        if (cancelled) return;
        setMode("fallback");
        setWarning(
          error instanceof Error
            ? `MapillaryJS ficou em modo de compatibilidade: ${error.message}`
            : "MapillaryJS ficou em modo de compatibilidade.",
        );
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.remove?.();
      viewerRef.current = null;
    };
  }, [frames]);

  useEffect(() => {
    if (mode !== "mapillary" || !selectedFrame || !viewerRef.current?.moveTo) return;
    void viewerRef.current.moveTo(selectedFrame.id).catch((error) => {
      setMode("fallback");
      setWarning(
        error instanceof Error
          ? `Viewer local sem navegação Mapillary ativa: ${error.message}`
          : "Viewer local sem navegação Mapillary ativa.",
      );
    });
  }, [mode, selectedFrame]);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">MapillaryViewer</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Viewer de rua com ponte para `moveTo(imageId)` quando o provider customizado fica
            naveg&aacute;vel.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            mode === "mapillary"
              ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {mode === "mapillary" ? "Mapillary ativo" : "Fallback compatível"}
        </span>
      </div>

      <div
        ref={containerRef}
        className="mt-4 h-[24rem] overflow-hidden rounded-2xl bg-slate-950"
      >
        {mode !== "mapillary" && selectedFrame && (
          <div className="flex h-full flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedFrame.imageUrl}
              alt={`Frame ${selectedFrame.frameIndex + 1}`}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        {mode !== "mapillary" && !selectedFrame && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-300">
            O viewer mostrar&aacute; aqui o frame selecionado no mapa ou na galeria.
          </div>
        )}
      </div>

      {warning && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {warning}
        </p>
      )}

      {selectedFrame && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Frame ativo
            </p>
            <p className="mt-1 text-[var(--text)]">
              {selectedFrame.videoId.slice(0, 8)} · frame {selectedFrame.frameIndex + 1}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Timestamp
            </p>
            <p className="mt-1 text-[var(--text)]">{formatDate(selectedFrame.timestamp)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Coordenadas
            </p>
            <p className="mt-1 font-mono text-[var(--text)]">
              {selectedFrame.latitude != null ? selectedFrame.latitude.toFixed(6) : "n/d"},{" "}
              {selectedFrame.longitude != null ? selectedFrame.longitude.toFixed(6) : "n/d"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Heading
            </p>
            <p className="mt-1 text-[var(--text)]">
              {selectedFrame.heading != null ? `${selectedFrame.heading.toFixed(1)}°` : "n/d"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
