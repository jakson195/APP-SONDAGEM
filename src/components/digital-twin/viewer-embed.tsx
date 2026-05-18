"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";

type Props = {
  title: string;
  viewerUrl: string;
};

export function ViewerEmbed({ title, viewerUrl }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-[var(--text)]">
        <p className="font-medium">Viewer indisponível</p>
        <p className="mt-2 text-[var(--muted)]">
          Não foi possível carregar{" "}
          <code className="rounded bg-black/10 px-1 text-xs dark:bg-white/10">
            {viewerUrl}
          </code>
          . Inicie o Digital Twin:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-slate-200">
          cd digital-twin{"\n"}docker compose up -d
        </pre>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Ou só o frontend:{" "}
          <code className="rounded bg-black/10 px-1 dark:bg-white/10">
            cd digital-twin/frontend &amp;&amp; npm run dev
          </code>
        </p>
        <a
          href={viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 font-medium text-teal-600 dark:text-teal-400"
        >
          Tentar abrir em nova aba
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-sm">
      <iframe
        title={`Digital Twin — ${title}`}
        src={viewerUrl}
        className="h-[min(75vh,800px)] w-full bg-slate-950"
        allow="fullscreen"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
