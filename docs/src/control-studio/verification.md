# Control System Verification Cases

此文件定義 ControlStudio 後續回歸測試的十一個基準案例。每個案例都必須能以數學推導得到期望結果，再用 `control-studio` 數值核心、`control_analysis_cli.mjs` 與 FastAPI API 交叉驗證。

驗證原則：
- 先比對 transfer function 多項式係數，再比對 poles / zeros / DC gain。
- DC gain 驗證必須使用低頻極限，先消去 removable origin pole-zero factors；不可只用常數項相除。
- Discrete DC gain 驗證必須在 `q=z^-1=1` 使用低頻極限，先消去 removable unit-circle factors；不可只用係數和相除。
- Discrete `z^-1` transfer functions must include implicit `z=0` delay poles when numerator delay order exceeds denominator order；natural pure-delay input `num=[0,1], den=[1]` must not appear pole-free in z-plane analysis.
- Discrete `z^-1` coefficient arrays must trim trailing structural zeros without removing leading numerator delay zeros；`num=[1,0,0], den=[1,0]` is the same static gain as `num=[1], den=[1]`, while denominator leading-zero forms such as `den=[0,1]` must be rejected as invalid non-causal/advance representations.
- Discrete interconnections must add `z^-1` delay polynomials by coefficient index, not by high-degree polynomial alignment；mixed-order `parallel()` and `feedback()` must preserve dynamic poles, and feedback paths must reject sample-time mismatches.
- Discrete sample time is part of the mathematical model, not display-only metadata；code generation, analysis export, autosave, project files, and local project-manager save/load must preserve `DiscreteTransferFunction.sampleTime` exactly for non-default values such as `Ts=0.25`.
- z-domain analysis export payloads must report the effective discrete response type；if a requested waveform is unsupported, export must normalize it explicitly and preserve the original request separately as traceability metadata. JSON export must also preserve non-finite margin semantics with explicit status fields, because `Infinity` / `NaN` would otherwise collapse to `null`.
- Generated MATLAB / Python scripts are verification artifacts；they must not reference undefined closed-loop variables, must use language-native syntax, and must not mix continuous PID controllers with z-domain plants unless an explicit discrete controller model is present.
- Matched-Z C2D gain normalization 必須先保留 continuous leading gain，再使用 discrete low-frequency limit；遇到 removable origin pole-zero 映射為 `z=1` pair 時，不可因 raw coefficient sums 為 0 而退回 unity gain。
- C2D 方法必須一致拒絕 improper continuous plant；不可把 derivative-like 或不可實現的原始模型離散成看似 stable 的 DTF。
- Impulse-invariant C2D 目前為 simple-pole baseline；repeated poles 必須明確回報 unsupported，不可靜默跳過 residue 或輸出 zero/mis-scaled DTF。
- Impulse-invariant C2D 目前為 strictly-proper simple-pole baseline；biproper direct-feedthrough terms 代表 `t=0` impulse，不可被 residue-only DTF path 靜默丟棄，必須明確回報 unsupported 或改用 ZOH / Tustin。
- Phase margin 驗證必須使用 continuous unwrapped Bode phase branch；negative low-frequency loop 不可用 principal `+180 deg` phase 誤報成高正 PM。
- Continuous Bode / Nyquist / Nichols / root-locus、gain/phase margin 與 robust `S/T/KS` analysis 只能用 s-domain transfer function；finite `sampleTime` 的 discrete TF 必須被明確拒絕，不可把 z-domain polynomial 當作 `den(s)+Knum(s)`、`G(jω)` 或 continuous robustness metric 直接掃描。
- 時域響應使用理論 final value、overshoot、settling/rise trend 作為主判準。
- 頻域響應使用 DC/low-frequency gain、phase margin 或已知風險作為主判準。
- 不以圖形外觀作為唯一依據；圖形只作為人眼審查輔助。
- 容許誤差需明確寫入測試，避免浮點與取樣差異造成假失敗。

