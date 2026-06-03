import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: {
    default: "DataGeo Digital — Geotecnia e geofísica em SaaS",
    template: "%s · DataGeo Digital",
  },
  description:
    "Plataforma SaaS para sondagem SPT, geofísica ERT, relatórios técnicos e portal do cliente. Trial grátis.",
  openGraph: {
    title: "DataGeo Digital",
    description: "Geotecnia e geofísica de campo — do registo ao relatório.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
