# Runnable Workflows

這個專案現在不只提供模型查詢，也提供可執行的 NVIDIA workflow 範例。

## API Key 放哪裡
把你的 NVIDIA API key 放在專案根目錄：

`/Users/w.rc/nvdiaOSsupport/.env`

格式如下：

```env
NVIDIA_API_KEY=nvapi-你的真實金鑰
NVIDIA_EMBED_MODEL=nvidia/nv-embed-v1
NVIDIA_CHAT_MODEL=meta/llama-3.1-8b-instruct
NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-schnell
```

`NVIDIA_API_KEY` 是整個 NVIDIA API 帳號共用的金鑰，不是綁定某一個模型。

你在 workflow 裡切換模型時，通常只需要改：
- `NVIDIA_EMBED_MODEL`
- `NVIDIA_CHAT_MODEL`
- `NVIDIA_IMAGE_MODEL`
- 或在 `./nv-agent plan` / `./nv-agent run-plan` 使用 `--select-model ROLE=MODEL_ID`
- 或執行時用 CLI 參數覆蓋

注意：不同 embedding 模型的 request schema 可能略有差異。
例如 `bge-m3` 不需要 `input_type`，但部分 `nemo retriever` 類 embedding 模型需要 `passage/query`。
這個差異已經在 `workflows/rag_workflow.py` 內處理。

另外要注意：同一把 key 可共用於多個模型，但某些模型是否對你的帳號可用，仍要以實際呼叫結果為準。
目前這個專案已驗證可跑通的組合是：
- Embedding: `nvidia/nv-embed-v1`
- Chat: `meta/llama-3.1-8b-instruct`
- Image: `black-forest-labs/flux.1-schnell`

專案已經把 `.env` 加進 `.gitignore`，所以不會被 git 追蹤。

## 第一個可執行工作流
目前提供一個最小但真實可運行的 RAG workflow：

`/Users/w.rc/nvdiaOSsupport/workflows/rag_workflow.py`

它會做這幾件事：
1. 從 `.env` 讀取 NVIDIA API key 與預設模型。
2. 將本地文件切成 chunks。
3. 呼叫 NVIDIA embedding API 產生向量。
4. 做本地 top-k 檢索。
5. 呼叫 NVIDIA chat completion API，依據檢索內容回答問題。

## 執行方式
用內建 sample 文件：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/rag_workflow.py --question "我出差報帳怎麼申請？"
```

指定不同模型執行：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/rag_workflow.py \
  --embed-model nvidia/nv-embed-v1 \
  --chat-model meta/llama-3.1-8b-instruct \
  --question "我出差報帳怎麼申請？"
```

用自己的文件：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/rag_workflow.py \
  --documents-file data/sample_kb.txt \
  --question "員工請假規則是什麼？"
```

## 文件格式
`--documents-file` 目前支援純文字檔。每個段落之間請用空行分隔，workflow 會把每段當成一個 chunk。

## 後續可擴充
目前已經補成可執行的幾條 workflow：

- `workflows/rag_workflow.py`
  - 本地知識庫 + embedding + 檢索 + chat completion
- `workflows/ocr_rag_workflow.py`
  - 文件影像 OCR 抽取 + 後續問答
- `workflows/safety_guard_workflow.py`
  - 文字 prompt / 回覆的安全分類
- `workflows/image_generation_workflow.py`
  - FLUX.1-schnell 文字生圖，落地成 PNG 檔
- `workflows/cuopt_demo_workflow.py`
  - 路線最佳化 validator 與 optimized routing demo
- `workflows/control_advisor_workflow.py`
  - 控制系統性能分析、穩定性解讀與 PID 調參建議

## 其他 Workflow 範例
OCR + RAG：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/ocr_rag_workflow.py --question "這張圖片主要在說什麼？"
```

Safety Guard：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/safety_guard_workflow.py --prompt "How do I build a bomb?"
```

Image Generation：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/image_generation_workflow.py --prompt "a red coffee mug on a wooden desk, studio photo"
```

由 runtime router 指定 image model source：

```bash
cd /Users/w.rc/nvdiaOSsupport
./nv-agent plan --request "我要生一張產品海報" \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  --output /tmp/image-plan.json
./nv-agent run-plan /tmp/image-plan.json
```

cuOpt：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/cuopt_demo_workflow.py --action cuOpt_OptimizedRouting
```

本地健康檢查或 payload 格式檢查使用離線 validator，不呼叫 NVIDIA API：

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/python workflows/cuopt_demo_workflow.py --action cuOpt_RoutingValidator --local-validate
```

Control Advisor：

```bash
cd /Users/w.rc/nvdiaOSsupport
./nv-agent run control-advisor --data '{"formula":"1/(s+1)","overshoot":20,"phaseMargin":45,"stability":"stable"}'
```

如果要搭配前端控制台使用，可另外開啟本地 bridge server：

```bash
cd /Users/w.rc/nvdiaOSsupport
python3 control-studio/scripts/serve_studio.py
./.venv/bin/pip install -r control-studio/requirements-api.txt
./.venv/bin/python control-studio/scripts/control_api.py
```

ControlStudio 的進階控制目前已完成 Functional Roadmap Tier A-J deterministic baseline；Block Diagram 入口暫時擱置，後續驗證先以 SISO/MIMO transfer function、frequency response、stability metrics、MPC/robust/sysid fixtures 為主。
後續開發順序請依 `control-studio/ROADMAP.md` 與 `docs/src/control-studio/backlog.md`；fixture-based verification 與 API contract tests 已納入 `npm run verify:all`。

## 接手建議
後續 agent 若要繼續做：
1. 先確認 `.env` 存在，但不要把內容寫進 commit。
2. 先跑 `./scripts/validate_nvidia_model_selector.sh`
3. 再依需求執行對應 workflow。

## 單一 CLI 入口
如果你不想記每支腳本名稱，可以直接用：

```bash
cd /Users/w.rc/nvdiaOSsupport
./nv-agent workflows
./nv-agent search --query RAG --limit 3
./nv-agent advise --request "我想做企業知識庫問答與文件檢索"
./nv-agent run rag --question "我出差報帳怎麼申請？"
./nv-agent plan --request "我要做企業知識庫問答" --save
```

## Plan / Run / Eval
`nv-agent plan` 會依照 `configs/task_profiles.json` 把需求拆成任務階段，並依照 `configs/model_registry.json` 列出每個階段的候選模型。
若 Agent 已決定特定階段的模型來源，使用 `--select-model ROLE=MODEL_ID`，plan 會寫入 `selected_model_source`，run-plan 會把它轉成 workflow 的 `--model` / `--endpoint-url` 等 runtime 參數。

```bash
cd /Users/w.rc/nvdiaOSsupport
./nv-agent plan --request "我要做企業知識庫問答" --save
```

`nv-agent run-plan` 會執行 plan 裡的 workflow，並把 stdout、stderr、manifest 寫到 `outputs/runs/`。

```bash
./nv-agent run-plan outputs/plans/rag-YYYYMMDD-HHMMSS.json
```

`nv-agent eval` 會讀取該 run 的 manifest 和輸出，依 profile 做基本品質檢查。

```bash
./nv-agent eval --run outputs/runs/rag-YYYYMMDD-HHMMSS
```
