# AGENTS.md

此專案是 NVIDIA Build Models / NIM workflow 工具箱，提供 agent 做模型選型、任務拆解、workflow 執行、結果評估與 run log 追蹤。

## Agent 必讀
- 回覆使用繁體中文。
- 不要讀出、列印、提交或描述 `/Users/w.rc/nvdiaOSsupport/.env` 內的真實 API key。
- 不要建立或更新 `.agent-handoff.md`；本專案接手資訊維護在 `AGENT_CONTINUATION.md`。
- 進入專案後先跑 `git status --short`，確認工作樹狀態。
- 修改前先讀相關檔案全文；手動改檔使用 `apply_patch`。
- 若新增 workflow，必須同步更新 `README.md`、`RUNNABLE_WORKFLOWS.md`、`AGENT_CONTINUATION.md`、`scripts/validate_nvidia_model_selector.sh`。

## 主要入口
- `./nv-agent`：agent 開發用 CLI。
- `AGENT_USAGE.md`：agent 操作手冊。
- `RUNNABLE_WORKFLOWS.md`：workflow 與 API key 使用說明。
- `AGENT_CONTINUATION.md`：接手狀態與後續建議。
- `configs/model_registry.json`：模型能力、角色、endpoint、實測狀態。
- `configs/task_profiles.json`：任務 profile、階段拆解、rubric。

## 標準流程
1. 查狀態：
   ```bash
   git status --short
   ./nv-agent doctor
   ```
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
