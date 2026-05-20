# ControlStudio Development Roadmap

> Last updated: 2026-05-21
> Current committed baseline: `15329fe feat(p24): complete advanced MPC controllers`
> Scope: this is the canonical execution roadmap for ControlStudio implementation status.
> Do not use this file for product vision, proof derivations, or handoff notes; see the document workflow below.

## Document Workflow

| Document | Role | Update when |
| --- | --- | --- |
| `control-studio/ROADMAP.md` | Canonical execution board: phase status, next actions, verification commands | Any phase item changes status, or a new implementation phase starts |
| `CONTROL_SYSTEM_PLAN.md` | Product / architecture plan and high-level capability inventory | A user-visible capability, architecture direction, or major risk changes |
| `CONTROL_SYSTEM_BACKLOG.md` | Detailed task ledger with IDs, dependencies, and verification evidence | A backlog item moves between Planned / In Progress / Done / Paused |
| `CONTROL_SYSTEM_SKILLS_PLAN.md` | Agent skill decomposition and workflow boundaries | A skill is added, retired, or changes scope |
| `CONTROL_SYSTEM_VERIFICATION_CASES.md` | Mathematical proof and golden verification cases | A benchmark or expected numeric result changes |
| `CONTROL_SYSTEM_SCENARIOS.md` | Realistic engineering walkthroughs and UI findings | Browser workflow, scenario issue, or field-use note changes |
| `AGENT_CONTINUATION.md` | Current handoff / operational snapshot | Before switching agents or after a meaningful checkpoint |

## Required Development Workflow

1. Run `git status --short` and classify dirty files before editing.
2. Read `control-studio/ROADMAP.md`, `CONTROL_SYSTEM_PLAN.md`, `CONTROL_SYSTEM_BACKLOG.md`, and `AGENT_CONTINUATION.md`.
3. If a workflow can become reusable agent behavior, check `CONTROL_SYSTEM_SKILLS_PLAN.md` before coding.
4. Implement the smallest phase slice that can be verified independently.
5. Add or update a deterministic verification script for every math/control feature.
6. For UI work, run a browser walkthrough against `http://127.0.0.1:8765`.
7. Sync affected docs in this order: roadmap → backlog → plan → skills/scenarios/verification cases → continuation.
8. Commit with both a subject and body, for example:
   ```bash
   git commit -m "feat(p24): add economic MPC baseline" \
     -m "Implement deterministic EMPC optimization and verification fixtures." \
     -m "Sync roadmap and continuation docs with the new Phase 24 status."
   ```
9. Do not commit `node_modules/`, scratch files, `.env*`, keys, local databases, or handoff files.

## Progress Overview

| Phase | Theme | Status | Verification |
| --- | --- | --- | --- |
| P9 | Math core: polynomial / complex / Schur | Done | `verify_phase9_*.mjs` |
| P10 | CARE / LQR / MPC baseline | Done | `verify_phase10_*.mjs` |
| P11 | DARE / MIMO / dynamic RGA | Done | `verify_phase11_*.mjs` |
| P14 | Delay / IMC / RNG | Done | `verify_p14_*.mjs` |
| P15 | ARX system identification | Done | `verify_p15_sysid.mjs` |
| P16 | GA tuning / H∞ Nelder-Mead | Done | `verify_p16_*.mjs` |
| P17 | ARMAX / NSGA-II / EKF-UKF / advanced robust baseline | Done | `verify_p17_*.mjs` |
| P18 | Monte Carlo robust validation + UI + skill | Done | `verify_p18_robust_validation.mjs` |
| P19 | H∞ Riccati synthesis baseline | Done | `verify_p19_hinf_riccati.mjs` |
| P20 | MPC engineering: offset-free, move suppression, feasibility | Done | `verify_p20_mpc_engineering.mjs` |
| P21 | Advanced SysID: OE / BJ / subspace / experiment signals | Done | `verify_p21_sysid_advanced.mjs` |
| P22 | Verification infrastructure / cross-tool regression / CI | Done | `run_all_verify.sh`, `compare_python_control.py`, `.github/workflows/ci.yml` |
| P23 | SysID gap closure: FRF, model order, MISO ARX | Mostly Done | `verify_p23_*.mjs` |
| P24 | Advanced MPC: NMPC, EMPC, Tube MPC, Explicit MPC | Done | `verify_p24_nmpc.mjs`, `verify_p24_empc.mjs`, `verify_p24_tube_explicit_mpc.mjs` |
| P25 | Model order reduction: minreal SS + balanced truncation | Mostly Done | `verify_p25_model_reduction.mjs` |
| P26 | Nonlinear control: gain scheduling + SMC | Mostly Done | `verify_p26_nonlinear.mjs` |
| P27 | H∞ extensions: MIMO H∞ verify + loop shaping | Mostly Done | `verify_p27_mimo_hinf.mjs`, `verify_p27_loop_shaping.mjs` |
| P28 | Infrastructure quality: TS definitions + benchmark | Mostly Done | `control-studio/types/control-studio.d.ts`, `benchmark.mjs` |
| **P29** | **Numerical optimization core: QP / LP / SDP-LMI** | In Progress | `verify_p29_qp.mjs` (QP done) |
| **P30** | **Adaptive & learning control: RLS / MRAC / STR / ILC** | Planned | — |
| **P31** | **Estimation & monitoring: MHE / particle filter / FDD / FTC** | Planned | — |
| **P32** | **Advanced nonlinear: feedback linearization / backstepping / CLF-CBF** | Planned | — |
| **P33** | **Productization & interop: codegen / report / python-control bridge** | Planned | — |
| **P34** | **UI/UX experience & design system** | Planned | — |

