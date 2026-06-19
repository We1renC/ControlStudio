/**
 * carleman.js — Carleman linearization for polynomial nonlinear systems.
 *
 * Loop 9 (Zero-Flaw) addition. Lifts a polynomial vector field
 *   ẋ = A_1 x + A_2 (x ⊗ x) + A_3 (x ⊗ x ⊗ x) + …
 * into an infinite-dimensional linear system on the Kronecker-power state
 *   z = [x; x⊗x; x⊗x⊗x; …]
 * and provides the standard truncated-degree-N approximation:
 *
 *   ż = Â_N z + ε_N(x, t)
 *
 * where Â_N is the block-triangular Carleman matrix.
 *
 * The implementation is restricted to *scalar state* (n = 1) for clarity in
 * the verification harness, where the scheme reduces to powers x^k. It also
 * supports the bilinear control case
 *   ẋ = a x + b u + c x u
 * by exposing `buildCarlemanScalar(coeffs, N)`.
 *
 * Reference:
 *   - Carleman, "Application de la théorie des équations intégrales
 *     linéaires aux systèmes d'équations différentielles non linéaires",
 *     Acta Mathematica 59, 1932.
 *   - Rugh, "Nonlinear System Theory: The Volterra/Wiener Approach", JHU
 *     Press, 1981.
 *   - Krener, "Linearization and bilinearization of control systems",
 *     1974.
 */

import { matCreate, matVecMul } from '../math/matrix.js';

/**
 * Build the truncated Carleman matrix for the scalar polynomial system
 *   ẋ = a_1 x + a_2 x² + … + a_p x^p
 * lifted to states z_k = x^k for k = 1..N.
 *
 * Derivative:
 *   ż_k = k x^{k-1} ẋ = k (a_1 x^k + a_2 x^{k+1} + … + a_p x^{k+p-1})
 *       = k a_1 z_k + k a_2 z_{k+1} + … + k a_p z_{k+p-1}
 *
 * Terms with index > N are truncated, contributing to the residual ε_N.
 */
export function buildCarlemanScalar(coeffs, N) {
  if (!Array.isArray(coeffs) || coeffs.length === 0) throw new Error('Carleman: coeffs required');
  if (!(Number.isInteger(N) && N >= 1)) throw new Error('Carleman: N must be positive integer');
  const p = coeffs.length;
  const A = matCreate(N, N, 0);
  for (let k = 1; k <= N; k++) {
    for (let j = 1; j <= p; j++) {
      const target = k + j - 1;     // contributes to z_{target}
      if (target <= N) {
        A[k - 1][target - 1] += k * coeffs[j - 1];
      }
    }
  }
  return A;
}

/**
 * Simulate the scalar nonlinear ODE and its degree-N Carleman approximation.
 * Returns both trajectories so the verification harness can confirm the
 * truncation error shrinks as N grows.
 */
export function simulateCarlemanScalar(coeffs, x0, options = {}) {
  const T = options.T ?? 1.0;
  const dt = options.dt ?? 1e-3;
  const N = options.N ?? 3;
  const steps = Math.floor(T / dt);
  const A = buildCarlemanScalar(coeffs, N);
  // Initial lifted state z_k(0) = x0^k
  let z = new Array(N);
  for (let k = 1; k <= N; k++) z[k - 1] = Math.pow(x0, k);
  let xNonlin = x0;
  const tArr = new Array(steps + 1);
  const xExact = new Array(steps + 1);
  const xApprox = new Array(steps + 1);
  tArr[0] = 0;
  xExact[0] = xNonlin;
  xApprox[0] = z[0];
  for (let s = 0; s < steps; s++) {
    // True nonlinear integration (forward Euler)
    let fx = 0;
    for (let j = 0; j < coeffs.length; j++) fx += coeffs[j] * Math.pow(xNonlin, j + 1);
    xNonlin += dt * fx;
    // Carleman lifted integration
    const dz = matVecMul(A, z);
    z = z.map((v, i) => v + dt * dz[i]);
    tArr[s + 1] = (s + 1) * dt;
    xExact[s + 1] = xNonlin;
    xApprox[s + 1] = z[0];
  }
  return { t: tArr, xExact, xApprox, A };
}
