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
test -f "$ROOT_DIR/RUNNABLE_WORKFLOWS.md"
test -f "$ROOT_DIR/data/sample_kb.txt"
test -f "$ROOT_DIR/workflows/rag_workflow.py"

python3 -m py_compile "$SCRIPT"
python3 -m py_compile "$ROOT_DIR/workflows/rag_workflow.py"
python3 "$SCRIPT" --model bge-m3 --limit 1 >/tmp/nvidia-model-selector-bge.md
python3 "$SCRIPT" --service "Embedding API" --limit 2 >/tmp/nvidia-model-selector-embedding.md
python3 "$SCRIPT" --query OCR --limit 2 --json >/tmp/nvidia-model-selector-ocr.json

grep -q "bge-m3" /tmp/nvidia-model-selector-bge.md
grep -q "Embedding API" /tmp/nvidia-model-selector-embedding.md
grep -q "paddleocr\\|nemoretriever-ocr" /tmp/nvidia-model-selector-ocr.json

echo "nvidia-model-selector validation passed"
