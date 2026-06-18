# ControlStudio Development Roadmap

> Last updated: 2026-06-18
> Current committed baseline: `fix(control): reject zero-final-change step metrics`
> Scope: this is the canonical execution roadmap for ControlStudio implementation status.
> Do not use this file for product vision, proof derivations, or handoff notes; see the document workflow below.

## Document Workflow

| Document | Role | Update when |
| --- | --- | --- |
| `control-studio/ROADMAP.md` | Canonical execution board: phase status, next actions, verification commands | Any phase item changes status, or a new implementation phase starts |
| `docs/src/control-studio/functional-roadmap.html` | **Canonical forward functional plan (Tier A–J, 57 items)** — algorithm specs, API design, acceptance criteria, dependencies, sprint plan, agent guidelines | A new capability is planned, an item changes priority, or scope is adjusted. Always update before starting a Tier A–J item. |
| `docs/src/control-studio/plan.md` | Product / architecture plan and high-level capability inventory | A user-visible capability, architecture direction, or major risk changes |
| `docs/src/control-studio/backlog.md` | Detailed task ledger with IDs, dependencies, and verification evidence | A backlog item moves between Planned / In Progress / Done / Paused |
| `docs/src/control-studio/skills.md` | Agent skill decomposition and workflow boundaries | A skill is added, retired, or changes scope |
| `docs/src/control-studio/verification.md` | Mathematical proof and golden verification cases | A benchmark or expected numeric result changes |
| `docs/src/control-studio/scenarios.md` | Realistic engineering walkthroughs and UI findings | Browser workflow, scenario issue, or field-use note changes |
| `docs/src/agents/continuation.md` | Current handoff / operational snapshot | Before switching agents or after a meaningful checkpoint |

### Forward Functional Roadmap (Tier A–J)

A standalone HTML document at `docs/src/control-studio/functional-roadmap.html` is the
**canonical specification** for all planned non-UI/UX work. It contains:

- 57 items across 10 Tiers (A–J): control algorithms, sysid, estimation, optimisation,
  numerics, verification/safety, advanced MPC, embedded codegen, performance, HIL.
- Per-item: algorithm core, API design, files to create/modify, acceptance criteria,
  dependencies.
- Cross-tier dependency matrix and 5-sprint roadmap.
- Agent guidelines covering required reading, implementation flow, naming conventions,
  numerical tolerances, forbidden actions, and Skill-to-Tier mapping.

Before starting any new functional work that is not already a finished P-phase, agents
**must** open this file in the browser and locate the corresponding Tier-letter ID
(e.g., A1 for ADRC). It supersedes ad-hoc planning discussions.

## Required Development Workflow

