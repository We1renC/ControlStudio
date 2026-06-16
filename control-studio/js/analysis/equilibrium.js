/**
 * equilibrium.js — Equilibrium detection and bifurcation analysis for nonlinear ODEs.
 *
 * Given a nonlinear vector field f(x): R^n → R^n, find equilibria (f(x*)=0)
 * and classify them via the Jacobian eigenvalues.
 */
import { matIdentity, matMul, matTrace } from '../math/matrix.js';
import { polyroots } from '../math/polynomial.js';

/**
 * Newton-Raphson iteration to find an equilibrium x* such that f(x*)=0,
 * starting from initial guess x0.
 *
 * @param {function} f - f(x: number[]) → number[]
 * @param {number[]} x0 - initial guess
 * @param {{ maxIter?: number, tol?: number, h?: number }} [options]
 * @returns {{ x: number[], converged: boolean, iterations: number, residual: number }}
 */
export function findEquilibrium(f, x0, options = {}) {
  const maxIter = options.maxIter ?? 50;
  const tol = options.tol ?? 1e-9;
  const h = options.h ?? 1e-5; // numerical Jacobian step

  let x = [...x0];
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const fx = f(x);
    const residual = Math.sqrt(fx.reduce((s, v) => s + v*v, 0));
    if (residual < tol) break;

    // Numerical Jacobian J = ∂f/∂x
    const n = x.length;
    const J = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        const xp = [...x]; xp[j] += h;
        const xm = [...x]; xm[j] -= h;
        row.push((f(xp)[i] - f(xm)[i]) / (2*h));
      }
      J.push(row);
    }
    // Solve J·Δx = -f(x) (Gaussian elimination)
    const dx = _solveLinear(J, fx.map(v => -v));
    if (!dx) break; // singular Jacobian
    x = x.map((v, i) => v + dx[i]);
  }
  const fx = f(x);
  const residual = Math.sqrt(fx.reduce((s, v) => s + v*v, 0));
  return { x, converged: residual < tol, iterations: iter, residual };
}

/**
 * Classify an equilibrium point via Jacobian eigenvalues.
 *
 * @param {function} f - vector field
 * @param {number[]} xstar - equilibrium point
 * @param {{ h?: number }} [options]
 * @returns {{ eigenvalues, type, stable, stiffness }}
 *   type: 'stable-node'|'unstable-node'|'saddle'|'stable-spiral'|'unstable-spiral'|'center'|'unknown'
 *   stable: true if all eigenvalues have Re < 0
 *   stiffness: max|Re(λ)| / min|Re(λ)| (stiffness ratio)
 */
export function classifyEquilibrium(f, xstar, options = {}) {
  const n = xstar.length;
  const h = options.h ?? 1e-5;

  // Numerical Jacobian at x*
  const J = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const xp = [...xstar]; xp[j] += h;
      const xm = [...xstar]; xm[j] -= h;
      row.push((f(xp)[i] - f(xm)[i]) / (2*h));
    }
    J.push(row);
  }

  const eigenvalues = _jacobianEigenvalues(J, n);

  const allNegRe = eigenvalues.every(λ => λ.re < -1e-9);
  const allPosRe = eigenvalues.every(λ => λ.re > 1e-9);
  const hasComplex = eigenvalues.some(λ => Math.abs(λ.im) > 1e-6);
  const hasZeroRe = eigenvalues.some(λ => Math.abs(λ.re) < 1e-6);
  const hasMixedRe = eigenvalues.some(λ => λ.re < -1e-9) && eigenvalues.some(λ => λ.re > 1e-9);

  let type = 'unknown';
  if (hasMixedRe) type = 'saddle';
  else if (allNegRe && !hasComplex) type = 'stable-node';
  else if (allNegRe && hasComplex) type = 'stable-spiral';
  else if (allPosRe && !hasComplex) type = 'unstable-node';
  else if (allPosRe && hasComplex) type = 'unstable-spiral';
  else if (hasZeroRe && hasComplex && !hasMixedRe) type = 'center';

  const reParts = eigenvalues.map(λ => Math.abs(λ.re)).filter(v => v > 1e-12);
  const stiffness = reParts.length >= 2 ? Math.max(...reParts) / Math.min(...reParts) : 1;

  return { eigenvalues, type, stable: allNegRe, stiffness, jacobian: J };
}

