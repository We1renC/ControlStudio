# Control Studio — Development Roadmap

> 最後更新：2026-05-20  
> 基準狀態：Phase 9–21 完成，25 支驗證腳本，全數 0 FAIL，核心代碼 ~11,200 行

---

## 進度總覽

| Phase | 主題 | 狀態 | 驗證腳本 |
|-------|------|------|----------|
| P9  | 數學核心（多項式/複數/Schur） | ✅ 完成 | verify_phase9_*.mjs |
| P10 | CARE / LQR / MPC 基礎 | ✅ 完成 | verify_phase10_*.mjs |
| P11 | DARE / MIMO / 動態 RGA | ✅ 完成 | verify_phase11_*.mjs |
| P14 | 時延補償 / IMC / RNG | ✅ 完成 | verify_p14_*.mjs |
| P15 | ARX 系統辨識 | ✅ 完成 | verify_p15_sysid.mjs |
| P16 | GA 調參 / H∞ Nelder-Mead | ✅ 完成 | verify_p16_*.mjs |
| P17 | ARMAX / NSGA-II / EKF-UKF | ✅ 完成 | verify_p17_*.mjs |
| P18 | 魯棒性驗證（μ-analysis） | ✅ 完成 | verify_p18_robust_validation.mjs |
| P19 | H∞ Riccati 合成（Glover-Doyle） | ✅ 完成 | verify_p19_hinf_riccati.mjs |
| P20 | MPC 工程化（移動抑制/Offset-free） | ✅ 完成 | verify_p20_mpc_engineering.mjs |
| P21 | 進階 SysID（OE/BJ/Subspace/信號設計） | ✅ 完成 | verify_p21_sysid_advanced.mjs |
| PID | PID/Lead-Lag 自動整定 | ✅ 完成 | verify_pid_design.mjs |
| **P22** | **工程驗證基礎設施（CI / 回歸）** | ✅ 完成 | run_all_verify.sh, verify.yml |
| **P23** | **SysID 缺口補強** | 🔶 部分完成 | verify_p23_*.mjs |
| **P24** | **MPC 進階功能** | 🔲 待開發 | — |
| **P25** | **模型降階（MOR）** | 🔶 部分完成 | verify_p25_model_reduction.mjs |
| **P26** | **非線性控制** | 🔶 部分完成 | verify_p26_nonlinear.mjs |
| **P27** | **H∞ 設計延伸** | 🔲 待開發 | — |
| **P28** | **基礎設施品質** | 🔲 待開發 | — |

---

## P22 — 工程驗證基礎設施

### P22-01 GitHub Actions CI ⬜
- **目標**：每次 push 自動執行全套 verify 腳本
- **交付物**：`.github/workflows/verify.yml`
- **工時**：0.5 天

```yaml
# 觸發：push / pull_request
# 步驟：node 22 → for f in scripts/verify_*.mjs; do node "$f"; done
#        python3 scripts/compare_python_control.py
```

### P22-02 跨工具數值回歸擴充 ⬜
- **目標**：`compare_python_control.py` 從 4 案例擴充至 ≥ 20 案例
- **新增案例**：ARX fitPercent、LQR gains、H∞ γ*、CARE residual、Bode PM/GM
- **工時**：1 天

### P22-03 全套腳本執行器 ⬜
- **目標**：單一命令跑完所有腳本並輸出摘要報告
- **交付物**：`scripts/run_all_verify.sh`（含計時、pass/fail 彙總）
- **工時**：0.3 天

---

## P23 — SysID 缺口補強

### P23-01 頻域辨識（FRF Estimation） ⬜
- **目標**：新增 `js/control/sysid_freq.js`
- **API**：
  - `estimateFRF(u, y, Ts, options)` — Welch/Bartlett 跨功率譜估測
  - `fitTFfromFRF(omega, H, na, nb, options)` — Levy 頻域最小二乘 TF fitting
- **輸出欄位**：`{ omega, H, coherence, phaseRad, num, den, fitPercent }`
- **工時**：2 天

### P23-02 MISO/MIMO 系統辨識 ⬜
- **目標**：`identifyARX` 擴充至多輸入
- **API**：`identifyMISOARX(U_matrix, y, na, nb_vec, nk_vec, Ts)`
- **說明**：U_matrix 為 N×nu，nb_vec/nk_vec 各為長度 nu 的陣列
- **工時**：1.5 天

### P23-03 模型階次自動選擇強化 ⬜
- **目標**：跨結構（ARX/ARMAX/OE/BJ）+ AICc + cross-validation
- **API**：`autoModelOrder(u, y, options)` → 排序候選模型列表
- **新增**：AICc = AIC + 2p(p+1)/(N−p−1)；80/20 train/validation split
- **工時**：1 天

### P23-04 連續時間辨識（CONTSID） ⬜
- **目標**：直接辨識 s-domain 模型（避免離散化誤差）
- **方法**：Prefiltered IV（SRIVC）
- **API**：`identifyContinuousARX(u, y, na, nb, nk, Ts, options)`
- **工時**：3 天

---

## P24 — MPC 進階功能

### P24-01 非線性 MPC（NMPC / SQP-lite） ⬜
- **目標**：新增 `js/control/nmpc.js`
- **方法**：逐步線性化（SLQ）—每時步在當前狀態 Jacobian 化，求解線性 MPC QP
- **API**：`simulateNMPC(f_nonlinear, h_output, Q, R, horizon, x0, options)`
- **工時**：2.5 天

### P24-02 Tube MPC（魯棒 MPC） ⬜
- **目標**：nominal MPC + 不變管（invariant tube）確保魯棒可行性
- **API**：`simulateTubeMPC(Ad, Bd, Q, R, horizon, x0, W_set, options)`
- **輸出**：`{ x_nominal, u_nominal, tube_radius[], isFeasible }`
- **工時**：3 天