建議 tolerance：
- 多項式係數：`1e-6`
- poles / zeros：`1e-5`
- final value：`1e-3` 到 `1e-2`
- phase margin：`1e-3 deg`
- overshoot：`0.5%`

## Case 1: Stable First-Order Lag

### Purpose

驗證最基礎的 SISO transfer function、穩定性、step response final value、DC gain 與低頻 Bode magnitude。

### Model

```text
G(s) = 1 / (s + 1)
```

### Mathematical Derivation

Pole:

```text
s + 1 = 0
s = -1
```

因此系統穩定。

DC gain:

```text
G(0) = 1
```

Unit step input:

```text
Y(s) = G(s) * 1/s
     = 1 / (s(s + 1))
```

Partial fraction:

```text
1 / (s(s + 1)) = 1/s - 1/(s + 1)
```

Time response:

```text
y(t) = 1 - e^(-t)
```

Final value:

```text
lim t->inf y(t) = 1
```

Low-frequency Bode magnitude:

```text
20 log10(|G(0)|) = 0 dB
```

### Expected Assertions

- `poles = [-1]`
- `isStable = true`
- `dcGain = 1`
- `step final value ~= 1`
- `low frequency magnitude ~= 0 dB`
- `phase at low frequency < 0 deg`

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1], "den": [1, 1] },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 8, "sampleCount": 800, "amplitude": 1 }
}
```

## Case 2: Underdamped Second-Order System

### Purpose

驗證二階欠阻尼系統的複數極點、step response overshoot、settling trend 與 final value。

### Model

使用標準二階形式：

```text
G(s) = wn^2 / (s^2 + 2*zeta*wn*s + wn^2)
```

令：

```text
wn = 2
zeta = 0.5
```

則：

```text
G(s) = 4 / (s^2 + 2s + 4)
```

### Mathematical Derivation

Poles:

```text
s = -zeta*wn +- j*wn*sqrt(1 - zeta^2)
  = -1 +- j*sqrt(3)
```

DC gain:

```text
G(0) = 4 / 4 = 1
```

Percent overshoot:

```text
Mp = exp(-zeta*pi / sqrt(1 - zeta^2)) * 100%
   = exp(-0.5*pi / sqrt(0.75)) * 100%
   ~= 16.303%
```

Peak time:

```text
wd = wn*sqrt(1 - zeta^2) = sqrt(3)
Tp = pi / wd ~= 1.814 s
```

Approximate 2% settling time:

```text
Ts ~= 4 / (zeta*wn) = 4 s
```

### Expected Assertions

- `poles ~= -1 +- j*1.73205`
- `isStable = true`
- `dcGain = 1`
- `step final value ~= 1`
- `overshoot ~= 16.3%`
- `settlingTime` should be finite and roughly near `4 s`

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [4], "den": [1, 2, 4] },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 10, "sampleCount": 1200, "amplitude": 1 }
}
```

## Case 3: Initially Unstable Plant With Pole-Zero Cancellation And Low PM

### Purpose

驗證較接近工程風險的情境：plant 初始不穩定、存在 pole-zero cancellation、閉迴路可被控制器穩定化，但 phase margin 不足。

### Model

```text
G(s) = (s + 1) / ((s - 2)(s + 1)(s + 4))
```

Expanded:

```text
G(s) = (s + 1) / (s^3 + 3s^2 - 6s - 8)
```

Controller:

```text
C(s) = 10
```

### Mathematical Derivation

Plant poles:

```text
(s - 2)(s + 1)(s + 4) = 0
s = 2, -1, -4
```

Plant zero:

```text
s + 1 = 0
s = -1
```

因此：
- plant 有 RHP pole `+2`，初始不穩定。
- zero `-1` 與 pole `-1` 存在 pole-zero cancellation。

Open-loop:

```text
L(s) = C(s)G(s)
     = 10(s + 1) / (s^3 + 3s^2 - 6s - 8)
```

Closed-loop:

