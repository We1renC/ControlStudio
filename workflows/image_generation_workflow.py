#!/usr/bin/env python3
"""Runnable NVIDIA image generation workflow."""

from __future__ import annotations

import argparse
import base64
import sys
from datetime import datetime
from pathlib import Path

from common import ROOT_DIR, load_dotenv, post_json, require_env


IMAGE_URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "outputs" / "images"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", type=Path, help="Optional output PNG path.")
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    return parser.parse_args()


def build_output_path(path: Path | None) -> Path:
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return DEFAULT_OUTPUT_DIR / f"flux-schnell-{timestamp}.png"


def main() -> int:
    load_dotenv()
    args = parse_args()
    api_key = require_env("NVIDIA_API_KEY")
    payload = {
        "prompt": args.prompt,
        "height": args.height,
        "width": args.width,
        "samples": 1,
        "seed": args.seed,
        "steps": args.steps,
        "mode": "base",
    }
    response = post_json(IMAGE_URL, api_key, payload, timeout=180)
    try:
        artifact = response["artifacts"][0]
        image_bytes = base64.b64decode(artifact["base64"])
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Unexpected image generation response: {response}") from exc

    output_path = build_output_path(args.output)
    output_path.write_bytes(image_bytes)

    print("== Prompt ==")
    print(args.prompt)
    print("\n== Output ==")
    print(output_path)
    print("\n== Metadata ==")
    print(f"finishReason={artifact.get('finishReason')}")
    print(f"seed={artifact.get('seed')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
