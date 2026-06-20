# Control System Scenario Studies

此文件記錄用 ControlStudio 進行實際控制情境設計的案例。後續 agent 可用這些案例檢查產品流程、數學核心與 UI/CLI 改善方向。

## Scenario 7: Discrete Plant Sample-Time Export And Project Persistence

Date: 2026-06-19

### Control Situation

驗證 z-domain plant 的 sample time 是否在實際 UI 工作流中被視為控制模型的一部分，而不是只存在於輸入欄位或圖表標題。此情境特別針對 code generation、analysis export、autosave 與 local multi-project save/load，避免非預設 sample time 被靜默退回 `Ts=0.1`。

### Model

```text
G(z) = (0.25 + 0.1z^-1) / (1 - 1.2z^-1 + 0.35z^-2)
Ts = 0.25 s
```

### ControlStudio Workflow

1. 開啟 `http://127.0.0.1:8765`。
2. 切換到 `Discrete TF G(z)`。
3. 輸入：
   - Numerator: `0.25, 0.1`
   - Denominator: `1, -1.2, 0.35`
   - Sample Time: `0.25`
4. 點擊 `Update Plant`。
5. 檢查 MATLAB code preview。
6. 儲存 local project，切回 continuous TF，再載入剛儲存的 project。
7. 再次檢查 plant formula 與 MATLAB code preview。

### Expected Assertions

- UI state remains `systemType = dtf` after update and reload.
- Autosave/project payload includes `domain = z` and `sampleTime = 0.25`.
- `discreteTransferFunction.sampleTime = "0.25"` is preserved.
- MATLAB preview contains `Ts = 0.25;`.
- MATLAB preview does not contain `Ts = 0.1;`.
- Reloaded project still displays:

```text
(0.25 + 0.1z^-1) / (1 - 1.2z^-1 + 0.35z^-2)
```

### Observed Result

Browser walkthrough passed. The local multi-project manager now serializes through the canonical project payload and reloads through `applyProjectPayload()`, so DTF models reload as proper `DiscreteTransferFunction` runtime state instead of plain JSON objects.

## Scenario 8: MATLAB / Python Codegen Runtime-Mode Contract

Date: 2026-06-19

### Control Situation

驗證 ControlStudio 的 MATLAB / Python script export 是否忠實反映目前 runtime mode 與 plant domain。此情境避免兩類部署破口：

- open-loop export 引用未定義的 closed-loop `T`
- z-domain plant export 混入 continuous PID `C(s)` / `L=C*G`

### Continuous Open-Loop Workflow

1. 開啟 `http://127.0.0.1:8765`。
2. 使用 continuous TF：

```text
G(s) = 1 / (s + 1)
```

3. 關閉 closed-loop toggle。
4. 更新 plant 並刷新 MATLAB code preview。

Expected assertions:

- Preview contains `L = series(C, G);` for Bode / margin analysis.
- Preview does not contain `T = feedback(L, 1);`.
- Preview contains `step(G);`.
- Preview does not contain `step(T);`.
- Preview title is `Plant response`.

### Discrete Domain Workflow

1. 切換到 `Discrete TF G(z)`。
2. 輸入：
   - Numerator: `0.25, 0.1`
   - Denominator: `1, -1.2, 0.35`
   - Sample Time: `0.25`
3. 更新 plant 並刷新 MATLAB code preview。

Expected assertions:

- Preview contains `Ts = 0.25;`.
- Preview contains `step(G);`.
- Preview does not contain `C = pid`.
- Preview does not contain `L = series(C, G);`.
- Deterministic verifier also checks Python output for no JavaScript `true` / `false` syntax and no `T if (...) else G` expression.

### Observed Result

Browser walkthrough passed. Continuous open-loop preview uses `G` as the time-response target while keeping `L` for frequency-domain analysis. DTF preview preserves `Ts=0.25` and omits continuous PID / loop generation. `verify_codegen_export_contract.mjs` locks the same behavior for both MATLAB and Python generators.

## Scenario 9: Discrete Impulse Export Response-Type Contract

Date: 2026-06-19

### Control Situation

驗證 z-domain analysis export 是否忠實反映目前選擇的 discrete response，而不是把 step response samples 標成 impulse 或其他 waveform。此情境直接檢查 browser JSON export artifact，因為 HIL、CSV、Markdown 與後續 agent validation 都會使用這些匯出資料。

### Model

```text
G(z) = 0.5 / (1 - 0.5z^-1)
Ts = 0.2 s
Amplitude = 2
Response = impulse
```

### ControlStudio Workflow

1. 開啟 `http://127.0.0.1:8765`。
2. 切換到 `Discrete TF G(z)`。
3. 輸入：
   - Numerator: `0.5`
   - Denominator: `1, -0.5`
   - Sample Time: `0.2`
4. Simulation input 選 `Impulse`。
5. Amplitude 設為 `2`，sample count 設為 `5`。
6. 點擊 `Update Plant`。
7. 點擊 `Export JSON`，攔截下載內容並檢查 payload。

### Expected Assertions

- `responseType = "impulse"`
- `requestedResponseType = "impulse"`
- `sampleTime = 0.2`
- `y[0..3] = [1, 0.5, 0.25, 0.125]`
- `t[0..3] = [0, 0.2, 0.4, 0.6]`
- `metrics.gainMarginDB = null` with `gainMarginDBStatus = "positive_infinity"`
- `metrics.phaseMargin = null` with `phaseMarginStatus = "undefined"`
- `metrics.stepMetricsValid = false`
- `metrics.stepMetricsReason = "step metrics require step input; got impulse"`
- step response metrics are null for impulse export
- export does not contain the step sequence `[1, 1.5, 1.75, ...]`