### P24-03 經濟 MPC（EMPC） ⬜
- **目標**：支援任意非二次 stageCost（如能耗）
- **方法**：差分進化（DE）求解開迴路最佳化問題
- **API**：`simulateEMPC(Ad, Bd, stageCost, horizon, x0, options)`
- **工時**：2 天

### P24-04 顯式 MPC（Explicit MPC） ⬜
- **目標**：預計算 Parametric QP → PWA 控制律查表
- **API**：`buildExplicitMPC(...)` + `evaluateExplicitMPC(mpc, x)`
- **工時**：4 天

---

## P25 — 模型降階（Model Order Reduction）

### P25-01 平衡截斷（Balanced Truncation） ⬜
- **目標**：新增 `js/control/model_reduction.js`
- **方法**：Gramian Cholesky → SVD balancing → 截斷
- **API**：`balancedTruncation(ss, order, options)` → `{ ss_reduced, hsvd[], error_bound }`
- **誤差上界**：`2 * Σ σᵢ`（i > order）
- **工時**：2 天

### P25-02 最優 Hankel Norm 近似 ⬜
- **方法**：Glover's AAK algorithm
- **API**：`hankelNormApprox(ss, order, options)`
- **工時**：3 天

### P25-03 最小實現 SS（Kalman 分解） ⬜
- **現狀**：TF `minreal()` 已有，SS minreal 空白
- **API**：`minrealSS(ss, tol)` — 可控性/可觀性矩陣秩 → Kalman 分解
- **工時**：1.5 天

---

## P26 — 非線性控制

### P26-01 增益調度 PID ⬜
- **目標**：在 scheduling variable 的 breakpoints 間線性插值 PID 參數
- **API**：`gainScheduledPID(schedulingVar, breakpoints, pidParams[])`
- **工時**：2 天

### P26-02 LPV 合成（線性參數變化） ⬜
- **方法**：在參數網格上求解 LMI（SDP 近似）
- **工時**：5 天

### P26-03 滑模控制（SMC） ⬜
- **方法**：等效控制 + 切換控制（boundary layer 抗抖振）
- **API**：`designSMC(A, B, slidingSurface, options)`
- **工時**：2 天

---

## P27 — H∞ 設計延伸

### P27-01 D-K iteration（真 μ-synthesis） ⬜
- **現狀**：`structuredMuSynthesisSurrogate()` 為代理函式，非真正 DK
- **方法**：K-step（H∞） + D-step（rational D-fitting）交替
- **工時**：5 天

### P27-02 Loop Shaping H∞（McFarlane-Glover） ⬜
- **方法**：coprime factor robust stabilization
- **API**：`loopShapingHinf(G, W1, W2, options)`
- **工時**：3 天

### P27-03 MIMO H∞ 深度驗證 ⬜
- **目標**：2×2 plant 合成測試、MIMO 閉環範數驗證
- **工時**：1.5 天

---

## P28 — 基礎設施品質

### P28-01 TypeScript 型別定義 ⬜
- **交付物**：`types/control-studio.d.ts`
- **覆蓋**：全部 export 函式的輸入/輸出型別
- **工時**：1.5 天

### P28-02 JSDoc + API 文件 ⬜
- **工具**：jsdoc + better-docs
- **交付物**：`docs/api/index.html`
- **工時**：0.5 天

### P28-03 效能基準（Benchmark） ⬜
- **交付物**：`scripts/benchmark.mjs`
- **測量對象**：CARE(n=10,20,50)、NSGA-II、H∞ Riccati、BJ(N=1000)
- **工時**：0.5 天

---

## 優先排序

| 優先 | 項目 | 工時 | 狀態 |
|:----:|------|:----:|:----:|
| 1 | P22-03 全套腳本執行器 | 0.3天 | ✅ |
| 2 | P22-01 GitHub Actions CI | 0.5天 | ✅ |
| 3 | P22-02 跨工具數值回歸擴充 | 1天 | ✅ |
| 4 | P23-03 模型階次自動選擇強化 | 1天 | ✅ |
| 5 | P25-03 SS minreal（Kalman 分解） | 1.5天 | ✅ |
| 6 | P23-01 頻域辨識（FRF） | 2天 | ✅ |
| 7 | P25-01 平衡截斷 MOR | 2天 | ✅ |
| 8 | P26-01 增益調度 PID | 2天 | ✅ |
| 9 | P26-03 滑模控制 | 2天 | ✅ |
| 10 | P24-01 非線性 MPC (NMPC) | 2.5天 | ⬜ |
| 11 | P27-02 Loop Shaping H∞ | 3天 | ⬜ |
| 12 | P28-01 TypeScript 型別定義 | 1.5天 | ⬜ |
| 13 | P23-02 MISO/MIMO SysID | 1.5天 | ⬜ |
| 14 | P27-03 MIMO H∞ 驗證 | 1.5天 | ⬜ |
| 15 | P24-03 經濟 MPC | 2天 | ⬜ |
| 16 | P25-02 Hankel Norm 近似 | 3天 | ⬜ |
| 17 | P24-02 Tube MPC | 3天 | ⬜ |
| 18 | P27-01 D-K iteration | 5天 | ⬜ |
| 19 | P26-02 LPV synthesis | 5天 | ⬜ |
| 20 | P24-04 顯式 MPC | 4天 | ⬜ |
| 21 | P23-04 連續時間辨識 | 3天 | ⬜ |
| 22 | P28-02 JSDoc | 0.5天 | ⬜ |
| 23 | P28-03 Benchmark | 0.5天 | ⬜ |
