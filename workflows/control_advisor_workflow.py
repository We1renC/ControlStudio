#!/usr/bin/env python3

import argparse
import json
import sys

from common import load_dotenv, post_json, require_env, resolve_model_source


def normalize_control_payload(system_data):
    if "system" in system_data or "controller" in system_data or "metrics" in system_data:
        return {
            "request": system_data.get("request", "N/A"),
            "system": system_data.get("system", {}),
            "controller": system_data.get("controller", {}),
            "simulation": system_data.get("simulation", {}),
            "metrics": system_data.get("metrics", {}),
        }

    return {
        "request": system_data.get("request", "N/A"),
        "system": {
            "type": "transfer_function",
            "formula": system_data.get("formula", "未知"),
        },
        "controller": {
            "type": "pid",
            "Kp": system_data.get("Kp", "N/A"),
            "Ki": system_data.get("Ki", "N/A"),
            "Kd": system_data.get("Kd", "N/A"),
        },
        "simulation": system_data.get("simulation", {}),
        "metrics": {
            "riseTime": system_data.get("riseTime", "N/A"),
            "settlingTime": system_data.get("settlingTime", "N/A"),
            "overshoot": system_data.get("overshoot", "N/A"),
            "steadyStateError": system_data.get("steadyStateError", "N/A"),
            "gainMargin": system_data.get("gainMargin", "N/A"),
            "phaseMargin": system_data.get("phaseMargin", "N/A"),
            "stability": system_data.get("stability", "未知"),
        },
    }

def run_control_advisor():
    parser = argparse.ArgumentParser(description="Control System Smart Advisor using NVIDIA NIM.")
    parser.add_argument("--data", required=True, help="JSON string of system performance data.")
    parser.add_argument("--model", help="NVIDIA model ID to use for analysis.")
    args = parser.parse_args()

    load_dotenv()
    api_key = require_env("NVIDIA_API_KEY")

    # Resolve model
    source = resolve_model_source("control_expert", args.model)
    model_id = source["model_id"]
    endpoint = source["endpoint_url"]

    try:
        system_data = json.loads(args.data)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON data provided in --data"}))
        return 1

    normalized = normalize_control_payload(system_data)
    request_summary = normalized["request"]
    system_summary = normalized["system"]
    controller_summary = normalized["controller"]
    simulation_summary = normalized["simulation"]
    metrics_summary = normalized["metrics"]
    structured_block = json.dumps(normalized, ensure_ascii=False, indent=2)

    # Construct the prompt
    prompt = f"""
你是一位資深控制系統工程師專家。請分析以下控制系統的性能指標，並提供專業的分析與改進建議。

### 使用者需求摘要
{request_summary}

### 結構化輸入資料
```json
{structured_block}
```

### 系統模型
- 模型類型: {system_summary.get('type', 'transfer_function')}
- Transfer Function: {system_summary.get('formula', '未知')}

### 當前 PID 參數
- Kp: {controller_summary.get('Kp', 'N/A')}
- Ki: {controller_summary.get('Ki', 'N/A')}
- Kd: {controller_summary.get('Kd', 'N/A')}
- Controller TF: {controller_summary.get('formula', 'N/A')}

### 模擬設定
- Input Waveform: {simulation_summary.get('inputWaveform', 'N/A')}
- Disturbance Waveform: {simulation_summary.get('disturbanceWaveform', 'none')}
- Duration: {simulation_summary.get('duration', 'auto')}
- Sample Count: {simulation_summary.get('sampleCount', 'N/A')}
- Input Amplitude: {simulation_summary.get('amplitude', 'N/A')}
- Disturbance Amplitude: {simulation_summary.get('disturbanceAmplitude', '0')}
- Disturbance Start: {simulation_summary.get('disturbanceStart', '0')}
- Initial State: {simulation_summary.get('initialState', [])}

### 時域響應指標
- 上升時間 (Rise Time): {metrics_summary.get('riseTime', 'N/A')}
- 調整時間 (Settling Time): {metrics_summary.get('settlingTime', 'N/A')}
- 超調量 (Overshoot): {metrics_summary.get('overshoot', 'N/A')}
- 穩態誤差 (Steady-state Error): {metrics_summary.get('steadyStateError', 'N/A')}

### 頻域穩定性指標
- 增益裕度 (Gain Margin): {metrics_summary.get('gainMargin', 'N/A')}
- 相位裕度 (Phase Margin): {metrics_summary.get('phaseMargin', 'N/A')}
- 穩定性判定: {metrics_summary.get('stability', '未知')}

### 任務
請提供以下內容：
1. **性能評估**：說明當前系統的性能（如是否過快、震盪是否嚴重、是否接近不穩定）。
2. **PID 調整建議**：針對上述指標，建議應該增加還是減少 Kp, Ki, Kd，並解釋原因。
3. **穩定性分析**：解釋增益/相位裕度對系統安全性的影響。
4. **下一步建議**：推薦使用者嘗試的具體參數範圍。
5. **Simulation 注意事項**：若輸入波形、干擾或初始條件會影響判讀，請明確指出。

請使用繁體中文回覆，並以 Markdown 格式輸出。
"""

    payload = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": "你是一位專業的控制系統專家助手。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1024
    }

    response = post_json(endpoint, api_key, payload)

    analysis_text = response["choices"][0]["message"]["content"]

    print("== Analysis Report ==")
    print(analysis_text)
    return 0

if __name__ == "__main__":
    sys.exit(run_control_advisor())
