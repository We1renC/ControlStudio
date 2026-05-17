# Control System Backlog

此文件定義 ControlStudio 後續開發的先後順序。後續 agent 若要開發控制系統功能，應先讀：

1. `CONTROL_SYSTEM_PLAN.md`
2. `CONTROL_SYSTEM_VERIFICATION_CASES.md`
3. `CONTROL_SYSTEM_BACKLOG.md`

目前策略：
- Block Diagram 暫時擱置，不在近期主線投入新功能。
- Phase 0-9 全部完成：SISO 全鏈、State Feedback / Lyapunov / LQR、Observer / Kalman / LQG、MIMO 基礎與設計（RGA / SV Bode / Decoupler / MIMO LQR）。
- 下一階段依 `CONTROL_SYSTEM_PHASE10_PLAN.md`：先完成 Schur / Hamiltonian CARE，再做 MPC baseline、Dynamic Decoupler、Robust Control scope。
- 使用者已要求擱置：教學模式、Electron packaging、報告模板 / 報告自動化。
- 每個功能必須有數學推導或 fixture 驗證，不只看 UI 是否可操作。
- 控制理論新增功能需先有數學與驗證基線，避免直接擴大 UI 面。

## Priority Legend

- `P0`: 必須先完成，否則後續功能容易不穩。
- `P1`: 近期主線，高價值且與現有架構相容。
- `P2`: 進階能力，需建立在 P0/P1 之上。
- `P3`: 產品化或高複雜度功能，暫不優先。

## Status Legend

- `Done`: 已完成。
- `Next`: 下一批優先開發。
- `Planned`: 已規劃，等待前置項。
- `Paused`: 暫停。

## Current Baseline

- Branch: `codex/control-system-latest`
- Latest pre-Phase-10 synced commit: `b01f169 docs(control): mark all 9 Scenario 3+4 issues as resolved`
- Current Phase 10 checkpoint: Schur / Hamiltonian CARE solver, MPC baseline, Dynamic Decoupler prototype, and Robust sensitivity baseline added.
- Scenario 5 browser walkthrough result: Phase 10 is math-core ready but UI-not-ready; next priority is UI integration for MPC / Robust / Dynamic Decoupler.
- Latest full-theory audit:
  - `7a318b3 fix(control): harden phase 7-9 theory diagnostics`
  - `46e20da fix(control): harden phase 0-6 theory checks`
- Validation baseline:
  - `node control-studio/scripts/verify_math_core.mjs`
  - `node test_control.js`
  - `node control-studio/scripts/verify_control_cases.mjs`
  - `node control-studio/scripts/verify_control_api_contract.mjs`
  - `node control-studio/scripts/control_regression_dashboard.mjs`
  - `./scripts/validate_nvidia_model_selector.sh`

## Development Sequence

### Phase 0: Stabilize Verification And API Contract

目標：先把目前已完成能力鎖穩，讓後續進階功能有可信基準。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P0-01 | P0 | Done | Fixture-based verification runner | 五個數學推導案例已轉成可重跑 fixture，避免手動驗證流失 | `CONTROL_SYSTEM_VERIFICATION_CASES.md` | `node control-studio/scripts/verify_control_cases.mjs` |
| CS-P0-02 | P0 | Done | API contract tests | 防止 FastAPI 與 JS CLI schema / formula drift | `control_analysis_cli.mjs`, `control_api.py` | `node control-studio/scripts/verify_control_api_contract.mjs` |
| CS-P0-03 | P0 | Done | Browser regression smoke | 固定核心 UI 流程：輸入 plant、調 controller、看 plot、匯出 | 前端服務 `8765`, API `8770` | `window.ControlStudioSmoke.run()` |
| CS-P0-04 | P0 | Done | Input validation hardening | 統一 TF/SS/ZPK/Lead/Lag 錯誤提示與邊界條件 | 現有 field error helper | `test_control.js` 與 browser smoke |
| CS-P0-05 | P0 | Done | Math core verification runner | 獨立鎖住 Complex / Polynomial / Matrix / ODE / TF / DTF / State-Space / C2D 基礎不變量 | math/control core modules | `node control-studio/scripts/verify_math_core.mjs` |

Exit criteria: 已達成。

### Phase 1: Controller Design Presets

目標：讓 PID + Lead/Lag 變成「可設計」而不只是「可調參」。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P1-01 | P1 | Done | PID tuning presets UI | UI 可套用 Ziegler-Nichols / Cohen-Coon | `pid.js` | `test_control.js` 驗證公式 |
| CS-P1-02 | P1 | Done | Lead design helper | 可根據 target phase boost / crossover 給 Lead 參數 | `compensator.js`, Bode data | `test_control.js` 驗證 `alpha/tau` |
| CS-P1-03 | P1 | Done | Lag design helper | 可用低頻增益改善 steady-state error | `compensator.js`, DC gain | `test_control.js` 驗證低頻 DC gain |
| CS-P1-04 | P1 | Done | Controller comparison table | Compare 面板列出 controller candidates 與指標 | comparison snapshots | Snapshot/export 包含 controller formula、metrics、compensator config |