## Verification Suite Status (2026-05-21)

**38/38 scripts pass** — run via `bash scripts/run_all_verify.sh`

| Group | Scripts | Pass |
| --- | --- | --- |
| Phase 9/10/11 foundations | 11 | 11 |
| Phase 14–27 advanced control | 23 | 23 |
| General math & PID | 4 | 4 |

## Remaining Dirty Worktree

| Path | Classification | Action |
| --- | --- | --- |
| `package.json` | Adds `typescript` devDependency (used for `.d.ts` validation) | Commit if TS type-checking becomes an official CI step |
| `package-lock.json` | Generated lockfile | Commit alongside `package.json` decision |
| `node_modules/` | Generated dependency directory | Never commit (covered by `.gitignore`) |

## Phase Details

### P22 — Verification Infrastructure

| Item | Status | Evidence |
| --- | --- | --- |
| P22-01 CI workflow | Done | `.github/workflows/ci.yml` |
| P22-02 Cross-tool numeric regression | Done | `control-studio/scripts/compare_python_control.py` |
| P22-03 Full verification runner | Done | `control-studio/scripts/run_all_verify.sh` |

### P23 — SysID Gap Closure

| Item | Status | Evidence |
| --- | --- | --- |
| P23-01 Frequency-domain identification | Done | `sysid_freq.js`, `verify_p23_freq_sysid.mjs` |
| P23-02 MISO ARX | Done | `identifyMISOARX`, `verify_p23_miso.mjs` |
| P23-03 Model order selection | Done | `autoModelOrder`, `verify_p23_model_order.mjs` |
| P23-04 Continuous-time identification | Planned | No committed CONTSID / SRIVC runner yet |

### P24 — Advanced MPC

| Item | Status | Evidence |
| --- | --- | --- |
| P24-01 NMPC / SQP-lite | Done | `nmpc.js`, `verify_p24_nmpc.mjs` |
| P24-02 Tube MPC | Done | `tube_mpc.js`, `verify_p24_tube_explicit_mpc.mjs` |
| P24-03 Economic MPC | Done | `empc.js`, `verify_p24_empc.mjs` |
| P24-04 Explicit MPC | Done | `explicit_mpc.js`, `verify_p24_tube_explicit_mpc.mjs` |

### P25 — Model Order Reduction

| Item | Status | Evidence |
| --- | --- | --- |
| P25-01 Balanced truncation | Done | `model_reduction.js`, `verify_p25_model_reduction.mjs` |
| P25-02 Hankel norm approximation | Planned | No committed Hankel runner yet |
| P25-03 SS minreal / Kalman decomposition | Done | `minrealSS`, `verify_p25_model_reduction.mjs` |

### P26 — Nonlinear Control

| Item | Status | Evidence |
| --- | --- | --- |
| P26-01 Gain-scheduled PID | Done | `gainScheduledPID`, `verify_p26_nonlinear.mjs` |
| P26-02 LPV synthesis | Planned | No committed LPV synthesis runner yet |
| P26-03 Sliding mode control | Done | `designSMC`, `verify_p26_nonlinear.mjs` |

### P27 — H∞ Design Extensions

| Item | Status | Evidence |
| --- | --- | --- |
| P27-01 Full D-K iteration | Planned | Current structured μ path remains surrogate / baseline |
| P27-02 Loop-shaping H∞ | Done | `loopShapingHinf`, `verify_p27_loop_shaping.mjs` |
| P27-03 MIMO H∞ verification | Done | `verify_p27_mimo_hinf.mjs` |

### P28 — Infrastructure Quality

