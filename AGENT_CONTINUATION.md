# Agent Continuation

此文件用於 usage 即將耗盡、切換 agent、或中斷後續接手。不要使用 `.agent-handoff.md`。

## 專案根目錄
`/Users/w.rc/nvdiaOSsupport`

## 目前狀態
- 已建立獨立 git repo，避免被 `/Users/w.rc` 外層 git 混入。
- 控制系統目前同步基線：
  - Branch: `main`
  - Latest active line: `c5db6cf feat(ui): P50 — E1~E4 dashboard/scoring/report/decision-log`
  - Full phase audit checkpoints:
    - `7a318b3 fix(control): harden phase 7-9 theory diagnostics`
    - `46e20da fix(control): harden phase 0-6 theory checks`
  - 近期主線已接續完成 Phase 12 ~ Phase 17；目前 codebase 已包含 H∞ 視覺化與 MIMO `||G||∞`、大幅 UI/UX 改版、time delay / IMC / disk margin / LaTeX、ARX system ID / A-B compare / codegen / root-locus animation、H∞ mixed-sensitivity PID synthesis / GA PID auto-tuner / phase portrait / describing functions，以及 Phase 17 的 plant-order dynamic H∞、structured μ、MIMO frequency-domain diagnostics、MPC MIMO output tracking。
  - Post Phase 17 最新數學核心 hardening：`a2a89d3` 修正 `complex.js` magnitude overflow/underflow 風險、`polynomial.js` ill-conditioned conjugate root pairing、`realschur.js` Hamiltonian dead computation 與 real Schur 1x1 block swap / eigenvalue order 問題。
  - 本輪文件同步時同步修正 `rootsToRealPoly()` unpaired complex root error message，保留 `conjugate pairs` regression contract，讓 `./nv-agent doctor` / `test_control.js` 可正確分類錯誤。
  - 2026-05-22 UI/UX 計畫 P1 foundation 已開始落地：全域狀態列、toast notification infrastructure、empty-state action style、Share/Theme/Project/Compare 高頻動作通知，新增 `verify_p35_uiux_foundation.mjs` 並納入 `run_all_verify.sh`。
  - 2026-05-23 UI/UX 計畫已推進到 P50：P35~P44 完成 P1/P2，P45~P50 完成 P3 的 D3/B4、B5/B2、C1/C4、A3、C3、E1~E4 dashboard/scoring/report/decision-log；`run_all_verify.sh` 最新基線為 65/65 scripts pass。
- 已完成 NVIDIA Build Models 資料集中管理。
- 已新增 agent 入口文件：
  - `AGENTS.md`：專案規則、標準流程、擴充規則與品質判準。
  - `AGENT_USAGE.md`：CLI 操作、選型、執行、評估與擴充手冊。
- 已建立可用 skill 原始碼：
  - `skills/nvidia-model-selector/SKILL.md`
  - `skills/nvidia-model-selector/references/model-categories.md`
  - `skills/nvidia-model-selector/references/operational-guide.md`
  - `skills/nvidia-model-selector/references/inventory.csv`
  - `skills/nvidia-model-selector/scripts/search_models.py`
- 已建立可執行 workflow：
  - `workflows/rag_workflow.py`
  - `workflows/ocr_rag_workflow.py`
  - `workflows/safety_guard_workflow.py`
  - `workflows/image_generation_workflow.py`
  - `workflows/cuopt_demo_workflow.py`
  - `workflows/control_advisor_workflow.py`
  - `data/sample_kb.txt`
  - `data/cuopt_sample_problem.json`
  - `.env.example`
  - `RUNNABLE_WORKFLOWS.md`
- 已建立控制系統工作台：
  - `control-studio/index.html`
  - `control-studio/js/`
  - `control-studio/scripts/control_api.py`
  - `control-studio/requirements-api.txt`
  - `test_control.js`
  - `CONTROL_SYSTEM_PLAN.md`
  - `CONTROL_SYSTEM_VERIFICATION_CASES.md`
  - `CONTROL_SYSTEM_BACKLOG.md`
  - `CONTROL_SYSTEM_SCENARIOS.md`
  - `CONTROL_SYSTEM_PHASE10_PLAN.md`
  - `CONTROL_SYSTEM_SKILLS_PLAN.md`
