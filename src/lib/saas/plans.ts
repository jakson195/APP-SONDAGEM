/**
 * Planos comerciais DataGeo Digital (Etapa 1 — UI; billing na Etapa 3).
 */

export type SaasPlanId = "trial" | "pro" | "enterprise";

export type SaasPlan = {
  id: SaasPlanId;
  name: string;
  description: string;
  priceLabel: string;
  priceDetail?: string;
  highlighted?: boolean;
  cta: string;
  ctaHref: string;
  features: string[];
};

export const SAAS_PLANS: SaasPlan[] = [
  {
    id: "trial",
    name: "Trial",
    description: "Experimente a plataforma com a sua equipa.",
    priceLabel: "Grátis",
    priceDetail: "14 dias · 1 empresa · 2 obras",
    cta: "Começar grátis",
    ctaHref: "/cadastro?plan=trial",
    features: [
      "SPT e relatórios básicos",
      "1 obra ativa",
      "Suporte por e-mail",
      "Sem cartão de crédito",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Para consultorias e equipas de campo em crescimento.",
    priceLabel: "R$ 497",
    priceDetail: "/ mês · faturamento mensal",
    highlighted: true,
    cta: "Assinar Pro",
    ctaHref: "/cadastro?plan=pro",
    features: [
      "Geofísica 2D/3D + motor Python",
      "Obras e equipas ilimitadas*",
      "Portal do cliente",
      "InSAR / GEO temporal (módulos)",
      "Prioridade no suporte",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Grandes volumes, SLA e integrações sob medida.",
    priceLabel: "Sob consulta",
    priceDetail: "contrato anual",
    cta: "Falar com vendas",
    ctaHref: "/contato?assunto=enterprise",
    features: [
      "Tudo do Pro",
      "SSO e API dedicada",
      "Motor on-premise ou VPC",
      "Formação e implementação",
      "Gestor de conta dedicado",
    ],
  },
];
