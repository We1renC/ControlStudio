# Control System Backlog

此文件定義 ControlStudio 詳細 task ledger。實際 phase 狀態、下一步開發順序與文件同步工作流以 `control-studio/ROADMAP.md` 為準；本文件保留 task ID、依賴與驗證證據。

後續 agent 若要開發控制系統功能，應先讀：

1. `control-studio/ROADMAP.md`
2. `docs/src/control-studio/plan.md`
3. `docs/src/control-studio/verification.md`
4. `docs/src/control-studio/backlog.md`
5. `docs/src/control-studio/skills.md`

目前策略：
- Block Diagram 暫時擱置，不在近期主線投入新功能。
- Phase 0-22 已完成主線：SISO 全鏈、State Feedback / Lyapunov / LQR、Observer / Kalman / LQG、MIMO 基礎與設計、MPC / Robust baseline、P12~P17 product maturity、P18 robust validation、P19 H∞ Riccati baseline、P20 MPC engineering、P21 advanced SysID、P22 verification infrastructure。
- Phase 23-28 目前狀態以 `control-studio/ROADMAP.md` 為準：P23/P24/P25/P26/P27/P28 均已完成目前 deterministic baseline。
- `CONTROL_SYSTEM_PHASE10_PLAN.md` 已屬歷史設計基線；目前主線已超過該文件。
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

- Branch: `main`
- Latest synced checkpoint: `fix(control): use step amplitude for API metrics`
- Current checkpoint: **CS-P0 ~ CS-P66 done; Functional Roadmap Tier A-J done; Phase 19/20/21/23 project-local skill gaps closed; nonlinear equilibrium classification, nonlinear grid-scan hardening, continuous analysis-grid hardening, continuous-analysis domain guards, continuous frequency/robust domain guards, P41 discretization comparison API-contract repair, runtime UI symbol contract enforcement, API open-loop controller cascade response contract, non-step response metrics gating, step amplitude metrics reference contract, discrete Bode grid hardening, continuous/ZPK DC gain origin-cancellation hardening, discrete DC gain unit-root hardening, discrete delay pole hardening, discrete delay polynomial normalization hardening, discrete interconnection hardening, matched-z removable origin gain normalization hardening, matched-z properness hardening, impulse-invariant repeated-pole hardening, impulse-invariant direct-feedthrough hardening, negative-loop phase-margin branch hardening, time-response input/properness hardening, discrete response input hardening, delay margin hardening, step metrics contract hardening, and Routh-Hurwitz input hardening closed; verification aggregation closed.** 詳細執行看板見 `control-studio/ROADMAP.md`。目前僅暫停項目維持不做：教學模式、Electron packaging、報告模板 / 報告自動化、Block Diagram expansion。
- Functional Roadmap Tier A-J checkpoint：Tier A control algorithms、Tier B identification、Tier C estimation、Tier D optimization、Tier E numerical repair、Tier F verification/safety、Tier G advanced MPC、Tier H embedded deployment、Tier I runtime architecture、Tier J HIL/integration 均已有 deterministic verification baseline；最新 full suite 基線見 `control-studio/ROADMAP.md`。
- Scenario 5 browser walkthrough result: Phase 10 math + UI both operational.
- Scenario 6 browser walkthrough result: SISO / MIMO core workflows are UI-operable.
- Latest full-theory audit:
  - `7a318b3 fix(control): harden phase 7-9 theory diagnostics`
  - `46e20da fix(control): harden phase 0-6 theory checks`
- Validation baseline (aggregated via `npm run verify:math` / `npm run verify:all`)：
  - `node control-studio/scripts/verify_math_core.mjs`
  - `node control-studio/scripts/verify_phase10_math_core.mjs`
  - `node control-studio/scripts/verify_phase9_math_core.mjs`
  - `node control-studio/scripts/verify_phase10_cross_method.mjs`
  - `node control-studio/scripts/verify_phase9_phase10_edge_cases.mjs`
  - `node control-studio/scripts/verify_phase10_care_robustness.mjs`
  - `node control-studio/scripts/verify_phase10_high_order_care.mjs`
  - `node control-studio/scripts/verify_phase10_mpc_constraints.mjs`
  - `node control-studio/scripts/verify_phase11_dare.mjs`
  - `node control-studio/scripts/verify_phase11_setpoint_and_state_constraints.mjs`
  - `node control-studio/scripts/verify_phase11_hinf.mjs`
  - `node control-studio/scripts/verify_phase11_dynamic_rga.mjs`
  - `node control-studio/scripts/verify_p14_delay.mjs`
  - `node control-studio/scripts/verify_p14_imc.mjs`
  - `node control-studio/scripts/verify_p14_rng.mjs`
  - `node control-studio/scripts/verify_p15_sysid.mjs`
  - `node control-studio/scripts/verify_p16_hinf.mjs`
  - `node control-studio/scripts/verify_p16_ga.mjs`
  - `node control-studio/scripts/verify_equilibrium_nd.mjs`
  - `node test_control.js`
  - `node control-studio/scripts/verify_control_cases.mjs`
  - `node control-studio/scripts/verify_control_api_contract.mjs`
  - `node control-studio/scripts/control_regression_dashboard.mjs`
  - `./scripts/validate_nvidia_model_selector.sh`
