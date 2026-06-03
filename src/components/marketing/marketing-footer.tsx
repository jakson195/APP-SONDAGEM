import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-dg-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
        <BrandLogo href="/" height={32} />
        <p className="text-sm text-dg-muted">© {year} DataGeo Digital. Todos os direitos reservados.</p>
        <nav className="flex flex-wrap justify-center gap-6 text-sm text-dg-muted">
          <Link href="/funcionalidades" className="hover:text-dg-text">
            Módulos
          </Link>
          <Link href="/planos" className="hover:text-dg-text">
            Planos
          </Link>
          <Link href="/login" className="hover:text-dg-text">
            Entrar
          </Link>
          <Link href="/contato" className="hover:text-dg-text">
            Contato
          </Link>
        </nav>
      </div>
    </footer>
  );
}
