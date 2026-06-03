# DataGeo Digital — Roadmap SaaS

## Visão

Plataforma SaaS B2B para geotecnia e geofísica de campo: site comercial → cadastro → plano → pagamento → empresa → dashboard.

## Arquitetura alvo

| Camada | URL (prod) | Stack |
|--------|------------|--------|
| Site comercial | `datageodigital.com.br` | Next.js `(site)` |
| App produto | `app.datageodigital.com.br` | Next.js `(app)` |
| API | `/api/*` | Next.js Route Handlers + Prisma |
| Motor científico | interno `:8092` | FastAPI (geofísica) |

## Fases

### Etapa 1 — Site comercial ✅

- [x] Route group `(site)` com layout marketing
- [x] Landing: hero, módulos, vantagens, planos, CTA, footer
- [x] Páginas `/funcionalidades`, `/planos`, `/contato`
- [x] Home `/` pública; utilizador autenticado → `/dashboard`
- [x] Documentação de arquitetura e pastas

### Etapa 2 — Autenticação completa ✅

- [x] Supabase + JWT legacy no mesmo fluxo de registo/login
- [x] Middleware: rotas `(app)` + `/admin` + `/adm`
- [x] Multi-empresa: cookie `dg_active_company` + API + switcher UI
- [x] Recuperação JWT (`PasswordResetToken`) + Supabase
- [x] Rate limiting em login/registo/recuperação
- [x] `GET /api/auth/me`, empresas, empresa activa
- [ ] Convites por email (futuro)
- [ ] E-mail transacional produção (Resend/SMTP)

### Etapa 3 — Assinatura SaaS ✅ (Stripe)

- [x] Modelo Prisma `Subscription` + limites `maxObras` / `maxUsers`
- [x] Stripe checkout + webhook + portal
- [x] Trial 14 dias no cadastro; Pro via checkout
- [x] Página `/assinatura` + aviso no layout app
- [x] Script `scripts/backfill-subscriptions.ts`
- [ ] Mercado Pago (webhooks)
- [ ] Enforcement hard-block ao criar obra (API)
- [ ] Faturas (`Invoice` model)

### Etapa 4 — API e motor Python ✅

- [x] `POST /api/geophysics/inversion` (alias estável)
- [x] Auth + assinatura + `companyId`/`obraId` em rotas geofísica
- [x] Persistir secções ERT em PostgreSQL (`GeophysSection`)
- [x] Limite `maxObras` no `POST /api/obras`
- [x] Mercado Pago (webhook stub + `BILLING_PROVIDER`)
- [ ] Fila de jobs (Redis/Bull ou tabela `GeophysJob`)

### Etapa 5 — UI produto

- [ ] Design system (cards, skeletons, toasts)
- [ ] Dark mode consistente
- [ ] Dashboard SaaS (MRR, obras ativas, uso)
- [ ] Loading states em inversão geofísica

### Etapa 6 — Deploy e domínios

- [ ] Vercel: preview + production
- [ ] Motor Python: Fly.io / Railway (já há `fly.toml`)
- [ ] DNS: apex → site, `app.` → aplicação
- [ ] Variáveis de ambiente por ambiente

## Prioridade imediata (pós Etapa 1)

1. Proteger APIs geofísica com auth
2. Checkout + webhook (Etapa 3)
3. Persistência geofísica em DB
