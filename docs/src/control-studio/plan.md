# Control System Development Plan

此文件是控制系統工作台的正式開發計畫。後續 agent 若要修改 `control-studio/`、`workflows/control_advisor_workflow.py`、`test_control.js`，或擴充 `control-advisor` 任務，應先閱讀本文件、`docs/src/control-studio/verification.md`、`docs/src/control-studio/backlog.md`、`docs/src/control-studio/skills.md` 並依此執行。

## 1. Product Vision

打造一套面向控制工程、機器人、自動化與教學場景的現代控制系統工具，結合：
- 類 MATLAB Control System Toolbox 的分析能力
- 類 Simulink 的視覺化建模方式
- 類 Python Control Library 的可擴充性
- 更直覺的 UI 與 AI 輔助建議

短期目標不是取代 MATLAB，而是先做出：
- 易上手的控制系統分析工具
- 可快速展示與驗證的 Web 型工作台
- 可延伸成工程版與教學版的產品基礎

## 2. Target Users

- 控制工程師
- 機器人與自動化系統開發者
- 電機、機械、航太相關師生
- 需要快速驗證控制器行為的研發團隊
- 需要視覺化展示控制系統結果的產品/方案團隊

## 3. Current Inventory

### 已存在實作
- 前端工作台：`control-studio/index.html`
- 主互動邏輯：`control-studio/js/app.js`
- 控制核心：
  - `control-studio/js/control/transfer-function.js`
  - `control-studio/js/control/pid.js`
  - `control-studio/js/control/stability.js`
  - `control-studio/js/control/smc.js`
  - `control-studio/js/control/backstepping.js`
  - `control-studio/js/control/feedback_linearization.js`
  - `control-studio/js/control/reset_control.js`
  - `control-studio/js/control/reference_governor.js`
  - `control-studio/js/control/closedloop_id.js`
  - `control-studio/js/control/adp_lqr.js`
  - `control-studio/js/control/distributionally_robust.js`
  - `control-studio/js/identification/gp.js`
  - `control-studio/js/identification/hammerstein_wiener.js`
  - `control-studio/js/identification/freq_mimo.js`
  - `control-studio/js/identification/spectral_subspace.js`
  - `control-studio/js/identification/srivc.js`
  - `control-studio/js/estimation/mhe.js`
  - `control-studio/js/estimation/particle_filter.js`
  - `control-studio/js/estimation/dual_ekf.js`
  - `control-studio/js/estimation/smoother.js`
  - `control-studio/js/estimation/unknown_input_observer.js`
  - `control-studio/js/optimization/admm_qp.js`
  - `control-studio/js/optimization/sqp.js`
  - `control-studio/js/optimization/milp.js`
  - `control-studio/js/optimization/lbfgs_trust.js`
  - `control-studio/js/optimization/mixed_integer_mpc.js`
  - `control-studio/js/math/qz_descriptor.js`
  - `control-studio/js/math/krylov.js`
  - `control-studio/js/verification/cbf.js`
  - `control-studio/js/verification/formal.js`
  - `control-studio/js/verification/importance_sampling.js`
  - `control-studio/js/control/stochastic_mpc.js`
  - `control-studio/js/control/distributed_mpc.js`
  - `control-studio/js/control/hybrid_mpc.js`
  - `control-studio/js/control/nmpc_warmstart.js`
  - `control-studio/js/codegen/c_generator.js`
  - `control-studio/js/codegen/rust_generator.js`
  - `control-studio/js/codegen/plc_generator.js`
  - `control-studio/js/codegen/autosar_generator.js`
  - `control-studio/js/codegen/freertos_generator.js`
  - `control-studio/js/codegen/safety_wrapper.js`
  - `control-studio/js/wasm/loader.js`
  - `control-studio/js/workers/compute_worker.js`
  - `control-studio/js/runtime/memoization.js`
  - `control-studio/js/runtime/streaming.js`
  - `control-studio/js/runtime/cross_method.js`
  - `control-studio/js/integration/hil_ws.js`
  - `control-studio/js/integration/serial.js`
  - `control-studio/js/integration/opcua.js`
  - `control-studio/js/integration/modbus.js`
  - `control-studio/js/integration/mqtt.js`
  - `control-studio/js/integration/timeseries.js`
  - `control-studio/js/math/lie_derivative.js`
  - `skills/control-studio-mpc-designer/`
  - `skills/control-studio-sysid-planner/`
  - `skills/control-studio-ui-verifier/`
  - `skills/control-studio-deployment-reviewer/`
- 分析模組：
  - `control-studio/js/analysis/time-response.js`
  - `control-studio/js/analysis/frequency-response.js`
  - `control-studio/js/analysis/root-locus.js`
  - `control-studio/js/analysis/equilibrium.js`
  - `control-studio/js/analysis/phase-portrait.js`
- 視覺化編輯器：
  - `control-studio/js/editor/`
- AI 顧問：
  - `workflows/control_advisor_workflow.py`
  - `control-studio/scripts/control_api.py`
  - `control-studio/requirements-api.txt`
- Smoke test：
  - `test_control.js`
- 驗證案例：
  - `docs/src/control-studio/verification.md`
- 開發順序與文件工作流：
  - `control-studio/ROADMAP.md`
- 詳細 task ledger：
  - `docs/src/control-studio/backlog.md`
- Phase 18+ 與技能化規劃：
  - `docs/src/control-studio/skills.md`

