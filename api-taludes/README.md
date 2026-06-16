# API Taludes — Monitoramento temporal de taludes

FastAPI + OpenCV + Rasterio + GDAL (via rasterio).

## Instalação

```bash
cd api-taludes
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Executar

```bash
uvicorn app.main:app --reload --port 8010
```

Documentação: http://localhost:8010/docs

## Variáveis

| Variável | Default |
|----------|---------|
| `DATA_DIR` | `./data` |
| `CORS_ORIGINS` | `http://localhost:3000` |
| `UNET_WEIGHTS_PATH` | (opcional) pesos PyTorch U-Net |

## Endpoints

- `POST /surveys/upload` — GeoTIFF ortofoto ou DSM
- `GET /surveys` — listar levantamentos
- `POST /analysis/compare` — pipeline completo
- `GET /analysis/jobs/{job_id}` — resultado
- `GET /outputs/{job_id}/heatmap.png` — ficheiros gerados

## Pipeline

1. Reprojeção e downsample
2. Alinhamento ECC
3. Diferença RGB + heatmap
4. Optical Flow Farneback + vetores
5. DSM difference (opcional)
6. Segmentação instável (classical / U-Net)
7. Pontos de risco (baixo/médio/alto)
8. Export GeoJSON, GeoTIFF, LAS, OBJ

## IA avançada

Para U-Net e Detectron2, instale PyTorch e coloque pesos em `UNET_WEIGHTS_PATH`.
