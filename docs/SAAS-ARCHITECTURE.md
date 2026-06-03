# Arquitetura SaaS — DataGeo Digital

## Estrutura de pastas (Next.js App Router)

```
app-web/src/
├── app/
│   ├── (site)/                 # Site comercial (público)
│   │   ├── layout.tsx
│   │   ├── page.tsx            # /
│   │   ├── funcionalidades/
│   │   ├── planos/
│   │   └── contato/
│   ├── (app)/                  # Dashboard autenticado (existente)
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── geofisica/
│   │   ├── spt/
│   │   └── ...
│   ├── api/
│   │   ├── auth/               # login, register, recover
│   │   ├── geofisica/          # proxy → Python :8092
│   │   ├── billing/            # (Etapa 3) Stripe/MP webhooks
│   │   └── webhooks/
│   ├── login/ cadastro/        # Auth UI
│   └── admin/ cliente/           # Super-admin e portal B2B2C
├── components/
│   ├── marketing/              # Site comercial
│   ├── auth/
│   └── app-shell.tsx
├── lib/
│   ├── saas/                   # planos, limites, constantes
│   ├── server-auth.ts
│   └── geofisica/
└── modules/registry.ts         # Catálogo de módulos produto

python-engine/
├── geophysics/                 # FastAPI :8092
└── landsat/                    # :8093
```

## Fluxo utilizador

```
datageodigital.com.br (site)
    → Cadastro / Login
    → Escolha de plano (Etapa 3)
    → Pagamento aprovado
    → Company + User ADMIN criados
    → app.datageodigital.com.br/dashboard
```

## Banco de dados (já existente + extensões)

| Tabela Prisma | Uso SaaS |
|---------------|----------|
| `User` | Conta global |
| `Company` | Tenant (`plan`, `status`) |
| `OrgMembership` | Utilizador ↔ empresa |
| `Obra` | Projeto de campo |
| `EmpresaModulo` | Feature flags por empresa |
| *(futuro)* `Subscription` | Stripe/MP subscription id |
| *(futuro)* `GeophysSection` | Modelos invertidos persistidos |

## Integração geofísica

```
Browser → POST /api/geofisica/invert/2d (auth + obraId)
       → Python POST /api/v1/geophysics/invert/2d
       → Resposta JSON (malha, m_log10, métricas)
```

Env: `GEOPHYSICS_ENGINE_URL=http://127.0.0.1:8092`

## Domínios

| Host | Destino |
|------|---------|
| `datageodigital.com.br` | `(site)` + auth pages |
| `app.datageodigital.com.br` | `(app)` (mesmo deploy ou projeto Vercel separado) |

Mesmo repositório: rewrites por `host` no `middleware.ts` (Etapa 6).
