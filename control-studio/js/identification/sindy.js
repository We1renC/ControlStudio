/**
 * sindy.js — Tier B1: Sparse Identification of Nonlinear Dynamics
 *
 * SINDy approach (Brunton, Proctor, Kutz 2016):
 *   Given X = state trajectory, compute X_dot = d X / dt.
 *   Build feature library Θ(X) = [1, x_i, x_i x_j, sin(x_i), ...]
 *   Solve   X_dot = Θ(X) · Ξ      sparsely
 *
 * Sparse regression: STLSQ (Sequentially Thresholded LSQ):
 *   1. Ξ = lstsq(Θ, X_dot)
 *   2. Set |Ξ_ij| < λ to zero
 *   3. Refit only on remaining active columns
 *   4. Repeat until converged (set of active columns stable)
 *
 * Output: Ξ (n_features × n_vars), each column gives the discovered ODE
 *         for one state variable.
 */

import {
  matCreate, matMul, matTranspose, matInverse,
} from '../math/matrix.js';

// ── Library construction ────────────────────────────────────────────────────

/**
 * Generate all monomial multi-indices of total degree exactly `degree`
 * for `nVars` variables.
 *
 * Returns array of arrays, each sub-array of length nVars summing to degree.
 *   nVars=2, degree=2 -> [[2,0], [1,1], [0,2]]
 */
function monomialMultiIndices(nVars, degree) {
  if (nVars === 1) return [[degree]];
  const out = [];
  for (let i = degree; i >= 0; i--) {
    const tails = monomialMultiIndices(nVars - 1, degree - i);
    for (const tail of tails) out.push([i, ...tail]);
  }
  return out;
}

/**
 * Build polynomial feature library.
 *
 * Returns:
 *   Theta:   N × p  matrix where N=#samples, p=#features
 *   featureNames: length-p array of human-readable names
 *
 * Features ordered as: degree-0 (constant), degree-1, degree-2, ...
 * Within each degree, multi-index lexicographic (high-index-first first).
 *
 * @param {number[][]} X       N × n_vars sample matrix
 * @param {object}     opts
 * @param {number}     opts.polyOrder  Max polynomial degree (>= 1)
 */
export function buildLibrary(X, opts = {}) {
  if (!Array.isArray(X) || X.length === 0) {
    throw new Error('X must be non-empty');
  }
  const polyOrder = opts.polyOrder;
  if (!Number.isInteger(polyOrder) || polyOrder < 1) {
    throw new Error('polyOrder must be a positive integer');
  }
  const N = X.length;
  const nVars = X[0].length;
  if (!Number.isInteger(nVars) || nVars < 1) {
    throw new Error('X rows must contain at least one variable');
  }

  // Generate all multi-indices for degrees 0..polyOrder
  const multiIndices = [[...new Array(nVars)].map(() => 0)]; // degree 0
  const featureNames = ['1'];
  for (let d = 1; d <= polyOrder; d++) {
    const mis = monomialMultiIndices(nVars, d);
    for (const mi of mis) {
      multiIndices.push(mi);
      // Build name: x0^2 * x1 etc.
      const parts = [];
      for (let v = 0; v < nVars; v++) {
        if (mi[v] === 0) continue;
        parts.push(mi[v] === 1 ? `x${v}` : `x${v}^${mi[v]}`);
      }
      featureNames.push(parts.join('*'));
    }
  }
  const p = multiIndices.length;

  // Compute Theta
  const Theta = matCreate(N, p);
  for (let n = 0; n < N; n++) {
    for (let k = 0; k < p; k++) {
      let val = 1;
      const mi = multiIndices[k];
      for (let v = 0; v < nVars; v++) {
        if (mi[v] > 0) val *= Math.pow(X[n][v], mi[v]);
      }
      Theta[n][k] = val;
    }
  }
  return { Theta, featureNames, multiIndices };
}

// ── Sparse regression ───────────────────────────────────────────────────────

/**
 * Sequentially Thresholded Least Squares (STLSQ) — Brunton et al.
 *
 * @param {number[][]} Theta   N × p library matrix
 * @param {number[][]} Y       N × m targets (each column = one output variable)
 * @param {object}     opts
 * @param {string}     [opts.method='STLSQ']
 * @param {number}     opts.lambda Threshold below which coefficients are zeroed.
 * @param {number}     [opts.maxIter=10]
 * @returns {number[][]} Xi (p × m)
 */
