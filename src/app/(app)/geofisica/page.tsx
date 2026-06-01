import Link from "next/link";

const cards = [
  {
    href: "/geofisica/ves?metodo=wenner",
    title: "SEV — Wenner",
    desc:
      "Meio-espalhamento AB/2 e ρa: perfil aparente e inversão 1D em duas camadas.",
  },
  {
    href: "/geofisica/ves?metodo=schlumberger",
    title: "SEV — Schlumberger",
    desc:
      "AB/2 (s), MN/2 (b) fixo na série e ρa (s > b): perfil aparente e inversão 1D.",
  },
  {
    href: "/geofisica/dipolo-dipolo",
    title: "Dipolo-Dipolo — RES2DINV-like",
    desc:
      "Perfil 2D: inversão RES2DINV-like, interpretação geológica por localização (mapa + IA opcional) e litologia na secção invertida.",
  },
  {
    href: "/geofisica/qc",
    title: "QC automático — qualidade de dados",
    desc:
      "Classificação verde/amarelo/vermelho por SNR, spikes, FFT 50/60 Hz, mapa colorido, gráfico de ruído e interpretação IA.",
  },
  {
    href: "/geofisica/volume-3d",
    title: "Modelo 3D — interpolação multi-secção",
    desc:
      "Voxel 3D entre linhas invertidas: IDW/Kriging/RBF (Python), nuvem XYZ, filtro por resistividade, fatias, iso-superfícies, clipping e IA.",
  },
] as const;

export default function GeofisicaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Geofísica</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Ferramentas a partir de dados de campo: perfis aparentes e inversão 1D
          (modelo interpretativo).
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-1">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:border-teal-600/40 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {c.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{c.desc}</p>
              <span className="mt-3 inline-block text-sm font-medium text-teal-700 dark:text-teal-400">
                Abrir →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
