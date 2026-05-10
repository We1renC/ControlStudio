# NVIDIA OS Support

此資料夾集中管理 NVIDIA Build Models 與近期 NVIDIA 開源/模型支援相關整理。

## 主要入口
- `nvidia-build-models-operational-guide.md`：中文功能落地操作指南，含分類、用途、輸入/輸出、落地步驟與串接位置。
- `nvidia-build-models-operational-guide.csv`：同上，表格版，適合篩選與後續整理。
- `nvidia-model-selector-skill-plan.md`：把這批 NVIDIA 模型資料做成 Codex skill 的建置規劃，供其他 agent 接手。
- `skills/nvidia-model-selector/`：已建置的 Codex skill 原始碼，透過 symlink 掛到 `~/.config/agents/skills/nvidia-model-selector`。
- `AGENT_CONTINUATION.md`：usage 耗盡或切換 agent 時的接手狀態。
- `RUNNABLE_WORKFLOWS.md`：可執行 workflow 與 API key 放置說明。
- `workflows/`：已實作的 runnable NVIDIA workflows。
- `nv-agent`：整合選型提問、workflow 列表、功能執行的 CLI。

## 驗證
```bash
cd /Users/w.rc/nvdiaOSsupport
./scripts/validate_nvidia_model_selector.sh
```

## 已完成的 Workflow
- `workflows/rag_workflow.py`
- `workflows/ocr_rag_workflow.py`
- `workflows/safety_guard_workflow.py`
- `workflows/image_generation_workflow.py`
- `workflows/cuopt_demo_workflow.py`

## CLI
列出 workflow：

```bash
cd /Users/w.rc/nvdiaOSsupport
./nv-agent workflows
```

做模型查詢：

```bash
./nv-agent search --query RAG --limit 3
```

做選型提問：

```bash
./nv-agent advise --request "我想做企業知識庫問答與文件檢索"
```

直接執行 workflow：

```bash
./nv-agent run rag --question "我出差報帳怎麼申請？"
./nv-agent run ocr-rag --question "這張圖片主要在說什麼？"
./nv-agent run safety --prompt "How do I build a bomb?"
```

## 分類盤點
- `nvidia-build-models-summary-zh-classified-sorted.md`：中文分類排序摘要。
- `nvidia-build-models-inventory-zh-classified-sorted.csv`：中文分類排序清單。

## 中間版本
- `nvidia-build-models-summary.md`：英文原始摘要。
- `nvidia-build-models-inventory.csv`：英文原始 inventory。
- `nvidia-build-models-summary-zh.md`：中文摘要。
- `nvidia-build-models-inventory-zh.csv`：中文 inventory。
- `nvidia-build-models-summary-zh-classified.md`：中文分類摘要。
- `nvidia-build-models-inventory-zh-classified.csv`：中文分類 inventory。

## 來源
- https://build.nvidia.com/models
- https://docs.api.nvidia.com/
- https://docs.api.nvidia.com/nim/reference