- Full suite baseline：`npm run verify:all` / `bash control-studio/scripts/run_all_verify.sh` 目前納入 111 個 deterministic verification scripts，包含 fixture、API contract、runtime UI symbol contract 與 n-dimensional equilibrium classification regression；fixture/API contract 目前為 8/8 cases。
- Pre-push hook：`bash scripts/install-hooks.sh` 啟用後，每次 `git push` 會跑 `verify:math`；失敗阻擋 push（用 `git push --no-verify` 可跳過）。

## Development Sequence

### Phase 0: Stabilize Verification And API Contract

目標：先把目前已完成能力鎖穩，讓後續進階功能有可信基準。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P0-01 | P0 | Done | Fixture-based verification runner | 五個數學推導案例已轉成可重跑 fixture，避免手動驗證流失 | `docs/src/control-studio/verification.md` | `node control-studio/scripts/verify_control_cases.mjs` |
| CS-P0-02 | P0 | Done | API contract tests | 防止 FastAPI 與 JS CLI schema / formula drift | `control_analysis_cli.mjs`, `control_api.py` | `node control-studio/scripts/verify_control_api_contract.mjs` |
| CS-P0-03 | P0 | Done | Browser regression smoke | 固定核心 UI 流程：輸入 plant、調 controller、看 plot、匯出 | 前端服務 `8765`, API `8770` | `window.ControlStudioSmoke.run()` |
| CS-P0-04 | P0 | Done | Input validation hardening | 統一 TF/SS/ZPK/Lead/Lag 錯誤提示與邊界條件 | 現有 field error helper | `test_control.js` 與 browser smoke |
| CS-P0-05 | P0 | Done | Math core verification runner | 獨立鎖住 Complex / Polynomial / Matrix / ODE / TF / DTF / State-Space / C2D 基礎不變量 | math/control core modules | `node control-studio/scripts/verify_math_core.mjs` |
| CS-P0-06 | P0 | Done | Continuous analysis grid guards | Bode / Nyquist / Nichols / Root Locus / jω crossing 對非法範圍或單點 grid 明確 throw，避免 NaN samples | frequency/root-locus core | `node control-studio/scripts/verify_math_core.mjs` |
| CS-P0-07 | P0 | Done | Time-response input and properness guards | Step / impulse / ramp / sine / square / pulse 與 PID anti-windup simulation 對 duration、sample count、waveform、disturbance、initial state、controller gain、saturation bounds 先做 finite / positivity guard；continuous TF time response 拒絕 improper plant，biproper feedthrough 會計入 disturbance，PID anti-windup 限定 strictly proper plant，避免 NaN trajectory 或 feedthrough-inconsistent sample | `time-response.js` | `node control-studio/scripts/verify_math_core.mjs` |
| CS-P0-08 | P0 | Done | Discrete response input guards | z-domain step / impulse response 對 sample count、amplitude、sample time、num/den 係數先做 finite / positivity guard，並支援 `den[0] != 1` 的標準差分方程除法 | `discrete-response.js` | `node control-studio/scripts/verify_math_core.mjs` |
| CS-P0-09 | P0 | Done | Step metrics contract guards | `stepInfo()` 對 t/y shape、finite samples、strictly increasing time、final value、reference 先做資料契約檢查；invalid response 回傳 `valid:false` 而非偽裝成有效性能指標 | `stability.js` | `node test_control.js` |
| CS-P0-10 | P0 | Done | Routh-Hurwitz input guards | `routhTable()` 對 denominator array、length、finite coefficients、zero polynomial、leading coefficient 先做資料契約檢查；invalid denominator 會明確 throw 而非被誤分類為 stable | `stability.js` | `node test_control.js` |
| CS-P0-11 | P0 | Done | DC gain origin-cancellation guards | Continuous TF / ZPK `dcGain()` 先消去 removable origin pole-zero factors；`s/s` 回傳 1、extra origin zero 回傳 0、extra origin pole 保留 signed infinity，避免 RGA / decoupler / low-frequency design 把可消 integrator 誤當真實 steady-state singularity | `transfer-function.js`, `zpk.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-12 | P0 | Done | Negative-loop phase-margin branch guards | `stabilityMargins()` 以 continuous unwrapped Bode phase branch 計算 PM；negative low-frequency loop 從 `-180 deg` branch 起算，避免 `L(s)=-2/(s+1)` 被 principal phase 誤報為高正 PM，並與不穩定 unity-feedback pole 對齊 | `stability.js` | `node test_control.js` |
| CS-P0-13 | P0 | Done | Discrete DC gain unit-root cancellation guards | Discrete TF `dcGain()` 以 `q=z^-1=1` 的低頻極限計算，先消去 removable unit-circle factors；`(1-z^-1)/(1-z^-1)` 回傳 1、extra unit-circle zero 回傳 0、extra unit-circle pole 回傳 Infinity，避免 z-domain step final、C2D DC preservation、discrete controller comparison 把可消 unit root 當真實 steady-state singularity | `discrete-transfer-function.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-14 | P0 | Done | Matched-Z removable origin gain normalization guards | `c2dMatchedZ()` 先保留 continuous leading gain，再用 Discrete TF `dcGain()` 低頻極限做 DC normalization；`2s/s` 這類 removable origin pole-zero 會離散成 removable `z=1` pair 並保留 DC gain 2，不再因 raw coefficient sums 為 0 而退回 unity gain | `c2d.js`, `discrete-transfer-function.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-15 | P0 | Done | Matched-Z properness guard | `c2dMatchedZ()` 與 Tustin / ZOH / impulse-invariant 一致，先拒絕 improper continuous plant；`(s+1)^2/(s+1)` 這類不可實現原始模型不再被靜默映射成看似穩定的 discrete TF | `c2d.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-16 | P0 | Done | Impulse-invariant repeated-pole guard | `c2dImpulseInvariant()` 明確只支援 simple poles；遇到 `1/(s+1)^2` 這類 repeated pole 會要求改用 ZOH 或 Tustin，不再靜默回傳 zero DTF 或巨大錯誤 DC gain | `c2d.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-17 | P0 | Done | Impulse-invariant direct-feedthrough guard | `c2dImpulseInvariant()` 明確只支援 strictly proper continuous systems；`(s+2)/(s+1)` 這類 biproper plant 的 direct-feedthrough impulse 不會被 residue-only DTF path 靜默丟棄，需改用 ZOH 或 Tustin | `c2d.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-18 | P0 | Done | Discrete delay pole guard | `DiscreteTransferFunction.poles()` 會補上 numerator delay order 大於 denominator order 時的隱含 `z=0` causal delay poles；`num=[0,1], den=[1]` 不再回傳 empty pole set，避免 z-plane map 與 discrete stability summary 漏掉純延遲極點 | `discrete-transfer-function.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-19 | P0 | Done | Discrete delay polynomial normalization guard | `DiscreteTransferFunction` 會修剪 numerator/denominator 尾端 structural zeros，同時保留 numerator 前導零作為 real input delay；`num=[1,0,0], den=[1,0]` 不再產生 spurious `z=0` zero/pole，`den=[0,1]` 會明確拒絕為 invalid non-causal denominator | `discrete-transfer-function.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-20 | P0 | Done | Discrete interconnection alignment guard | `DiscreteTransferFunction.parallel()` / `feedback()` 使用 z^-1 係數 index 對齊加法，並讓 feedback path sample time 必須一致；`0.5/(1-0.5z^-1)` unity feedback 保留閉迴路 pole `z=1/3`，mixed-order parallel 不再被誤折成 static gain | `discrete-transfer-function.js` | `node control-studio/scripts/verify_math_core.mjs`, `node control-studio/scripts/verify_tf_ss_zpk_c2d.mjs` |
| CS-P0-21 | P0 | Done | Continuous-analysis domain guard | Continuous root-locus helpers 與 `stabilityMargins()` 只接受 s-domain transfer functions；finite `sampleTime` 的 discrete TF 會明確 throw，避免 z-domain polynomial 被誤當 `den(s)+Knum(s)` 或 `G(jω)` margin scan | `root-locus.js`, `stability.js` | `node control-studio/scripts/verify_math_core.mjs` |
| CS-P0-22 | P0 | Done | Continuous frequency and robust domain guard | Continuous Bode / Nyquist / Nichols / auto-frequency range / Nyquist encirclement 與 robust `S/T/KS` helpers 只接受 s-domain loop；finite `sampleTime` 的 discrete TF 會明確 throw，避免 z-domain model 被誤報成 continuous frequency response 或 robustness metric | `frequency-response.js`, `robust.js` | `node control-studio/scripts/verify_math_core.mjs` |
| CS-P0-23 | P0 | Done | P41 discretization comparison API-contract repair | Discretization comparison 不再使用舊 `bodeData(sys, [w])` / `bodeData(sys, omegas)` / `discreteBodeData(disc, Ts, omegas)` 呼叫形狀；phase error 改用 explicit single-frequency helpers，Bode overlay 使用 Nyquist 以下 shared grid，DC gain 使用 `disc.dcGain()` | `app.js`, `verify_p41_disc_spec.mjs` | `node control-studio/scripts/verify_p41_disc_spec.mjs` |
| CS-P0-24 | P0 | Done | Runtime UI symbol contract enforcement | Runtime UI source 不再以 emoji / pictographic glyphs 表示 button、status badge、warning、command palette icon、report cell 或動態 DOM 狀態；改用文字狀態與既有 CSS class，並由 verifier 掃描 `index.html`、`js/app.js`、`js/ui/*.js` 與 report/status modules | `index.html`, `app.js`, `js/ui/*.js`, `productization.js`, `state-feedback.js`, `verify_ui_symbol_contract.mjs` | `node control-studio/scripts/verify_ui_symbol_contract.mjs` |
| CS-P0-25 | P0 | Done | API open-loop controller cascade response contract | Unified API / CLI 在 `simulation.mode === "open_loop"` 且存在 controller 時模擬 `C(s)G(s)`，不再回傳 plant-only time response；golden fixture 新增 open-loop controller cascade case，並要求 CLI response final value 對齊 expected | `control_analysis_cli.mjs`, `verification-cases.js`, `verify_control_cases.mjs`, `verify_control_api_contract.mjs`, `control_regression_dashboard.mjs` | `node control-studio/scripts/verify_control_cases.mjs`; `node control-studio/scripts/verify_control_api_contract.mjs` |
| CS-P0-26 | P0 | Done | Non-step response metrics gating | Unified API / CLI 對 impulse、ramp、sine、square、pulse response 不再輸出 step metrics；metrics 會回傳 `valid:false` 與 explicit reason，避免非 step waveform 被誤報為有效 rise/settling/overshoot/SSE | `control_analysis_cli.mjs`, `verification-cases.js`, `verify_control_cases.mjs`, `verify_control_api_contract.mjs`, `control_regression_dashboard.mjs` | `node control-studio/scripts/verify_control_cases.mjs`; `node control-studio/scripts/verify_control_api_contract.mjs` |
| CS-P0-27 | P0 | Done | Step amplitude metrics reference contract | Unified API / CLI 對 step response 會用 `simulation.amplitude` 作為 `stepInfo()` reference；非單位 step 的 SSE 不再固定對 unity 計算。golden fixture 新增 amplitude=2 case，直接驗 final value 與 `steadyStateError` | `control_analysis_cli.mjs`, `verification-cases.js`, `verify_control_cases.mjs`, `verify_control_api_contract.mjs`, `control_regression_dashboard.mjs` | `node control-studio/scripts/verify_control_cases.mjs`; `node control-studio/scripts/verify_control_api_contract.mjs` |

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
| CS-P2-07 | P1 | Done | Discrete Bode grid guards | `omegaMin` 必須有限且小於 Nyquist，`samples` 必須有限，zero-magnitude dB 輸出需保持有限 | `discreteBodeData` | `node control-studio/scripts/verify_math_core.mjs` |

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
| CS-P9-09 | P1 | Done | MIMO mode UI cleanup | 清空/摺疊 Phase 7 SISO-only 舊結果，並讓 MIMO Analysis 更容易發現 | Browser walkthrough：切 SISO 算 LQR → 切 MIMO → `phase7-lqr-out` 隱藏且無舊 K；MIMO Analysis order = -1 |
| CS-P9-10 | P2 | Done | MIMO matrix output readability | RGA / decoupler / G(0)W 改為 row/column-labeled matrix table | Browser smoke：RGA 1 table；Decoupler 3 tables，含 `y_i/u_j`、`u_i/v_j`、`y_i/v_j` |
| CS-P9-11 | P2 | Done | Singular Value chart readability | 提高 `#chart-mimo-sv` 高度並顯示 `σ_max` / `σ_min` legend | Browser smoke：chart height = 280px；DOM legend text = `σ_max`, `σ_min` |

