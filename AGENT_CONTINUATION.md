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
  - `data/sample_kb.txt`
  - `.env.example`
  - `RUNNABLE_WORKFLOWS.md`
- 已建立 symlink：
  - `/Users/w.rc/.config/agents/skills/nvidia-model-selector`
  - 指向 `/Users/w.rc/nvdiaOSsupport/skills/nvidia-model-selector`

## Git Checkpoints
- `338986f docs(nvidia): baseline model inventory and skill plan`
- `ce335b3 feat(skill): add nvidia model selector`
- `374f2c2 docs(agent): add continuation and validation workflow`

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

## 後續可做
1. 加 `agents/openai.yaml` UI metadata。
2. 在有真實 API key 後，實跑 `workflows/rag_workflow.py` 做端到端驗證。
3. 加更多驗收查詢案例，例如 `FLUX`、`cuopt`、`Cosmos`、`Guardrails`。
4. 若 NVIDIA Build Models 更新，先更新根目錄資料檔，再同步 `skills/nvidia-model-selector/references/`。
5. 視需求把 `search_models.py` 加上 `--top-category-summary` 或 fuzzy ranking。

## 注意事項
- 這個專案不需要 `.agent-handoff.md`。
- 不要把敏感檔或個人 API key 寫入此 repo。
- skill 內容避免把完整 157 筆模型塞進 `SKILL.md`；大量資料留在 references 與 CSV。
