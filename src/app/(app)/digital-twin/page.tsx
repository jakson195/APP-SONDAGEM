import { CesiumRouteShell } from "@/modules/digital-twin/components/CesiumRouteShell";

export default function DigitalTwinMapPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Digital Twin
        </p>
        <h1 className="text-2xl font-bold text-[var(--text)]">Gêmeo digital</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Viewer Cesium integrado — carregado apenas nesta rota.
        </p>
      </header>
      <CesiumRouteShell mode="full" />
    </div>
  );
}
