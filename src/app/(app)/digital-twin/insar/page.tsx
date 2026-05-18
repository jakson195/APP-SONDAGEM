import { Radar } from "lucide-react";
import Link from "next/link";

import { CesiumRouteShell } from "@/modules/digital-twin/components/CesiumRouteShell";
import { digitalTwinSection } from "@/lib/digital-twin-page";

export default function DigitalTwinInsarPage() {
  const s = digitalTwinSection("insar");
  const Icon = s.icon;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Digital Twin · InSAR
          </p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{s.label}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{s.description}</p>
          <Link
            href="/obra/nova"
            className="mt-3 inline-flex items-center rounded-full bg-teal-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow hover:bg-teal-500"
          >
            Nova obra InSAR
          </Link>
        </div>
        <Radar className="hidden h-8 w-8 text-teal-500/30 md:block" aria-hidden />
      </header>
      <CesiumRouteShell mode="insar" />
    </div>
  );
}