1. Run `git status --short` and classify dirty files before editing.
2. Read `control-studio/ROADMAP.md`, `docs/src/control-studio/functional-roadmap.html` (for Tier A-J work), `docs/src/control-studio/plan.md`, `docs/src/control-studio/backlog.md`, and `docs/src/agents/continuation.md`.
3. If a workflow can become reusable agent behavior, check `docs/src/control-studio/skills.md` before coding.
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
| P16 | GA tuning / H∞ Nelder-Mead / nonlinear equilibrium classification + grid guards | Done | `verify_p16_*.mjs`, `verify_equilibrium_nd.mjs` |
| P17 | ARMAX / NSGA-II / EKF-UKF / advanced robust baseline | Done | `verify_p17_*.mjs` |
| P18 | Monte Carlo robust validation + UI + skill | Done | `verify_p18_robust_validation.mjs` |
| P19 | H∞ Riccati synthesis baseline | Done | `verify_p19_hinf_riccati.mjs` |
| P20 | MPC engineering: offset-free, move suppression, feasibility | Done | `verify_p20_mpc_engineering.mjs` |
| P21 | Advanced SysID: OE / BJ / subspace / experiment signals | Done | `verify_p21_sysid_advanced.mjs` |
| P22 | Verification infrastructure / cross-tool regression / CI | Done | `run_all_verify.sh`, `compare_python_control.py`, `.github/workflows/ci.yml` |
| P23 | SysID gap closure: FRF, model order, MISO ARX, SRIVC | Done | `verify_p23_*.mjs`, `verify_b3_srivc.mjs` |
| P24 | Advanced MPC: NMPC, EMPC, Tube MPC, Explicit MPC | Done | `verify_p24_nmpc.mjs`, `verify_p24_empc.mjs`, `verify_p24_tube_explicit_mpc.mjs` |
| P25 | Model order reduction: minreal SS + balanced truncation + Hankel norm | Done | `verify_p25_model_reduction.mjs`, `verify_p25_hankel.mjs` |
| P26 | Nonlinear control: gain scheduling + SMC + LPV | Done | `verify_p26_nonlinear.mjs`, `verify_p29_lpv.mjs` |
| P27 | H∞ extensions: MIMO H∞ verify + loop shaping + D-K | Done | `verify_p27_mimo_hinf.mjs`, `verify_p27_loop_shaping.mjs`, `verify_p29_dk.mjs`, `verify_p19_dynamic_dk.mjs` |
| P28 | Infrastructure quality: TS definitions + JSDoc API docs + benchmark | Done | `control-studio/types/control-studio.d.ts`, `docs/api/index.html`, `benchmark.mjs` |
| **P29** | **Numerical optimization core: QP / LP / SDP-LMI** | Done | `verify_p29_{qp,lp,sdp,lpv,dk}.mjs` — 43 scripts total |
| **P30** | **Adaptive & learning control: RLS / MRAC / STR / ILC** | Done | `verify_p30_adaptive.mjs` |
| **P31** | **Estimation & monitoring: MHE / particle filter / FDD / FTC** | Done | `verify_p31_estimation.mjs` |
| **P32** | **Advanced nonlinear: feedback linearization / backstepping / CLF-CBF** | Done | `verify_p32_nonlinear_advanced.mjs` |
| **P33** | **Productization & interop: codegen / report / python-control bridge** | Done | `verify_p33_productization.mjs` |
| **P34** | **UI/UX experience & design system** | Done | `verify_p34_ui.mjs` |
| **P35** | **UI/UX plan P1 foundation: status bar / toast / empty state** | Done | `verify_p35_uiux_foundation.mjs` |
| **P36** | **UI/UX plan P1 remaining: slider / confirmDialog / skeleton / codeBlock / 3-way theme / SideNav icons / code preview / unit switcher** | Done | `verify_p36_uiux_p1_remaining.mjs` |
| **P37** | **UI/UX plan P2: command palette / keyboard shortcut modal / unit switcher behaviour / print theme** | Done | `verify_p37_uiux_p2.mjs` |
| **P38** | **UI/UX P2 batch 1: dirty marker / progress bar / prefs modal / fullscreen / chart export / field hints** | Done | `verify_p38_uiux_p2_batch1.mjs` |
| **P39** | **UI/UX P2 batch 2: axis range popover / PZ map OL-CL toggle + ζ grid / Hankel SVD bars / error guidance** | Done | `verify_p39_uiux_p2_batch2.mjs` |
| **P40** | **UI/UX P2 batch 3: 4-step design wizard / cursor readout / chart theme toggle** | Done | `verify_p40_uiux_p2_batch3.mjs` |
| **P41** | **UI/UX P2 batch 4: D2-1~4 discretization comparison table / A2-2 spec overlay / A2-3 compliance badges** | Done | `verify_p41_disc_spec.mjs` |
| **P42** | **UI/UX P2 batch 5: B1-2 best-value ★ / sortable compare table / B1-3 diff heatmap + CSV export** | Done | `verify_p42_compare_enhancements.mjs` |
| **P43** | **UI/UX P2 batch 6: A1-1 system input wizard / A5-2 sensitivity plot / A5-3 robustness badges** | Done | `verify_p43_syswin_a5.mjs` |
| **P44** | **UI/UX P2 batch 7: F2-1 draggable split pane / F2-2 multi-design tab bar** | Done | `verify_p44_split_tabs.mjs` |
| **P45** | **UI/UX P3 batch 1: D3 FLOP/memory/platform + B4 CSV import/export** | Done | `verify_p45_d3_b4.mjs` |
| **P46** | **UI/UX P3 batch 2: B5 calculation steps / tooltip / condition warnings + B2 matrix expand** | Done | `verify_p46_b5_b2.mjs` |
| **P47** | **UI/UX P3 batch 3: C1 topic cards + C4 drafts/notes/completion** | Done | `verify_p47_c1_c4.mjs` |
| **P48** | **UI/UX P3 batch 4: A3 draggable poles / Bode breakpoint / history drawer** | Done | `verify_p48_a3.mjs` |
| **P49** | **UI/UX P3 batch 5: C3 interactive animations** | Done | `verify_p49_c3.mjs` |
| **P50** | **UI/UX P3 batch 6: E1~E4 dashboard / scoring / report / decision log** | Done | `verify_p50_e1_e4.mjs` |
| **P51** | **F4/F5/G7 accessibility: colors / keyboard / screen-reader** | Done | `verify_p51_a11y.mjs` |
| **P52** | **G5/G6/G8/G9 i18n skeleton / responsive / onboarding / multi-project** | Done | `verify_p52_g5689.mjs` |
| **P53** | **A1-2/A1-3/A1-4 SysID entry / example library / health badge** | Done | `verify_p53_a1234.mjs` |
| **P54** | **A4-1/A4-2/A4-3 design wizard / complexity indicator / AI explain** | Done | `verify_p54_a4.mjs` |
| **P55** | **B2-4/B4-3/B4-4 Gramian / Python bridge / LaTeX export** | Done | `verify_p55_b24_b43_b44.mjs` |
| **P56** | **C2-3/C5-2/C5-3/D1-4 error hints / screenshot / summary / codegen** | Done | `verify_p56_c23_c52_c53_d14.mjs` |
| **P57** | **D4/D5 unit-test / diff / HIL / docs / wiring / warnings** | Done | `verify_p57_d4_d5.mjs` |
| **P58** | **G11 app-loading skeleton screen** | Done | `verify_p58_g11.mjs` |
| **P59** | **F1-2 Context Bar / view-nav / A5-1 Plot Workspace (main + 2 companion charts)** | Done | `verify_p59_ctxbar_triple.mjs` |
| **P61** | **J1-1/J1-2/J1-4/J1-5 in-chart engineering annotations** | Done | `verify_p61_chart_annotations.mjs` |
| **P62** | **K1-1/K1-2/K1-4 design flow state machine** | Done | `verify_p62_flow_state.mjs` |
| **P63** | **L1-1/L1-2/L1-3 chart measurement tools** | Done | `verify_p63_measure_tools.mjs` |
| **P64** | **P1-1/P1-2/P1-3 parameter sweep visualization** | Done | `verify_p64_param_sweep.mjs` |
| **P65** | **Q1-1/Q1-2/Q1-3/Q1-4 share & export enhancement** | Done | `verify_p65_share_export.mjs` |
| **P66** | **Runtime UI symbol contract: no emoji / pictographic glyphs in visible UI source** | Done | `verify_ui_symbol_contract.mjs` |
| **P34-01** | **Module split: P62-P65 → js/ui/ sub-modules** | Done | Verify scripts updated to check module files |
| **J1-3** | **Root Locus geometric annotations (damping lines, ωn arcs, Ku labels)** | Done | `verify_j13_rlocus_geo.mjs` |
| **H1-4** | **Sidebar Quick Pin (non-emoji section pin, localStorage, max 3, float to top)** | Done | `verify_h14_sidebar_pin.mjs` |

## Roadmap Tier Implementation — Sprint 1 (2026-05-24)

Per `docs/src/control-studio/functional-roadmap.html`. Tier A-J deterministic baseline is now complete.

