import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { digitalTwinNavItems } from "@/lib/digital-twin-nav";
import { DigitalTwinSectionPage } from "@/components/digital-twin/section-page";

export default function DigitalTwinDashboardPage() {
  return (
    <DigitalTwinSectionPage
      title="Dashboard"
      description="Visão geral do gêmeo digital geotécnico — InSAR, LiDAR, sensores e alertas."
      icon={digitalTwinNavItems[0]!.icon}
    >
      <Link
        href="/digital-twin"
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-700 dark:text-teal-300"
      >
        Abrir mapa Cesium
        <ArrowUpRight className="h-4 w-4" />
      </Link>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {digitalTwinNavItems.slice(1).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-all duration-200 hover:border-teal-500/40 hover:shadow-md"
            >
              <Icon
                className="h-5 w-5 text-teal-600 transition-colors group-hover:text-teal-500 dark:text-teal-400"
                strokeWidth={2}
              />
              <p className="mt-2 font-semibold text-[var(--text)]">{item.label}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{item.description}</p>
            </Link>
          );
        })}
      </div>
    </DigitalTwinSectionPage>
  );
}
