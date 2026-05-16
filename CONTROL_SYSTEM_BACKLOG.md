# Control System Backlog

此文件定義 ControlStudio 後續開發的先後順序。後續 agent 若要開發控制系統功能，應先讀：

1. `CONTROL_SYSTEM_PLAN.md`
2. `CONTROL_SYSTEM_VERIFICATION_CASES.md`
3. `CONTROL_SYSTEM_BACKLOG.md`

目前策略：
- Block Diagram 暫時擱置，不在近期主線投入新功能。
- 目前主線已完成 SISO continuous/discrete、PID/Lead/Lag、Root Locus 互動設計、z-domain、C2D、Closed-loop design assistant、Deadbeat 與 Ziegler-Nichols PID from Ku/Tu。
- 下一階段先補報告匯出、API/local 分析切換、低階 State Feedback / LQR scaffold。
- 每個功能必須有數學推導或 fixture 驗證，不只看 UI 是否可操作。
- 避免一次跳到 MIMO / MPC / Robust Control；先把 SISO 進階控制鏈做穩。

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
- Latest synced commit: `3f77118 feat(rlocus): ZN PID tuning from ultimate gain Ku/Tu`
- Validation baseline:
  - `node test_control.js`
  - `node control-studio/scripts/verify_control_cases.mjs`
  - `node control-studio/scripts/verify_control_api_contract.mjs`

## Development Sequence

### Phase 0: Stabilize Verification And API Contract

目標：先把目前已完成能力鎖穩，讓後續進階功能有可信基準。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P0-01 | P0 | Done | Fixture-based verification runner | 五個數學推導案例已轉成可重跑 fixture，避免手動驗證流失 | `CONTROL_SYSTEM_VERIFICATION_CASES.md` | `node control-studio/scripts/verify_control_cases.mjs` |
| CS-P0-02 | P0 | Done | API contract tests | 防止 FastAPI 與 JS CLI schema / formula drift | `control_analysis_cli.mjs`, `control_api.py` | `node control-studio/scripts/verify_control_api_contract.mjs` |
| CS-P0-03 | P0 | Done | Browser regression smoke | 固定核心 UI 流程：輸入 plant、調 controller、看 plot、匯出 | 前端服務 `8765`, API `8770` | `window.ControlStudioSmoke.run()` |
| CS-P0-04 | P0 | Done | Input validation hardening | 統一 TF/SS/ZPK/Lead/Lag 錯誤提示與邊界條件 | 現有 field error helper | `test_control.js` 與 browser smoke |

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
| CS-P6-01 | P1 | Next | Frontend analysis API toggle | 讓前端可選 local JS 或 API backend | API contract tests | 兩種模式同 payload 結果一致 |
| CS-P6-02 | P1 | Next | API error surface in UI | API down / invalid payload 時 UI 應明確可恢復 | unified API | browser smoke |
| CS-P6-03 | P1 | Next | Report export baseline | 先輸出 JSON/Markdown 報告 | existing export | 匯出包含 model/controller/metrics/plots metadata |
| CS-P6-04 | P2 | Planned | Regression dashboard command | 一條命令跑 CLI/API/browser smoke | validation script | CI-like local report |

Exit criteria:
- API 與 local JS 差異被可視化或記錄。
- 任何 API failure 不會清空使用者目前專案狀態。

### Phase 7: State Feedback / LQR

目標：利用目前已有 State-Space、controllability / observability rank，補第一批 state-space controller design。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P7-01 | P1 | Planned | Pole placement for SISO State-Space | 進入 state feedback 的最小可行功能 | controllability matrix | 二階案例指定 poles 後，`eig(A-BK)` 等於目標 poles |
| CS-P7-02 | P2 | Planned | State feedback UI | 輸入 desired poles、顯示 K、閉迴路 A matrix | CS-P7-01 | UI 顯示 K、閉迴路 poles、step response |
| CS-P7-03 | P2 | Planned | LQR solver for 2x2/low-order systems | LQR 是進階控制主線，但需先限制範圍 | matrix utilities | 與已知小型 CARE 解或 fixture 對齊 |
| CS-P7-04 | P2 | Planned | LQR Q/R tuning panel | 讓使用者調 Q/R 並看 response tradeoff | CS-P7-03 | Q/R 改變時 K 與 poles 合理變化 |

Exit criteria:
- 僅支援 SISO / low-order state-space 起步。
- 不做 MIMO UI。
- 每個 state feedback 案例需檢查 controllability。

### Phase 8: Observer And Kalman

目標：在 State Feedback 穩定後補估測器，不提前讓 UI 與數學負擔爆開。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P8-01 | P2 | Planned | Luenberger observer pole placement | 先做 deterministic observer，比 Kalman 簡單且可手推 | observability matrix | `eig(A-LC)` 等於目標 observer poles |
| CS-P8-02 | P2 | Planned | Observer simulation | 顯示 estimated state vs output error | CS-P8-01 | estimation error 收斂 |
| CS-P8-03 | P3 | Planned | Basic Kalman filter | 需噪聲模型與 covariance UI，較晚做 | observer simulation | 小型 fixture 與理論 covariance trend 對齊 |

### Phase 9: Deferred High-Complexity Features

目標：明確標記暫緩，避免後續 agent 提早開太大的面。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P9-01 | P3 | Planned | MIMO | 資料模型、UI、圖表與分析都會大幅擴張 | State-Space mature | 需獨立設計文件 |
| CS-P9-02 | P3 | Planned | MPC | 需要 optimization、constraints、horizon UI | discrete + state-space mature | 需獨立設計文件 |
| CS-P9-03 | P3 | Planned | Robust Control | 需要 uncertainty model 與 sensitivity analysis | API + numerical engine mature | 需獨立設計文件 |
| CS-P9-04 | P3 | Paused | Block Diagram expansion | 使用者已要求先暫置，避免分散主線 | SISO advanced stable | 恢復前需重新確認需求 |

## Immediate Next 3 Commits

建議後續 agent 依序做：

1. `feat(control): add report export baseline`
   - JSON/Markdown 報告包含 model/controller/metrics/plot metadata。

2. `feat(control): add frontend analysis API toggle`
   - 讓前端可選 local JS 或 FastAPI backend。
   - 對同 payload 顯示 API/local 差異或錯誤狀態。

3. `feat(control): add state feedback scaffold`
   - 先做 low-order SISO pole placement 與 controllability guard。

## Do Not Start Yet

以下項目先不要直接開發：
- MIMO
- MPC
- Robust Control
- 完整 Electron packaging
- Block Diagram 新功能

原因：目前核心驗證、API contract、SISO 進階控制還需要先站穩。
