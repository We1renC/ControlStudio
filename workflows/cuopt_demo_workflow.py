#!/usr/bin/env python3
"""Runnable NVIDIA cuOpt demo workflow."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

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
    parser.add_argument(
        "--local-validate",
        action="store_true",
        help="Validate the bundled cuOpt payload locally without calling the NVIDIA API.",
    )
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def read_problem(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Problem file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def validate_problem(problem: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    cost_data = problem.get("cost_matrix_data", {}).get("data", {})
    task_locations = problem.get("task_data", {}).get("task_locations")
    vehicle_locations = problem.get("fleet_data", {}).get("vehicle_locations")

    if not isinstance(cost_data, dict) or not cost_data:
        errors.append("cost_matrix_data.data must contain at least one matrix")
    for name, matrix in cost_data.items():
        if not isinstance(matrix, list) or not matrix:
            errors.append(f"cost matrix {name} must be a non-empty 2D array")
            continue
        size = len(matrix)
        for row in matrix:
            if not isinstance(row, list) or len(row) != size:
                errors.append(f"cost matrix {name} must be square")
                break
            if any(not isinstance(value, (int, float)) for value in row):
                errors.append(f"cost matrix {name} must contain numeric costs")
                break

    if not isinstance(task_locations, list) or not task_locations:
        errors.append("task_data.task_locations must be a non-empty list")
    if not isinstance(vehicle_locations, list) or not vehicle_locations:
        errors.append("fleet_data.vehicle_locations must be a non-empty list")

    return errors


def run_local_validation(args: argparse.Namespace, problem: dict[str, Any]) -> int:
    errors = validate_problem(problem)
    if args.json:
        print(json.dumps({"valid": not errors, "errors": errors}, ensure_ascii=False, indent=2))
        return 0 if not errors else 1
    print("== Local cuOpt Payload Validation ==")
    print(f"action={args.action}")
    print(f"problem_file={args.problem_file}")
    if errors:
        print("Input is Invalid")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Input is Valid")
    print("No NVIDIA API call was made.")
    return 0


def main() -> int:
    load_dotenv()
    args = parse_args()
    problem = read_problem(args.problem_file)
    if args.local_validate:
        return run_local_validation(args, problem)

    api_key = require_env("NVIDIA_API_KEY")
    model_source = resolve_model_source("optimizer", args.model, env_var="NVIDIA_OPTIMIZER_MODEL")
    endpoint_url = args.endpoint_url or model_source["endpoint_url"]
    payload = {
        "action": args.action,
        "data": problem,
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
