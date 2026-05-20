# ControlStudio Development Roadmap

> Last updated: 2026-05-20
> Current committed baseline: `6a7d741 chore(git): ignore node dependency artifacts`
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

## Remaining Dirty Worktree Classification

Current non-P24 uncommitted files observed on 2026-05-20:

| Path | Classification | Action |
| --- | --- | --- |
| `package.json` | Local dependency change: adds `typescript` devDependency | Review with `package-lock.json`; commit only if TypeScript checks become an official workflow |
| `package-lock.json` | Generated lockfile | Commit only if npm dependency management is intentionally adopted |
| `node_modules/` | Generated dependency directory | Never commit |

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

## Next Action Order

1. Decide whether npm dependency management is official:
   - if yes, commit `package.json` + `package-lock.json`
   - if no, revert package dependency changes and avoid `node_modules/`
2. Continue P27:
   - full D-K iteration remains the major robust-control gap.
3. Fill remaining research gaps:
   - P23 continuous-time identification
   - P25 Hankel norm approximation
   - P26 LPV synthesis
   - P28 JSDoc API docs
