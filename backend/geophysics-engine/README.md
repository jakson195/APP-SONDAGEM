# Geophysics Engine (`backend/geophysics-engine`)

Motor **ERT 2D nativo** em FastAPI (:8092): FDM Poisson, Jacobiana adjoint, Gauss-Newton com L2 / L1 IRLS / Occam. API legada DataGeo em `/api/v1/geophysics/invert/2d`.

## Instalação e arranque

```bash
cd backend/geophysics-engine
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8092 --reload
```

Alternativas:

```bash
python server.py
```

A partir de `app-web`:

```bash
npm run geophysics:engine
```

Testar health:

```bash
curl http://localhost:8092/health
```

Exemplo `POST /invert`:

```json
{
  "data": [
    { "a": -15, "b": 25, "m": 0, "n": 5, "pa": 120.5 },
    { "a": -10, "b": 20, "m": 5, "n": 10, "pa": 98.3 }
  ],
  "method": "gauss_newton",
  "lambda_reg": 10.0,
  "max_iter": 10,
  "convergence": 0.05,
  "electrode_spacing": 5.0
}
```

Métodos: `gauss_newton` / `l2` (Tikhonov suave), `blocky_l1` / `blocky` (L1 IRLS), `occam` (λ decrescente).

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do motor |
| POST | `/invert` | Inversão ERT `{a,b,m,n,pa}` → grade ρ(x,z) |
| POST | `/api/v1/geophysics/invert/2d` | API DataGeo (frontend) |
| POST | `/mesh` | Malha + cobertura |
| POST | `/forward` | Forward FDM |
| POST | `/pseudosection` | Pontos pseudoseção ρa |

Legado (frontend actual): `/api/v1/geophysics/health`, `/api/v1/geophysics/invert/2d`

## Pipeline

1. Importar dados → pseudoseção
2. Filtros / edição outliers
3. Malha (pyGIMLi `createParaMesh` ou grelha interna)
4. Forward FDM + Jacobiana
5. Regularização + inversão iterativa (pyGIMLi `ERTManager.invert` / ResIPy R2)
6. Pós-processo: `clamp(ρ)`, crop corners, contour smooth

## Módulos

| Ficheiro | Função |
|----------|--------|
| `server.py` | FastAPI :8092 |
| `engine.py` | Motor FDM + Jacobiana + Gauss-Newton (API ERT) |
| `fdm_core.py` | Poisson FDM, ρa, Jacobiana FD/adjoint |
| `invert.py` | Dispatcher inversão real |
| `mesh.py` | Malha + pyGIMLi paraMesh |
| `forward.py` | Forward Poisson FDM |
| `jacobian.py` | Jacobiana adjoint/FD |
| `regularization.py` | Matriz L2 anisotrópica |
| `postprocess.py` | clamp, crop, gaussian+griddata |

O código de inversão física reutiliza `app-web/python-engine/geophysics/services/inversion/`.
