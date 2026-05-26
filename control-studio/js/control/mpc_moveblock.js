/**
 * mpc_moveblock.js — Tier G2: MPC Move Blocking
 *
 * Move blocking reduces the number of decision variables in MPC by holding
 * the control input constant over groups of time steps. Given block lengths
 * [n_1, n_2, ..., n_M] summing to the prediction horizon N, the control
 * sequence U ∈ R^{N·m} is parameterised as:
 *
 *     U = E · U_block,   where  E ∈ R^{N·m × M·m}
 *
 * E is block-structured: each row group of n_k steps is filled with the
 * identity for block k.
 *
 * Condensed (sequential) unconstrained MPC formulation:
 *     x_{k+1} = Ad x_k + Bd u_k
 *     X = Φ · x_0 + Γ · U
 *     J = Σ_{k=0}^{N-1} (x_k' Q x_k + u_k' R u_k) + x_N' Qf x_N
 *
 * After move blocking, solve:
 *     min_{U_b}  J(U = E U_b)
 *
 *     U_b = -H^{-1} g,  with
 *     H = (Γ E)' Q_bar (Γ E) + E' R_bar E
 *     g = (Γ E)' Q_bar Φ x_0
 *
 * Returns the first block control u_first = U_b[0..m-1], applied in receding
 * horizon fashion.
 */

import {
  matCreate, matIdentity, matMul, matTranspose, matAdd, matSub,
  matInverse, matSymmetrize,
} from '../math/matrix.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the block expansion matrix E.
 *   E ∈ R^{N × M}  for scalar inputs; rows belonging to block k all have a 1
 *   in column k. For vector inputs of size m, the result is N·m × M·m built
 *   via Kronecker product with I_m (handled outside this helper).
 *
 * @param {number[]} blockLengths e.g. [1, 2, 4]  -> N = 7, M = 3
 * @returns {number[][]} N × M expansion matrix
 */
export function buildBlockExpansion(blockLengths) {
  if (!Array.isArray(blockLengths) || blockLengths.length === 0) {
    throw new Error('blockLengths must be non-empty array');
  }
  for (const len of blockLengths) {
    if (!Number.isInteger(len) || len <= 0) {
      throw new Error(`block length must be positive integer, got ${len}`);
    }
  }
  const N = blockLengths.reduce((s, v) => s + v, 0);
  const M = blockLengths.length;
  const E = matCreate(N, M);
  let row = 0;
  for (let b = 0; b < M; b++) {
    for (let k = 0; k < blockLengths[b]; k++) {
      E[row][b] = 1;
      row++;
    }
  }
  return E;
}

/**
 * Expand E (N × M) to (N·m × M·m) via Kronecker with I_m.
 * Used when control vector has dim m > 1.
 */
function expandForVectorInput(E, m) {
  if (m === 1) return E;
  const N = E.length;
  const M = E[0].length;
  const big = matCreate(N * m, M * m);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const v = E[i][j];
      if (v === 0) continue;
      for (let p = 0; p < m; p++) {
        big[i * m + p][j * m + p] = v;
      }
    }
  }
  return big;
}

/**
 * Build the prediction matrices Φ (Nn × n) and Γ (Nn × Nm) for the linear system
 *   X = Φ x_0 + Γ U
 */
function buildPredictionMatrices(Ad, Bd, N) {
  const n = Ad.length;
  const m = Bd[0].length;
  const Phi = matCreate(N * n, n);          // stacks Ad, Ad², ..., Ad^N
  const Gam = matCreate(N * n, N * m);      // lower block-triangular Toeplitz
  const Akpows = [matIdentity(n)];
  for (let k = 1; k <= N; k++) {
    Akpows.push(matMul(Ad, Akpows[k - 1]));
  }
  for (let i = 0; i < N; i++) {
    // Phi rows [i*n .. i*n+n-1] = Ad^(i+1)
    const Apow = Akpows[i + 1];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        Phi[i * n + r][c] = Apow[r][c];
      }
    }
    // Gamma: Gam[i*n + r][j*m + c] = (Ad^(i-j) Bd)[r][c]  for j <= i, else 0
    for (let j = 0; j <= i; j++) {
      const Apb = matMul(Akpows[i - j], Bd);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < m; c++) {
          Gam[i * n + r][j * m + c] = Apb[r][c];
        }
      }
    }
  }
  return { Phi, Gam };
}

