/**
 * krasovskii_delay.js — Lyapunov-Krasovskii functional for time-delay
 * system stability (delay-dependent LMI).
 *
 * Loop 12 (Zero-Flaw) addition.
 *
 * Time-delay system: ẋ(t) = A_0 x(t) + A_1 x(t − τ),  τ ∈ [0, τ_max]
 *
 * Lyapunov-Krasovskii functional (Gu-Kharitonov-Chen 2003):
 *   V(x_t) = x(t)^T P x(t) + ∫_{t−τ}^t x(s)^T Q x(s) ds + ...
 *
 * Delay-dependent stability LMI (simple Razumikhin-style sufficient form):
 *   [ P A_0 + A_0^T P + Q    P A_1 ]      ≺ 0
 *   [       (P A_1)^T          -Q  ]
 *
 * If feasible for some P ≻ 0, Q ≻ 0, the system is asymptotically stable
 * for all delays τ ≥ 0 (delay-independent). For tighter delay-dependent
 * bounds one adds Σ Q_d τ_max terms; the implementation focuses on the
 * delay-independent baseline that captures the spirit.
 *
 * Reference:
 *   - Gu, Kharitonov, Chen, "Stability of Time-Delay Systems", Birkhäuser
 *     2003.
 *   - Fridman, "Introduction to Time-Delay Systems", Springer 2014.
 *   - Niculescu, "Delay Effects on Stability", Springer 2001.
 */

import {
  matCreate, matAdd, matMul, matSub, matTranspose, matIdentity,
  matIsPositiveDefinite, matEigenvaluesSymmetric, matSymmetrize,
} from '../math/matrix.js';
import { lmiFeasibility } from '../optimization/lmi_solver.js';

/**
 * Test delay-independent stability of ẋ = A_0 x + A_1 x(t-τ) via the
 * Lyapunov-Krasovskii LMI feasibility.
 *
 * Returns { stable, P, Q, slack }.
 */
export function krasovskiiDelayLMI(A0, A1, options = {}) {
  if (A0.length !== A1.length || A0.length !== A0[0].length) {
    throw new Error('LK-LMI: A0 and A1 must be square and same size');
  }
  const n = A0.length;
  const blockSize = 2 * n;

  // Build symmetric basis for P (n×n) and Q (n×n).
  const symBasis = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const E = matCreate(n, n, 0);
      if (i === j) E[i][i] = 1;
      else { E[i][j] = 1; E[j][i] = 1; }
      symBasis.push(E);
    }
  }
  const nSym = symBasis.length;
  // x = [vec(P); vec(Q)], length 2 nSym.

  // F_0: top-left -P, top-right 0, bottom-right -Q → for negative-definite LMI
  // we form the augmented diag structure:
  //   [ -(P A_0 + A_0^T P + Q)   -P A_1                 ]
  //   [   −(P A_1)^T              Q                    ]
  // and require ≽ 0 to get the original ≼ 0 condition.
  // For simplicity, encode the constraint directly:
  //   M_total = diag(P − I, Q − I, −(P A_0 + A_0^T P + Q) − ε I, etc.)
  // The simplest helpful form: positive definiteness of P, of Q, and of
  //   −[P A_0 + A_0^T P + Q,  P A_1; (P A_1)^T, −Q]
  // Implementation: stack all three diagonal blocks.

  const totalBlock = n + n + blockSize;     // P>0 block + Q>0 block + LMI block
  const F0 = matCreate(totalBlock, totalBlock, 0);
  // F_0 starts as −I in P-block (constant)
  for (let i = 0; i < n; i++) F0[i][i] = -1;
  // Q-block constant: −I
  for (let i = 0; i < n; i++) F0[n + i][n + i] = -1;
  // LMI-block constant: 0 (will be filled by basis terms)

  const Fs = [];
  // P basis
  for (let k = 0; k < nSym; k++) {
    const E = symBasis[k];
    const F = matCreate(totalBlock, totalBlock, 0);
    // P-block: +E
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[i][j] = E[i][j];
    // LMI top-left: −(E A_0 + A_0^T E)
    const EA = matMul(E, A0);
    const AtE = matMul(matTranspose(A0), E);
    const sum = matAdd(EA, AtE);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[2 * n + i][2 * n + j] = -sum[i][j];
    // LMI top-right: −E A_1 ; bottom-left: −(E A_1)^T
    const EA1 = matMul(E, A1);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[2 * n + i][2 * n + n + j] = -EA1[i][j];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[2 * n + n + i][2 * n + j] = -EA1[j][i];
    Fs.push(F);
  }
  // Q basis
  for (let k = 0; k < nSym; k++) {
    const E = symBasis[k];
    const F = matCreate(totalBlock, totalBlock, 0);
    // Q-block: +E
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[n + i][n + j] = E[i][j];
    // LMI top-left: −E
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[2 * n + i][2 * n + j] = -E[i][j];
    Fs.push(F);
  }

  const res = lmiFeasibility(F0, Fs, { maxIter: 80 });

  // Recover P, Q
  const recoverSymm = (vals) => {
    const Mat = matCreate(n, n, 0);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        Mat[i][j] += vals[idx];
        if (i !== j) Mat[j][i] += vals[idx];
        idx++;
      }
    }
    return Mat;
  };
  const P = recoverSymm(res.x.slice(0, nSym));
  const Q = recoverSymm(res.x.slice(nSym, 2 * nSym));

  // Empirical stability check on the closed expression
  const lmiResidual = computeLmiResidual(A0, A1, P, Q);
  return {
    stable: res.feasible && lmiResidual <= 1e-3,
    feasible: res.feasible,
    P, Q,
    slack: res.lambdaMin,
    lmiResidual,
  };
}

function computeLmiResidual(A0, A1, P, Q) {
  const n = A0.length;
  const M11 = matAdd(matAdd(matMul(P, A0), matMul(matTranspose(A0), P)), Q);
  const M12 = matMul(P, A1);
  const M22 = scaleMatrix(Q, -1);
  // Build full block matrix
  const block = matCreate(2 * n, 2 * n, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      block[i][j] = M11[i][j];
      block[i][n + j] = M12[i][j];
      block[n + i][j] = M12[j][i];
      block[n + i][n + j] = M22[i][j];
    }
  }
  // For stability we need block ≼ 0, so the largest eigenvalue ≤ 0.
  const eigs = matEigenvaluesSymmetric(matSymmetrize(block));
  return Math.max(...eigs);
}

function scaleMatrix(M, s) { return M.map((row) => row.map((v) => v * s)); }
