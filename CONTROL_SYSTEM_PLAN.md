# Control System Development Plan

此文件是控制系統工作台的正式開發計畫。後續 agent 若要修改 `control-studio/`、`workflows/control_advisor_workflow.py`、`test_control.js`，或擴充 `control-advisor` 任務，應先閱讀本文件、`CONTROL_SYSTEM_VERIFICATION_CASES.md`、`CONTROL_SYSTEM_BACKLOG.md` 並依此執行。

## 1. Product Vision

打造一套面向控制工程、機器人、自動化與教學場景的現代控制系統工具，結合：
- 類 MATLAB Control System Toolbox 的分析能力
- 類 Simulink 的視覺化建模方式
- 類 Python Control Library 的可擴充性
- 更直覺的 UI 與 AI 輔助建議

短期目標不是取代 MATLAB，而是先做出：
- 易上手的控制系統分析工具
- 可快速展示與驗證的 Web 型工作台
- 可延伸成工程版與教學版的產品基礎

## 2. Target Users

- 控制工程師
- 機器人與自動化系統開發者
- 電機、機械、航太相關師生
- 需要快速驗證控制器行為的研發團隊
- 需要視覺化展示控制系統結果的產品/方案團隊

## 3. Current Inventory

### 已存在實作
- 前端工作台：`control-studio/index.html`
- 主互動邏輯：`control-studio/js/app.js`
- 控制核心：
  - `control-studio/js/control/transfer-function.js`
  - `control-studio/js/control/pid.js`
  - `control-studio/js/control/stability.js`
- 分析模組：
  - `control-studio/js/analysis/time-response.js`
  - `control-studio/js/analysis/frequency-response.js`
  - `control-studio/js/analysis/root-locus.js`
- 視覺化編輯器：
  - `control-studio/js/editor/`
- AI 顧問：
  - `workflows/control_advisor_workflow.py`
  - `control-studio/scripts/control_api.py`
  - `control-studio/requirements-api.txt`
- Smoke test：
  - `test_control.js`
- 驗證案例：
  - `CONTROL_SYSTEM_VERIFICATION_CASES.md`
- 開發順序：
  - `CONTROL_SYSTEM_BACKLOG.md`

### 已完成能力
- SISO 傳遞函數輸入
- SISO State-Space 輸入與 transfer function 轉換
- ZPK 輸入與複數零極點解析
- 離散 Transfer Function，使用 z^-1 係數與 sample time
- Continuous-to-discrete conversion：Tustin / ZOH
- PID 參數調整
- PID presets：Ziegler-Nichols / Cohen-Coon
- Root Locus ultimate gain Ku/Tu 轉 Ziegler-Nichols P / PI / PID
- Lead / Lag 補償器
- Lead / Lag design helper
- Step Response
- Impulse / Ramp / Sine / Square / Pulse response
- Discrete step / impulse response
- Bode Plot
- Discrete Bode Plot
- Nyquist Plot
- Nichols Chart
- Root Locus
- Root Locus break points / jω crossings / branch sorting
- Interactive Root Locus gain picker
- Pole-Zero Map
- z-plane Pole-Zero Map 與 unit-circle stability metrics
- Gain Margin / Phase Margin
- Rise Time / Settling Time / Overshoot / Steady-State Error
- 工程化 Stability Analysis summary：risk level、dominant pole、stability margin、damping ratio、natural frequency、recommendations
- Routh-Hurwitz table
- Closed-loop / open-loop 基本切換
- Closed-loop design assistant：由 overshoot / settling time 推 target poles
- Lead design for target phase margin
- Deadbeat gain design for z-domain
- Advisor / design result apply-back 到 controller
- Direct pole-placement K computation（移除手動 Root Locus 步驟）
- Matrix definiteness / symmetric eigenvalue utilities
- Continuous Lyapunov stability proof：`AᵀP + PA = -Q`
- Lyapunov proof panel：顯示 `V(x)=xᵀPx`、`dV/dt=-xᵀQx`、P matrix、min eig(P)
- Low-order SISO state feedback pole placement（Ackermann）
- Low-order LQR baseline（CARE / Kleinman iteration）
- LQR Q/R tuning panel
- Project save/load
- Session autosave / restore
- Comparison snapshots 與摘要
- Controller comparison table
- JSON / CSV / PNG 匯出
- Markdown report export baseline
- Frontend analysis source toggle：Local JS / FastAPI / Compare Local/API
- API analysis status surface：checking / ok / diff / error
- Regression dashboard command
- Block Diagram Editor 與 diagram save/load、Undo/Redo、Zoom/Pan
- AI 控制器建議
- Unified FastAPI API（analysis + advisor）