### 已完成能力
- SISO 傳遞函數輸入
- SISO State-Space 輸入與 transfer function 轉換
- ZPK 輸入與複數零極點解析
- 離散 Transfer Function，使用 z^-1 係數與 sample time
- Continuous-to-discrete conversion：Tustin / ZOH
- PID 參數調整
- PID presets：Ziegler-Nichols / Cohen-Coon
- Root Locus ultimate gain Ku/Tu 轉 Ziegler-Nichols P / PI / PID
- Lead / Lag 補償器
- Lead / Lag design helper
- Sliding Mode Control baseline：classical、boundary-layer、super-twisting，含 reaching-time guard 與 chattering analysis
- Backstepping baseline：三階 strict-feedback chain / terminal triangular drift、Lyapunov 負定驗證、二階 matched-parameter adaptive update
- Feedback Linearization baseline：numerical Lie derivative、relative degree、I/O linearization、full-state companion form、zero-dynamics warning
- Reset Control baseline：Clegg / FORE reset controller、describing-function phase-margin lift、H-beta feasibility approximation
- Reference Governor baseline：scalar MOAS、online kappa limiting、constraint-preserving setpoint modification
- Closed-loop Identification baseline：direct ARX、indirect closed-loop recovery、joint I/O IV estimate、bias risk diagnostic
- SRIVC Continuous-time Identification baseline：Poisson filter、`identifyCT()` API、clean continuous-time fixture <1% coefficient error
- GP-NARX / Gaussian Process Regression baseline：constant-mean GP、RBF/Matern/periodic kernels、predictive variance 與 95% interval
- Hammerstein / Wiener Identification baseline：飽和 Hammerstein level recovery、Wiener polynomial nonlinearity fit
- MIMO FRF Identification baseline：2x2 frequency-domain LS recovery、coherence、magnitude / phase verification
- MUSIC / ESPRIT spectral subspace：MUSIC pseudospectrum 與 real-signal LS-ESPRIT；ESPRIT 使用一般複數 eigenvalue phase，支援 multi-tone / close-tone deterministic recovery
- Moving Horizon Estimation API baseline：linear constrained MHE wrapper 與 scalar nonlinear grid-search MHE
- Particle Filter API baseline：bootstrap/SIR PF，支援 systematic / multinomial / stratified resampling
- Joint State-Parameter EKF baseline：augmented numerical EKF、state/parameter estimate、rank-deficient warning
- RTS Smoother baseline：Rauch-Tung-Striebel backward pass、covariance non-increase、MSE improvement fixture
- ADMM QP baseline：OSQP-style split、box projection、dense/diagonal solve path
- SQP / Multiple Shooting baseline：merit-function SQP、multiple-shooting continuity residual
- MILP baseline：binary MILP enumeration、knapsack、Held-Karp TSP、infeasible detection
- L-BFGS / Trust Region baseline：compact-memory L-BFGS、trust-region gradient step
- Mixed-Integer MPC baseline：small switched-system enumeration、mode sequence and terminal tracking validation
- Descriptor / QZ baseline：regular/singular descriptor pencil generalized eigenvalues，含 infinite eigenvalue handling
- Krylov baseline：Arnoldi orthonormal basis、restarted GMRES residual verification
- CBF / formal / rare-event verification baseline：double-integrator circular obstacle CBF、finite-trace LTL/CTL、importance sampling Monte Carlo
- Advanced MPC Tier G baseline：chance-constraint tightening、distributed consensus MPC、hybrid MPC wrapper、NMPC warm-start shift-and-extend
- Embedded deployment Tier H baseline：C/C++、Rust、Structured Text、AUTOSAR、FreeRTOS、CRC/watchdog safety wrapper templates
- Runtime architecture Tier I baseline：WASM adapter、async compute worker facade、LRU memoization、streaming computation、cross-method check table
- Hardware / HIL integration Tier J baseline：WebSocket HIL protocol、Serial codecs、OPC UA / Modbus / MQTT facades、InfluxDB / Prometheus query normalization
- Deployment readiness gate：`assessDeploymentReadiness()` 將 codegen / HIL handoff 轉成明確 pass/warn/fail 工程判定，覆蓋 sample time、target artifacts、traceability、WCET/deadline、jitter、fixed-point headroom、safety wrapper 與 HIL schema
- Dynamic D-K baseline：frequency-dependent D profile、log-linear `D(jω)` fit、dynamic D-K wrapper、mu-bound non-worsening fixture
- ADP / reinforcement-learning-for-control baseline：discrete LQR policy iteration and LSTD-Q verification against the DARE-derived optimum
- Distributionally robust optimization baseline：Wasserstein ambiguity upper bound and deterministic scalar quadratic DRO fixtures
- Unknown Input Observer baseline：Darouach full-order UIO with disturbance decoupling, rank condition, and Hurwitz error dynamics verification
- Project-local agent skills：MPC designer、SysID planner、UI verifier、deployment reviewer workflow packages
- Step Response
- Impulse / Ramp / Sine / Square / Pulse response
- Discrete step / impulse response
- Bode Plot
- Discrete Bode Plot
- Nyquist Plot
- Nichols Chart
- Root Locus
- Root Locus break points / jω crossings / branch sorting
- Interactive Root Locus gain picker
- Pole-Zero Map
- z-plane Pole-Zero Map 與 unit-circle stability metrics
- Gain Margin / Phase Margin
- Rise Time / Settling Time / Overshoot / Steady-State Error
- 工程化 Stability Analysis summary：risk level、dominant pole、stability margin、damping ratio、natural frequency、recommendations
- Routh-Hurwitz table
- Closed-loop / open-loop 基本切換
- Closed-loop design assistant：由 overshoot / settling time 推 target poles
- Lead design for target phase margin
- Deadbeat gain design for z-domain
- Advisor / design result apply-back 到 controller
- Direct pole-placement K computation（移除手動 Root Locus 步驟）
- Matrix definiteness / symmetric eigenvalue utilities
- Continuous Lyapunov stability proof：`AᵀP + PA = -Q`
- Lyapunov proof panel：顯示 `V(x)=xᵀPx`、`dV/dt=-xᵀQx`、P matrix、min eig(P)
- Low-order SISO state feedback pole placement（Ackermann）
- Low-order LQR baseline（CARE / Kleinman iteration）
- LQR Q/R tuning panel
- Project save/load
- Session autosave / restore
- Comparison snapshots 與摘要
- Controller comparison table
- JSON / CSV / PNG 匯出
- Markdown report export baseline
- Frontend analysis source toggle：Auto API Fallback / Local JS / FastAPI / Compare Local/API
- API analysis status surface：checking / ok / diff / error
- Regression dashboard command
- Block Diagram Editor 與 diagram save/load、Undo/Redo、Zoom/Pan
- AI 控制器建議
- Unified FastAPI API（analysis + advisor）

### Phase 8 已完成（Observer / Kalman / LQG）
- Luenberger observer pole placement（duality + Ackermann via Aᵀ, Cᵀ）
- 觀測器模擬（plant + observer Euler 積分，含過程/量測噪音注入）
- 穩態 LQE（連續時間 Kalman Filter via duality with LQR）
- Bryson 法則 Q/R 自動建議
- Q/R sensitivity slider（即時看 L_kf 與 observer poles 變化）
- Observer poles 疊加 Pole-Zero Map（紫色菱形）
- Innovation 白噪音統計檢定（mean / std / ACF lag-1,2 / 95% CI / 自動診斷）
- 離散 Kalman Filter（ZOH 離散化 + Riccati 差分方程迭代）
- LQG 整合模擬（FSF 理想全狀態 vs LQG 估測狀態的閉迴路響應對比）

### Phase 9 已完成（MIMO 基礎與設計）
- SISO/MIMO 模式切換（互不干擾，SISO 流程完全不變）
- MIMO State-Space 矩陣輸入（n/m/p 維度，ABCD 矩陣 textarea）
- Channel selector bar（u_j→y_i 個別檢視 + ⊞ All 矩陣全覽）
- RGA（Relative Gain Array）穩態分析 + 配對診斷
- Singular Value Bode（σ_max / σ_min / 條件數 κ）
- Static Decoupler（W = G(0)⁻¹ 自動解耦）
- MIMO LQR（R 為矩陣的 CARE 求解，Newton-Kleinman 迭代）

