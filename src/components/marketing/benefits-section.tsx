import { MARKETING_BENEFITS } from "@/lib/saas/modules";
import { Shield, Zap } from "lucide-react";

export function BenefitsSection() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">
              Por que escolher DataGeo?
            </h2>
            <p className="mt-4 text-lg text-[var(--muted)]">
              Construído para consultorias que precisam de rigor técnico, isolamento por cliente e
              velocidade no dia a dia.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
                <Zap className="h-4 w-4 text-[var(--accent)]" />
                Deploy em minutos
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
                <Shield className="h-4 w-4 text-[var(--accent)]" />
                Dados por empresa
              </div>
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {MARKETING_BENEFITS.map((b) => (
              <li
                key={b.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <h3 className="font-semibold text-[var(--text)]">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
