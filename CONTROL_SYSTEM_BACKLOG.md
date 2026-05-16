# Control System Backlog

此文件定義 ControlStudio 後續開發的先後順序。後續 agent 若要開發控制系統功能，應先讀：

1. `CONTROL_SYSTEM_PLAN.md`
2. `CONTROL_SYSTEM_VERIFICATION_CASES.md`
3. `CONTROL_SYSTEM_BACKLOG.md`

目前策略：
- Block Diagram 暫時擱置，不在近期主線投入新功能。
- 近期主線聚焦 SISO、State-Space、frequency response、stability metrics、API 化與可驗證控制器設計。
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

## Development Sequence

### Phase 0: Stabilize Verification And API Contract

目標：先把目前已完成能力鎖穩，讓後續進階功能有可信基準。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P0-01 | P0 | Done | Fixture-based verification runner | 五個數學推導案例已轉成可重跑 fixture，避免手動驗證流失 | `CONTROL_SYSTEM_VERIFICATION_CASES.md` | `node control-studio/scripts/verify_control_cases.mjs` 逐案輸出 pass/fail |
| CS-P0-02 | P0 | Done | API contract tests | FastAPI 與 JS CLI 目前共用邏輯但測試不夠明確，需防止 schema drift | `control_analysis_cli.mjs`, `control_api.py` | `node control-studio/scripts/verify_control_api_contract.mjs` 對 `/api/control/system/response` 與 `/api/control/system/stability` 跑 fixture |
| CS-P0-03 | P0 | Next | Browser regression smoke | UI 已多次手動調整，需固定核心流程：輸入 plant、調 controller、看 plot、匯出 | 前端服務 `8765`, API `8770` | 使用 in-app browser 驗證無 console error、主要元件可見 |
| CS-P0-04 | P0 | Planned | Input validation hardening | 進階控制會加入更多矩陣/參數，先統一錯誤提示與邊界條件 | 現有 field error helper | 無效 TF/SS/ZPK/Lead/Lag 參數能顯示錯誤且不破壞 state |

Exit criteria:
- `node test_control.js` 通過。
- `./scripts/validate_nvidia_model_selector.sh` 通過。
- 五個 verification cases 至少有 CLI 層自動化覆蓋。
- API 與 CLI 對同一 payload 的 formula / metrics 一致。

### Phase 1: Controller Design Presets

目標：在不引入高複雜度控制理論前，讓已完成的 PID + Lead/Lag 變成「可設計」而不只是「可調參」。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P1-01 | P1 | Next | PID tuning presets UI | 現有 `PIDController` 已有 Ziegler-Nichols / Cohen-Coon 靜態方法，但尚未 UI 化 | `pid.js` | 已知 Ku/Tu 或 FOPDT 參數輸入後，PID 係數符合公式 |
| CS-P1-02 | P1 | Next | Lead design helper | Lead 已可串接，但尚未根據 target phase boost / crossover 給建議 | `compensator.js`, Bode data | 設計結果需提升 PM，並符合 `alpha=(1-sin(phi))/(1+sin(phi))` |
| CS-P1-03 | P1 | Planned | Lag design helper | Lag 可改善低頻增益與 steady-state error，適合接在現有 frequency response | `compensator.js`, DC gain | 設計後 DC gain 提升，PM 不應大幅惡化 |
| CS-P1-04 | P1 | Planned | Controller comparison table | 現有 snapshot 只有摘要，需要更工程化比較 controller candidates | comparison snapshots | 表格列出 PM/GM/rise/settling/overshoot/ess |

Exit criteria:
- Preset 產生的 controller 可被保存、匯出、snapshot 比較。
- 至少新增一個 Lead/Lag 數學驗證案例。
- AI advisor payload 包含 preset source / target PM。

### Phase 2: Discrete-Time / z-domain

目標：補控制工具常見的離散系統基礎能力，但仍保持 SISO 範圍。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P2-01 | P1 | Planned | Discrete transfer function model | 需要支援 `G(z)`、sample time、z-plane poles/zeros | TF parser extension | 可輸入 `z^-1` 或係數形式，poles/zeros 正確 |
| CS-P2-02 | P1 | Planned | Discrete step response | 離散系統不能沿用 continuous RK4 | discrete TF model | 與已知 difference equation 結果一致 |
| CS-P2-03 | P2 | Planned | z-plane pole-zero map | 需要 unit circle 與 stability 判定 | Plotly pzmap | poles inside unit circle = stable |
| CS-P2-04 | P2 | Planned | Continuous-to-discrete basic conversion | 支援 ZOH / Tustin 基礎轉換 | sample time UI | 簡單一階系統轉換公式可驗 |

Exit criteria:
- 離散系統有獨立 verification case。
- continuous / discrete mode 不互相污染。
- UI 明確顯示目前是 `s-domain` 或 `z-domain`。

