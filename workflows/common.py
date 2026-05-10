#!/usr/bin/env python3
"""Shared helpers for runnable NVIDIA workflows."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT_DIR / ".env"
MODEL_REGISTRY_FILE = ROOT_DIR / "configs" / "model_registry.json"
DEFAULT_ENDPOINTS_BY_TYPE = {
    "integrate_embeddings": "https://integrate.api.nvidia.com/v1/embeddings",
    "integrate_chat": "https://integrate.api.nvidia.com/v1/chat/completions",
    "integrate_chat_multimodal": "https://integrate.api.nvidia.com/v1/chat/completions",
}
STATUS_RANK = {
    "tested_success": 0,
    "candidate_not_wired": 1,
    "candidate_account_issue": 2,
}


def load_dotenv(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing {name}. Put it in {ENV_FILE} or export it before running this workflow.")
    return value


def load_model_registry(path: Path = MODEL_REGISTRY_FILE) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"Model registry not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("models", [])


def model_status_rank(model: dict) -> int:
    return STATUS_RANK.get(model.get("status", ""), 99)


def find_model(model_id: str, models: list[dict] | None = None) -> dict:
    for model in models or load_model_registry():
        if model.get("id") == model_id:
            return model
    raise SystemExit(f"Model not found in registry: {model_id}")


def models_for_role(role: str, models: list[dict] | None = None) -> list[dict]:
    matches = [model for model in models or load_model_registry() if role in model.get("roles", [])]
    matches.sort(key=model_status_rank)
    return matches


def endpoint_for_model(model: dict) -> str:
    endpoint = model.get("endpoint_url") or DEFAULT_ENDPOINTS_BY_TYPE.get(model.get("endpoint_type", ""))
    if not endpoint:
        raise SystemExit(
            f"Model {model.get('id')} does not define an endpoint_url and endpoint_type "
            f"{model.get('endpoint_type')} has no runtime default."
        )
    return endpoint


def resolve_model_source(
    role: str,
    requested_model: str | None = None,
    *,
    env_var: str | None = None,
    allow_role_mismatch: bool = False,
) -> dict:
    """Resolve a runtime model source for a workflow role.

    Selection priority:
    1. agent/runtime explicit requested_model
    2. env var default, when provided
    3. first tested/candidate model for the role from configs/model_registry.json
    """

    models = load_model_registry()
    env_model = os.environ.get(env_var) if env_var else None
    model_id = requested_model or env_model
    if model_id:
        model = find_model(model_id, models)
        selection_reason = "agent_selected" if requested_model else f"env:{env_var}"
    else:
        candidates = models_for_role(role, models)
        if not candidates:
            raise SystemExit(f"No models registered for role: {role}")
        model = candidates[0]
        selection_reason = "default_first_available"
    if not allow_role_mismatch and role not in model.get("roles", []):
        raise SystemExit(f"Model {model.get('id')} is not registered for role: {role}")
    return {
        "role": role,
        "model_id": model["id"],
        "display_name": model.get("display_name", model["id"]),
        "provider": model.get("provider", ""),
        "endpoint_type": model.get("endpoint_type", ""),
        "endpoint_url": endpoint_for_model(model),
        "status": model.get("status", ""),
        "selection_reason": selection_reason,
        "notes": model.get("notes", ""),
    }


def post_json(url: str, api_key: str, payload: dict, timeout: int = 120) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"NVIDIA API error {exc.code} for {url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Network error calling NVIDIA API: {exc}") from exc
