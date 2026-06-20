/**
 * unknown_input_observer.js — Unknown Input Observer (UIO) for fault
 * detection and isolation (Darouach-Zasadzinski 1994).
 *
 * Loop 10 (Zero-Flaw) addition.
 *
 * Plant with unknown input d(t):
 *   ẋ = A x + B u + E d
 *   y  = C x
 *
 * UIO structure (full-order):
 *   ż = F z + T B u + K y
 *   x̂ = z + H y
 *
 * Existence conditions for d ∈ ℝ^q with rank(C E) = q:
 *   - rank(C E) = q
 *   - (C, A_1) detectable, where A_1 = A − E (C E)^+ C A
 *
 * Design (Darouach-Zasadzinski-Xu 1994):
 *   H = E (C E)^+
 *   T = I − H C
 *   A_1 = T A
 *   K_1 chosen so F = A_1 − K_1 C is Hurwitz (e.g., via pole placement /
 *   LQE on (A_1, C)).
 *   K = K_1 + F H
 *
 * Reference:
 *   - Darouach, Zasadzinski, Xu, "Full-order observers for linear systems
 *     with unknown inputs", IEEE TAC 39(3), 1994.
 *   - Chen, Patton, "Robust Model-Based Fault Diagnosis for Dynamic
 *     Systems", Kluwer 1999.
 */

import {
  matAdd, matSub, matMul, matTranspose, matInverse, matIdentity, matCreate, matRank,
  matVecMul,
} from '../math/matrix.js';
import { placeObserver as _placeObs, solveLqe } from '../control/state-feedback.js';

/**
 * Compute the Moore-Penrose pseudoinverse of an m×n matrix (m ≥ n, full
 * column rank) via A^+ = (A^T A)^{-1} A^T.
 */
function pseudoInverse(A) {
  const At = matTranspose(A);
  const AtA = matMul(At, A);
  const AtAinv = matInverse(AtA);
  return matMul(AtAinv, At);
}

/**
 * Design a full-order UIO for the system (A, B, C, E).
 *
 * @param {number[][]} A, B, C, E
 * @param {object} options - { desiredPoles: number[] }
 * @returns { F, T, K, H, x̂Recover(zSignal, ySignal) }
 */
export function designUIO(A, B, C, E, options = {}) {
  const n = A.length;
  const q = E[0].length;
  const p = C.length;
  const CE = matMul(C, E);
  if (matRank(CE, 1e-9) < q) {
    throw new Error('UIO: rank(C·E) < q, full-order UIO does not exist');
  }
  const H = matMul(E, pseudoInverse(CE));   // n × p
  const T = matSub(matIdentity(n), matMul(H, C));  // n × n
  const A1 = matMul(T, A);                  // n × n
  // Place observer poles for (A_1, C). If desiredPoles not given, use stable
  // defaults at -2, -3, ... -2-n*0.1.
  // Construct K_1 so that F = A_1 − K_1 C has prescribed Hurwitz dynamics.
  // For the common verification case (square C invertible) we use the closed-
  // form K_1 = (A_1 − F_desired) C^{-1}. For non-square / rank-deficient C the
  // caller may supply `options.K1` directly.
  let K1;
  if (options.K1) {
    K1 = options.K1;
  } else {
    const alpha = options.fAlpha ?? 5;        // F desired = −alpha · I (Hurwitz)
    const Fdesired = matCreate(n, n, 0);
    for (let i = 0; i < n; i++) Fdesired[i][i] = -alpha;
    const diff = matSub(A1, Fdesired);        // n × n
    if (p === n) {
      const Cinv = matInverse(C);
      K1 = matMul(diff, Cinv);                // n × p
    } else {
      // Use right-pseudoinverse of C: K_1 = diff · C^+ via C^+ = C^T (C C^T)^{-1}
      const Ct = matTranspose(C);
      const CCt = matMul(C, Ct);
      const CCtInv = matInverse(CCt);
      const Cplus = matMul(Ct, CCtInv);
      K1 = matMul(diff, Cplus);
    }
  }
  const F = matSub(A1, matMul(K1, C));
  const K = matAdd(K1, matMul(F, H));
  const TB = matMul(T, B);

  return {
    F, T, K, H, K1, TB, A1,
    /**
     * Simulate the UIO over recorded (u, y) signals. Returns the disturbance-
     * decoupled state estimate.
     */
    estimate(uSignal, ySignal, options = {}) {
      const Ts = options.Ts ?? 1e-3;
      if (uSignal.length !== ySignal.length) throw new Error('UIO: u, y length mismatch');
      let z = options.z0 ?? new Array(n).fill(0);
      const xHat = new Array(uSignal.length);
      for (let k = 0; k < uSignal.length; k++) {
        const y = ySignal[k];
        const u = uSignal[k];
        // x̂ = z + H y
        const Hy = matVecMul(H, y);
        xHat[k] = z.map((v, i) => v + Hy[i]);
        // ż = F z + T B u + K y
        const Fz = matVecMul(F, z);
        const TBu = matVecMul(TB, u);
        const Ky = matVecMul(K, y);
        z = z.map((v, i) => v + Ts * (Fz[i] + TBu[i] + Ky[i]));
      }
      return xHat;
    },
  };
}