### Phase 3: State Feedback And LQR

目標：利用目前已有 State-Space、controllability / observability rank，補第一批 state-space controller design。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P3-01 | P1 | Planned | Pole placement for SISO State-Space | 這是進入 state feedback 的最小可行功能 | controllability matrix | 二階案例指定 poles 後，`eig(A-BK)` 等於目標 poles |
| CS-P3-02 | P2 | Planned | State feedback UI | 需要輸入 desired poles、顯示 K、閉迴路 A matrix | CS-P3-01 | UI 顯示 K、閉迴路 poles、step response |
| CS-P3-03 | P2 | Planned | LQR solver for 2x2/low-order systems | LQR 是進階控制主線，但需先限制範圍 | matrix utilities | 與已知小型 CARE 解或 fixture 對齊 |
| CS-P3-04 | P2 | Planned | LQR Q/R tuning panel | 讓使用者調 Q/R 並看 response tradeoff | CS-P3-03 | Q/R 改變時 K 與 poles 合理變化 |

Exit criteria:
- 僅支援 SISO / low-order state-space 起步。
- 不做 MIMO UI。
- 每個 state feedback 案例需檢查 controllability。

### Phase 4: Observer And Kalman

目標：在 State Feedback 穩定後補估測器，不提前讓 UI 與數學負擔爆開。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P4-01 | P2 | Planned | Luenberger observer pole placement | 先做 deterministic observer，比 Kalman 簡單且可手推 | observability matrix | `eig(A-LC)` 等於目標 observer poles |
| CS-P4-02 | P2 | Planned | Observer simulation | 顯示 estimated state vs output error | CS-P4-01 | estimation error 收斂 |
| CS-P4-03 | P3 | Planned | Basic Kalman filter | 需噪聲模型與 covariance UI，較晚做 | observer simulation | 小型 fixture 與理論 covariance trend 對齊 |

Exit criteria:
- 只在 observable system 啟用 observer design。
- UI 明確區分 controller poles 與 observer poles。

### Phase 5: API Migration And Product Reliability

目標：把現有前端 JS 計算逐步切到統一 API，而不是一次重寫。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P5-01 | P1 | Planned | Frontend analysis API toggle | 讓前端可選 local JS 或 API backend | API contract tests | 兩種模式同 payload 結果一致 |
| CS-P5-02 | P1 | Planned | API error surface in UI | 目前 API 錯誤多是 console/自然訊息，需更清楚 | unified API | API down / invalid payload 時 UI 可恢復 |
| CS-P5-03 | P2 | Planned | Report export baseline | 自動報告屬產品化，但可先輸出 JSON/Markdown | existing export | 匯出包含 model/controller/metrics/plots metadata |
| CS-P5-04 | P2 | Planned | Regression dashboard command | 一條命令跑 CLI/API/browser smoke | validation script | CI-like local report |

Exit criteria:
- API 與 local JS 差異被可視化或記錄。
- 任何 API failure 不會清空使用者目前專案狀態。

### Phase 6: Deferred High-Complexity Features

目標：明確標記暫緩，避免後續 agent 提早開太大的面。

| ID | Priority | Status | Item | Rationale | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CS-P6-01 | P3 | Planned | MIMO | 資料模型、UI、圖表與分析都會大幅擴張 | State-Space mature | 需獨立設計文件 |
| CS-P6-02 | P3 | Planned | MPC | 需要 optimization、constraints、horizon UI | discrete + state-space mature | 需獨立設計文件 |
| CS-P6-03 | P3 | Planned | Robust Control | 需要 uncertainty model 與 sensitivity analysis | API + numerical engine mature | 需獨立設計文件 |
| CS-P6-04 | P3 | Paused | Block Diagram expansion | 使用者已要求先暫置，避免分散主線 | SISO advanced stable | 恢復前需重新確認需求 |

Exit criteria:
- 這些項目前不得在沒有設計文件的情況下直接實作。
- 若要恢復 Block Diagram，需先更新本 backlog 狀態。

## Immediate Next 3 Commits

建議後續 agent 依序做：

1. `test(control): add browser regression smoke`
   - 使用 in-app browser 固定核心 UI 流程。
   - 驗證主要 plot、設定面板、匯出入口與 console error。

2. `feat(control): add PID and lead design presets`
   - UI 加入 PID preset 與 Lead target PM helper。
   - 新增對應公式驗證。

3. `feat(control): add controller comparison table`
   - 在 Compare 面板補工程指標表。
   - 匯出 comparison 時包含 controller formula 與 compensator config。

## Do Not Start Yet

以下項目先不要直接開發：
- MIMO
- MPC
- Robust Control
- 完整 Electron packaging
- Block Diagram 新功能

原因：目前核心驗證、API contract、SISO 進階控制還需要先站穩。
