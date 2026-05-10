#!/usr/bin/env python3
"""OCR plus RAG workflow using NVIDIA nemotron-parse and chat completions."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
from pathlib import Path

from common import load_dotenv, post_json, require_env


CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_OCR_MODEL = "nvidia/nemotron-parse"
DEFAULT_CHAT_MODEL = "meta/llama-3.1-8b-instruct"
DEFAULT_IMAGE_URL = "https://jeroen.github.io/images/testocr.png"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image-url", default=DEFAULT_IMAGE_URL)
    parser.add_argument("--image-file", type=Path, help="Optional local image file. Overrides --image-url.")
    parser.add_argument("--question", help="Optional question to answer from OCR output.")
    parser.add_argument("--ocr-model", default=DEFAULT_OCR_MODEL)
    parser.add_argument("--chat-model", default=DEFAULT_CHAT_MODEL)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def build_image_url(image_url: str, image_file: Path | None) -> str:
    if image_file is None:
        return image_url
    if not image_file.exists():
        raise SystemExit(f"Image file not found: {image_file}")
    mime_type = mimetypes.guess_type(image_file.name)[0] or "image/png"
    encoded = base64.b64encode(image_file.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def extract_document(api_key: str, model: str, image_ref: str) -> dict:
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_ref}}
                ],
            }
        ],
        "temperature": 0,
        "max_tokens": 1000,
    }
    return post_json(CHAT_URL, api_key, payload, timeout=180)


def parse_extracted_text(response: dict) -> tuple[str, dict]:
    choice = response["choices"][0]["message"]
    tool_calls = choice.get("tool_calls") or []
    if not tool_calls:
        content = choice.get("content") or ""
        return str(content), response
    arguments = tool_calls[0]["function"]["arguments"]
    blocks = json.loads(arguments)
    texts: list[str] = []
    for page in blocks:
        for block in page:
            text = block.get("text")
            if text:
                texts.append(text)
    return "\n".join(texts), response


def answer_question(api_key: str, model: str, extracted_text: str, question: str) -> str:
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是文件問答助理，只能根據 OCR 擷取內容回答，資訊不足要明說。",
            },
            {
                "role": "user",
                "content": (
                    f"以下是從文件擷取出的文字：\n{extracted_text}\n\n"
                    f"請根據這些內容回答問題：{question}"
                ),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 300,
    }
    response = post_json(CHAT_URL, api_key, payload, timeout=120)
    return response["choices"][0]["message"]["content"]


def main() -> int:
    load_dotenv()
    args = parse_args()
    api_key = require_env("NVIDIA_API_KEY")
    image_ref = build_image_url(args.image_url, args.image_file)
    ocr_response = extract_document(api_key, args.ocr_model, image_ref)
    extracted_text, raw_response = parse_extracted_text(ocr_response)

    if args.json:
        print(json.dumps(raw_response, ensure_ascii=False, indent=2))
        return 0

    print("== OCR Source ==")
    print(args.image_file if args.image_file else args.image_url)
    print("\n== Extracted Text ==")
    print(extracted_text or "(empty)")

    if args.question:
        answer = answer_question(api_key, args.chat_model, extracted_text, args.question)
        print("\n== Answer ==")
        print(answer)
    return 0


if __name__ == "__main__":
    sys.exit(main())