| Item | Status | Evidence |
| --- | --- | --- |
| P28-01 TypeScript definitions | Done | `control-studio/types/control-studio.d.ts` |
| P28-02 JSDoc API docs | Planned | No generated `docs/api/` yet |
| P28-03 Performance benchmark | Done | `control-studio/scripts/benchmark.mjs` |

---

# Future Roadmap (P29–P34)

> Strategic blueprint approved 2026-05-21. Sequencing rationale:
> **enabling technology (P29 optimization) → new control paradigms (P30–P32) → productization (P33) → experience (P34)**.
> P29 is the highest-leverage start: a general QP/LP/SDP solver unblocks LPV (P26-02),
> D-K iteration (P27-01), and hardens constrained MPC.

### P29 — Numerical Optimization Core

> **Why:** ControlStudio currently has no general optimizer; MPC constraint handling is an inlined
> simplified routine, and LMI-based methods (LPV, D-K) are blocked. This is the key enabling layer.
> **Benchmark target:** MATLAB `quadprog` / `linprog` / CVX-class problems.

| Item | Goal | API | Effort | Dependency |
| --- | --- | --- | :---: | --- |
| **P29-01 QP solver** ✅ | Convex QP via primal-dual interior-point + direct KKT | `solveQP(H, f, opts)`, `solveEqualityQP`, `solveBoxQP` in `js/math/optimization.js` (`verify_p29_qp.mjs`, 20 tests) | 3d | matrix core |
| P29-02 LP solver | Simplex / interior-point LP | `solveLP(c, A, b, Aeq, beq, lb, ub, opts)` | 2d | P29-01 |
| P29-03 SDP / LMI solver | Projected-gradient / ADMM for small LMIs | `solveLMI(constraints, objective, opts)` | 4d | P29-01 |
| P29-04 Retrofit MPC | Replace inlined QP in `mpc.js` with `solveQP` | (internal) | 1d | P29-01 |
| P29-05 Close LPV (P26-02) | LMI-based LPV synthesis on parameter grid | `synthesizeLPV(grid, opts)` | 3d | P29-03 |
| P29-06 Close D-K (P27-01) | True μ-synthesis: K-step + D-step rational fit | `dkIteration(plant, weights, opts)` | 4d | P29-03 |

### P30 — Adaptive & Learning Control

> **Why:** ControlStudio has rich offline SysID; the natural extension is *online* identification
> and self-adjusting controllers. Entirely new paradigm.
> **Benchmark target:** MATLAB Adaptive Control / self-tuning toolboxes.

| Item | Goal | API | Effort | Dependency |
| --- | --- | --- | :---: | --- |
| P30-01 Recursive least squares | Online parameter ID with forgetting factor | `identifyRLS(opts)` → streaming estimator | 2d | sysid |
| P30-02 MRAC | Model-reference adaptive control (MIT rule / Lyapunov) | `designMRAC(refModel, plant, gains)` | 3d | P30-01 |
| P30-03 Self-tuning regulator | RLS + pole-placement / minimum-variance | `selfTuningRegulator(opts)` | 3d | P30-01 |
| P30-04 Iterative learning control | ILC for repetitive tasks (P-type / Q-filter) | `iterativeLearningControl(plant, trials, opts)` | 2d | — |
| P30-05 Close SRIVC (P23-04) | Continuous-time ID via prefiltered IV | `identifyContinuousARX(...)` | 3d | sysid |

### P31 — Estimation & Health Monitoring

> **Why:** EKF/UKF exist; extend to optimization-based estimation (MHE) and a brand-new
> fault-detection/fault-tolerant domain. **Benchmark target:** MATLAB FDI Toolbox.

| Item | Goal | API | Effort | Dependency |
| --- | --- | --- | :---: | --- |
| P31-01 Moving horizon estimation | Constrained optimization-based state estimation | `movingHorizonEstimation(model, opts)` | 3d | P29-01 |
| P31-02 Particle filter | Sequential Monte Carlo for nonlinear/non-Gaussian | `particleFilter(f, h, opts)` | 2d | rng |
| P31-03 Fault detection & diagnosis | Residual generation + statistical evaluation | `designFDD(model, opts)` | 3d | observer |
| P31-04 Fault-tolerant control | Reconfigurable control after fault isolation | `reconfigurableFTC(model, faultSet, opts)` | 3d | P31-03 |

### P32 — Advanced Nonlinear Control

> **Why:** Extends P26 (gain scheduling / SMC) to model-based nonlinear synthesis and
> safety-critical control. **Benchmark target:** academic nonlinear control references.