Exit criteria: 已達成。

### Phase 2: Discrete-Time / z-domain

目標：補控制工具常見的離散系統基礎能力，但仍保持 SISO 範圍。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P2-01 | P1 | Done | Discrete transfer function model | 支援 `G(z)`、sample time、poles/zeros | TF parser extension | `DiscreteTransferFunction` tests |
| CS-P2-02 | P1 | Done | Discrete step response | 離散系統使用差分方程，不沿用 continuous RK4 | discrete TF model | `G(z)=0.5/(1-0.5z^-1)` fixture |
| CS-P2-03 | P1 | Done | z-plane pole-zero map | 顯示 unit circle 與離散穩定性 | Plotly pzmap | poles inside unit circle = stable |
| CS-P2-04 | P1 | Done | Continuous-to-discrete conversion | 支援 Tustin / ZOH 基礎轉換 | sample time UI | C2D tests |
| CS-P2-05 | P1 | Done | Discrete Bode response | 離散模式需頻域分析 | `discreteBodeData` | Phase 5 discrete Bode tests |
| CS-P2-06 | P1 | Done | High-order ZOH | 支援高階 continuous plant 離散化 | matrix exponential utilities | Phase 5 high-order ZOH tests |

Exit criteria: 已達成。

### Phase 3: Root Locus Interactive Design

目標：讓 Root Locus 成為可互動設計工具，而不只是圖表。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P3-01 | P1 | Done | Root Locus break points | 顯示 breakaway / break-in 候選點 | `root-locus.js` | Root Locus break point tests |
| CS-P3-02 | P1 | Done | jω crossing detection | 找出低 K 系統的 imaginary-axis crossing | `root-locus.js` | jω crossing regression tests |
| CS-P3-03 | P1 | Done | Branch sorting | 讓 Root Locus branch 顯示穩定可讀 | `sortRootLocusBranches` | branch sort tests |
| CS-P3-04 | P1 | Done | Interactive gain picker | 使用者可由 Root Locus 選 gain 並套用 | UI plot interaction | browser smoke / app handler |
| CS-P3-05 | P1 | Done | ZN PID from ultimate gain Ku/Tu | 由 Root Locus ultimate gain 轉成 P/PI/PID 參數 | Root Locus + PID | `3f77118` latest baseline |

Exit criteria: 已達成。

### Phase 4: Closed-Loop Design Assistant

目標：由規格反推 controller 建議，降低手動試參數成本。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P4-01 | P1 | Done | Specs to target poles | 由 overshoot / settling time 轉目標極點 | `specsToTargetPoles` | Phase 4 tests |
| CS-P4-02 | P1 | Done | Lead design for target PM | 由目標 PM 產生 Lead 補償器 | `designLeadForPM` | Phase 4 tests |
| CS-P4-03 | P1 | Done | Apply-back design result | Advisor / design result 可套回 controller | `app.js` handlers | `08f887d` baseline |
| CS-P4-04 | P1 | Done | Direct pole-placement K computation | 移除不必要手動 Root Locus 步驟 | advisor logic | `08b388b` baseline |

Exit criteria: 已達成。

### Phase 5: z-domain Advanced SISO Design

目標：把離散系統從分析推進到可設計。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P5-01 | P1 | Done | z-plane interaction | z-domain 圖表可支援設計回饋 | z-plane plot | Phase 5 browser/app verification |
| CS-P5-02 | P1 | Done | Deadbeat gain design | 離散控制常見基準設計 | `deadbeatGain` | Phase 5 Deadbeat test |
| CS-P5-03 | P1 | Done | Copy/apply Deadbeat K | 設計結果可回寫 controller | UI handlers | `btn-copy-deadbeat-k` |
| CS-P5-04 | P1 | Done | Math audit corrections | 修正數學推導與互動提示弱點 | audit fixture | Audit follow-up tests |

Exit criteria: 已達成。

### Phase 6: API Migration And Product Reliability

目標：把現有前端 JS 計算逐步切到統一 API，而不是一次重寫。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P6-01 | P1 | Done | Frontend analysis API toggle | 讓前端可選 local JS 或 API backend | API contract tests | `analysis-source` 支援 Local JS / FastAPI / Compare Local/API |
| CS-P6-02 | P1 | Done | API error surface in UI | API down / invalid payload 時 UI 應明確可恢復 | unified API | `api-analysis-status` 顯示 checking / ok / diff / error |
| CS-P6-03 | P1 | Done | Report export baseline | 先輸出 JSON/Markdown 報告 | existing export | `btn-export-report` 匯出 Markdown，包含 model/controller/metrics/stability/API status |
| CS-P6-04 | P2 | Done | Regression dashboard command | 一條命令跑 CLI/API/browser smoke | validation script | `node control-studio/scripts/control_regression_dashboard.mjs` |

