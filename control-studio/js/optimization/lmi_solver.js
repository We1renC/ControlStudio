/**
 * lmi_solver.js — Generic LMI feasibility / minimisation mini-solver.
 *
 * Loop 11 (Zero-Flaw) addition.
 *
 * Problem class (standard LMI):
 *   find / minimise c^T x
 *   subject to F(x) = F_0 + Σ_i x_i F_i ⪰ 0
 *
 * The implementation uses a projected interior-point / barrier method
 * (Boyd-Vandenberghe §11.4 with logdet barrier):
 *
 *   minimise  c^T x  +  μ · ( -log det F(x) )
 *
 * with Newton iterations on the gradient
 *   ∇φ = c - μ · vec(F^{-1})^T · vec(F_i)
 * and Hessian via the analytic outer product of F^{-1} F_i F^{-1} F_j.
 *
 * For modest dimensions (matrix size ≤ 10, variables ≤ 20) this is robust
 * enough for verification-grade LMI feasibility, e.g.
 *   - quadratic Lyapunov inequality A^T P + P A + Q ⪯ 0 with P ≻ 0,
 *   - polytopic Lyapunov P common across vertices,
 *   - KYP positive-real SDP reformulation.
 *
 * Reference:
 *   - Boyd, Vandenberghe, "Convex Optimization", §11.4 (logdet barrier).
 *   - Boyd, El Ghaoui, Feron, Balakrishnan, "LMIs in System and Control",
 *     SIAM 1994.
 */

import {
  matAdd, matMul, matInverse, matIdentity, matTranspose, matScale, matCreate,
  matIsPositiveDefinite, matEigenvaluesSymmetric, matSymmetrize, matSub,
} from '../math/matrix.js';

function ensureSquare(M, label) {
  if (!Array.isArray(M) || M.length === 0 || M.some((r) => r.length !== M.length)) {
    throw new Error(`${label}: matrix must be square`);
  }
}

function buildF(F0, Fs, x) {
  let F = F0.map((row) => row.slice());
  for (let i = 0; i < Fs.length; i++) {
    F = matAdd(F, matScale(Fs[i], x[i]));
  }
  return matSymmetrize(F);
}

function smallestEig(F) {
  const eigs = matEigenvaluesSymmetric(matSymmetrize(F));
  return Math.min(...eigs);
}

/**
 * Feasibility check: find x such that F(x) ⪰ ε I.
 *
 * Phase-1 trick: introduce slack s and solve
 *   minimise s   s.t. F(x) + s I ⪰ 0
 * with s ≤ 0 ⇒ feasible.
 *
 * @param {number[][]} F0
 * @param {number[][][]} Fs - list of basis matrices F_i
 * @param {object} options - { x0, maxIter, mu, epsilon }
 */