### Observed Result

Browser walkthrough passed. `buildCurrentAnalysisExport()` now routes DTF impulse export through `discreteImpulseResponse()` and records the effective `responseType` separately from the UI request. Unsupported discrete export waveforms normalize to `step` while keeping `requestedResponseType` for traceability. Non-finite margins are serialized as JSON-safe `null` values plus explicit status fields so `∞` gain margin and undefined phase margin are not both misread as generic missing data.

### Engineering Decision

Export artifacts are now treated as control verification inputs, not just UI conveniences. Any future discrete waveform support must add both the actual response engine and an export contract fixture; otherwise the export layer must normalize unsupported requests explicitly.

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

---

## Scenario 2: 2x2 Mixing Tank（MIMO 耦合系統設計）

Date: 2026-05-17

### Control Situation

加熱混合槽（heated mixing tank）案例：兩個輸入閥（u₁=熱水流量、u₂=冷水流量）同時影響兩個量測輸出（y₁=溫度、y₂=液位）。
這是典型強耦合 MIMO 系統 — 開熱水會同時升溫且升位，必須先解耦或用 multivariable 控制器處理。

模型（State-Space 2×2）：

```text
A = [[-0.5,  0  ], [ 0  , -0.3]]   兩個獨立慢動態
B = [[ 1.0,  0.8], [ 0.6, 1.0 ]]   強耦合輸入矩陣
C = [[ 1,   0   ], [ 0  , 1   ]]   狀態直接量測
D = [[ 0,   0   ], [ 0  , 0   ]]
```

### Design Target

```text
Decoupled steady-state behavior (RGA ≈ I)
Closed-loop stable
Condition number κ(jω) keep below 10 across operating band
Both outputs settle to setpoint without cross-channel interference
```

### ControlStudio Workflow

1. System tab → SYSTEM TYPE → 切到 **MIMO**
2. 輸入 ABCD 四矩陣 → Update MIMO System
3. 點 **⊞ All** 確認 4 通道步階響應（看出耦合）
4. Advisor tab → MIMO Analysis：
   - **Compute RGA** → 配對診斷
   - **Plot σ_max / σ_min** → 條件數 κ
   - **Compute & Apply Decoupler** → 自動套用 W = G(0)⁻¹
   - 再次 **Compute RGA** 驗證 RGA = I
5. **Compute MIMO LQR Gain K** → 對解耦後系統求 LQR

### Observed Results

| Step | Metric | Before Decoupler | After Decoupler | Pass? |
| --- | --- | ---: | ---: | :---: |
| RGA λ₁₁ | Pairing quality | 1.923 (moderate) | 1.000 (perfect) | ✓ |
| RGA λ₁₂ | Off-diagonal | −0.923 | 0.000 | ✓ |
| κ @ ω_min | Condition number | 6.086 | (depends on Q/R) | ✓ |
| K_lqr | Diagonal? | n/a | diag(0.4142) | ✓ |
| CL stable | Re(eig(A−BK)) < 0 | n/a | Yes | ✓ |

### Engineering Decision

對於溫度+液位耦合的混合槽，先套用 Static Decoupler 把 DC 增益對角化，再用 MIMO LQR 設計 state feedback。解耦後每個通道可獨立調 Q/R 比例。

### UI/UX Findings From Live Studio Walkthrough（2026-05-17）

以下問題在實際操作 SISO/MIMO 流程時發現，依嚴重度排序：

#### Severity: High（破壞功能或誤導使用者）

| # | 問題 | 位置 | 影響 |
| - | - | - | - |
| H1 | Phase 7/8 在 MIMO 模式下不知道使用者切過模式 | `currentPhase7DesignModel()` (app.js:729) 永遠用 `state.plant`（在 MIMO 模式下這是當前 channel 的 SISO TF），導致 Kalman/LQR 算出來是 single-channel realization，可觀矩陣 rank 不足 | 使用者以為在分析 MIMO 系統，實際上分析的是某一 channel；錯誤的 K_lqr / L_kf |
| H2 | Step-response overshoot 兩處顯示不同數字 | Stability Snapshot vs Compare Snapshot 對同一參數可顯示 10.5% vs 5.8% | 使用者不知道哪個值是「真實」overshoot ｜ 已修正：兩處皆走 `currentResponseData(closedLoop) → stepInfo()` 同一公式。若顯示差異，唯一來源是「快照當下的 simulationConfig（duration / sampleCount）」 vs 「目前 sidebar 上的 config」不同 — 快照鎖定當時狀態，現場面板隨配置即時更新 |
| H3 | Compare snapshots 不會隨 SISO↔MIMO 模式重置 | Compare panel 留著 SISO 快照仍然疊在 MIMO 主圖下方 | 跨模式比較毫無意義且誤導 |

#### Severity: Medium（功能存在但流程不直覺）

| # | 問題 | 位置 | 影響 |
| - | - | - | - |
| M1 | Bode 圖未直接標示 PM/GM cross-marker | Bode chart | PM/GM 是 Bode 最重要結果，要捲到 sidebar 才看到 |
| M2 | PID 沒有 derivative filter N 參數的 UI | Controller Tuning | 無法重現 scenario 規定的 N=100，與外部設計工具結果有落差 |
| M3 | Stability Snapshot 在 Sim 面板最底部 | Sim panel | 必須捲很多才看到重要指標，建議移到固定 footer 或置頂 |
| M4 | Design Pole-Out 排版混亂 | `#design-pole-out` | 「ζ = 0.6266σ = 2.0000」數值/標籤緊貼，可讀性差 |
| M5 | MIMO 模式下 Phase 7/8 區塊仍可點按 | Advisor panel | 應該整合（直接吃 mimoPlant）或在 MIMO 模式下禁用並提示 |

