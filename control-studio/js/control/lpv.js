/**
 * lpv.js — P29-05: Linear Parameter-Varying (LPV) synthesis via gridded SDP/LMIs
 *
 * Approach: Common Quadratic Stability (CQS)
 *   Given N operating points {A_i, B_i, C_i}, find a single quadratic Lyapunov
 *   function V(x) = xᵀPx (P ≻ 0) that certifies stability / supplies a common
 *   state-feedback gain K at all grid points.
 *
 * API:
 *   analyzeLPV(grid, opts)   → feasibility check (stability analysis only)
 *   synthesizeLPV(grid, opts)→ design K via SDP so that all closed-loop points
 *                              share a common Lyapunov function
 *
 * Continuous-time LMI formulations
 * ─────────────────────────────────
 * Analysis  : ∃P ≻ 0 s.t.  Aᵢᵀ P + P Aᵢ ≺ 0   ∀i
 * Synthesis : ∃Q=P⁻¹ ≻ 0, L = KQ  s.t.
 *               Aᵢ Q + Q Aᵢᵀ − Bᵢ L − Lᵀ Bᵢᵀ ≺ 0   ∀i   (congruence transform)
 *             K = L Q⁻¹
 *
 * Both are solved as LMI feasibility problems via solveSDP (ADMM).
 */

import { matInverse, matMul, matTranspose } from '../math/matrix.js';
import { solveLMIFeasibility } from '../math/optimization.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Symmetric basis matrix E_{ci,cj} of size n×n. */
function symmBasis(n, ci, cj) {
  const E = Array.from({ length: n }, () => new Array(n).fill(0));
  E[ci][cj] = 1;
  if (ci !== cj) E[cj][ci] = 1;
  return E;
}

/** Standard basis matrix e_r * e_c^T of size rows × cols. */
function stdBasis(rows, cols, r, c) {
  const E = Array.from({ length: rows }, () => new Array(cols).fill(0));
  E[r][c] = 1;
  return E;
}

/** Matrix add in-place: A[i][j] += scale * B[i][j]. */
function addScaled(A, B, scale = 1) {
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[0].length; j++)
      A[i][j] += scale * B[i][j];
}

/** Copy block B (srcRows × srcCols) into A at offset (rOff, cOff). */
function setBlock(A, B, rOff, cOff) {
  for (let i = 0; i < B.length; i++)
    for (let j = 0; j < B[0].length; j++)
      A[rOff + i][cOff + j] = B[i][j];
}

/** Add block B into A at offset (rOff, cOff). */
function addBlock(A, B, rOff, cOff, scale = 1) {
  for (let i = 0; i < B.length; i++)
    for (let j = 0; j < B[0].length; j++)
      A[rOff + i][cOff + j] += scale * B[i][j];
}

/** A B + Bᵀ Aᵀ (= 2·sym(AB) when B is square) */
function symProduct(A, B) {
  const n = A.length, p = B[0].length;
  const AB = Array.from({ length: n }, () => new Array(p).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < B.length; k++)
      for (let j = 0; j < p; j++)
        AB[i][j] += A[i][k] * B[k][j];
  // Aᵀ: transpose of AB
  const ABt = Array.from({ length: p }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) ABt[j][i] = AB[i][j];
  // AB + ABᵀ
  const S = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i][j] = AB[i][j] + ABt[i][j];
  return S;
}

// ── analyzeLPV ───────────────────────────────────────────────────────────────

/**
 * Check common quadratic stability of an LPV system.
 *
 * Solves: ∃P ≻ 0 s.t. Aᵢᵀ P + P Aᵢ ≺ 0 for all i in grid.
 *
 * @param {Array<{A: number[][]}>} grid  Grid of operating points.
 * @param {object} opts
 * @param {number} [opts.eps=1e-4]       Strict positivity margin ε for P ≻ εI.
 * @param {object} [opts.sdpOpts={}]     Passed to solveLMIFeasibility.
 * @returns {{ feasible, P, eigmin, iterations, method }}
 */