Exit criteria: 已達成。

### Phase 7: State Feedback / Lyapunov / LQR

目標：利用目前已有 State-Space、controllability / observability rank，補第一批 state-space controller design 與理論穩定性證明能力。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P7-01 | P1 | Done | Matrix definiteness utilities | Lyapunov / LQR 都需要 symmetric、positive definite、eigenvalue checks | matrix utilities | `test_control.js` Phase 7 fixture |
| CS-P7-02 | P1 | Done | Continuous Lyapunov stability analysis | 理論驗證：`AᵀP + PA = -Q`，預設 `Q=I` | State-Space model, definiteness utilities | 穩定二階 A 解出 `P>0`；不穩定 A 回報 failed |
| CS-P7-03 | P1 | Done | Lyapunov UI proof panel | 顯示 `V(x)=xᵀPx`、`dV/dt=-xᵀQx`、P matrix、min eig(P) | CS-P7-02 | Advisor 面板已可顯示 Proven Stable / Failed |
| CS-P7-04 | P1 | Done | Pole placement for SISO State-Space | 進入 state feedback 的最小可行功能 | controllability matrix | 二階案例指定 poles 後，`eig(A-BK)` 等於目標 poles |
| CS-P7-05 | P2 | Done | State feedback UI | 輸入 desired poles、顯示 K、閉迴路 A matrix | CS-P7-04 | UI 顯示 K、閉迴路 poles、step response |
| CS-P7-06 | P2 | Done | LQR solver for 2x2/low-order systems | LQR 是進階控制主線，但需先限制範圍 | matrix utilities, Lyapunov utilities | 與已知小型 CARE 解對齊 |
| CS-P7-07 | P2 | Done | LQR Q/R tuning panel | 讓使用者調 Q/R 並看 response tradeoff | CS-P7-06 | Advisor 面板可調 Q/R 並顯示 K / poles / P |

Exit criteria: 已達成。
- 僅支援 SISO / low-order state-space 起步。
- 不做 MIMO UI。
- 每個 state feedback 案例需檢查 controllability。
- Lyapunov analysis 必須明確顯示適用條件：continuous-time、finite-dimensional state-space、Q positive definite。
- 理論驗證結果需同時列出 P matrix 與正定性判定，不只顯示自然語言。

### Phase 8: Observer / Kalman / LQG

目標：在 State Feedback 穩定後補估測器，並完整覆蓋連續/離散 Kalman 與 LQG 整合。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P8-01 | P2 | Done | Luenberger observer pole placement | `eig(A-LC)=[-4,-5]` 等於目標 poles，`L=[[7],[1]]` 對 G(s)=1/(s²+3s+2) |
| CS-P8-02 | P2 | Done | Observer simulation（含噪音注入） | x₀=[1,0]、x̂=0 時 eNorm 由 1 收斂到 <1e-8（無噪音）；噪音模式下顯示 yNoisy + innovation |
| CS-P8-03 | P2 | Done | Steady-state Kalman (LQE) | Dual of LQR，filter CARE 解出 `L_kf=[[0.672],[-0.274]]`，CARE residual ≈ 0 |
| CS-P8-04 | P2 | Done | Bryson 法則 Q/R 自動建議 | `Q_ii=1/δ²`, `R=1/δ_y²` 公式一致 |
| CS-P8-05 | P2 | Done | Q/R sensitivity slider | 拖動即時更新 L_kf 與 observer poles |
| CS-P8-06 | P2 | Done | Observer poles 疊加 Pole-Zero Map | 紫色菱形 ◆，計算後自動刷新 |
| CS-P8-07 | P2 | Done | Innovation 白噪音統計 | mean / std / ACF lag-1,2 vs ±1.96/√N 95% CI，自動診斷 |
| CS-P8-08 | P2 | Done | 離散 Kalman Filter | ZOH 離散化 + Riccati 差分方程，z-plane poles 全在 \|z\|<1 |
| CS-P8-09 | P2 | Done | LQG 模擬（FSF vs LQG 對比） | 自動 fallback 計算 K_lqr 與 L_kf（預設 Q=I, R=1），兩條響應曲線疊圖 |

### Phase 9: MIMO 基礎與設計

