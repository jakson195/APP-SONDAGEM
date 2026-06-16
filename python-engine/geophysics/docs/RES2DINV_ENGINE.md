# Inversão 2D RES2DINV (`res2dinv_solver`)

Núcleo: `services/inversion/res2dinv_solver.py`

## Formulação

| Componente | Implementação |
|------------|----------------|
| Parâmetro | `m = ln(ρ)` [Ω·m] |
| Dados | `d = log₁₀(ρa)` |
| Forward | FDM Poisson 2D ou FEM P1 — físico, sem escala artificial em log |
| Jacobiana | `J = ∂d/∂m` — diferenças finitas (sensibilidade real) |
| GN + smoothness | `(JᵀJ + λ WmᵀWm + μI) Δm = Jᵀ(d_obs − d_calc)` |
| Regularização espacial | `λ_x` (horizontal) + `λ_z` (vertical), separados |
| λ adaptativo | `adaptive_lambda.py` — reduz λ até RMS/χ² alvo |
| Amortecimento LM | `adaptive_damping.py` — μ adaptativo na diagonal |
| Robusta | `robust_l1`, `blocky_l1` — IRLS L1 em dados e/ou ∇m |
| Actualização | `m_new = m_old + α·Δm` (α=1 GN; line search opcional) |
| Heterogeneidade | λ baixo, J sem normalização artificial, forward sem amp_scale |

## Métodos

- `blocky_l1` — **padrão** — IRLS L1 em ∇m, contraste geológico (RES2DINV)
- `robust_l1` — IRLS L1 nos resíduos de dados
- `gauss_newton` / `smoothness` — redireccionados para `blocky_l1` no motor físico
- `occam` — λ por χ²
- `hybrid` — mistura L2/L1

## API

```json
{
  "invert_engine": "legacy",
  "method": "blocky_l1",
  "params": {
    "forward_model": "fdm",
    "jacobian_mode": "fd",
    "lambda_reg": 0.0003,
    "lambda_x": 0.0004,
    "lambda_z": 0.0012,
    "adaptive_lambda": true,
    "reg_normalize_mesh": false
  }
}
```

## UI

- Motor **Físico (FDM)** — células discretas, sem `fem_smooth`
- Colormap **RES2DINV** — azul (condutivo) → vermelho (resistivo)
- Pseudoseção observada vs calculada (`y_obs_log10`, `y_syn_log10`)

## Teste

```bash
cd app-web/python-engine/geophysics
python scripts/test_layer_invert.py
```