- 控制系統目前 phase 狀態：
  - Phase 0 ~ Phase 9：Done
  - Phase 10：Done
    - Done：Phase 10 design baseline
    - Done：Schur / Hamiltonian CARE solver
    - Done：MPC baseline
    - Done：Dynamic Decoupler prototype
    - Done：Robust sensitivity baseline
    - Done：MPC UI panel / Robust sensitivity UI / Dynamic Decoupler UI
    - Done：gain/phase uncertainty envelope
    - Done：MPC box constraints + state constraints / soft slack
    - Done：Scenario 5 MPC / Robust UI walkthrough
    - Done：Scenario 6 SISO / MIMO UI walkthrough 與 UI cleanup
  - Phase 11：Done
    - Done：DARE solver via symplectic Cayley + matrix sign
    - Done：MPC terminal cost `P∞`
    - Done：MPC setpoint tracking（constant / time-varying reference）
    - Done：H∞ norm estimation
    - Done：Dynamic RGA `Λ(jω)`
    - Done：`verify:all` 納入 phase11 驗證
    - Paused：Teaching Mode / Electron / Report Template / Block Diagram expansion
  - Phase 12：Done
    - Done：Robust sensitivity 圖改為 dB 尺度與 reference lines
    - Done：bandwidth 指標與 MIMO `||G||∞` 視覺化
    - Done：`H∞ Norms` UI 區塊整併
  - Phase 13：Done
    - Done：sidebar / tab / section / modal / validation hint 的 UI/UX overhaul
    - Done：Quick Start modal（8 presets）與 keyboard shortcuts
    - Done：destructive action confirm、live field validation、accessibility / responsive cleanup
  - Phase 14：Done
    - Done：time delay / Padé / delay margin / Smith predictor baseline
    - Done：IMC / SIMC PID tuning
    - Done：KaTeX LaTeX rendering 與 28 個 industrial presets
    - Done：disk margin / additive uncertainty
    - Done：seedable RNG 與 LQG random-seed control
  - Phase 15：Done
    - Done：ARX system identification（含 auto order）
    - Done：controller A/B compare（含 open-loop Bode overlay）
    - Done：MATLAB / Python codegen
    - Done：root locus K-sweep animation
  - Phase 16：Done
    - Done：H∞ mixed-sensitivity PID synthesis helper
    - Done：GA-based PID auto-tuner
    - Done：2D phase portrait
    - Done：describing functions（saturation / relay / dead-zone）
  - Phase 17：Done
    - Done：plant-order dynamic H∞ mixed-sensitivity synthesis
    - Done：structured μ D-scaling upper-bound
    - Done：DK-style static gain robust design surrogate
    - Done：MIMO characteristic loci / Gershgorin bands / inverse Nyquist array
    - Done：MPC MIMO output-space setpoint tracking
  - Post Phase 17 Math Core Hardening：Done
    - Done：`Complex.abs()` 使用 `Math.hypot()` 避免極端尺度 overflow / underflow。
    - Done：`Complex.div()` 使用 scaled Smith division，避免極大尺度除法 NaN 與極小尺度 divisor 被誤判 zero。
    - Done：`rootsToRealPoly()` 改為 best-match + relative tolerance，改善重根與 ill-conditioned roots。
    - Done：`rootsToRealPoly()` unpaired complex root error 保留 `conjugate pairs` wording，維持 regression 相容性。
    - Done：二階 `polyroots()` 改為 stable quadratic formula，保留 separated roots 的小根。
    - Done：`matInverse()` / `matSolve()` / `matRank()` / `matIsPositiveDefinite()` 改用相對尺度 tolerance，避免縮放很小但條件良好的矩陣被誤判。
    - Done：discrete frequency response 改用共用 robust complex division。
    - Done：Hamiltonian stable subspace 清除未使用且轉置錯誤的 dead computation。
    - Done：real Schur 1x1 block swap 修正 Givens rotation 公式、乘法方向 / 符號與 reordered eigenvalue 回傳順序。
  - Phase 18+ Research / Engineering Extension：Active through P28
    - Done：Phase 18 uncertainty + Monte Carlo robust validation。
    - Done：Phase 18 core API in `control-studio/js/control/robust.js`，包含 uncertainty schema、deterministic Monte Carlo sampling、worst-case metrics、robust pass/fail 與 unstable sample classification。
    - Done：`control-studio/scripts/verify_p18_robust_validation.mjs` 與 `npm run verify:p18`。
    - Done：`skills/control-studio-robust-validator/` skill baseline。
    - Done：`skills/control-studio-system-auditor/` 與 `skills/control-studio-benchmark-author/` skill baseline。
    - Done：Robust Validation UI panel，接上 Phase 18 core；Playwright/Chrome walkthrough 已確認 button/output/chart。
    - Done：Phase 19 H∞ Riccati synthesis baseline；full D-K iteration 仍列為 P27 gap。
    - Done：Phase 20 MIMO MPC engineering workflow，含 offset-free tracking、move suppression、constraints、feasibility diagnostics。
    - Done：Phase 21 research-grade system identification，含 ARMAX / OE / BJ / subspace ID、experiment design、residual validation、uncertainty export。
    - Done：Phase 22 benchmark + cross-tool validation，含 CI、cross-tool comparison、full verification runner、benchmark script。
    - Mostly Done：Phase 23 agentic / SysID gap closure；FRF、model order、MISO ARX 已提交，CONTSID / SRIVC 尚未提交。
    - Done：Phase 24 advanced MPC；NMPC、EMPC、Tube MPC、Explicit MPC 已提交，含 deterministic regression runners。
    - Mostly Done：Phase 25 model order reduction；balanced truncation / SS minreal 已提交，Hankel norm approximation 尚未提交。
    - Mostly Done：Phase 26 nonlinear control；gain-scheduled PID / SMC 已提交，LPV synthesis 尚未提交。
    - Mostly Done：Phase 27 H∞ design extensions；MIMO H∞ verification / loop-shaping H∞ 已提交，full D-K iteration 尚未提交。
    - Mostly Done：Phase 28 infrastructure quality；TypeScript definitions / benchmark 已提交，JSDoc API docs 尚未提交。
    - 主執行看板：`control-studio/ROADMAP.md`。若 phase status、下一步順序或 dirty worktree 分類改變，先更新 roadmap，再同步 backlog / plan / skills / scenarios / verification cases / continuation。
    - Skill plan：`CONTROL_SYSTEM_SKILLS_PLAN.md` 已規劃 `control-studio-robust-validator`、`control-studio-system-auditor`、`control-studio-benchmark-author`、`control-studio-mpc-designer`、`control-studio-sysid-planner` 等候選 skill。
  - Block Diagram expansion：Paused
  - Phase 0 ~ Phase 28 已完成一次文件進度對齊。後續若修改數值核心，至少依 roadmap 對應 phase 重跑 targeted verify、`npm run verify:all`、`node test_control.js`、`node control-studio/scripts/control_regression_dashboard.mjs`。
