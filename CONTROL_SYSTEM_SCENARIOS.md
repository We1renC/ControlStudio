# Control System Scenario Studies

此文件記錄用 ControlStudio 進行實際控制情境設計的案例。後續 agent 可用這些案例檢查產品流程、數學核心與 UI/CLI 改善方向。

## Scenario 1: Precision Servo Stage Position Control

Date: 2026-05-17

### Control Situation

設計一個精密定位平台的位置控制器。設備用於小型檢測軸，需求是在不激發第一個柔性模態的前提下縮短定位時間。

模型包含：

- 剛體位置積分
- 馬達 / 電流迴路一階落後
- 低阻尼柔性模態
- 感測器 / 致動器零點

```text
G(s) = X(s) / U(s)
     = 50(s + 8) / [s(s + 1.2)(s^2 + 2ζωf s + ωf^2)]

ζ = 0.08
ωf = 18 rad/s
```

ControlStudio 使用的展開式：

```text
G(s) = (50s + 400) / (s^4 + 4.08s^3 + 327.456s^2 + 388.8s)
```

### Design Target

```text
Closed-loop stable
PM >= 55 deg
GM >= 10 dB
Overshoot <= 8%
Steady-state error <= 0.5%
Rise time improved versus conservative baseline
Avoid gain crossover near 18 rad/s flexible mode
```

### ControlStudio Workflow

1. Transfer Function input:
   - Numerator: `50, 400`
   - Denominator: `1, 4.08, 327.456, 388.8, 0`
2. Closed-loop step simulation.
3. Compare conservative P-only baseline with PID + Lead candidate.
4. Inspect Step Response, Bode margins, Root Locus break points, jω crossing, and Stability Snapshot.
5. Reproduce the case with:

```bash
node control-studio/scripts/run_servo_stage_case.mjs
```

The script writes a generated JSON artifact to:

```text
outputs/controlstudio/precision-servo-stage-case.json
```

### Observed Results

| Candidate | Controller | Compensator | PM | GM | Gain Crossover | Rise Time | Settling Time | Overshoot | ESS | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Conservative baseline | `Kp=0.5, Ki=0, Kd=0` | none | 71.42 deg | 30.69 dB | 0.479 rad/s | 3.173 s | 4.744 s | 1.30% | 0.00492% | Stable |
| PID + Lead selected | `Kp=1.2, Ki=0, Kd=0.04, N=100` | `Kc=1, tau=0.2, alpha=0.1` | 69.04 deg | 20.21 dB | 0.984 rad/s | 1.671 s | 4.674 s | 5.69% | 0.00469% | Stable |

### Selected Design

```text
Cpid(s) = (5.2s^2 + 121.2s) / (s^2 + 100s)
Clead(s) = (0.2s + 1) / (0.02s + 1)
C(s) = (52s^2 + 1460s + 6000) / (s^2 + 150s + 5000)
```

Closed-loop result:

```text
T(s) = (2600s^3 + 93800s^2 + 884000s + 2400000)
     / (s^6 + 154.08s^5 + 5939.456s^4 + 72507.2s^3 + 1789400s^2 + 2828000s + 2400000)
```

### Mathematical Check

Plant denominator expansion:

```text
s(s + 1.2)(s^2 + 2*0.08*18s + 18^2)
= s(s + 1.2)(s^2 + 2.88s + 324)
= s(s^3 + 4.08s^2 + 327.456s + 388.8)
= s^4 + 4.08s^3 + 327.456s^2 + 388.8s
```

Root Locus diagnostics:

```text
Breakaway point: s = -0.6235, K = 0.3144
Break-in point: s = -12.6090, K = 278.8311
jω crossing: K = 17.1131, ω = 17.4646 rad/s
```

The selected gain crossover is `0.984 rad/s`, well below the `17.46 rad/s` marginal crossing and the `18 rad/s` flexible mode. This supports the engineering decision that the controller improves speed without driving loop bandwidth into the first resonance.

### Engineering Decision

Use `Kp=1.2, Ki=0, Kd=0.04` with Lead compensator `Kc=1, tau=0.2, alpha=0.1` as the first servo-stage design candidate.

The design improves rise time by roughly 47% compared with the conservative P-only baseline while keeping phase margin, gain margin, overshoot, and resonance-avoidance constraints inside target.

### Improvement Notes

1. Add a saved scenario fixture schema so engineering cases can be replayed as regression tests.
2. Add candidate sweep as a first-class UI feature; repeated parameter search should not require ad-hoc scripting.
3. Add `--summary` or `--report` mode to `control_analysis_cli.mjs`; full plot arrays are useful for tooling but too noisy for engineering review.
4. Step-response steady-state error should distinguish simulation final sample from analytical DC final value.
5. Lead / PID design should support constraint-based search: target PM, max overshoot, max settling time, and minimum crossover distance from known resonance frequencies.
6. Surface Root Locus “gain safety ratio to Ku” in the UI.
7. Add resonance markers to Bode / Singular Value plots.
8. Promote this servo-stage case into automated validation after the scenario fixture schema exists.
