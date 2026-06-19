/**
 * game_theoretic.js — Nash and Stackelberg LQ differential games.
 *
 * Loop 7 (Zero-Flaw) addition. Two-player Nash equilibrium LQ game
 * (Basar-Olsder 1998) and Stackelberg leader-follower control. The
 * implementation handles the symmetric two-player linear-quadratic case
 * with coupled algebraic Riccati equations (CARE_1, CARE_2) solved by
 * iteration on K_1, K_2 from initial stabilising gains.
 *
 * Plant: ẋ = A x + B_1 u_1 + B_2 u_2
 * Players' costs:
 *   J_i = ∫₀^∞ x^T Q_i x + u_i^T R_i u_i + u_{-i}^T S_i u_{-i} dt
 * Nash solution gains K_i = R_i^{-1} B_i^T P_i with coupled CAREs:
 *   A^T P_i + P_i A − P_i (B_1 R_1^{-1} B_1^T + B_2 R_2^{-1} B_2^T) P_i + Q_i = 0
 *   coupled through closed-loop A_cl = A − B_1 K_1 − B_2 K_2.
 *
 * Stackelberg (leader = 1): leader chooses u_1 anticipating follower's
 * best response u_2 = -K_2(x); solve nested optimisation by Lyapunov-style
 * iteration with weight transfer.
 *
 * Reference:
 *   - Basar, Olsder, "Dynamic Noncooperative Game Theory", SIAM Classics
 *     in Applied Mathematics, 1998.
 *   - Engwerda, "LQ Dynamic Optimization and Differential Games", Wiley
 *     2005.
 */

import { matAdd, matMul, matSub, matInverse, matTranspose, matIdentity } from '../math/matrix.js';
import { solveLqr } from './state-feedback.js';

/**
 * Iterative Nash LQ solver.
 *
 * Returns the equilibrium gains (K_1, K_2), the associated CARE solutions
 * (P_1, P_2), and the closed-loop A_cl.
 */
export function solveLqNash(A, B1, B2, weights, options = {}) {
  const { Q1, R1, Q2, R2 } = weights;
  const maxIter = options.maxIter ?? 50;
  const tol = options.tol ?? 1e-8;

  const lqr1 = solveLqr(A, B1, Q1, R1);
  const lqr2 = solveLqr(A, B2, Q2, R2);
  let K1 = lqr1.K;
  let K2 = lqr2.K;
  let Pprev1 = lqr1.P;
  let Pprev2 = lqr2.P;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const Acl1 = matSub(A, matMul(B2, K2));   // effective plant for player 1
    const Acl2 = matSub(A, matMul(B1, K1));
    const lqrA = solveLqr(Acl1, B1, Q1, R1);
    const lqrB = solveLqr(Acl2, B2, Q2, R2);
    K1 = lqrA.K;
    K2 = lqrB.K;
    const dP1 = frobeniusDiff(lqrA.P, Pprev1);
    const dP2 = frobeniusDiff(lqrB.P, Pprev2);
    Pprev1 = lqrA.P;
    Pprev2 = lqrB.P;
    if (Math.max(dP1, dP2) < tol) break;
  }
  return {
    K1, K2,
    P1: Pprev1, P2: Pprev2,
    iterations: iter,
    closedLoopA: matSub(matSub(A, matMul(B1, K1)), matMul(B2, K2)),
  };
}

/**
 * Stackelberg leader-follower LQ solution: leader 1 commits to a gain that
 * incorporates the follower's rational response. We approximate the
 * Stackelberg solution by iterating: given current K_1, solve follower's
 * best response K_2 (a single LQR against A − B_1 K_1); compute the
 * resulting cost J_1 surrogate and gradient-step K_1 to reduce J_1.
 *
 * For didactic purposes the implementation returns the final pair and the
 * J_1 trajectory; full closed-form Stackelberg requires solving an
 * additional Riccati for the leader's value function.
 */