| ID | Theme | Status | Verification | Notes |
| --- | --- | --- | --- | --- |
| **A1** | ADRC (Active Disturbance Rejection Control) | Done | `verify_a1_adrc.mjs` (23 checks) | ESO bandwidth parameterisation; linear + nonlinear (fal) variants |
| **A2** | ILC (Iterative Learning Control) | Done | `verify_a2_ilc.mjs` (21 checks) | P-type / PD-type / NOILC; lifted Toeplitz formulation |
| **A3** | SMC + Super-twisting | Done | `verify_a3_smc.mjs` (15 checks) | Classical / boundary-layer / super-twisting SMC; chattering index and reaching-time guard |
| **A4** | Backstepping | Done | `verify_a4_backstepping.mjs` (12 checks) | Third-order strict-feedback chain with terminal triangular drift; adaptive second-order matched-parameter baseline |
| **A5** | Feedback Linearization | Done | `verify_a5_a7_tier_a.mjs` | Numerical Lie derivatives, relative degree, I/O and full-state linearization, zero-dynamics warning |
| **A6** | Reset Control | Done | `verify_a5_a7_tier_a.mjs` | Clegg / FORE reset controllers, describing-function PM lift, H-beta feasibility baseline |
| **A7** | Reference Governor | Done | `verify_a5_a7_tier_a.mjs` | Scalar MOAS, online kappa governor, deterministic Monte Carlo constraint satisfaction |
| **B2** | Closed-loop Identification | Done | `verify_b2_closedloop_id.mjs` (9 checks) | Direct ARX, indirect closed-loop recovery, joint I/O IV baseline, bias-risk diagnostic |
| **B3** | SRIVC Continuous-time Identification | Done | `verify_b3_srivc.mjs` (8 checks) | `identifyCT` wrapper, Poisson filter, clean CT first-order fixture <1% coefficient error |
| **B4** | GP-NARX / Gaussian Process Regression | Done | `verify_b4_b6_identification.mjs` | Constant-mean GP regression, RBF/Matern/periodic kernels, predictive variance and 95% interval output |
| **B5** | Hammerstein / Wiener Identification | Done | `verify_b4_b6_identification.mjs` | Saturation Hammerstein level recovery and Wiener polynomial nonlinearity fit |
| **B6** | MIMO Frequency-Response Identification | Done | `verify_b4_b6_identification.mjs` | 2x2 LS FRF recovery with coherence, magnitude, and phase verification |
| **C1** | Moving Horizon Estimation API | Done | `verify_c1_c4_estimation.mjs` | Linear constrained MHE wrapper plus scalar nonlinear grid-search MHE baseline |
| **C2** | Particle Filter API | Done | `verify_c1_c4_estimation.mjs` | Bootstrap/SIR PF with systematic, multinomial, and stratified resampling |
| **C3** | Joint State-Parameter EKF | Done | `verify_c1_c4_estimation.mjs` | Numerical augmented EKF for state and parameter estimation with rank-deficient warning |
| **C4** | RTS Smoother | Done | `verify_c1_c4_estimation.mjs` | Rauch-Tung-Striebel backward smoothing, covariance non-increase, MSE improvement fixture |
| **D2** | OSQP-style ADMM QP | Done | `verify_d2_d6_optimization.mjs` | Dense / diagonal box-QP ADMM baseline with large diagonal problem guard |
| **D3** | SQP / Multiple Shooting | Done | `verify_d2_d6_optimization.mjs` | Merit-function SQP baseline and multiple-shooting continuity helper |
| **D4** | MILP Branch-and-Bound Utilities | Done | `verify_d2_d6_optimization.mjs` | Binary MILP enumeration, knapsack optimum, infeasible detection, Held-Karp TSP |
| **D5** | L-BFGS / Trust Region | Done | `verify_d2_d6_optimization.mjs` | L-BFGS with compact history and trust-region gradient baseline |
| **D6** | Mixed-Integer MPC | Done | `verify_d2_d6_optimization.mjs` | Enumerative switched-system MIMPC baseline with infeasibility-safe status |
| **E3** | Generalized Schur / Descriptor Systems | Done | `verify_efg_remaining.mjs` | Small regular/singular descriptor pencil eigenvalue baseline, including infinite eigenvalues |
| **E6** | Krylov GMRES / Arnoldi | Done | `verify_efg_remaining.mjs` | Arnoldi orthonormal basis and restarted GMRES residual verification |
| **E7** | Condition number gating | Done | `verify_e7_conditioning.mjs` (16 checks) | `js/math/conditioning.js`: estimateCondition, withConditionCheck, scaleAndSolve |
| **F2** | Control Barrier Function | Done | `verify_efg_remaining.mjs` | Double-integrator circular obstacle CBF filter and SOS feasibility placeholder |
| **F3** | LTL / CTL Formal Specification | Done | `verify_efg_remaining.mjs` | Finite-trace response / safety formulas and CTL unsafe counterexample |
| **F5** | Importance Sampling Monte Carlo | Done | `verify_efg_remaining.mjs` | Rare-event normal-tail estimator with variance-reduction check |
| **G1** | Stochastic MPC Chance Constraints | Done | `verify_efg_remaining.mjs` | Gaussian chance-constraint tightening and Monte Carlo violation-rate check |
| **E2** | Sylvester / Lyapunov / Stein | Done | `verify_e2_sylvester.mjs` (12 checks) | vec-trick (Kronecker) — robust for n ≤ 30. Bartels-Stewart deferred until realSchur reordering bug is fixed. |
| **G2** | MPC Move Blocking | Done | `verify_g2_move_blocking.mjs` (17 checks) | Block expansion matrix + condensed QP; singleton-equivalence verified to 1e-15 |
| **G3** | Distributed MPC | Done | `verify_efg_remaining.mjs` | Scalar consensus ADMM / dual decomposition baseline |
| **G4** | Hybrid MPC | Done | `verify_efg_remaining.mjs` | Big-M helper and switched-system MIMPC wrapper |
| **G5** | NMPC Warm-Start Strategy | Done | `verify_efg_remaining.mjs` | Shift-and-extend sequence, simulation warm start, iteration reduction summary |
| **H1** | C/C++ Codegen | Done | `verify_hij_deployment_runtime_integration.mjs` | PID C header/source generator, fixed-point flags, CMake template, CMSIS hook |
| **H2** | Rust Codegen | Done | `verify_hij_deployment_runtime_integration.mjs` | no_std Rust controller and Cargo template |
| **H3** | IEC 61131-3 Structured Text | Done | `verify_hij_deployment_runtime_integration.mjs` | FUNCTION_BLOCK PID template for PLC workflows |
| **H4** | AUTOSAR Adaptive Template | Done | `verify_hij_deployment_runtime_integration.mjs` | ARXML + C/H skeleton generation |
| **H5** | FreeRTOS Task Template | Done | `verify_hij_deployment_runtime_integration.mjs` | xTaskCreate / vTaskDelayUntil task wrapper |
| **H6** | CRC + Watchdog Safety Wrapper | Done | `verify_hij_deployment_runtime_integration.mjs` | CRC32 marker, watchdog hook, redundancy metadata |
| **I1** | WebAssembly Adapter | Done | `verify_hij_deployment_runtime_integration.mjs` | WASM/fallback adapter and Float64Array flattener |
| **I2** | Web Worker Compute Facade | Done | `verify_hij_deployment_runtime_integration.mjs` | Abortable async compute worker facade |
| **I3** | Memoization Layer | Done | `verify_hij_deployment_runtime_integration.mjs` | Stable hash and LRU memoize wrapper |
| **I4** | Streaming Computation | Done | `verify_hij_deployment_runtime_integration.mjs` | Chunk streaming and progressive map helpers |
| **I5** | Cross-method Check Framework | Done | `verify_hij_deployment_runtime_integration.mjs` | Method comparison table with tolerance pass/fail |
| **J1** | WebSocket HIL Bridge | Done | `verify_hij_deployment_runtime_integration.mjs` | JSON state/control frame helpers and mock bridge |
| **J2** | Web Serial API Protocols | Done | `verify_hij_deployment_runtime_integration.mjs` | CSV, binary, and Modbus-RTU codecs |
| **J3** | OPC UA Gateway Client | Done | `verify_hij_deployment_runtime_integration.mjs` | Read/write request facade for bridge servers |
| **J4** | Modbus TCP/RTU Client | Done | `verify_hij_deployment_runtime_integration.mjs` | Holding-register and coil request helpers |
| **J5** | MQTT Subscriber / Publisher | Done | `verify_hij_deployment_runtime_integration.mjs` | Topic route facade for IoT telemetry/control |
| **J6** | InfluxDB / Prometheus Import | Done | `verify_hij_deployment_runtime_integration.mjs` | Query builders and time-series normalization |
| **C1** | MHE | Pre-existing (P31-01) | `verify_p31_estimation.mjs` | Already implemented as `movingHorizonEstimation` in `js/control/estimation.js`. Nonlinear MHE deferred. |
| **B1** | SINDy | Done | `verify_b1_sindy.mjs` | Sparse polynomial library + STLSQ recovery on synthetic nonlinear dynamics |
| **D1** | Active-set QP + warm-start | Done | `verify_d1_qp_activeset.mjs` | KKT residual, feasibility, warm-start, MPC-like QP, infeasible / non-PSD guards |
| **F1** | Reachability via zonotopes | Done | `verify_f1_reachability.mjs` | Zonotope operations, finite-horizon reach sets, Monte Carlo containment sanity checks |
| **F4** | Falsification (S-TaLiRo-style) | Done | `verify_f4_falsification.mjs` | Bounded STL robustness + deterministic random / anneal counterexample search |