### Phase 10 ~ Phase 17 已完成（Advanced Control / Product Maturity）
- Phase 10：Schur / Hamiltonian CARE、MPC baseline、Dynamic Decoupler、Robust sensitivity baseline、constraint UI 與高階 CARE hardening
- Phase 11：DARE、MPC terminal cost `P∞`、setpoint tracking、state constraints / soft slack、H∞ norm、dynamic RGA
- Phase 12：robust sensitivity dB-scale visualisation、reference lines、bandwidth、MIMO `||G||∞`
- Phase 13：UI/UX usability overhaul、Quick Start、confirm modal、live validation、keyboard shortcuts、a11y / responsive cleanup
- Phase 14：time delay / Padé / Smith predictor、IMC / SIMC tuning、KaTeX 公式渲染、industrial presets、disk margin、seed control
- Phase 15：ARX system identification、controller A/B compare、MATLAB / Python codegen、root-locus animation
- Phase 16：H∞ mixed-sensitivity PID synthesis helper、GA PID auto-tuner、phase portrait、describing functions、n-dimensional equilibrium classification、nonlinear grid scan guards；Functional Roadmap Tier A 已補 A1~A7 algorithm baseline
- Phase 17：plant-order dynamic H∞ mixed-sensitivity synthesis、structured μ D-scaling upper-bound / DK-style static gain surrogate、MIMO characteristic loci / Gershgorin bands / inverse Nyquist array、MPC MIMO output-space setpoint tracking