#### Severity: Low（細節/可改善）

| # | 問題 | 位置 | 影響 |
| - | - | - | - |
| L1 | 主圖標題 "Step Response" 顯示位置/格式不一致 | Plot header | 與 plot type label 重複 |
| L2 | ⊞ All view 不標示是 open-loop 還是 closed-loop | MIMO grid | 使用者不確定看到的是哪個 |
| L3 | 切換到 MIMO 後切回 SISO，sidebar 滾動位置不會回頂部 | switchSystemMode | 使用者迷失上下文 |

### Improvement Backlog（已完成，commit `46deba6`）

依優先級執行並全部驗證：

| # | 問題 | 修復方式 | 驗證結果 |
| - | - | - | - |
| H1 | Phase 7/8 不認 MIMO | `currentPhase7DesignModel()` 開頭加 `if (state.systemMode === 'mimo' && state.mimoPlant) return mimoPlant ABCD`；SISO-only 子功能在 MIMO 模式下明確報錯 | MIMO Kalman 現在 rank(Wo)=2/2，L_kf 變成 2×2 矩陣（之前 column vector） |
| H2 | Overshoot 兩處數字不一 | 兩處皆走 `currentResponseData(closedLoop) → stepInfo()` 同一公式；殘餘差異來自快照鎖定當時 `simulationConfig` vs 現場面板配置 | 公式統一，殘餘差異有明確語意 |
| H3 | Compare 不清快照 | `switchSystemMode` 加 `confirm()` + `state.comparisonSnapshots = []` | 切模式後 snapshot count = 0 |
| M1 | Bode 無 PM/GM marker | 加 ω_gc 和 ω_pc 垂直虛線 + `PM=…°` / `GM=… dB` annotation | Bode 圖實際畫出兩條綠線 + 兩個標籤 |
| M2 | PID 缺 N filter | 新增 `pid-N` input；`PIDController` 支援 N filter（預設 ∞ 為理想 PID） | UI 可設 N=100 重現 scenario 結果 |
| M3 | Stability 太底部 | 移到 `#panel-simulate` 第一個 section | Snapshot 一進 Sim panel 立即看到 |
| M4 | design-pole-out 排版 | 每個 metric 用獨立 `<div display:block>` + nbsp 包裹 | 「ζ = … σ = …」分行清晰 |
| M5 | Phase 7/8 MIMO 可點按 | 新增 `#p7-mimo-banner` / `#p8-mimo-banner`；SISO 函式在 MIMO 模式拋明確訊息引導去 MIMO LQR | 點 SISO Pole Placement 顯示「請使用 MIMO Analysis → MIMO LQR」 |
| L1 | Step Response 標題重複 | 移除 `layout.title`（chart-header 已有）| 主圖只剩一處標題 |
| L2 | ⊞ All 不標 loop type | grid 標題改 "All Channels (Open-loop Step Response)"，cell 標籤加 `(open)` | 每格清楚標示 |
| L3 | 切模式 sidebar 不回頂 | `switchSystemMode` 結尾加 `aside.scrollTop = 0` | 切後立即回頂 |

新增測試（`test_control.js`）：PID derivative filter N=100 與 N=∞ 兩個案例的轉換式正確性。

### Lessons Learned

1. **MIMO 與 Phase 7/8 一開始是分開開發的**，整合時容易產生 H1 這種「使用者切了模式但底層沒切」的問題。下次新增大型模式時，要列「跨模式依賴清單」並逐項檢查。
2. **同一份指標出現在多處時必須來自單一來源**（H2）。Stability Snapshot 和 Compare Snapshot 若有任何計算差異都會誤導使用者。
3. **預設視覺結果重要過數值**（M1）。Bode 圖沒 PM/GM marker 是技術上正確但 UX 上失敗的典型例子。
4. **進階功能必須有「mode 守門員」**（M5）。SISO Pole Placement 在 MIMO 模式下不應靜默失敗，要主動引導到正確功能。

---

## Scenario 3: Magnetic Levitation（SISO 不穩定 plant）

Date: 2026-05-17

### Control Situation

電磁鐵把鐵球懸浮在空中。重力把球往下拉、電磁力把球往上抬。在平衡點線性化後 plant 為：

```text
G(s) = K / (s² − a²) = 1000 / (s² − 900) = 1000 / [(s − 30)(s + 30)]
```

有一個 **RHP pole** 在 s=+30 → 開迴路不穩定。這是經典「unstable plant」教學案例，用來測 Studio 對不穩定系統的處理能力。

### Design Target

```text
閉迴路穩定（必要）
Re(eig(A − BK)) ≤ −5（衰減快於 5 rad/s）
Overshoot ≤ 20%
```

### ControlStudio Workflow

1. System tab → 輸入 TF：`num=1000, den=1, 0, -900`
2. Pole-Zero map：**切到 Open-loop** 看到 plant 真正極點 ±30
3. Time Response (open-loop)：響應爆炸到 10¹² 確認不穩定
4. Advisor → Phase 7：
   - State Feedback desired poles = `-10, -15` → K = [1050, 25]
   - LQR Q=I, R=1 → K = [1800, 60]，CL poles 自動到 −29.5/−30.5