**Math core closure:** `js/math/realschur.js` now uses a Jacobi orthogonal Schur fast path for symmetric real matrices, fixing the 3x3 stable real-spectrum reconstruction regression. Non-normal Schur refinement remains a research-grade backend improvement, but no longer blocks current CARE / Lyapunov / Sylvester baselines.

**Nonlinear analysis closure:** `js/analysis/equilibrium.js` now classifies n-dimensional equilibria through a Faddeev-LeVerrier characteristic polynomial plus shared `polyroots()` path. This removes the prior n>2 `trace(A)/n` placeholder that could hide saddle or unstable modes in higher-dimensional nonlinear linearizations. Nonlinear grid scans now validate grid size and finite bounds, and `gridSize=1` uses the finite bounds-center seed instead of producing NaN equilibrium or phase-portrait trajectories.

**Analysis grid closure:** continuous Bode, Nyquist, Nichols, root-locus, and jω crossing sweeps now validate finite ranges and require at least two grid points. Discrete Bode sweeps now validate finite sample counts and `0 < omegaMin < omegaNyquist`, and clamp zero-magnitude dB output to a finite floor. Invalid analysis grids fail with explicit errors instead of producing NaN or non-finite frequency/gain samples.

**Continuous-analysis domain closure:** continuous Bode / Nyquist / Nichols, continuous auto-frequency range, continuous root-locus helpers (`rootLocusData`, asymptotes, break points, and jω crossings), `stabilityMargins()`, and robust sensitivity helpers now reject discrete transfer functions with finite `sampleTime`. This prevents z-domain coefficient arrays from being interpreted as s-domain characteristic equations, `G(jω)` frequency scans, or continuous `S/T/KS` robustness metrics; discrete plants must use z-plane pole analysis and discrete frequency-response tooling. The UI Root Locus tab now falls back to the z-plane pole-zero map for discrete systems instead of calling the continuous solver.

