# Runnable Workflows

這個專案現在不只提供模型查詢，也提供可執行的 NVIDIA workflow 範例。

## API Key 放哪裡
把你的 NVIDIA API key 放在專案根目錄：

`/Users/w.rc/nvdiaOSsupport/.env`

格式如下：

```env
NVIDIA_API_KEY=nvapi-你的真實金鑰
NVIDIA_EMBED_MODEL=baai/bge-m3
NVIDIA_CHAT_MODEL=meta/llama-3.1-8b-instruct
```

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
- `workflows/ocr_rag_workflow.py`
- `workflows/image_generation_workflow.py`
- `workflows/safety_guard_workflow.py`
- `workflows/cuopt_demo_workflow.py`

## 接手建議
後續 agent 若要繼續做：
1. 先確認 `.env` 存在，但不要把內容寫進 commit。
2. 先跑 `./scripts/validate_nvidia_model_selector.sh`
3. 再跑 `./.venv/bin/python workflows/rag_workflow.py --question "..."`
