# Digital Twin — Ortofotos T0/T1

App Next.js (App Router + TypeScript + Tailwind) para comparar ortofotos GeoTIFF com Mapbox, heatmap de mudanças e pontos GeoJSON automáticos.

> Criado em `digital-twin-app/` porque já existe um módulo legado `digital-twin/` (Vite/Cesium) no monorepo.

## Estrutura

```
digital-twin-app/
  app/                 # Next.js App Router
  components/          # MapboxMap, GeoTiffUpload, BeforeAfterSlider
  backend/             # compare.py (Python)
  uploads/             # T0.tif, T1.tif, output/
  public/
```

## 1. Configurar ambiente

```bash
cd digital-twin-app
cp .env.example .env.local
```

Edite `.env.local`:

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.seu_token
```

Token em: https://account.mapbox.com/access-tokens/

## 2. Frontend

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## 3. Backend Python

```bash
cd backend
pip install -r requirements.txt
```

Requisitos: `ffmpeg` não é obrigatório para ortofotos; o script usa `rasterio`, `opencv-python`, `numpy`, `geopandas`, `shapely`.

Opcional no `.env.local`:

```
PYTHON_BIN=python
```

## Fluxo

1. Upload **T0** e **T1** (GeoTIFF) → guardados em `uploads/`
2. Preview no browser + camadas raster no mapa Mapbox satélite
3. Botão **Comparar** → executa `backend/compare.py`
4. Saída em `uploads/output/`:
   - `diff.tif` — diferença
   - `heatmap.tif` / `heatmap.png` — heatmap
   - `points.geojson` — pontos com intensidade e risco
5. Mapa exibe heatmap + pontos com popup
6. Slider before/after entre T0 e T1

## API

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/upload` | POST | Upload T0 ou T1 (`slot`, `file`) |
| `/api/compare` | POST | Executa comparação Python |
| `/api/files/output/heatmap.png` | GET | Heatmap gerado |
