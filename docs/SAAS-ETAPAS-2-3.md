# Etapas 2 e 3 — Autenticação e Assinatura

## Aplicar na base de dados

```powershell
cd c:\VISION\APP-SONDAGEM\app-web
npm run db:push
npx tsx scripts/backfill-subscriptions.ts
```

## Etapa 2 — Autenticação

| Funcionalidade | Onde |
|----------------|------|
| Middleware (rotas app + admin) | `middleware.ts` |
| Rotas públicas centralizadas | `src/lib/auth/public-routes.ts` |
| Rate limit login/registo/recuperação | `src/lib/auth/rate-limit.ts` |
| Cadastro JWT (sem Supabase) | `POST /api/auth/register` |
| Recuperação JWT | `POST /api/auth/recover` + `POST /api/auth/reset-password` |
| Sessão / perfil | `GET /api/auth/me` |
| Multi-empresa (cookie) | `POST /api/auth/active-company` + `CompanySwitcher` |
| Listar empresas | `GET /api/auth/companies` |

**Dev (JWT):** após recuperar senha, a API devolve `devResetLink` com o token (apenas `NODE_ENV !== production`).

## Etapa 3 — Assinatura SaaS

| Funcionalidade | Onde |
|----------------|------|
| Modelo `Subscription` | `prisma/schema.prisma` |
| Trial 14 dias no cadastro | `provisionSubscriptionForCompany` |
| Limites por plano | `src/lib/saas/plan-limits.ts` |
| Página gestão | `/assinatura` |
| Checkout Stripe | `POST /api/billing/checkout` |
| Portal cliente Stripe | `POST /api/billing/portal` |
| Webhook | `POST /api/billing/webhook` |
| Estado + uso | `GET /api/billing/subscription` |

### Configurar Stripe

1. Criar produto/preço mensal no [Dashboard Stripe](https://dashboard.stripe.com).
2. Webhook endpoint: `https://SEU_DOMINIO/api/billing/webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
3. Variáveis em `.env.local` (ver `.env.example`).

### Fluxo comercial

```
/cadastro?plan=trial  → empresa + trial 14d → /dashboard
/cadastro?plan=pro    → empresa + redirect checkout Stripe
Pagamento OK (webhook) → plan=pro, status=ACTIVE
```

### Mercado Pago

Estrutura preparada (`billingProvider`). Integração MP pode reutilizar `Subscription.externalSubscriptionId` — implementação futura.
