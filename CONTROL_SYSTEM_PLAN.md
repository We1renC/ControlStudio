# Control System Development Plan

此文件是控制系統工作台的正式開發計畫。後續 agent 若要修改 `control-studio/`、`workflows/control_advisor_workflow.py`、`test_control.js`，或擴充 `control-advisor` 任務，應先閱讀本文件並依此執行。

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
  - `control-studio/scripts/advisor_server.py`
- Smoke test：
  - `test_control.js`

### 已完成能力
- SISO 傳遞函數輸入
- PID 參數調整
- Step Response
- Bode Plot
- Root Locus
- Pole-Zero Map
- Gain Margin / Phase Margin
- Rise Time / Settling Time / Overshoot / Steady-State Error
- Closed-loop / open-loop 基本切換
- Block Diagram Editor 基礎版
- AI 控制器建議

### 尚未完成能力
- 完整 State-Space 輸入與分析
- ZPK 正式輸入流程
- 離散時間系統
- MIMO
- Impulse / Ramp / Nichols 正式支援
- Lead / Lag 補償器
- State Feedback / LQR / LQG
- Observer / Kalman Filter
- Robust Control / MPC
- 結果比較視窗
- 專案儲存與匯出
- 自動產生報告

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
- Bridge server: Python `http.server`
- AI analysis: `nv-agent` + NVIDIA model routing
- Numerical engine: local JS implementations

### Migration Strategy
1. 先保留現有 `control-studio/` 作為互動原型
2. 將數值核心與 UI state 抽離成明確模組
3. 補 FastAPI API 層，讓前後端責任清楚
4. 視情況把重計算轉到 Python 或 WASM

## 7. MVP Backlog

### P0
- 整理 `control-studio` 啟動方式
- 補結果匯出（JSON / CSV / PNG）
- 補前端錯誤處理與輸入驗證
- 補正式文件與頁面說明
- 補 smoke test 到更多實際使用流程

### P1
- 補 State-Space 真正可用輸入/分析流程
- 顯示 Nyquist Plot
- 補 Impulse / Ramp response
- 加入參數方案比較
- 支援專案存檔與載入

### P2
- Lead / Lag
- ZPK 正式輸入
- 更完整 block editor 同步分析
- 匯出報告

## 8. UI Plan

### MVP 頁面
- Dashboard
  - 系統輸入面板
  - 控制器面板
  - 穩定性面板
  - 四個圖表區
- Block Diagram Editor
- AI Advisor Panel

### Future UI
- Result Comparison View
- Project Manager
- Report Export Dialog
- Teaching Mode Overlay

## 9. API Plan

後續若引入後端 API，先定義以下端點：

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

### Stage 1: Complete MVP
- 補匯出
- 補輸入驗證
- 補 project save/load
- 補 Nyquist / Impulse / Ramp 中至少一部分
- 讓 AI advisor 與前端互動更穩定

### Stage 2: Engineering Expansion
- State-Space
- ZPK
- Parameter comparison
- Better block diagram syncing
- FastAPI service layer

### Stage 3: Advanced Control
- MIMO
- LQR / LQG
- Observer / Kalman
- Robust Control
- MPC

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
2. 以 MVP 範圍優先，不要直接跳去做 MIMO / MPC 等高複雜度功能。
3. 若新增控制系統分析功能，必須補：
   - 文件
   - 至少一個 smoke test 或驗證流程
   - UI 對應入口（若屬使用者可見功能）
4. 若引入新模型類型或新控制器類型，先更新資料模型與輸入格式，再補 UI。
5. 若新增 workflow 或控制系統相關 CLI 能力，需同步更新：
   - `README.md`
   - `RUNNABLE_WORKFLOWS.md`
   - `AGENT_CONTINUATION.md`
   - `scripts/validate_nvidia_model_selector.sh`
6. 若要從靜態前端遷移到 React/FastAPI，不要一次重寫全部；用增量替換策略。