- 已建立 symlink：
  - `/Users/w.rc/.config/agents/skills/nvidia-model-selector`
  - 指向 `/Users/w.rc/nvdiaOSsupport/skills/nvidia-model-selector`
- 已建立整合 CLI：
  - `/Users/w.rc/nvdiaOSsupport/nv-agent`
  - `search`：查本地 inventory
  - `advise` / `request`：做選型提問
  - `plan`：依 task profile 產生多階段計畫與候選模型
  - `run-plan`：執行計畫並寫入 run manifest
  - `eval`：對 run manifest 做基本品質檢查
  - `run`：執行各 runnable workflow
  - `doctor`：跑整體驗證
- 已建立架構設定：
  - `configs/model_registry.json`
  - `configs/task_profiles.json`
- 已建立 runtime router：
  - `workflows/common.py` 會從 `configs/model_registry.json` 解析 role、model id、endpoint type、endpoint url。
  - `./nv-agent plan --select-model ROLE=MODEL_ID` 可讓 Agent 指定每個任務單元的模型來源。
  - `./nv-agent run-plan --select-model ROLE=MODEL_ID ...` 可在執行前覆蓋來源。
  - image / safety / cuOpt workflow 已支援 registry endpoint source 與 CLI 覆蓋。
  - control-advisor workflow 已接入 `control_expert` role。