export function solveLqStackelberg(A, B1, B2, weights, options = {}) {
  const { Q1, R1, Q2, R2 } = weights;
  const iterations = options.iterations ?? 30;
  const stepSize = options.stepSize ?? 0.1;
  const lqr1 = solveLqr(A, B1, Q1, R1);
  let K1 = lqr1.K;
  const J1History = [];
  let K2 = null;
  for (let iter = 0; iter < iterations; iter++) {
    const Acl = matSub(A, matMul(B1, K1));
    const lqrF = solveLqr(Acl, B2, Q2, R2);
    K2 = lqrF.K;
    // J_1 surrogate: trace(P_1) where P_1 solves Lyap(A_cl_total, Q_1 + K_1^T R_1 K_1)
    const Atotal = matSub(matSub(A, matMul(B1, K1)), matMul(B2, K2));
    const QAug = matAdd(Q1, matMul(matTranspose(K1), matMul(R1, K1)));
    const Plyap = lyap(Atotal, QAug);
    J1History.push(trace(Plyap));
    // Gradient step on K_1: numerical perturbation, decrease finite-difference
    const eps = 1e-4;
    const grad = new Array(K1.length).fill(0).map(() => new Array(K1[0].length).fill(0));
    for (let i = 0; i < K1.length; i++) {
      for (let j = 0; j < K1[0].length; j++) {
        const Kp = K1.map((row) => row.slice());
        Kp[i][j] += eps;
        const AclP = matSub(matSub(A, matMul(B1, Kp)), matMul(B2, K2));
        const QAugP = matAdd(Q1, matMul(matTranspose(Kp), matMul(R1, Kp)));
        try {
          const Pp = lyap(AclP, QAugP);
          grad[i][j] = (trace(Pp) - J1History[J1History.length - 1]) / eps;
        } catch (e) {
          grad[i][j] = 0; // unstable, skip
        }
      }
    }
    // step
    for (let i = 0; i < K1.length; i++) {
      for (let j = 0; j < K1[0].length; j++) K1[i][j] -= stepSize * grad[i][j];
    }
  }
  return { K1, K2, J1History };
}

function frobeniusDiff(A, B) {
  let s = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[0].length; j++) {
      const d = A[i][j] - B[i][j];
      s += d * d;
    }
  }
  return Math.sqrt(s);
}

function trace(A) {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += A[i][i];
  return s;
}

function lyap(A, Q) {
  // Solve A^T P + P A + Q = 0 via vec-trick (Kronecker).
  // For small dimensions only.
  const n = A.length;
  const At = matTranspose(A);
  const I = matIdentity(n);
  const kron = (X, Y) => {
    const p = X.length, q = X[0].length, r = Y.length, s = Y[0].length;
    const out = new Array(p * r);
    for (let i = 0; i < p * r; i++) out[i] = new Array(q * s).fill(0);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < q; j++) {
        for (let k = 0; k < r; k++) {
          for (let l = 0; l < s; l++) out[i * r + k][j * s + l] = X[i][j] * Y[k][l];
        }
      }
    }
    return out;
  };
  const LHS = matAdd(kron(I, At), kron(At, I));
  const rhs = new Array(n * n).fill(0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) rhs[j * n + i] = -Q[i][j];
  // Solve LHS x = rhs by Gaussian elimination
  const M = LHS.map((row) => row.slice());
  for (let i = 0; i < n * n; i++) M[i].push(rhs[i]);
  for (let i = 0; i < n * n; i++) {
    let pivot = i;
    for (let k = i + 1; k < n * n; k++) if (Math.abs(M[k][i]) > Math.abs(M[pivot][i])) pivot = k;
    if (Math.abs(M[pivot][i]) < 1e-12) throw new Error('lyap: singular');
    [M[i], M[pivot]] = [M[pivot], M[i]];
    for (let k = i + 1; k < n * n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n * n; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = new Array(n * n);
  for (let i = n * n - 1; i >= 0; i--) {
    let s = M[i][n * n];
    for (let j = i + 1; j < n * n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  const P = new Array(n);
  for (let i = 0; i < n; i++) P[i] = new Array(n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) P[i][j] = x[j * n + i];
  return P;
}
