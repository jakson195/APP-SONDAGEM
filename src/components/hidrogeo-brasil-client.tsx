"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getHidroGeoDirectUrl, getHidroGeoViewerUrl } from "@/lib/hidrogeo-url";

export function HidroGeoBrasilClient() {
  const viewerUrl = getHidroGeoViewerUrl();
  const directUrl = getHidroGeoDirectUrl();
  const [status, setStatus] = useState<"checking" | "loading" | "ready" | "failed">("checking");

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");

    void (async () => {
      try {
        const res = await fetch(viewerUrl, { method: "GET", cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setStatus("failed");
          return;
        }
        const html = await res.text();
        if (!html.includes('id="root"')) {
          setStatus("failed");
          return;
        }
        setStatus("loading");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerUrl]);

  const onIframeLoad = useCallback(() => {
    setStatus("ready");
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
              DataGeo Digital · Hidrologia &amp; geologia
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--text)] sm:text-2xl">
              HidroGeo Brasil — mapa nacional
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Hidrografia ANA, litologia CPRM, magnetometria SGB, medição Turf.js, exportação
              GeoJSON/KML/SHP e animação de vazão por bacia.
            </p>
          </div>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-600/20 dark:text-teal-300"
          >
            Abrir mapa directo
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
          {[
            "Rios MVT",
            "Litologia CPRM",
            "Popup identify",
            "Medição distância/área",
            "Export SHP/KML",
            "Timeline vazão",
          ].map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5"
            >
              {tag}
            </li>
          ))}
        </ul>
      </header>

      {status === "failed" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-[var(--text)]">
          <p className="font-medium">Servidor HidroGeo offline</p>
          <p className="mt-2 text-[var(--muted)]">
            Inicie o Vite na porta <strong>5175</strong> e reinicie o DataGeo se alterou o{" "}
            <code className="rounded bg-black/10 px-1 text-xs dark:bg-white/10">next.config.ts</code>:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-slate-200">
            {`cd hidrogeo-brasil/frontend
npm run dev

cd app-web
npm run dev`}
          </pre>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 font-semibold text-teal-600 dark:text-teal-400"
          >
            {directUrl}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-[var(--border)] shadow-sm">
          {(status === "checking" || status === "loading") && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-sm text-slate-300">
              <span>
                {status === "checking" ? "A verificar HidroGeo…" : "A carregar mapa…"}
              </span>
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-400 underline"
              >
                Abrir directo
              </a>
            </div>
          )}
          {(status === "loading" || status === "ready") && (
            <iframe
              key={viewerUrl}
              title="HidroGeo Brasil — mapa"
              src={viewerUrl}
              className="h-[min(82vh,920px)] w-full bg-slate-950"
              allow="fullscreen; webgl"
              onLoad={onIframeLoad}
            />
          )}
        </div>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Integrado: <code className="text-[10px]">{viewerUrl}</code>
        {" · "}
        Directo:{" "}
        <a href={directUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 underline">
          {directUrl}
        </a>
      </p>
    </div>
  );
}
