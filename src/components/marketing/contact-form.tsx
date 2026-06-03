"use client";

import { useState } from "react";

type Props = {
  defaultAssunto?: string;
};

export function ContactForm({ defaultAssunto = "" }: Props) {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  if (sent) {
    return (
      <div className="py-8 text-center">
        <p className="font-semibold text-[var(--dg-text)]">Mensagem registada</p>
        <p className="mt-2 text-sm text-[var(--dg-muted)]">
          Ou envie directamente para{" "}
          <a href="mailto:contato@datageodigital.com.br" className="text-[var(--dg-cyan)] hover:underline">
            contato@datageodigital.com.br
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="nome" className="block text-sm font-medium text-[var(--dg-text)]">
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          required
          className="mt-1.5 w-full rounded-lg border border-[var(--dg-border)] bg-[var(--dg-black)] px-3 py-2 text-sm text-[var(--dg-text)] outline-none focus:border-[var(--dg-cyan)] focus:ring-1 focus:ring-[var(--dg-cyan)]"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[var(--dg-text)]">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1.5 w-full rounded-lg border border-[var(--dg-border)] bg-[var(--dg-black)] px-3 py-2 text-sm text-[var(--dg-text)] outline-none focus:border-[var(--dg-cyan)] focus:ring-1 focus:ring-[var(--dg-cyan)]"
        />
      </div>
      <div>
        <label htmlFor="assunto" className="block text-sm font-medium text-[var(--dg-text)]">
          Assunto
        </label>
        <select
          id="assunto"
          name="assunto"
          defaultValue={defaultAssunto || "geral"}
          className="mt-1.5 w-full rounded-lg border border-[var(--dg-border)] bg-[var(--dg-black)] px-3 py-2 text-sm text-[var(--dg-text)]"
        >
          <option value="geral">Informações gerais</option>
          <option value="demo">Agendar demonstração</option>
          <option value="Enterprise">Enterprise</option>
          <option value="suporte">Suporte técnico</option>
        </select>
      </div>
      <div>
        <label htmlFor="mensagem" className="block text-sm font-medium text-[var(--dg-text)]">
          Mensagem
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          rows={4}
          required
          className="mt-1.5 w-full resize-y rounded-lg border border-[var(--dg-border)] bg-[var(--dg-black)] px-3 py-2 text-sm text-[var(--dg-text)] outline-none focus:border-[var(--dg-cyan)]"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-full bg-[var(--dg-cyan)] py-3 text-sm font-semibold text-[var(--dg-black)] transition hover:bg-[var(--dg-blue)]"
      >
        Enviar mensagem
      </button>
    </form>
  );
}
