import { CesiumRouteShell } from "@/modules/digital-twin/components/CesiumRouteShell";
import { digitalTwinSection } from "@/lib/digital-twin-page";

export default function DigitalTwinLidarPage() {
  const s = digitalTwinSection("lidar");
  const Icon = s.icon;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Digital Twin · LiDAR
          </p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{s.label}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{s.description}</p>
        </div>
      </header>
      <CesiumRouteShell mode="lidar" />
    </div>
  );
}
