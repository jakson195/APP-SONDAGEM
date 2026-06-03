# Etapa 4 — API geofísica, limites e persistência

## Base de dados

```powershell
cd c:\VISION\APP-SONDAGEM\app-web
npm run db:push
```

Novo modelo: **`GeophysSection`** (secções ERT por obra).

## Segurança nas APIs geofísica

Todas as rotas em `/api/geofisica/*` exigem:

1. Sessão autenticada (JWT ou Supabase)
2. Assinatura activa (trial não expirado, Pro pago, etc.)
3. Acesso à empresa da obra (multi-tenant)
4. Módulo geofísica permitido no plano

Guarda central: `src/lib/geofisica/geophys-api-guard.ts`

## Alias de inversão

| Método | Rota estável | Equivalente |
|--------|----------------|-------------|
| GET/POST | `/api/geophysics/inversion` | `/api/geofisica/invert/2d` |

O cliente deve enviar cookies (`credentials: "include"`) nas chamadas à API Next.

## Persistência de secções

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/geofisica/sections?obraId=` | Lista secções da obra |
| POST | `/api/geofisica/sections` | Guarda `section` ou sincroniza `sections[]` |
| DELETE | `/api/geofisica/sections/[id]?obraId=` | Remove secção |

A UI continua a usar `localStorage` como cache; com `obraId` seleccionada, grava também no PostgreSQL.

## Limite de obras

`POST /api/obras` valida `maxObras` da assinatura. Resposta `403` com código `MAX_OBRAS` quando o limite é atingido.

## Mercado Pago

- `BILLING_PROVIDER=mercadopago` + `MERCADOPAGO_ACCESS_TOKEN`
- Webhook stub: `POST /api/billing/mercadopago/webhook`
- Checkout MP: resposta `501` até implementação completa

## Motor Python

Sem alteração: `npm run geophysics:engine` na porta **8092**.
