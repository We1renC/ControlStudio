/**
 * pseudospectrum.js — Tier E4: ε-pseudo-spectrum computation
 *
 * Given a matrix A ∈ ℂ^{n×n}, the ε-pseudo-spectrum is
 *
 *     σ_ε(A) = { z ∈ ℂ : σ_min(zI − A) ≤ ε }
 *
 * Equivalently: z is an eigenvalue of (A + E) for some perturbation
 * ||E||_2 ≤ ε. This is critically informative for non-normal matrices,
 * where eigenvalues alone may be misleading (transient growth, etc.).
 *
 * Algorithm: for each grid point z = re + j·im, compute σ_min(zI − A)
 * via the smallest singular value of the (n × n complex) shifted matrix.
 *
 * Since our matrix module is real-only, we exploit the fact that for a
 * COMPLEX matrix M = (X + jY), σ_min(M) equals σ_min of the 2n × 2n
 * real block matrix:
 *
 *     [ X  -Y ]
 *     [ Y   X ]
 *
 * The singular values of this block matrix come in pairs equal to those
 * of M, so σ_min(M) = σ_min of the real block matrix.
 *
 * For a real matrix A and complex shift z = a + jb:
 *     zI − A = (aI − A) + j(bI)
 *     X = aI − A,  Y = bI
 */

import { matCreate, matIdentity } from '../math/matrix.js';
import { computeSVD } from '../math/svd.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateA(A) {
  if (!Array.isArray(A) || A.length === 0) {
    throw new Error('A must be non-empty');
  }
  const n = A.length;
  if (!Array.isArray(A[0]) || A[0].length !== n) {
    throw new Error(`A must be square (got ${n} x ${A[0]?.length ?? '?'})`);
  }
}

/**
 * Build 2n × 2n real block for complex matrix (X + jY):
 *   [ X  -Y ]
 *   [ Y   X ]
 */
function buildComplexBlock(X, Y) {
  const n = X.length;
  const M = matCreate(2 * n, 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = X[i][j];
      M[i][n + j] = -Y[i][j];
      M[n + i][j] = Y[i][j];
      M[n + i][n + j] = X[i][j];
    }
  }
  return M;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute σ_min(zI − A) for a complex shift z.
 *
 * @param {number[][]} A
 * @param {{re,im}}    z
 * @returns {number} σ_min
 */
export function sigmaMinComplex(A, z) {
  validateA(A);
  const n = A.length;
  const re = z.re;
  const im = z.im;
  // X = re·I - A,   Y = im·I
  const X = matCreate(n, n);
  const Y = matCreate(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      X[i][j] = (i === j ? re : 0) - A[i][j];
      Y[i][j] = (i === j ? im : 0);
    }
  }
  const M = buildComplexBlock(X, Y);
  const svd = computeSVD(M);
  // Smallest singular value = last in sorted list
  const singularValues = svd.S || svd.singularValues || svd.s;
  if (!singularValues || singularValues.length === 0) {
    throw new Error('SVD did not return singular values');
  }
  // Block matrix has SVs in pairs; both copies equal to σ_i(M_complex)
  // so σ_min(M_complex) = last (smallest) σ of block matrix
  let smin = Infinity;
  for (const s of singularValues) {
    if (s < smin) smin = s;
  }
  return smin;
}

/**
 * Compute pseudo-spectrum on a rectangular grid.
 *
 * @param {number[][]} A
 * @param {object} opts
 * @param {number[]} opts.reRange    [re_min, re_max]
 * @param {number[]} opts.imRange    [im_min, im_max]
 * @param {number}   opts.npts       Grid resolution per axis
 * @param {number[]} opts.epsilons   List of ε values for contour computation
 * @returns {{
 *   grid: {re: number, im: number}[][],
 *   sigmas: number[][],
 *   contours: { epsilon: number, points: {re,im}[] }[]
 * }}
 */
export function computePseudoSpectrum(A, opts) {
  validateA(A);
  if (!opts || !Array.isArray(opts.reRange) || !Array.isArray(opts.imRange)) {
    throw new Error('reRange and imRange required');
  }
  const { reRange, imRange, npts, epsilons } = opts;
  if (!Number.isInteger(npts) || npts < 2) {
    throw new Error('npts must be integer >= 2');
  }
  if (!Array.isArray(epsilons) || epsilons.length === 0) {
    throw new Error('epsilons must be non-empty array');
  }

  const grid = matCreate(npts, npts);
  const sigmas = matCreate(npts, npts);
  const dRe = (reRange[1] - reRange[0]) / (npts - 1);
  const dIm = (imRange[1] - imRange[0]) / (npts - 1);

  for (let i = 0; i < npts; i++) {
    for (let j = 0; j < npts; j++) {
      const re = reRange[0] + j * dRe;
      const im = imRange[1] - i * dIm;  // top-down for visual convention
      grid[i][j] = { re, im };
      sigmas[i][j] = sigmaMinComplex(A, { re, im });
    }
  }

  // Build contour candidate points: cells where σ ≤ ε (level set inclusion)
  const contours = [];
  for (const eps of epsilons) {
    const points = [];
    for (let i = 0; i < npts; i++) {
      for (let j = 0; j < npts; j++) {
        if (sigmas[i][j] <= eps) {
          points.push({ re: grid[i][j].re, im: grid[i][j].im });
        }
      }
    }
    contours.push({ epsilon: eps, points });
  }

  return { grid, sigmas, contours };
}