### Phase 10: Deferred High-Complexity / Productization

目標：依實際情境暴露出的缺口完善高階控制數學核心；產品化項目先暫緩。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P10-00 | P0 | Done | Phase 10 design baseline | 明確排除暫緩項，收斂高階控制開發順序 | Phase 0-9 complete | `CONTROL_SYSTEM_PHASE10_PLAN.md` |
| CS-P10-01 | P0 | Done | Schur / Hamiltonian CARE solver | Newton-Kleinman 對 marginally stable / unstable plant 不通用，需穩定 invariant-subspace CARE 路徑 | Phase 7-9 LQR/LQE/MIMO LQR | `verify_phase10_math_core.mjs` analytic CARE + Spacecraft case |
| CS-P10-02 | P1 | Done | MPC baseline | discrete finite-horizon / unconstrained receding-horizon baseline | discrete + state-space mature | `verify_phase10_math_core.mjs` scalar Riccati + convergence |
| CS-P10-03 | P2 | Done | Dynamic Decoupler | 頻域解耦（非僅 DC），先做 selected-frequency inverse prototype | MIMO mature | `verify_phase10_math_core.mjs` checks `G(jωc)·W(jωc)≈I` |
| CS-P10-04 | P2 | Done | Robust Control sensitivity baseline | `S/T/KS` 與 peak sensitivity，不直接 H∞ synthesis | numerical engine mature | `verify_phase10_math_core.mjs` checks `S/T/KS` identity + singular guard |
| CS-P10-09 | P1 | Done | MPC UI panel | Advisor `#mpc-panel`：Ts/horizon/Q/R/x₀，receding-horizon sim + Plotly x(t)/u(t) | CS-P10-02 | f945ced；`test_control.js` MPC integrator 收斂測試 |
| CS-P10-10 | P1 | Done | Robust sensitivity UI | Advisor `#robust-panel`：ω 範圍 → \|S\|/\|T\|/\|KS\| Bode + peak + risk badge | CS-P10-04 | f945ced；瀏覽器驗證 peak \|S\|=1.05 for `1/(s²+3s+2)` |
| CS-P10-11 | P1 | Done | Dynamic Decoupler UI | MIMO Analysis `#mimo-dyn-decoupler-out`：ωc → G(jωc), W=G⁻¹, off-diagonal residual | CS-P10-03 | f945ced；2×2 coupled plant residual=0 |
| CS-P10-12 | P2 | Done | Robust edge-case fixtures | 補 NMP (RHP zero) / Padé delay / 1+L=0 / 高 \|S\| 等高風險 case | CS-P10-04 | `verify_phase9_phase10_edge_cases.mjs` 15/15 pass，含 NMP peak \|S\|=1.35、Padé delay loop、S+T=1 identity |
| CS-P10-13 | P2 | Done | Gain/phase uncertainty sweep | `uncertaintyEnvelope(loop, ω, {gainFactors, phaseShiftsDeg, controllerTf})` 計算最壞情況 \|S\|/\|T\|/\|KS\| envelope；Advisor robust panel 加 `±gain%` / `±phase°` / samples 與 worst-vs-nominal 疊圖 + worst/nominal 比值 | CS-P10-10 | `verify_phase10_math_core.mjs` 4 cases；UI 驗證：plant `1/(s²+3s+2)` ±20%/±15° 7×7 sweep → worst\|S\|=1.114 vs nominal 1.05 |
| CS-P10-14 | P2 | Done | MPC constraint UI + QP solver | condensed MPC formulation + Hildreth 座標下降 box QP (u_min ≤ u ≤ u_max)；Advisor MPC panel 加 u_min/u_max 輸入與「Compare Constrained vs Unconstrained」按鈕 + 疊圖；11/11 L1-L4 驗證 case | CS-P10-09 | `verify_phase10_mpc_constraints.mjs` 11/11 pass；UI 驗證：double-integrator ±0.5 bound 比較疊圖 |
| CS-P10-15 | P1 | Done | Schur CARE jω-boundary case | Hamiltonian 特徵值靠近虛軸 / 不 stabilizable 時 eigenvector path 會 fail；改為丟出含「stabilizability / boundary」友善訊息（非 NaN）。真正的 real Schur fallback 留待後續 | CS-P10-01 | `verify_phase10_care_robustness.mjs` 3 cases：jω uncontrollable、fully unstabilizable、near-boundary 仍可解 |
| CS-P10-16 | P1 | Done | Schur vs Bass 對比測試（spacecraft sparse-B） | Spacecraft case 同時測 Schur 通過 (residual 1e-15) 與 Newton-Kleinman/Bass 失敗的友善訊息（已更新訊息明確推薦 Schur path） | CS-P10-01 / CS-P10-15 | `verify_phase10_care_robustness.mjs` 3 cases：Schur 通過 + Lyapunov 證、Kleinman 失敗含 Schur 提示、default path = Schur |
| CS-P10-17 | P2 | Done | 高階 CARE 壓測 (n ≥ 4) + Matrix Sign Fallback | matrix sign function (Newton iteration)：n≥5 改用 sign(H) = Newton iteration → P=(I−Z)/2 stable projector → QR basis → P=YX⁻¹；n=4,5,6,8 全部 100% pass，residual ≤ 1e-13 | CS-P10-01 | `verify_phase10_high_order_care.mjs` 6×{n,m} 配置 + 4 assertions（n=8 從 0%→100%） |
| CS-P10-18 | P2 | Done | CI / pre-push verification hook | root `package.json` 加 `verify:math` / `verify:all` / phase-specific scripts；`scripts/git-hooks/pre-push` + `bash scripts/install-hooks.sh` 設 core.hooksPath；失敗 block push（可用 `--no-verify` 跳過） | CS-P10-12 / Phase 9-10 runners | `npm run verify:math` 跑核心 math + fixture suite；`npm run verify:all` 跑 111/111 full suite |
| CS-P10-05 | P3 | Paused | Electron packaging | 使用者要求擱置 | 主功能凍結 | 暫不做 |
| CS-P10-06 | P3 | Paused | 教學模式 | 使用者要求擱置 | UI 穩定 | 暫不做 |
| CS-P10-07 | P3 | Paused | 報告模板 / 報告自動化 | 使用者要求擱置 | Scenario docs mature | 暫不做 |
| CS-P10-08 | P3 | Paused | Block Diagram expansion | 使用者已要求先暫置 | SISO advanced stable | 恢復前需重新確認需求 |