```text
T(s) = L(s) / (1 + L(s))
     = 10(s + 1) / (s^3 + 3s^2 - 6s - 8 + 10s + 10)
     = 10(s + 1) / (s^3 + 3s^2 + 4s + 2)
```

若使用目前 `PIDController` 的 P-only 實作，系統內部會帶有等價的 derivative filter cancellation：

```text
C_internal(s) = 10(s + 100)/(s + 100)
```

因此未約分形式應為：

```text
T_internal(s)
= 10(s + 1)(s + 100) / ((s^3 + 3s^2 + 4s + 2)(s + 100))
= (10s^2 + 1010s + 1000) / (s^4 + 103s^3 + 304s^2 + 402s + 200)
```

DC final value for unit step:

```text
T(0) = 10 / 2 = 5
```

目前數值核心對此案例的 phase margin 基準值（允許 0.1 deg 數值公差）：

```text
PM ~= 15.0 deg
```

### Expected Assertions

- plant poles include `+2`, `-1`, `-4`
- plant zero includes `-1`
- plant `isStable = false`
- pole-zero cancellation near `-1` is detected
- closed-loop numerator equals `[10, 1010, 1000]`
- closed-loop denominator equals `[1, 103, 304, 402, 200]`
- reduced closed-loop equals `10(s+1)/(s^3+3s^2+4s+2)`
- closed-loop `isStable = true`
- `phaseMargin ~= 15.0006302775 deg`
- `step final value ~= 5`

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1, 1], "den": [1, 3, -6, -8] },
  "controller": { "type": "pid", "Kp": 10, "Ki": 0, "Kd": 0, "N": 100 },
  "simulation": { "mode": "closed_loop", "inputWaveform": "step", "duration": 12, "sampleCount": 1200, "amplitude": 1 }
}
```

## Case 4: Non-Minimum Phase Zero With Stable Poles

### Purpose

驗證 RHP zero 的處理。此案例 plant poles 穩定，但存在 non-minimum phase zero；閉迴路可能穩定，但 zero 仍會造成不良動態與相位風險。

### Model

```text
G(s) = (1 - s) / ((s + 1)(s + 2))
```

Expanded high-degree-first form:

```text
G(s) = (-s + 1) / (s^2 + 3s + 2)
```

Controller:

```text
C(s) = 1
```

### Mathematical Derivation

Plant poles:

```text
s = -1, -2
```

Plant zero:

```text
1 - s = 0
s = +1
```

因此 plant 本身穩定，但有 RHP zero，屬 non-minimum phase system。

Open-loop:

```text
L(s) = G(s)
```

Closed-loop:

```text
T(s) = G(s) / (1 + G(s))
     = (1 - s) / (s^2 + 3s + 2 + 1 - s)
     = (1 - s) / (s^2 + 2s + 3)
```

Closed-loop poles:

```text
s^2 + 2s + 3 = 0
s = -1 +- j*sqrt(2)
```

Closed-loop DC final value:

```text
T(0) = 1 / 3
```

Initial value for a strictly proper transfer function step response is:

```text
y(0+) = lim s->inf T(s) = 0
```

Initial slope can reveal inverse response:

```text
Y(s) = T(s)/s = (1 - s)/(s(s^2 + 2s + 3))
lim t->0+ y'(t) = lim s->inf s^2Y(s) = lim s->inf s(1 - s)/(s^2 + 2s + 3) = -1
```

因此 step response 初始斜率為負，應先往錯方向移動。

### Expected Assertions

- plant poles include `-1`, `-2`
- plant zero includes `+1`
- plant `isStable = true`
- closed-loop denominator equals `[1, 2, 3]`
- closed-loop poles ~= `-1 +- j*sqrt(2)`
- closed-loop final value ~= `1/3`
- early step response should show inverse response trend, e.g. first few nonzero samples below `0`

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [-1, 1], "den": [1, 3, 2] },
  "controller": { "type": "pid", "Kp": 1, "Ki": 0, "Kd": 0, "N": 100 },
  "simulation": { "mode": "closed_loop", "inputWaveform": "step", "duration": 8, "sampleCount": 1000, "amplitude": 1 }
}
```

