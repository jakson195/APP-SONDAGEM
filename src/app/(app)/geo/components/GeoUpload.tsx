"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { apiUrl } from "@/lib/api-url";
import type { GeoPhoto, StreetFrame } from "../types";

type GeoUploadProps = {
  companyId: number | null;
  obraId: number | null;
  onPhotoCreated: (photo: GeoPhoto) => void;
  onFramesCreated: (frames: StreetFrame[]) => void;
};

type UploadStatus = {
  kind: "idle" | "success" | "error";
  message: string;
};

type ExifPayload = {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  capturedAt: string | null;
  metadata: Record<string, unknown> | null;
};

function pickDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function readImageExif(file: File): Promise<ExifPayload> {
  const exifr = (await import("exifr")) as {
    parse: (
      fileArg: File,
      options?: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null>;
  };

  const parsed = await exifr.parse(file, {
    gps: true,
    exif: true,
    tiff: true,
    xmp: true,
    icc: false,
  });

  const metadata =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;

  const latitude =
    typeof metadata?.latitude === "number"
      ? metadata.latitude
      : typeof metadata?.Latitude === "number"
        ? metadata.Latitude
        : null;
  const longitude =
    typeof metadata?.longitude === "number"
      ? metadata.longitude
      : typeof metadata?.Longitude === "number"
        ? metadata.Longitude
        : null;
  const altitude =
    typeof metadata?.altitude === "number"
      ? metadata.altitude
      : typeof metadata?.GPSAltitude === "number"
        ? metadata.GPSAltitude
        : null;

  const capturedAt =
    pickDate(metadata?.DateTimeOriginal) ??
    pickDate(metadata?.DateTimeDigitized) ??
    pickDate(metadata?.DateTime) ??
    pickDate(metadata?.CreateDate);

  return { latitude, longitude, altitude, capturedAt, metadata };
}

export function GeoUpload({
  companyId,
  obraId,
  onPhotoCreated,
  onFramesCreated,
}: GeoUploadProps) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({
    kind: "idle",
    message: "Envie fotos georreferenciadas ou um vídeo para gerar frames de rua.",
  });

  const scopeReady = companyId != null;
  const obraLabel = useMemo(() => {
    if (obraId == null) return "sem obra selecionada";
    return `obra #${obraId}`;
  }, [obraId]);

  async function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || !scopeReady || companyId == null) return;

    setPhotoBusy(true);
    const errors: string[] = [];
    let successCount = 0;

    for (const file of files) {
      try {
        const exif = await readImageExif(file);
        if (exif.latitude == null || exif.longitude == null) {
          errors.push(`${file.name}: sem geotag EXIF/GPS.`);
          continue;
        }

        const body = new FormData();
        body.append("file", file);
        body.append("companyId", String(companyId));
        if (obraId != null) body.append("obraId", String(obraId));
        body.append("latitude", String(exif.latitude));
        body.append("longitude", String(exif.longitude));
        if (exif.altitude != null) body.append("altitude", String(exif.altitude));
        if (exif.capturedAt) body.append("capturedAt", exif.capturedAt);
        if (exif.metadata) body.append("metadata", JSON.stringify(exif.metadata));

        const response = await fetch(apiUrl("/api/geo/photos"), {
          method: "POST",
          body,
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as GeoPhoto & { error?: string };
        if (!response.ok) {
          errors.push(data.error ?? `${file.name}: falha no upload.`);
          continue;
        }

        onPhotoCreated(data);
        successCount += 1;
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `${file.name}: ${error.message}`
            : `${file.name}: falha ao ler EXIF.`,
        );
      }
    }

    setPhotoBusy(false);
    if (successCount > 0 && errors.length === 0) {
      setStatus({
        kind: "success",
        message: `${successCount} foto(s) GEO enviada(s) com sucesso.`,
      });
      return;
    }
    if (successCount > 0) {
      setStatus({
        kind: "success",
        message: `${successCount} foto(s) enviadas. Pendências: ${errors.join(" ")}`,
      });
      return;
    }
    setStatus({
      kind: "error",
      message: errors.join(" ") || "Nenhuma foto pôde ser enviada.",
    });
  }

  async function handleVideoSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !scopeReady || companyId == null) return;

    setVideoBusy(true);
    setStatus({
      kind: "idle",
      message: "A processar vídeo, extrair frames e procurar metadados GPS…",
    });

    const body = new FormData();
    body.append("file", file);
    body.append("companyId", String(companyId));
    if (obraId != null) body.append("obraId", String(obraId));

    try {
      const response = await fetch(apiUrl("/api/upload-video"), {
        method: "POST",
        body,
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        warnings?: string[];
        frames?: StreetFrame[];
      };
      if (!response.ok) {
        setStatus({
          kind: "error",
          message: data.error ?? "Falha ao processar o vídeo.",
        });
        return;
      }

      const frames = Array.isArray(data.frames) ? data.frames : [];
      onFramesCreated(frames);
      setStatus({
        kind: "success",
        message:
          frames.length > 0
            ? `${frames.length} frame(s) gerados do vídeo.${data.warnings?.length ? ` Avisos: ${data.warnings.join(" ")}` : ""}`
            : "Vídeo processado sem frames utilizáveis.",
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Falha de rede ao enviar vídeo.",
      });
    } finally {
      setVideoBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">Upload GEO</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Escopo atual: {scopeReady ? `${companyId} · ${obraLabel}` : "selecione uma empresa"}
          </p>
        </div>
        <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
          Mobile ready
        </span>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(event) => void handlePhotoSelection(event)}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleVideoSelection(event)}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!scopeReady || photoBusy || videoBusy}
          onClick={() => photoInputRef.current?.click()}
          className="rounded-2xl bg-teal-600 px-4 py-3 text-left text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {photoBusy ? "A ler EXIF e enviar fotos…" : "Enviar foto georreferenciada"}
        </button>
        <button
          type="button"
          disabled={!scopeReady || photoBusy || videoBusy}
          onClick={() => videoInputRef.current?.click()}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {videoBusy ? "A extrair frames do vídeo…" : "Enviar vídeo para frames de rua"}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 p-4 text-xs text-[var(--muted)]">
        <p>Fotos: o cliente lê EXIF com `exifr` e só envia se houver latitude/longitude.</p>
        <p className="mt-1">
          Vídeos: o servidor tenta usar `ffmpeg`, `ffprobe` e `exiftool` para gerar e localizar os
          frames.
        </p>
      </div>

      <p
        className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
          status.kind === "error"
            ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            : status.kind === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "bg-[var(--surface)] text-[var(--muted)]"
        }`}
        role={status.kind === "error" ? "alert" : "status"}
      >
        {status.message}
      </p>
    </section>
  );
}