### Phase 8 已完成（Observer / Kalman / LQG）
- Luenberger observer pole placement（duality + Ackermann via Aᵀ, Cᵀ）
- 觀測器模擬（plant + observer Euler 積分，含過程/量測噪音注入）
- 穩態 LQE（連續時間 Kalman Filter via duality with LQR）
- Bryson 法則 Q/R 自動建議
- Q/R sensitivity slider（即時看 L_kf 與 observer poles 變化）
- Observer poles 疊加 Pole-Zero Map（紫色菱形）
- Innovation 白噪音統計檢定（mean / std / ACF lag-1,2 / 95% CI / 自動診斷）
- 離散 Kalman Filter（ZOH 離散化 + Riccati 差分方程迭代）
- LQG 整合模擬（FSF 理想全狀態 vs LQG 估測狀態的閉迴路響應對比）

### Phase 9 已完成（MIMO 基礎與設計）
- SISO/MIMO 模式切換（互不干擾，SISO 流程完全不變）
- MIMO State-Space 矩陣輸入（n/m/p 維度，ABCD 矩陣 textarea）
- Channel selector bar（u_j→y_i 個別檢視 + ⊞ All 矩陣全覽）
- RGA（Relative Gain Array）穩態分析 + 配對診斷
- Singular Value Bode（σ_max / σ_min / 條件數 κ）
- Static Decoupler（W = G(0)⁻¹ 自動解耦）
- MIMO LQR（R 為矩陣的 CARE 求解，Newton-Kleinman 迭代）

### 尚未完成能力
- MPC（Model Predictive Control）
- Robust Control（H∞、μ-synthesis）
- Dynamic Decoupler（頻域解耦，非僅 DC）
- MIMO Frequency-domain 設計（characteristic locus、INA）
- 自動產生報告 / 報告模板
- 前端分析流程預設全面切到統一 API
- Electron packaging / 教學模式

## 4. Scope Definition

### MVP 範圍
- SISO Transfer Function
- PID 控制器
- Step Response
- Bode Plot
- Root Locus
- Pole-Zero Map
- Stability Analysis
- PID 參數滑桿調整
- AI Advisor
- 模擬結果匯出
- 離散 SISO baseline
- C2D baseline
- Root Locus 互動設計
- Closed-loop design assistant

### 非 MVP 範圍
- MIMO
- Advanced optimal control
- Robust / MPC
- 教學模式
- 自動報告生成

## 5. User Flow

### MVP 使用流程
1. 建立或開啟控制系統工作台
2. 選擇模型類型（先以 Transfer Function 為主）
3. 輸入系統參數
4. 選擇或設定控制器（先以 PID 為主）
5. 調整控制器參數
6. 執行分析與模擬
7. 檢視 Step / Bode / Root Locus / Pole-Zero
8. 讀取穩定性指標
9. 呼叫 AI Advisor 取得調參建議
10. 匯出結果

### 後續版本流程
- 加入專案儲存/載入
- 比較多組參數結果
- 支援 State-Space 與更完整的 block diagram 建模
- 由規格設計 state feedback / Lyapunov proof / LQR / observer
- 匯出 Markdown / JSON 報告

## 6. System Architecture

### Recommended Architecture
- Frontend: React + TypeScript
- Charting: Plotly
- Backend API: FastAPI
- Numerical Engine: NumPy + SciPy + Python Control Library
- Desktop Packaging: Electron
- Optional acceleration: WebAssembly for selected hot paths

### Current Architecture
- Frontend: static HTML/CSS/JS
- Charting: Plotly CDN
- Static server: Python `http.server`
- Unified API: FastAPI (`control_api.py`)
- AI analysis: `nv-agent` + NVIDIA model routing + unified advisor endpoint
- Numerical engine: local JS implementations，包含 continuous TF/SS/ZPK、discrete TF、C2D、frequency response、root locus、closed-loop design assistant、observer / Kalman / LQG、MIMO analysis/design

### Migration Strategy
1. 先保留現有 `control-studio/` 作為互動原型
2. 將數值核心與 UI state 抽離成明確模組
3. 補 FastAPI API 層，讓前後端責任清楚
4. 視情況把重計算轉到 Python 或 WASM
5. 前端新增 local/API analysis toggle，先比對結果再逐步切換預設路徑

## 7. MVP Backlog

### P0
- Done：補前端錯誤處理與輸入驗證
- Done：補瀏覽器級回歸驗證
- Done：補統一 API 啟動與依賴說明
- Done：補 smoke test 到更多實際使用流程