### Math Core Hardening 已完成（Post Phase 17）
- `a2a89d3 fix(math): 4 defects in complex / polynomial / realschur`
- Complex magnitude：`Complex.abs()` 改用 `Math.hypot()`，避免極大 / 極小複數 magnitude overflow / underflow。
- Polynomial roots：`rootsToRealPoly()` 由固定 absolute tolerance 改為 best-match + relative tolerance，改善重根與 ill-conditioned complex conjugate pairing。
- Polynomial regression contract：保留 unpaired complex root error message 中的 `conjugate pairs` 關鍵字，避免既有 regression / doctor 對錯誤分類失效。
- Hamiltonian Schur：移除未使用且轉置錯誤的 dead computation，降低 CARE stable-subspace 維護風險。
- Real Schur reorder：修正 `swap1x1Blocks()` Givens rotation 公式、右乘與 Q accumulation 符號，並確保 reordered eigenvalues 反映 post-reordering 順序。
- Full math-core audit：`Complex.div()` 改為 scaled Smith division，避免極端尺度複數除法產生 NaN 或誤判 division by zero。
- Full math-core audit：二階 `polyroots()` 改用 stable quadratic formula，避免 separated roots 因 cancellation 掉成 0。
- Full math-core audit：`matInverse()` / `matSolve()` / `matRank()` / `matIsPositiveDefinite()` 改用相對矩陣尺度 tolerance，避免縮放很小但條件良好的矩陣被誤判 singular、rank deficient 或非正定。
- Full math-core audit：discrete Bode evaluation 改走共用 robust complex division path。
- Full math-core audit：continuous Bode / Nyquist / Nichols / Root Locus / jω crossing grids 加入 finite range 與 sample-count guards，避免非法單點 grid 產生 NaN frequency/gain samples。
- Full math-core audit：continuous Root Locus 與 `stabilityMargins()` 現在會拒絕 finite `sampleTime` 的 discrete transfer function，避免 z-domain 係數被誤用為 s-domain characteristic equation 或 `G(jω)` margin scan；離散系統需使用 z-plane pole analysis 與 discrete frequency response。
- Full math-core audit：discrete Bode grids 加入 finite `samples` 與 `0 < omegaMin < omegaNyquist` guards，zero-magnitude dB 以有限 floor 輸出，避免離散頻域圖表與 API 出現非有限值。
- Full math-core audit：continuous TF / ZPK `dcGain()` 加入 origin pole-zero cancellation limit，`s/s` 回傳 1、extra origin zero 回傳 0、extra origin pole 保留 signed infinity，避免 RGA、static decoupler、low-frequency design 與 robustness summary 被 removable integrator 污染。
- Full math-core audit：discrete TF `dcGain()` 加入 `q=z^-1=1` unit-root cancellation limit，`(1-z^-1)/(1-z^-1)` 回傳 1、extra unit-circle zero 回傳 0、extra unit-circle pole 回傳 Infinity，避免 z-domain step final、C2D DC preservation 與 discrete controller comparison 被 removable unit root 污染。
- Full math-core audit：`DiscreteTransferFunction.poles()` 現在會補上 numerator delay order 大於 denominator order 時的隱含 `z=0` causal delay poles；`num=[0,1], den=[1]` 不再回傳 empty pole set，避免 z-plane map 與 discrete stability summary 漏掉純延遲極點。
- Full math-core audit：`DiscreteTransferFunction` 現在會修剪 numerator / denominator 尾端 structural zeros，同時保留 numerator 前導零作為 real input delay；`num=[1,0,0], den=[1,0]` 不再產生 spurious `z=0` zero/pole，`den=[0,1]` 會明確拒絕為 invalid non-causal denominator。
- Full math-core audit：`DiscreteTransferFunction.parallel()` / `feedback()` 現在使用 `z^-1` delay-polynomial index 對齊加法，避免 mixed-order parallel 或 feedback denominator 被 high-degree polynomial alignment 誤算；feedback path 也會拒絕 sample-time mismatch。
- Full math-core audit：`c2dMatchedZ()` 先保留 continuous leading gain，再用 Discrete TF `dcGain()` low-frequency limit 做 normalization；`2s/s` 這類 removable origin pole-zero 不再因 `z=1` coefficient sums 為 0 而離散成 unity gain。
- Full math-core audit：`c2dMatchedZ()` 現在與 Tustin / ZOH / impulse-invariant 一致拒絕 improper continuous plant，避免 derivative-like 原始模型被靜默離散化成 misleading stable DTF。
- Full math-core audit：`c2dImpulseInvariant()` 現在明確拒絕 repeated poles；`1/(s+1)^2` 不再被 residue loop 靜默跳過成 zero DTF，需改用 ZOH 或 Tustin。
- Full math-core audit：`c2dImpulseInvariant()` 現在限定 strictly proper continuous systems；`(s+2)/(s+1)` 這類 biproper direct-feedthrough impulse 不會被 residue-only DTF path 靜默丟棄，需改用 ZOH 或 Tustin。
- Full math-core audit：`stabilityMargins()` 的 phase margin 改以 unwrapped Bode phase branch 計算；negative low-frequency loop 從 `-180 deg` branch 起算，避免 `L(s)=-2/(s+1)` 這類不穩定 unity-feedback loop 被 principal phase 誤報為高正 PM。
- Full math-core audit：time-response simulation inputs 加入 finite / positivity / properness guards，涵蓋 step / impulse / ramp / sine / square / pulse 的 duration、sampleCount、amplitude、frequency、pulseWidth、disturbance、initialState、improper TF rejection、biproper disturbance feedthrough，以及 PID anti-windup 的 Kp/Ki/Kd/N、saturation bounds、Tt、duration、sampleCount、reference amplitude 與 strictly proper plant requirement。
- Full math-core audit：discrete step / impulse response inputs 加入 sampleCount、amplitude、sampleTime、num/den finite guards，並讓 `den[0] != 1` 的 plain discrete system 走標準差分方程除法，避免 mis-scaled output 或 NaN time grid。
- Full math-core audit：delay / Padé inputs 加入 finite / non-negative guards；`delayMargin()` 對 non-positive phase margin 回傳 0 秒、對 infinite PM 保留 infinite margin，避免已失穩 loop 顯示負 delay capacity。
- Full math-core audit：`stepInfo()` 對 response array shape、finite samples、strictly increasing time grid、finite final/reference value 加入 contract guards，invalid response 會回傳 `valid:false`，避免 NaN 或 malformed trajectory 被誤報成有效 step metrics。
- Full math-core audit：`routhTable()` 對 denominator array、length、finite coefficients、zero polynomial、leading coefficient 加入 contract guards，避免 invalid denominator 被靜默誤報為 stable。
- UI contract audit：runtime UI source 不再以 emoji / pictographic glyphs 表示 button、badge、warning、command palette icon、report cell 或動態 DOM 狀態；`verify_ui_symbol_contract.mjs` 已納入 full suite，避免 `✓/✗/⚠/⚙/📄/🔗` 等字元回歸到可見 UI。
- API contract audit：Unified API / CLI 在 `simulation.mode === "open_loop"` 且存在 controller 時會模擬 `C(s)G(s)`，不再回傳 plant-only time response；impulse/ramp/sine/square/pulse 等非 step waveform 會明確回傳 step metrics `valid:false`；step waveform 會用 `simulation.amplitude` 作為 `stepInfo()` reference，非單位 step 的 SSE 不再固定對 unity 計算；zero-DC-gain 或 zero-amplitude step response 會保留 SSE 但把 normalized rise/settling/overshoot 標為不適用；unstable / unfinished step response 必須有 explicit final value 或 settled tail 才能回報 normalized metrics；fixture/API contract 已擴充至 10/10 cases。
- UI waveform contract audit：Local JS UI 的 sine / square / pulse 現在走 `simulateTimeResponse()`，不再落回 step response；UI、export、parameter sweep 與 report metrics 只在 step input 顯示 step metrics，且使用 configured amplitude 作為 reference。report 產生器也用同一 configured amplitude 產生 step response，避免非單位 step 報告用 unit-step trajectory 對 non-unit reference 算 metrics，並避免 Local JS 與 API 對非單位 step 或 non-step waveform 產生不同結論。
- UI stability snapshot audit：`updateStabilityPanel()` 現在會發布 canonical `_lastStability` 快照；GM canonical 欄位統一為 `gainMarginDB`，`gainMarginDb` 僅作相容 alias。Flow-state、smart warning、summary card 與 report 都透過 helper 正規化 GM；PDF/report 對 infinite GM 會顯示 `∞` 並視為 `> 6 dB` 合格，避免核心 margins 正確但 UI/report 顯示 N/A 或漏掉低 GM 風險。
- UI simulation snapshot audit：active time-domain plot 會發布 `_lastSimResult` 並 emit `simulation:done`，Result Summary、Warnings Panel 與 HIL CSV export 皆讀取同一份已繪製 response；companion charts 不會覆寫主圖快照。snapshot 會保留 `t/y/u`、command input、disturbance input、waveform、domain、loop mode 與 metrics，z-domain discrete step 也走同一契約。Stability / time-metric refresh 也會以 explicit `allowNonChartSnapshot` 發布目前 response，避免使用者停在 Bode / Nyquist / Nichols / Root Locus / Pole-Zero 等非時域圖調參後，下游沿用舊 `_lastSimResult`。DTF/z-domain plant 更新會清掉不相容的 continuous loop/controller state 並重新發布離散 step snapshot；companion discrete step chart 不會覆寫 Bode (DTFT) active header。Runtime mode 現在區分 closed-loop toggle preference 與 effective model，只有實際存在 `state.closedLoop` 時才對 status bar、snapshot、codegen、API payload、comparison/export、AI Advisor 與 smoke state 回報 `closed_loop`。
- UI formula display audit：DTF/z-domain 公式顯示遵守 `DiscreteTransferFunction` 的 `z^-1` convention，plant 與 loop equations 使用 `G(z)` / `L(z)` / `T(z)`，並以 `1 - 0.75z^-1` 這類 delay-polynomial 顯示係數；continuous PID / lead-lag helper 仍維持 `C(s)` / `Cc(s)`，避免把 continuous compensator 誤標為 discrete controller。Active discrete step plot 顯示 legend，smoke diagnostics 在 effective open-loop 模式不再要求 closed-loop formula。
- UI DTF sample-time persistence audit：DTF sample time 會由 `DiscreteTransferFunction.sampleTime` 進入 codegen payload、MATLAB/Python preview/export、analysis JSON/Markdown export、autosave/project file 與 local multi-project save/load；project manager 不再 JSON 化 TF class instance，而是統一使用 `buildProjectPayload()` / `applyProjectPayload()`，避免離散模型載入後退化成 plain object 或回到錯誤 `Ts=0.1`。
- Codegen runtime contract audit：MATLAB / Python export 會依 effective runtime mode 選擇 response target；open-loop 腳本 plot `G` 並保留 `L=C*G` 作 Bode/margin analysis，不再引用未定義的 `T`；closed-loop 腳本才建立並 plot `T`。Python export 不再輸出 JavaScript `true/false` 條件式。z-domain export 會保留 `Ts`，但跳過 continuous PID/L generation，避免將 continuous `C(s)` 與 discrete `G(z)` 混合成不可部署腳本。
- Discrete export response audit：z-domain analysis export 會把 effective `responseType` 與使用者要求的 `requestedResponseType` 分開；目前 discrete export 支援 step / impulse，unsupported waveform 會正規化為 step，避免把 step samples 標成 ramp / sine / pulse。DTF impulse export 會走 `discreteImpulseResponse()`，非 step export 不再輸出有效 rise / settling / overshoot 指標；UI JSON export、CLI 與 Unified API 的 non-finite margin 會以 JSON-safe `null` 搭配 `gainMarginDBStatus` / `phaseMarginStatus` 保留語意，且 Local/API compare 會把 status mismatch 視為真差異，避免 `Infinity` / `NaN` 被靜默折疊成一般缺值。
- Zero-Flaw Loop 10 audit：新增 ADP-PI / LSTD-Q、Wasserstein DRO、Unknown Input Observer 三個理論缺口的 deterministic baseline。ADP policy iteration 會對照 DARE/LQR optimum，LSTD-Q 使用 deterministic off-policy excitation 比對 analytic Q-function matrix，DRO 不再使用 random fixture，UIO 驗證 `rank(C E)=q`、`T E≈0` 與 Hurwitz error dynamics。
- Zero-Flaw Loop 11 audit：修正 LS-ESPRIT 把非對稱 `Phi` 強制對稱化造成的 multi-tone 錯頻。新版以 characteristic polynomial 的一般複數 eigenvalues 取得 conjugate-pair rotation phase；`verify_loop9_modules.mjs` 以 fixed-seed MUSIC noise 及 50/120、80/92、40/135/220 Hz fixtures 驗證，並拒絕 rank-deficient subspace window。
- Zero-Flaw Loop 12 audit：矩陣展開面板改用 `estimateCondition()` 的 `kappa_1=||A||_1||A^-1||_1`，definiteness 僅對 symmetric square matrix 以 eigenvalues 判定；rectangular / non-symmetric matrix 顯示 N/A。另修復新增系統 wizard 僅通知成功但未套用 TF / SS / ZPK 的整合缺口；SS 成功後會發布 A/B/C/D snapshot 供矩陣與 phase-plane 工具使用，matrix parser 也與 UI label 一致支援 newline / semicolon row separators。
- Zero-Flaw Loop 13 audit：P39/P55 Gramian/Hankel 面板統一使用 `gramianDiagnostics()`；continuous realization 解 Lyapunov equations、discrete realization 解 Stein equations，非 Hurwitz/Schur 系統明確拒絕。輸出使用 full Gramian eigenvalues、`kappa_1`、relative equation residual 與 Cholesky-SVD HSV，不再用截斷 impulse sum、continuous `A^k` 累加或 diagonal HSV heuristic。
- Zero-Flaw Loop 14 audit：修正 square-root balanced truncation 的 SVD orientation，使用 `Lo^T Lc=U Sigma V^T` 對應 `T=Lc V Sigma^-1/2` 與 `T^-1=Sigma^-1/2 U^T Lo^T`。`balancedTruncationErrorAudit()` 將 `sigma_(k+1)` 明確定義為 AAK lower bound，另回報 actual BT Hankel error 與 `2 sum sigma_i` H∞ upper bound；舊 `hankelNormApprox()` 只保留為 compatibility alias，不再宣稱 Glover optimal HNA。
- Real Schur symmetric fast path：對 symmetric real matrices 使用 Jacobi orthogonal Schur，修復 3x3 stable real-spectrum reconstruction regression。
- Nonlinear equilibrium classification：`classifyEquilibrium()` 對 n>2 Jacobian 改用 Faddeev-LeVerrier characteristic polynomial + `polyroots()`，避免舊 `trace(A)/n` placeholder 隱藏 saddle / unstable modes。
- Frontend analysis API migration：新 session 預設 `Auto API Fallback`，FastAPI 成功時使用 Unified API metrics，不可用或 z-domain 時明確 fallback Local JS；root `package.json` 已提供 `npm run verify:*` 入口。
- Verification：最新節點已通過 TF / SS / ZPK / C2D 與 PID regression（最新 targeted 基線 `47/47` 與 `21/21`）。