/**
 * Scan for multiple equilibria by running Newton-Raphson from a grid of starting points.
 *
 * @param {function} f - vector field
 * @param {number[][]} searchBounds - [[xmin, xmax], [ymin, ymax], ...] for each state
 * @param {{ gridSize?: number, tol?: number }} [options]
 * @returns {Array<{ x: number[], type: string, stable: boolean, eigenvalues: ... }>}
 *   Unique equilibria found (deduplicated within tolerance)
 */
export function scanEquilibria(f, searchBounds, options = {}) {
  const gridSize = options.gridSize ?? 5;
  const tol = options.tol ?? 1e-6;
  if (!Number.isInteger(gridSize) || gridSize < 1) {
    throw new Error('scanEquilibria gridSize must be an integer >= 1');
  }
  if (!Array.isArray(searchBounds) || searchBounds.length === 0) {
    throw new Error('scanEquilibria searchBounds must be a non-empty bounds array');
  }
  const n = searchBounds.length;
  for (const [idx, bound] of searchBounds.entries()) {
    if (!Array.isArray(bound) || bound.length !== 2) {
      throw new Error(`scanEquilibria searchBounds[${idx}] must be [min, max]`);
    }
    const [lo, hi] = bound;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
      throw new Error(`scanEquilibria searchBounds[${idx}] must contain finite values with max >= min`);
    }
  }
  const found = [];

  // Generate grid of starting points
  const _gridPoints = (dim, bounds, grid) => {
    if (dim === n) {
      const result = findEquilibrium(f, grid, { tol: tol * 1e-3 });
      if (result.converged) {
        // Check for duplicate
        const isDup = found.some(eq => Math.sqrt(eq.x.reduce((s,v,i) => s+(v-result.x[i])**2, 0)) < tol);
        if (!isDup) {
          const classification = classifyEquilibrium(f, result.x);
          found.push({ x: result.x, ...classification });
        }
      }
      return;
    }
    const [lo, hi] = bounds[dim];
    for (let i = 0; i < gridSize; i++) {
      const val = gridSize === 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (gridSize - 1);
      _gridPoints(dim + 1, bounds, [...grid, val]);
    }
  };
  _gridPoints(0, searchBounds, []);
  return found;
}

/** Gaussian elimination for Ax = b. Returns x or null if singular. */
function _solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col+1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-14) return null;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Eigenvalues for n≤2 via closed-form formulas; n>2 uses characteristic roots. */
function _jacobianEigenvalues(J, n) {
  if (n === 1) return [{ re: J[0][0], im: 0 }];
  if (n === 2) {
    const tr = J[0][0] + J[1][1];
    const det = J[0][0]*J[1][1] - J[0][1]*J[1][0];
    const disc = tr*tr - 4*det;
    if (disc >= 0) {
      return [{ re: (tr + Math.sqrt(disc))/2, im: 0 }, { re: (tr - Math.sqrt(disc))/2, im: 0 }];
    } else {
      return [{ re: tr/2, im: Math.sqrt(-disc)/2 }, { re: tr/2, im: -Math.sqrt(-disc)/2 }];
    }
  }
  return polyroots(_characteristicPolynomial(J)).map((root) => ({
    re: root.re,
    im: root.im,
  }));
}

/**
 * Characteristic polynomial det(λI - A) via Faddeev-LeVerrier.
 * Returns high-degree-first coefficients [1, c1, ..., cn].
 */
function _characteristicPolynomial(A) {
  const n = A.length;
  const I = matIdentity(n);
  const coeffs = [1];
  let Bk = I;

  for (let k = 1; k <= n; k++) {
    const Mk = matMul(A, Bk);
    const ck = -matTrace(Mk) / k;
    coeffs.push(Math.abs(ck) < 1e-12 ? 0 : ck);
    if (k < n) {
      Bk = Mk.map((row, i) => row.map((value, j) => value + ck * I[i][j]));
    }
  }
  return coeffs;
}