### Observed Results

| 步驟 | 期望 | 實際結果 | 通過？ |
| - | - | - | - |
| Open-loop step | 發散 | 10⁻¹² 增長 | ✓ |
| Plant poles | ±30 | ±30（需切到 open-loop view）| ✓ |
| State Feedback K | 把極點放到 −10, −15 | K=[1050,25]，CL=−10,−15 | ✓ |
| LQR (Q=I,R=1) | CL stable | K=[1800,60]，CL=−29.5,−30.5 | ✓ |

### UI/UX Findings From Scenario 3

| # | 嚴重度 | 問題 | 影響 |
| - | - | - | - |
| S3-1 | High | PZ map 預設顯示**閉迴路**，使用者輸入新 plant 後**看不到 plant 本身極點** | 工程師無法第一眼判斷 plant 是否不穩定／在哪 |
| S3-2 | Medium | Lyapunov 對不穩定 plant 報「Singular matrix」 | 訊息對使用者毫無幫助；應該說「plant 不穩定，Lyapunov 無正定解，請先穩定化」 |
| S3-3 | Medium | 錯誤訊息 toast 不會自動消失，切到別 plot tab 還掛著舊錯誤 | 誤導使用者以為新操作也失敗 |
| S3-4 | Low | Bode PM/GM 對不穩定 plant 顯示一般數字（PM=30.9°、GM=∞），未提示 Nyquist criterion 對 RHP poles 需特別解讀 | 學生可能誤判穩定性 |

### Engineering Decision

對不穩定 plant，必須先 Phase 7 State Feedback 或 LQR 穩定化，再做頻域分析。建議 Studio 在偵測到 plant 有 RHP poles 時自動切到 open-loop view 並 banner 提示「請先穩定化」。

---

## Scenario 4: Spacecraft Attitude Control（MIMO 含 integrator + gyroscopic coupling）

Date: 2026-05-17

### Control Situation

太空船 2 軸姿態控制（pitch θ + yaw ψ），透過 gyroscopic coupling 相互影響：

```text
State    x = [θ, θ̇, ψ, ψ̇]
Input    u = [τθ, τψ]
Output   y = [θ, ψ]

A = [[0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, −1, 0, 0]]
B = [[0,0],[1,0],[0,0],[0,1]]
C = [[1,0,0,0],[0,0,1,0]]
D = [[0,0],[0,0]]
```

A 的特徵多項式 = s²(s² + 1)，所以 plant 有 4 個極點在 jω 軸上（**marginally stable + 含 double integrator**）。這是 attitude control 的典型形態。

### Design Target

```text
全狀態回授穩定化
Settling time < 5 s 兩軸
解耦：u₁ 步階主要影響 y₁，對 y₂ 干擾 < 30%
```

### ControlStudio Workflow

1. System → MIMO → n=4, m=2, p=2，輸入 ABCD
2. ⊞ All 看到 4 channel 強耦合振盪響應
3. Advisor → MIMO Analysis：
   - **Compute RGA** ❌ 失敗
   - **Plot σ_max / σ_min** ✓ κ=100
   - **Compute MIMO LQR** ❌ 失敗
4. Phase 8：Kalman ❌ 失敗，LQG ❌ 失敗

### UI/UX Findings From Scenario 4

| # | 嚴重度 | 問題 | 影響 |
| - | - | - | - |
| S4-1 | **Critical** | RGA 對含 integrator 的 plant 報「Singular matrix」，無解釋 | 整個 MIMO Analysis 鏈被卡住，使用者不知道是因為 G(0) 無定義 |
| S4-2 | **Critical** | MIMO LQR 對 marginally stable plant 失敗（Newton-Kleinman initial K=0 無效）。預期應該能解（plant 可控） | LQR 是 MIMO 設計的關鍵工具，失效等於 Phase 9 對含 jω-axis plant 不可用 |
| S4-3 | High | Phase 8 Q_n textarea 不會隨 MIMO 系統 n 自動 resize；切到 n=4 時 Q_n 仍為 2×2 預設，使用者要手動補 | 流程斷裂；應該偵測 MIMO 後自動更新預設 |
| S4-4 | High | 「Singular matrix」這個訊息在 **4 個不同失敗原因**都用同字串（Lyapunov, RGA, LQR, LQG），無法 debug | 使用者無法判斷哪裡出錯 |
| S4-5 | Medium | Phase 8 Kalman 在 marginally stable plant 也失敗 | LQE 同樣 Kleinman initial 問題；MIMO 含 integrator 的 plant 不能跑 Phase 8 完整鏈 |

### Improvement Backlog（已完成，commit `70b5aad`）

