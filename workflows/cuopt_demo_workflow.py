#!/usr/bin/env python3
"""Runnable NVIDIA cuOpt demo workflow."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import ROOT_DIR, load_dotenv, post_json, require_env, resolve_model_source


DEFAULT_PROBLEM = ROOT_DIR / "data" / "cuopt_sample_problem.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--problem-file", type=Path, default=DEFAULT_PROBLEM)
    parser.add_argument(
        "--action",
        choices=["cuOpt_OptimizedRouting", "cuOpt_RoutingValidator"],
        default="cuOpt_OptimizedRouting",
    )
    parser.add_argument(
        "--model",
        help=(
            "Optimizer model id from configs/model_registry.json. "
            "If omitted, the router uses NVIDIA_OPTIMIZER_MODEL or the first available optimizer."
        ),
    )
    parser.add_argument(
        "--endpoint-url",
        help="Optional endpoint override. Normally resolved from configs/model_registry.json.",
    )
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def read_problem(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Problem file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    load_dotenv()
    args = parse_args()
    api_key = require_env("NVIDIA_API_KEY")
    model_source = resolve_model_source("optimizer", args.model, env_var="NVIDIA_OPTIMIZER_MODEL")
    endpoint_url = args.endpoint_url or model_source["endpoint_url"]
    payload = {
        "action": args.action,
        "data": read_problem(args.problem_file),
    }
    response = post_json(endpoint_url, api_key, payload, timeout=180)
    if args.json:
        print(json.dumps(response, ensure_ascii=False, indent=2))
        return 0
    print("== Model Source ==")
    print(f"role={model_source['role']}")
    print(f"model={model_source['model_id']}")
    print(f"endpoint_type={model_source['endpoint_type']}")
    print(f"endpoint_url={endpoint_url}")
    print(f"selection_reason={model_source['selection_reason']}")
    print()
    print("== Action ==")
    print(args.action)
    print("\n== Problem File ==")
    print(args.problem_file)
    print("\n== Response ==")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
