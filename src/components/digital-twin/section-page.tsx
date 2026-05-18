import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { ViewerEmbed } from "@/components/digital-twin/viewer-embed";
import { getDigitalTwinViewerUrl } from "@/lib/digital-twin-url";

type Props = {
  title: string;
  description: string;
  icon: LucideIcon;
  viewerUrl?: string | null;
  /** Incorporar viewer Cesium em ecrã completo (exceto quando há children) */
  embedViewer?: boolean;
  children?: React.ReactNode;
};

export function DigitalTwinSectionPage({
  title,
  description,
  icon: Icon,
  viewerUrl: viewerUrlProp,
  embedViewer = false,
  children,
}: Props) {
  const viewerUrl = viewerUrlProp ?? digitalTwinViewerUrl();
  const showEmbed = Boolean(viewerUrl && embedViewer);

  return (
    <div
      className={
        showEmbed ? "mx-auto w-full max-w-[1600px] space-y-4" : "mx-auto max-w-5xl space-y-6"
      }
    >
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Digital Twin
          </p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        {viewerUrl && (
          <a
            href={viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:border-teal-500/50 hover:bg-teal-500/10"
          >
            Abrir em nova aba
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </header>

      {showEmbed && viewerUrl && <ViewerEmbed title={title} viewerUrl={viewerUrl} />}

      {children}

      {!viewerUrl && !children && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          <p>
            Defina{" "}
            <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10">
              NEXT_PUBLIC_DIGITAL_TWIN_URL
            </code>{" "}
            (ex.: <code className="text-xs">http://localhost:5173</code>) em{" "}
            <code className="text-xs">.env.local</code> e reinicie o Next.js.
          </p>
        </div>
      )}

      {viewerUrl && children && (
        <p className="text-center text-xs text-[var(--muted)]">
          <Link
            href={viewerUrl}
            target="_blank"
            className="inline-flex items-center gap-1 font-medium text-teal-600 dark:text-teal-400"
          >
            Abrir viewer Cesium completo
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      )}
    </div>
  );
}

export function digitalTwinViewerUrl(): string | null {
  return getDigitalTwinViewerUrl();
}