| # | 問題 | 修復方式 | 驗證結果 |
| - | - | - | - |
| S3-1 | PZ map 隱藏 plant 不穩定極點 | `updateSystem` 偵測 RHP poles 自動關 CL toggle + 顯示 banner | 進入 MagLev 立即看到 ±30 |
| S3-2 | Lyapunov 對不穩定 plant 報「Singular matrix」 | `analyzeLyapunov` 包裝錯誤為「A 含對稱共軛特徵值（plant 不穩定或 jω-axis），請先 State Feedback 穩定化」 | 訊息有可執行建議 |
| S3-3 | 錯誤 toast 不消失 | `showError` 加 `setTimeout(clearError, 6000)` | 6 秒自動消失 |
| S3-4 | Bode 對 RHP plant 沒提示 | `renderBodePlot` 加紅色 annotation banner | Bode 上顯示 ⚠ Plant 不穩定，Nyquist criterion 須考慮 RHP poles |
| S4-1 | RGA 對 integrator plant 失敗無解釋 | `dcGain` / `rgaSteady` 包裝為「G(0) 為奇異（plant 含 integrator）。建議改在 ω > 0 計算 RGA(jω)」 | 訊息清楚 |
| S4-2 | MIMO LQR 對 marginally stable 失敗 | 新增 `bassStabilizingGain(A, B)` 三層 fallback：K=0 → 偽逆移位 → Bass K=αB'。若三者皆失敗，給出明確建議 | 訊息變成「請先 SISO Pole Placement 取得 K₀ 後 LQR 精修」 |
| S4-3 | Q_n textarea 不會 resize | `updateMIMOSystem` 自動更新 obs-qn / dkf-qd / mimo-lqr-q/r 為 n×n / m×m 單位矩陣（僅在 dim 不匹配時） | n=4 時 obs-qn 自動變 4×4 |
| S4-4 | 「Singular matrix」字串重複 | 新增 `SingularMatrixError` class；各呼叫端按 context 包裝 | 4 個失敗點各自有獨立訊息 |
| S4-5 | Phase 8 Kalman 對 marginally stable 失敗 | `solveLqe` / `solveDiscreteKalman` 同樣加 Bass fallback + 友善錯誤 | 訊息同 S4-2 |

### Engineering Decision（Bass 法局限）

Spacecraft 案例 B = `[[0,0],[1,0],[0,0],[0,1]]` 是 sparse rank-2 矩陣，B·Bᵀ 的零空間恰好包含 plant 的 jω-axis 模態子空間 → Bass K = αBᵀ 無法 stabilize。這是數學上的根本限制，不是實作缺陷。

對 Spacecraft 這類案例，**正確的工程流程**：
1. 先用 SISO Ackermann 對每個 input column 分別做 stabilizing pole placement
2. 組合成 MIMO 初始 K₀
3. 以 K₀ 為初值跑 Newton-Kleinman LQR 精修

或實作 **Schur method** 的完整 CARE solver（Hamiltonian eigenvector decomposition）— 這是 MATLAB `care()` 的內部方法。為避免引入額外 ~200 行程式碼且解決方案普及度有限，Studio 目前選擇「明確錯誤訊息 + 工作流引導」的折衷。

### Lessons Learned（新增第 5、6 條）

5. **「Singular matrix」這種底層數學錯誤不能直接外漏給使用者**。每個呼叫端必須包裝為「該功能脈絡下的具體解釋」。否則使用者要回頭推測哪個矩陣奇異、為何奇異。
6. **Newton-Kleinman LQR 對 marginally stable / unstable plant 不通用**。生產級控制工具應該用 Schur method（或 Hamiltonian eigenvector method）作為主求解器，Newton-Kleinman 只是 refinement。Studio 目前對「邊界 plant」（integrator、不穩定）以「明確錯誤 + 工作流引導」為過渡方案；Schur method 排入 Phase 10 backlog。

---

## Scenario 5: Phase 10 MPC / Robust UI Walkthrough

Date: 2026-05-17

### Control Situation

以實際 ControlStudio 介面檢查 Phase 10 的兩個新能力是否能支援工程師完成設計流程：

1. **MPC**：離散狀態空間模型，有限 horizon，無約束 receding-horizon baseline。
2. **Robust**：SISO loop 的 sensitivity functions：`S=1/(1+L)`、`T=L/(1+L)`、`KS=K/(1+L)` 與 peak sensitivity。

### Browser Walkthrough

入口：

```text
http://127.0.0.1:8765/
```

已實際操作：

1. System → SISO：
   - 可輸入 Transfer Function。
   - 可 Convert to Discrete。
   - 可調 PID / Lead / Lag。
   - 無 MPC / horizon / Q/R / x0 / receding-horizon simulation UI。

2. System → MIMO：
   - 可輸入 MIMO State-Space。
   - 可看到 channel selector。
   - 可使用既有 MIMO workflow。
   - 可見 Static Decoupler / MIMO LQR 相關入口。
   - 無 Dynamic Decoupler 的 `ωc` 輸入或 `G(jωc)W(jωc)` residual 顯示。

3. Advisor：
   - 可見 State Feedback / Lyapunov / LQR。
   - 可見 Observer & Kalman Filter。
   - 無 MPC section。
   - 無 Robust / Sensitivity section。

4. Plot tabs：
   - Bode / Nyquist / Nichols / Root Locus 可用於傳統頻域分析。
   - 無 `S/T/KS` plot tab。
   - 無 peak sensitivity / robust risk summary。

### Observed Result

| 情境 | 底層模組狀態 | UI 可完成度 | 結論 |
| - | - | - | - |
| MPC | Done：`finiteHorizonLqr`、`firstMpcAction`、`simulateUnconstrainedMpc` | 不可完成 | 工程師無法透過 Studio UI 設定 horizon / Q / R / x0 或查看 MPC 模擬 |
| Robust | Done：`sensitivityAt`、`sensitivityBode`、`robustPeaks` | 不可完成 | 工程師無法透過 Studio UI 查看 `S/T/KS`、peak sensitivity 或 robust risk |
| Dynamic Decoupler | Done：`dynamicDecouplerAtFrequency` | 不可完成 | UI 仍只有 static decoupler，沒有 `ωc` 與 selected-frequency verification |