**Discretization comparison closure:** P41 D2 comparison now computes single-frequency phase error through explicit continuous/discrete evaluation helpers and plots Bode overlays on a valid shared frequency grid below Nyquist. It no longer calls `bodeData(sys, [w])`, `bodeData(sys, omegas)`, or the old `discreteBodeData(disc, Ts, omegas)` shape, and the table uses `DiscreteTransferFunction.dcGain()` low-frequency limits instead of raw coefficient sums.

**Runtime UI symbol closure:** `index.html`, `js/app.js`, `js/ui/*.js`, and runtime report/status modules now avoid emoji / pictographic glyphs for visible buttons, badges, status messages, command palette icons, generated report cells, warnings, keyboard shortcut labels, and dynamically injected DOM text. `verify_ui_symbol_contract.mjs` scans these runtime UI sources and is part of `run_all_verify.sh`, so banned examples such as check/cross marks, warning pictographs, gear/share/report icons, fullwidth plus / heavy-close glyphs, keyboard glyphs, and emoji-only button labels cannot regress silently.

**API open-loop simulation closure:** `control_analysis_cli.mjs` now simulates `C(s)G(s)` when `simulation.mode === "open_loop"` and a controller is present, so `/api/control/system/response` no longer returns plant-only time response while reporting a nontrivial `openLoop` model. `verify_control_cases.mjs` now checks CLI response final value against the golden fixture, and the fixture set includes an open-loop controller cascade case whose expected final value proves the controller is in the simulation path. API contract fixtures and the regression dashboard were updated to the 6/6 fixture baseline.

**Non-step response metrics closure:** CLI/API response metrics now mark impulse, ramp, sine, square, and pulse inputs as `valid:false` with an explicit reason instead of reporting rise time, settling time, overshoot, or steady-state error from non-step waveforms. `verify_control_cases.mjs` now uses the same waveform selector as the CLI, and the golden fixture set includes an impulse-response contract case proving non-step metrics are gated. API contract fixtures and the regression dashboard were updated to the 7/7 fixture baseline.

**Step amplitude metrics closure:** CLI/API step metrics now pass the requested step amplitude into `stepInfo()` as the reference value. Non-unit steps therefore report steady-state error against the commanded input amplitude rather than hard-coded unity. The golden fixture set includes an amplitude=2 first-order step case proving final value and `steadyStateError` both track the requested reference; API contract fixtures and the regression dashboard were updated to the 8/8 fixture baseline.

**Zero-final-change step metrics closure:** `stepInfo()` now rejects normalized rise time, settling time, and overshoot metrics when the net final response change is effectively zero relative to the observed transient excursion. Zero-DC-gain or zero-amplitude step responses keep a meaningful `steadyStateError`, but report `valid:false` for normalized step metrics instead of producing misleading values such as >400,000% overshoot. The golden fixture set includes `G(s)=s/(s^2+2s+2)` with a unit step, proving the transient peak exists while final output returns to zero; API contract fixtures and the regression dashboard were updated to the 9/9 fixture baseline.

**DC gain origin-cancellation closure:** continuous TF and ZPK `dcGain()` now cancel removable origin pole-zero factors before evaluating the low-frequency limit. Systems such as `s/s` report finite unity DC gain, extra origin zeros report zero DC gain, and extra origin poles preserve signed infinite gain. This prevents RGA, static decoupler, low-frequency design, and robustness summaries from treating removable integrators as real steady-state singularities.

**Discrete DC gain unit-root closure:** discrete TF `dcGain()` now evaluates the low-frequency limit at `q=z^-1=1` by cancelling removable unit-circle factors. Systems such as `(1-z^-1)/(1-z^-1)` report finite unity DC gain, extra unit-circle zeros report zero DC gain, and extra unit-circle poles report infinite DC gain. This prevents z-domain step final-value checks, C2D DC preservation, and discrete controller comparisons from treating removable unit roots as true steady-state singularities.

**Discrete delay pole closure:** discrete TF `poles()` now includes implicit poles at `z=0` when the numerator delay order exceeds the denominator order. Natural z^-1 inputs such as `num=[0,1], den=[1]` for `G(z)=z^-1` now report the causal delay pole at the origin instead of an empty pole set, while existing explicit denominator poles and the no-spurious-zero convention remain unchanged.

**Discrete delay polynomial normalization closure:** discrete TF construction now trims trailing structural zeros from numerator and denominator `z^-1` coefficient arrays while preserving leading numerator zeros as real input delay. Padded static gains such as `num=[1,0,0], den=[1,0]` no longer report spurious `z=0` zeros or poles, padded unit-delay models such as `num=[0,1,0], den=[1,0]` still report exactly one causal delay pole, and denominator leading-zero forms such as `den=[0,1]` are rejected as invalid non-causal/advance representations.

**Discrete interconnection closure:** discrete TF `parallel()` and `feedback()` now add `z^-1` delay polynomials by coefficient index instead of using high-degree polynomial alignment. Mixed-order interconnections such as `1 + 0.5/(1-0.5z^-1)` preserve the correct numerator and denominator, and feedback on `0.5/(1-0.5z^-1)` keeps the expected closed-loop pole at `z=1/3` instead of collapsing into a static gain. Feedback paths also now enforce matching sample times.

**Matched-Z gain normalization closure:** `c2dMatchedZ()` now preserves the continuous leading gain before low-frequency matching, then normalizes against the discrete TF `dcGain()` limit rather than raw coefficient sums. Removable origin pole-zero factors such as `2s/s` therefore map to a removable `z=1` pair with DC gain 2 instead of silently collapsing to unity gain.

**Matched-Z properness closure:** `c2dMatchedZ()` now rejects improper continuous plants before pole-zero mapping, matching the structural gate already enforced by Tustin, ZOH, impulse-invariant, and time-response simulation. This prevents derivative-like or non-realizable continuous models such as `(s+1)^2/(s+1)` from being silently converted into plausible but misleading stable discrete transfer functions.

