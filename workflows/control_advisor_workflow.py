#!/usr/bin/env python3

import argparse
import json
import sys

from common import load_dotenv, post_json, require_env, resolve_model_source

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

    request_summary = system_data.get("request", "N/A")

    # Construct the prompt
    prompt = f"""
你是一位資深控制系統工程師專家。請分析以下控制系統的性能指標，並提供專業的分析與改進建議。

### 使用者需求摘要
{request_summary}

### 系統模型 (Transfer Function)
{system_data.get('formula', '未知')}

### 時域響應指標 (Step Response Metrics)
- 上升時間 (Rise Time): {system_data.get('riseTime', 'N/A')} s
- 調整時間 (Settling Time): {system_data.get('settlingTime', 'N/A')} s
- 超調量 (Overshoot): {system_data.get('overshoot', 'N/A')} %
- 穩態誤差 (Steady-state Error): {system_data.get('steadyStateError', 'N/A')}

### 頻域穩定性指標 (Stability Margins)
- 增益裕度 (Gain Margin): {system_data.get('gainMargin', 'N/A')} dB
- 相位裕度 (Phase Margin): {system_data.get('phaseMargin', 'N/A')} deg
- 穩定性判定: {system_data.get('stability', '未知')}

### 當前 PID 參數
- Kp: {system_data.get('Kp', 'N/A')}
- Ki: {system_data.get('Ki', 'N/A')}
- Kd: {system_data.get('Kd', 'N/A')}

### 任務
請提供以下內容：
1. **性能評估**：說明當前系統的性能（如是否過快、震盪是否嚴重、是否接近不穩定）。
2. **PID 調整建議**：針對上述指標，建議應該增加還是減少 Kp, Ki, Kd，並解釋原因。
3. **穩定性分析**：解釋增益/相位裕度對系統安全性的影響。
4. **下一步建議**：推薦使用者嘗試的具體參數範圍。

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
