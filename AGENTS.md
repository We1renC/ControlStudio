# AGENTS.md

此專案是 NVIDIA Build Models / NIM workflow 工具箱，提供 agent 做模型選型、任務拆解、workflow 執行、結果評估與 run log 追蹤。

## Agent 必讀
- 回覆使用繁體中文。
- 不要讀出、列印、提交或描述 `/Users/w.rc/nvdiaOSsupport/.env` 內的真實 API key。
- 不要建立或更新 `.agent-handoff.md`；本專案接手資訊維護在 `docs/agents/continuation.md`。
- 進入專案後先跑 `git status --short`，確認工作樹狀態。
- 修改前先讀相關檔案全文；手動改檔使用 `apply_patch`。
- 若新增 workflow，必須同步更新 `README.md`、`docs/src/agents/workflows.md`、`docs/src/agents/continuation.md`、`scripts/validate_nvidia_model_selector.sh`，再執行 `node docs/build.mjs` 重新生成 HTML。
- 若修改控制系統功能、數學核心、UI 行為或驗證案例，完成後必須同步相關文件，再 commit；文件同步範圍至少檢查 `control-studio/ROADMAP.md`、`docs/src/control-studio/plan.md`、`docs/src/control-studio/backlog.md`、`docs/src/control-studio/verification.md`、`docs/src/control-studio/scenarios.md`、`docs/src/agents/continuation.md`，同步後執行 `node docs/build.mjs`。

## 主要入口
- `./nv-agent`：agent 開發用 CLI。
- `docs/index.html`：所有文件的 HTML 導覽入口（含工作流關係圖）。
- `docs/src/agents/usage.md`：agent 操作手冊（源碼；閱讀用 agents/usage.html）。
- `docs/src/agents/token-efficiency.md`：symbol-first context retrieval 與 token 預算規約。
- `docs/src/agents/workflows.md`：workflow 與 API key 使用說明。
- `docs/src/agents/continuation.md`：接手狀態與後續建議。
- `docs/src/control-studio/plan.md`：控制系統工作台的正式盤點與開發計畫。
- `control-studio/ROADMAP.md`：ControlStudio phase 狀態、下一步開發順序（source of truth）。
- `docs/src/control-studio/skills.md`：ControlStudio Phase 18+ 研究路線與可拆成 agent skill 的規劃。
- `configs/model_registry.json`：模型能力、角色、endpoint、實測狀態。
- `configs/task_profiles.json`：任務 profile、階段拆解、rubric。

## UI 設計規則
- **禁止在 UI 中使用 emoji / 象形圖示**（如 📌 📄 ⚙ 🔗 ✓ ✗ 等 Unicode emoji）作為按鈕文字、標注符號、狀態指示器或任何介面元件。
- 允許使用純 ASCII 符號（`+`、`-`、`×`、`⊕`、`▾`、`◆` 等標準 Unicode 幾何字元）或純文字。
- 圖示需求應以 SVG inline icon 或 CSS pseudo-element 實作，不依賴 emoji 字型渲染。
- 此規則適用於 `index.html`、`js/app.js`、`js/ui/*.js` 所有前端程式碼，以及由 JS 動態注入的 DOM 文字。

## 控制系統開發規則
- 若修改 `control-studio/`、`workflows/control_advisor_workflow.py`、`test_control.js`，先讀 `control-studio/ROADMAP.md` 與 `docs/src/control-studio/plan.md`。
- 控制系統功能開發先以 `control-studio/ROADMAP.md` 的當前 phase 順序為準，產品範圍再對照 `docs/src/control-studio/plan.md`；不要直接跳做高複雜度進階控制功能。
- 若啟動 Phase 18+ 或把控制流程拆成 skill，先讀 `docs/src/control-studio/skills.md`，並確認技能邊界、驗證基線與暫停項目。
- 控制系統每次完成功能、修正理論/數值錯誤、或補驗證案例後，都要立即用 git 留下明確 checkpoint；不要累積多輪未提交的控制系統變更。
- 控制系統相關 commit message 需明確標示 phase / scope，例如 `feat(phase9): ...`、`fix(phase9): ...`、`test(phase9): ...`、`docs(control): ...`。
- 控制系統 checkpoint 前要先做文件同步判斷：若實作狀態、驗證狀態、開發順序、已知限制或 agent 接手資訊有變，必須更新對應文件，避免 code 與文件脫節。

