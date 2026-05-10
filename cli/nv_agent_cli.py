#!/usr/bin/env python3
"""CLI for NVIDIA model selection and runnable workflow execution."""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = ROOT_DIR / "workflows"
SKILL_SCRIPT = ROOT_DIR / "skills" / "nvidia-model-selector" / "scripts" / "search_models.py"
INVENTORY_CSV = ROOT_DIR / "skills" / "nvidia-model-selector" / "references" / "inventory.csv"
MODEL_REGISTRY = ROOT_DIR / "configs" / "model_registry.json"
TASK_PROFILES = ROOT_DIR / "configs" / "task_profiles.json"
PLANS_DIR = ROOT_DIR / "outputs" / "plans"
RUNS_DIR = ROOT_DIR / "outputs" / "runs"

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


def timestamp() -> str:
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_models() -> list[dict]:
    return load_json(MODEL_REGISTRY)["models"]


def load_profiles() -> list[dict]:
    return load_json(TASK_PROFILES)["profiles"]


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


def detect_profile(request_text: str) -> dict | None:
    lowered = request_text.casefold()
    for profile in load_profiles():
        if any(trigger.casefold() in lowered for trigger in profile.get("triggers", [])):
            return profile
    workflow = detect_workflow(request_text)
    if workflow:
        return next((profile for profile in load_profiles() if profile["workflow"] == workflow), None)
    return None


def models_for_role(role: str) -> list[dict]:
    models = [model for model in load_models() if role in model.get("roles", [])]
    status_rank = {
        "tested_success": 0,
        "candidate_not_wired": 1,
        "candidate_account_issue": 2,
    }
    models.sort(key=lambda model: status_rank.get(model.get("status", ""), 9))
    return models


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


def command_for_profile(profile: dict, request_text: str) -> list[str]:
    workflow = profile["workflow"]
    if workflow == "rag":
        return ["./nv-agent", "run", "rag", "--question", request_text]
    if workflow == "ocr-rag":
        return ["./nv-agent", "run", "ocr-rag", "--question", request_text]
    if workflow == "safety":
        return ["./nv-agent", "run", "safety", "--prompt", request_text]
    if workflow == "image":
        return ["./nv-agent", "run", "image", "--prompt", request_text]
    if workflow == "cuopt":
        return ["./nv-agent", "run", "cuopt", "--action", "cuOpt_OptimizedRouting"]
    return ["./nv-agent", "workflows"]


