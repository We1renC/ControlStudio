# ControlStudio Research Roadmap And Skill Plan

此文件把 ControlStudio 後續可提供給控制系統工程與研究的能力，整理成 Phase 18+ 可拆成 agent skill 的規劃。實際 phase 狀態與下一步開發順序以 `control-studio/ROADMAP.md` 為準；本文件只維護 skill 邊界、輸入輸出與可重用工作流。

## Scope

### 目標
- 將 ControlStudio 從「控制分析工作台」推進成「控制系統設計、驗證、研究與 agent-assisted workflow 平台」。
- 讓後續 agent 可依 phase、驗證基線、skill 邊界逐步開發。
- 把適合抽成 skill 的工作流程獨立出來，避免把所有知識硬寫在 UI 或單一 advisor prompt。

### 暫停項目
- Teaching Mode
- Electron packaging
- Report template / report automation
- Block Diagram expansion

上述項目只有在使用者重新明確恢復時才可啟動。

## Phase 18+ Roadmap

| Phase | Priority | Status | Theme | Goal | Primary Verification |
| --- | --- | --- | --- | --- | --- |
| Phase 18 | P1 | Done | Uncertainty + Monte Carlo robust validation | 將 robust analysis 從 nominal 指標推進到不確定性族群驗證 | deterministic uncertainty fixtures、worst-case replay、`verify:p18` |
| Phase 19 | P2 | Done | Full H-infinity / mu backend | 已提交 H∞ Riccati synthesis baseline；dynamic D-scaling fit 與 dynamic D-K wrapper 已補齊目前 P27 gap | `verify_p19_hinf_riccati.mjs`、`verify_p19_dynamic_dk.mjs` |
| Phase 20 | P1 | Done | MIMO MPC engineering workflow | 完成 offset-free tracking、move suppression、constraints、feasibility diagnostics | `verify_p20_mpc_engineering.mjs` |
| Phase 21 | P2 | Done | Research-grade system identification | 已擴展 ARMAX/OE/BJ/subspace ID、experiment signals 與 uncertainty export | `verify_p21_sysid_advanced.mjs` |
| Phase 22 | P1 | Done | Benchmark + cross-tool validation | 已建立 CI、cross-tool comparison、full verification runner 與 benchmark script | `run_all_verify.sh`、`compare_python_control.py`、CI |
| Phase 23 | P1 | Done | Agentic design review / SysID gap closure | structured review skills、FRF/MISO/model-order、SRIVC baseline 與 project-local UI verifier skill 已提交 | `verify_p23_*.mjs`、`verify_b3_srivc.mjs`、`control-studio/ROADMAP.md` |

## Phase Details

### Phase 18: Uncertainty + Monte Carlo Robust Validation

目的：讓工程師可評估控制器在模型誤差、增益變動、相位延遲、參數分散與噪音下是否仍可用。

核心功能：
- Parametric uncertainty：例如 `m in [m_min, m_max]`、`b in [b_min, b_max]`、`K in [K_min, K_max]`。
- Additive / multiplicative uncertainty：與既有 disk margin、H-infinity norm、sensitivity 指標接軌。
- Monte Carlo sampling：支援固定 seed、sample count、worst-case replay。
- Worst-case plots：step response envelope、Bode / sensitivity envelope、margin distribution。
- Robust pass/fail：用規格條件判斷 settling time、overshoot、PM/GM、control effort 是否通過。

UI / API：
- 新增 Robust Validation panel，輸入 uncertainty model、sample count、seed、pass/fail specs。
- API payload 必須可序列化，以便產生 run manifest。
- Browser UI 應能回放 worst-case sample。

驗證基線：
- deterministic seed fixture。
- 已知一階/二階 plant 的 parameter sweep 手算邊界。
- nominal pass 但 uncertainty fail 的案例。
- unstable sample 必須被清楚標記，不可只輸出 NaN。

Exit criteria：
- `npm run verify:p18` 覆蓋 uncertainty parsing、Monte Carlo deterministic replay、worst-case extraction。
- regression dashboard 納入一個 robust validation 情境。

### Phase 19: Full H-infinity / Mu Backend

目的：補上接近 MATLAB Robust Control Toolbox 的核心設計能力。

