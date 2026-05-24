# ControlStudio Case: Precision Servo Stage Position Control

Date: 2026-05-17

## Case

Develop a position controller for a precision servo stage used in a small inspection axis. The design must move a lightweight load quickly while avoiding excitation of the first flexible mode.

The simplified plant includes:

- A rigid-body position integrator
- A motor / current-loop lag
- A lightly damped flexible resonance
- A sensor / actuator zero

Physical approximation:

```text
G(s) = X(s) / U(s)
     = 50(s + 8) / [s(s + 1.2)(s^2 + 2ζωf s + ωf^2)]

ζ = 0.08
ωf = 18 rad/s
```

Expanded ControlStudio input:

```text
G(s) = (50s + 400) / (s^4 + 4.08s^3 + 327.456s^2 + 388.8s)
```

## Development Target

For the first usable ControlStudio-assisted design:

```text
Closed-loop stable
PM >= 55 deg
GM >= 10 dB
Overshoot <= 8%
Steady-state error <= 0.5%
Rise time improved versus conservative baseline
Avoid gain crossover near 18 rad/s flexible mode
```

## ControlStudio Workflow

1. Open `http://127.0.0.1:8765/`.
2. Set Plant Model to Transfer Function:
   - Numerator: `50, 400`
   - Denominator: `1, 4.08, 327.456, 388.8, 0`
3. Use closed-loop simulation with step input.
4. Create a conservative P-only baseline.
5. Add PID derivative action plus Lead compensation to increase crossover without moving too close to the flexible resonance.
6. Compare Step Response, Bode margin, Root Locus break points, Root Locus jω crossing, and Stability Snapshot.

## Observed Results

| Candidate | Controller | Compensator | PM | GM | Gain Crossover | Rise Time | Settling Time | Overshoot | ESS | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Conservative baseline | `Kp=0.5, Ki=0, Kd=0` | none | 71.42 deg | 30.69 dB | 0.479 rad/s | 3.173 s | 4.744 s | 1.30% | 0.00492% | Stable |
| PID + Lead selected | `Kp=1.2, Ki=0, Kd=0.04, N=100` | `Kc=1, tau=0.2, alpha=0.1` | 69.04 deg | 20.21 dB | 0.984 rad/s | 1.671 s | 4.674 s | 5.69% | 0.00469% | Stable |

## Selected Controller

PID section:

```text
Cpid(s) = (5.2s^2 + 121.2s) / (s^2 + 100s)
```

Lead section:

```text
Clead(s) = (0.2s + 1) / (0.02s + 1)
```

Combined ControlStudio controller:

```text
C(s) = (52s^2 + 1460s + 6000) / (s^2 + 150s + 5000)
```

Open-loop result:

```text
L(s) = (2600s^3 + 93800s^2 + 884000s + 2400000)
     / (s^6 + 154.08s^5 + 5939.456s^4 + 69907.2s^3 + 1695600s^2 + 1944000s)
```

Closed-loop result:

```text
T(s) = (2600s^3 + 93800s^2 + 884000s + 2400000)
     / (s^6 + 154.08s^5 + 5939.456s^4 + 72507.2s^3 + 1789400s^2 + 2828000s + 2400000)
```

Measured result:

```text
PM = 69.04 deg
GM = 20.21 dB
Gain crossover = 0.984 rad/s
Phase crossover = 21.838 rad/s
Rise time = 1.671 s
Settling time = 4.674 s
Overshoot = 5.69%
Steady-state error = 4.69e-5
Dominant pole = -0.8156 - j0.8745
Damping ratio = 0.682
Status = Stable
```

## Mathematical Check

The plant denominator is obtained by expanding:

```text
s(s + 1.2)(s^2 + 2*0.08*18s + 18^2)
= s(s + 1.2)(s^2 + 2.88s + 324)
= s(s^3 + 4.08s^2 + 327.456s + 388.8)
```

ControlStudio normalizes the polynomial after multiplication and reports:

```text
s^4 + 4.08s^3 + 327.456s^2 + 388.8s
```

The Root Locus diagnostic gives:

```text
Breakaway point: s = -0.6235, K = 0.3144
Break-in point: s = -12.6090, K = 278.8311
jω crossing: K = 17.1131, ω = 17.4646 rad/s
```

This is consistent with the engineering constraint: the selected design has gain crossover near `0.984 rad/s`, far below the `17.46 rad/s` marginal crossing and the `18 rad/s` flexible mode. The controller improves response speed while retaining phase margin and not pushing the loop bandwidth into the resonance.

## Engineering Decision

Use `Kp=1.2, Ki=0, Kd=0.04` with the Lead compensator `Kc=1, tau=0.2, alpha=0.1` as the first servo-stage design candidate.

The design improves rise time by roughly 47% compared with the conservative P-only baseline while keeping:

```text
PM > 55 deg
GM > 10 dB
Overshoot < 8%
Gain crossover << flexible-mode frequency
```

## Improvement Notes For ControlStudio

1. Add a saved scenario fixture format so this kind of engineering case can be replayed as a regression test.
2. Add candidate sweep as a first-class UI feature; current comparison is possible, but repeated parameter search still requires scripting.
3. Add `--summary` or `--report` mode to `control_analysis_cli.mjs`; the current CLI emits full plot arrays, which is useful for tooling but noisy for engineering review.
4. Step-response steady-state error should distinguish simulation final sample from analytical DC final value, especially when slow poles require long simulation windows.
5. Lead / PID design should support constraint-based search: target PM, max overshoot, max settling time, and crossover distance from known resonance frequencies.
6. Root Locus jω crossing is useful for design safety. Surface a “gain safety ratio to Ku” in the UI.
7. Add resonance markers to Bode / Singular Value plots so flexible-mode avoidance can be reviewed visually.
8. Add this servo-stage case to future automated validation after a stable scenario fixture schema exists.
