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

## Recommended Next Commits

Browser walkthrough in Scenario 5 showed Phase 10 is currently **math-core ready, UI-not-ready**. Prioritize UI integration before adding more theory surface.

1. `feat(phase10): add MPC UI panel`
2. `feat(phase10): add robust sensitivity UI`
3. `feat(phase10): add dynamic decoupler UI`

Then continue:

4. `test(phase10): add robust edge-case fixtures`
5. `feat(phase10): add gain-phase uncertainty sweep`

Do not start Teaching Mode, Electron packaging, or Report Template until explicitly resumed.