### Phase 11: Math Gap Closure (CS-P11)

目標：補足 Phase 9/10 審視出的五大數學缺口，對齊業界工具水準。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P11-01 | P0 | Done | DARE 求解器 + MPC terminal cost P∞ | symplectic Cayley + matrix sign function；`solveDAREHamiltonianSign`；`finiteHorizonLqr` 加 `autoTerminalCost: true` 選項使 Qf = P∞，保證有限域成本 ≤ 無限域 | CS-P10-17 matrix sign | `verify_phase11_dare.mjs` 16/16：scalar golden ratio、DARE residual < 1e-15、Riccati limit 比對、MIMO 3×2 |
| CS-P11-02 | P1 | Done | MPC Setpoint Tracking (r ≠ 0) | error-state formulation e=x−r, v=u−u_ss；`solveSetpointSteadyState` + `simulateMpcTracking`；支援 constant 或 time-varying reference、u constraints；11/11 驗證 | CS-P11-01 | `verify_phase11_setpoint_and_state_constraints.mjs` 18/18：r=[2,0] 收斂到 1e-7、constrained 收斂、step reference 切換 |
| CS-P11-03 | P1 | Done | H∞ norm 估算 | `hInfNorm(mimoSys)` 粗網格 + golden-section 細化；`hInfNormUpperBound` 快速版；SISO/MIMO 均適用；1/(s+1)→1.0、K/(s+1)→K DC gain 均正確 | CS-P10-04 robust engine | `verify_phase11_hinf.mjs` 8/8 |
| CS-P11-04 | P2 | Done | 動態 RGA Λ(jω) | `dynamicRGA(mimoSys, omegas)`、`dynamicRGAMagnitude`、`dynamicRGADiagonal`；ω→0 收斂靜態 RGA；欄和 = 1 恆等式；non-square throws | CS-P9-05 static RGA | `verify_phase11_dynamic_rga.mjs` 8/8 |
| CS-P11-05 | P2 | Done | State constraints + soft slack | condensed QP 加 x_min/x_max 行（free-response active-set + 二次罰函數）；`firstMpcActionStateConstrained` + `simulateStateConstrainedMpc`；violation log 回報 | CS-P10-14 Hildreth QP | `verify_phase11_setpoint_and_state_constraints.mjs` 18/18：soft constraint 抑制速度超限、violation log 正確 |

