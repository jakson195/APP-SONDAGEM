# DataGeo — Motor Geofísico (FastAPI)

Inversão 2D ERT (dipolo-dipolo): **pyGIMLi** (padrão), **ResIPy/R2** (opcional), **SimPEG** (opcional) ou motor **legacy** FDM/FEM interno.

- `pip install -r requirements-pygimli.txt` — pyGIMLi
- `pip install -r requirements-resipy.txt` — ResIPy (R2, Windows)
- `pip install -r requirements-simpeg.txt` — SimPEG + discretize
- Ver `docs/PYGIMLI_ENGINE.md` e `docs/RESIPY_ENGINE.md`

## Prioridade RES2DINV (o que mais importa)

| Ordem | Componente | Motor DataGeo | Notas |
|-------|------------|---------------|-------|
| 1 | **Forward FDM Poisson** | `fdm_forward.py` | Caminho principal; FEM é experimental e lento |
| 2 | **Jacobiana real** | `jacobian_adjoint.py` + fallback FD | Adjoint com mesma calibração ρa que o forward; FD se instável |
| 3 | **Inversão log + GN** | `invert_2d.py` | m = log₁₀(ρ) [Ω·m]; σ = 10^(−m); GN com busca em linha |
| 4 | **L1 robusta** | `robust_l1` + IRLS | Outliers; preset «Estilo RES2DINV» na UI |
| 5 | **Regularização anisotrópica** | `lambda_x`, `lambda_z` | λ_z >> λ_x → camadas horizontais |
| 6 | **Damping adaptativo** | Occam `lambda_decay` ou `min_improvement` | Occam reduz λ até χ² alvo; L1/L2 param por ganho relativo |
| 7 | **Topografia** | `mesh.py` + painel topografia | Malha colapsa células acima do relevo |
| 8 | **Suavização visual** | Só na exibição (0 passes) | Não confundir com regularização da inversão |

**Não usar** o motor *proxy* (matriz G gaussiana) para comparar com RES2DINV.

## Local

```bash
cd python-engine/geophysics
pip install -r requirements.txt
uvicorn main:app --reload --port 8092
```

Na raiz do Next.js (`app-web`):

```bash
npm run geophysics:engine
```

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/v1/geophysics/health` | Health check |
| POST | `/api/v1/geophysics/invert/2d` | Inversão 2D FDM/FEM |

Documentação interactiva: `http://127.0.0.1:8092/docs`

## Parâmetros de inversão (destaques)

| Campo | Valores | Descrição |
|-------|---------|-----------|
| `forward_model` | `fdm` \| `fem` | Poisson FDM 5-pt ou FEM triangular P1 |
| `jacobian_mode` | `adjoint` \| `fd` | Adjoint só com FDM; FEM usa FD |
| `use_adaptive_mesh` | bool | Refina em eletrodos e superfície |
| `target_chi2` | float \| null | Alvo Occam (default = nd) |
| `chi2_tolerance` | float | Tolerância relativa (default 5%) |

## Deploy Fly.io

```bash
cd python-engine/geophysics
fly launch --name datageo-geophysics --region gru --no-deploy
fly deploy
fly secrets set ALLOWED_ORIGINS=https://seu-dominio.vercel.app
```

URL pública: `https://datageo-geophysics.fly.dev`

## Deploy Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Root directory: `python-engine/geophysics`
3. Railway detecta `Dockerfile` ou `railway.toml`
4. Porta: **8092**

## Vercel (Next.js)

Defina em **Project → Settings → Environment Variables**:

```env
GEOPHYSICS_ENGINE_URL=https://datageo-geophysics.fly.dev
```

Opcional (chamadas client-side volume 3D):

```env
NEXT_PUBLIC_GEOPHYSICS_ENGINE_URL=https://datageo-geophysics.fly.dev
```

Redeploy da Vercel após alterar variáveis.

## Variáveis de ambiente (motor)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `PORT` | 8092 | Porta HTTP (Fly/Railway injectam) |
| `ALLOWED_ORIGINS` | `*` | CORS origins (comma-separated) |
