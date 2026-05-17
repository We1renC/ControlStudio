# ControlStudio Phase 9 + Phase 10 數學核心校驗規劃

涵蓋 Phase 9 (MIMO) 與 Phase 10 (Schur CARE / MPC / Dynamic Decoupler / Robust Sensitivity) 的完善數學核心校驗。目標是把既有 `verify_phase10_math_core.mjs` 從單一 toy case 解析驗證（L1）擴充到性質不變式（L2）、跨方法一致性（L3）、退化/邊界（L4）四層覆蓋。

## A. 校驗目標分類（四層）

| 層級 | 目的 | 失敗代表 |
|---|---|---|
| L1 解析解 | 對有閉式解的 toy case 驗證數值正確 | 公式或推導實作有錯 |
| L2 性質不變式 | 對隨機/批量輸入驗證代數性質（symmetry, positivity, eigenvalue, residual） | 結構錯誤、退化 case 未處理 |
| L3 跨方法一致性 | 同一問題用兩種方法應給同答案 | 某個方法數值不穩或語意分歧 |
| L4 退化/邊界 | singular、marginally stable、ill-conditioned、NMP、delay、scale 極端 | 缺少 guard，會丟出無語意錯誤或 NaN |

目前 `verify_phase10_math_core.mjs` 主要在 L1，需補 L2-L4。

## B. 各模組校驗矩陣

### B1. Phase 9 — MIMOStateSpace / channelTF
- **L1**: 對角 SS（已知模態）→ 每條 channel TF 殘差 = `c_i (sI-A)^{-1} b_j + d_{ij}` 隨機 ω 取點誤差 < 1e-9。
- **L2**: `allChannels()` 維度 = p×m；對任意 SS，channel(i,j)(0) 與 `dcGain(mimoSys)[i][j]` 在 5 位有效數字一致。
- **L3**: 對 m=p=1 的 SS，channelTF(0,0) 與用 `ssToTransferFunction` 應吻合（pole/zero 對齊容差 1e-8）。
- **L4**: A 含重複特徵值、A 接近不可控/不可觀（PBH 邊界）→ 不應 NaN。

### B2. Phase 9 — dcGain
- **L1**: 對角 plant，G(0) = -C A^{-1} B + D 對照手算。
- **L2**: 對 stable random SS，`stepResponse → t→∞` 應收斂到 `G(0) · u_step`。
- **L4**: A 奇異（integrator）→ 應丟 `SingularMatrixError` 含 "integrator" 字樣（語意 guard，已部分實作）。

### B3. Phase 9 — RGA
- **L1**: 已實作 2×2 對角 → I 與 mixing tank → λ=2 等 case；補 3×3 解析（diag(a,b,c) → I）。
- **L2 (重要新增)**:
  - **行/列和 = 1**：對任意非奇異 G(0)，`sum_i RGA[i][j] = 1` 與 `sum_j RGA[i][j] = 1` 容差 1e-8（這是 RGA 最強的不變式）。
  - **排列不變**：對 G 做行/列排列，RGA 對應排列。
- **L3**: 對 m=p=2，直接用閉式 `λ11 = 1/(1 - g12 g21 / (g11 g22))` 跟矩陣公式比。
- **L4**: 近奇異 G(0)（cond > 1e10）→ diagnosis 應警示而非靜默回 NaN。

### B4. Phase 9 — Singular Value Bode
- **L1**: 對 G(s) = 1/(s+1) · I (2×2)，σ_max=σ_min=1/√(1+ω²)。
- **L2 (重要)**:
  - σ ≥ 0 全頻段
  - σ_max ≥ σ_min 全頻段
  - σ_i² 是 `G^H G` 的特徵值（隨機複矩陣比對，誤差 1e-8）
  - σ_max(G) ≤ ‖G‖_F（Frobenius bound sanity check）
- **L3**: 對 2×2 同時用 closed-form 與 Jacobi 跑，誤差 1e-10。
- **L4**: G 行/列線性相關 → σ_min ≈ 0，cond → ∞ 不發 NaN。

### B5. Phase 9 — Static / Dynamic Decoupler
- **L1**: G·W = I @ 指定頻率（dynamic）或 @ DC（static）。
- **L2**: applyDecoupler 後新系統 RGA(0) ≈ I（off-diagonal < 1e-6）。
- **L3**: `dynamicDecouplerAtFrequency(ω→0)` 應收斂到 `staticDecoupler`。
- **L4**: G(jω) 在指定頻率為奇異 → SingularMatrixError 含頻率資訊。

