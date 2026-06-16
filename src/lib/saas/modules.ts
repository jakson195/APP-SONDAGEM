import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  FileText,
  Layers,
  Map,
  Mountain,
  Radio,
  Waves,
} from "lucide-react";

export type MarketingModule = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tag?: string;
};

export const MARKETING_MODULES: MarketingModule[] = [
  {
    id: "spt",
    title: "SPT & sondagem",
    description:
      "Registo de campo, gráficos NSPT, perfis estratigráficos e relatórios PDF alinhados ao padrão Soilsul.",
    icon: Activity,
    tag: "Geotecnia",
  },
  {
    id: "geofisica",
    title: "Geofísica ERT",
    description:
      "Dipolo-dipolo 2D, inversão FDM/FEM, QC de linha, volume 3D e interpretação com IA.",
    icon: Radio,
    tag: "Motor Python",
  },
  {
    id: "ves",
    title: "VES 1D",
    description: "Curvas de sondagem elétrica vertical Wenner/Schlumberger e modelos em camadas.",
    icon: Waves,
  },
  {
    id: "geo",
    title: "GEO & temporal",
    description: "Mapas, InSAR, Landsat e camadas de contexto para obras e áreas de estudo.",
    icon: Map,
  },
  {
    id: "digital-twin",
    title: "Digital Twin",
    description: "GNSS, LiDAR, taludes e monitorização 3D integrada ao projeto.",
    icon: Mountain,
    tag: "3D",
  },
  {
    id: "relatorios",
    title: "Relatórios & portal",
    description:
      "Relatórios técnicos, partilha com cliente e portal white-label por empresa.",
    icon: FileText,
  },
  {
    id: "hidrologia",
    title: "Hidrologia",
    description:
      "Chuvas SC/BR, HidroGeo Brasil (mapa 3D ANA + CPRM) e apoio a estudos hidrológicos regionais.",
    icon: BarChart3,
  },
  {
    id: "geotecnia",
    title: "Geotecnia",
    description:
      "SPT, sondagem, perfis estratigráficos e relatórios alinhados ao padrão de campo.",
    icon: BarChart3,
  },
  {
    id: "obras",
    title: "Gestão de obras",
    description: "Multi-obra, equipas, módulos por empresa e permissões granulares.",
    icon: Layers,
  },
];

export const MARKETING_BENEFITS = [
  {
    title: "Multi-empresa nativo",
    body: "Cada cliente é uma empresa isolada: utilizadores, obras, módulos e portal próprios.",
  },
  {
    title: "Motor científico real",
    body: "Inversão 2D com Poisson FDM/FEM — não é só desenho de pseudoseção.",
  },
  {
    title: "Campo + escritório",
    body: "Do registo no furo ao relatório PDF e à entrega no portal do cliente.",
  },
  {
    title: "Escala cloud",
    body: "PostgreSQL, deploy Vercel e motor Python desacoplado para crescer com a sua operação.",
  },
] as const;