function buildBlockDiag(M, count) {
  const k = M.length;
  const out = matCreate(k * count, k * count);
  for (let b = 0; b < count; b++) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        out[b * k + i][b * k + j] = M[i][j];
      }
    }
  }
  return out;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the move-blocked finite-horizon LQR feedback as a sequence of
 * effective gains for the BLOCK variables. For now returns the first-step
 * gain K such that u_first = -K x. (Used for verification cross-checks.)
 *
 * @param {number[][]} Ad
 * @param {number[][]} Bd
 * @param {number[][]} Q
 * @param {number[][]} R
 * @param {number}     N    Prediction horizon (= sum of blockLengths)
 * @param {number[]}   blockLengths
 * @returns {number[][]} K (m × n)
 */
export function blockedFiniteHorizonLqr(Ad, Bd, Q, R, N, blockLengths) {
  const n = Ad.length;
  const m = Bd[0].length;
  if (blockLengths.reduce((s, v) => s + v, 0) !== N) {
    throw new Error('sum(blockLengths) must equal N');
  }
  const M = blockLengths.length;
  const E = expandForVectorInput(buildBlockExpansion(blockLengths), m);
  const { Phi, Gam } = buildPredictionMatrices(Ad, Bd, N);
  const Qbar = buildBlockDiag(Q, N);
  const Rbar = buildBlockDiag(R, N);
  // H = (Γ E)' Q_bar (Γ E) + E' R_bar E
  const GamE = matMul(Gam, E);
  const Et = matTranspose(E);
  const H = matAdd(
    matMul(matMul(matTranspose(GamE), Qbar), GamE),
    matMul(matMul(Et, Rbar), E)
  );
  const Hsym = matSymmetrize(H);
  // K_block: U_b = -H^{-1} (Γ E)' Q_bar Φ · x0
  // For x0 = x, u_first = first m rows of U_b
  const Hi = matInverse(Hsym);
  const G = matMul(matMul(matTranspose(GamE), Qbar), Phi);  // (M·m) × n
  const Kbig = matMul(Hi, G);
  // Extract first m rows (corresponds to u_first)
  const K = matCreate(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      K[i][j] = Kbig[i][j];
    }
  }
  return K;
}

/**
 * Simulate move-blocked MPC for a given initial state.
 *
 * @param {number[][]} Ad
 * @param {number[][]} Bd
 * @param {number[][]} Q
 * @param {number[][]} R
 * @param {number}     N         Prediction horizon (= sum(blockLengths))
 * @param {number[]}   blockLengths
 * @param {number[][]} x0        n × 1 initial state
 * @param {object}     [opts]
 * @param {number}     [opts.steps=N]  Simulation steps (closed loop, receding horizon)
 * @returns {{ states: number[][][], controls: number[][][], K_block: number[][] }}
 */
export function movedBlockingMpcSimulate(Ad, Bd, Q, R, N, blockLengths, x0, opts = {}) {
  const steps = opts.steps ?? N;
  const n = Ad.length;
  const m = Bd[0].length;
  const K = blockedFiniteHorizonLqr(Ad, Bd, Q, R, N, blockLengths);
  const states = [x0.map((r) => r.slice())];
  const controls = [];
  let x = x0.map((r) => r.slice());
  for (let k = 0; k < steps; k++) {
    // u = -K x
    const u = matCreate(m, 1);
    for (let i = 0; i < m; i++) {
      let v = 0;
      for (let j = 0; j < n; j++) v -= K[i][j] * x[j][0];
      u[i][0] = v;
    }
    controls.push(u);
    const xNext = matAdd(matMul(Ad, x), matMul(Bd, u));
    states.push(xNext);
    x = xNext;
  }
  return { states, controls, K_block: K, horizon: N, steps, blockLengths };
}