### P1
- Done：Controller design presets、Lead/Lag helper、comparison table
- Done：離散系統、C2D、z-plane、discrete Bode
- Done：Root Locus 互動設計、ZN PID from Ku/Tu
- Done：Closed-loop design assistant、Deadbeat gain
- Done：Report export baseline
- Done：Frontend local/API analysis toggle
- Done：API error surface in UI
- Done：Regression dashboard command

### P2
- Done：State Feedback / Lyapunov Stability Analysis / LQR scaffold
- Done：Observer / Kalman / LQG
- Done：MIMO 基礎（mode toggle / channel selector / matrix grid）
- Done：MIMO Analysis（RGA / Singular Value Bode）
- Done：MIMO Design（Static Decoupler / MIMO LQR）
- Paused：更完整 block editor 同步分析
- Planned：MPC / Robust Control（需獨立設計文件）

## 8. UI Plan

### MVP 頁面
- Dashboard
  - 系統輸入面板
  - 控制器面板
  - 穩定性面板
  - 主圖切換區與 comparison 區
- Block Diagram Editor
- AI Advisor Panel
- Project / Export 工具列

### Future UI
- Result Comparison View
- Project Manager
- Report Export Dialog
- Teaching Mode Overlay

## 9. API Plan

目前已實作的 API：

- `GET /health`
- `POST /api/control/system/response`
- `POST /api/control/system/stability`
- `POST /api/control/advisor`

後續可擴充的 API：

- `POST /api/control/system/analyze`
- `POST /api/control/system/step`
- `POST /api/control/system/bode`
- `POST /api/control/system/root-locus`
- `POST /api/control/system/stability`
- `POST /api/control/controller/pid/tune`
- `POST /api/control/export`
- `POST /api/control/advisor`

輸入格式先統一使用 JSON，核心欄位至少包含：
- `system.type`
- `system.num`
- `system.den`
- `controller.type`
- `controller.params`
- `simulation.mode`
- `simulation.input`
- `simulation.duration`

## 10. Data Model

建議的資料模型：

```json
{
  "projectId": "uuid",
  "name": "motor-speed-control",
  "system": {
    "type": "transfer_function",
    "continuous": true,
    "num": [1],
    "den": [1, 3, 2]
  },
  "controller": {
    "type": "pid",
    "kp": 1.0,
    "ki": 0.5,
    "kd": 0.1
  },
  "simulation": {
    "mode": "closed_loop",
    "input": "step",
    "duration": 10.0
  }
}
```

## 11. Development Roadmap

### Stage 0: Stabilize Current Prototype
- 整理現有結構與文件
- 確立啟動方式
- 完成 smoke tests
- 完成 MVP 邊界定義
- Status: Done

### Stage 1: Complete MVP
- 補輸入驗證
- 讓 AI advisor 與前端互動更穩定
- 補統一 API 的實際操作與回歸驗證
- Status: Done

### Stage 2: Engineering Expansion
- FastAPI service layer
- 前端分析 API 化（Local JS / FastAPI / Compare Local/API toggle）
- Report export baseline
- Regression dashboard command
- Better block diagram syncing（暫時擱置，待 SISO 進階控制穩定後再恢復）
- Status: Done

### Stage 3: Advanced Control
- Done：Lyapunov Stability Analysis
- Done：Low-order State Feedback / Pole Placement
- Done：Low-order LQR baseline / Q-R tuning
- Done：Observer / Kalman / LQG
- Done：MIMO 基礎 + RGA / SV Bode + Decoupler + MIMO LQR
- Deferred：MPC / Robust Control
- Status: Done

### Phase 7 Theory Track
- Done：Matrix definiteness utilities：symmetric、positive definite、min eigenvalue checks。
- Done：Lyapunov Stability Analysis：支援 continuous-time low-order State-Space，預設 `Q=I`，求解 `AᵀP + PA = -Q`。
- Done：Lyapunov UI proof panel：顯示 `V(x)=xᵀPx`、`dV/dt=-xᵀQx`、P matrix、min eig(P)、Proven Stable / Failed。
- Done：State Feedback：SISO / low-order pole placement，包含 controllability guard。
- Done：LQR：2x2 / low-order CARE baseline，並提供 Q/R tuning panel。
- Verification：`test_control.js` 已新增手推等價案例，覆蓋 Lyapunov、Pole Placement、LQR。

