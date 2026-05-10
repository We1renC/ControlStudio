#!/usr/bin/env python3
"""Search the NVIDIA Build Models operational inventory."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INVENTORY = SCRIPT_DIR.parent / "references" / "inventory.csv"

OUTPUT_FIELDS = [
    "主分類",
    "子分類",
    "publisher",
    "name",
    "url",
    "具體用途（中文）",
    "API/服務型態",
    "典型輸入",
    "典型輸出",
    "落地操作步驟",
    "建議串接位置",
    "POC檢核",
    "nimType",
]


def normalize(value: str | None) -> str:
    return (value or "").casefold().strip()


def contains(haystack: str | None, needle: str | None) -> bool:
    if not needle:
        return True
    return normalize(needle) in normalize(haystack)


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def matches(row: dict[str, str], args: argparse.Namespace) -> bool:
    if args.category and not contains(row.get("主分類"), args.category):
        return False
    if args.subcategory and not contains(row.get("子分類"), args.subcategory):
        return False
    if args.model and not (
        contains(row.get("name"), args.model)
        or contains(row.get("publisher"), args.model)
        or contains(row.get("url"), args.model)
    ):
        return False
    if args.service and not contains(row.get("API/服務型態"), args.service):
        return False
    if args.query:
        searchable = " ".join(str(row.get(field, "")) for field in row.keys())
        if not contains(searchable, args.query):
            return False
    return True


def trim_row(row: dict[str, str]) -> dict[str, str]:
    return {field: row.get(field, "") for field in OUTPUT_FIELDS}


def markdown_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip()


def print_markdown(rows: Iterable[dict[str, str]]) -> None:
    fields = ["主分類", "子分類", "name", "API/服務型態", "具體用途（中文）", "落地操作步驟", "url"]
    print("| " + " | ".join(fields) + " |")
    print("|" + "|".join("---" for _ in fields) + "|")
    for row in rows:
        print("| " + " | ".join(markdown_escape(row.get(field, "")) for field in fields) + " |")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--category", help="Filter by 主分類.")
    parser.add_argument("--subcategory", help="Filter by 子分類.")
    parser.add_argument("--model", help="Filter by model name, publisher, or URL.")
    parser.add_argument("--service", help="Filter by API/服務型態.")
    parser.add_argument("--query", help="Search all fields.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    rows = [trim_row(row) for row in read_rows(args.inventory) if matches(row, args)]
    rows = rows[: max(args.limit, 0)]

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_markdown(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