## Case 5: State-Space To Transfer Function Equivalence

### Purpose

驗證 State-Space 輸入與 transfer function 轉換是否正確，並確保同一系統用 SS 與 TF 兩種入口時，分析結果一致。

### Model

State-space:

```text
x_dot = Ax + Bu
y = Cx + Du
```

```text
A = [[0, 1],
     [-2, -3]]

B = [[0],
     [1]]

C = [[1, 0]]

D = [[0]]
```

### Mathematical Derivation

Transfer function:

```text
G(s) = C(sI - A)^(-1)B + D
```

Compute:

```text
sI - A = [[s, -1],
          [2, s + 3]]
```

Determinant:

```text
det(sI - A) = s(s + 3) + 2 = s^2 + 3s + 2
```

Inverse:

```text
(sI - A)^(-1)
= 1/(s^2 + 3s + 2) * [[s + 3, 1],
                       [-2, s]]
```

Multiply by `B`:

```text
(sI - A)^(-1)B
= 1/(s^2 + 3s + 2) * [[1],
                       [s]]
```

Multiply by `C`:

```text
C(sI - A)^(-1)B
= [1, 0] * [[1],
            [s]] / (s^2 + 3s + 2)
= 1 / (s^2 + 3s + 2)
```

Therefore:

```text
G(s) = 1 / (s^2 + 3s + 2)
```

Poles:

```text
s = -1, -2
```

DC gain:

```text
G(0) = 1 / 2
```

Controllability matrix:

```text
Qc = [B, AB]
   = [[0, 1],
      [1, -3]]
```

```text
det(Qc) = -1
rank(Qc) = 2
```

Observability matrix:

```text
Qo = [C
      CA]
   = [[1, 0],
      [0, 1]]
```

```text
rank(Qo) = 2
```

### Expected Assertions

- SS-to-TF numerator equals `[1]`
- SS-to-TF denominator equals `[1, 3, 2]`
- poles equal `-1`, `-2`
- DC gain equals `0.5`
- controllability rank equals `2`
- observability rank equals `2`
- Step response from SS-derived TF matches direct TF case within tolerance

### Suggested Payload

```json
{
  "system": {
    "type": "state_space",
    "A": [[0, 1], [-2, -3]],
    "B": [[0], [1]],
    "C": [[1, 0]],
    "D": [[0]]
  },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 10, "sampleCount": 1000, "amplitude": 1 }
}
```

## Case 6: Open-Loop Controller Cascade Response

### Purpose

驗證 `simulation.mode = "open_loop"` 且存在 controller 時，Unified API / CLI 的 time response 會模擬 `C(s)G(s)`，而不是 plant-only `G(s)`。

### Model

```text
G(s) = 1 / (s + 1)
C(s) = 2
L(s) = C(s)G(s) = 2 / (s + 1)
```

目前 PID P-only 內部仍保留 derivative filter cancellation：

```text
C_internal(s) = 2(s + 100)/(s + 100)
```

因此 closed-loop formula 的未約分內部表示為：

```text
T_internal(s) = (2s + 200) / (s^2 + 103s + 300)
```

### Mathematical Derivation

Open-loop step response 使用 `L(s)`：

```text
Y(s) = 2 / (s(s + 1))
y(t) = 2(1 - e^(-t))
lim t->inf y(t) = 2
```

若 API 錯誤回傳 plant-only response，final value 會接近 `1`，因此 final-value assertion 可直接抓出錯誤路徑。

### Expected Assertions

