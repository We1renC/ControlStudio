---
name: nvidia-model-selector
description: Use when selecting, comparing, or operationalizing NVIDIA Build Models, NIM APIs, open-source NVIDIA models, RAG components, OCR, multimodal models, speech, video, image generation, safety, robotics, biology, simulation, 3D/OpenUSD, or deployment workflows.
---

# NVIDIA Model Selector

Use this skill to choose NVIDIA Build Models and turn them into implementation plans.

## Workflow
1. Identify the target function: RAG, OCR, LLM agent, code generation, multimodal understanding, speech, video, image generation/editing, safety, robotics, biology, simulation, or 3D/OpenUSD.
2. Search by category, subcategory, model name, service type, or implementation goal.
3. Recommend 1-3 candidate models unless the user asks for a full inventory.
4. For each candidate, explain:
   - concrete use case
   - input and output
   - API or deployment style
   - PoC steps
   - production integration point
   - validation checks and risks
5. If the user asks for implementation, convert the recommendation into a runnable plan, API call skeleton, service design, or PoC checklist.
6. If the user asks for a runnable demo, prefer the local workflows in `/Users/w.rc/nvdiaOSsupport/workflows/` before inventing a new script.
7. When a concrete runtime model source is needed, use `./nv-agent plan --select-model ROLE=MODEL_ID` so the plan records the selected model and endpoint source from `configs/model_registry.json`.

## References
- Category guide: `references/model-categories.md`
- Operational guide: `references/operational-guide.md`
- Queryable inventory: `references/inventory.csv`
- Runnable workflow guide: `/Users/w.rc/nvdiaOSsupport/RUNNABLE_WORKFLOWS.md`

## Search Strategy
- For broad category questions, read `references/model-categories.md` first.
- For exact model, API/service, or use-case questions, run `scripts/search_models.py`.
- Load only the relevant rows or sections. Avoid reading the full 157-model inventory unless the user explicitly asks for a full table.

## Useful Commands
```bash
python3 scripts/search_models.py --query RAG --limit 5
python3 scripts/search_models.py --category "RAG 與檢索"
python3 scripts/search_models.py --subcategory OCR
python3 scripts/search_models.py --model bge-m3
python3 scripts/search_models.py --service "Embedding API" --limit 5
python3 scripts/search_models.py --query "客服知識庫" --json
```

## Output Shape
Prefer concise Traditional Chinese unless the user asks otherwise.

For selection answers, include:
- 推薦模型
- 適合原因
- API/部署型態
- 典型輸入與輸出
- PoC 步驟
- 上線串接位置
- 主要風險與驗證方式

For implementation answers, include:
- minimal architecture
- request/response data shape
- fallback and monitoring plan
- manual review or safety gates when needed

For runnable demos, point the user to:
- `/Users/w.rc/nvdiaOSsupport/.env`
- `/Users/w.rc/nvdiaOSsupport/workflows/rag_workflow.py`
- `/Users/w.rc/nvdiaOSsupport/data/sample_kb.txt`

For runtime model routing, use:
```bash
./nv-agent plan --request "我要生一張產品海報" \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  --save
./nv-agent run-plan outputs/plans/image-YYYYMMDD-HHMMSS.json
```

The agent using the tool is responsible for choosing the specific `ROLE=MODEL_ID`; the CLI resolves endpoint type and endpoint URL from `configs/model_registry.json`.

## Guardrails
- Do not claim a model is open source unless the reference explicitly supports that. Prefer "NVIDIA Build Models / NIM / downloadable endpoint" when license status is unclear.
- If the user asks for latest availability, verify against current NVIDIA sources before making time-sensitive claims.
- Do not write `.agent-handoff.md` for research-only work. Use the project continuation docs in `/Users/w.rc/nvdiaOSsupport/` when continuity is needed.