核心功能：
- Glover-Doyle style H-infinity synthesis backend。
- Riccati 或 LMI solver path，回傳 residual、gamma、closed-loop poles。
- Full DK-iteration：dynamic D scaling / K fitting；目前已有 deterministic dynamic D-scaling fit 與 wrapper，後續可替換 K-step 為 full-order controller fitting backend。
- Structured uncertainty block 定義：real scalar、complex scalar、full block。

驗證基線：
- small SISO mixed-sensitivity golden case。
- MIMO robust synthesis golden case。
- H-infinity norm after synthesis 應低於設計 gamma。
- DK iteration 的 mu upper-bound 應單調不惡化或明確標記失敗。

風險：
- 完整 LMI solver 在 browser JS 內維護成本高；若要高可信度，應評估 Python backend 或 WASM numeric backend。

### Phase 20: MIMO MPC Engineering Workflow

目的：讓 MPC 能處理工程常見的多輸出 tracking、constraints 與 offset-free control。

核心功能：
- MIMO output-space setpoint tracking 延伸至 constraints 與 move suppression。
- Disturbance model / integral augmentation，支援 offset-free tracking。
- State / output / input / delta-u constraints。
- Feasibility diagnostics：不可行時顯示是哪個 constraint 衝突。
- Scenario compare：constrained vs unconstrained、with/without disturbance model。

驗證基線：
- 2x2 stable plant 多輸出 tracking。
- constrained input 下不超限。
- step disturbance 後 offset-free steady-state error 接近 0。
- infeasible setpoint 必須給出明確 infeasible result。

### Phase 21: Research-Grade System Identification

目的：讓 ControlStudio 可從實驗資料建立可用的控制模型，並輸出 uncertainty 給 robust design。

核心功能：
- Experiment design：step、PRBS、chirp、multi-sine。
- Model families：ARMAX、Output Error、Box-Jenkins、subspace state-space ID。
- Model selection：AIC/BIC、train/test split、cross-validation。
- Residual analysis：whiteness、correlation with input、confidence intervals。
- Uncertainty export：將 ID uncertainty 轉為 Phase 18 / 19 可用的 uncertainty model。

驗證基線：
- known plant + synthetic noise recovery。
- residual whiteness pass/fail cases。
- overfit/underfit case 的 model order selection。

### Phase 22: Benchmark + Cross-Tool Validation

目的：讓所有核心控制理論功能有可重跑、可稽核、可與外部工具對照的研究基線。

核心功能：
- Benchmark library：stable / unstable / RHP zero / time delay / MIMO coupling / ill-conditioned / nonlinear entry cases。
- Golden derivations：每個案例含數學推導、期望輸出、容許誤差。
- Cross-tool manifest：記錄 ControlStudio、MATLAB、Python Control 結果與版本。
- Regression dashboard：輸出 machine-readable pass/fail。

驗證基線：
- 既有五個 verification cases 擴充成 benchmark suite。
- 至少一個 SISO、MIMO、MPC、robust、system ID benchmark。

### Phase 23: Agentic Design Review

目的：把 AI Advisor 從「提供建議」升級成「可審查控制設計是否工程上合理」。

核心功能：
- Structured review schema：model assumptions、stability、margins、tracking、noise、actuator effort、robustness、implementation risk。
- 每個建議需綁定具體數值指標或數學檢查，不可只給自然語言。
- Review result 應可被 UI 顯示，也可被 CLI / skill 消費。

驗證基線：
- golden review cases：PM 不足、actuator saturation、不可控、不可觀、MIMO pairing 不良、uncertainty fail。
- Advisor 不可把不穩定系統描述成可部署。

## Skill Candidates

下列項目適合獨立成 skill，因為它們是可重用的工程流程，而不是單一 UI button 或低階數值函式。

