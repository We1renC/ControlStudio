#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$ROOT_DIR/skills/nvidia-model-selector"
SCRIPT="$SKILL_DIR/scripts/search_models.py"
LINK="/Users/w.rc/.config/agents/skills/nvidia-model-selector"

test -f "$SKILL_DIR/SKILL.md"
test -f "$SKILL_DIR/references/model-categories.md"
test -f "$SKILL_DIR/references/operational-guide.md"
test -f "$SKILL_DIR/references/inventory.csv"
test -x "$SCRIPT"
test "$(readlink "$LINK")" = "$SKILL_DIR"
test -f "$ROOT_DIR/.env.example"
test -f "$ROOT_DIR/AGENTS.md"
test -f "$ROOT_DIR/AGENT_USAGE.md"
test -f "$ROOT_DIR/RUNNABLE_WORKFLOWS.md"
test -f "$ROOT_DIR/CONTROL_SYSTEM_BACKLOG.md"
test -f "$ROOT_DIR/data/sample_kb.txt"
test -f "$ROOT_DIR/data/cuopt_sample_problem.json"
test -f "$ROOT_DIR/workflows/rag_workflow.py"
test -f "$ROOT_DIR/workflows/common.py"
test -f "$ROOT_DIR/workflows/safety_guard_workflow.py"
test -f "$ROOT_DIR/workflows/image_generation_workflow.py"
test -f "$ROOT_DIR/workflows/cuopt_demo_workflow.py"
test -f "$ROOT_DIR/workflows/ocr_rag_workflow.py"
test -f "$ROOT_DIR/workflows/control_advisor_workflow.py"
test -f "$ROOT_DIR/control-studio/index.html"
test -f "$ROOT_DIR/control-studio/scripts/control_api.py"
test -f "$ROOT_DIR/control-studio/scripts/control_analysis_cli.mjs"
test -f "$ROOT_DIR/control-studio/scripts/verify_control_cases.mjs"
test -f "$ROOT_DIR/control-studio/scripts/verify_control_api_contract.mjs"
test -f "$ROOT_DIR/control-studio/scripts/serve_studio.py"
test -f "$ROOT_DIR/control-studio/requirements-api.txt"
test -f "$ROOT_DIR/control-studio/js/control/state-space.js"
test -f "$ROOT_DIR/control-studio/js/control/zpk.js"
test -f "$ROOT_DIR/control-studio/js/control/compensator.js"
test -f "$ROOT_DIR/control-studio/js/verification/verification-cases.js"
test -f "$ROOT_DIR/test_control.js"
test -f "$ROOT_DIR/cli/nv_agent_cli.py"
test -x "$ROOT_DIR/nv-agent"

python3 -m py_compile "$SCRIPT"
python3 -m py_compile "$ROOT_DIR/workflows/common.py"
python3 -m py_compile "$ROOT_DIR/workflows/rag_workflow.py"
python3 -m py_compile "$ROOT_DIR/workflows/safety_guard_workflow.py"
python3 -m py_compile "$ROOT_DIR/workflows/image_generation_workflow.py"
python3 -m py_compile "$ROOT_DIR/workflows/cuopt_demo_workflow.py"
python3 -m py_compile "$ROOT_DIR/workflows/ocr_rag_workflow.py"
python3 -m py_compile "$ROOT_DIR/workflows/control_advisor_workflow.py"
python3 -m py_compile "$ROOT_DIR/control-studio/scripts/control_api.py"
python3 -m py_compile "$ROOT_DIR/control-studio/scripts/serve_studio.py"
python3 -m py_compile "$ROOT_DIR/cli/nv_agent_cli.py"
python3 -m json.tool "$ROOT_DIR/configs/model_registry.json" >/tmp/nvidia-model-registry.json
python3 -m json.tool "$ROOT_DIR/configs/task_profiles.json" >/tmp/nvidia-task-profiles.json
python3 "$SCRIPT" --model bge-m3 --limit 1 >/tmp/nvidia-model-selector-bge.md
python3 "$SCRIPT" --service "Embedding API" --limit 2 >/tmp/nvidia-model-selector-embedding.md
python3 "$SCRIPT" --query OCR --limit 2 --json >/tmp/nvidia-model-selector-ocr.json
python3 "$ROOT_DIR/workflows/safety_guard_workflow.py" --prompt "Write a short thank-you note to my team." >/tmp/nvidia-safety-safe.txt
python3 "$ROOT_DIR/workflows/cuopt_demo_workflow.py" --action cuOpt_RoutingValidator >/tmp/nvidia-cuopt-validator.txt
python3 "$ROOT_DIR/workflows/ocr_rag_workflow.py" >/tmp/nvidia-ocr-rag.txt
"$ROOT_DIR/nv-agent" workflows >/tmp/nvidia-agent-workflows.txt
"$ROOT_DIR/nv-agent" search --query RAG --limit 2 >/tmp/nvidia-agent-search.txt
"$ROOT_DIR/nv-agent" plan --request "我要做企業知識庫問答" --output /tmp/nvidia-agent-plan.json >/tmp/nvidia-agent-plan.txt
"$ROOT_DIR/nv-agent" run-plan /tmp/nvidia-agent-plan.json --dry-run >/tmp/nvidia-agent-run-plan.txt
"$ROOT_DIR/nv-agent" plan --request "我要生一張產品海報" \
  --select-model image_generator=black-forest-labs/flux.1-schnell \
  --output /tmp/nvidia-agent-image-plan.json >/tmp/nvidia-agent-image-plan.txt