- plant poles equal `[-1]`
- plant `isStable = true`
- open-loop response final value `~= 2`
- CLI response final value matches fixture final value
- CLI plant formula equals `(1) / (s +1)`
- CLI closed-loop formula equals `(2s +200) / (s^2 +103s +300)`

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1], "den": [1, 1] },
  "controller": { "type": "pid", "Kp": 2, "Ki": 0, "Kd": 0, "N": 100 },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 8, "sampleCount": 800, "amplitude": 1 }
}
```

## Case 7: Non-Step Waveform Metrics Contract

### Purpose

驗證 impulse / ramp / sine / square / pulse 等非 step response 不會被誤報為有效 step metrics。這些 waveform 可有 time response，但 rise time、settling time、overshoot、steady-state error 的 step 定義不適用。

### Model

```text
G(s) = 1 / (s + 1)
```

### Mathematical Derivation

Impulse response：

```text
Y(s) = G(s) = 1 / (s + 1)
y(t) = e^(-t)
lim t->inf y(t) = 0
```

但這不是 step response，因此 `stepInfo()` 不應輸出有效的 step performance metrics。API / CLI 應回傳：

```text
metrics.valid = false
metrics.reason includes "step metrics require step input"
```

### Expected Assertions

- response final value `~= 0`
- `metrics.valid = false`
- `metrics.reason` clearly states that step metrics require step input
- API metrics matches CLI metrics

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1], "den": [1, 1] },
  "simulation": { "mode": "open_loop", "inputWaveform": "impulse", "duration": 8, "sampleCount": 800, "amplitude": 1 }
}
```

## Case 8: Step Amplitude Reference Metrics

### Purpose

驗證非單位 step input 的 performance metrics 以輸入振幅作為 reference，而不是固定對 `1` 計算 steady-state error。

### Model

```text
G(s) = 1 / (s + 1)
r(t) = 2 * 1(t)
```

### Mathematical Derivation

```text
Y(s) = G(s) * 2/s
     = 2 / (s(s + 1))
```

Partial fraction:

```text
2 / (s(s + 1)) = 2/s - 2/(s + 1)
```

Time response:

```text
y(t) = 2(1 - e^(-t))
lim t->inf y(t) = 2
```

Step steady-state error must be measured against the requested reference amplitude:

```text
e_ss = |r_inf - y_inf| = |2 - 2| = 0
```

With finite `duration = 8`, the numerical final value is approximately:

```text
y(8) = 2(1 - e^-8) ~= 1.99933
e_ss ~= 0.00067
```

If `stepInfo()` uses a hard-coded reference of `1`, the reported error becomes approximately `0.99933`, which is mathematically wrong for an amplitude-2 step.

### Expected Assertions

- plant poles equal `[-1]`
- plant `isStable = true`
- response final value `~= 2`
- `metrics.valid = true`
- `metrics.steadyStateError ~= 0` within finite-simulation tolerance
- API metrics matches CLI metrics

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1], "den": [1, 1] },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 8, "sampleCount": 800, "amplitude": 2 }
}
```

## Case 9: Zero-DC-Gain Step Metrics Contract

### Purpose

驗證 step response 若最終輸出回到初始值，但中間存在明顯 transient，ControlStudio 不會把 normalized rise time、settling time、overshoot 誤報為有效 step metrics。

這類系統常見於零 DC gain、高通、band-pass 或含 zero-at-origin 的 plant。它們對 step input 可能有暫態輸出，但 steady-state output 為零；此時以 `final - initial` 正規化的 rise / overshoot 沒有工程意義。

### Model

```text
G(s) = s / (s^2 + 2s + 2)
```

### Mathematical Derivation

DC gain:

```text
G(0) = 0
```

Unit step input:

```text
Y(s) = G(s) * 1/s
     = 1 / (s^2 + 2s + 2)
