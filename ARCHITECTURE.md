# SOILSUL — monólito modular

Uma única aplicação Next.js (`npm run dev` → **porta 3000**), um login, um deploy, um APK Android (Capacitor).

## Estrutura `src/`

```
src/
├── app/              # Rotas Next.js (finas — importam de modules/pages)
├── modules/          # Domínios funcionais
│   ├── geofisica/
│   ├── spt/
│   ├── rotativa/
│   ├── insar/
│   ├── lidar/
│   ├── digital-twin/ # viewer Cesium + server Python (referência)
│   ├── relatorios/
│   └── rtk/
├── components/       # UI partilhada
├── services/         # Clientes API
├── hooks/            # ex.: use-module-nav
├── lib/              # Prisma, auth, utilitários
├── layouts/          # Suspense / shells
└── pages/            # Componentes de página (lazy loading)
```

## Módulos e permissões

- **Empresa:** `EmpresaModulo` (`lib/modulos-plataforma.ts`)
- **Obra:** modulos JSON na obra (`lib/modulos-projeto.ts`)
- **Sidebar:** `hooks/use-module-nav.ts` + grupo Digital Twin em `lib/digital-twin-nav.ts`
- **Registo central:** `modules/registry.ts`

## Cesium (code splitting)

Carregado **apenas** em:

- `/digital-twin`
- `/digital-twin/insar`
- `/digital-twin/lidar`

Via `dynamic()` + `Suspense` em `modules/digital-twin/components/CesiumRouteShell.tsx`.

Assets: `public/cesium/` (gerados por `npm run postinstall`).

## API

| Prefixo | Função |
|---------|--------|
| `/api/*` | Negócio (Prisma, auth, obras, sondagem) |
| `/api/geo/v1/*` | Geoespacial (InSAR, LiDAR, alertas) |

Código Python de referência: `src/modules/digital-twin/server/` (portar para Route Handlers ou ligar `GEO_DATABASE_URL`).

## Pastas legadas (não usar em dev)

- `api-core/`, `api-geospatial/`, `nginx/`, `digital-twin/frontend/` — substituídos por este monólito.

## Comandos

```bash
cd app-web
npm install
npm run dev          # http://localhost:3000
npm run android:live # APK → :3000
```
