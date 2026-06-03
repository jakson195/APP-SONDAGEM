# Inversão 2D ERT — Gauss-Newton regularizado (DataGeo Digital)

## Formulação

Minimizar o funcional (dados em log₁₀ ρₐ):

\[
\Phi(\mathbf{m}) = \|\mathbf{d}^{obs} - \mathbf{d}^{calc}(\mathbf{m})\|^2 + \lambda \|\mathbf{R}\,\mathbf{m}\|^2
\]

com \(\mathbf{m} = \log_{10}(\rho)\) por célula da malha 2D.

## Passo Gauss-Newton

Em cada iteração resolve-se o sistema normal:

\[
(\mathbf{J}^T \mathbf{W} \mathbf{J} + \lambda \mathbf{R}) \,\Delta\mathbf{m} = \mathbf{J}^T \mathbf{W}\,(\mathbf{d}^{obs} - \mathbf{d}^{calc})
\]

e actualiza-se:

\[
\mathbf{m}_{k+1} = \mathbf{m}_k + \Delta\mathbf{m}
\]

(método `gauss_newton` — passo completo; `blocky_l1` / `robust_l1` usam busca em linha com passo mínimo forçado).

## Implementação (`services/inversion/invert_2d.py`)

| Etapa | Função |
|--------|--------|
| Forward FDM | `forward_log10_raw` + escala fixa (`invert_forward.py`) |
| Jacobiana | `resolve_jacobian` (FD ou adjoint) |
| Regularização L2 | `roughness_matrix_anisotropic` |
| Blocky L1 | `blocky_reg_irls_matrix` (IRLS em ∇m) |
| Resolver GN | `_solve_normal` |
| Actualização | `_gauss_newton_update` ou `_line_search_update` |

## Parâmetros críticos

- **λ** (`lambda_reg`): 0.01–0.1 para contraste; valores altos → modelo homogéneo.
- **λ_x / λ_z**: menor λ_x = mais contraste lateral; λ_z moderado (0.05–0.15).
- **apply_coverage_mask**: `false` por defeito (malha adaptativa com todas as células activas).
- **trust_region_alpha**: passo mínimo (0.35) se a busca em linha rejeitar todos os α.

## Calibração K (dipolo-dipolo)

- **K** = π·a·n·(n+1)·(n+2) — igual ao `geometricFactorDipoloDipolo` no TypeScript.
- **ρa** = k₂d · K · |ΔV| / **I** (volts e **amperes**; equivalente a K·|ΔV_mV|/I_mA).
- **k₂d** estimado no início da inversão (meio uniforme com ρ mediana observada).
- **scale_inv** residual em `invert_forward` (~1) após k₂d.

## Diagnóstico

```bash
cd app-web/python-engine/geophysics
set GEOPHYS_INVERT_DEBUG=1
python scripts/test_layer_invert.py
python scripts/diagnose_inversion.py
```

Logs por iteração: `||dm||`, `dm.min/max`, `J cond`, `||Δy_syn||`, `rho_syn min/max`, `rms%`.

## Teste sintético obrigatório

Duas camadas: 100 Ω·m (superior) / 3000 Ω·m (inferior). O teste `test_layer_invert.py` deve dar `ratio > 5` e `std(rho) > 50`.