## Completed Phase 10/11 Checkpoint

Phase 10 + Phase 11 全部完成：
- **CS-P10（全數）Done**：CARE/MPC/Robust/MIMO/Constraints 完整
- **CS-P11-01 Done**：DARE solver (symplectic Cayley + matrix sign) + `autoTerminalCost` — 16/16
- **CS-P11-02 Done**：MPC Setpoint Tracking (error-state, time-varying ref) — 18/18
- **CS-P11-03 Done**：H∞ norm grid + golden-section — 8/8
- **CS-P11-04 Done**：Dynamic RGA Λ(jω) — 8/8
- **CS-P11-05 Done**：State constraints + soft slack — 18/18

### Phase 12: Robust Visualisation Upgrade (CS-P12)

目標：把 robust analysis 從「有數字」提升成工程師可直接判讀的圖表。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P12-01 | P1 | Done | Robust sensitivity dB scale + reference lines | Browser / UI regression；`5eb8e8f` |
| CS-P12-02 | P1 | Done | Bandwidth metric + MIMO `||G||∞` visualisation | `hInfNorm()` + peak marker；`5eb8e8f` |

### Phase 13: UI/UX Usability Overhaul (CS-P13)

目標：整理可用性、可發現性、鍵盤操作與 accessibility，不改變數學核心。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P13-01 | P1 | Done | Collapsible sections / quick-start presets / confirm modal | Manual browser walkthrough；`9763296` |
| CS-P13-02 | P1 | Done | Live validation hints / loading states / keyboard shortcuts | Manual browser walkthrough；`9763296` |
| CS-P13-03 | P1 | Done | Responsive + a11y cleanup | Manual browser walkthrough；`9763296` |