| Item | Goal | API | Effort | Dependency |
| --- | --- | --- | :---: | --- |
| P32-01 Feedback linearization | Input-output / input-state exact linearization | `feedbackLinearization(f, g, h, opts)` | 3d | — |
| P32-02 Backstepping | Recursive Lyapunov design for strict-feedback | `backstepping(systemChain, opts)` | 3d | — |
| P32-03 CLF / CBF safety control | Control Lyapunov + barrier functions via QP | `controlBarrierFunction(dynamics, safeSet, opts)` | 3d | P29-01 |

### P33 — Productization & Interop

> **Why:** Turn designs into deliverables. `js/utils/codegen.js` already exists as a seed.
> **Benchmark target:** Embedded Coder / report generation / data interchange.

| Item | Goal | API | Effort | Dependency |
| --- | --- | --- | :---: | --- |
| P33-01 Controller codegen | Export designed controllers to C / Python / MATLAB | `exportController(ctrl, target)` | 3d | codegen.js |
| P33-02 Design report generator | Auto HTML/PDF report (Bode, RL, margins, verification) | `generateDesignReport(design, opts)` | 2d | analysis |
| P33-03 python-control bridge | Bidirectional JSON interchange (TF/SS/results) | `toPythonControl()` / `fromPythonControl()` | 2d | — |
| P33-04 Design wizard skill | Agent skill: spec → recommended workflow + design | `control-studio-design-wizard` skill | 2d | skills |

### P34 — UI/UX Experience & Design System

> **Why:** Design tokens (`css/variables.css`) are mature, but `js/ui/` is empty (6520-line `app.js`),
> responsive coverage is thin (~7 `@media`), and a11y is partial (~33 aria attrs).
> Goal: elevate usability and *design experience* for control engineers.

| Item | Goal | Deliverable | Effort | Dependency |
| --- | --- | --- | :---: | --- |
| P34-01 UI module extraction | Split `app.js` UI logic into `js/ui/` modules | `js/ui/panels/*.js` | 3d | — |
| P34-02 Component library | Tokenized reusable components (cards, inputs, charts) | `css/components.css` refactor + `js/ui/widgets/` | 2d | P34-01 |
| P34-03 Responsive layout | Mobile/tablet breakpoints; collapsible panels | `layout.css` breakpoints | 2d | — |
| P34-04 Accessibility (WCAG AA) | Keyboard nav, ARIA, focus rings, contrast audit | a11y pass + `verify` walkthrough | 2d | — |
| P34-05 Design wizard UI | Guided spec→design flow with live feedback | `view-wizard` panel | 3d | P33-04 |
| P34-06 Chart interaction | Zoom, cursor readout, export PNG/CSV on all plots | `js/ui/widgets/chart.js` | 2d | P34-02 |

## Execution Order (Approved Blueprint)

The full P29–P34 blueprint is approved. Execution proceeds phase-by-phase, each item
shipping with a deterministic `verify_pNN_*.mjs` script wired into `run_all_verify.sh`.

| Order | Item | Effort | Why now |
| :---: | --- | :---: | --- |
| 1 | P29-01 QP solver | 3d | Enabling tech; unblocks LMI/MPC/CBF — start here |
| 2 | P29-02 LP solver | 2d | Completes the convex-program trio |
| 3 | P29-03 SDP/LMI solver | 4d | Unblocks LPV + D-K |
| 4 | P29-04 Retrofit MPC with `solveQP` | 1d | Hardens existing constrained MPC |
| 5 | P29-05 / P29-06 Close LPV + D-K | 7d | Clears the two oldest "Planned" gaps |
| 6 | P30 Adaptive & learning (RLS→MRAC→STR→ILC, +SRIVC) | 13d | New paradigm on top of SysID |
| 7 | P31 Estimation & monitoring (MHE/PF/FDD/FTC) | 11d | New domain on top of EKF/UKF |
| 8 | P32 Advanced nonlinear (FBL/backstepping/CBF) | 9d | Extends P26 |
| 9 | P33 Productization (codegen/report/bridge/wizard) | 9d | Turns designs into deliverables |
| 10 | P34 UI/UX & design system | 14d | Elevates experience across all phases |

Legacy small gaps folded into the above: P23-04 SRIVC → P30-05; P26-02 LPV → P29-05;
P27-01 D-K → P29-06; P25-02 Hankel norm and P28-02 JSDoc docs remain standalone backlog.

## Next Immediate Action

Start **P29-01 QP solver** (`js/math/optimization.js` + `verify_p29_qp.mjs`):

```bash
# After implementing solveQP + verification script
bash scripts/run_all_verify.sh        # confirm 39/39 pass
```