```

Complete the square:

```text
s^2 + 2s + 2 = (s + 1)^2 + 1
```

Time response:

```text
y(t) = e^(-t) sin(t)
```

Final value:

```text
lim t->inf y(t) = 0
```

Peak transient is nonzero:

```text
y'(t) = e^(-t)(cos(t) - sin(t))
y'(t) = 0  =>  t = pi/4
y(pi/4) = e^(-pi/4) / sqrt(2) ~= 0.3224
```

Because:

```text
y(0) = 0
y(inf) = 0
```

the net final response change is zero. Therefore normalized rise time, settling time, and percent overshoot based on final response amplitude are undefined. The only meaningful scalar metric in the standard step-performance group is steady-state error relative to the reference:

```text
e_ss = |1 - 0| = 1
```

### Expected Assertions

- plant poles equal `-1 +- j`
- plant zero equals `0`
- plant `isStable = true`
- plant `dcGain = 0`
- response final value `~= 0`
- transient peak is nonzero by mathematical derivation
- `metrics.valid = false`
- `metrics.reason` clearly states that a nonzero final response change is required
- `metrics.steadyStateError ~= 1`
- API metrics matches CLI metrics

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1, 0], "den": [1, 2, 2] },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 12, "sampleCount": 1200, "amplitude": 1 }
}
```

## Case 10: Divergent Unstable Step Metrics Contract

### Purpose

驗證 unstable 或 simulation window 內仍未收斂的 step response 不會被誤報為有效 step metrics。這類系統沒有有限 final value，若只用最後一個 sample 當作 final value，會產生看似合理但數學上無效的 rise time、settling time 或 overshoot。

### Model

```text
G(s) = 1 / (s - 1)
```

### Mathematical Derivation

Pole:

```text
s - 1 = 0
s = +1
```

因此 plant 為 open-loop unstable。

Unit step input:

```text
Y(s) = G(s) * 1/s
     = 1 / (s(s - 1))
```

Partial fraction:

```text
1 / (s(s - 1)) = -1/s + 1/(s - 1)
```

Time response:

```text
y(t) = e^t - 1
```

Final value does not exist:

```text
lim t->inf y(t) = +inf
```

因此 standard step metrics 中依賴有限 final value 的 rise time、settling time 與 percent overshoot 都不具工程意義。若數值模擬只跑到 `t=8`，最後 sample 約為：

```text
y(8) = e^8 - 1 ~= 2979.96
```

這不是系統 final value，只是 simulation window 的最後觀測值。ControlStudio 必須要求 explicit final value 或 settled response tail；否則應回傳 invalid metrics。

### Expected Assertions

- plant pole equals `+1`
- plant `isStable = false`
- plant `dcGain = -1`
- step response is monotonically divergent over the simulated window
- `metrics.valid = false`
- `metrics.reason` clearly states that step metrics require a settled response tail or explicit final value
- rise time, settling time, and overshoot are `null`
- API metrics matches CLI metrics

### Suggested Payload

```json
{
  "system": { "type": "transfer_function", "num": [1], "den": [1, -1] },
  "simulation": { "mode": "open_loop", "inputWaveform": "step", "duration": 8, "sampleCount": 800, "amplitude": 1 }
}
```

## Case 11: Discrete Impulse Export Response-Type Contract

### Purpose

驗證 z-domain analysis export 不會把 discrete step response samples 誤標成 impulse / ramp / sine / square / pulse。此案例鎖定 export artifact 的語意：`responseType` 必須表示實際輸出的離散響應，`requestedResponseType` 才表示使用者原始選擇。

### Model

```text
G(z) = 0.5 / (1 - 0.5z^-1)
Ts = 0.2 s
```

使用振幅：

```text
A = 2
```

### Mathematical Derivation

差分方程：

```text
y[k] - 0.5y[k-1] = 0.5u[k]
```

Impulse input in ControlStudio discrete response engine uses:

```text
u[0] = A = 2
u[k>0] = 0
```

Assume zero initial condition:

```text
y[0] = 0.5 * 2 = 1
y[1] = 0.5y[0] = 0.5
y[2] = 0.5y[1] = 0.25
y[3] = 0.5y[2] = 0.125
```

因此 impulse export 的前四個 samples 必須是：

```text
[1, 0.5, 0.25, 0.125]
```

對照 step input：

```text
u[k] = 2 for all k
y[0] = 1
y[1] = 0.5y[0] + 1 = 1.5
y[2] = 0.5y[1] + 1 = 1.75
```