目標：把 ControlStudio 從 SISO 推進到 MIMO，但保持 SISO 流程零破壞。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P9-01 | P2 | Done | SISO/MIMO mode toggle | SISO 模式完全不變；MIMO 模式自動顯示矩陣輸入與 channel selector |
| CS-P9-02 | P2 | Done | MIMO State-Space 矩陣輸入 | n/m/p 維度，A/B/C/D textarea + 維度驗證 |
| CS-P9-03 | P2 | Done | Channel selector bar | u_j→y_i 個別檢視，重用全部 6 個 SISO plot tabs |
| CS-P9-04 | P2 | Done | ⊞ All view（matrix grid） | p×m 小格 step response 全覽，CSS grid 自適應 |
| CS-P9-05 | P2 | Done | RGA + 配對診斷 | 對角系統 RGA=I；耦合系統 λ≠1 並提示 swap |
| CS-P9-06 | P2 | Done | Singular Value Bode | σ_max / σ_min vs 頻率，log-log 軸 + 條件數 κ |
| CS-P9-07 | P2 | Done | Static Decoupler | W=G(0)⁻¹，套用後 RGA = I |
| CS-P9-08 | P2 | Done | MIMO LQR (R matrix) | Newton-Kleinman 迭代 CARE，K=m×n 矩陣，對解耦後對角系統 K=(√2−1)·I |

### Phase 10: Deferred High-Complexity / Productization

目標：依實際情境暴露出的缺口完善高階控制數學核心；產品化項目先暫緩。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P10-00 | P0 | Done | Phase 10 design baseline | 明確排除暫緩項，收斂高階控制開發順序 | Phase 0-9 complete | `CONTROL_SYSTEM_PHASE10_PLAN.md` |
| CS-P10-01 | P0 | Done | Schur / Hamiltonian CARE solver | Newton-Kleinman 對 marginally stable / unstable plant 不通用，需穩定 invariant-subspace CARE 路徑 | Phase 7-9 LQR/LQE/MIMO LQR | `test_control.js` analytic CARE + Spacecraft case |
| CS-P10-02 | P1 | Done | MPC baseline | discrete finite-horizon / unconstrained receding-horizon baseline | discrete + state-space mature | scalar integrator hand-derived Riccati fixture |
| CS-P10-03 | P2 | Done | Dynamic Decoupler | 頻域解耦（非僅 DC），先做 selected-frequency inverse prototype | MIMO mature | `G(jωc)·W(jωc)` 近似 I |
| CS-P10-04 | P2 | Done | Robust Control sensitivity baseline | `S/T/KS` 與 peak sensitivity，不直接 H∞ synthesis | numerical engine mature | `S/T/KS` DC identity + singular guard |
| CS-P10-09 | P1 | Next | MPC UI panel | 暴露 horizon / Q / R / x0 / steps，讓工程師能用介面完成 MPC baseline | CS-P10-02 | Browser smoke 顯示 `K0=0.6`, `u0=-0.6` |
| CS-P10-10 | P1 | Next | Robust sensitivity UI | 暴露 `S/T/KS`、`Ms/Mt/MKs`、risk | CS-P10-04 | Browser smoke 顯示 `S(0)=0.5`, `T(0)=0.5` |
| CS-P10-11 | P1 | Next | Dynamic Decoupler UI | 暴露 `ωc` input、complex W、`G(jωc)W(jωc)` residual | CS-P10-03 | Browser smoke 顯示 off-diagonal residual |
| CS-P10-12 | P2 | Planned | Robust edge-case fixtures | 補低 PM、RHP zero、high sensitivity cases | CS-P10-04 | fixture-based peak sensitivity checks |
| CS-P10-05 | P3 | Paused | Electron packaging | 使用者要求擱置 | 主功能凍結 | 暫不做 |
| CS-P10-06 | P3 | Paused | 教學模式 | 使用者要求擱置 | UI 穩定 | 暫不做 |
| CS-P10-07 | P3 | Paused | 報告模板 / 報告自動化 | 使用者要求擱置 | Scenario docs mature | 暫不做 |
| CS-P10-08 | P3 | Paused | Block Diagram expansion | 使用者已要求先暫置 | SISO advanced stable | 恢復前需重新確認需求 |

## Immediate Next 3 Commits

建議後續 agent 依序做：

1. `feat(phase10): add MPC UI panel`
   - Advisor 或 Sim 面板顯示 horizon / Q / R / x0 / first action / cost。

2. `feat(phase10): add robust sensitivity UI`
   - S / T / KS、peak sensitivity、risk summary。

3. `feat(phase10): add dynamic decoupler UI`
   - MIMO Analysis 加 `ωc` 與 residual summary。

## Do Not Start Yet

以下項目先不要直接開發：
- 教學模式
- Electron packaging
- 報告模板 / 報告自動化
- Block Diagram 新功能

原因：使用者已明確要求擱置，後續 agent 不應自行恢復。
