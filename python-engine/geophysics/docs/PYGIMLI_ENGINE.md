# Motor pyGIMLi (padrão) vs legacy FDM

## Arquitectura

| Motor | Ficheiro | Quando |
|-------|----------|--------|
| **pyGIMLi** (padrão) | `pygimli_invert.py` | Emula RES2DINV (GN + L2/L1) |
| **legacy FDM/FEM** | `legacy_fdm_invert.py` | `invert_engine=legacy` ou FEM ou pyGIMLi indisponível |

Dispatcher: `invert_2d.py` → `run_invert_2d()`.

## Instalação pyGIMLi

```bash
# Linux / macOS
pip install pygimli

# Windows (recomendado)
conda install -c gimli pygimli
```

Opcional: `pip install -r requirements-pygimli.txt`

## Variável de ambiente

```bash
GEOPHYS_INVERT_ENGINE=pygimli   # padrão
GEOPHYS_INVERT_ENGINE=legacy    # só motor interno
```

## Mapeamento UI → pyGIMLi

| `MethodId` (dipolo-dipolo) | pyGIMLi |
|----------------------------|---------|
| `gauss_newton` | L2 suave, λ base |
| `smoothness` | L2, λ × 1.2 |
| `blocky_l1` | L2 blocky + dados robustos |
| `robust_l1` | Dados robustos |
| `occam` | λ elevado (estilo Occam) |
| `least_squares` | λ baixo |
| `hybrid` | Robusto + λ médio |

Definição: `services/inversion/method_map.py`.

## API

```json
{
  "invert_engine": "pygimli",
  "method": "gauss_newton",
  "readings": [...]
}
```

## Testes

```bash
python scripts/test_layer_invert.py
python scripts/benchmark_invert_engines.py
```

## Comparação RES2DINV

Exporte o mesmo `.dat` do RES2DINV e compare RMS% e mapas com `benchmark_invert_engines.py` (suporte `.dat` planeado).