### 尚未完成能力
- Functional Roadmap Tier A-J 已完成 deterministic baseline。
- Full verification suite 已納入 control verification fixtures、FastAPI contract fixtures、runtime UI waveform contract、runtime UI stability snapshot contract、runtime UI simulation snapshot / freshness / discrete-domain / effective-loop contract、runtime UI formula display contract、discrete export response contract、deployment readiness gate、deployment reviewer skill gate、runtime UI symbol contract、n-dimensional equilibrium classification regression 與 Zero-Flaw Loop 1~14；目前基線為 `131/131 scripts pass`，fixture/API contract 為 `10/10 cases pass`。
- Phase 23 ~ Phase 28 舊缺口已同步收斂：continuous-time ID / Hankel norm / LPV synthesis / dynamic D-K / JSDoc API docs 均已有驗證基線。
- CONTSID、full-order dynamic K fitting、industrial-grade μ synthesis backend 仍可作後續研究擴充，但不再列為目前阻塞項。
- 自動產生報告 / 報告模板、Electron packaging、教學模式與 Block Diagram expansion 仍依使用者要求擱置。
- 前端分析流程已切為 `Auto API Fallback` 預設，保留 Local JS / FastAPI / Compare Local/API 手動模式。

## 4. Scope Definition

### MVP 範圍
- SISO Transfer Function
- PID 控制器
- Step Response
- Bode Plot
- Root Locus
- Pole-Zero Map
- Stability Analysis
- PID 參數滑桿調整
- AI Advisor
- 模擬結果匯出
- 離散 SISO baseline
- C2D baseline
- Root Locus 互動設計
- Closed-loop design assistant

### 非 MVP 範圍
- MIMO
- Advanced optimal control
- Robust / MPC
- 教學模式
- 自動報告生成

## 5. User Flow

### MVP 使用流程
1. 建立或開啟控制系統工作台
2. 選擇模型類型（先以 Transfer Function 為主）
3. 輸入系統參數
4. 選擇或設定控制器（先以 PID 為主）
5. 調整控制器參數
6. 執行分析與模擬
7. 檢視 Step / Bode / Root Locus / Pole-Zero
8. 讀取穩定性指標
9. 呼叫 AI Advisor 取得調參建議
10. 匯出結果

### 後續版本流程
- 加入專案儲存/載入
- 比較多組參數結果
- 支援 State-Space 與更完整的 block diagram 建模
- 由規格設計 state feedback / Lyapunov proof / LQR / observer
- 匯出 Markdown / JSON 報告

## 6. System Architecture

### Recommended Architecture
- Frontend: React + TypeScript
- Charting: Plotly
- Backend API: FastAPI
- Numerical Engine: NumPy + SciPy + Python Control Library
- Desktop Packaging: Electron
- Optional acceleration: WebAssembly for selected hot paths

### Current Architecture
- Frontend: static HTML/CSS/JS
- Charting: Plotly CDN
- Static server: Python `http.server`
- Unified API: FastAPI (`control_api.py`)
- AI analysis: `nv-agent` + NVIDIA model routing + unified advisor endpoint
- Numerical engine: local JS implementations，包含 continuous TF/SS/ZPK、discrete TF、C2D、frequency response、root locus、closed-loop design assistant、observer / Kalman / LQG、MIMO analysis/design

### Migration Strategy
1. 先保留現有 `control-studio/` 作為互動原型
2. 將數值核心與 UI state 抽離成明確模組
3. 補 FastAPI API 層，讓前後端責任清楚
4. 視情況把重計算轉到 Python 或 WASM
5. 前端新增 local/API analysis toggle，先比對結果再逐步切換預設路徑

## 7. MVP Backlog

### P0
- Done：補前端錯誤處理與輸入驗證
- Done：補瀏覽器級回歸驗證
- Done：補統一 API 啟動與依賴說明
- Done：補 smoke test 到更多實際使用流程
- Done：補 math core verification runner，獨立驗證 Complex / Polynomial / Matrix / ODE / TF / DTF / State-Space / C2D

