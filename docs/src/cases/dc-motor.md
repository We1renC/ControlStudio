# ControlStudio Case: DC Motor Speed Control

Date: 2026-05-16

## Case

Develop a voltage-to-speed controller for a small DC motor.

Physical model:

```text
J dω/dt + bω = Ki
L di/dt + Ri + Kω = V
```

Using:

```text
J = 0.01 kg m^2
b = 0.1 N m s
K = 0.01
R = 1 ohm
L = 0.5 H
```

The plant is:

```text
G(s) = ω(s) / V(s)
     = K / ((Js + b)(Ls + R) + K^2)
     = 0.01 / (0.005s^2 + 0.06s + 0.1001)
     = 2 / (s^2 + 12s + 20.02)
```

## Development Target

For the first usable controller:

```text
Stable closed loop
PM >= 60 deg
Overshoot <= 5%
Steady-state error <= 3%
Settling time <= 7 s
```

## ControlStudio Workflow

1. Open `http://127.0.0.1:8765/`.
2. Set Plant Model to Transfer Function:
   - Numerator: `2`
   - Denominator: `1, 12, 20.02`
3. Set simulation duration to `10 s`.
4. Compare candidate controllers using Step Response, Bode metrics, and Stability Snapshot.
5. Use Design Assistant with `%OS = 8`, `Ts = 1.5 s` to check whether pure gain pole placement is feasible.

## Observed Results

| Candidate | Kp | Ki | Kd | PM | Overshoot | Rise Time | Settling Time | ESS | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| P baseline | 1 | 0 | 0 | n/a | 0% | 1.016 s | 1.846 s | 0.909 | Stable |
| PD fast | 50 | 0 | 3 | 88.5 deg | 1.5% | 0.170 s | 0.250 s | 0.167 | Stable |
| PID balanced | 50 | 4 | 3 | 88.1 deg | 0% | 0.240 s | 7.044 s | 0.0833 | Stable |
| PID selected | 50 | 10 | 3 | 87.6 deg | 0% | 1.311 s | 6.963 s | 0.0286 | Stable |

## Design Assistant Finding

For target `%OS = 8`, `Ts = 1.5 s`, ControlStudio computed:

```text
ζ = 0.6266
σ = 2.6667
ωn = 4.2559 rad/s
ωd = 3.3169 rad/s
Target poles: s = -2.6667 ± j3.3169
```

The tool reported that the target pole is not on the uncompensated Root Locus:

```text
∠G(s*) = -125.7 deg
phase error = 54.3 deg
```

Therefore, pure proportional gain cannot place the dominant poles at the target location. This supports either:

1. Adding Lead compensation to move the Root Locus.
2. Relaxing the aggressive `Ts = 1.5 s` target.
3. Selecting the practical PID candidate for the first motor-speed controller release.

## Selected Controller

```text
Kp = 50
Ki = 10
Kd = 3
```

ControlStudio displayed:

```text
C(s) = (350s^2 + 5010s + 1000) / (s^2 + 100s)
```

Measured result:

```text
PM = 87.6 deg
GM = infinity
Rise time = 1.311 s
Settling time = 6.963 s
Overshoot = 0%
Steady-state error = 0.0286
Status = Stable
```

## Engineering Decision

Use `Kp=50, Ki=10, Kd=3` as the first ControlStudio-assisted controller candidate.

This meets the first-pass stability, overshoot, phase-margin, and settling-time targets. Steady-state error is just under the `3%` target and should be rechecked on hardware or with actuator saturation included.

## Follow-up Development Items

1. Add report export directly in ControlStudio so this case can be generated without manual Markdown.
2. Add actuator saturation and voltage limit fields; current linear model does not capture saturation.
3. Add a dedicated motor-speed fixture to regression tests.
4. Extend PID input range or expose numeric PID fields for higher integral gain experiments.