### UI/UX Findings From Scenario 5

| # | 嚴重度 | 問題 | 影響 |
| - | - | - | - |
| S5-1 | Critical | MPC 底層核心已完成，但 UI 沒有任何 MPC 入口 | 工程師無法用 Studio 完成 MPC 設計，只能靠程式模組 |
| S5-2 | Critical | Robust sensitivity 底層核心已完成，但 UI 沒有 Robust / Sensitivity 入口 | 工程師無法判斷 `S/T/KS` peak、robust risk 或閉迴路敏感度 |
| S5-3 | High | Dynamic Decoupler 核心已完成，但 UI 仍只提供 Static Decoupler | 使用者無法指定 crossover `ωc` 或看到 `G(jωc)W(jωc)≈I` 驗證 |
| S5-4 | High | 介面沒有告知「Phase 10 核心目前是 API / module-ready，但 UI 尚未整合」 | 使用者會以為功能不存在，或誤以為 Bode / LQR 已等同 MPC / Robust |
| S5-5 | Medium | Bode / stability margin 與 Robust sensitivity 的關係沒有被串起來 | 工程師看得到 PM/GM，但看不到 `Ms`、`Mt`，無法形成 robust design decision |

### Improvement Backlog

| # | 建議修復 | 驗證方式 |
| - | - | - |
| S5-1 | 新增 Advisor → MPC Baseline section：`horizon`、`Q`、`R`、`x0`、`steps`，顯示 first action、K0、final state norm、cost | 以 scalar integrator fixture 驗證 UI 顯示 `K0=0.6`、`u0=-0.6` |
| S5-2 | 新增 Advisor 或 Analysis → Robust Sensitivity section：顯示 `Ms`、`Mt`、`MKs`、risk | 以 `L(s)=1/(s+1)` 驗證 `S(0)=0.5`、`T(0)=0.5` |
| S5-3 | 在 MIMO Analysis 加 Dynamic Decoupler UI：`ωc` input、Compute、顯示 complex `W(jωc)` 與 residual | 驗證 `offDiagonalNorm < 1e-8` |
| S5-4 | 在 Phase 10 UI 未整合前，顯示「core available / UI pending」狀態，不讓使用者誤判 | Browser smoke 應能看到明確 Phase 10 狀態 |
| S5-5 | Robust plot integration：新增 `S/T/KS` tab 或 overlay | Browser smoke 檢查 legend 至少包含 `S`, `T`, `KS` |

### Engineering Decision

Phase 10 目前是 **math-core ready, UI-not-ready**。下一步不應再擴更多控制理論功能，而應先補 UI integration：

1. `feat(phase10): add MPC UI panel`
2. `feat(phase10): add robust sensitivity UI`
3. `feat(phase10): add dynamic decoupler UI`

教學模式、Electron、報告模板仍維持擱置。

---

## Scenario 6: SISO / MIMO Studio UI Walkthrough

Date: 2026-05-17

### Control Situation

以開發者實際使用 ControlStudio 的角度，檢查 SISO 與 MIMO 兩條核心設計流程是否能支援工程師完成模型輸入、控制器設計、穩定性判斷與多變數分析。

本次只驗證已開發主線能力，不啟用暫緩項：

- Block Diagram expansion：Paused
- 教學模式：Paused
- Electron：Paused
- 報告模板 / 報告自動化：Paused

### Browser Walkthrough

入口：

```text
http://127.0.0.1:8765/
```

已用 in-app browser 實際操作下列流程。

#### SISO Workflow

1. System → System Type → **SISO**
2. Transfer Function:
   - Numerator: `1`
   - Denominator: `1, 3, 2`
3. Click **Update System**
4. Controller Tuning:
   - PID preset：Ziegler-Nichols PID
   - `Ku=6`
   - `Tu=2`
   - Click **Apply PID Preset**
5. Lead Helper:
   - Target PM Boost: `30 deg`
   - Crossover: `3 rad/s`
   - Click **Apply Lead Helper**
6. Sim → 檢查 stability snapshot
7. Advisor → State Feedback / Lyapunov / LQR → Click **Compute LQR Gain**

#### SISO Observed Result

| Metric | Result |
| - | - |
| Gain Margin | `∞` |
| Phase Margin | `90.2°` |
| Rise Time | `2.246 s` |
| Settling Time | `3.437 s` |
| Overshoot | `0.4%` |
| Steady-State Error | `0.000133` |
| Stability | `STABLE` |
| Risk | `LOW` |
| Dominant-pole summary | `Stable: all poles satisfy the left-half plane criterion; dominant pole s = -0.829 + j0.442.` |

Phase 7 LQR output:

```text
K = [0.2361, 0.2361]
rank(Wc) = 2/2 | Init: hamiltonian-schur
CARE residual = 0
Closed-loop Lyapunov stable: Yes
Closed-loop poles = -1, -2.236
```

SISO 結論：核心流程可完成。工程師能從 plant 輸入、PID/Lead 設計、穩定性摘要一路走到 LQR 理論驗證。

#### MIMO Workflow

1. System → System Type → **MIMO**
2. MIMO State-Space:

```text
A = [[-1, 0], [0, -1]]
B = [[1, 0.5], [0.5, 1]]
C = [[1, 0], [0, 1]]
D = [[0, 0], [0, 0]]
```