export function analyzeLPV(grid, opts = {}) {
  const { eps = 1e-4, sdpOpts = {} } = opts;
  if (!grid || grid.length === 0) throw new Error('analyzeLPV: grid must be non-empty');

  const n   = grid[0].A.length;
  const N   = grid.length;
  const nq  = (n * (n + 1)) / 2;          // symmetric P variables
  const big = (N + 1) * n;                 // block-diagonal size: N stability + 1 P block

  // ── F0: constant term ─────────────────────────────────────────────────────
  const F0 = Array.from({ length: big }, () => new Array(big).fill(0));
  // P block (block N): constant = −ε I
  for (let i = 0; i < n; i++) F0[N * n + i][N * n + i] = -eps;

  // ── Flist: one n×n×... matrix per variable ────────────────────────────────
  const Flist = Array.from({ length: nq }, () =>
    Array.from({ length: big }, () => new Array(big).fill(0)),
  );

  let pIdx = 0;
  for (let ci = 0; ci < n; ci++) {
    for (let cj = 0; cj <= ci; cj++) {
      const E = symmBasis(n, ci, cj);

      // Stability blocks: ∂/∂p_idx [−(Aᵢᵀ P + P Aᵢ)] = −(Aᵢᵀ E + E Aᵢ)
      for (let k = 0; k < N; k++) {
        const Ak  = grid[k].A;
        const off = k * n;
        // Aᵢᵀ E + E Aᵢ  = symProduct(Aᵢᵀ, E) but E is symmetric so = Aᵢᵀ E + E Aᵢ
        const AkT = matTranspose(Ak);
        const S   = symProduct(AkT, E);     // S = Aᵢᵀ E + (Aᵢᵀ E)ᵀ = Aᵢᵀ E + Eᵀ Aᵢ = Aᵢᵀ E + E Aᵢ
        addBlock(Flist[pIdx], S, off, off, -1);
      }

      // P block: ∂/∂p_idx [P − εI] = E
      addBlock(Flist[pIdx], E, N * n, N * n, 1);
      pIdx++;
    }
  }

  // ── Solve SDP ─────────────────────────────────────────────────────────────
  const r = solveLMIFeasibility(F0, Flist, { maxIter: 5000, rho: 1, tol: 1e-6, ...sdpOpts });

  if (!r.feasible) {
    return { feasible: false, eigmin: r.eigmin, iterations: r.iterations, method: 'lpv-cqs-analyze' };
  }

  // Reconstruct P from r.x
  const P = Array.from({ length: n }, () => new Array(n).fill(0));
  let qi = 0;
  for (let ci = 0; ci < n; ci++) {
    for (let cj = 0; cj <= ci; cj++) {
      P[ci][cj] = r.x[qi];
      P[cj][ci] = r.x[qi];
      qi++;
    }
  }

  return { feasible: true, P, eigmin: r.eigmin, objective: r.objective, iterations: r.iterations, method: 'lpv-cqs-analyze' };
}

// ── synthesizeLPV ─────────────────────────────────────────────────────────

/**
 * Design a common quadratic-stabilizing state-feedback gain K for an LPV system.
 *
 * Solves: ∃Q ≻ 0, L s.t.
 *   Aᵢ Q + Q Aᵢᵀ − Bᵢ L − Lᵀ Bᵢᵀ ≺ 0   ∀i
 * then K = L Q⁻¹.
 *
 * @param {Array<{A: number[][], B: number[][]}>} grid  Grid of operating points.
 *   A: n×n state matrix, B: n×m input matrix (same n,m across all points).
 * @param {object} opts
 * @param {number} [opts.eps=1e-4]   Strict positivity margin for Q ≻ εI.
 * @param {object} [opts.sdpOpts={}] Passed to solveLMIFeasibility.
 * @returns {{ feasible, K, P, Q, L, eigmin, iterations, method }}
 */