### Phase 8 Observer / Kalman / LQG Track
- Done：Luenberger observer via duality（`placeStateFeedback(Aᵀ, Cᵀ, poles)` → L = Kᵀ），含 observability rank guard。
- Done：Observer 模擬 Euler 積分，含 plant + observer 同步、過程/量測噪音注入、eNorm 收斂指標。
- Done：穩態 LQE（連續時間 Kalman），dual of LQR，求解 filter CARE `A·Pe + Pe·Aᵀ − Pe·Cᵀ·Rn⁻¹·C·Pe + Qn = 0`。
- Done：Bryson 法則自動建議 Q/R（`Q_ii = 1/δᵢ²`, `R_jj = 1/δ_y²`）。
- Done：Q/R sensitivity slider（即時掃 ×0.001 ~ ×1000 看 L_kf / observer poles 變化）。
- Done：Observer poles 疊加 Pole-Zero Map（紫色菱形 ◆，自動更新）。
- Done：Innovation 白噪音統計（mean / std / ACF lag-1,2 vs ±1.96/√N 95% CI，自動診斷 KF tuning 品質）。
- Done：離散 Kalman（ZOH 離散化 + Riccati 差分方程迭代，回傳 L_kf[d] 與 z-plane observer poles）。
- Done：LQG 模擬（FSF 理想全狀態回授 vs LQG 估測狀態回授兩條響應曲線 + 控制力對比）。
- Verification：`test_control.js` 覆蓋 Luenberger pole placement、Kalman LQE stability、observer 收斂、innovation 統計、LQG 穩態誤差。

### Phase 9 MIMO Track
- Done：SISO/MIMO 模式切換（toggle 在 System 面板頂部，SISO 流程完全不變）。
- Done：MIMO State-Space 矩陣輸入 UI（n × m × p 維度，A/B/C/D textarea，dimension 驗證）。
- Done：MIMOStateSpace 類別與 `channelTF(i, j)`、`allChannels()`、`dcGain()`。
- Done：Channel selector bar（u_j → y_i 個別檢視，重用全部 6 個 SISO plot tabs）。
- Done：⊞ All view（p × m 小格全覽 step response，直觀看出耦合）。
- Done：RGA 穩態分析（`G(0) ⊗ G(0)⁻ᵀ`）+ 配對診斷（good / caution / warn / bad）+ swap 建議。
- Done：Singular Value Bode（σ_max / σ_min vs 頻率，log-log 軸 + 條件數 κ）。
- Done：Static Decoupler（W = G(0)⁻¹，套用後 B' = B·W 寫回系統）。
- Done：MIMO LQR（R 為 m×m 矩陣的 CARE 求解，Newton-Kleinman 迭代）。
- Verification：`test_control.js` 覆蓋 MIMO 維度驗證、對角/耦合 RGA、decoupler 後 RGA = I、MIMO LQR 收斂與閉迴路 K 對稱性。

### Stage 4: Productization
- Electron desktop packaging
- Cloud deployment option
- Teaching mode
- Report generation

## 12. Technical Risks

- 目前大量數值核心在前端 JS，正確性驗證成本高
- Root Locus / Nyquist / State-Space 若持續手刻，維護成本會快速上升
- MIMO 與進階控制功能會讓資料模型與 UI 複雜度大幅增加
- AI advisor 若沒有結構化輸入與安全邊界，容易出現不穩定建議
- 如果不及早整理 API 與資料模型，後續從 PoC 過渡到產品會很痛

## 13. Rules For Future Agents

後續 agent 在開發控制系統相關功能時，請遵守：

1. 先讀本文件，再動手修改控制系統相關檔案。
2. 若修改數值核心、API 分析輸出或穩定性指標，需對照 `CONTROL_SYSTEM_VERIFICATION_CASES.md` 的案例與數學推導。
3. 後續開發順序以 `CONTROL_SYSTEM_BACKLOG.md` 為準。
4. Phase 9 已完成；若啟動下一階段，先補 Phase 10 設計文件與驗證基線，再做 MPC / Robust / Dynamic Decoupler。
5. 若新增控制系統分析功能，必須補：
   - 文件
   - 至少一個 smoke test 或驗證流程
   - UI 對應入口（若屬使用者可見功能）
6. 若引入新模型類型或新控制器類型，先更新資料模型與輸入格式，再補 UI。
7. 若新增 workflow 或控制系統相關 CLI 能力，需同步更新：
   - `README.md`
   - `RUNNABLE_WORKFLOWS.md`
   - `AGENT_CONTINUATION.md`
   - `scripts/validate_nvidia_model_selector.sh`
8. 若要從靜態前端遷移到 React/FastAPI，不要一次重寫全部；用增量替換策略。