**Impulse-invariant repeated-pole closure:** `c2dImpulseInvariant()` now rejects repeated continuous poles before residue expansion. The implementation is explicitly simple-pole only, so systems such as `1/(s+1)^2` fail with a clear unsupported-case error instead of silently returning a zero discrete system or a numerically inflated transfer function.

**Impulse-invariant feedthrough closure:** `c2dImpulseInvariant()` now requires strictly proper continuous systems. Biproper plants such as `(s+2)/(s+1)` contain a direct-feedthrough impulse term at `t=0`; the current residue-only DTF representation does not encode that distributional component, so the method rejects the case explicitly and directs engineers to ZOH or Tustin instead of silently dropping the feedthrough path.

**Phase-margin branch closure:** `stabilityMargins()` now evaluates phase margin from the continuous unwrapped Bode phase branch rather than the principal phase returned at the crossover point. Negative low-frequency loops start on the `-180 deg` branch, so `L(s)=-2/(s+1)` reports approximately `-60 deg` PM and matches its unstable unity-feedback pole at `+1`, instead of being misreported as a large positive margin.

**Time-response input closure:** step / impulse / ramp / sine / square / pulse simulations now normalize default waveform parameters and reject invalid duration, sample count, amplitude, frequency, pulse width, disturbance, and initial-state values before integration. Continuous transfer-function simulations reject improper plants, biproper sampled outputs include disturbance through direct feedthrough, and PID anti-windup simulations require a strictly proper plant while validating controller gains, derivative filter `N`, saturation bounds, tracking time `Tt`, duration, sample count, and reference amplitude before RK4 integration. Invalid requests fail explicitly instead of producing empty arrays, NaN trajectories, or feedthrough-inconsistent samples.

**Discrete time-response input closure:** z-domain step / impulse simulations now reject invalid sample counts, amplitudes, sample times, and non-finite numerator / denominator coefficients before running the difference equation. Plain discrete systems with `den[0] != 1` are handled through the standard normalized recurrence, so API callers do not silently receive mis-scaled outputs or NaN time grids.

**Delay margin closure:** Padé delay application and pure-delay phase now reject non-finite or negative delay parameters instead of silently returning the original plant or NaN phase. Delay margin now reports zero additional delay for non-positive phase margin and preserves infinite PM as infinite margin, preventing already-unstable loops from being displayed with negative delay capacity.

**Step metrics closure:** `stepInfo()` now validates response array shape, finite samples, strictly increasing time grids, finite final value, and finite reference before reporting rise time, settling time, overshoot, or steady-state error. Invalid response data returns `valid:false` with a reason instead of producing plausible-looking metrics from NaN or malformed trajectories.

**Routh-Hurwitz input closure:** `routhTable()` now validates denominator coefficient arrays before building the table. Non-array, short, non-finite, zero-polynomial, and zero-leading-coefficient inputs fail explicitly instead of being silently classified as stable.

## Verification Suite Status (2026-06-18)

**111/111 scripts pass** — run via `bash scripts/run_all_verify.sh` or `npm run verify:all` (was 82/82 before Functional Roadmap additions). Fixture/API contract coverage is now **9/9 cases**, including open-loop controller cascade response, non-step waveform metrics gating, non-unit step amplitude reference metrics, and zero-final-change step metrics rejection.

| Group | Scripts | Pass |
| --- | --- | --- |
| Fixture & API contracts | 2 | 2 |
| Phase 9/10/11 foundations | 13 | 13 |
| Phase 14–66 advanced control / UI | 69 | 69 |
| Math audit fixes | 1 | 1 |
| Functional Roadmap A-J | 22 | 22 |
| General math & PID | 4 | 4 |

## P1/P2 UI/UX Completion Summary

All **P1** and **P2** items from `UI_UX_PLAN.md` have been implemented:

### P1 Items (completed P35/P36)
- G1 Frequency unit switcher, G11 Skeleton / codeBlock, G12 confirmDialog
- F1-1 SideNav icons, F4-1 3-way theme (Dark/Light/Print)
- A3-1 Slider component, D1 Code preview, Status bar, Toast notifications

### P2 Items (completed P37–P44)
- G3 Command palette (Ctrl+K), G4 Preferences modal, G13 Keyboard shortcuts
- F3-2 Dirty marker, F3-3 Progress bar, F2-1 Split pane, F2-2 Design tabs, F2-3 Fullscreen
- B3-1 Axis range popover, B3-2 Cursor readout, B3-3 Chart theme, B3-4 SVG/PNG/CSV export
- B2-2 Hankel SVD bar chart, B2-3 PZ map OL/CL + ζ grid
- B1-1~3 Compare mode + ★ table + diff heatmap + CSV
- A1-1 System input wizard (TF/SS/ZPK), A2-2/A2-3 Spec overlay + compliance badges
- A5-2 Sensitivity plot (S/T/KS), A5-3 Robustness badges (PM/GM/Ms/Dm)
- C2-1 4-step design wizard, C2-2 Field hints, C2-3 Error guidance
- D2-1~4 Discretization comparison tool

## P3 UI/UX Progress Summary

The following **P3** items from `UI_UX_PLAN.md` are now implemented through P50:

### P3 Items (completed P45–P50)
- D3-1~3 FLOP, memory, and platform labels; B4 CSV import/export.
- B5-1~3 calculation steps, tooltip context, and condition warnings; B2 matrix expansion.
- C1-1~3 topic index cards and example entry points; C4-1~3 draft, notes, and completion badge.
- A3-2~4 draggable root-locus poles, Bode breakpoint interaction, and history drawer.
- C3-1~4 interactive animation surfaces for pole sensitivity, phase portrait, and Nyquist-style workflows.
- E1~E4 assessment dashboard, scoring matrix with radar chart, full HTML report output, and decision log/sign-off workflow.

P3+ UI/UX work is implemented through P66 plus J1-3 and H1-4. Remaining UI/product items are only the explicit paused set: Teaching Mode, Electron, Report Template / report automation, and Block Diagram expansion.

## Package / Dependency Policy