3. Click **Update MIMO System**
4. Advisor → MIMO Analysis:
   - Click **Compute RGA (DC)**
   - Click **Plot σ_max / σ_min**
   - Click **Compute & Apply Decoupler**
   - Click **Compute RGA (DC)** again
   - MIMO LQR：`Q=10I`、`R=I`，Click **Compute MIMO LQR Gain K**

#### MIMO Observed Result

Before decoupler:

```text
RGA =
 1.333  -0.333
-0.333   1.333

row sum dev = 0
col sum dev = 0
y1↔u1: Good pairing
y2↔u2: Good pairing
```

Singular value analysis:

```text
σ_max @ ω_min = 1.4999
σ_min @ ω_min = 0.5
Condition κ @ ω_min = 3
Worst κ across sweep = 3
```

Static decoupler:

```text
G(0) =
1   0.5
0.5 1

W = G(0)^-1 =
 1.333 -0.667
-0.667  1.333

G(0)W =
1 0
0 1
```

After decoupler:

```text
RGA =
1 0
0 1
```

MIMO LQR:

```text
K =
[2.3166, 0],
[0, 2.3166]

Controllability rank = 2/2
Initial gain = zero-gain-stable-A
Iterations = 7
CARE residual = 0
Closed-loop stable = Yes
u = -Kx
```

MIMO 結論：核心 MIMO 流程可完成。RGA、SV Bode、Static Decoupler、Decoupler 後 RGA 驗證、MIMO LQR 都能透過 UI 操作得到工程上可判讀的結果。

### UI/UX Findings From Scenario 6

| # | 嚴重度 | 問題 | 位置 | 影響 |
| - | - | - | - | - |
| S6-1 | High | 切到 MIMO 後，Phase 7 SISO LQR 舊結果仍顯示在 State Feedback / Lyapunov / LQR 區塊 | Advisor → Phase 7 | Banner 有說 SISO Pole Placement / SISO LQR 不適用，但舊的 `K=[0.2361,0.2361]` 仍留在畫面，容易被誤認為 MIMO 設計結果 |
| S6-2 | Medium | MIMO Analysis 位於 Advisor 面板下方，初次使用不易發現 | Advisor → MIMO Analysis | 開發者會先看到 Phase 7/8，再往下才看到真正 MIMO 工具；建議 MIMO mode 下將 MIMO Analysis 提前或自動聚焦 |
| S6-3 | Medium | RGA 與 decoupler 輸出是純文字矩陣 | MIMO Analysis output | 數值正確，但工程閱讀性不足；建議矩陣表格化並標示 row/column 為 `y_i/u_j` |
| S6-4 | Medium | Singular Value chart 區域偏小，legend / axis label 易擁擠 | `#chart-mimo-sv` | 對 2 條曲線尚可，但未來多線或 overlay 會不易讀；建議提高高度或提供全寬圖表模式 |
| S6-5 | Low | SISO PID 仍以 slider 為主，精確工程輸入不夠直接 | Controller Tuning | 開發者能透過 preset 操作，但手動指定精準 `Kp/Ki/Kd` 時不如 number input 清楚 |
| S6-6 | Low | MIMO LQR 顯示 initial strategy，但沒有明確說明何時用 Hamiltonian Schur vs Newton-Kleinman | MIMO LQR output | 數學核心已可用，但開發者追溯 solver path 時仍需讀程式或測試文件 |

### Improvement Backlog

| # | 狀態 | 修復方式 | 驗證結果 |
| - | - | - | - |
| S6-1 | Done | MIMO mode 下清空 Phase 7/8 SISO-only 舊輸出；若使用者點 SISO-only 按鈕，仍會輸出 MIMO 不適用提示 | Browser walkthrough：切 SISO 算 LQR → 切 MIMO → `phase7-lqr-out` display=`none` 且文字為空 |
| S6-2 | Done | MIMO mode 下將 `#mimo-analysis-panel` order 設為 `-1`，讓 MIMO Analysis 在 Advisor 最前面 | Browser walkthrough：切 MIMO 後 Advisor 中 `mimo-analysis-panel` display 可見、order=`-1` |
| S6-3 | Done | RGA / G(0) / W / G(0)W 改用 row/column-labeled matrix table | Browser smoke：RGA output 有 1 個 table；Decoupler output 有 3 個 matrix table |
| S6-4 | Done | `#chart-mimo-sv` 高度由 180px 增至 280px，Plotly legend 明確顯示 `σ_max` / `σ_min` | Browser smoke：chart height=280px，legend DOM text 包含 `σ_max`、`σ_min` |
| S6-5 | Done | Kp / Ki / Kd slider 旁新增 numeric input，兩者共用 `syncPIDSliders()` 雙向同步 | Browser smoke：`pid-Kp-num`、`pid-Ki-num`、`pid-Kd-num` 存在；JS tests pass |
| S6-6 | Done | SISO LQR 與 MIMO LQR output 新增 `Solver:`，標示 Hamiltonian Schur 或 Newton-Kleinman 初值策略 | Browser smoke：SISO / MIMO LQR output 皆包含 `Solver: Hamiltonian Schur CARE` |

### Screenshot Artifacts

```text
outputs/controlstudio/siso-ui-walkthrough.png
outputs/controlstudio/mimo-ui-walkthrough.png
outputs/controlstudio/s6-fixes-mimo.png
```

### Engineering Decision

SISO / MIMO 主要設計流程已可用。下一步仍應依 Phase 10 開發順序推進：

1. `feat(phase10): add MPC UI panel`
2. `feat(phase10): add robust sensitivity UI`
3. `feat(phase10): add dynamic decoupler UI`