def format_command(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


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


def build_plan(request_text: str, profile: dict, candidate_limit: int) -> dict:
    command = command_for_profile(profile, request_text)
    stages = []
    for stage in profile["stages"]:
        role_models = models_for_role(stage["role"])[:candidate_limit]
        stages.append(
            {
                "id": stage["id"],
                "role": stage["role"],
                "goal": stage["goal"],
                "candidate_models": [
                    {
                        "id": model["id"],
                        "status": model["status"],
                        "endpoint_type": model["endpoint_type"],
                        "notes": model.get("notes", ""),
                    }
                    for model in role_models
                ],
            }
        )
    return {
        "schema_version": 1,
        "created_at": timestamp(),
        "request": request_text,
        "profile_id": profile["id"],
        "profile_name": profile["name"],
        "workflow": profile["workflow"],
        "command": command,
        "command_preview": format_command(command),
        "stages": stages,
        "rubric": profile.get("rubric", []),
    }


def save_plan(plan: dict, output: Path | None) -> Path:
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    path = output or PLANS_DIR / f"{plan['profile_id']}-{timestamp()}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def print_plan(plan: dict, plan_path: Path | None = None) -> None:
    if plan_path:
        print(f"Plan: {plan_path}")
    print(f"Profile: {plan['profile_id']} ({plan['profile_name']})")
    print(f"Command: {plan['command_preview']}")
    print("Stages:")
    for stage in plan["stages"]:
        models = ", ".join(model["id"] for model in stage["candidate_models"]) or "(no model)"
        print(f"- {stage['id']} [{stage['role']}]: {stage['goal']}")
        print(f"  models: {models}")
    print("Rubric:")
    for item in plan["rubric"]:
        print(f"- {item}")


def run_plan(args: argparse.Namespace) -> int:
    plan_path = Path(args.plan_file)
    plan = load_json(plan_path)
    command = plan["command"]
    extra_args = list(args.extra_args)
    dry_run = args.dry_run
    if "--dry-run" in extra_args:
        dry_run = True
        extra_args = [item for item in extra_args if item != "--dry-run"]
    if extra_args and extra_args[0] == "--":
        extra_args = extra_args[1:]
    if extra_args:
        command = [*command, *extra_args]
    if dry_run:
        print(format_command(command))
        return 0

    run_id = f"{plan['profile_id']}-{timestamp()}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(command, cwd=ROOT_DIR, text=True, capture_output=True)
    (run_dir / "stdout.txt").write_text(completed.stdout, encoding="utf-8")
    (run_dir / "stderr.txt").write_text(completed.stderr, encoding="utf-8")
    manifest = {
        "schema_version": 1,
        "run_id": run_id,
        "created_at": timestamp(),
        "plan_file": str(plan_path),
        "profile_id": plan["profile_id"],
        "workflow": plan["workflow"],
        "command": command,
        "command_preview": format_command(command),
        "returncode": completed.returncode,
        "stdout_file": str(run_dir / "stdout.txt"),
        "stderr_file": str(run_dir / "stderr.txt"),
        "rubric": plan.get("rubric", []),
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    print(f"\nRun manifest: {run_dir / 'manifest.json'}")
    return completed.returncode


def score_run_text(profile_id: str, text: str, returncode: int) -> dict:
    checks = []
    checks.append({"name": "command_success", "passed": returncode == 0})
    if profile_id == "rag":
        checks.extend(
            [
                {"name": "retrieved_context_present", "passed": "== Retrieved Context ==" in text},
                {"name": "answer_present", "passed": "== Answer ==" in text and len(text.split("== Answer ==")[-1].strip()) > 0},
            ]
        )
    elif profile_id == "ocr-rag":
        checks.extend(
            [
                {"name": "ocr_text_present", "passed": "== Extracted Text ==" in text and "(empty)" not in text},
                {"name": "answer_optional_or_present", "passed": True},
            ]
        )
    elif profile_id == "safety":
        checks.append({"name": "safety_label_present", "passed": "User Safety:" in text})
    elif profile_id == "image":
        checks.extend(
            [
                {"name": "output_path_present", "passed": "== Output ==" in text},
                {"name": "success_metadata_present", "passed": "finishReason=SUCCESS" in text},
            ]
        )
    elif profile_id == "cuopt":
        checks.extend(
            [
                {"name": "solver_response_present", "passed": "solver_response" in text},
                {"name": "status_success", "passed": '"status": 0' in text},
            ]
        )
    passed = sum(1 for check in checks if check["passed"])
    score = passed / len(checks) if checks else 0.0
    return {"score": score, "checks": checks}


def run_eval(args: argparse.Namespace) -> int:
    run_dir = Path(args.run)
    manifest = load_json(run_dir / "manifest.json")
    stdout_text = Path(manifest["stdout_file"]).read_text(encoding="utf-8")
    stderr_text = Path(manifest["stderr_file"]).read_text(encoding="utf-8")
    result = score_run_text(manifest["profile_id"], stdout_text + "\n" + stderr_text, manifest["returncode"])
    eval_path = run_dir / "evaluation.json"
    eval_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Evaluation: {eval_path}")
    print(f"Score: {result['score']:.2f}")
    for check in result["checks"]:
        status = "PASS" if check["passed"] else "FAIL"
        print(f"- {status} {check['name']}")
    return 0 if result["score"] == 1.0 else 1


def run_plan_command(args: argparse.Namespace) -> int:
    profile = detect_profile(args.request)
    if not profile:
        profile = next(profile for profile in load_profiles() if profile["id"] == "rag")
    plan = build_plan(args.request, profile, args.candidate_limit)
    plan_path = save_plan(plan, args.output) if args.save or args.output else None
    print_plan(plan, plan_path)
    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


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

    plan_parser = subparsers.add_parser("plan", help="Create a task plan with stages, models, and rubric.")
    plan_parser.add_argument("--request", required=True)
    plan_parser.add_argument("--candidate-limit", type=int, default=3)
    plan_parser.add_argument("--output", type=Path)
    plan_parser.add_argument("--save", action="store_true", help="Save to outputs/plans when --output is omitted.")
    plan_parser.add_argument("--json", action="store_true")
    plan_parser.set_defaults(func=run_plan_command)

    run_plan_parser = subparsers.add_parser("run-plan", help="Execute a saved plan and write a run manifest.")
    run_plan_parser.add_argument("plan_file")
    run_plan_parser.add_argument("--dry-run", action="store_true")
    run_plan_parser.add_argument("extra_args", nargs=argparse.REMAINDER)
    run_plan_parser.set_defaults(func=run_plan)

    eval_parser = subparsers.add_parser("eval", help="Evaluate a run directory.")
    eval_parser.add_argument("--run", required=True, help="Run directory containing manifest.json.")
    eval_parser.set_defaults(func=run_eval)

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
