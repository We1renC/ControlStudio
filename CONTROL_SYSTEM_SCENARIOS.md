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
