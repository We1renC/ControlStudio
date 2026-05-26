/**
 * srivc.js - Tier B3: simplified refined IV for continuous-time ID.
 */

import { identifySRIVC } from '../control/adaptive.js';

export function poissonFilter(signal, lambda, order = 1, dt = 1) {
  if (!Array.isArray(signal)) throw new Error('signal must be an array');
  if (!(lambda > 0)) throw new Error('lambda must be positive');
  if (!Number.isInteger(order) || order < 1) throw new Error('order must be a positive integer');
  if (!(dt > 0)) throw new Error('dt must be positive');
  let out = signal.slice();
  for (let stage = 0; stage < order; stage++) {
    const y = new Array(out.length).fill(0);
    const c = Math.exp(-lambda * dt);
    const gain = 1 - c;
    for (let k = 1; k < out.length; k++) y[k] = c * y[k - 1] + gain * out[k];
    out = y;
  }
  return out;
}

export function identifyCT({ t, u, y, na, nb, lambda_filter = 2, maxIter = 5 } = {}) {
  if (!Array.isArray(t) || !Array.isArray(u) || !Array.isArray(y)) throw new Error('t, u, y arrays are required');
  if (t.length !== u.length || t.length !== y.length) throw new Error('t, u, y must have equal length');
  if (t.length < 3) throw new Error('at least three samples are required');
  const dt = t[1] - t[0];
  if (!(dt > 0)) throw new Error('t must be strictly increasing');
  for (let k = 2; k < t.length; k++) {
    if (Math.abs((t[k] - t[k - 1]) - dt) > 1e-9) throw new Error('identifyCT currently expects uniform sampling');
  }
  const result = identifySRIVC(y, u, na, nb, dt, { alpha: lambda_filter, maxIter });
  return {
    num: result.b.slice(),
    den: [1, ...result.a],
    residual: result.residuals ?? result.residual ?? [],
    converged: true,
    iterations: result.iterations ?? maxIter,
    method: 'SRIVC',
    raw: result,
  };
}

export default {
  poissonFilter,
  identifyCT,
};