### B6. Phase 9 — MIMO LQR
- **L1**: diag plant + diag Q,R → K 等於各 SISO LQR 串接。
- **L2**:
  - **CARE 殘差**：`‖A'P + PA - PBR^{-1}B'P + Q‖_F < 1e-6 · ‖Q‖_F`
  - **P symmetric** (`‖P - P'‖ < 1e-9`)
  - **P positive definite** (Cholesky 成立)
  - **A_cl = A - BK 穩定** (max Re(λ) < -1e-6)
- **L3 (重要)**: 同一 (A,B,Q,R) 用 Newton-Kleinman、Bass、Schur/Hamiltonian 三種方法解，K 收斂到同一矩陣（容差 1e-6）。
- **L4**:
  - Marginally stable plant (A eig on jω) → Schur 應通過、Newton 失敗時 Bass fallback 至少回 stabilizing K。
  - 不可控對 (uncontrollable mode) → 應給「(A,B) 不可控」訊息而非 singular matrix。

### B7. Phase 10.1 — Schur / Hamiltonian CARE
- **L1**: 已覆蓋 scalar/SISO/MIMO 解析。
- **L2 (新增)**:
  - Hamiltonian H 特徵值對稱於虛軸（±λ 成對）→ 抽 n 個負實部 eigenvalues。
  - 取出的 invariant subspace `H·[X;Y] = [X;Y]Λ_s` 殘差 < 1e-8。
  - `P = Y X^{-1}` symmetric & PD。
- **L3**: 與 Newton-Kleinman 在 well-conditioned plant 上比對 K（誤差 < 1e-6）。
- **L4**:
  - Hamiltonian 有特徵值在虛軸（CARE 無 stabilizing solution）→ 應給語意錯誤。
  - n ≥ 6 ill-conditioned plant → 報告 cond(X)、警告精度下降。

### B8. Phase 10.2 — MPC
- **L1**: 已覆蓋 scalar integrator horizon-2 手算。
- **L2 (重要新增)**:
  - **Riccati 收斂到 ARE**：horizon N → ∞ 時 P_0 收斂到 LQR 的 P_∞（誤差 < 1e-6 在 N=200）。
  - **K_0(N→∞) = K_LQR**：MPC 第一步 gain 收斂到無限時域 LQR。
  - **單調性**：Q_f = P_∞ 時 P_k = P_∞ 對所有 k（穩態 Riccati 不變）。
  - **閉迴路穩定**：horizon 足夠大時 A_d - B_d K_0 穩定。
- **L3**: scalar case 同時用 finite-horizon Riccati 與直接展開 J 求最小（QP 形式）比對 u_0。
- **L4**:
  - Unstable plant + 短 horizon → 可能 unstable，應報告 closed-loop eigenvalues 讓使用者察覺。
  - `Q_f` 非 PSD → guard。
  - `R` 奇異 → SingularMatrixError 含 "MPC R 必須正定"。

### B9. Phase 10.3 — Dynamic Decoupler
- 與 B5 合併（dynamic decoupler 屬於 MIMO 工具）。

### B10. Phase 10.4 — Robust Sensitivity
- **L1**: 已覆蓋 L=1/(s+1) DC。
- **L2 (重要新增)**:
  - **代數恆等式**：`S + T = 1` 全頻段（誤差 < 1e-12）。
  - **S(jω)、T(jω) 都是 complex；|S|, |T| 都 ≥ 0**。
  - **peak |S| ≥ 1**（除非 plant 是 minimum-phase 且 L → 0 trivial case）。
- **L3**: 對 PID + plant 同時用 `sensitivityBode` 與 `bode(closedLoop)` 比對 T。
- **L4**:
  - 1+L=0 @ 某頻率（marginal）→ 該頻率回 Inf 而非 NaN；peak 報告該頻率位置。
  - L 含 RHP 零（NMP）→ peak |S| 必 > 1（Bode sensitivity integral 的下界，可做 sanity check）。
  - Pade-approximated delay plant → 應跑得通並給合理 peak。

## C. 跨模組與性質型測試（隨機批量）

新增 `verify_phase9_phase10_property.mjs`，做 200-500 次隨機抽樣：

