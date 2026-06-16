# DataGeo Digital

Monólito modular — uma app Next.js na **porta 3000**.

## Desenvolvimento

```bash
cd app-web
npm install
npm run dev
```

Abrir http://localhost:3000

Documentação da arquitetura: [app-web/ARCHITECTURE.md](app-web/ARCHITECTURE.md)

## Docker (opcional)

```bash
docker compose up -d postgres-core
docker compose --profile geo up -d   # PostGIS para Digital Twin
docker compose up -d app             # build + :3000
```

## Pastas legadas

`api-core/`, `api-geospatial/`, `nginx/`, `digital-twin/frontend/` — não usar; ver ficheiros `DEPRECATED.md`.