### Phase 14: Delay / IMC / Formula / Robust Margin (CS-P14)

目標：補工業控制常用 dead-time / tuning / formula 表示與 robust margin 指標。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P14-01 | P1 | Done | Time delay / Padé / delay margin / Smith predictor | `node control-studio/scripts/verify_p14_delay.mjs` |
| CS-P14-02 | P1 | Done | IMC / SIMC PID tuning | `node control-studio/scripts/verify_p14_imc.mjs` |
| CS-P14-03 | P2 | Done | KaTeX LaTeX rendering | Browser regression；`e025a91` |
| CS-P14-04 | P2 | Done | Preset library expansion (8 → 28) | Manual browser walkthrough；`e025a91` |
| CS-P14-05 | P2 | Done | Disk margin + additive uncertainty | `test_control.js` + UI check；`e025a91` |
| CS-P14-06 | P1 | Done | Seedable RNG / reproducible LQG randomness | `node control-studio/scripts/verify_p14_rng.mjs` |
| CS-P14-07 | P1 | Done | Delay input and margin guards | `applyDelay()` / `delayPhase()` reject invalid delay inputs；`delayMargin()` clamps non-positive PM to 0 and preserves infinite PM | `node control-studio/scripts/verify_p14_delay.mjs` |

### Phase 15: Identification / Compare / Codegen / Animation (CS-P15)

目標：補工程流程能力，讓 Studio 不只分析既有模型，也能從資料識別並導出外部工具腳本。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P15-01 | P1 | Done | ARX system identification + auto order | `node control-studio/scripts/verify_p15_sysid.mjs` |
| CS-P15-02 | P2 | Done | Controller A/B compare with open-loop Bode overlay | Browser regression；`c2cc25d` |
| CS-P15-03 | P2 | Done | MATLAB / Python code generator | Generated script smoke；`c2cc25d` |
| CS-P15-04 | P2 | Done | Root-locus K-sweep animation | Browser regression；`c2cc25d` |

### Phase 16: Advanced Synthesis / Nonlinear Analysis (CS-P16)

目標：補更高階的 controller search 與非線性分析入口，但仍維持現有工作台結構。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P16-01 | P1 | Done | H∞ mixed-sensitivity PID synthesis helper | `node control-studio/scripts/verify_p16_hinf.mjs` |
| CS-P16-02 | P2 | Done | Loop shaping workflow（由 H∞ weights 承擔） | `84241c7` |
| CS-P16-03 | P2 | Done | Phase portrait + describing functions | Browser regression；`84241c7` |
| CS-P16-04 | P1 | Done | GA-based PID auto-tuner | `node control-studio/scripts/verify_p16_ga.mjs` |
| CS-P16-05 | P1 | Done | n-dimensional equilibrium classification | `node control-studio/scripts/verify_equilibrium_nd.mjs` |
| CS-P16-06 | P1 | Done | nonlinear scan grid-size and bounds guards | `node control-studio/scripts/verify_equilibrium_nd.mjs` |

### Phase 17: Advanced Robust / MIMO / MPC Extensions (CS-P17)

目標：把 Phase 16 後仍未展開的高階控制理論入口補成可驗證的數學核心。此 phase 採 browser-side deterministic baseline：H∞ 以 plant-order dynamic mixed-sensitivity optimizer 實作，μ synthesis 以 diagonal D-scaling upper-bound 與 DK-style static gain surrogate 實作；若未來要 MATLAB Robust Control Toolbox 等級，可再接 Riccati/LMI backend。

