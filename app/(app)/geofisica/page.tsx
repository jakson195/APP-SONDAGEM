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
    href: "/geofisica/ves?metodo=dipolo",
    title: "SEV — Dipolo-dipolo",
    desc:
      "Comprimento de dipolo a (m), separação n (inteiro ≥ 1) e ρa: perfil e inversão 1D.",
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
