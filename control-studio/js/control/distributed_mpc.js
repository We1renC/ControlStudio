/**
 * distributed_mpc.js - Tier G3: dual-decomposition / ADMM consensus baseline.
 */

export function solveConsensusDMPC({ localTargets, rho = 1, maxIter = 50, tol = 1e-8 } = {}) {
  const n = localTargets.length;
  let z = localTargets.reduce((sum, value) => sum + value, 0) / n;
  let lambda = new Array(n).fill(0);
  let x = localTargets.slice();
  let iter = 0;
  for (; iter < maxIter; iter++) {
    x = localTargets.map((target, i) => (target + rho * z - lambda[i]) / (1 + rho));
    const zPrev = z;
    z = x.reduce((sum, value) => sum + value, 0) / n;
    lambda = lambda.map((value, i) => value + rho * (x[i] - z));
    if (Math.abs(z - zPrev) < tol && Math.max(...x.map((value) => Math.abs(value - z))) < tol) break;
  }
  return { localSolutions: x, consensus: z, lambda, iter, converged: iter < maxIter };
}

export default { solveConsensusDMPC };