### P1
- Done：Controller design presets、Lead/Lag helper、comparison table
- Done：離散系統、C2D、z-plane、discrete Bode
- Done：Root Locus 互動設計、ZN PID from Ku/Tu
- Done：Closed-loop design assistant、Deadbeat gain
- Done：Report export baseline
- Done：Frontend local/API analysis toggle
- Done：API error surface in UI
- Done：Regression dashboard command

### P2
- Done：State Feedback / Lyapunov Stability Analysis / LQR scaffold
- Done：Observer / Kalman / LQG
- Done：MIMO 基礎（mode toggle / channel selector / matrix grid）
- Done：MIMO Analysis（RGA / Singular Value Bode）
- Done：MIMO Design（Static Decoupler / MIMO LQR）
- Paused：更完整 block editor 同步分析
- Done：MPC / Robust Control（Phase 10+ 已完成 baseline、UI 入口與 deterministic verification）

## 8. UI Plan

### MVP 頁面
- Dashboard
  - 系統輸入面板
  - 控制器面板
  - 穩定性面板
  - 主圖切換區與 comparison 區
- Block Diagram Editor
- AI Advisor Panel
- Project / Export 工具列

### Future UI
- Result Comparison View
- Project Manager
- Report Export Dialog
- Teaching Mode Overlay

## 9. API Plan

目前已實作的 API：

- `GET /health`
- `POST /api/control/system/response`
- `POST /api/control/system/stability`
- `POST /api/control/advisor`

後續可擴充的 API：

- `POST /api/control/system/analyze`
- `POST /api/control/system/step`
- `POST /api/control/system/bode`
- `POST /api/control/system/root-locus`
- `POST /api/control/system/stability`
- `POST /api/control/controller/pid/tune`
- `POST /api/control/export`
- `POST /api/control/advisor`

輸入格式先統一使用 JSON，核心欄位至少包含：
- `system.type`
- `system.num`
- `system.den`
- `controller.type`
- `controller.params`
- `simulation.mode`
- `simulation.input`
- `simulation.duration`

## 10. Data Model

建議的資料模型：

```json
{
  "projectId": "uuid",
  "name": "motor-speed-control",
  "system": {
    "type": "transfer_function",
    "continuous": true,
    "num": [1],
    "den": [1, 3, 2]
  },
  "controller": {
    "type": "pid",
    "kp": 1.0,
    "ki": 0.5,
    "kd": 0.1
  },
  "simulation": {
    "mode": "closed_loop",
    "input": "step",
    "duration": 10.0
  }
}
```

## 11. Development Roadmap

### Stage 0: Stabilize Current Prototype
- 整理現有結構與文件
- 確立啟動方式
- 完成 smoke tests
- 完成 MVP 邊界定義
- Status: Done

### Stage 1: Complete MVP
- 補輸入驗證
- 讓 AI advisor 與前端互動更穩定
- 補統一 API 的實際操作與回歸驗證
- Status: Done

### Stage 2: Engineering Expansion
- FastAPI service layer
- 前端分析 API 化（Local JS / FastAPI / Compare Local/API toggle）
- Report export baseline
- Regression dashboard command
- Better block diagram syncing（暫時擱置，待 SISO 進階控制穩定後再恢復）
- Status: Done

### Stage 3: Advanced Control
- Done：Lyapunov Stability Analysis
- Done：Low-order State Feedback / Pole Placement
- Done：Low-order LQR baseline / Q-R tuning
- Done：Observer / Kalman / LQG
- Done：MIMO 基礎 + RGA / SV Bode + Decoupler + MIMO LQR
- Done：Phase 0~9 通盤數學理論完善度檢查與 hardening
- Done：所有數學核心通盤檢查與 hardening：修正 high-order polynomial roots、RK45 Dormand-Prince 權重、TF/DTF zero-denominator guard
- Done：MPC / Robust Control（Phase 10~24 已補 MPC / Robust / H∞ / D-K / Tube / EMPC / Explicit MPC deterministic baselines）
- Status: Done

### Phase 7 Theory Track
- Done：Matrix definiteness utilities：symmetric、positive definite、min eigenvalue checks。
- Done：Lyapunov Stability Analysis：支援 continuous-time low-order State-Space，預設 `Q=I`，求解 `AᵀP + PA = -Q`。
- Done：Lyapunov UI proof panel：顯示 `V(x)=xᵀPx`、`dV/dt=-xᵀQx`、P matrix、min eig(P)、Proven Stable / Failed。
- Done：State Feedback：SISO / low-order pole placement，包含 controllability guard。
- Done：LQR：2x2 / low-order CARE baseline，並提供 Q/R tuning panel。
- Verification：`test_control.js` 已新增手推等價案例，覆蓋 Lyapunov、Pole Placement、LQR；並補 continuous LQR stabilizing initial gain、controllability rank、closed-loop Lyapunov stability 診斷。

### Phase 8 Observer / Kalman / LQG Track
- Done：Luenberger observer via duality（`placeStateFeedback(Aᵀ, Cᵀ, poles)` → L = Kᵀ），含 observability rank guard。
- Done：Observer 模擬 Euler 積分，含 plant + observer 同步、過程/量測噪音注入、eNorm 收斂指標。
- Done：穩態 LQE（連續時間 Kalman），dual of LQR，求解 filter CARE `A·Pe + Pe·Aᵀ − Pe·Cᵀ·Rn⁻¹·C·Pe + Qn = 0`。
- Done：Bryson 法則自動建議 Q/R（`Q_ii = 1/δᵢ²`, `R_jj = 1/δ_y²`）。
- Done：Q/R sensitivity slider（即時掃 ×0.001 ~ ×1000 看 L_kf / observer poles 變化）。
- Done：Observer poles 疊加 Pole-Zero Map（紫色菱形 ◆，自動更新）。
- Done：Innovation 白噪音統計（mean / std / ACF lag-1,2 vs ±1.96/√N 95% CI，自動診斷 KF tuning 品質）。
- Done：離散 Kalman（ZOH 離散化 + Riccati 差分方程迭代，回傳 L_kf[d] 與 z-plane observer poles）。
- Done：LQG 模擬（FSF 理想全狀態回授 vs LQG 估測狀態回授兩條響應曲線 + 控制力對比）。
- Verification：`test_control.js` 覆蓋 Luenberger pole placement、Kalman LQE stability、observer 收斂、innovation 統計、LQG 穩態誤差；並補 observability rank guard、continuous LQE stabilizing branch、discrete Kalman `Rd > 0` 與 undetectable failure guard。

