#!/usr/bin/env python3
"""
ControlStudio Unified Analysis API
Consolidates analysis CLI, advisor bridge, and control endpoints into a single FastAPI server.
"""

import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except ModuleNotFoundError as exc:
    if __name__ == "__main__":
        raise SystemExit("Missing dependency: install fastapi, pydantic, and uvicorn before running control_api.py") from exc
    raise


ROOT_DIR = Path("/Users/w.rc/nvdiaOSsupport")
CONTROL_CLI = ROOT_DIR / "control-studio" / "scripts" / "control_analysis_cli.mjs"
NV_AGENT_BIN = ROOT_DIR / "nv-agent"
NODE_BIN = "node"

app = FastAPI(title="ControlStudio Unified API", version="0.2.0")

# CORS middleware — allows frontend on any port to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Models
# ============================================================
class TransferFunctionSystem(BaseModel):
    type: str = "transfer_function"
    num: List[float] = Field(default_factory=lambda: [1.0])
    den: List[float] = Field(default_factory=lambda: [1.0, 3.0, 2.0])


class PIDConfig(BaseModel):
    type: str = "pid"
    Kp: float = 1.0
    Ki: float = 0.5
    Kd: float = 0.1
    N: float = 100.0
    compensator: Dict[str, Any] = Field(default_factory=dict)


class SimulationConfig(BaseModel):
    mode: str = "closed_loop"
    inputWaveform: str = "step"
    duration: Optional[float] = None
    sampleCount: int = 1000
    amplitude: float = 1.0
    frequency: float = 1.0
    pulseWidth: float = 1.0
    disturbanceType: str = "none"
    disturbanceAmplitude: float = 0.0
    disturbanceStart: float = 0.0
    initialState: List[float] = Field(default_factory=list)


class AnalysisRequest(BaseModel):
    system: Dict[str, Any]
    controller: Optional[PIDConfig] = None
    simulation: SimulationConfig = Field(default_factory=SimulationConfig)


class AdvisorRequest(BaseModel):
    request: str = "請分析目前控制系統"
    system: Dict[str, Any]
    controller: Dict[str, Any]
    simulation: Dict[str, Any]
    metrics: Dict[str, Any]


# ============================================================
# Helpers
# ============================================================
def run_analysis(payload: Dict[str, Any]) -> Dict[str, Any]:
    result = subprocess.run(
        [NODE_BIN, str(CONTROL_CLI), json.dumps(payload)],
        capture_output=True,
        text=True,
        cwd=ROOT_DIR,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or result.stdout or "analysis failed")
    return json.loads(result.stdout)


def run_advisor(payload: Dict[str, Any]) -> str:
    """Run the nv-agent control-advisor workflow and return the analysis report."""
    result = subprocess.run(
        [str(NV_AGENT_BIN), "run", "control-advisor", "--data", json.dumps(payload, ensure_ascii=False)],
        capture_output=True,
        text=True,
        cwd=ROOT_DIR,
    )
    report = result.stdout
    if "== Analysis Report ==" in report:
        report = report.split("== Analysis Report ==")[-1].strip()
    return report


# ============================================================
# Endpoints
# ============================================================
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/control/system/response")
def control_response(request: AnalysisRequest) -> Dict[str, Any]:
    result = run_analysis(request.model_dump())
    return {
        "response": result["response"],
        "metrics": result["metrics"],
        "system": result["system"],
    }


@app.post("/api/control/system/stability")
def control_stability(request: AnalysisRequest) -> Dict[str, Any]:
    result = run_analysis(request.model_dump())
    return {
        "metrics": result["metrics"],
        "system": result["system"],
        "bode": result["bode"],
        "nyquist": result["nyquist"],
        "rootLocus": result["rootLocus"],
    }


@app.post("/api/control/advisor")
def control_advisor(request: AdvisorRequest) -> Dict[str, Any]:
    """Unified advisor endpoint — replaces the old standalone advisor_server.py."""
    try:
        report = run_advisor(request.model_dump())
        return {
            "success": True,
            "analysis": report,
            "error": None,
        }
    except Exception as e:
        return {
            "success": False,
            "analysis": "",
            "error": str(e),
        }


# Legacy compatibility: POST to root (old advisor_server.py behavior)
@app.post("/")
def legacy_advisor(request: AdvisorRequest) -> Dict[str, Any]:
    """Legacy endpoint for backward compatibility with the old advisor bridge server."""
    return control_advisor(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8770)
