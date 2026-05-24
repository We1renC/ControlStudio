# NVIDIA Model Selector Skill Plan

## 目標
建立一個 Codex skill，讓 agent 能根據使用者需求，從 NVIDIA Build Models / NIM / 開源模型資料中快速選型，並輸出可落地的 PoC 或系統整合方案。

此文件是給後續 agent 使用的建置規格，不是最終 skill 本體。

## 建議 Skill 名稱
`nvidia-model-selector`

## 觸發時機
當使用者詢問以下任一類需求時，使用此 skill：

- 選擇 NVIDIA Build Models / NIM / 開源模型
- 比較 NVIDIA 模型用途、API 型態、部署方式
- 規劃 RAG、OCR、LLM Agent、多模態、語音、影像生成、影片處理、安全治理、機器人、生醫、科學模擬等功能
- 將 NVIDIA 模型落地成 PoC、內部服務、產品功能或部署架構
- 查詢特定模型，例如 `bge-m3`、`cuopt`、`FLUX`、`Cosmos`、`Nemotron`、`PaddleOCR`

## 建議 Skill 目錄
```text
/Users/w.rc/.config/agents/skills/nvidia-model-selector/
├── SKILL.md
├── references/
│   ├── model-categories.md
│   ├── operational-guide.md
│   └── inventory.csv
└── scripts/
    └── search_models.py
```

## 可直接沿用的資料來源
主要資料集中在：

```text
/Users/w.rc/nvdiaOSsupport/
```

建置 skill 時建議引用或複製以下檔案：

- `nvidia-build-models-operational-guide.md`
- `nvidia-build-models-operational-guide.csv`
- `nvidia-build-models-inventory-zh-classified-sorted.csv`
- `nvidia-build-models-summary-zh-classified-sorted.md`

若要節省 context，`SKILL.md` 不要直接貼完整 157 個模型清單；只放工作流程與 reference 路徑。

## SKILL.md 建議內容
```md
---
name: nvidia-model-selector
description: Use when selecting, comparing, or operationalizing NVIDIA Build Models, NIM APIs, open-source NVIDIA models, RAG components, OCR, multimodal, speech, safety, robotics, science, and deployment workflows.
---

# NVIDIA Model Selector

Use this skill to help choose NVIDIA Build Models and turn them into implementation plans.

## Workflow
1. Identify the user's target function: RAG, OCR, LLM agent, speech, video, image generation, safety, robotics, biology, simulation, or 3D.
2. Search the model inventory by category, model name, API/service type, and implementation goal.
3. Recommend 1-3 candidate models.
4. For each candidate, explain:
   - concrete use case
   - input/output
   - API or deployment style
   - POC steps
   - production integration point
   - risks or validation checks
5. If the user asks for implementation, turn the recommendation into a runnable plan or code skeleton.

## References
- Main operational guide: /Users/w.rc/nvdiaOSsupport/nvidia-build-models-operational-guide.md
- CSV inventory: /Users/w.rc/nvdiaOSsupport/nvidia-build-models-operational-guide.csv
- Classified model list: /Users/w.rc/nvdiaOSsupport/nvidia-build-models-inventory-zh-classified-sorted.csv

## Search Strategy
- For broad category questions, inspect `nvidia-build-models-summary-zh-classified-sorted.md`.
- For exact model or API/service questions, query the CSV with `scripts/search_models.py`.
- Load only the relevant rows or section; avoid loading the full 157-model inventory unless necessary.
```

## search_models.py 規格
目的：避免 agent 每次把整份 CSV 讀進 context。

支援參數：

```bash
python3 scripts/search_models.py --category RAG
python3 scripts/search_models.py --subcategory OCR
python3 scripts/search_models.py --query "文件解析"
python3 scripts/search_models.py --model bge-m3
python3 scripts/search_models.py --service "Embedding API"
python3 scripts/search_models.py --limit 10
```

輸出欄位：

- 主分類
- 子分類
- 模型
- 連結
- API/服務型態
- 典型輸入
- 典型輸出
- 落地操作步驟
- 建議串接位置
- POC 檢核

輸出格式建議：

- 預設 Markdown table
- 可選 `--json` 供後續自動化使用

## model-categories.md 建議內容
把大分類做成快速導覽，不放完整模型清單：

- LLM / Agent / 程式碼
- RAG 與檢索
- 文件理解與資料擷取
- 多模態理解
- 視覺生成與創作
- 語音與翻譯
- 媒體 AI 與影片工具
- 安全與治理
- Physical AI / 自駕 / 機器人
- 3D / OpenUSD / 數位分身
- 生醫與藥物探索
- 科學與工程模擬

每類只需要寫：

- 典型用途
- 何時選這類
- 常見輸入/輸出
- POC 評估方式
- 建議優先查詢的 CSV 欄位

## 建置步驟
1. 建立 skill 資料夾：
   ```bash
   mkdir -p /Users/w.rc/.config/agents/skills/nvidia-model-selector/references
   mkdir -p /Users/w.rc/.config/agents/skills/nvidia-model-selector/scripts
   ```
2. 建立 `SKILL.md`，使用上方建議內容。
3. 複製 references：
   ```bash
   cp /Users/w.rc/nvdiaOSsupport/nvidia-build-models-operational-guide.md /Users/w.rc/.config/agents/skills/nvidia-model-selector/references/operational-guide.md
   cp /Users/w.rc/nvdiaOSsupport/nvidia-build-models-operational-guide.csv /Users/w.rc/.config/agents/skills/nvidia-model-selector/references/inventory.csv
   ```
4. 建立 `references/model-categories.md`。
5. 建立 `scripts/search_models.py`，用 Python 標準函式庫 `csv` / `argparse` 即可，不需要額外依賴。
6. 驗證查詢：
   ```bash
   python3 /Users/w.rc/.config/agents/skills/nvidia-model-selector/scripts/search_models.py --query RAG --limit 5
   python3 /Users/w.rc/.config/agents/skills/nvidia-model-selector/scripts/search_models.py --model bge-m3
   python3 /Users/w.rc/.config/agents/skills/nvidia-model-selector/scripts/search_models.py --service "Embedding API" --limit 5
   ```

## 驗收標準
完成後，其他 agent 應能回答：

- 「我要做企業知識庫 RAG，NVIDIA 哪些模型適合？」
- 「OCR 文件解析要用哪幾個模型？」
- 「影像生成和圖片編輯分別選什麼？」
- 「幫我用 NVIDIA 模型規劃一個客服知識庫 PoC。」
- 「比較 bge-m3、nv-embed-v1、llama-nemotron-rerank 的角色差異。」

回答應包含：

- 推薦模型 1-3 個
- 為何適合
- API/部署型態
- 輸入與輸出
- PoC 步驟
- 上線串接位置
- 風險與驗證方式

## 注意事項
- 不要在 skill 中硬塞完整模型清單到 `SKILL.md`。
- 不要建立 `README.md`、`INSTALL.md` 等多餘文件；skill 內只保留 `SKILL.md`、必要 references、必要 scripts。
- 若 NVIDIA Build Models 有更新，先更新 `/Users/w.rc/nvdiaOSsupport/` 的來源檔，再同步 references。
- 若使用者只是在做研究整理，不要建立或更新 `.agent-handoff.md`。