1. **Random stable SS generator**：A 用 `-rand(n)·rand(n)' - I` 確保穩定；B,C,D 任意。
   - 跑 dcGain、stepResponse、RGA、SVB 全部 finite，no NaN。
2. **CARE 對偶**：對任意 (A,B,C,Q,R)，`LQR(A,B,Q,R)` 與 `LQE(A,C,Q_n,R_n)` 用對偶 trick 互換結果一致。
3. **Schur vs Newton vs Bass 一致性**：見 B6/B7。
4. **MPC→LQR convergence**：見 B8。
5. **Decoupler frequency continuity**：dynamic decoupler 在 ω_1 ≈ ω_2 應產出連續結果（無跳躍）。
6. **Singular value Bode 連續性**：相鄰頻率 σ 變化 / Δω 有界（沒有亂跳）。
7. **Scale invariance**：對 plant 做 (x → αx) 變換，K_LQR 應對應變換（K' = K/α），驗證實作沒有 hidden scale bug。

## D. 執行架構

### D1. 檔案分工

```
control-studio/scripts/
├── verify_phase10_math_core.mjs       (既有；保留 L1)
├── verify_phase9_math_core.mjs        (新增；B1-B6 的 L1+L2)
├── verify_phase9_phase10_property.mjs (新增；C 的隨機批量)
├── verify_cross_method.mjs            (新增；B6/B7 的 L3 — Schur vs Newton vs Bass)
└── verify_edge_cases.mjs              (新增；B*-L4 的 marginal/singular/NMP/delay)
```

### D2. 報表格式

每個 runner 印：

```
[B3-RGA-L2-rowsum] PASS  (n=200, max_err=3.4e-15)
[B6-MIMO-LQR-L3]  FAIL  (case=spacecraft_sparse_B, K_schur vs K_bass diff=0.47)
                        details: schur K = [...], bass K = [...]
```

最後總表：模組 × 層級 通過率。

### D3. CI / Commit 流程

- `package.json` 加 `"verify:math": "node scripts/verify_*.mjs"`
- 每次 phase 工作 commit 前跑一次，失敗 block commit（或 pre-push hook）。
- 新功能必須附對應 L1+L2 case。

### D4. 已知會失敗的項目（先標記，不阻塞）

- B6-L3 spacecraft sparse B：Schur 應通過、Bass 預期失敗（已知 B 結構限制）。
- B7-L4 Hamiltonian-on-jω 案例：目前 eigenvector-based Schur 在病態時精度差；需 fallback 至 Newton+shift 或留 TODO。

## E. 建議實作順序（3 commits）

1. **Done** (commit `8f86133`) — `test(phase9): add property-based RGA/SVB/decoupler invariants` — B3/B4/B5 的 L2/L3 + C1/C5/C6。Runner：`node control-studio/scripts/verify_phase9_math_core.mjs`。14/14 cases pass，含 200-trial RGA row-sum、Frobenius bound、σ²=eig(GᴴG)、permutation invariance、dynamic→static convergence、SVB log-grid continuity。
2. **Done** (commit `b9fc380`) — `test(phase10): add MPC convergence + Schur/Newton cross-check` — B7-L3 + B8-L2/L3 + C2/C3/C4/C7。Runner：`node control-studio/scripts/verify_phase10_cross_method.mjs`。10/10 pass，含 Schur vs Newton-Kleinman 在 SISO/MIMO random batch K 一致（max Δ=2.6e-14）、CARE 殘差 + P 對稱 + PD + Acl 穩定、LQE/LQR 對偶 P 一致、MPC Riccati horizon=300 fixed point、DARE 殘差 7.9e-16、closed-loop in 單位圓、Cauchy K_0(N)。
3. **Done** (commit `<pending>`) — `test(phase9-10): add edge-case fixtures` — B*-L4 集中。Runner：`node control-studio/scripts/verify_phase9_phase10_edge_cases.mjs`。15/15 pass，含 integrator plant friendly error、rank-deficient SVB σ_min=0、singular G(jω) decoupler 錯誤、uncontrollable LQR/MIMO LQR 友善訊息、CARE R=0 guard、MPC R=0/horizon guard、unstable + 短 horizon MPC 仍收斂、1+L=0 sensitivity 錯誤、NMP plant peak |S|>1、Padé-delay plant 完成、S+T=1 identity。