"$ROOT_DIR/nv-agent" run-plan /tmp/nvidia-agent-image-plan.json --dry-run >/tmp/nvidia-agent-image-run-plan.txt
"$ROOT_DIR/nv-agent" plan --request "control advisor for {'formula':'1/(s+1)','overshoot':20,'phaseMargin':45,'stability':'stable'}" \
  --select-model control_expert=meta/llama-3.1-70b-instruct \
  --output /tmp/nvidia-agent-control-plan.json >/tmp/nvidia-agent-control-plan.txt
"$ROOT_DIR/nv-agent" run-plan /tmp/nvidia-agent-control-plan.json --dry-run >/tmp/nvidia-agent-control-run-plan.txt
python3 "$ROOT_DIR/workflows/control_advisor_workflow.py" --help >/tmp/nvidia-control-advisor-help.txt
node "$ROOT_DIR/test_control.js" >/tmp/nvidia-control-test.txt
node "$ROOT_DIR/control-studio/scripts/verify_control_cases.mjs" >/tmp/nvidia-control-verification-cases.txt
node "$ROOT_DIR/control-studio/scripts/verify_control_api_contract.mjs" >/tmp/nvidia-control-api-contract.txt
node "$ROOT_DIR/control-studio/scripts/control_analysis_cli.mjs" '{"system":{"type":"transfer_function","num":[1],"den":[1,1]},"controller":{"type":"pid","Kp":1,"Ki":0.5,"Kd":0.1},"simulation":{"mode":"closed_loop","inputWaveform":"step","sampleCount":20}}' >/tmp/nvidia-control-api-cli.json

grep -q "bge-m3" /tmp/nvidia-model-selector-bge.md
grep -q "Embedding API" /tmp/nvidia-model-selector-embedding.md
grep -q "paddleocr\\|nemoretriever-ocr" /tmp/nvidia-model-selector-ocr.json
grep -q "User Safety: safe" /tmp/nvidia-safety-safe.txt
grep -q "Input is Valid" /tmp/nvidia-cuopt-validator.txt
grep -q "This is a lot of 12 point text" /tmp/nvidia-ocr-rag.txt
grep -q "Available workflows" /tmp/nvidia-agent-workflows.txt
grep -q "RAG 與檢索\\|LLM / Agent / 程式碼" /tmp/nvidia-agent-search.txt
grep -q "Profile: rag" /tmp/nvidia-agent-plan.txt
grep -q "./nv-agent run rag" /tmp/nvidia-agent-run-plan.txt
grep -q "selected: nvidia/nv-embed-v1" /tmp/nvidia-agent-plan.txt
grep -q "Profile: image" /tmp/nvidia-agent-image-plan.txt
grep -q "selected: black-forest-labs/flux.1-schnell" /tmp/nvidia-agent-image-plan.txt
grep -q -- "--endpoint-url https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell" /tmp/nvidia-agent-image-run-plan.txt
grep -q "Profile: control-advisor" /tmp/nvidia-agent-control-plan.txt
grep -q "selected: meta/llama-3.1-70b-instruct" /tmp/nvidia-agent-control-plan.txt
grep -q "./nv-agent run control-advisor" /tmp/nvidia-agent-control-run-plan.txt
grep -q -- "--model meta/llama-3.1-70b-instruct" /tmp/nvidia-agent-control-run-plan.txt
grep -q "Control System Smart Advisor" /tmp/nvidia-control-advisor-help.txt
grep -q "Tests Passed!" /tmp/nvidia-control-test.txt
grep -q "ZPK tests passed" /tmp/nvidia-control-test.txt
grep -q "Polydiv test passed" /tmp/nvidia-control-test.txt
grep -q "Routh-Hurwitz test passed" /tmp/nvidia-control-test.txt
grep -q "PID preset tests passed" /tmp/nvidia-control-test.txt
grep -q "Lead/Lag compensator tests passed" /tmp/nvidia-control-test.txt
grep -q "Nichols data points" /tmp/nvidia-control-test.txt
grep -q "Verification fixtures passed: 5/5" /tmp/nvidia-control-verification-cases.txt
grep -q "API contract fixtures passed: 5/5" /tmp/nvidia-control-api-contract.txt
grep -q "\"response\"" /tmp/nvidia-control-api-cli.json
grep -q "AGENT_CONTINUATION.md" "$ROOT_DIR/AGENTS.md"
grep -q "./nv-agent plan" "$ROOT_DIR/AGENT_USAGE.md"
grep -q "./nv-agent run-plan" "$ROOT_DIR/AGENT_USAGE.md"
grep -q "./nv-agent eval" "$ROOT_DIR/AGENT_USAGE.md"
grep -q -- "--select-model" "$ROOT_DIR/AGENT_USAGE.md"
grep -q "control-advisor" "$ROOT_DIR/AGENT_USAGE.md"
grep -q "control-studio" "$ROOT_DIR/README.md"
grep -q "control_advisor_workflow.py" "$ROOT_DIR/README.md"
grep -q "CONTROL_SYSTEM_BACKLOG.md" "$ROOT_DIR/README.md"
grep -q "Fixture-based verification runner" "$ROOT_DIR/CONTROL_SYSTEM_BACKLOG.md"
grep -q "Block Diagram expansion" "$ROOT_DIR/CONTROL_SYSTEM_BACKLOG.md"
grep -q "ControlStudioSmoke" "$ROOT_DIR/control-studio/js/app.js"
grep -q "Lead compensator 需要 0 < alpha < 1" "$ROOT_DIR/control-studio/js/app.js"
grep -q "comparison-table" "$ROOT_DIR/control-studio/index.html"
grep -q "designLeadCompensator" "$ROOT_DIR/control-studio/js/control/compensator.js"
grep -q "control-advisor" "$ROOT_DIR/AGENT_CONTINUATION.md"
grep -q "runtime model routing" "$ROOT_DIR/skills/nvidia-model-selector/SKILL.md"

echo "nvidia-model-selector validation passed"