| Path | Classification | Action |
| --- | --- | --- |
| `package.json` | Tracked root npm command manifest; sets `"type": "module"` and exposes `verify:*` scripts | Commit and keep synchronized with validation workflow |
| `package-lock.json` | Generated lockfile | Do not create unless dependencies are intentionally added |
| `node_modules/` | Generated dependency directory | Never commit (covered by `.gitignore`) |

### P35 — UI/UX Plan P1 Foundation

| Item | Status | Evidence |
| --- | --- | --- |
| P35-01 Global status bar | Done | `index.html#app-status-bar`, `updateGlobalStatusBar()` |
| P35-02 Toast notification infrastructure | Done | `#toast-stack`, `notify()` |
| P35-03 High-frequency action feedback | Done | Share, theme, project export/load, compare snapshot actions |
| P35-04 Empty-state action style | Done | `.empty-state-actions` |
| P35-05 Regression guard | Done | `verify_p35_uiux_foundation.mjs`, `run_all_verify.sh` |

### Post-P59 UI Refinement — Sidebar Information Architecture

| Item | Status | Evidence |
| --- | --- | --- |
| Workflow-specific group headers | Done | `SIDEBAR_GROUP_SPECS`, `.section-group-label`, grouped sidebar sections by `identify/design/analyse/implement/learn` |
| Default collapsed preset for secondary panels | Done | `DEFAULT_COLLAPSED_SECTION_IDS`, `applyDefaultSidebarCollapsePreset()` |
| Nested subsections for oversized panels | Done | `PANEL_SUBSECTION_SPECS`, `buildPanelSubsections()` |
| Group visibility refresh on tab/search/mode change | Done | `refreshSidebarGroups()` wired from workflow tab switch, sidebar search, system-mode switch, advisor visibility sync |

### P36 — UI/UX Plan P1 Remaining Items

| Item | Status | Evidence |
| --- | --- | --- |
| P36-01 A3-1 `slider()` component | Done | `js/ui/components.js` — linear/log, aria-value* attributes |
| P36-02 G12 `confirmDialog()` component | Done | `js/ui/components.js` — accessible modal HTML generator |
| P36-03 G11 `skeleton()` / `skeletonBlock()` | Done | `js/ui/components.js` — CSS pulse animation in `index.html` |
| P36-04 D1 `codeBlock()` component | Done | `js/ui/components.js` — lang header + copy button |
| P36-05 F4-1 Three-way theme (Dark/Light/Print) | Done | `THEME_CYCLE`, `toggleTheme()`, print CSS in `index.html` |
| P36-06 F1-1 SideNav tabs with SVG icons | Done | `index.html` sidebar-tabs with `.tab-label` + icons |
| P36-07 G1 Frequency unit switcher | Done | `#freq-unit-switcher` in status bar, `state._freqUnit` |
| P36-08 D1 Live code preview panel | Done | `#code-preview-panel` in Design tab, `refreshCodePreview()` |

### P37–P44 — UI/UX Plan P2 Items

| Item | Phase | Status | Evidence |
| --- | --- | --- | --- |
| G3 Command Palette | P37 | Done | `#cmd-overlay`, `COMMANDS`, Ctrl+K |
| G13 Keyboard shortcuts modal | P37 | Done | `#shortcuts-modal`, Ctrl+? |
| G4 Preferences modal | P38 | Done | `#prefs-modal`, `PREFS_KEY`, `loadPrefs/savePrefs/applyPrefs` |
| F3-2 Dirty marker | P38 | Done | `#dirty-dot`, `markDirty/clearDirty`, beforeunload guard |
| F3-3 Progress bar | P38 | Done | `#calc-progress-wrap`, `startCalcProgress/completeCalcProgress` |
| F2-3 Chart fullscreen | P38 | Done | `initChartFullscreen`, requestFullscreen API |
| B3-4 Chart export SVG/PNG/CSV | P38 | Done | `initChartExport`, Plotly.downloadImage |
| C2-2 Field hints | P38 | Done | `FIELD_HINTS`, `initFieldHints`, focus/blur popover |
| B3-1 Axis range popover | P39 | Done | `initAxisRangeControl`, `.axis-range-popover`, Plotly.relayout |
| B2-3 PZ map OL/CL + ζ grid | P39 | Done | `initPZMapControls`, `_overlayDampingGrid` |
| B2-2 Hankel SVD bar chart | P39 | Done | `initHankelSVD`, Gramian approximation, `.hsv-bar-*` |
| C2-3 Error guidance | P39 | Done | `ERROR_GUIDANCE_MAP`, `initErrorGuidance`, contextual hints |
| C2-1 4-step Design Wizard | P40 | Done | `WIZARD_STEPS`, `initDesignWizard`, sessionStorage |
| B3-2 Cursor crosshair readout | P40 | Done | `initChartCursorReadout`, plotly_hover, `.chart-readout` |
| B3-3 Chart theme toggle | P40 | Done | `initChartThemeToggle`, `CHART_THEMES`, Plotly.restyle |
| D2-1~4 Discretization tool | P41 | Done | `initDiscretizationTool`, D2_METHODS, valid single-frequency phase-error helper, shared-grid Bode overlay |
| A2-2 Spec overlay | P41 | Done | `chk-spec-overlay` (pre-existing), wired to render |
| A2-3 Spec compliance badges | P41 | Done | `updateSpecComplianceBadges`, #sc-os/ts/pm/ess |
| B1-2 Best-value ★ + sortable table | P42 | Done | `initCompareTableEnhancements`, `compare-best` class |
| B1-3 Diff heatmap + CSV export | P42 | Done | `_diffMode`, `compare-diff-warn/bad`, Blob CSV |
| A1-1 System input wizard | P43 | Done | `initSystemInputWizard`, TF/SS/ZPK modal, health badges |
| A5-2 Sensitivity plot | P43 | Done | `renderSensitivityPlot`, S/T/KS Bode, Sensitivity tab |
| A5-3 Robustness badge bar | P43 | Done | `updateRobustnessBadges`, PM/GM/Ms/Dm in sidebar |
| F2-1 Split pane | P44 | Done | `initSplitPane`, RAF drag, 240px min, localStorage |
| F2-2 Design tab system | P44 | Done | `initDesignTabs`, snapshot, add/switch/close |

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
| P23-04 Continuous-time identification | Done | `identifyCT`, `poissonFilter`, `verify_b3_srivc.mjs` |

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
| P25-02 Hankel norm approximation | Done | `hankelSingularValues/hankelNorm/hankelNormApprox` in `model_reduction.js`, `verify_p25_hankel.mjs` (23 tests) |
| P25-03 SS minreal / Kalman decomposition | Done | `minrealSS`, `verify_p25_model_reduction.mjs` |

