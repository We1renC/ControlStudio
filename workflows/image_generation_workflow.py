#!/usr/bin/env python3
"""Runnable NVIDIA image generation workflow."""

from __future__ import annotations

import argparse
import base64
import sys
from datetime import datetime
from pathlib import Path

from common import ROOT_DIR, load_dotenv, post_json, require_env, resolve_model_source


DEFAULT_OUTPUT_DIR = ROOT_DIR / "outputs" / "images"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", type=Path, help="Optional output PNG path.")
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--model",
        help=(
            "Image model id from configs/model_registry.json. "
            "If omitted, the router uses NVIDIA_IMAGE_MODEL or the first available image_generator."
        ),
    )
    parser.add_argument(
        "--endpoint-url",
        help="Optional endpoint override. Normally resolved from configs/model_registry.json.",
    )
    return parser.parse_args()


def model_slug(model_id: str) -> str:
    return model_id.rsplit("/", 1)[-1].replace(".", "-").replace("_", "-").lower()


def build_output_path(path: Path | None, model_id: str) -> Path:
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return DEFAULT_OUTPUT_DIR / f"{model_slug(model_id)}-{timestamp}.png"


def main() -> int:
    load_dotenv()
    args = parse_args()
    api_key = require_env("NVIDIA_API_KEY")
    model_source = resolve_model_source("image_generator", args.model, env_var="NVIDIA_IMAGE_MODEL")
    endpoint_url = args.endpoint_url or model_source["endpoint_url"]
    payload = {
        "prompt": args.prompt,
        "height": args.height,
        "width": args.width,
        "samples": 1,
        "seed": args.seed,
        "steps": args.steps,
        "mode": "base",
    }
    response = post_json(endpoint_url, api_key, payload, timeout=180)
    try:
        artifact = response["artifacts"][0]
        image_bytes = base64.b64decode(artifact["base64"])
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Unexpected image generation response: {response}") from exc

    output_path = build_output_path(args.output, model_source["model_id"])
    output_path.write_bytes(image_bytes)

    print("== Prompt ==")
    print(args.prompt)
    print("\n== Model Source ==")
    print(f"role={model_source['role']}")
    print(f"model={model_source['model_id']}")
    print(f"endpoint_type={model_source['endpoint_type']}")
    print(f"endpoint_url={endpoint_url}")
    print(f"selection_reason={model_source['selection_reason']}")
    print("\n== Output ==")
    print(output_path)
    print("\n== Metadata ==")
    print(f"finishReason={artifact.get('finishReason')}")
    print(f"seed={artifact.get('seed')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
