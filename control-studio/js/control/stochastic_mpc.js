/**
 * stochastic_mpc.js - Tier G1: stochastic MPC chance-constraint helpers.
 */

function norm(a) { return Math.sqrt(a.reduce((sum, value) => sum + value * value, 0)); }

export function normalQuantile(p) {
  // Acklam approximation, enough for MPC backoff constants.
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function tightenChanceConstraint({ a, b = 0, Sigma, epsilon = 0.05 } = {}) {
  const sigmaA = Math.sqrt(a.reduce((sum, ai, i) => sum + ai * Sigma[i][i] * ai, 0));
  const backoff = normalQuantile(1 - epsilon) * sigmaA;
  return { a: a.slice(), bTight: b + backoff, backoff };
}

export function estimateViolationRate({ mean, Sigma, constraint, samples = 5000, seed = 1 } = {}) {
  let s = seed >>> 0;
  const rand = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const randn = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
  let violations = 0;
  for (let i = 0; i < samples; i++) {
    const x = mean.map((m, j) => m + Math.sqrt(Sigma[j][j]) * randn());
    if (constraint.a.reduce((sum, value, j) => sum + value * x[j], 0) + constraint.b > 0) violations++;
  }
  return { rate: violations / samples, samples };
}

export default { normalQuantile, tightenChanceConstraint, estimateViolationRate };
