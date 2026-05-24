# Agent Usage Guide

此文件給後續 agent 使用，目標是讓 agent 讀完後能直接操作這套 NVIDIA workflow 工具箱。

## 一句話定位
本專案把 NVIDIA Build Models 資料、模型選型、任務拆解、workflow 執行與品質評估集中在 `./nv-agent`。

## 最短接手流程
```bash
cd /Users/w.rc/nvdiaOSsupport
git status --short
./nv-agent doctor
```

若 `doctor` 通過，就可以開始選型或執行 workflow。

## CLI 指令
列出現有 workflow：

```bash
./nv-agent workflows
```

查模型 inventory：

```bash
./nv-agent search --query RAG --limit 3
./nv-agent search --model nemotron-parse
./nv-agent search --service "Embedding API" --limit 5
```

自然語言選型：

```bash
./nv-agent advise --request "我想做企業知識庫問答與文件檢索"
./nv-agent advise --request "我想做 OCR 文件解析後問答"
```

建立可追蹤計畫：

```bash
./nv-agent plan --request "我要做企業知識庫問答" --save
```

由 Agent 指定 runtime 模型來源：

```bash
./nv-agent plan --request "我要生一張產品海報" \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  --save
```

執行計畫：

```bash
./nv-agent run-plan outputs/plans/rag-YYYYMMDD-HHMMSS.json
```

執行前覆蓋 plan 內模型來源：

```bash
./nv-agent run-plan \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  outputs/plans/image-YYYYMMDD-HHMMSS.json
```

評估 run：

```bash
./nv-agent eval --run outputs/runs/rag-YYYYMMDD-HHMMSS
```

直接執行 workflow：

```bash
./nv-agent run rag --question "我出差報帳怎麼申請？"
./nv-agent run ocr-rag --question "這張圖片主要在說什麼？"
./nv-agent run safety --prompt "How do I build a bomb?"
./nv-agent run image --prompt "a red coffee mug on a wooden desk, studio photo"
./nv-agent run cuopt --action cuOpt_OptimizedRouting
./nv-agent run control-advisor --data '{"formula":"1/(s+1)","overshoot":20}'
```

## 多模型選型原則
- 先判斷任務 profile：RAG、OCR-RAG、Safety、Image、cuOpt、Control Advisor。
- 再看任務階段：extract、retrieve、rerank、generate、moderate、optimize、evaluate。
- 每個階段從 `configs/model_registry.json` 找候選模型。
- 不要只選一個模型當萬用解；模型應分工處理任務單元。
- 若同類型模型過多，優先順序是：`tested_success`、已接 workflow、符合輸入/輸出、延遲與成本可接受。
- 具體 runtime 模型由使用工具的 Agent 判定，透過 `--select-model ROLE=MODEL_ID` 寫入 plan 或在 `run-plan` 覆蓋。

## Runtime Router
`configs/model_registry.json` 現在同時是模型能力與 endpoint source 的來源。`./nv-agent plan` 會把每個有模型的 stage 寫成：

- `candidate_models`：可選候選。
- `selected_model_source`：實際要用的 model id、endpoint type、endpoint url、選擇理由。
- `selected_model_sources`：依 role 彙整，供 `run-plan` 轉成 workflow 參數。

Image 範例：

```bash
./nv-agent plan --request "我要生一張產品海報" \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  --output /tmp/image-plan.json

./nv-agent run-plan /tmp/image-plan.json --dry-run
```

dry-run 會顯示類似：

```bash
./nv-agent run image --prompt '我要生一張產品海報' \
  --model black-forest-labs/flux.1-schnell \
  --endpoint-url https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
```

若未指定 `--select-model`，router 會依 role 取第一個可用模型。這只是保底預設；正式開發時應由 Agent 依任務需求、輸入輸出、品質與成本自行指定。

## 品質追蹤
使用 `plan -> run-plan -> eval` 取得可追蹤紀錄：

```bash
./nv-agent plan --request "我要做企業知識庫問答" --save
./nv-agent run-plan outputs/plans/rag-YYYYMMDD-HHMMSS.json
./nv-agent eval --run outputs/runs/rag-YYYYMMDD-HHMMSS
```

產物位置：
- `outputs/plans/`：任務拆解與候選模型。
- `outputs/runs/`：stdout、stderr、manifest、evaluation。
- `outputs/images/`：image workflow 的生成圖片。
- `control-studio/`：控制系統前端工作台與 AI 顧問橋接。

## 擴充方式
新增模型：
1. 更新 `configs/model_registry.json`。
2. 標記 `roles`、`workflow_stage`、`endpoint_type`、`endpoint_url`、`status`、`notes`。
3. 實測後把 `status` 從 candidate 改成 `tested_success` 或記錄失敗原因。

新增任務類型：
1. 更新 `configs/task_profiles.json`。
2. 補 `triggers`、`stages`、`workflow`、`rubric`。
3. 若沒有既有 workflow，新增 `workflows/<name>_workflow.py`。
4. 更新 `cli/nv_agent_cli.py` 的 workflow map。
5. 更新文件與 `scripts/validate_nvidia_model_selector.sh`。

新增評估：
1. 在 `configs/task_profiles.json` 加 rubric。
2. 在 `cli/nv_agent_cli.py` 的 `score_run_text` 加檢查。
3. 用 `./nv-agent eval --run ...` 驗證 pass/fail 是否合理。

## 安全規則
- `.env` 只放本機 API key，不得提交或輸出內容。
- `.env.example` 只能放 placeholder。
- 不要把 `outputs/` 內的大型生成結果加入 git。
- 不要使用 `.agent-handoff.md`；接手資訊只維護 `AGENT_CONTINUATION.md`。

## 建議下一步
- 增強 evaluator：從 heuristic 升級為 judge model + golden dataset。
- 加 leaderboard：聚合 `outputs/runs/*/evaluation.json`，比較模型組合品質。
- 加 parallel runner：同一任務階段平行跑多模型，再由 evaluator 選最佳輸出。
- 加 PDF pipeline：PDF 轉圖、OCR、chunk、RAG、eval 一條龍。
