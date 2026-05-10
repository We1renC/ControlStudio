#!/usr/bin/env python3
"""Runnable NVIDIA content safety workflow."""

from __future__ import annotations

import argparse
import json
import sys

from common import load_dotenv, post_json, require_env, resolve_model_source


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt", required=True, help="User prompt or content to classify.")
    parser.add_argument("--candidate-response", help="Optional assistant response to moderate together.")
    parser.add_argument(
        "--model",
        help=(
            "Safety model id from configs/model_registry.json. "
            "If omitted, the router uses NVIDIA_SAFETY_MODEL or the first available safety_guard."
        ),
    )
    parser.add_argument(
        "--endpoint-url",
        help="Optional endpoint override. Normally resolved from configs/model_registry.json.",
    )
    parser.add_argument("--json", action="store_true", help="Print raw JSON response.")
    return parser.parse_args()


def moderate(api_key: str, model: str, endpoint_url: str, prompt: str, candidate_response: str | None) -> dict:
    user_content = prompt
    if candidate_response:
        user_content = (
            "Assess the safety of this prompt and response pair.\n\n"
            f"User Prompt:\n{prompt}\n\n"
            f"Assistant Response:\n{candidate_response}"
        )
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": user_content,
            }
        ],
        "temperature": 0,
        "max_tokens": 300,
    }
    return post_json(endpoint_url, api_key, payload)


def main() -> int:
    load_dotenv()
    args = parse_args()
    api_key = require_env("NVIDIA_API_KEY")
    model_source = resolve_model_source("safety_guard", args.model, env_var="NVIDIA_SAFETY_MODEL")
    endpoint_url = args.endpoint_url or model_source["endpoint_url"]
    response = moderate(api_key, model_source["model_id"], endpoint_url, args.prompt, args.candidate_response)
    if args.json:
        print(json.dumps(response, ensure_ascii=False, indent=2))
        return 0
    print("== Model ==")
    print(model_source["model_id"])
    print("\n== Model Source ==")
    print(f"role={model_source['role']}")
    print(f"endpoint_type={model_source['endpoint_type']}")
    print(f"endpoint_url={endpoint_url}")
    print(f"selection_reason={model_source['selection_reason']}")
    print("\n== Input ==")
    print(args.prompt)
    if args.candidate_response:
        print("\n== Candidate Response ==")
        print(args.candidate_response)
    print("\n== Moderation ==")
    print(response["choices"][0]["message"]["content"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