### Phase 9 MIMO Track
- Done：SISO/MIMO 模式切換（toggle 在 System 面板頂部，SISO 流程完全不變）。
- Done：MIMO State-Space 矩陣輸入 UI（n × m × p 維度，A/B/C/D textarea，dimension 驗證）。
- Done：MIMOStateSpace 類別與 `channelTF(i, j)`、`allChannels()`、`dcGain()`。
- Done：Channel selector bar（u_j → y_i 個別檢視，重用全部 6 個 SISO plot tabs）。
- Done：⊞ All view（p × m 小格全覽 step response，直觀看出耦合）。
- Done：RGA 穩態分析（`G(0) ⊗ G(0)⁻ᵀ`）+ 配對診斷（good / caution / warn / bad）+ swap 建議。
- Done：Singular Value Bode（σ_max / σ_min vs 頻率，log-log 軸 + 條件數 κ）。
- Done：Static Decoupler（W = G(0)⁻¹，套用後 B' = B·W 寫回系統）。
- Done：MIMO LQR（R 為 m×m 矩陣的 CARE 求解，Newton-Kleinman 迭代）。
- Verification：`test_control.js` 覆蓋 MIMO 維度驗證、RGA invariants、3x3 complex singular values、decoupler 後 RGA = I、MIMO LQR stable/unstable analytic cases、underactuated unstable guard。

### Phase 10 Advanced Control Reliability Track
- Done：Phase 10 設計文件：`CONTROL_SYSTEM_PHASE10_PLAN.md`，明確排除教學模式 / Electron / 報告模板。
- Done：Schur / Hamiltonian CARE solver：`solveCareHamiltonianSchur(A,B,Q,R)`，以 Hamiltonian stable invariant subspace 求解 CARE。
- Done：`solveLqr()` / `solveLqrMIMO()` 優先使用 Hamiltonian CARE，失敗時才 fallback 到 Newton-Kleinman。
- Done：Spacecraft marginally stable MIMO case 可由 Hamiltonian CARE 直接得到 stabilizing LQR，補上 Bass 法無法處理 sparse rank-2 actuation 的缺口。
- Done：MPC baseline（discrete finite-horizon / unconstrained receding-horizon），包含 first action 與 closed-loop simulation helper。
- Done：Dynamic Decoupler prototype：selected-frequency `W(jωc)=G(jωc)⁻¹`，回傳 complex verification matrix 與 residual。
- Done：Robust sensitivity baseline：`S=1/(1+L)`、`T=L/(1+L)`、`KS=K/(1+L)` 與 peak sensitivity risk。
- Done：Robust edge-case fixtures / gain-phase uncertainty sweep。
- Paused：教學模式 / Electron / 報告模板 / Block Diagram expansion。
- Verification：`test_control.js` 覆蓋 Hamiltonian CARE analytic cases、MIMO diagonal analytic case、Spacecraft marginally stable case、MPC scalar Riccati hand derivation、Dynamic Decoupler selected-frequency inverse、Robust `S/T/KS` identity、CARE residual 與 closed-loop Lyapunov proof。

### Phase 12 ~ Phase 17 Feature Track
- Done：Phase 12 robust visualisation — `H∞ Norms` dB chart、0 / 5.1 / 8 dB reference lines、bandwidth metric、MIMO `||G||∞` 曲線。
- Done：Phase 13 UI/UX overhaul — collapsible sections、Quick Start modal、confirm modal、field-level validation hints、keyboard shortcuts、accessibility / responsive cleanup。
- Done：Phase 14 delay / formula / industrial tuning — Padé delay、delay margin、Smith predictor、IMC / SIMC tuning、KaTeX、28 presets、disk margin、seedable RNG、delay input / margin guards。
- Done：Phase 15 workflow tooling — ARX identification、open-loop A/B Bode compare、MATLAB / Python code export、root-locus K-sweep animation。
- Done：Phase 16 advanced synthesis / nonlinear entry points — mixed-sensitivity PID tuning、GA PID auto-tuner、2D phase portrait、describing functions、n-dimensional equilibrium classification、nonlinear grid scan guards。
- Done：Phase 17 advanced robust / MIMO / MPC extensions — plant-order dynamic H∞ mixed-sensitivity synthesis、structured μ D-scaling upper-bound、DK-style static gain surrogate、characteristic loci、Gershgorin bands、inverse Nyquist array、MIMO output-space MPC tracking。
- Done：Post Phase 17 math hardening — complex magnitude robustness、ill-conditioned polynomial conjugate pairing、Hamiltonian stable-subspace cleanup、real Schur block reorder correctness。
- Done：Full math-core / UI/API-contract audit hardening — robust complex division、stable quadratic roots、scale-aware matrix inverse/solve/rank/PD checks、discrete frequency response division unification、continuous frequency/root-locus grid guards、continuous-analysis domain guards、continuous frequency/robust domain guards、P41 discretization comparison API-contract repair、runtime UI symbol contract enforcement、UI waveform response/metrics contract、UI stability snapshot contract、UI simulation snapshot/HIL export/freshness/discrete-domain/effective-loop contract、UI formula display contract、API open-loop controller cascade response contract、non-step response metrics gating、step amplitude metrics reference contract、zero-final-change step metrics rejection、divergent/unfinished step metrics rejection、discrete Bode grid guards、continuous/ZPK DC gain origin-cancellation guards、discrete DC gain unit-root guards、discrete delay pole guards、discrete delay polynomial normalization guards、discrete interconnection alignment guards、matched-z removable-origin gain normalization guards、matched-z properness guards、impulse-invariant repeated-pole guards、impulse-invariant direct-feedthrough guards、negative-loop phase-margin branch guards、time-response input/properness guards、discrete response input guards、delay margin guards、step metrics contract guards、Routh-Hurwitz input guards。
- Done：Nonlinear equilibrium audit hardening — n>2 Jacobian eigenvalue classification now uses characteristic polynomial roots instead of trace-average placeholder；`scanEquilibria()` / `phasePortrait()` now validate grid size and finite bounds, and `gridSize=1` uses the bounds-center seed instead of NaN；`verify_equilibrium_nd.mjs` covers 7 regression checks including 3D saddle, 4D stable-node, 3D unstable-spiral, 3D affine equilibrium convergence, center-seed behavior, and invalid-grid rejection.
- Verification：
  - `npm run verify:p14`
  - `npm run verify:p15`
  - `npm run verify:p16`
  - `npm run verify:p17`
  - `node control-studio/scripts/verify_equilibrium_nd.mjs`
  - `npm run verify:all`

