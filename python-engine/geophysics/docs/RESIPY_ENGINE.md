# Motor ResIPy (R2)

Inversão 2D ERT via [ResIPy](https://resipy.org/) — wrapper Python do código **R2** (Andrew Binley, Lancaster).

## Instalação

### Opção A — pasta local (recomendado neste PC)

Pasta com R2.exe + `cext` (ex.: `C:\Users\jakso\Downloads\resipy-3.6.6\resipy-3.6.6`):

```powershell
cd app-web
npm run geophysics:install-resipy
```

Cria `.venv-geophysics` com **Python 3.12** e instala ResIPy em modo editable (`pip install -e`).

### Opção B — PyPI

```bash
cd app-web/python-engine/geophysics
pip install -r requirements-resipy.txt
```

**Requisitos:**

| Ambiente | Suporte |
|----------|---------|
| Windows + Python 3.10–3.12 | Recomendado (R2 nativo) |
| Python 3.14 | **Não** — sem wheel `cext` cp314 |
| numpy | **&lt; 2.0** (obrigatório para wheels `cext`) |
| Linux / macOS | R2 via **Wine** (deploy servidor difícil) |

O motor `npm run geophysics:engine` usa automaticamente `.venv-geophysics\Scripts\python.exe` se existir.

## API

```json
{
  "invert_engine": "resipy",
  "method": "blocky_l1",
  "readings": [...]
}
```

Variável de ambiente (padrão global):

```bash
GEOPHYS_INVERT_ENGINE=resipy
```

## Mapeamento UI → R2

| `MethodId` | R2 `inverse_type` |
|------------|-------------------|
| `least_squares` | 0 — L2 suave |
| `occam` | 1 — Occam |
| `gauss_newton` | 2 — Gauss-Newton |
| `smoothness` | 0 — L2 (λ elevado) |
| `robust_l1` | 3 — robusta |
| `blocky_l1` | 4 — blocky |
| `hybrid` | 3 — robusta |

Definição: `services/inversion/method_map.py` (`RESIPY_METHOD`).

## Fallback

Se ResIPy não estiver instalado ou a inversão falhar, o dispatcher tenta **pyGIMLi** e depois **legacy FDM**.

## Health

`GET /api/v1/geophysics/health` devolve `engines.resipy: true|false`.