export function sparseRegression(Theta, Y, opts = {}) {
  if (!Array.isArray(Theta) || Theta.length === 0) {
    throw new Error('Theta must be non-empty');
  }
  if (!Array.isArray(Y) || Y.length !== Theta.length) {
    throw new Error(`Theta and Y must have same row count (Theta=${Theta.length}, Y=${Y.length})`);
  }
  const method = opts.method ?? 'STLSQ';
  const lambda = opts.lambda;
  const maxIter = opts.maxIter ?? 10;
  if (!Number.isFinite(lambda) || lambda < 0) {
    throw new Error('lambda must be non-negative finite');
  }
  if (method !== 'STLSQ') {
    throw new Error(`unknown method: ${method} (only STLSQ supported)`);
  }

  const N = Theta.length;
  const p = Theta[0].length;
  const m = Y[0].length;

  // Initial OLS:  Xi = (Theta^T Theta)^-1 Theta^T Y
  let Xi = ols(Theta, Y);

  // STLSQ iterations
  for (let iter = 0; iter < maxIter; iter++) {
    // Apply threshold
    let changed = false;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < m; j++) {
        if (Math.abs(Xi[i][j]) < lambda) {
          if (Xi[i][j] !== 0) changed = true;
          Xi[i][j] = 0;
        }
      }
    }
    if (!changed) break;

    // Refit only on active columns (per output)
    for (let j = 0; j < m; j++) {
      const active = [];
      for (let i = 0; i < p; i++) if (Xi[i][j] !== 0) active.push(i);
      if (active.length === 0) continue;
      // Build sub-Theta
      const subTheta = matCreate(N, active.length);
      for (let n = 0; n < N; n++) {
        for (let kk = 0; kk < active.length; kk++) {
          subTheta[n][kk] = Theta[n][active[kk]];
        }
      }
      const yj = matCreate(N, 1);
      for (let n = 0; n < N; n++) yj[n][0] = Y[n][j];
      const sub = ols(subTheta, yj);
      // Write back
      for (let i = 0; i < p; i++) Xi[i][j] = 0;
      for (let kk = 0; kk < active.length; kk++) Xi[active[kk]][j] = sub[kk][0];
    }
  }
  return Xi;
}

/**
 * Ordinary least squares with adaptive ridge regularisation:
 *   Xi = (Theta^T Theta + alpha I)^-1 Theta^T Y
 *
 * alpha is scaled to a small fraction of trace(Theta^T Theta) so that
 * collinear feature columns (common in SINDy when the trajectory lies on
 * a low-dimensional manifold) do not blow up the inverse.
 */
function ols(Theta, Y) {
  const Tt = matTranspose(Theta);
  const TtT = matMul(Tt, Theta);
  const p = TtT.length;
  // Adaptive ridge: alpha ~ 1e-10 * trace / p  (relative scale)
  let tr = 0;
  for (let i = 0; i < p; i++) tr += TtT[i][i];
  const alpha = Math.max(1e-12, (tr / p) * 1e-10);
  for (let i = 0; i < p; i++) TtT[i][i] += alpha;
  const TtY = matMul(Tt, Y);
  const Xi = matMul(matInverse(TtT), TtY);
  return Xi;
}

// ── Numerical differentiation ───────────────────────────────────────────────

/**
 * Compute time derivative of x via centred finite differences.
 * Edge points use forward / backward differences.
 *
 * @param {number[]} x   Signal samples (uniform dt).
 * @param {number}   dt  Step.
 * @returns {number[]}   dx/dt (same length).
 */
export function finiteDifferenceDerivative(x, dt) {
  const n = x.length;
  if (n < 2) throw new Error('need >= 2 samples for derivative');
  const dx = new Array(n);
  dx[0] = (x[1] - x[0]) / dt;
  dx[n - 1] = (x[n - 1] - x[n - 2]) / dt;
  for (let i = 1; i < n - 1; i++) {
    dx[i] = (x[i + 1] - x[i - 1]) / (2 * dt);
  }
  return dx;
}

// ── Full pipeline ───────────────────────────────────────────────────────────

/**
 * Identify a nonlinear ODE  dX/dt = f(X)  from trajectory samples via SINDy.
 *
 * Pipeline:
 *   1. Compute dX/dt via finite differences
 *   2. Build polynomial library Theta(X)
 *   3. STLSQ sparse regression -> Xi
 *   4. Generate symbolic equation strings
 *
 * @param {number[][]} trajectory  N × n_vars time series
 * @param {number}     dt          Step
 * @param {object}     [opts]
 * @param {number}     [opts.polyOrder=2]
 * @param {number}     [opts.lambda=0.05]
 * @param {number}     [opts.derivativeMethod='centralFD']
 * @returns {{ equations, Xi, library, residualNorm }}
 */
export function identifyNonlinearODE(trajectory, dt, opts = {}) {
  const polyOrder = opts.polyOrder ?? 2;
  const lambda = opts.lambda ?? 0.05;
  const N = trajectory.length;
  const nVars = trajectory[0].length;

  // Derivatives column-wise
  const Y = matCreate(N, nVars);
  for (let v = 0; v < nVars; v++) {
    const col = trajectory.map((row) => row[v]);
    const dv = finiteDifferenceDerivative(col, dt);
    for (let i = 0; i < N; i++) Y[i][v] = dv[i];
  }

  const library = buildLibrary(trajectory, { polyOrder });
  const Xi = sparseRegression(library.Theta, Y, { method: 'STLSQ', lambda });

  // Build symbolic equations
  const equations = [];
  for (let v = 0; v < nVars; v++) {
    const terms = [];
    for (let k = 0; k < Xi.length; k++) {
      const c = Xi[k][v];
      if (c === 0) continue;
      const sign = c >= 0 ? '+' : '-';
      const mag = Math.abs(c);
      const name = library.featureNames[k];
      terms.push(`${sign} ${mag.toFixed(4)} * ${name}`);
    }
    const rhs = terms.length === 0 ? '0' : terms.join(' ').replace(/^\+ /, '');
    equations.push(`dx${v}/dt = ${rhs}`);
  }

  // Residual norm
  const Yhat = matMul(library.Theta, Xi);
  let rNorm = 0;
  for (let i = 0; i < N; i++) {
    for (let v = 0; v < nVars; v++) {
      const d = Y[i][v] - Yhat[i][v];
      rNorm += d * d;
    }
  }
  rNorm = Math.sqrt(rNorm);

  return { equations, Xi, library, residualNorm: rNorm };
}
