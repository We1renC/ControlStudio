# NVIDIA OS Support

此資料夾集中管理 NVIDIA Build Models 與近期 NVIDIA 開源/模型支援相關整理。

## 主要入口

### 📄 文件站（Docs）
所有 `.md` 文件已統一整理至 `docs/`，並轉換為 HTML 便於閱讀：

| 路徑 | 說明 |
|------|------|
| `docs/index.html` | 文件導覽入口（工作流關係圖） |
| `docs/agents/*.html` | Agent 工作文件（接手、使用指南、Workflows） |
| `docs/control-studio/*.html` | ControlStudio 產品文件（Roadmap、計畫、Backlog、UI/UX） |
| `docs/nvidia/*.html` | NVIDIA 模型文件（指南、分類表、Skill 規劃） |
| `docs/cases/*.html` | 案例輸出（DC Motor、Precision Servo、Regression） |
| `docs/src/` | Markdown 源碼（編輯用） |

> 更新文件流程：編輯 `docs/src/**/*.md` → 執行 `node docs/build.mjs` → HTML 自動更新。

### 🔑 常用入口
- `AGENTS.md`：Agent 工作規則與品質判準（保留於根目錄）
- `docs/src/agents/continuation.md`：切換 Agent 時的接手狀態（源碼）
- `control-studio/ROADMAP.md`：ControlStudio 主線狀態（source of truth）
- `workflows/`：已實作的 runnable NVIDIA workflows
- `nv-agent`：整合選型提問、workflow 列表、功能執行的 CLI
- `configs/model_registry.json`：模型能力、角色、endpoint 與實測狀態
- `configs/task_profiles.json`：任務拆解、workflow、階段與品質 rubric
- `skills/nvidia-model-selector/`：已建置的 Codex skill 原始碼
- `control-studio/`：控制系統視覺化工作台，含 PID 調參、穩定性分析與 AI 建議橋接。
  - 目前已支援 Transfer Function / State Space（SISO）輸入、Lead/Lag 補償器、Step/Impulse/Ramp/Sine/Square/Pulse、Nyquist、project save/load、autosave/restore session、結果快照比較與較低擁擠度的 sidebar workspace。
  - Block Diagram 目前暫時擱置，進階功能優先走 SISO transfer function / frequency response / stability validation。
  - 啟動前端可使用 `python3 control-studio/scripts/serve_studio.py`。
  - Unified API：先安裝 `./.venv/bin/pip install -r control-studio/requirements-api.txt`，再執行 `./.venv/bin/python control-studio/scripts/control_api.py`

## Agent 使用入口
後續 agent 進入本專案時，先讀：

```bash
cd /Users/w.rc/nvdiaOSsupport
cat AGENTS.md
cat docs/src/agents/usage.md
cat control-studio/ROADMAP.md
cat docs/src/control-studio/plan.md
cat docs/src/control-studio/verification.md
cat docs/src/control-studio/backlog.md
./nv-agent doctor
```

大型程式庫探索可安裝本機 symbol index 工具，減少 agent 反覆讀取完整檔案：

```bash
./.venv/bin/pip install -r requirements-agent-tools.txt
./.venv/bin/jcodemunch-mcp index "$(pwd)" --no-ai-summaries
```

使用順序、token budget 與 fallback 規則見
[`docs/src/agents/token-efficiency.md`](docs/src/agents/token-efficiency.md)。

核心工作流是：

```bash
./nv-agent plan --request "我要做企業知識庫問答" --save
./nv-agent run-plan outputs/plans/rag-YYYYMMDD-HHMMSS.json
./nv-agent eval --run outputs/runs/rag-YYYYMMDD-HHMMSS
```

若 Agent 要明確指定 runtime 模型與 endpoint source：

```bash
./nv-agent plan --request "我要生一張產品海報" \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  --save
```

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
- `workflows/control_advisor_workflow.py`

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
./nv-agent run control-advisor --data '{"formula":"1/(s+1)","overshoot":20}'
```

產生可追蹤計畫：

```bash
./nv-agent plan --request "我要做企業知識庫問答" --save
./nv-agent plan --request "我要生一張產品海報" --select-model image_generator=black-forest-labs/flux.1-schnell --save
```

執行計畫並留下 run manifest：

```bash
./nv-agent run-plan outputs/plans/rag-YYYYMMDD-HHMMSS.json
```

評估一次 run：

```bash
./nv-agent eval --run outputs/runs/rag-YYYYMMDD-HHMMSS
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
