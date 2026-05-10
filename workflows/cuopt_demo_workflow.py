#!/usr/bin/env python3
"""Runnable NVIDIA cuOpt demo workflow."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import ROOT_DIR, load_dotenv, post_json, require_env


CUOPT_URL = "https://optimize.api.nvidia.com/v1/nvidia/cuopt"
DEFAULT_PROBLEM = ROOT_DIR / "data" / "cuopt_sample_problem.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--problem-file", type=Path, default=DEFAULT_PROBLEM)
    parser.add_argument(
        "--action",
        choices=["cuOpt_OptimizedRouting", "cuOpt_RoutingValidator"],
        default="cuOpt_OptimizedRouting",
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
    payload = {
        "action": args.action,
        "data": read_problem(args.problem_file),
    }
    response = post_json(CUOPT_URL, api_key, payload, timeout=180)
    if args.json:
        print(json.dumps(response, ensure_ascii=False, indent=2))
        return 0
    print("== Action ==")
    print(args.action)
    print("\n== Problem File ==")
    print(args.problem_file)
    print("\n== Response ==")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
