import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contato",
};

export default function ContatoPage() {
  return (
    <section className="px-4 py-28 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--dg-cyan)]">
            Contacto
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Fale connosco</h1>
          <p className="mt-4 text-lg text-[var(--dg-muted)]">
            Demonstração, plano Enterprise ou suporte técnico — respondemos em até 24h
            úteis.
          </p>
          <ul className="mt-10 space-y-4 text-sm">
            <li>
              <span className="font-medium text-[var(--dg-text)]">Comercial</span>
              <br />
              <a
                href="mailto:contato@datageodigital.com.br"
                className="text-[var(--dg-cyan)] hover:underline"
              >
                contato@datageodigital.com.br
              </a>
            </li>
            <li>
              Já tem conta?{" "}
              <Link href="/login" className="font-medium text-[var(--dg-cyan)] hover:underline">
                Entrar no dashboard
              </Link>
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--dg-border)] bg-[var(--dg-card)] p-6 shadow-lg sm:p-8">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