若 impulse export 出現 `[1, 1.5, 1.75, ...]`，代表實際匯出的是 step response，屬於錯誤。

### Expected Assertions

- `sampleTime = 0.2`
- `responseType = "impulse"`
- `requestedResponseType = "impulse"`
- `t[0..3] = [0, 0.2, 0.4, 0.6]`
- `y[0..3] = [1, 0.5, 0.25, 0.125]`
- response must not equal step sequence `[1, 1.5, 1.75, ...]`
- `metrics.gainMarginDB = null`, `metrics.gainMarginDBStatus = "positive_infinity"`
- `metrics.phaseMargin = null`, `metrics.phaseMarginStatus = "undefined"`
- `metrics.stepMetricsValid = false`
- `metrics.stepMetricsReason = "step metrics require step input; got impulse"`
- step response metrics must remain null for impulse export

### Suggested Payload

```json
{
  "system": {
    "type": "discrete_transfer_function",
    "num": [0.5],
    "den": [1, -0.5],
    "sampleTime": 0.2
  },
  "simulation": {
    "mode": "open_loop",
    "inputWaveform": "impulse",
    "sampleCount": 5,
    "amplitude": 2
  }
}
```

## Phase 24 Advanced MPC Verification Addendum

Phase 24 的 NMPC / EMPC / Tube MPC / Explicit MPC 屬離散時間最佳控制基線，驗證重點不是圖形外觀，而是最佳化問題、約束與閉迴路行為是否符合數學定義。

### P24-03 Economic MPC

Economic MPC 使用有限域非二次目標：

```text
min_U Σ_{k=0}^{N-1} ℓ(x_k, u_k) + V_f(x_N)
s.t.  x_{k+1} = A_d x_k + B_d u_k
      u_min <= u_k <= u_max
```

`control-studio/js/control/empc.js` 以 seeded Differential Evolution 求解 open-loop sequence，並只套用第一個控制量。驗證腳本 `verify_p24_empc.mjs` 檢查：

- quadratic cost 時狀態收斂，行為接近 finite-horizon LQR。
- L1 / non-quadratic cost 仍可穩定改善狀態。
- `uMin/uMax` 全程滿足。
- 相同 seed 產生相同控制序列。
- terminal cost 會改變閉迴路末端誤差。

### P24-02 Tube MPC

Tube MPC 使用：

```text
u_k = v_k - K(x_k - z_k)
z_{k+1} = A_d z_k + B_d v_k
e_{k+1} = (A_d - B_d K)e_k + w_k
```

若 disturbance bound 為 `|w| <= w_max`，tube radius 以區間上界遞推：

```text
r_{k+1} = |A_d - B_d K| r_k + w_max
```

控制量 tightening：

```text
|K e_k| <= |K| r_k
u_min + |K|r <= v_k <= u_max - |K|r
```

`verify_p24_tube_explicit_mpc.mjs` 以 scalar fixture 驗證 radius propagation、input tightening、原始 input bound 滿足，以及 tightened infeasible case 的診斷。

### P24-04 Explicit MPC

Explicit MPC baseline 目前限制在 scalar `1 state / 1 input`，用 online constrained MPC 在 state grid 上取樣，再壓縮成 piecewise-linear policy：

```text
u(x) = a_i x + b_i,  x in region_i
```

驗證腳本檢查 explicit lookup 在 sample states 上與 online constrained MPC 一致，並確認 policy 可讓 scalar plant regulation 收斂。

## Implementation Checklist

後續 agent 將這些案例自動化時，建議順序如下：

1. 把十個案例整理成 JSON fixtures。
2. 在 `test_control.js` 中新增共用 assertion helper。
3. 先跑 local JS numerical core。
4. 再跑 `control_analysis_cli.mjs`。
5. 若 API server 可用，再跑 `/api/control/system/response` 與 `/api/control/system/stability`。
6. 每個案例都要輸出：case id、通過項目數、失敗項目與觀察值。
7. 任一數學等價檢查失敗時，測試必須回傳非零 exit code。