## Git Checkpoints
- `338986f docs(nvidia): baseline model inventory and skill plan`
- `ce335b3 feat(skill): add nvidia model selector`
- `374f2c2 docs(agent): add continuation and validation workflow`
- `5c05766 feat(workflow): add runnable nvidia rag flow`
- `7160ebd fix(workflow): use shared key with runnable defaults`
- `772abef feat(workflow): add safety guard flow`
- `0b52114 feat(workflow): add image generation flow`
- `1e66585 feat(workflow): add cuopt demo flow`
- `438ce9b feat(workflow): add ocr rag flow`

## 接手第一步
```bash
cd /Users/w.rc/nvdiaOSsupport
git status --short
cat AGENTS.md
cat AGENT_USAGE.md
git log --oneline -5
./scripts/validate_nvidia_model_selector.sh
```

## Git 維護提醒
- 控制系統開發必須持續用 git 維護；每完成一批功能、修正、或驗證補強，就立刻 commit，不要讓 `control-studio/` 與 `test_control.js` 長時間停留在未提交狀態。
- 控制系統 commit 請帶 phase / scope，例如 `feat(phase9): ...`、`fix(phase9): ...`、`test(phase9): ...`、`docs(control): ...`。
- 控制系統 checkpoint 前必須同步文件：若本輪改到功能範圍、數學核心、UI 行為、驗證覆蓋或已知限制，先更新 `control-studio/ROADMAP.md`，再同步 `CONTROL_SYSTEM_PLAN.md` / backlog / scenarios / verification cases / 本文件中相符項目，再 commit。
- 在切換 agent 前，若本輪有控制系統改動，先確認至少有一個可回溯的 git checkpoint。

