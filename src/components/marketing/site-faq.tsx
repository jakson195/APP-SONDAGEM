const faqs = [
  {
    q: "Preciso instalar algo no servidor?",
    a: "A app web corre na Vercel ou no seu host Node.js. O motor geofísico Python é opcional em localhost:8092 ou num serviço separado (Fly.io / Railway).",
  },
  {
    q: "Quantas obras posso ter no trial?",
    a: "O trial inclui até 2 obras e 14 dias. Planos Pro ampliam limites conforme assinatura.",
  },
  {
    q: "Os dados ficam isolados por cliente?",
    a: "Sim. Cada empresa (tenant) tem obras, utilizadores, módulos e portal próprios.",
  },
  {
    q: "A inversão geofísica é física ou só visual?",
    a: "É inversão física (FDM/FEM) via motor Python — não é apenas desenho de pseudoseção.",
  },
];

export function SiteFaq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-[var(--dg-border)] py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold">Perguntas frequentes</h2>
        <dl className="mt-12 space-y-6">
          {faqs.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-card)] p-6"
            >
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--dg-muted)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
