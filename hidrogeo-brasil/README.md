# HidroGeo Brasil

Mapa interativo 3D do Brasil — estilo Google Earth — com hidrografia ANA e geologia (CPRM, fases seguintes).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React + Vite + Deck.gl + Mapbox GL + Tailwind |
| Backend | FastAPI + GeoPandas |
| Dados | PostgreSQL + PostGIS |
| Tiles | pg_tileserv (MVT) |

## Quick start

### 1. Infra (PostGIS + pg_tileserv + API)

```bash
cd hidrogeo-brasil/infra
docker compose up -d postgis pg_tileserv
```

Aguarde o PostGIS inicializar (~10 s).

### 2. Ingestão (PostGIS a correr)

```bash
cd hidrogeo-brasil/backend
pip install -r requirements.txt
set DATABASE_URL_SYNC=postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo
python ingestion/ana_hydro.py
python ingestion/cprm_geology.py
```

### 3. API

```bash
cd hidrogeo-brasil/backend
uvicorn app.main:app --reload --port 8010
```

Ou via Docker: `docker compose up api` (em `infra/`).

Tiles MVT: http://localhost:7800/index.html

### 4. Frontend

```bash
cd hidrogeo-brasil/frontend
copy .env.example .env.local
# Edite VITE_MAPBOX_TOKEN=pk...
npm install
npm run dev
```

Abrir http://localhost:5175/hidrogeo-viewer/

### Ingestão hidrologia (HydroRIVERS + lagos + bacias)

```bash
cd hidrogeo-brasil/backend
set DATABASE_URL_SYNC=postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo
python ingestion/hydro_ingest.py
```

Fontes: **HydroRIVERS** (rios/córregos), **HydroBASINS** (bacias e regiões), **Natural Earth** (lagos).  
Demora ~5–10 min na primeira vez (download ~100 MB).

### Ingestão geologia CPRM/SGB (litologia real)

```bash
cd hidrogeo-brasil/backend
set DATABASE_URL_SYNC=postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo
python ingestion/cprm_geology.py
```

Fonte: WFS GeoSGB `geosgb:litoestratigrafia_1m` (~46 mil polígonos).  
Escala mais detalhada: `set CPRM_LITHO_SCALE=250k` antes do comando.

Clique no mapa → painel descreve a geologia do local (CPRM/SGB).

### Limites administrativos IBGE (estados e municípios)

```bash
cd hidrogeo-brasil/backend
set DATABASE_URL_SYNC=postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo
python ingestion/ibge_admin.py
```

Fonte: malha municipal IBGE 2022 (27 UFs + ~5 570 municípios).

### Mineração ANM (SIGMINE)

```bash
cd hidrogeo-brasil/backend
set DATABASE_URL_SYNC=postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo
python ingestion/anm_sigmine.py
```

Fonte: [dadosabertos.anm.gov.br/SIGMINE](https://dadosabertos.anm.gov.br/SIGMINE/) — processos minerários (~267 mil), proteção de fonte, bloqueios, reservas garimpeiras e arrendamentos.

## Estrutura

```
hidrogeo-brasil/
├── frontend/          # Deck.gl + Mapbox 3D
├── backend/           # FastAPI + ingestão
├── data/seed/         # GeoJSON rios principais (MVP)
├── data/scripts/      # init.sql PostGIS
└── infra/             # docker-compose
```

## Funcionalidades (v0.2)

- **Litologia CPRM** — MVT + seed/WFS + popup completo
- **Medição** — distância e área (Turf.js)
- **Exportação** — GeoJSON / KML / Shapefile por polígono
- **Animação vazão** — cores mensais por bacia (índice ANA simulado)

## Fases seguintes

- [ ] EMBRAPA solos, IBGE risco, RSBR sismicidade
- [ ] Perfil de elevação (Mapbox DEM)
- [ ] Dados ANA TelemetriaWS em tempo real no popup

## Variáveis

| Variável | Descrição |
|----------|-----------|
| `VITE_MAPBOX_TOKEN` | Token Mapbox (opcional — sem token usa satélite Esri gratuito) |
| `DATABASE_URL_SYNC` | Postgres para ingestão |
| `TILESERV_URL` | URL pg_tileserv (default :7800) |