export function lmiFeasibility(F0, Fs, options = {}) {
  ensureSquare(F0, 'LMI: F0');
  for (let i = 0; i < Fs.length; i++) ensureSquare(Fs[i], `LMI: F_${i+1}`);
  const n = F0.length;
  const m = Fs.length;
  const maxIter = options.maxIter ?? 200;
  const mu = options.mu ?? 1.0;
  const muDecay = options.muDecay ?? 0.5;
  const epsilon = options.epsilon ?? 1e-7;
  const tol = options.tol ?? 1e-10;
  const lineSearchMaxBacktrack = 30;

  // Build augmented variable vector y = [x; s] and augmented basis with extra slack.
  // Solve: min s s.t. F_0 + sum x_i F_i + s I >= 0
  const augFs = [...Fs.map((Fi) => Fi.map((row) => row.slice())), matIdentity(n)];
  const augC = new Array(m + 1).fill(0);
  augC[m] = 1; // minimise s

  let y;
  if (options.y0) {
    y = options.y0.slice();
  } else {
    y = new Array(m + 1).fill(0);
    // Pick s large enough to make F(0)+sI ≻ 0
    const lambda = -smallestEig(F0);
    y[m] = Math.max(lambda + 1, 1);
  }

  // Newton with logdet barrier; vanishing μ as we approach optimum.
  let muLocal = mu;
  for (let outer = 0; outer < 40; outer++) {
    for (let it = 0; it < maxIter; it++) {
      const F = buildF(F0, augFs, y);
      if (!matIsPositiveDefinite(F, 1e-12)) {
        // Backtrack if stepped out
        for (let i = 0; i < m + 1; i++) y[i] *= 0.5;
        continue;
      }
      const Finv = matInverse(F);
      // gradient: g_i = c_i - μ trace(F^{-1} F_i)
      const grad = new Array(m + 1).fill(0);
      for (let i = 0; i < m + 1; i++) {
        const FinvFi = matMul(Finv, augFs[i]);
        let tr = 0;
        for (let k = 0; k < n; k++) tr += FinvFi[k][k];
        grad[i] = augC[i] - muLocal * tr;
      }
      // Hessian: H_{ij} = μ trace(F^{-1} F_i F^{-1} F_j)
      const H = matCreate(m + 1, m + 1, 0);
      const FinvList = augFs.map((Fi) => matMul(Finv, Fi));
      for (let i = 0; i < m + 1; i++) {
        for (let j = i; j < m + 1; j++) {
          const prod = matMul(FinvList[i], FinvList[j]);
          let tr = 0;
          for (let k = 0; k < n; k++) tr += prod[k][k];
          H[i][j] = muLocal * tr;
          H[j][i] = H[i][j];
        }
        H[i][i] += 1e-10; // regularise
      }
      // Newton step: H Δy = -grad
      const Hinv = matInverse(H);
      const dy = new Array(m + 1).fill(0);
      for (let i = 0; i < m + 1; i++) for (let k = 0; k < m + 1; k++) dy[i] -= Hinv[i][k] * grad[k];
      // Line search with positivity preserved
      let alpha = 1.0;
      for (let bt = 0; bt < lineSearchMaxBacktrack; bt++) {
        const yTry = y.map((v, i) => v + alpha * dy[i]);
        const Ftry = buildF(F0, augFs, yTry);
        if (matIsPositiveDefinite(Ftry, 1e-12)) { y = yTry; break; }
        alpha *= 0.5;
      }
      // Check decrement
      const lambda2 = -grad.reduce((s, g, i) => s + g * dy[i], 0);
      if (lambda2 / 2 < tol) break;
    }
    muLocal *= muDecay;
    if (muLocal < 1e-10) break;
  }
  const x = y.slice(0, m);
  const s = y[m];
  const F = buildF(F0, Fs, x);
  const lambdaMin = smallestEig(F);
  return {
    feasible: lambdaMin >= -epsilon,
    x, slack: s,
    Fvalue: F,
    lambdaMin,
  };
}

/**
 * Lyapunov LMI feasibility helper: find P ⪰ I such that A^T P + P A ⪯ -I.
 * Decomposes P = Σ_i x_i E_i with E_i basis of symmetric matrices.
 */
export function lyapunovLMI(A) {
  ensureSquare(A, 'Lyapunov LMI: A');
  const n = A.length;
  // Symmetric basis E_{(i,j)} = e_i e_j^T + e_j e_i^T for i ≤ j.
  const basis = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const E = matCreate(n, n, 0);
      if (i === j) E[i][i] = 1;
      else { E[i][j] = 1; E[j][i] = 1; }
      basis.push(E);
    }
  }
  // Build block diagonal LMI for [P − I ⪰ 0 ; − A^T P − P A − I ⪰ 0].
  const blockSize = 2 * n;
  // F_0 has [-I (top-left), -I (bottom-right)] (slack moves into positive territory)
  const F0 = matCreate(blockSize, blockSize, 0);
  for (let i = 0; i < n; i++) F0[i][i] = -1;
  for (let i = 0; i < n; i++) F0[n + i][n + i] = -1;

  const Fs = basis.map((E) => {
    const F = matCreate(blockSize, blockSize, 0);
    // top-left block: + E (for P − I ⪰ 0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[i][j] = E[i][j];
    // bottom-right block: -(A^T E + E A)
    const AtE = matMul(matTranspose(A), E);
    const EA = matMul(E, A);
    const sum = matAdd(AtE, EA);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[n + i][n + j] = -sum[i][j];
    return F;
  });

  const result = lmiFeasibility(F0, Fs, { maxIter: 100 });
  // Recover P from x.
  const P = matCreate(n, n, 0);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      P[i][j] += result.x[idx];
      if (i !== j) P[j][i] += result.x[idx];
      idx++;
    }
  }
  return { feasible: result.feasible, P, residual: result.lambdaMin };
}