## 標準流程
1. 查狀態：
   ```bash
   git status --short
   ./nv-agent doctor
   ```
   大型程式碼探索優先使用 jCodeMunch 的 `plan_turn` / `assemble_task_context`
   （預設 4,000-token budget），再按 symbol 讀取；低信心、索引過期或非程式碼內容
   才退回 `rg` 與局部檔案讀取。不要將整個 repository 或完整測試 log 放入 context。
2. 做選型：
   ```bash
   ./nv-agent search --query RAG --limit 3
   ./nv-agent advise --request "我要做企業知識庫問答"
   ```
3. 建計畫：
   ```bash
   ./nv-agent plan --request "我要做企業知識庫問答" --save
   ```
   若 Agent 已判定某階段要用的模型，使用 `--select-model ROLE=MODEL_ID`：
   ```bash
   ./nv-agent plan --request "我要生一張產品海報" \
     --select-model image_generator=black-forest-labs/flux.1-schnell \
     --save
   ```
4. 執行計畫：
   ```bash
   ./nv-agent run-plan outputs/plans/rag-YYYYMMDD-HHMMSS.json
   ```
   若要在執行前覆蓋 plan 內來源，使用：
   ```bash
   ./nv-agent run-plan --select-model image_generator=black-forest-labs/flux.1-schnell outputs/plans/image-YYYYMMDD-HHMMSS.json
   ```
5. 評估結果：
   ```bash
   ./nv-agent eval --run outputs/runs/rag-YYYYMMDD-HHMMSS
   ```
6. 控制系統變更收尾：
   ```bash
   git status --short
   npm run verify:all
   node test_control.js
   node control-studio/scripts/control_regression_dashboard.mjs
   ```
   再同步相關文件與建立 git checkpoint。

## 現有 Workflow
- `rag`：文字知識庫檢索問答。
- `ocr-rag`：文件影像 OCR 後問答。
- `safety`：文字安全分類。
- `image`：文字生圖並輸出 PNG。
- `cuopt`：路線最佳化 validator / optimized routing。

## 新增功能規則
- 以任務單元為中心，不以單一模型為中心。
- 新模型先加入 `configs/model_registry.json`，標明 `roles`、`endpoint_type`、`endpoint_url`、`status`、`notes`。
- 新任務先加入 `configs/task_profiles.json`，標明 `stages`、`workflow`、`rubric`。
- 新 workflow 放在 `workflows/`，並透過 `./nv-agent run <workflow>` 暴露。
- 若 workflow 會產生輸出，寫到 `outputs/`；不要寫入 repo 根目錄。
- 每次可執行功能都要能被 `./nv-agent doctor` 或驗證腳本覆蓋。

## Runtime Router
- `configs/model_registry.json` 是 runtime endpoint/model source 的單一來源。
- `./nv-agent plan` 會為每個有模型的 stage 寫入 `selected_model_source`。
- 使用工具的 Agent 負責用 `--select-model ROLE=MODEL_ID` 做具體模型判定；未指定時才用同 role 第一個可用模型。
- `./nv-agent run-plan` 會把 selected source 轉成 workflow 參數，例如 image workflow 會收到 `--model` 與 `--endpoint-url`。
- workflow 不應再硬寫不可覆蓋的模型 endpoint；若需要預設，必須可由 registry 或 CLI 覆蓋。

## 品質判準
- 模型輸出要能對應任務目標，而不是只看 API 是否成功。
- run 必須可追蹤：`run-plan` 需產生 `outputs/runs/<run-id>/manifest.json`。
- eval 必須能指出 pass/fail，而不是只給自然語言稱讚。
- 若模型未按預期輸出，先更新 profile / rubric / router，再考慮換模型。