## 已驗證
- `bge-m3` model search works.
- `Embedding API` service search works.
- `OCR` JSON search works.
- `search_models.py` compiles with Python 3.13.
- `rag_workflow.py` compiles with Python 3.13.
- 預設 `.env` / `.env.example` 現在使用已實測可跑的 `nvidia/nv-embed-v1` + `meta/llama-3.1-8b-instruct`。
- `safety_guard_workflow.py` 已實測 safe / unsafe 兩種 prompt。
- `image_generation_workflow.py` 已實測可生成 PNG 到 `outputs/images/`。
- `cuopt_demo_workflow.py` 已實測 validator 與 optimized routing。
- `ocr_rag_workflow.py` 已實測 OCR 抽取與後續問答。
- `nv-agent workflows`、`nv-agent search`、`nv-agent advise`、`nv-agent run rag` 已實測。
- `nv-agent plan`、`nv-agent run-plan`、`nv-agent eval` 已實測一輪 RAG 閉環。
- `AGENTS.md` 與 `AGENT_USAGE.md` 已納入驗證腳本，確保後續 agent 有固定入口。
- image runtime router 已用 dry-run 驗證會輸出 `--model` 與 `--endpoint-url`。
- `test_control.js` 已驗證基本極點判定與 step response 指標。
- `control_advisor_workflow.py --help` 可正常執行。
- `CONTROL_SYSTEM_PLAN.md` 已整理控制系統盤點、MVP 範圍與後續 roadmap。
- `CONTROL_SYSTEM_VERIFICATION_CASES.md` 已定義五個具數學推導的控制系統驗證案例，涵蓋一階、二階欠阻尼、初始不穩定/pole-zero/低 PM、RHP zero、State-Space 等價。
- `control-studio/ROADMAP.md` 已整併為 ControlStudio 主執行看板，記錄 P23~P28 進度、dirty worktree 分類、文件工作流與下一步順序；P24 advanced MPC 已完成。
- `CONTROL_SYSTEM_BACKLOG.md` 已改為 detailed task ledger；目前 Phase 0~24 已完成，P25/P26/P27/P28 mostly done。
- `CONTROL_SYSTEM_SKILLS_PLAN.md` 已新增 Phase 18+ skill candidates，且 `control-studio-robust-validator`、`control-studio-system-auditor`、`control-studio-benchmark-author` baseline 已建立；MPC / SysID / UI verifier 目前以全域 skill 或候選工作流存在，專案版 examples / references 可後續補。
- `control-studio` 已補上 State Space（SISO）輸入、Step/Impulse/Ramp 切換、Nyquist Plot、project save/load 與 JSON/CSV 匯出。
- `control-studio` UI 已改成 sidebar workspace tabs（Model / Sim / Advisor / Compare），並支援 comparison snapshots 疊圖比較。
- `control-studio/scripts/serve_studio.py` 已提供固定的本地前端啟動入口（預設 `http://127.0.0.1:8765`）。
- `control-studio` 已補上 simulation config（duration/sample count/amplitude/disturbance/initial state）、autosave/restore session、waveform 擴充與 comparison 指標摘要。
- `control-studio/scripts/control_api.py` 已提供統合的 FastAPI 服務，整合原本的 Advisor Bridge 與基礎分析；前端 AI advisor 已優先改打 `127.0.0.1:8770/api/control/advisor`。
- `control-studio/requirements-api.txt` 已列出 FastAPI / uvicorn / pydantic 依賴，可用 `./.venv/bin/pip install -r control-studio/requirements-api.txt` 安裝。
- `control-studio/js/analysis/time-response.js` 已補內部 RK4 substepping，避免低 sample count 時穩定系統數值爆掉。
- `control-studio` 已補 Nichols Chart、ZPK 輸入、Export PNG、Routh-Hurwitz 表、autoFreqRange、Root Locus asymptotes、Nyquist encirclement 計數、輸入驗證強化。
- `control-studio` 已補 Lead/Lag 補償器，作為 PID 後串接的 `Cc(s)=Kc(tau*s+1)/(alpha*tau*s+1)`。
- `control-studio/scripts/verify_control_cases.mjs` 已將 `CONTROL_SYSTEM_VERIFICATION_CASES.md` 的五個數學案例轉為 fixture-based regression runner，並納入 validation script。
- `control-studio/scripts/verify_control_api_contract.mjs` 已用同一組 verification fixtures 比對 FastAPI `/api/control/system/response`、`/api/control/system/stability` 與 JS CLI 的 formula / metrics / plot shape，並納入 validation script。
- `control-studio/js/app.js` 已暴露 `window.ControlStudioSmoke.run()` 與 `getState()`，供 in-app browser 驗證 UI 公式、plot traces、legend、snapshot 與錯誤狀態。
- `control-studio` 已強化輸入驗證：TF 分母不可全 0、ZPK zeros/poles 有欄位錯誤、State-Space A/B/C/D 會標示對應欄位、Lead/Lag alpha/tau/gain 有模式限制；本輪已用 in-app browser 驗證壞輸入不會覆蓋原可用模型。
- `control-studio` 已補 PID presets 與 Lead design helper：UI 可套用 Ziegler-Nichols / Cohen-Coon PID preset，Lead helper 可用 target phase boost 與 crossover 產生 `alpha/tau/gain`；`test_control.js` 已驗證公式。
- `control-studio` Compare 面板已補 controller comparison table，snapshot 會保存 PM/GM/rise/settling/overshoot/ESS、controller formula、open/closed-loop formula 與 compensator config；本輪已用 in-app browser 驗證表格與 comparison plot。
- `control-studio` 已補 Lag design helper：以 improvement factor 與 crossover 產生 lag `gain/tau/alpha`，用於提升低頻 DC gain；`test_control.js` 與 in-app browser 已驗證。
- `control-studio` 已補離散系統核心 baseline：`DiscreteTransferFunction` 使用 z^-1 係數與 sample time，`discreteStepResponse` 用差分方程產生 step response；`test_control.js` 已用 `0.5/(1-0.5z^-1)` 驗證。
- `control-studio` 已補離散時間 UI mode、z-plane pole-zero / unit-circle stability metrics，以及 continuous-to-discrete conversion（Tustin / ZOH）。
- `control-studio` 已補 `discreteBodeData` 與 high-order ZOH；`test_control.js` 已覆蓋 C2D、high-order ZOH 與 discrete Bode。
- `control-studio` Root Locus 已補 break points、jω crossings、branch sorting 與 interactive gain picker；`test_control.js` 已覆蓋 Root Locus 進階案例。
- `control-studio` Root Locus 已補由 ultimate gain Ku/Tu 產生 Ziegler-Nichols P / PI / PID，最新 checkpoint 為 `3f77118`。
- `control-studio` 已補 closed-loop design assistant：由 overshoot / settling time 轉 target poles，並可根據 target phase margin 產生 Lead design。
- `control-studio` Advisor / design result 已支援 apply-back 到 controller；直接 pole-placement K computation 已移除不必要的手動 Root Locus 步驟。
- `control-studio` 已補 z-domain interaction 與 Deadbeat gain design；UI 可 copy/apply deadbeat K。
- `control-studio` 已補工程化 Stability Analysis summary：continuous/discrete 都可輸出 risk level、dominant pole、stability margin、damping ratio、natural frequency 與 recommendations；`test_control.js` 已覆蓋 continuous stable/unstable 與 discrete stable/unstable。
- `control-studio` Phase 6 已補齊：Markdown report export、Local JS / FastAPI / Compare Local/API analysis source toggle、API analysis status surface、`control_regression_dashboard.mjs` 回歸 dashboard 指令。
- `control-studio/js/math/matrix.js` 已補 matrix definiteness utilities：`matSolve`、`matKronecker`、`matSymmetrize`、symmetric eigenvalue / positive-definite checks。
- `control-studio/js/control/state-feedback.js` 已新增 Phase 7 核心：continuous Lyapunov solver / proof、SISO pole placement、low-order LQR baseline、state-feedback closed-loop TF preview。
- `control-studio` Advisor 面板已新增 Phase 7 區塊，可直接輸入 desired poles、Lyapunov `Q`、LQR `Q/R`，並顯示 `K`、`P`、閉迴路 poles、step metrics。
- `test_control.js` 已新增手推等價驗證：Lyapunov `AᵀP + PA = -I`、Ackermann pole placement、LQR CARE 小型解析案例。
- `control-studio` 已完成 Phase 8：Luenberger observer、連續/離散 Kalman、Bryson auto Q/R、innovation whiteness、LQG 模擬與 Pole-Zero overlay。
- `control-studio` 已完成 Phase 9：SISO/MIMO mode toggle、MIMO State-Space matrix input、channel selector、All matrix grid、RGA、Singular Value Bode、Static Decoupler、MIMO LQR（R matrix）。
- `test_control.js` 已補 Phase 8/9 驗證，涵蓋 observer pole placement、Kalman/LQG 穩定性、RGA、decoupler、MIMO LQR。
- `node test_control.js`、`node control-studio/scripts/verify_control_cases.mjs`、`node control-studio/scripts/verify_control_api_contract.mjs` 是目前控制系統主要驗證基線。
- Block Diagram 目前暫時擱置，UI 入口已標示 paused；後續進階控制先走 SISO transfer function / frequency response / stability validation。
- `control-studio` Block Editor 已補上拓撲分析（串聯 / 回授）、節點編輯（雙擊）、節點刪除、Zoom/Pan、Undo/Redo、Diagram save/load。
- `control-studio/js/control/zpk.js` 新增 ZPK model 輸入與複數根解析。
- `control-studio/js/math/matrix.js` 新增 `matRank` 用於計算矩陣秩。
- `control-studio/js/control/state-space.js` 新增 `controllabilityMatrix` 與 `observabilityMatrix`，並在 UI 直接顯示可控性與可觀察性。
- `control-studio/js/math/polynomial.js` 新增 `polydiv` 多項式除法。
- `control-studio/js/control/stability.js` 新增 `routhTable` Routh-Hurwitz 穩定性表。
- `control-studio/js/analysis/frequency-response.js` 新增 `nicholsData`、`nyquistEncirclements`。
- `test_control.js` 已擴充涵蓋 ZPK、polydiv、Routh、Nichols、encirclement、asymptotes、SS Rank 測試。
- `control-studio/scripts/verify_math_core.mjs` 已新增為獨立數學核心驗證：覆蓋 Complex、Polynomial roots、Matrix solve/inverse/exp、RK4/RK45、TF/DTF guard、State-Space roundtrip、C2D DC gain。
- `control-studio/js/math/polynomial.js` 已改用 Durand-Kerner 處理三階以上根；舊 QR path 對 `s^3+1` 會錯誤收斂為 0，勿恢復。
- `control-studio/js/math/ode.js` 已修正 RK45 Dormand-Prince 5th-order 權重缺第 7 項 `0` 造成 NaN / infinite loop 的問題。
- `CONTROL_SYSTEM_SCENARIOS.md` 已新增 precision servo stage position control 情境，使用 ControlStudio 核心完成 PID + Lead 設計，並記錄後續改善思考。
- `control-studio/scripts/run_servo_stage_case.mjs` 可重跑 servo-stage 情境並輸出 `outputs/controlstudio/precision-servo-stage-case.json`；`control_regression_dashboard.mjs` 已納入此情境檢查。
- `CONTROL_SYSTEM_PHASE10_PLAN.md` 已新增 Phase 10 規劃，明確擱置 Teaching Mode / Electron / Report Template。
- `control-studio/js/control/state-feedback.js` 已新增 `solveCareHamiltonianSchur(A,B,Q,R)`，以 Hamiltonian stable invariant subspace 求解 CARE；`solveLqr()` / `solveLqrMIMO()` 現在優先使用此路徑，失敗才 fallback Newton-Kleinman。
- `test_control.js` 已新增 Hamiltonian CARE 驗證，涵蓋 SISO / MIMO analytic CARE 與 Spacecraft marginally stable MIMO case。
- `control-studio/js/control/mpc.js` 已新增 Phase 10 MPC baseline：finite-horizon Riccati、first action、unconstrained receding-horizon simulation；`test_control.js` 以 scalar integrator 手推驗證 `K0=0.6`。
- `control-studio/js/control/mimo.js` 已新增 `dynamicDecouplerAtFrequency(mimoSys, omega)`，可在指定 `ωc` 計算 `W(jωc)=G(jωc)⁻¹` 並回傳 `G(jωc)·W(jωc)` residual；`test_control.js` 已驗證 selected-frequency inverse。
- `control-studio/js/control/robust.js` 已新增 Robust sensitivity baseline：`S/T/KS`、peak sensitivity、risk classification；`test_control.js` 已驗證 DC identity 與 singular guard。
- Scenario 5 已用 in-app browser 實際操作 MPC / Robust 情境，結論是 Phase 10 math-core ready 但 UI-not-ready；改善項目已寫入 `CONTROL_SYSTEM_SCENARIOS.md` 與 `CONTROL_SYSTEM_BACKLOG.md`。
- Scenario 6 已用 in-app browser 實際操作 SISO / MIMO 情境；SISO plant/PID/Lead/Stability/LQR 與 MIMO RGA/SV/Static Decoupler/MIMO LQR 均可透過 UI 完成。S6 問題已修正：切 MIMO 會清空 Phase 7/8 SISO-only 舊輸出，MIMO Analysis 置頂，RGA/Decoupler 表格化，SV plot 加高並顯示 legend，PID 支援 numeric input，LQR output 顯示 solver path。
- `control-studio/scripts/verify_phase10_math_core.mjs` 已新增 Phase 10 專用數學核心驗證，覆蓋 Hamiltonian CARE analytic cases、Spacecraft marginal MIMO、MPC Riccati、Dynamic Decoupler、Robust `S/T/KS`；已納入 regression dashboard 與 `scripts/validate_nvidia_model_selector.sh`。
- `control-studio/js/math/matrix.js` 已新增 matrix sign function；`control-studio/js/control/state-feedback.js` 已補 matrix-sign CARE 與 DARE solver，支援高階 CARE 與離散 terminal-cost 設計。
- `control-studio/js/control/mpc.js` 已補 MPC setpoint tracking、steady-state target solver、state constraints / soft slack；`control-studio/js/control/robust.js` 已補 `hInfNorm()`；`control-studio/js/control/mimo.js` 已補 `dynamicRGA()`。
- `control-studio/scripts/verify_phase11_dare.mjs`、`verify_phase11_setpoint_and_state_constraints.mjs`、`verify_phase11_hinf.mjs`、`verify_phase11_dynamic_rga.mjs` 已加入；`package.json` 現在可用 `npm run verify:math` / `npm run verify:all` 聚合驗證。
- `control-studio` 已補 Phase 12：robust sensitivity dB scale、0 / 5.1 / 8 dB reference lines、bandwidth 指標、MIMO `||G||∞` 視覺化與 peak marker。
- `control-studio` 已補 Phase 13：可折疊 section、Quick Start modal、confirm modal、live field validation、keyboard shortcuts、tablet / reduced-motion / a11y 整理。
- `control-studio` 已補 Phase 14：time delay / Padé、delay margin、Smith predictor 包裝、IMC / SIMC tuning、KaTeX 公式、28 個 presets、disk margin / additive uncertainty、seedable RNG；`npm run verify:p14` 可重跑 3 組驗證。
- `control-studio` 已補 Phase 15：ARX system ID（least squares + AIC auto order）、Compare Bode overlay、MATLAB / Python codegen、root-locus K-sweep animation；`npm run verify:p15` 可重跑驗證。
- `control-studio` 已補 Phase 16：mixed-sensitivity H∞ PID synthesis helper、GA PID auto-tuner、phase portrait、describing functions；`npm run verify:p16` 可重跑驗證。
- `control-studio` 已補 Phase 17：plant-order dynamic H∞ mixed-sensitivity synthesis、structured μ D-scaling upper-bound / DK-style static gain surrogate、MIMO characteristic loci / Gershgorin bands / inverse Nyquist array、MPC MIMO output-space setpoint tracking；`npm run verify:p17` 可重跑驗證。
- `control-studio` 已補 Phase 24：EMPC (`empc.js`)、Tube MPC (`tube_mpc.js`)、Explicit MPC (`explicit_mpc.js`)；`verify_p24_empc.mjs` 與 `verify_p24_tube_explicit_mpc.mjs` 可重跑驗證。
- `a2a89d3 fix(math): 4 defects in complex / polynomial / realschur` 已完成 post Phase 17 數學核心修復；commit 記錄 TF/SS/ZPK/C2D `36/36` 與 PID `21/21` 通過。
- 本輪補上 unpaired complex root error wording 相容性後，`node test_control.js` / `./nv-agent doctor` 不應再因錯誤訊息分類失敗。
- 本輪同步 `scripts/validate_nvidia_model_selector.sh` 的 Phase 10 math-core 預期值為 `16/16`，避免標準 `doctor` workflow 停留在舊 `12/12` 基線。
- `workflows/cuopt_demo_workflow.py` 已新增 `--local-validate`，`./nv-agent doctor` 改用本地 cuOpt payload validator，不再因外部 cuOpt API timeout 讓本地健康檢查失敗。
- 本輪完成 math-core audit hardening，新增 regression 覆蓋 extreme complex division、separated quadratic roots、tiny-scale inverse / solve / rank / positive-definite checks；`npm run verify:all`、`node test_control.js`、`node control-studio/scripts/control_regression_dashboard.mjs`、`./nv-agent doctor` 均已通過。