export function synthesizeLPV(grid, opts = {}) {
  const { eps = 1e-4, sdpOpts = {} } = opts;
  if (!grid || grid.length === 0) throw new Error('synthesizeLPV: grid must be non-empty');

  const n   = grid[0].A.length;
  const m   = grid[0].B[0].length;      // number of inputs
  const N   = grid.length;
  const nq  = (n * (n + 1)) / 2;        // symmetric Q variables
  const nl  = m * n;                     // L variables (m×n)
  const nx  = nq + nl;                   // total decision variables
  const big = (N + 1) * n;              // block-diagonal size

  // ── F0: constant term ─────────────────────────────────────────────────────
  const F0 = Array.from({ length: big }, () => new Array(big).fill(0));
  for (let i = 0; i < n; i++) F0[N * n + i][N * n + i] = -eps;

  // ── Flist ─────────────────────────────────────────────────────────────────
  const Flist = Array.from({ length: nx }, () =>
    Array.from({ length: big }, () => new Array(big).fill(0)),
  );

  // --- Q variables (indices 0 .. nq-1) ---
  let qIdx = 0;
  for (let ci = 0; ci < n; ci++) {
    for (let cj = 0; cj <= ci; cj++) {
      const E = symmBasis(n, ci, cj);  // basis for Q[ci][cj]

      // Stability block k: ∂/∂q_idx [−(Aᵢ Q + Q Aᵢᵀ)] = −(Aᵢ E + E Aᵢᵀ)
      for (let k = 0; k < N; k++) {
        const Ak  = grid[k].A;
        const off = k * n;
        const S   = symProduct(Ak, E);   // Aᵢ E + (Aᵢ E)ᵀ = Aᵢ E + E Aᵢᵀ
        addBlock(Flist[qIdx], S, off, off, -1);
      }

      // Q ≻ εI block: ∂/∂q_idx [Q − εI] = E
      addBlock(Flist[qIdx], E, N * n, N * n, 1);
      qIdx++;
    }
  }

  // --- L variables (indices nq .. nx-1) ---
  // L[lr][lc] contributes via:  Bᵢ L + Lᵀ Bᵢᵀ
  // ∂/∂L[lr][lc] [Bᵢ L + Lᵀ Bᵢᵀ] = Bᵢ Eᵣ꜀ + Eᵣ꜀ᵀ Bᵢᵀ
  // Eᵣ꜀ = e_{lr} e_{lc}ᵀ  (m×n)
  // Bᵢ Eᵣ꜀ is n×n: row i → Bᵢ[i][lr] only at col lc
  // Eᵣ꜀ᵀ Bᵢᵀ is n×n: row lc, col j → Bᵢ[j][lr]
  for (let lr = 0; lr < m; lr++) {
    for (let lc = 0; lc < n; lc++) {
      const lIdx = nq + lr * n + lc;

      for (let k = 0; k < N; k++) {
        const Bk  = grid[k].B;
        const off = k * n;
        for (let row = 0; row < n; row++) {
          for (let col = 0; col < n; col++) {
            // (Bᵢ Eᵣ꜀)[row][col] = Bᵢ[row][lr] * δ(col==lc)
            // (Eᵣ꜀ᵀ Bᵢᵀ)[row][col] = δ(row==lc) * Bᵢ[col][lr]
            let val = 0;
            if (col === lc) val += Bk[row][lr];
            if (row === lc) val += Bk[col][lr];
            Flist[lIdx][off + row][off + col] += val;
          }
        }
      }
      // L variables do not affect the Q block
    }
  }

  // ── Solve LMI feasibility ─────────────────────────────────────────────────
  const r = solveLMIFeasibility(F0, Flist, { maxIter: 5000, rho: 1, tol: 1e-6, ...sdpOpts });

  if (!r.feasible) {
    return { feasible: false, eigmin: r.eigmin, iterations: r.iterations, method: 'lpv-cqs-sdp' };
  }

  // ── Reconstruct Q and L ──────────────────────────────────────────────────
  const Qmat = Array.from({ length: n }, () => new Array(n).fill(0));
  let qi = 0;
  for (let ci = 0; ci < n; ci++) {
    for (let cj = 0; cj <= ci; cj++) {
      Qmat[ci][cj] = r.x[qi];
      Qmat[cj][ci] = r.x[qi];
      qi++;
    }
  }

  const L = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let lrow = 0; lrow < m; lrow++)
    for (let lcol = 0; lcol < n; lcol++)
      L[lrow][lcol] = r.x[nq + lrow * n + lcol];

  // K = L Q⁻¹,  P = Q⁻¹  (Lyapunov matrix)
  const P = matInverse(Qmat);
  const K = matMul(L, P);

  return {
    feasible: true,
    K,                  // state-feedback gain  m×n
    L,                  // L = K Q (SDP variable)
    Q: Qmat,            // Lyapunov variable Q = P⁻¹
    P,                  // Lyapunov matrix P = Q⁻¹
    eigmin: r.eigmin,
    objective: r.objective,
    iterations: r.iterations,
    method: 'lpv-cqs-sdp',
  };
}
