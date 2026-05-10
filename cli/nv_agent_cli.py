#!/usr/bin/env python3
"""CLI for NVIDIA model selection and runnable workflow execution."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = ROOT_DIR / "workflows"
SKILL_SCRIPT = ROOT_DIR / "skills" / "nvidia-model-selector" / "scripts" / "search_models.py"
INVENTORY_CSV = ROOT_DIR / "skills" / "nvidia-model-selector" / "references" / "inventory.csv"

sys.path.insert(0, str(WORKFLOWS_DIR))

from common import load_dotenv, post_json, require_env  # noqa: E402


CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
WORKFLOW_MAP = {
    "rag": WORKFLOWS_DIR / "rag_workflow.py",
    "ocr-rag": WORKFLOWS_DIR / "ocr_rag_workflow.py",
    "safety": WORKFLOWS_DIR / "safety_guard_workflow.py",
    "image": WORKFLOWS_DIR / "image_generation_workflow.py",
    "cuopt": WORKFLOWS_DIR / "cuopt_demo_workflow.py",
}
WORKFLOW_HINTS = [
    ("ocr-rag", ("ocr", "掃描", "影像", "圖片", "pdf", "parse", "document image")),
    ("rag", ("rag", "檢索", "知識庫", "問答", "文件搜尋", "文件檢索", "search")),
    ("safety", ("安全", "審查", "moderation", "guard", "unsafe", "jailbreak")),
    ("image", ("image", "圖片生成", "生圖", "海報", "flux", "設計圖")),
    ("cuopt", ("路線", "排程", "最佳化", "物流", "車隊", "routing", "cuopt")),
]
REQUEST_HINTS = [
    ("RAG 與檢索", ("rag", "檢索", "知識庫", "問答", "搜尋", "文件檢索", "search")),
    ("文件理解與資料擷取", ("ocr", "pdf", "掃描", "parse", "影像文字", "document image")),
    ("安全與治理", ("安全", "審查", "moderation", "guard", "jailbreak")),
    ("視覺生成與創作", ("image", "生圖", "海報", "設計", "flux")),
    ("科學與工程模擬", ("cuopt", "路線", "排程", "物流", "最佳化", "routing")),
]
PREFERRED_MODELS = {
    "RAG 與檢索": ["nvidia/nv-embed-v1", "bge-m3", "llama-nemotron-rerank-1b-v2"],
    "文件理解與資料擷取": ["nemotron-parse", "nemotron-ocr-v1", "paddleocr"],
    "安全與治理": ["nemotron-3-content-safety", "llama-3.1-nemotron-safety-guard-8b-v3"],
    "視覺生成與創作": ["FLUX.1-schnell", "FLUX.1-dev"],
    "科學與工程模擬": ["cuopt"],
    "LLM / Agent / 程式碼": ["llama-3.1-8b-instruct", "nemotron-mini-4b-instruct"],
}


def read_rows(path: Path = INVENTORY_CSV) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def normalize(value: str | None) -> str:
    return (value or "").casefold().strip()


def keyword_score(row: dict[str, str], query: str) -> int:
    haystack_fields = [
        row.get("主分類", ""),
        row.get("子分類", ""),
        row.get("publisher", ""),
        row.get("name", ""),
        row.get("具體用途（中文）", ""),
        row.get("API/服務型態", ""),
        row.get("建議串接位置", ""),
    ]
    haystack = " ".join(haystack_fields).casefold()
    score = 0
    for token in [part for part in query.casefold().split() if part]:
        if token in haystack:
            score += 1
    if query.casefold() in haystack:
        score += 3
    return score


def detect_categories(request_text: str) -> list[str]:
    lowered = request_text.casefold()
    matches: list[str] = []
    for category, keywords in REQUEST_HINTS:
        if any(keyword.casefold() in lowered for keyword in keywords):
            matches.append(category)
    return matches


def detect_workflow(request_text: str) -> str | None:
    lowered = request_text.casefold()
    for workflow, keywords in WORKFLOW_HINTS:
        if any(keyword.casefold() in lowered for keyword in keywords):
            return workflow
    return None


def select_candidates(query: str, limit: int) -> list[dict[str, str]]:
    rows = read_rows()
    scored = [(row, keyword_score(row, query)) for row in rows]
    scored = [item for item in scored if item[1] > 0]
    categories = detect_categories(query)
    if categories:
        preferred_rows = [row for row in rows if row.get("主分類") in categories]
        boosted: list[tuple[dict[str, str], int]] = []
        for row in preferred_rows:
            score = keyword_score(row, query) + 2
            for category in categories:
                for model_name in PREFERRED_MODELS.get(category, []):
                    if normalize(model_name) in normalize(row.get("name")):
                        score += 5
            boosted.append((row, score))
        scored.extend(boosted)
    if not scored and not categories:
        scored = [(row, 1) for row in rows if keyword_score(row, row.get("主分類", "")) > 0]
    scored.sort(key=lambda item: (item[1], item[0].get("分類排序", "0")), reverse=True)
    unique: list[dict[str, str]] = []
    seen: set[str] = set()
    for row, _score in scored:
        key = row.get("name", "")
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
        if len(unique) >= max(limit, 1):
            break
    return unique


def workflow_command(workflow: str | None) -> str | None:
    if workflow == "rag":
        return "./nv-agent run rag --question '你的問題'"
    if workflow == "ocr-rag":
        return "./nv-agent run ocr-rag --question '這張圖片主要在說什麼？'"
    if workflow == "safety":
        return "./nv-agent run safety --prompt '請檢查這段內容是否安全'"
    if workflow == "image":
        return "./nv-agent run image --prompt 'a product poster concept'"
    if workflow == "cuopt":
        return "./nv-agent run cuopt --action cuOpt_OptimizedRouting"
    return None


def run_search(args: argparse.Namespace) -> int:
    command = [sys.executable, str(SKILL_SCRIPT)]
    if args.query:
        command.extend(["--query", args.query])
    if args.category:
        command.extend(["--category", args.category])
    if args.subcategory:
        command.extend(["--subcategory", args.subcategory])
    if args.model:
        command.extend(["--model", args.model])
    if args.service:
        command.extend(["--service", args.service])
    command.extend(["--limit", str(args.limit)])
    if args.json:
        command.append("--json")
    completed = subprocess.run(command, cwd=ROOT_DIR)
    return completed.returncode


def build_advice_prompt(request_text: str, candidates: list[dict[str, str]], workflow: str | None) -> str:
    candidate_lines = []
    for item in candidates:
        candidate_lines.append(
            json.dumps(
                {
                    "主分類": item.get("主分類"),
                    "子分類": item.get("子分類"),
                    "model": item.get("name"),
                    "publisher": item.get("publisher"),
                    "用途": item.get("具體用途（中文）"),
                    "API": item.get("API/服務型態"),
                    "輸入": item.get("典型輸入"),
                    "輸出": item.get("典型輸出"),
                    "串接位置": item.get("建議串接位置"),
                    "POC": item.get("POC檢核"),
                },
                ensure_ascii=False,
            )
        )
    candidate_block = "\n".join(candidate_lines) if candidate_lines else "(no strong local match)"
    workflow_names = ", ".join(sorted(WORKFLOW_MAP))
    suggested_command = workflow_command(workflow) or "(如果目前沒有完全對應 workflow，請明說並建議最接近的一條)"
    return (
        "你是 NVIDIA 模型選型與開發工具助理。"
        "請用繁體中文回答，重點放在工程落地。\n\n"
        f"使用者需求：{request_text}\n\n"
        f"本地候選模型資料：\n{candidate_block}\n\n"
        f"目前可直接執行的 workflow：{workflow_names}\n\n"
        f"優先建議的 workflow：{workflow or '未明確對應'}\n"
        f"若可直接執行，CLI 模板：{suggested_command}\n\n"
        "請輸出：\n"
        "1. 建議模型 1-3 個\n"
        "2. 為何適合\n"
        "3. 建議先用哪條 workflow 或是否需要新增 workflow\n"
        "4. 如果可直接執行，給一條 CLI 指令\n"
        "5. 主要風險或限制\n\n"
        "限制：\n"
        "- 只能從本地候選模型資料挑選模型，不可發明其他模型名稱。\n"
        "- CLI 指令只能引用目前 repo 內實際存在的 `./nv-agent run ...` 形式。\n"
        "- 若候選不足，請直接說明資料不足。"
    )


def run_advise(args: argparse.Namespace) -> int:
    load_dotenv()
    api_key = require_env("NVIDIA_API_KEY")
    model = os.environ.get("NVIDIA_CHAT_MODEL", "meta/llama-3.1-8b-instruct")
    candidates = select_candidates(args.request, args.limit)
    workflow = detect_workflow(args.request)
    prompt = build_advice_prompt(args.request, candidates, workflow)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是 NVIDIA workflow 選型助理。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 600,
    }
    response = post_json(CHAT_URL, api_key, payload, timeout=180)
    print(response["choices"][0]["message"]["content"])
    return 0


def run_workflow(args: argparse.Namespace) -> int:
    script = WORKFLOW_MAP[args.workflow]
    command = [sys.executable, str(script), *args.workflow_args]
    completed = subprocess.run(command, cwd=ROOT_DIR)
    return completed.returncode


def print_workflows() -> int:
    print("Available workflows:")
    for name, path in sorted(WORKFLOW_MAP.items()):
        print(f"- {name}: {path.relative_to(ROOT_DIR)}")
    return 0


def run_doctor() -> int:
    completed = subprocess.run([str(ROOT_DIR / "scripts" / "validate_nvidia_model_selector.sh")], cwd=ROOT_DIR)
    return completed.returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search", help="Search local NVIDIA model inventory.")
    search_parser.add_argument("--query")
    search_parser.add_argument("--category")
    search_parser.add_argument("--subcategory")
    search_parser.add_argument("--model")
    search_parser.add_argument("--service")
    search_parser.add_argument("--limit", type=int, default=10)
    search_parser.add_argument("--json", action="store_true")
    search_parser.set_defaults(func=run_search)

    advise_parser = subparsers.add_parser("advise", help="Ask for model selection advice.")
    advise_parser.add_argument("--request", required=True, help="Natural-language feature request or use case.")
    advise_parser.add_argument("--limit", type=int, default=8, help="How many local candidates to send to the advisor.")
    advise_parser.set_defaults(func=run_advise)

    request_parser = subparsers.add_parser("request", help="Alias of advise for feature requests.")
    request_parser.add_argument("--request", required=True)
    request_parser.add_argument("--limit", type=int, default=8)
    request_parser.set_defaults(func=run_advise)

    workflows_parser = subparsers.add_parser("workflows", help="List runnable workflows.")
    workflows_parser.set_defaults(func=lambda _args: print_workflows())

    run_parser = subparsers.add_parser("run", help="Run one of the local workflows.")
    run_parser.add_argument("workflow", choices=sorted(WORKFLOW_MAP))
    run_parser.add_argument("workflow_args", nargs=argparse.REMAINDER)
    run_parser.set_defaults(func=run_workflow)

    doctor_parser = subparsers.add_parser("doctor", help="Run project validation.")
    doctor_parser.set_defaults(func=lambda _args: run_doctor())

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
