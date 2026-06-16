"use client";

import { useCallback, useState } from "react";

import { buildClientGeotiffPreview } from "@/lib/client-geotiff-preview";
import type { CompareResult, OrthoPreview, UploadSlot } from "@/lib/types";

type GeoTiffUploadProps = {
  onUploaded: (preview: OrthoPreview) => void;
  onCompareComplete?: (result: CompareResult) => void;
  disabled?: boolean;
};

type SlotState = {
  busy: boolean;
  fileName: string | null;
  error: string | null;
  warning: string | null;
};

const initialSlot: SlotState = { busy: false, fileName: null, error: null, warning: null };

export function GeoTiffUpload({ onUploaded, onCompareComplete, disabled }: GeoTiffUploadProps) {
  const [t0, setT0] = useState<SlotState>(initialSlot);
  const [t1, setT1] = useState<SlotState>(initialSlot);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const uploadSlot = useCallback(
    async (slot: UploadSlot, file: File) => {
      const setSlot = slot === "T0" ? setT0 : setT1;
      setSlot({ busy: true, fileName: file.name, error: null, warning: null });

      try {
        const form = new FormData();
        form.append("slot", slot);
        form.append("file", file);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as { error?: string; bounds?: [number, number, number, number] };
        if (!response.ok) {
          throw new Error(data.error ?? "Falha no upload.");
        }

        let previewUrl: string | null = null;
        let warning: string | null = null;
        try {
          const preview = await buildClientGeotiffPreview(file);
          previewUrl = preview.previewUrl;
        } catch {
          // GeoTIFFs grandes podem estourar memória no browser; upload ainda é válido.
          warning = "Preview local desativado para arquivo grande. Comparação continua disponível.";
        }

        if (!data.bounds) {
          throw new Error("Não foi possível ler os bounds do GeoTIFF no servidor.");
        }

        onUploaded({
          slot,
          fileName: file.name,
          previewUrl,
          bounds: data.bounds,
        });
        setSlot({ busy: false, fileName: file.name, error: null, warning });
      } catch (error) {
        setSlot({
          busy: false,
          fileName: file.name,
          error: error instanceof Error ? error.message : "Erro no upload.",
          warning: null,
        });
      }
    },
    [onUploaded],
  );

  const runCompare = useCallback(async () => {
    setCompareBusy(true);
    setCompareError(null);
    try {
      const response = await fetch("/api/compare", { method: "POST" });
      const data = (await response.json()) as CompareResult & { error?: string; detail?: string };
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "Falha na comparação.");
      }
      onCompareComplete?.(data);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : "Erro na comparação.");
    } finally {
      setCompareBusy(false);
    }
  }, [onCompareComplete]);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl backdrop-blur">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Ortofotos T0 / T1
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Envie dois rasters georreferenciados (TIFF/ECW). Arquivos grandes podem levar alguns
        minutos na comparação.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <UploadField
          label="Ortofoto T0 (antes)"
          slot="T0"
          state={t0}
          disabled={disabled || compareBusy}
          onPick={(file) => void uploadSlot("T0", file)}
        />
        <UploadField
          label="Ortofoto T1 (depois)"
          slot="T1"
          state={t1}
          disabled={disabled || compareBusy}
          onPick={(file) => void uploadSlot("T1", file)}
        />
      </div>

      <button
        type="button"
        disabled={disabled || compareBusy || !t0.fileName || !t1.fileName}
        onClick={() => void runCompare()}
        className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {compareBusy
          ? "A processar comparação (1–5 min em ortofotos grandes)…"
          : "Comparar e gerar heatmap"}
      </button>

      {compareError && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{compareError}</p>
      )}
    </section>
  );
}

function UploadField({
  label,
  slot,
  state,
  disabled,
  onPick,
}: {
  label: string;
  slot: UploadSlot;
  state: SlotState;
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/50 p-3 transition hover:border-sky-400/60">
      <span className="text-xs font-medium text-slate-200">{label}</span>
      <span className="text-[11px] text-slate-500">{slot} · .tif / .tiff / .ecw</span>
      <input
        type="file"
        accept=".tif,.tiff,.geotiff,.ecw,image/tiff"
        disabled={disabled || state.busy}
        className="text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
        }}
      />
      {state.busy && <span className="text-xs text-sky-300">A enviar…</span>}
      {state.fileName && !state.busy && (
        <span className="truncate text-xs text-emerald-300">{state.fileName}</span>
      )}
      {state.warning && <span className="text-xs text-amber-300">{state.warning}</span>}
      {state.error && <span className="text-xs text-red-300">{state.error}</span>}
    </label>
  );
}