| ID | Priority | Status | Item | Verification |
| --- | --- | --- | --- | --- |
| CS-P17-01 | P1 | Done | Plant-order dynamic H∞ mixed-sensitivity synthesis | `node control-studio/scripts/verify_p17_advanced_control.mjs` |
| CS-P17-02 | P1 | Done | Structured μ D-scaling upper-bound + DK-style static gain surrogate | `node control-studio/scripts/verify_p17_advanced_control.mjs` |
| CS-P17-03 | P2 | Done | MIMO frequency-domain design diagnostics: characteristic loci, Gershgorin bands, inverse Nyquist array | `node control-studio/scripts/verify_p17_advanced_control.mjs` |
| CS-P17-04 | P1 | Done | MPC MIMO output-space setpoint tracking (`y_ref = Cx + Du`) | `node control-studio/scripts/verify_p17_advanced_control.mjs` |

**Validation aggregate status：`control-studio/scripts/run_all_verify.sh` 與 `npm run verify:all` 是目前主驗證入口；full suite 已納入 fixture/API contract、runtime UI symbol contract 與 n-dimensional equilibrium classification regression，最新基線為 111/111；fixture/API contract 為 8/8 cases。P22+ 新增的 P23 / P24 / P25 / P26 / P27 runner 以 roadmap 與 package scripts 為準。**

## Phase 18+ Research / Engineering Extension Ledger

Phase 18+ 已進入持續擴充狀態。下一步順序以 `control-studio/ROADMAP.md` 為準；本 ledger 必須維持三個邊界：
- 每個控制理論功能先補數學定義與 fixture，再補 UI。
- 若功能可拆成 agent workflow，需同步評估是否建立 skill。
- Teaching Mode / Electron / Report Template / Block Diagram expansion 持續 paused。

### Phase 18: Uncertainty + Monte Carlo Robust Validation (CS-P18)

目標：把 robust analysis 從 nominal sensitivity 指標推進到 uncertainty family 驗證，讓工程師能看到 worst-case response 與 robust pass/fail。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P18-01 | P1 | Done | Uncertainty model schema | 支援 parametric / additive / multiplicative uncertainty，且 payload 可序列化 | robust.js / project model | `verify:p18` schema fixtures |
| CS-P18-02 | P1 | Done | Deterministic Monte Carlo sampling | 固定 seed、sample count、sample replay，避免驗證不可重現 | seedable RNG | `verify:p18` deterministic replay |
| CS-P18-03 | P1 | Done | Worst-case robust metrics | 擷取 worst PM/GM、peak \|S\|、settling、overshoot、control effort | frequency/time response core | `verify:p18` worst-case extraction |
| CS-P18-04 | P1 | Done | Robust pass/fail specs | 以設計規格判斷 sample family 是否通過 | stability + metrics | `verify:p18` nominal-pass / uncertainty-fail case |
| CS-P18-05 | P2 | Done | Robust validation UI | 顯示 uncertainty inputs、sample distribution、worst-case replay、pass/fail summary | CS-P18-01~04 | Playwright/Chrome walkthrough on `127.0.0.1:8765` |
| CS-P18-06 | P1 | Done | `control-studio-robust-validator` skill baseline | 將 uncertainty validation workflow 抽成 agent 可重用流程 | `docs/src/control-studio/skills.md` | skill checklist + sample output |

### Phase 19: Full H-infinity / Mu Backend (CS-P19)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P19-01 | P2 | Done | Riccati/LMI H∞ synthesis backend decision | 決定使用 Python backend、WASM 或 JS baseline | Phase 17 robust baseline | design doc + numeric spike |
| CS-P19-02 | P2 | Done | Glover-Doyle H∞ synthesis | 取代 browser-side heuristic optimizer 的 full-order path | CS-P19-01 | residual + gamma golden cases |
| CS-P19-03 | P2 | Done | Full DK-iteration | dynamic D-scaling fit keeps reusable `D(jω)` model and dynamic D-K wrapper，取代只保留 peak-frequency constant D 的缺口 | CS-P19-02 | `verify_p19_dynamic_dk.mjs` |

### Phase 20: MIMO MPC Engineering Workflow (CS-P20)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P20-01 | P1 | Done | Offset-free MIMO tracking | 擾動存在時仍能消除 steady-state error | Phase 17 MPC MIMO tracking | step disturbance fixture |
| CS-P20-02 | P1 | Done | Output / delta-u constraints | 工程 MPC 需要輸出限制與 move suppression | Phase 11 state/input constraints | constrained MIMO tracking fixture |
| CS-P20-03 | P2 | Done | Feasibility diagnostics | 不可行時指出 constraint conflict | QP solver | infeasible setpoint fixture |
| CS-P20-04 | P1 | Done | Project-local `control-studio-mpc-designer` skill package | 將 MPC 建模、權重、constraint 設計流程標準化；已補專案版 references / examples / agent metadata | `docs/src/control-studio/skills.md` | `skills/control-studio-mpc-designer/` |

### Phase 21: Research-Grade System Identification (CS-P21)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P21-01 | P2 | Done | Experiment signal design | PRBS / chirp / multi-sine，改善識別資料品質 | Phase 15 ARX | known signal spectrum fixtures |
| CS-P21-02 | P2 | Done | ARMAX / OE / BJ candidates | 補 ARX 以外常用模型族 | sysid core | synthetic plant recovery |
| CS-P21-03 | P2 | Done | Subspace state-space ID | 支援 MIMO 與狀態空間研究流程 | matrix core | low-order MIMO recovery |
| CS-P21-04 | P1 | Done | Residual validation + uncertainty export | 讓 sysid 結果可接 Phase 18 robust validation | CS-P18 | whiteness + uncertainty fixtures |
| CS-P21-05 | P2 | Done | Project-local `control-studio-sysid-planner` skill package | 將實驗設計、模型族選型、殘差驗證與 uncertainty handoff 抽成 agent skill | `docs/src/control-studio/skills.md` | `skills/control-studio-sysid-planner/` |