### Phase 18+ Research / Engineering Extension Track
- Done：Phase 18 uncertainty + Monte Carlo robust validation — uncertainty schema、deterministic Monte Carlo sampling、worst-case metrics、robust pass/fail、`verify:p18` regression、Robust Validation UI、`control-studio-robust-validator` skill baseline。
- Done：Phase 19 H∞ Riccati synthesis — Glover-Doyle γ-iteration、generalized plant construction、dual CARE solver with sign-diagonal + Real Schur fallback、controller SS→TF conversion、`verify_p19_hinf_riccati.mjs` 32 checks。已知限制：SISO 1st-order Y∞ CARE 在退化 Hamiltonian 下殘差較高（結構性限制），但 controller 仍穩定。
- Done：Phase 20 MIMO MPC engineering workflow — offset-free tracking、move suppression、feasibility diagnostics、constraint handling，詳見 `verify_p20_mpc_engineering.mjs`。
- Done：Phase 21 research-grade system identification — ARMAX / OE / BJ / subspace ID、experiment design、residual validation、uncertainty export，詳見 `verify_p21_sysid_advanced.mjs`。
- Done：Phase 22 benchmark + cross-tool validation — full verification runner、cross-tool comparison、CI workflow、benchmark script。
- Done：Phase 23 agentic / SysID gap closure — structured review skills、FRF estimation、model order selection、MISO ARX、SRIVC `identifyCT()` baseline，以及 Functional Roadmap B4 GP regression、B5 Hammerstein/Wiener、B6 MIMO FRF identification baseline；CONTSID 仍可作後續研究擴充。
- Done：Phase 24 advanced MPC — NMPC、EMPC、Tube MPC、Explicit MPC，含 `verify_p24_nmpc.mjs`、`verify_p24_empc.mjs`、`verify_p24_tube_explicit_mpc.mjs`。
- Done：Phase 25 model order reduction — balanced truncation、SS minreal、Hankel metrics 與 balanced-truncation error audit 已提交；Glover optimal HNA 尚未實作，且不再由 API 誤稱已完成。
- Done：Phase 26 nonlinear control — gain-scheduled PID、sliding mode control、LPV synthesis 已提交。
- Done：Phase 27 H∞ design extensions — MIMO H∞ verification、loop-shaping H∞、static/dynamic D-K baseline 已提交。
- Done：Phase 28 infrastructure quality — TypeScript definitions、benchmark script、JSDoc API docs 已提交。
- Done：Phase 76 deployment readiness productization — `assessDeploymentReadiness()` 以 sample time、target artifacts、WCET/deadline、jitter、fixed-point headroom、safety wrapper 與 HIL schema 產生 ready / conditional / blocked 判定，詳見 `verify_p76_deployment_readiness.mjs`。
- Done：Phase 77 deployment reviewer skill — `skills/control-studio-deployment-reviewer/` 將 codegen / HIL deployment review 固定為可重用 agent workflow，包含輸入證據、blocked / conditional / ready 判定、required actions、sample input/output 與 `verify_p77_deployment_skill.mjs`。
- Done：Zero-Flaw Loop 11 spectral subspace correctness — `espritFrequencies()` 以一般複數 eigenvalue phase 取代 symmetricized-Phi heuristic，補 noiseless/noisy/close-tone/three-tone deterministic fixtures 與 verification Case 12。
- Done：Zero-Flaw Loop 12 matrix diagnostics and wizard integration — true 1-norm condition number、symmetric eigenvalue definiteness、rectangular/non-symmetric N/A semantics，以及 TF/SS/ZPK wizard 到 active workspace 的完整操作路徑；P43/P46/E7 runners 與 verification Case 13 覆蓋。
- Done：Zero-Flaw Loop 13 exact Gramian/HSV diagnostics — shared continuous Lyapunov / discrete Stein solve、Hurwitz/Schur guard、equation residual、true `kappa_1` 與 full-coupling Cholesky-SVD HSV；P39/P55 runners、verification Case 14 與 browser walkthrough 覆蓋。
- Done：Zero-Flaw Loop 14 balanced reduction theory contract — corrected square-root SVD orientation、AAK lower-bound / BT H∞ upper-bound semantics、explicit non-optimal metadata、compatibility alias；P25 runners與 verification Case 15 覆蓋。
- Done：Math-core audit round 2 — 三項修正：(A1) `stabilityMargins()` 改為收集所有增益/相位交越點，回傳最壞情況 PM/GM，修正非最小相位系統只回傳第一個交越的問題；(A2) `matDet()` 加入 `_matDetLU()` fallback，n>6 改用 O(n³) LU 消去而非 O(n!) 餘因子遞迴，並補 n=3 Sarrus 閉合公式；(A3) `sortRootLocusBranches()` 改用 Jonker-Volgenant O(n³) Hungarian 最優分配，取代 greedy nearest-neighbor，消除根軌跡分支在實軸附近交越時的視覺錯位。verify baseline 升至 82/82。
- Execution roadmap：詳細執行看板與文件工作流以 `control-studio/ROADMAP.md` 為準；本文件保留產品/架構層級摘要。

### Stage 4: Productization
- Paused：Electron desktop packaging
- Done：Cloud deployment baseline（GitHub Pages workflow `deploy.yml` 發布 `control-studio/` 靜態工作台）
- Done：Deployment readiness gate（codegen + HIL + timing + fixed-point + safety audit）
- Done：Deployment reviewer skill（codegen / HIL release evidence workflow）
- Paused：Teaching mode
- Paused：Report generation / report template

## 12. Technical Risks

- 目前大量數值核心在前端 JS，正確性驗證成本高
- Root Locus / Nyquist / State-Space 若持續手刻，維護成本會快速上升
- MIMO 與進階控制功能會讓資料模型與 UI 複雜度大幅增加
- AI advisor 若沒有結構化輸入與安全邊界，容易出現不穩定建議
- 如果不及早整理 API 與資料模型，後續從 PoC 過渡到產品會很痛

## 13. Rules For Future Agents

後續 agent 在開發控制系統相關功能時，請遵守：

1. 先讀本文件，再動手修改控制系統相關檔案。
2. 若修改數值核心、API 分析輸出或穩定性指標，需對照 `docs/src/control-studio/verification.md` 的案例與數學推導。
3. 後續開發順序以 `control-studio/ROADMAP.md` 為準；詳細 task ledger 再對照 `docs/src/control-studio/backlog.md`。
4. 目前非 paused roadmap 已到 131/131 verification baseline，fixture/API contract 已到 10/10，Zero-Flaw Loop 已完成 1~14；若啟動下一階段，先更新 `control-studio/ROADMAP.md`，再同步 `docs/src/control-studio/backlog.md` 與 `docs/src/control-studio/skills.md` 的範圍、技能邊界與驗證基線。
5. 若新增控制系統分析功能，必須補：
   - 文件
   - 至少一個 smoke test 或驗證流程
   - UI 對應入口（若屬使用者可見功能）
6. 若引入新模型類型或新控制器類型，先更新資料模型與輸入格式，再補 UI。
7. 每次完成控制系統功能、數學核心修復、UI 行為調整或驗證補強後，必須同步文件狀態，再做 git checkpoint；至少檢查 `control-studio/ROADMAP.md`、`docs/src/control-studio/plan.md`、`docs/src/control-studio/backlog.md`、`docs/src/control-studio/verification.md`、`docs/src/control-studio/scenarios.md`、`docs/src/agents/continuation.md` 是否需要更新。
8. 若新增 workflow 或控制系統相關 CLI 能力，需同步更新：
   - `README.md`
   - `docs/src/agents/workflows.md`
   - `docs/src/agents/continuation.md`
   - `scripts/validate_nvidia_model_selector.sh`
9. 若要從靜態前端遷移到 React/FastAPI，不要一次重寫全部；用增量替換策略。