### P26 — Nonlinear Control

| Item | Status | Evidence |
| --- | --- | --- |
| P26-01 Gain-scheduled PID | Done | `gainScheduledPID`, `verify_p26_nonlinear.mjs` |
| P26-02 LPV synthesis | Done | `lpv.js` — `synthesizeLPV/analyzeLPV`, `verify_p29_lpv.mjs` |
| P26-03 Sliding mode control | Done | `designSMC`, `verify_p26_nonlinear.mjs` |

### P27 — H∞ Design Extensions

| Item | Status | Evidence |
| --- | --- | --- |
| P27-01 Full D-K iteration | Done | `dk_iteration.js` — `computeMuUpperBound/dkIteration`, dynamic `D(jω)` fit via `dkIterationDynamic`, `verify_p29_dk.mjs`, `verify_p19_dynamic_dk.mjs` |
| P27-02 Loop-shaping H∞ | Done | `loopShapingHinf`, `verify_p27_loop_shaping.mjs` |
| P27-03 MIMO H∞ verification | Done | `verify_p27_mimo_hinf.mjs` |

### P28 — Infrastructure Quality

| Item | Status | Evidence |
| --- | --- | --- |
| P28-01 TypeScript definitions | Done | `control-studio/types/control-studio.d.ts` |
| P28-02 JSDoc API docs | Done | `generate_api_docs.mjs` → `docs/api/index.html` (333 symbols, dark-theme, searchable) + `symbols.json` |
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
| **P29-02 LP solver** ✅ | Regularized interior-point LP (min-norm tie-break) | `solveLP(c, opts)` in `js/math/optimization.js` (`verify_p29_lp.mjs`, 21 tests) | 2d | P29-01 |
| **P29-03 SDP / LMI solver** ✅ | ADMM splitting + PSD-cone projection (Jacobi eig) | `solveSDP(F0, Flist, c, opts)`, `solveLMIFeasibility`, `symmetricEig` (`verify_p29_sdp.mjs`, 12 tests) | 4d | P29-01 |
| **P29-04 Retrofit MPC** ✅ | Replace inlined Hildreth QP in `mpc.js` with `solveQP`; adds general A·u≤b support | (internal `mpc.js`) | 1d | P29-01 |
| **P29-05 Close LPV (P26-02)** ✅ | LMI-based LPV synthesis on parameter grid | `synthesizeLPV/analyzeLPV` in `js/control/lpv.js` (`verify_p29_lpv.mjs`, 14 tests) | 3d | P29-03 |
| **P29-06 Close D-K (P27-01)** ✅ | μ upper bound via D-scaling + dynamic D-K iteration | `computeMuUpperBound/dkIteration/dkIterationDynamic` in `js/control/dk_iteration.js` (`verify_p29_dk.mjs`, `verify_p19_dynamic_dk.mjs`) | 4d | P29-03 |

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
| 5 | P29-05 / P29-06 Close LPV + D-K | Done | Clears the two oldest "Planned" gaps |
| 6 | P30 Adaptive & learning (RLS→MRAC→STR→ILC, +SRIVC) | 13d | New paradigm on top of SysID |
| 7 | P31 Estimation & monitoring (MHE/PF/FDD/FTC) | 11d | New domain on top of EKF/UKF |
| 8 | P32 Advanced nonlinear (FBL/backstepping/CBF) | 9d | Extends P26 |
| 9 | P33 Productization (codegen/report/bridge/wizard) | 9d | Turns designs into deliverables |
| 10 | P34 UI/UX & design system | 14d | Elevates experience across all phases |

Legacy small gaps folded into the above: P23-04 SRIVC → P30-05; P26-02 LPV → P29-05;
P27-01 D-K → P29-06; P25-02 Hankel norm and P28-02 JSDoc docs completed (2026-05-21).

## Math Core Audit Round 2 — Done (2026-05-24)

Three fixes applied after full math-core read audit:

| ID | File | Fix |
|----|------|-----|
| A1 | `js/control/stability.js` — `stabilityMargins()` | Collects **all** gain/phase crossings; returns worst-case (minimum) PM and GM plus `allGainCrossings`/`allPhaseCrossings` arrays. Fixes non-minimum-phase and high-order systems where only the first crossing was returned; phase margin now uses the unwrapped branch so negative low-frequency loops do not appear as falsely high-margin stable designs. |
| A2 | `js/math/matrix.js` — `matDet()` | Added `_matDetLU()` O(n³) LU fallback for n > 6; Sarrus closed-form for n=3. Eliminates O(n!) cofactor recursion for large matrices. |
| A3 | `js/analysis/root-locus.js` — `sortRootLocusBranches()` | Replaced greedy nearest-neighbor with **Jonker-Volgenant O(n³) Hungarian** optimal bipartite assignment (`_hungarianAssign`). Eliminates branch-swap artefacts at real-axis crossings. |

Verify baseline: **111/111** (`run_all_verify.sh` / `npm run verify:all`). Immediate non-paused control roadmap items are complete at the deterministic baseline level; future work should be scenario-driven or target explicit research-grade backend replacements.
