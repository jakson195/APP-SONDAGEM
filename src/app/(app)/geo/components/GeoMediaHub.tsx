"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useObraModulos } from "@/components/obra-context";
import { apiUrl } from "@/lib/api-url";
import { GeoGallery } from "./GeoGallery";
import { GeoUpload } from "./GeoUpload";
import { MapillaryViewer } from "./MapillaryViewer";
import type {
  GeoCompany,
  GeoObraContext,
  GeoObraOption,
  GeoPhoto,
  StreetFrame,
} from "../types";

const GeoMap = dynamic(
  () => import("./GeoMap").then((module) => ({ default: module.GeoMap })),
  { ssr: false },
);

function dedupePhotos(next: GeoPhoto[]): GeoPhoto[] {
  return Array.from(new Map(next.map((photo) => [photo.id, photo])).values()).sort((a, b) => {
    const aTime = new Date(a.capturedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.capturedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}

function dedupeFrames(next: StreetFrame[]): StreetFrame[] {
  return Array.from(new Map(next.map((frame) => [frame.id, frame])).values()).sort((a, b) => {
    const aTime = new Date(a.timestamp ?? a.createdAt).getTime();
    const bTime = new Date(b.timestamp ?? b.createdAt).getTime();
    if (a.videoId === b.videoId) return a.frameIndex - b.frameIndex;
    return bTime - aTime;
  });
}

/** Upload de fotos/vídeo georreferenciados, mapa de mídia e viewer street-level. */
export function GeoMediaHub() {
  const searchParams = useSearchParams();
  const { selectedObraId, setObraContext } = useObraModulos();

  const queryObraId = Number(searchParams?.get("obraId") ?? "");
  const activeObraId =
    selectedObraId ??
    (Number.isFinite(queryObraId) && queryObraId > 0 ? queryObraId : null);

  const [companies, setCompanies] = useState<GeoCompany[]>([]);
  const [obras, setObras] = useState<GeoObraOption[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [obraContext, setObraContextState] = useState<GeoObraContext | null>(null);
  const [photos, setPhotos] = useState<GeoPhoto[]>([]);
  const [frames, setFrames] = useState<StreetFrame[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingObras, setLoadingObras] = useState(false);
  const [exportingByObra, setExportingByObra] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const response = await fetch(apiUrl("/api/empresas"), {
        credentials: "include",
      });
      const data = (await response.json().catch(() => [])) as GeoCompany[] & { error?: string };
      if (!response.ok) {
        setError((data as { error?: string }).error ?? "Falha ao carregar empresas.");
        setCompanies([]);
        return;
      }
      const next = Array.isArray(data) ? data : [];
      setCompanies(next);
      setCompanyId((previous) => {
        if (previous && next.some((company) => company.id === previous)) return previous;
        return next[0]?.id ?? null;
      });
    } catch {
      setError("Falha de rede ao carregar empresas.");
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const loadObraContext = useCallback(async () => {
    if (activeObraId == null) {
      setObraContextState(null);
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/obras/${activeObraId}`), {
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as GeoObraContext & {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Falha ao carregar o contexto da obra.");
        setObraContextState(null);
        return;
      }
      setObraContextState(data);
      setCompanyId(data.companyId);
    } catch {
      setError("Falha de rede ao carregar a obra do contexto GEO.");
      setObraContextState(null);
    }
  }, [activeObraId]);

  const loadObras = useCallback(async () => {
    if (companyId == null) {
      setObras([]);
      return;
    }
    setLoadingObras(true);
    try {
      const response = await fetch(apiUrl(`/api/obra?companyId=${companyId}`), {
        credentials: "include",
      });
      const data = (await response.json().catch(() => [])) as GeoObraOption[] & { error?: string };
      if (!response.ok) {
        setError((data as { error?: string }).error ?? "Falha ao carregar obras.");
        setObras([]);
        return;
      }
      const next = Array.isArray(data)
        ? data.map((item) => ({ id: item.id, nome: item.nome, companyId: item.companyId }))
        : [];
      setObras(next);
    } catch {
      setError("Falha de rede ao carregar obras.");
      setObras([]);
    } finally {
      setLoadingObras(false);
    }
  }, [companyId]);

  const loadMedia = useCallback(async () => {
    const hasScope = activeObraId != null || companyId != null;
    if (!hasScope) {
      setPhotos([]);
      setFrames([]);
      return;
    }

    setLoadingMedia(true);
    setError(null);

    const scopeQuery =
      activeObraId != null ? `obraId=${activeObraId}` : `companyId=${companyId}`;

    try {
      const [photoResponse, frameResponse] = await Promise.all([
        fetch(apiUrl(`/api/geo/photos?${scopeQuery}`), { credentials: "include" }),
        fetch(apiUrl(`/api/geo/street-frames?${scopeQuery}`), { credentials: "include" }),
      ]);

      const photoData = (await photoResponse.json().catch(() => [])) as GeoPhoto[] & {
        error?: string;
      };
      const frameData = (await frameResponse.json().catch(() => [])) as StreetFrame[] & {
        error?: string;
      };

      if (!photoResponse.ok) {
        throw new Error((photoData as { error?: string }).error ?? "Falha ao carregar fotos GEO.");
      }
      if (!frameResponse.ok) {
        throw new Error(
          (frameData as { error?: string }).error ?? "Falha ao carregar frames de rua.",
        );
      }

      setPhotos(dedupePhotos(Array.isArray(photoData) ? photoData : []));
      setFrames(dedupeFrames(Array.isArray(frameData) ? frameData : []));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar mídia GEO.");
      setPhotos([]);
      setFrames([]);
    } finally {
      setLoadingMedia(false);
    }
  }, [activeObraId, companyId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    void loadObraContext();
  }, [loadObraContext]);

  useEffect(() => {
    if (activeObraId == null && companyId == null && companies.length > 0) {
      setCompanyId(companies[0]!.id);
    }
  }, [activeObraId, companies, companyId]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    void loadObras();
  }, [loadObras]);

  useEffect(() => {
    if (selectedPhotoId != null && photos.some((photo) => photo.id === selectedPhotoId)) return;
    setSelectedPhotoId(photos[0]?.id ?? null);
  }, [photos, selectedPhotoId]);

  useEffect(() => {
    if (selectedFrameId != null && frames.some((frame) => frame.id === selectedFrameId)) return;
    setSelectedFrameId(frames[0]?.id ?? null);
  }, [frames, selectedFrameId]);

  const prependPhoto = useCallback((photo: GeoPhoto) => {
    setPhotos((current) => dedupePhotos([photo, ...current]));
    setSelectedPhotoId(photo.id);
  }, []);

  const prependFrames = useCallback((newFrames: StreetFrame[]) => {
    if (newFrames.length === 0) return;
    setFrames((current) => dedupeFrames([...newFrames, ...current]));
    setSelectedFrameId(newFrames[0]!.id);
  }, []);

  const handleExportByObra = useCallback(async () => {
    if (activeObraId == null) {
      setError("Selecione uma obra para exportar os arquivos GEO.");
      return;
    }

    setExportingByObra(true);
    try {
      const response = await fetch(apiUrl(`/api/geo/export?obraId=${activeObraId}`), {
        credentials: "include",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Falha ao exportar arquivos GEO por obra.");
      }

      const blob = await response.blob();
      const headerName = response.headers.get("content-disposition");
      const matched = headerName?.match(/filename="(.+)"/i);
      const filename = matched?.[1] ?? `geo-export-obra-${activeObraId}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao exportar arquivos GEO.");
    } finally {
      setExportingByObra(false);
    }
  }, [activeObraId]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-[var(--text)] sm:p-6">
      <section className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--card)] via-[var(--card)] to-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Mídia georreferenciada
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Upload de fotos com EXIF, extração de frames de vídeo, mapa Leaflet e viewer
              street-level integrado ao contexto da obra.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--muted)]">Empresa ativa</span>
              <select
                value={companyId ?? ""}
                onChange={(event) => {
                  const nextCompanyId = Number(event.target.value);
                  setCompanyId(Number.isFinite(nextCompanyId) ? nextCompanyId : null);
                  setObraContext(null);
                }}
                disabled={loadingCompanies || companies.length === 0}
                className="min-w-[16rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)] disabled:opacity-60"
              >
                {companies.length === 0 ? (
                  <option value="">Sem empresas</option>
                ) : (
                  companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nome}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--muted)]">Obra ativa</span>
              <select
                value={activeObraId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  const nextObraId = Number(value);
                  if (!value || !Number.isFinite(nextObraId)) {
                    setObraContext(null);
                    return;
                  }
                  setObraContext(nextObraId);
                }}
                disabled={loadingObras || companyId == null}
                className="min-w-[16rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)] disabled:opacity-60"
              >
                <option value="">Sem obra fixa</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.nome}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--muted)]">Contexto atual</span>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)]">
                {obraContext ? `${obraContext.nome} (#${obraContext.id})` : "Nenhuma obra fixa"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-slate-900/5 px-3 py-1 text-[var(--muted)] dark:bg-white/5">
            Empresa: {activeCompany?.nome ?? "n/d"}
          </span>
          <span className="rounded-full bg-slate-900/5 px-3 py-1 text-[var(--muted)] dark:bg-white/5">
            Obra: {obraContext?.id ?? "n/d"}
          </span>
          <span className="rounded-full bg-slate-900/5 px-3 py-1 text-[var(--muted)] dark:bg-white/5">
            {photos.length} fotos · {frames.length} frames
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={companyId != null ? `/obra/nova?companyId=${companyId}` : "/obra/nova"}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-teal-500/50 hover:bg-teal-500/10"
          >
            Criar obra
          </Link>
          <button
            type="button"
            onClick={() => void handleExportByObra()}
            disabled={activeObraId == null || exportingByObra}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-blue-500/50 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportingByObra ? "Exportando..." : "Exportar arquivos por obra"}
          </button>
          {activeObraId == null && (
            <span className="text-xs text-[var(--muted)]">
              Selecione uma obra no contexto para habilitar a exportação.
            </span>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="space-y-6">
          <GeoUpload
            companyId={companyId}
            obraId={activeObraId ?? null}
            onPhotoCreated={prependPhoto}
            onFramesCreated={prependFrames}
          />

          <GeoMap
            photos={photos}
            frames={frames}
            selectedPhotoId={selectedPhotoId}
            selectedFrameId={selectedFrameId}
            onSelectPhoto={setSelectedPhotoId}
            onSelectFrame={setSelectedFrameId}
          />

          {loadingMedia && (
            <p className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
              A carregar fotos e frames do contexto GEO…
            </p>
          )}
        </div>

        <div className="space-y-6">
          <MapillaryViewer frames={frames} selectedFrameId={selectedFrameId} />

          <GeoGallery
            photos={photos}
            frames={frames}
            selectedPhotoId={selectedPhotoId}
            selectedFrameId={selectedFrameId}
            onSelectPhoto={setSelectedPhotoId}
            onSelectFrame={setSelectedFrameId}
          />
        </div>
      </div>
    </div>
  );
}
