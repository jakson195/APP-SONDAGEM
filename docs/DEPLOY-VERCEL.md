# Deploy Vercel = localhost

## 1. Publicar código

O Vercel liga ao repositório `jakson195/APP-SONDAGEM` (pasta `app-web` como root do projeto, se configurado).

```powershell
cd c:\VISION\APP-SONDAGEM\app-web
git add .
git commit -m "feat: DataGeo Digital + HidroChuSC catálogo SC"
git push origin main
```

Ou deploy direto (CLI):

```powershell
cd c:\VISION\APP-SONDAGEM\app-web
vercel --prod
```

## 2. Variáveis no painel Vercel (Production)

Copie de `.env.local` os valores reais (não commite segredos):

| Variável | Produção |
|----------|----------|
| `DATABASE_URL` | Neon pooler (mesma base que usa local, se aplicável) |
| `DIRECT_URL` | Neon direct (migrações Prisma) |
| `JWT_SECRET` | Igual ou novo segredo longo |
| `NEXT_PUBLIC_APP_URL` | `https://datageodigital.com.br` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Chave com domínio `datageodigital.com.br` |
| `NEXT_PUBLIC_DIGITAL_TWIN_URL` | URL do viewer em produção (se existir) |

Opcional: `NEXT_PUBLIC_CESIUM_ION_TOKEN`, `INSAR_*`, `SENTINEL_*`.

## 3. Domínio

Vercel → Project → Settings → Domains:

- `datageodigital.com.br`
- `www.datageodigital.com.br` (redirect para apex ou vice-versa)

DNS no registrador:

- `A` → `76.76.21.21` ou `CNAME` → `cname.vercel-dns.com`

## 4. Build

`vercel.json` já define:

```json
"buildCommand": "prisma generate && next build --webpack"
```

Após push, confira em Deployments que o build passou. Dados estáticos HidroChu: `public/data/hidrochu/hidrochu-municipios-sc.json`.

## 5. Capacitor (app móvel)

Não usa Vercel em dev live reload. Produção nativa:

```powershell
$env:CAP_DISABLE_LIVE="1"
$env:CAP_SERVER_URL="https://datageodigital.com.br"
npm run build
npx cap sync
```
