#!/usr/bin/env python3
"""Minimal runnable NVIDIA RAG workflow using only the Python standard library.

NVIDIA_API_KEY is shared across supported NVIDIA API models. Model selection is
handled at runtime through CLI flags or env defaults.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from common import load_dotenv, post_json, require_env


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DOCS = ROOT_DIR / "data" / "sample_kb.txt"
EMBEDDING_URL = "https://integrate.api.nvidia.com/v1/embeddings"
CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
INPUT_TYPE_MODELS = (
    "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
    "nvidia/llama-3.2-nemoretriever-300m-embed-v2",
    "nvidia/llama-3.2-nv-embedqa-1b-v1",
    "nvidia/llama-3.2-nv-embedqa-1b-v2",
    "nvidia/llama-nemotron-embed-1b-v2",
    "nvidia/llama-nemotron-embed-vl-1b-v2",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--documents-file", type=Path, default=DEFAULT_DOCS)
    parser.add_argument("--question", required=True)
    parser.add_argument("--top-k", type=int, default=1)
    parser.add_argument(
        "--embed-model",
        default=os.environ.get("NVIDIA_EMBED_MODEL", "nvidia/nv-embed-v1"),
        help="Embedding model name. Uses the same NVIDIA_API_KEY as other supported models.",
    )
    parser.add_argument(
        "--chat-model",
        default=os.environ.get("NVIDIA_CHAT_MODEL", "meta/llama-3.1-8b-instruct"),
        help="Chat model name. Uses the same NVIDIA_API_KEY as other supported models.",
    )
    return parser.parse_args()

def read_documents(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"Documents file not found: {path}")
    content = path.read_text(encoding="utf-8").strip()
    docs = [chunk.strip() for chunk in content.split("\n\n") if chunk.strip()]
    if not docs:
        raise SystemExit(f"No document chunks found in {path}")
    return docs

def get_embedding(api_key: str, model: str, text: str, input_type: str) -> list[float]:
    payload = {
        "input": [text],
        "model": model,
        "encoding_format": "float",
    }
    if model in INPUT_TYPE_MODELS:
        payload["input_type"] = input_type
    response = post_json(EMBEDDING_URL, api_key, payload)
    try:
        return response["data"][0]["embedding"]
    except (KeyError, IndexError, TypeError) as exc:
        raise SystemExit(f"Unexpected embedding response: {json.dumps(response, ensure_ascii=False)}") from exc


def cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return numerator / (left_norm * right_norm)


def rank_documents(api_key: str, model: str, documents: list[str], question: str, top_k: int) -> list[tuple[str, float]]:
    doc_vectors = [(doc, get_embedding(api_key, model, doc, "passage")) for doc in documents]
    question_vector = get_embedding(api_key, model, question, "query")
    scored = [(doc, cosine_similarity(question_vector, vector)) for doc, vector in doc_vectors]
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[: max(top_k, 1)]


def generate_answer(api_key: str, model: str, question: str, context_blocks: list[str]) -> str:
    context = "\n\n".join(f"[{index}] {block}" for index, block in enumerate(context_blocks, start=1))
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是企業知識助理，只能根據提供的參考內容回答；若資料不足要明確說明。",
            },
            {
                "role": "user",
                "content": (
                    f"請根據以下參考資料回答問題。\n\n參考資料：\n{context}\n\n問題：{question}"
                ),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 300,
    }
    response = post_json(CHAT_URL, api_key, payload)
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise SystemExit(f"Unexpected chat response: {json.dumps(response, ensure_ascii=False)}") from exc


def main() -> int:
    load_dotenv()
    args = parse_args()
    api_key = require_env("NVIDIA_API_KEY")
    documents = read_documents(args.documents_file)
    top_matches = rank_documents(api_key, args.embed_model, documents, args.question, args.top_k)
    contexts = [doc for doc, _score in top_matches]
    answer = generate_answer(api_key, args.chat_model, args.question, contexts)

    print("== Query ==")
    print(args.question)
    print("\n== Retrieved Context ==")
    for index, (doc, score) in enumerate(top_matches, start=1):
        print(f"[{index}] score={score:.4f}")
        print(doc)
        print()
    print("== Answer ==")
    print(answer)
    return 0


if __name__ == "__main__":
    sys.exit(main())
