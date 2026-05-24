# ControlStudio Phase 10 Plan

Phase 10 focuses on advanced-control reliability before adding broad product features. Current instruction: keep Teaching Mode, Electron packaging, and Report Template paused.

## Scope

### Active Track

1. Schur / Hamiltonian CARE solver
2. MPC baseline
3. Dynamic Decoupler prototype
4. Robust Control scope design

### Paused Track

1. Teaching Mode
2. Electron packaging
3. Report Template / report automation
4. Block Diagram expansion

## Phase 10.1: Schur / Hamiltonian CARE Solver

Status: Done

Purpose:

- Replace Newton-Kleinman as the only practical LQR/LQE path.
- Support marginally stable and unstable plants when the Hamiltonian stable invariant subspace is well-conditioned.
- Resolve the Spacecraft scenario limitation where Bass method cannot stabilize sparse rank-2 actuation.

Mathematical basis:

```text
A'P + PA - PBR^-1B'P + Q = 0

H = [ A       -BR^-1B' ]
    [ -Q      -A'      ]

stable invariant subspace of H:
H [X] = [X] Λs,  Re(Λs) < 0
  [Y]   [Y]

P = Y X^-1
K = R^-1 B'P
Acl = A - BK
```

Implementation:

- `solveCareHamiltonianSchur(A, B, Q, R)` added in `control-studio/js/control/state-feedback.js`.
- `solveLqr()` and `solveLqrMIMO()` now try Hamiltonian CARE first, then fall back to Newton-Kleinman unless `method: 'schur'` is requested.
- The implementation uses Hamiltonian eigenvector invariant subspace instead of a full real Schur decomposition to keep ControlStudio dependency-free.

Verification:

- Scalar unstable CARE analytic solution.
- SISO second-order analytic LQR solution.
- MIMO diagonal analytic LQR solution.
- Spacecraft-style marginally stable MIMO plant with sparse actuation.
- CARE residual and closed-loop Lyapunov proof.
- Dedicated runner: `node control-studio/scripts/verify_phase10_math_core.mjs`.

Known limits:

- Dependency-free eigenvector extraction is intended for low-order ControlStudio models.
- A production-grade implementation should eventually use a real Schur decomposition or delegate to SciPy / Python Control through the API backend.

## Phase 10.2: MPC Baseline

Status: Done

Implemented scope:

- Discrete state-space model only.
- Finite prediction horizon.
- Quadratic stage cost:

```text
J = Σ x_k'Qx_k + u_k'Ru_k
```

- Unconstrained finite-horizon Riccati recursion.
- Receding-horizon first-action calculation.
- Closed-loop simulation helper.
- Constraint UI and QP solver remain deferred.

Implementation:

- `control-studio/js/control/mpc.js`
- `finiteHorizonLqr(Ad, Bd, Q, R, horizon, Qf)`
- `firstMpcAction(Ad, Bd, Q, R, horizon, x, Qf)`
- `simulateUnconstrainedMpc(Ad, Bd, Q, R, horizon, x0, options)`

Verification:

- Scalar integrator hand-derived horizon-2 Riccati recursion:
  - `P2=1`
  - `K1=0.5`
  - `P1=1.5`
  - `K0=0.6`
- First action for `x0=1` equals `u0=-0.6`.
- Receding-horizon scalar simulation converges.
- Invalid horizon guard.
- Dedicated runner: `node control-studio/scripts/verify_phase10_math_core.mjs`.

## Phase 10.3: Dynamic Decoupler Prototype

Status: Done

Implemented scope:

- Start with 2x2 stable proper MIMO transfer-function channels.
- Compute frequency-specific decoupler at selected crossover frequency:

```text
W(jωc) = G(jωc)^-1
```

- Display residual coupling magnitude:

```text
G(jωc)W(jωc) ≈ I
```

Implementation:

- `dynamicDecouplerAtFrequency(mimoSys, omega)` in `control-studio/js/control/mimo.js`.
- Returns complex `G(jωc)`, complex `W(jωc)`, verification matrix, off-diagonal residual, and diagonal deviation.

Deferred:

- Full polynomial-matrix dynamic inversion.
- Non-minimum phase / unstable inverse handling.
- Robust dynamic decoupling.

Verification:

- Static-coupled tank case should match static decoupler near DC.
- Frequency-coupled case should reduce off-diagonal magnitude at selected `ωc`.
- Singular or ill-conditioned `G(jωc)` must produce contextual error.
- Dedicated runner: `node control-studio/scripts/verify_phase10_math_core.mjs`.

## Phase 10.4: Robust Control Scope Design

Status: Done

Implemented scope:

- Sensitivity functions:

```text
S = 1 / (1 + L)
T = L / (1 + L)
KS = K / (1 + L)
```

- Robustness indicators:
  - peak `|S|`
  - peak `|T|`
  - peak `|KS|`
  - low / medium / high risk classification from peak sensitivity

Implementation:

- `control-studio/js/control/robust.js`
- `sensitivityAt(loopTf, omega, controllerTf)`
- `sensitivityBode(loopTf, omegas, controllerTf)`
- `robustPeaks(loopTf, omegas, controllerTf)`

Deferred:

- H∞ synthesis
- μ-synthesis
- structured uncertainty model
- disk-margin style warning
- gain/phase uncertainty sweep

Verification:

- Stable low-pass loop: `L(s)=1/(s+1)`.
- DC identities: `S(0)=0.5`, `T(0)=0.5`.
- `KS(0)` with `K=2` equals `1`.
- Singular `1+L=0` guard.
- Dedicated runner: `node control-studio/scripts/verify_phase10_math_core.mjs`.

## Phase 10.5: UI Integration

Status: Done (commit `f945ced`)

Implemented：

- `#mpc-panel` in Advisor — Ts / horizon / Q / R / x₀ → `simulateUnconstrainedMpc` → Plotly x(t), u(t)。
  - SISO 用 `tfToControllableCanonical(num, den)` 取 SS。
  - MIMO 直接吃 `state.mimoPlant.{A,B,C,D}`。
  - ZOH 離散化重用 `discretizeZOH(A, B, Ts)`。
- `#robust-panel` in Advisor — ω 範圍 → `sensitivityBode(L)` → |S| / |T| / |KS| 三條疊圖 + peak table。
  - SISO only。MIMO 模式拋友善錯誤。
  - Risk badge color：low (<1.8) / medium (1.8-2.5) / high (>2.5)。
- Dynamic Decoupler subsection in `#mimo-analysis-panel` — ωc → `dynamicDecouplerAtFrequency` → 顯示 G(jωc), W(jωc), off-diagonal residual + 提醒「這是 selected-frequency inverse，不是 polynomial decoupler」。
- `autoResizePhase8MatricesForMIMO` 擴充涵蓋 `mpc-q`, `mpc-r`, `mpc-x0`。

Verification：

- `test_control.js` 「Phase 10 UI integration smoke」區塊：
  - MPC integrator 從 x₀=1 收斂到 final ‖x‖∞ < 0.5。
  - Robust peak ≈ 1 for stable `L(s)=1/(s+1)`，risk=low。
  - Diagonal MIMO dynamic decoupler off-diagonal ≈ 0。
- 瀏覽器手動驗證（plant `1/(s²+3s+2)`）：
  - MPC J=12.85，‖x‖∞ 從 1 收斂到 0.10，u₀=−0.0852。
  - Robust peak |S|=1.05 (0.42 dB) @ ω=2.25 rad/s，Risk=LOW。
  - 2×2 coupled plant (B=[[1,0.8],[0.6,1]]) Dynamic Decoupler @ ω=1：residual=0。

## Recommended Next Commits

Phase 10 主線（10.1-10.5）完成；後續為深化工作：

1. `test(phase10): add robust edge-case fixtures` — marginally stable loop、resonance peak 系統、Pade approximant 延遲系統。
2. `feat(phase10): add gain-phase uncertainty sweep` — 對 K 或 phase shift 做 ±X% 掃描，計算 worst-case sensitivity。
3. `feat(phase10): add MPC constraint UI` — 加入 input/state hard constraint 與 QP solver baseline。

Do not start Teaching Mode, Electron packaging, or Report Template until explicitly resumed.
