# Agent Continuation

此文件用於 usage 即將耗盡、切換 agent、或中斷後續接手。不要使用 `.agent-handoff.md`。

## 專案根目錄
`/Users/w.rc/nvdiaOSsupport`

## 目前狀態
- 已建立獨立 git repo，避免被 `/Users/w.rc` 外層 git 混入。
- 已完成 NVIDIA Build Models 資料集中管理。
- 已建立可用 skill 原始碼：
  - `skills/nvidia-model-selector/SKILL.md`
  - `skills/nvidia-model-selector/references/model-categories.md`
  - `skills/nvidia-model-selector/references/operational-guide.md`
  - `skills/nvidia-model-selector/references/inventory.csv`
  - `skills/nvidia-model-selector/scripts/search_models.py`
- 已建立可執行 workflow：
  - `workflows/rag_workflow.py`
  - `workflows/ocr_rag_workflow.py`
  - `workflows/safety_guard_workflow.py`
  - `workflows/image_generation_workflow.py`
  - `workflows/cuopt_demo_workflow.py`
  - `data/sample_kb.txt`
  - `data/cuopt_sample_problem.json`
  - `.env.example`
  - `RUNNABLE_WORKFLOWS.md`
- 已建立 symlink：
  - `/Users/w.rc/.config/agents/skills/nvidia-model-selector`
  - 指向 `/Users/w.rc/nvdiaOSsupport/skills/nvidia-model-selector`
- 已建立整合 CLI：
  - `/Users/w.rc/nvdiaOSsupport/nv-agent`
  - `search`：查本地 inventory
  - `advise` / `request`：做選型提問
  - `plan`：依 task profile 產生多階段計畫與候選模型
  - `run-plan`：執行計畫並寫入 run manifest
  - `eval`：對 run manifest 做基本品質檢查
  - `run`：執行各 runnable workflow
  - `doctor`：跑整體驗證
- 已建立架構設定：
  - `configs/model_registry.json`
  - `configs/task_profiles.json`

## Git Checkpoints
- `338986f docs(nvidia): baseline model inventory and skill plan`
- `ce335b3 feat(skill): add nvidia model selector`
- `374f2c2 docs(agent): add continuation and validation workflow`
- `5c05766 feat(workflow): add runnable nvidia rag flow`
- `7160ebd fix(workflow): use shared key with runnable defaults`
- `772abef feat(workflow): add safety guard flow`
- `0b52114 feat(workflow): add image generation flow`
- `1e66585 feat(workflow): add cuopt demo flow`
- `438ce9b feat(workflow): add ocr rag flow`

## 接手第一步
```bash
cd /Users/w.rc/nvdiaOSsupport
git status --short
git log --oneline -5
./scripts/validate_nvidia_model_selector.sh
```

## 已驗證
- `bge-m3` model search works.
- `Embedding API` service search works.
- `OCR` JSON search works.
- `search_models.py` compiles with Python 3.13.
- `rag_workflow.py` compiles with Python 3.13.
- 預設 `.env` / `.env.example` 現在使用已實測可跑的 `nvidia/nv-embed-v1` + `meta/llama-3.1-8b-instruct`。
- `safety_guard_workflow.py` 已實測 safe / unsafe 兩種 prompt。
- `image_generation_workflow.py` 已實測可生成 PNG 到 `outputs/images/`。
- `cuopt_demo_workflow.py` 已實測 validator 與 optimized routing。
- `ocr_rag_workflow.py` 已實測 OCR 抽取與後續問答。
- `nv-agent workflows`、`nv-agent search`、`nv-agent advise`、`nv-agent run rag` 已實測。
- `nv-agent plan`、`nv-agent run-plan`、`nv-agent eval` 已實測一輪 RAG 閉環。

## 後續可做
1. 加 `agents/openai.yaml` UI metadata。
2. 把 `rag_poc_demo.py` 決定是否納入 repo 或刪除。
3. 若 NVIDIA Build Models 更新，先更新根目錄資料檔，再同步 `skills/nvidia-model-selector/references/`。
4. 視需求把 `search_models.py` 加上 `--top-category-summary` 或 fuzzy ranking。
5. 若要更實用，補上本地文件切 chunk / PDF 轉圖 / OCR 結果快取。
6. 把 evaluator 從 heuristic 檢查升級成 judge model + golden dataset。

## 注意事項
- 這個專案不需要 `.agent-handoff.md`。
- 不要把敏感檔或個人 API key 寫入此 repo。
- skill 內容避免把完整 157 筆模型塞進 `SKILL.md`；大量資料留在 references 與 CSV。