S6 介面問題已修復。下一步可回到 Phase 10 UI integration 主線。

---

## Scenario Note: Plot Workspace Walkthrough（2026-05-24）

Date: 2026-05-24

### Browser Walkthrough Scope

以預設 SISO plant 實際操作 plot tabs，逐一檢查：

- `Time Response`
- `Bode`
- `Nyquist`
- `Root Locus`
- `Pole-Zero`
- `Sensitivity`
- `Stability Map`

本輪同時驗證新的 plot workspace 佈局是否固定為：

```text
┌─────────────────────────────────────────┐
│ Main plot（全寬）                       │
├──────────────────┬──────────────────────┤
│ Companion 1      │ Companion 2         │
└──────────────────┴──────────────────────┘
```

### Verified Mapping

| Active plot | Main | Companion 1 | Companion 2 | Browser result |
| --- | --- | --- | --- | --- |
| Time Response | Step Response | Root Locus | Pole-Zero Map | Pass |
| Bode | Bode Plot | Nyquist Plot | Pole-Zero Map | Pass |
| Nyquist | Nyquist Plot | Bode Plot | Pole-Zero Map | Pass |
| Root Locus | Root Locus | Step @ K | Pole-Zero Map | Pass |
| Pole-Zero | Pole-Zero Map | Step Response | Bode Plot | Pass |
| Sensitivity | S / T / KS | Bode Plot | Pole-Zero Map | Pass |
| Stability Map | Kp-Ki map | Step Response | Root Locus | Pass |

### UI Findings

| # | 嚴重度 | 問題 | 影響 |
| - | - | - | - |
| PW-1 | Done | 首次載入曾先後出現 onboarding overlay 與 Quick Start modal，兩者都會阻塞 plot tab 點擊 | 已改為首次進站只保留 onboarding；Quick Start 改為手動開啟，結束導覽後以非阻塞 toast 提示入口 |

### Improvement Note

首次進站 blocking UI 已修正為單一入口；後續若要再優化，可把 onboarding 也改成更輕量的 docked coach-mark。

### Follow-up UI Audit Resolution（2026-05-24）

同日追加以 in-app browser 實際操作 workflow / mode / plot tabs，針對「偏題、關鍵資訊被隱藏、局部圖形過小」三類問題做閉環修正。

| # | 狀態 | 修復方式 | Browser result |
| - | - | - | - |
| PW-2 | Done | workflow tab 改為穩定的 delegated click routing；`識別 / 設計 / 分析 / 實作 / 學習` 各自只顯示對題面板 | 逐 tab 操作後，visible section titles 與 workflow 意圖一致 |
| PW-3 | Done | plot workspace 下排 companion charts 放大；實測 `chart-rlocus=404×276`、`chart-pzmap=404×250` | `Time Response / Bode / Nyquist / Nichols / Root Locus / Pole-Zero / Sensitivity / 穩定地圖` 皆無局部圖形過小 |
| PW-4 | Done | `Stability Map` 新增穩定邊界、當前設計點、顏色註記與 legend，避免主圖只剩無說明的小點 | Browser walkthrough：legend 顯示 `穩定邊界 / 當前設計點`，annotation 顯示 `綠色 = 穩定裕度較高，紅色 = 不穩定` |
| PW-5 | Done | `NVIDIA Control Advisor` 重新限制為 MIMO-only；SISO 隱藏 panel 與回覆容器，MIMO 才顯示 panel | Browser walkthrough：SISO=`advisor hidden`，MIMO=`advisor visible` |

### Sidebar Information Architecture Audit（2026-05-24）

針對使用者回報「side bar panel 過長、需要一直滾動」追加做一輪結構性整理，不是只調整 spacing，而是直接重組資訊層級。

| # | 狀態 | 修復方式 | Browser result |
| - | - | - | - |
| SB-1 | Done | workflow sidebar 新增 category grouping：`識別=Core/ID/Reuse`、`設計=Core/Specs/Advanced`、`分析=Core/Model/Advanced`、`實作=Sim/Deploy/QA`、`學習=Guide/Review` | 每個 workflow tab 都能一眼辨識面板群組，不再是長串無分段 section |
| SB-2 | Done | 對次要 panel 套用 default collapsed preset，例如 `SysID`、`Convert to Discrete`、`Robustness`、`Nyquist 動畫`、`HIL CSV` 等進階或次要內容預設收合 | `Identify / Analyse / Implement` 首屏可見主流程面板，次要工具保留但不搶版面 |
| SB-3 | Done | `Controller Tuning` 拆成 `PID 基本調整 / Preset 與自動調參 / 2-DOF 與飽和 / 補償器設計` 四個 nested subsections | `Design` tab scroll height 約由 `6225` 降到 `2052`，主要 PID 內容可直接操作，其餘進階設定按需展開 |
| SB-4 | Done | `Simulation` 拆成 `輸入與時間基準 / 干擾與初始條件 / 儲存與匯出` 三段 nested subsections | `Implement` tab 不再把干擾、session、匯出全部堆成單一長卡片 |
| SB-5 | Done | 切 workflow / search filter / SISO↔MIMO 後同步刷新 group label 與 visible state，避免分類標籤和實際顯示脫節 | Browser walkthrough：切 tab、切 mode、做 sidebar search 後，group label 與 visible panel 一致 |

### Sidebar IA Outcome

這輪整理後，sidebar 的問題已從「靠捲動找功能」改成「先依任務群組定位，再決定是否展開細節」。目前仍保留全部功能，但次要面板不再和主流程搶第一屏。
