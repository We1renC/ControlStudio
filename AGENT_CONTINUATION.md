# Agent Continuation

此文件用於 usage 即將耗盡、切換 agent、或中斷後續接手。不要使用 `.agent-handoff.md`。

## 專案根目錄
`/Users/w.rc/nvdiaOSsupport`

## 目前狀態
- 已建立獨立 git repo，避免被 `/Users/w.rc` 外層 git 混入。
- 已完成 NVIDIA Build Models 資料集中管理。
- 已新增 agent 入口文件：
  - `AGENTS.md`：專案規則、標準流程、擴充規則與品質判準。
  - `AGENT_USAGE.md`：CLI 操作、選型、執行、評估與擴充手冊。
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
  - `workflows/control_advisor_workflow.py`
  - `data/sample_kb.txt`
  - `data/cuopt_sample_problem.json`
  - `.env.example`
  - `RUNNABLE_WORKFLOWS.md`
- 已建立控制系統工作台：
  - `control-studio/index.html`
  - `control-studio/js/`
  - `control-studio/scripts/control_api.py`
  - `control-studio/requirements-api.txt`
  - `test_control.js`
  - `CONTROL_SYSTEM_PLAN.md`
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
- 已建立 runtime router：
  - `workflows/common.py` 會從 `configs/model_registry.json` 解析 role、model id、endpoint type、endpoint url。
  - `./nv-agent plan --select-model ROLE=MODEL_ID` 可讓 Agent 指定每個任務單元的模型來源。
  - `./nv-agent run-plan --select-model ROLE=MODEL_ID ...` 可在執行前覆蓋來源。
  - image / safety / cuOpt workflow 已支援 registry endpoint source 與 CLI 覆蓋。
  - control-advisor workflow 已接入 `control_expert` role。

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
cat AGENTS.md
cat AGENT_USAGE.md
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
- `AGENTS.md` 與 `AGENT_USAGE.md` 已納入驗證腳本，確保後續 agent 有固定入口。
- image runtime router 已用 dry-run 驗證會輸出 `--model` 與 `--endpoint-url`。
- `test_control.js` 已驗證基本極點判定與 step response 指標。
- `control_advisor_workflow.py --help` 可正常執行。
- `CONTROL_SYSTEM_PLAN.md` 已整理控制系統盤點、MVP 範圍與後續 roadmap。
- `control-studio` 已補上 State Space（SISO）輸入、Step/Impulse/Ramp 切換、Nyquist Plot、project save/load 與 JSON/CSV 匯出。
- `control-studio` UI 已改成 sidebar workspace tabs（Model / Sim / Advisor / Compare），並支援 comparison snapshots 疊圖比較。
- `control-studio/scripts/serve_studio.py` 已提供固定的本地前端啟動入口（預設 `http://127.0.0.1:8765`）。
- `control-studio` 已補上 simulation config（duration/sample count/amplitude/disturbance/initial state）、autosave/restore session、waveform 擴充與 comparison 指標摘要。
- `control-studio/scripts/control_api.py` 已提供統合的 FastAPI 服務，整合原本的 Advisor Bridge 與基礎分析；前端 AI advisor 已優先改打 `127.0.0.1:8770/api/control/advisor`。
- `control-studio/requirements-api.txt` 已列出 FastAPI / uvicorn / pydantic 依賴，可用 `./.venv/bin/pip install -r control-studio/requirements-api.txt` 安裝。
- `control-studio/js/analysis/time-response.js` 已補內部 RK4 substepping，避免低 sample count 時穩定系統數值爆掉。
- `control-studio` 已補 Nichols Chart、ZPK 輸入、Export PNG、Routh-Hurwitz 表、autoFreqRange、Root Locus asymptotes、Nyquist encirclement 計數、輸入驗證強化。
- `control-studio` Block Editor 已補上拓撲分析（串聯 / 回授）、節點編輯（雙擊）、節點刪除、Zoom/Pan、Undo/Redo、Diagram save/load。
- `control-studio/js/control/zpk.js` 新增 ZPK model 輸入與複數根解析。
- `control-studio/js/math/matrix.js` 新增 `matRank` 用於計算矩陣秩。
- `control-studio/js/control/state-space.js` 新增 `controllabilityMatrix` 與 `observabilityMatrix`，並在 UI 直接顯示可控性與可觀察性。
- `control-studio/js/math/polynomial.js` 新增 `polydiv` 多項式除法。
- `control-studio/js/control/stability.js` 新增 `routhTable` Routh-Hurwitz 穩定性表。
- `control-studio/js/analysis/frequency-response.js` 新增 `nicholsData`、`nyquistEncirclements`。
- `test_control.js` 已擴充涵蓋 ZPK、polydiv、Routh、Nichols、encirclement、asymptotes、SS Rank 測試。

## 後續可做
1. 加 `agents/openai.yaml` UI metadata。
2. 增強 evaluator：從 heuristic 檢查升級成 judge model + golden dataset。
3. 若 NVIDIA Build Models 更新，先更新根目錄資料檔，再同步 `skills/nvidia-model-selector/references/`。
4. 視需求把 `search_models.py` 加上 `--top-category-summary` 或 fuzzy ranking。
5. 若要更實用，補上本地文件切 chunk / PDF 轉圖 / OCR 結果快取。
6. 加 parallel runner 與 leaderboard，追蹤同任務多模型輸出品質。
7. 將 OCR/RAG 的 endpoint source 也改成完整 registry-driven，而不只傳入 model id。
8. 補 MIMO 支援、LQR/LQG/MPC 進階控制。
9. 補離散時間系統（z-domain）支援。
10. 補 Electron packaging 與教學模式。

## 注意事項
- 這個專案不需要 `.agent-handoff.md`。
- 不要把敏感檔或個人 API key 寫入此 repo。
- skill 內容避免把完整 157 筆模型塞進 `SKILL.md`；大量資料留在 references 與 CSV。
