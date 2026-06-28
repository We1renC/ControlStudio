/**
 * singular_perturbation.js — Kokotović two-time-scale decomposition.
 *
 * Loop 15 (Zero-Flaw) addition.
 *
 * Standard singular perturbation form:
 *   ẋ = f(x, z, u, ε),    x ∈ ℝⁿ (slow)
 *   ε ż = g(x, z, u, ε),   z ∈ ℝᵐ (fast)
 *
 * For ε → 0 the fast dynamics are algebraically constrained:
 *   0 = g(x, z, u, 0)  ⇒  z = h(x, u)   (quasi-steady-state manifold)
 *
 * Reduced (slow) model:
 *   ẋ = f(x, h(x, u), u, 0)
 *
 * Boundary-layer (fast) correction:
 *   z_b = z − h(x, u),   dz_b/dτ = g(x, z_b + h(x, u), u, 0)
 *   with stretched time τ = t/ε.
 *
 * Tikhonov's theorem states the actual solution stays O(ε) close to the
 * reduced + boundary-layer composite if the boundary-layer model is
 * exponentially stable.
 *
 * Implementation:
 *   - Linear case ẋ = A_11 x + A_12 z + B_1 u; ε ż = A_21 x + A_22 z + B_2 u
 *   - Quasi-steady-state: z* = − A_22^{-1} (A_21 x + B_2 u)
 *   - Reduced A_r = A_11 − A_12 A_22^{-1} A_21, B_r = B_1 − A_12 A_22^{-1} B_2
 *
 * Reference:
 *   - Kokotović, Khalil, O'Reilly, "Singular Perturbation Methods in
 *     Control: Analysis and Design", SIAM 1986.
 *   - Naidu, "Singular Perturbation Methodology in Control Systems",
 *     IEE 1988.
 *   - Khalil, "Nonlinear Systems" §11.
 */

import {
  matMul, matSub, matInverse, matCreate,
} from '../math/matrix.js';

/**
 * Decompose a singularly-perturbed LTI system into reduced (slow) and
 * boundary-layer (fast) models.
 *
 * @param {object} system - { A11, A12, A21, A22, B1, B2 }
 * @returns { reduced: { A, B }, boundaryLayer: { A } }
 */
export function singularPerturbationDecomposition(system) {
  const { A11, A12, A21, A22, B1, B2 } = system;
  if (!A11 || !A12 || !A21 || !A22) {
    throw new Error('SP: must provide A11, A12, A21, A22 blocks');
  }
  const A22inv = matInverse(A22);
  // Reduced slow dynamics
  const A12_A22inv = matMul(A12, A22inv);
  const A12_A22inv_A21 = matMul(A12_A22inv, A21);
  const Ar = matSub(A11, A12_A22inv_A21);
  let Br = null;
  if (B1 && B2) {
    const A12_A22inv_B2 = matMul(A12_A22inv, B2);
    Br = matSub(B1, A12_A22inv_B2);
  }
  return {
    reduced: { A: Ar, B: Br },
    boundaryLayer: { A: A22 },
    A22inv,
  };
}

/**
 * Simulate the slow reduced model alongside the original singularly-
 * perturbed system for verification of Tikhonov's O(ε) approximation
 * theorem. Returns both trajectories so the harness can confirm
 *   ‖x(t) − x_red(t)‖ ≤ k ε  for small ε.
 */
export function simulateBothScales(system, x0, z0, options = {}) {
  const Ts = options.Ts ?? 1e-4;
  const T = options.T ?? 1.0;
  const epsilon = options.epsilon ?? 0.01;
  const u = options.uTraj ?? null;
  const N = Math.floor(T / Ts);
  const { A11, A12, A21, A22, B1, B2 } = system;
  const { reduced } = singularPerturbationDecomposition(system);

  // Original (slow x + fast z) integration with forward Euler
  let x = x0.slice();
  let z = z0.slice();
  const xOrig = new Array(N + 1);
  const xRed = new Array(N + 1);
  let xR = x0.slice();
  xOrig[0] = x.slice(); xRed[0] = xR.slice();
  const t = new Array(N + 1);
  t[0] = 0;
  for (let k = 0; k < N; k++) {
    const uk = u ? u[k] : new Array(B1 ? B1[0].length : 0).fill(0);
    // ẋ = A11 x + A12 z + B1 u
    const dxOrig = new Array(x.length).fill(0);
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < x.length; j++) dxOrig[i] += A11[i][j] * x[j];
      for (let j = 0; j < z.length; j++) dxOrig[i] += A12[i][j] * z[j];
      if (B1) for (let j = 0; j < uk.length; j++) dxOrig[i] += B1[i][j] * uk[j];
    }
    // ε ż = A21 x + A22 z + B2 u
    const dzOrig = new Array(z.length).fill(0);
    for (let i = 0; i < z.length; i++) {
      for (let j = 0; j < x.length; j++) dzOrig[i] += A21[i][j] * x[j];
      for (let j = 0; j < z.length; j++) dzOrig[i] += A22[i][j] * z[j];
      if (B2) for (let j = 0; j < uk.length; j++) dzOrig[i] += B2[i][j] * uk[j];
      dzOrig[i] /= epsilon;
    }
    for (let i = 0; i < x.length; i++) x[i] += Ts * dxOrig[i];
    for (let i = 0; i < z.length; i++) z[i] += Ts * dzOrig[i];

    // Reduced slow model: ẋ_R = A_r x_R + B_r u
    const dxRed = new Array(xR.length).fill(0);
    for (let i = 0; i < xR.length; i++) {
      for (let j = 0; j < xR.length; j++) dxRed[i] += reduced.A[i][j] * xR[j];
      if (reduced.B) for (let j = 0; j < uk.length; j++) dxRed[i] += reduced.B[i][j] * uk[j];
    }
    for (let i = 0; i < xR.length; i++) xR[i] += Ts * dxRed[i];

    xOrig[k + 1] = x.slice();
    xRed[k + 1] = xR.slice();
    t[k + 1] = (k + 1) * Ts;
  }
  // Worst-case slow deviation
  let worst = 0;
  for (let k = 0; k < N + 1; k++) {
    let nrm = 0;
    for (let i = 0; i < x0.length; i++) nrm += Math.pow(xOrig[k][i] - xRed[k][i], 2);
    nrm = Math.sqrt(nrm);
    if (nrm > worst) worst = nrm;
  }
  return { t, xOrig, xRed, worstDeviation: worst };
}