| Skill Candidate | Priority | Purpose | Inputs | Outputs | Backing Modules / Docs |
| --- | --- | --- | --- | --- | --- |
| `control-studio-system-auditor` | P1 | 盤點 plant / controller 是否具備基本可設計性 | TF/SS/ZPK、controller、mode | controllability / observability / poles / margins / risks | `docs/src/control-studio/plan.md`, `test_control.js` |
| `control-studio-robust-validator` | P1 | 建立 uncertainty 與 Monte Carlo robust validation 計畫 | nominal model、uncertainty ranges、specs | robust pass/fail、worst-case sample、fixtures | Phase 18 |
| `control-studio-mimo-designer` | P1 | 協助 MIMO pairing、decoupling、loop-shaping 與 diagnostics | MIMO SS、channels、target bandwidth | RGA/SV/characteristic loci diagnosis、design sequence | Phase 9 / 17 |
| `control-studio-mpc-designer` | P1 | 將 state-space plant 轉成 MPC tracking / constraints 設計流程 | A/B/C/D、Ts、horizon、Q/R、constraints | MPC config、feasibility notes、verification plan | Phase 10 / 11 / 20；project-local package done |
| `control-studio-stability-prover` | P1 | 產生 Lyapunov / Riccati / margin 證明摘要 | A/B/C/D、Q/R、closed-loop A | proof object、residual、applicability warnings | Phase 7 / 10 / 11 |
| `control-studio-sysid-planner` | P2 | 設計識別實驗與模型選型流程 | experiment goal、sample time、data columns | experiment signal、candidate models、validation plan | Phase 15 / 21；project-local package done |
| `control-studio-benchmark-author` | P1 | 為新控制案例建立數學推導與 regression fixture | scenario description、plant、controller target | markdown derivation、fixture skeleton、tolerances | `docs/src/control-studio/verification.md` |
| `control-studio-codegen-reviewer` | P2 | 審查 MATLAB / Python / embedded codegen 是否與模型一致 | generated code、model config | mismatch report、runtime caveats | Phase 15 |
| `control-studio-ui-verifier` | P2 | 用 browser 閉環檢查 SISO/MIMO/Robust/MPC UI 流程 | local URL、workflow checklist | UI issue list、screenshots、regression notes | `control_regression_dashboard.mjs`；project-local package done |

## Skill Implementation Contract

每個 ControlStudio skill 建議採以下結構：

```text
skills/control-studio-<name>/
  SKILL.md
  references/
    workflow.md
    validation-checklist.md
  scripts/
    optional-helper.*
  examples/
    sample-input.json
    sample-output.md
```

Skill 必須遵守：
- `SKILL.md` 不複製大量程式碼或完整 benchmark data；大量資料放在 `references/` 或 repo 文件。
- Skill 輸出應是 structured checklist / JSON / markdown summary，方便 agent 後續接 UI、API 或測試。
- Skill 不直接修改 `control-studio/`，除非使用者明確要求實作；預設先產出設計、驗證與審查結果。
- Skill 涉及模型選型或外部模型時，必須使用既有 `nv-agent` runtime router，不可硬寫 endpoint。
- Skill 若會導向功能開發，必須要求後續 agent 先更新 `control-studio/ROADMAP.md`，再同步 `docs/src/control-studio/plan.md`、`docs/src/control-studio/backlog.md`、`docs/src/control-studio/verification.md`、`docs/src/control-studio/scenarios.md`、`docs/src/agents/continuation.md` 中受影響的部分。

## Not Good Skill Targets

以下項目不建議做成 skill，應留在程式碼與測試中：
- 低階數值核心：matrix inverse、polynomial roots、complex arithmetic。
- 單一 plot rendering 行為。
- 單次 UI 文字或 naming 調整。
- 只服務一個案例、沒有可重用流程的臨時腳本。

## Recommended Next Step

1. 後續 phase 進度先查 `control-studio/ROADMAP.md`；本文件只決定是否要建立或調整 skill。
2. `control-studio-robust-validator`、`control-studio-system-auditor`、`control-studio-benchmark-author` baseline 已建立，應持續用於 robust validation、設計審查與 benchmark 建立。
3. Phase 20 / 21 已有核心能力，且 `control-studio-mpc-designer`、`control-studio-sysid-planner` 已補 project-local examples / references；後續只在實際使用案例出現新缺口時擴充。
4. Phase 24 advanced MPC 已正式化 EMPC、Tube MPC、Explicit MPC；後續若把此流程產品化，應擴充 `control-studio-mpc-designer` 的 examples / references，涵蓋 economic objective、tube tightening 與 scalar explicit policy lookup。