### Phase 22: Benchmark + Cross-Tool Validation (CS-P22)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P22-01 | P1 | Done | Benchmark suite expansion | 將 SISO/MIMO/MPC/robust/sysid 案例統一成 benchmark library | verification cases | golden fixture manifest |
| CS-P22-02 | P1 | Done | MATLAB / Python Control comparison | 建立 cross-tool tolerance 與 drift detection | codegen + external scripts | comparison artifacts |
| CS-P22-03 | P1 | Done | `control-studio-benchmark-author` skill | 標準化新控制案例的推導與 fixture 產生 | `docs/src/control-studio/skills.md` | generated benchmark skeleton |

### Phase 23: Agentic Design Review (CS-P23)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P23-01 | P1 | Done | Structured design review schema | Advisor 建議需綁定數值證據與適用條件 | existing advisor | golden review cases |
| CS-P23-02 | P1 | Done | `control-studio-system-auditor` skill | 讓 agent 能先做 plant/controller 審查再開發 | `docs/src/control-studio/skills.md` | audit checklist examples |
| CS-P23-03 | P2 | Done | Project-local `control-studio-ui-verifier` skill package | 將 browser UI walkthrough、SISO/MIMO mode switching、plot/legend 與 issue report 標準化 | browser smoke | `skills/control-studio-ui-verifier/` |

### Phase 24: Advanced MPC (CS-P24)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P24-01 | P1 | Done | NMPC / SQP-lite | 支援非線性模型的 deterministic receding-horizon baseline | Phase 20 MPC engineering | `verify_p24_nmpc.mjs` |
| CS-P24-02 | P1 | Done | Tube MPC | 將 uncertainty 與 constrained MPC 接起來，支援 robust invariant tube | Phase 18 + Phase 20 | `verify_p24_tube_explicit_mpc.mjs` |
| CS-P24-03 | P1 | Done | Economic MPC | Differential Evolution finite-horizon non-quadratic economic objective，含 seed reproducibility 與 warm-start candidate | Phase 20 | `verify_p24_empc.mjs` |
| CS-P24-04 | P2 | Done | Explicit MPC | scalar PWA lookup policy，對照 online constrained MPC | Phase 20 | `verify_p24_tube_explicit_mpc.mjs` |

### Phase 25: Model Order Reduction (CS-P25)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P25-01 | P1 | Done | Balanced truncation | 對高階 plant 產生低階控制設計模型 | matrix / state-space core | `verify_p25_model_reduction.mjs` |
| CS-P25-02 | P2 | Done | Hankel norm approximation | 補更研究級的 model reduction 誤差界工具 | CS-P25-01 | `verify_p25_hankel.mjs` |
| CS-P25-03 | P1 | Done | SS minreal / Kalman decomposition | 移除不可控/不可觀 mode，降低 controller design 風險 | state-space core | `verify_p25_model_reduction.mjs` |

### Phase 26: Nonlinear Control (CS-P26)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P26-01 | P1 | Done | Gain-scheduled PID | 支援 operating-region dependent PID baseline | PID + nonlinear core | `verify_p26_nonlinear.mjs` |
| CS-P26-02 | P2 | Done | LPV synthesis | 將 gain scheduling 推進到更正式的 LPV design path | CS-P26-01 | `verify_p29_lpv.mjs` |
| CS-P26-03 | P1 | Done | Sliding mode control | 提供 robust nonlinear control baseline | nonlinear core | `verify_p26_nonlinear.mjs` |

### Phase 27: H-infinity Design Extensions (CS-P27)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P27-01 | P1 | Done | Full D-K iteration | dynamic D-scaling fit and dynamic D-K wrapper are implemented; future backend may replace static K-step with full-order controller fitting | Phase 19 | `verify_p19_dynamic_dk.mjs`, `verify_p29_dk.mjs` |
| CS-P27-02 | P1 | Done | Loop-shaping H∞ | 補 weighted loop-shaping design workflow | Phase 19 | `verify_p27_loop_shaping.mjs` |
| CS-P27-03 | P1 | Done | MIMO H∞ verification | 補 MIMO closed-loop robust performance verification | Phase 19 | `verify_p27_mimo_hinf.mjs` |

### Phase 28: Infrastructure Quality (CS-P28)

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P28-01 | P1 | Done | TypeScript definitions | 讓外部工具與 agent 可引用穩定 API surface | current JS modules | `control-studio/types/control-studio.d.ts` |
| CS-P28-02 | P2 | Done | JSDoc API docs | 將核心模組文件化，降低後續 agent 誤用數學 API 的風險 | CS-P28-01 | `control-studio/docs/api/index.html` |
| CS-P28-03 | P1 | Done | Performance benchmark | 追蹤數學核心與控制演算法速度退化 | verification runners | `control-studio/scripts/benchmark.mjs` |

## Do Not Start Yet

以下項目先不要直接開發：
- 教學模式
- Electron packaging
- 報告模板 / 報告自動化
- Block Diagram 新功能

原因：使用者已明確要求擱置，後續 agent 不應自行恢復。