## 後續可做
1. 決定 `package.json` / `package-lock.json` 的 dependency policy；若 TypeScript workflow 正式化才提交 lockfile，`node_modules/` 永不提交。
2. UI/UX 下一步依 `control-studio/UI_UX_PLAN.md` 檢查 P3 尚未覆蓋項目，優先聚焦 D4/D5、F4-2~4、F5、G5~G9；Teaching Mode / Electron / Report Template 仍維持暫停。
3. 下一個控制理論主線做 P27 full D-K iteration；不要把目前 structured μ surrogate 說成完整 μ-synthesis。
4. 補 P23 continuous-time identification、P25 Hankel norm approximation、P26 LPV synthesis、P28 JSDoc API docs。
5. 使用 `control-studio-system-auditor` 審查下一個控制設計缺口，並用 `control-studio-benchmark-author` 補 benchmark fixture。
6. Teaching Mode / Electron / Report Template 目前使用者要求擱置，不要開發。
7. Block Diagram 目前維持 paused；不要新增 block diagram 功能，除非使用者重新明確恢復。
8. 加 `agents/openai.yaml` UI metadata。
9. 增強 evaluator：從 heuristic 檢查升級成 judge model + golden dataset。
10. 若 NVIDIA Build Models 更新，先更新根目錄資料檔，再同步 `skills/nvidia-model-selector/references/`。
11. 視需求把 `search_models.py` 加上 `--top-category-summary` 或 fuzzy ranking。
12. 若要更實用，補上本地文件切 chunk / PDF 轉圖 / OCR 結果快取。
13. 加 parallel runner 與 leaderboard，追蹤同任務多模型輸出品質。
14. 將 OCR/RAG 的 endpoint source 也改成完整 registry-driven，而不只傳入 model id。

## 注意事項
- 這個專案不需要 `.agent-handoff.md`。
- 不要把敏感檔或個人 API key 寫入此 repo。
- skill 內容避免把完整 157 筆模型塞進 `SKILL.md`；大量資料留在 references 與 CSV。
