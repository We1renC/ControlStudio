/**
 * realschur.js — Real Schur decomposition for real square matrices.
 *
 * Algorithm: Hessenberg reduction (Householder) → Francis implicit double-shift
 * QR iteration → eigenvalue-sign reordering.
 *
 * Used by solveCareHamiltonianSchur as a fallback for n ≥ 5 where the
 * dependency-free eigenvector path becomes numerically unreliable.
 *
 * Reference: Golub & Van Loan "Matrix Computations" §7.5–7.6.
 */

// ---------------------------------------------------------------------------
// Dense matrix helpers (flat row-major arrays for speed)
// ---------------------------------------------------------------------------

function zeros(n) { return new Float64Array(n * n); }
function eye(n) {
  const M = zeros(n);
  for (let i = 0; i < n; i++) M[i * n + i] = 1;
  return M;
}
function copyMat(A, n) { return Float64Array.from(A); }

/** Apply Householder reflector P = I - 2vv' from the left to A[r:,c:] in place. */
function applyHouseholderLeft(A, v, r, n, colStart) {
  // For each column j >= colStart: A[r:, j] -= 2*v*(v' A[r:, j])
  const vLen = v.length;
  for (let j = colStart; j < n; j++) {
    let dot = 0;
    for (let i = 0; i < vLen; i++) dot += v[i] * A[(r + i) * n + j];
    for (let i = 0; i < vLen; i++) A[(r + i) * n + j] -= 2 * v[i] * dot;
  }
}

/** Apply Householder reflector P from the right to A[:r+vLen, c:] in place. */
function applyHouseholderRight(A, v, r, n, rowEnd) {
  const vLen = v.length;
  for (let i = 0; i < rowEnd; i++) {
    let dot = 0;
    for (let j = 0; j < vLen; j++) dot += v[j] * A[i * n + (r + j)];
    for (let j = 0; j < vLen; j++) A[i * n + (r + j)] -= 2 * v[j] * dot;
  }
}

/** Householder vector: returns v s.t. (I-2vv')x = -sign(x[0])||x||e1.
 *  v is normalised so v[0]=1; returns {v (unit), beta=2/(v'v) before normalisation}. */
function householderVector(x) {
  const n = x.length;
  let sigma = 0;
  for (let i = 1; i < n; i++) sigma += x[i] * x[i];
  const v = x.slice();
  if (sigma < 1e-30) return { v, trivial: true };
  const norm = Math.sqrt(x[0] * x[0] + sigma);
  v[0] = x[0] <= 0 ? x[0] - norm : -sigma / (x[0] + norm);
  const scale = 1 / v[0];
  for (let i = 1; i < n; i++) v[i] *= scale;
  // Normalize to unit v[0]=1
  const vNorm2 = 1 + sigma * scale * scale;
  return { v, vNorm2, trivial: false };
}

// ---------------------------------------------------------------------------
// Step 1: Reduce A (n×n, row-major Float64Array) to upper Hessenberg form.
// Returns { H (upper Hessenberg), Q (orthogonal accumulator) }.
// ---------------------------------------------------------------------------
function hessenbergReduction(A_in, n) {
  const H = copyMat(A_in, n);
  const Q = eye(n);

  for (let k = 0; k < n - 2; k++) {
    // Extract column k below row k+1
    const x = [];
    for (let i = k + 1; i < n; i++) x.push(H[i * n + k]);
    const { v, trivial } = householderVector(x);
    if (trivial) continue;

    // Scale v: ensure v[0] = 1
    const vArr = v; // already normalised with v[0]=1 from householderVector

    // Compute beta = 2/(v'v)
    let vTv = 0;
    for (const vi of vArr) vTv += vi * vi;
    const beta = 2 / vTv;

    // H = P H P'  (P = I - beta*v*v')
    // Left: H[k+1:, :] -= beta*v*(v' H[k+1:, :])
    for (let j = 0; j < n; j++) {
      let dot = 0;
      for (let i = 0; i < vArr.length; i++) dot += vArr[i] * H[(k + 1 + i) * n + j];
      dot *= beta;
      for (let i = 0; i < vArr.length; i++) H[(k + 1 + i) * n + j] -= dot * vArr[i];
    }
    // Right: H[:, k+1:] -= beta*(H[:, k+1:]*v)*v'
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let j = 0; j < vArr.length; j++) dot += H[i * n + (k + 1 + j)] * vArr[j];
      dot *= beta;
      for (let j = 0; j < vArr.length; j++) H[i * n + (k + 1 + j)] -= dot * vArr[j];
    }
    // Accumulate Q: Q[:, k+1:] -= beta*(Q[:, k+1:]*v)*v'
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let j = 0; j < vArr.length; j++) dot += Q[i * n + (k + 1 + j)] * vArr[j];
      dot *= beta;
      for (let j = 0; j < vArr.length; j++) Q[i * n + (k + 1 + j)] -= dot * vArr[j];
    }
    // Zero out numerical noise below sub-diagonal
    for (let i = k + 2; i < n; i++) H[i * n + k] = 0;
  }
  return { H, Q };
}

// ---------------------------------------------------------------------------
// 2×2 block eigenvalues (may be complex conjugate pair)
// ---------------------------------------------------------------------------
function eig2x2(a, b, c, d) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const sq = Math.sqrt(disc);
    return [{ re: (tr + sq) / 2, im: 0 }, { re: (tr - sq) / 2, im: 0 }];
  }
  const sq = Math.sqrt(-disc);
  return [{ re: tr / 2, im: sq / 2 }, { re: tr / 2, im: -sq / 2 }];
}

// ---------------------------------------------------------------------------
// Step 2: Francis implicit double-shift QR on upper Hessenberg H (in place).
// Accumulates orthogonal transformations into Q.
// ---------------------------------------------------------------------------
function francisQR(H, Q, n, maxIter = 30 * n) {
  let p = n; // size of active unreduced sub-problem H[0:p, 0:p]

  for (let iter = 0; iter < maxIter && p > 1; iter++) {
    // Deflation: check sub-diagonal elements
    for (let i = p - 1; i >= 1; i--) {
      const tol = 1e-13 * (Math.abs(H[(i - 1) * n + (i - 1)]) + Math.abs(H[i * n + i]));
      if (Math.abs(H[i * n + (i - 1)]) <= tol) {
        H[i * n + (i - 1)] = 0;
        if (i === p - 1) { p--; break; }
      }
    }
    if (p <= 1) break;

    // Wilkinson double shift: eigenvalues of trailing 2×2
    const a = H[(p - 2) * n + (p - 2)], b = H[(p - 2) * n + (p - 1)];
    const c = H[(p - 1) * n + (p - 2)], d = H[(p - 1) * n + (p - 1)];
    const s = a + d;       // trace
    const t = a * d - b * c; // det

    // First column of M = (H - s1 I)(H - s2 I) = H² - s*H + t*I
    // Only need rows 0,1,2 of first column of M restricted to active [0,p)
    const h00 = H[0], h10 = H[n], h20 = H[2 * n];
    const h01 = H[1], h11 = H[n + 1], h21 = H[2 * n + 1];
    const h12 = H[n + 2];

    const x = h00 * h00 + h01 * h10 - s * h00 + t;
    const y = h10 * (h00 + h11) - s * h10;
    const z = h10 * h21;

    // Apply a sequence of 3×3 (or 2×2 at bottom) Householder / Givens steps
    // chasing the "bulge" introduced by the double-shift along the diagonal.
    for (let k = 0; k < p - 1; k++) {
      const bot = Math.min(k + 3, p);
      const len = bot - k;

      // Build reflector for [x, y, z] (or [x, y] at bottom)
      let xk, yk, zk;
      if (k === 0) {
        xk = x; yk = y; zk = (len >= 3 ? z : 0);
      } else {
        xk = H[k * n + (k - 1)];
        yk = H[(k + 1) * n + (k - 1)];
        zk = len >= 3 ? H[(k + 2) * n + (k - 1)] : 0;
      }

      const norm = Math.sqrt(xk * xk + yk * yk + zk * zk);
      if (norm < 1e-15) continue;
      const sign = xk >= 0 ? 1 : -1;
      const u0 = xk + sign * norm;
      const u1 = yk;
      const u2 = zk;
      const uNorm2 = u0 * u0 + u1 * u1 + u2 * u2;
      if (uNorm2 < 1e-30) continue;
      const betaH = 2 / uNorm2;

      // Left multiply H[k:bot, k-1:n] by P
      const colStart = k === 0 ? 0 : k - 1;
      for (let j = colStart; j < n; j++) {
        let dot = u0 * H[k * n + j];
        if (len >= 2) dot += u1 * H[(k + 1) * n + j];
        if (len >= 3) dot += u2 * H[(k + 2) * n + j];
        dot *= betaH;
        H[k * n + j] -= dot * u0;
        if (len >= 2) H[(k + 1) * n + j] -= dot * u1;
        if (len >= 3) H[(k + 2) * n + j] -= dot * u2;
      }
      // Right multiply H[0:bot+1, k:bot] by P'
      const rowEnd = Math.min(bot + 1, p);
      for (let i = 0; i < rowEnd; i++) {
        let dot = u0 * H[i * n + k];
        if (len >= 2) dot += u1 * H[i * n + (k + 1)];
        if (len >= 3) dot += u2 * H[i * n + (k + 2)];
        dot *= betaH;
        H[i * n + k] -= dot * u0;
        if (len >= 2) H[i * n + (k + 1)] -= dot * u1;
        if (len >= 3) H[i * n + (k + 2)] -= dot * u2;
      }
      // Accumulate into Q: Q[:, k:bot] *= P'
      for (let i = 0; i < n; i++) {
        let dot = u0 * Q[i * n + k];
        if (len >= 2) dot += u1 * Q[i * n + (k + 1)];
        if (len >= 3) dot += u2 * Q[i * n + (k + 2)];
        dot *= betaH;
        Q[i * n + k] -= dot * u0;
        if (len >= 2) Q[i * n + (k + 1)] -= dot * u1;
        if (len >= 3) Q[i * n + (k + 2)] -= dot * u2;
      }
    }
  }
  // Clean up sub-sub-diagonal numerical noise
  for (let i = 2; i < n; i++) {
    for (let j = 0; j < i - 1; j++) H[i * n + j] = 0;
  }
}

// ---------------------------------------------------------------------------
// Extract eigenvalues from quasi-upper-triangular Schur form T (in place).
// Returns array of {re, im, idx} where idx is the starting row of the block.
// ---------------------------------------------------------------------------
function extractSchurEigenvalues(T, n) {
  const eigs = [];
  let i = 0;
  while (i < n) {
    if (i === n - 1 || Math.abs(T[(i + 1) * n + i]) < 1e-12) {
      eigs.push({ re: T[i * n + i], im: 0, idx: i, size: 1 });
      i++;
    } else {
      const [e1, e2] = eig2x2(T[i * n + i], T[i * n + (i + 1)], T[(i + 1) * n + i], T[(i + 1) * n + (i + 1)]);
      eigs.push({ ...e1, idx: i, size: 2 });
      eigs.push({ ...e2, idx: i, size: 2 });
      i += 2;
    }
  }
  return eigs;
}

// ---------------------------------------------------------------------------
// Swap adjacent 1×1 or 2×2 diagonal blocks in quasi-triangular T, updating Q.
// ---------------------------------------------------------------------------
/**
 * Swap 1×1 Schur blocks at positions pos and pos+1 using a Givens rotation.
 *
 * Given upper-triangular 2×2 block [[a,b],[0,d]] we build G = [[cos,−sin],[sin,cos]]
 * whose first column is the normalised eigenvector [b, d−a]ᵀ/r of eigenvalue d.
 * Then G' * [[a,b],[0,d]] * G = [[d,b'],[0,a]]  (eigenvalues swapped).
 *
 * Key convention:
 *   Left  (G' applied to rows): row₀ = cos·row₀ + sin·row₁
 *   Right (G  applied to cols): col₀ = cos·col₀ + sin·col₁   ← note +sin on right
 *   Q accumulation (Q←Q·G):   same as right convention
 *
 * The original code had the wrong formula for cos/sin AND applied G' (not G)
 * to the right — both bugs are fixed here.
 */
function swap1x1Blocks(T, Q, n, pos) {
  const a = T[pos * n + pos];
  const b = T[pos * n + (pos + 1)];
  const d = T[(pos + 1) * n + (pos + 1)];
  const diff = d - a;                           // d − a
  const r = Math.sqrt(b * b + diff * diff);     // r = √(b²+(d−a)²)
  if (r < 1e-14) return;                        // equal eigenvalues — nothing to do
  const cos = b / r;                            // normalised eigenvector component
  const sin = diff / r;

  // Left: G' applied to rows → T = G' T
  for (let j = 0; j < n; j++) {
    const t0 = T[pos * n + j], t1 = T[(pos + 1) * n + j];
    T[pos * n + j]       =  cos * t0 + sin * t1;
    T[(pos + 1) * n + j] = -sin * t0 + cos * t1;
  }
  // Right: G applied to cols → T = T G  (note +sin, not −sin)
  for (let i = 0; i < n; i++) {
    const t0 = T[i * n + pos], t1 = T[i * n + (pos + 1)];
    T[i * n + pos]       =  cos * t0 + sin * t1;
    T[i * n + (pos + 1)] = -sin * t0 + cos * t1;
  }
  // Q ← Q G  (same sign convention as right application above)
  for (let i = 0; i < n; i++) {
    const q0 = Q[i * n + pos], q1 = Q[i * n + (pos + 1)];
    Q[i * n + pos]       =  cos * q0 + sin * q1;
    Q[i * n + (pos + 1)] = -sin * q0 + cos * q1;
  }
  T[(pos + 1) * n + pos] = 0; // zero sub-diagonal numerical noise
}

// ---------------------------------------------------------------------------
// Reorder Schur form T so that blocks with Re(λ) < 0 come first.
// Uses repeated bubble passes on adjacent blocks.
// ---------------------------------------------------------------------------
function reorderSchurStable(T, Q, n) {
  const maxPasses = 4 * n;
  for (let pass = 0; pass < maxPasses; pass++) {
    let swapped = false;
    let i = 0;
    while (i < n - 1) {
      // Determine block sizes at position i and i+next
      const s1 = (i + 1 < n && Math.abs(T[(i + 1) * n + i]) > 1e-12) ? 2 : 1;
      const i2 = i + s1;
      if (i2 >= n) break;
      const s2 = (i2 + 1 < n && Math.abs(T[(i2 + 1) * n + i2]) > 1e-12) ? 2 : 1;

      // Eigenvalues of block 1 and block 2
      let re1, re2;
      if (s1 === 1) {
        re1 = T[i * n + i];
      } else {
        const [e] = eig2x2(T[i * n + i], T[i * n + (i + 1)], T[(i + 1) * n + i], T[(i + 1) * n + (i + 1)]);
        re1 = e.re;
      }
      if (s2 === 1) {
        re2 = T[i2 * n + i2];
      } else {
        const [e] = eig2x2(T[i2 * n + i2], T[i2 * n + (i2 + 1)], T[(i2 + 1) * n + i2], T[(i2 + 1) * n + (i2 + 1)]);
        re2 = e.re;
      }

      // Swap if block2 is stable and block1 is not
      if (re2 < -1e-10 && re1 >= -1e-10) {
        if (s1 === 1 && s2 === 1) {
          swap1x1Blocks(T, Q, n, i);
          swapped = true;
        }
        // Note: 1×1 ↔ 2×2 and 2×2 ↔ 2×2 block swaps require a full
        // Sylvester-equation + QR orthogonalization (LAPACK dtrexc-level).
        // Skipped here — the hamiltonianStableSubspace caller uses matrix sign
        // and does not rely on this ordering.
        i += s1;
      } else {
        i += s1;
      }
    }
    if (!swapped) break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the real Schur decomposition A = Q T Q' where T is quasi-upper
 * triangular (real Schur form) and Q is orthogonal.
 *
 * @param {number[][]} A_nested  n×n real matrix (nested JS arrays)
 * @returns {{ T: number[][], Q: number[][], eigenvalues: {re,im}[] }}
 */
export function realSchur(A_nested) {
  const n = A_nested.length;
  // Flatten to row-major Float64Array for performance
  const A_flat = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A_flat[i * n + j] = A_nested[i][j];
  }

  const { H, Q } = hessenbergReduction(A_flat, n);
  francisQR(H, Q, n);
  // Reorder BEFORE extracting eigenvalues so the returned array reflects ordering.
  reorderSchurStable(H, Q, n);
  const eigenvalues = extractSchurEigenvalues(H, n);

  // Convert back to nested arrays
  const T = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => H[i * n + j]));
  const Qout = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Q[i * n + j]));

  return { T, Q: Qout, eigenvalues };
}

// ---------------------------------------------------------------------------
// Gram-Schmidt QR — used for extracting the column space of the stable projector.
// ---------------------------------------------------------------------------
function gramSchmidtQR(V, rows, cols) {
  const Q = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) Q[i][j] = V[i][j];
    for (let k = 0; k < j; k++) {
      let dot = 0;
      for (let i = 0; i < rows; i++) dot += Q[i][k] * Q[i][j];
      for (let i = 0; i < rows; i++) Q[i][j] -= dot * Q[i][k];
    }
    let norm = 0;
    for (let i = 0; i < rows; i++) norm += Q[i][j] * Q[i][j];
    norm = Math.sqrt(norm);
    if (norm < 1e-14) {
      for (let i = 0; i < rows; i++) Q[i][j] = i === j % rows ? 1 : 0;
      for (let k = 0; k < j; k++) {
        let d = 0;
        for (let i = 0; i < rows; i++) d += Q[i][k] * Q[i][j];
        for (let i = 0; i < rows; i++) Q[i][j] -= d * Q[i][k];
      }
      norm = 0;
      for (let i = 0; i < rows; i++) norm += Q[i][j] * Q[i][j];
      norm = Math.sqrt(norm) || 1;
    }
    for (let i = 0; i < rows; i++) Q[i][j] /= norm;
  }
  return Q;
}

// Dense matrix multiply for nested arrays (returns nested array)
function denseMul(A, B) {
  const m = A.length, k = B.length, n = B[0].length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let l = 0; l < k; l++) s += A[i][l] * B[l][j];
      C[i][j] = s;
    }
  }
  return C;
}

// Dense matrix inverse via Gauss-Jordan for nested arrays
function denseInv(A) {
  const n = A.length;
  const aug = A.map((row, i) => {
    const r = [...row];
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    const pivot = aug[i][i];
    if (Math.abs(pivot) < 1e-13) throw new Error('singular');
    for (let j = i; j < 2 * n; j++) aug[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = aug[k][i];
      for (let j = i; j < 2 * n; j++) aug[k][j] -= f * aug[i][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * Extract the n-dimensional stable invariant subspace of the Hamiltonian H (2n×2n)
 * via the matrix sign function (Newton iteration).
 *
 * The matrix sign function satisfies sign(H) = I on the unstable subspace and
 * sign(H) = -I on the stable subspace, so Ps = (I − sign(H)) / 2 is the exact
 * spectral projector onto the stable invariant subspace.
 *
 * Newton iteration: Z_{k+1} = (Z_k + Z_k^{-1}) / 2  (quadratic convergence)
 *
 * After convergence, QR-decompose Ps to extract X = cols[0:n], Y = cols[n:2n].
 * The caller then computes P = Y X^{-1}.
 *
 * Reference: Byers (1987), Kenney & Laub (1991).
 */
export function hamiltonianStableSubspace(H_nested, n, options = {}) {
  const N = 2 * n;
  const maxIter = options.maxIter || 100;
  const tol = options.tol || 1e-12;

  // Newton iteration for the matrix sign function
  let Z = H_nested.map((row) => [...row]);
  for (let iter = 0; iter < maxIter; iter++) {
    let Zinv;
    try {
      Zinv = denseInv(Z);
    } catch (_) {
      throw new Error('Matrix sign iteration: Z became singular (Hamiltonian has eigenvalues on imaginary axis — system is not stabilizable via CARE)');
    }
    const Znew = Z.map((row, i) => row.map((val, j) => (val + Zinv[i][j]) / 2));

    let diff = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) diff = Math.max(diff, Math.abs(Znew[i][j] - Z[i][j]));
    }
    Z = Znew;
    if (diff < tol) break;
  }

  // Stable projector: Ps = (I − Z) / 2
  // If Z = sign(H), then Ps projects onto the stable invariant subspace.
  const Ps = Z.map((row, i) => row.map((val, j) => (i === j ? (1 - val) : -val) / 2));

  // Extract orthonormal basis for range(Ps) via Gram-Schmidt on Ps's columns.
  // Select n columns that best represent the stable subspace.
  let topCols;
  if (options.useSignDiagonal) {
    // Use sign(H) diagonal: Z[j][j] < 0 indicates a stable direction.
    const stableCols = [];
    for (let j = 0; j < N; j++) {
      if (Z[j][j] < -0.5) stableCols.push(j);
    }
    if (stableCols.length >= n) {
      topCols = stableCols.slice(0, n);
    } else {
      // Fall back to norm-based if not enough stable diagonals
      const colNorms = Array.from({ length: N }, (_, j) => {
        let s = 0;
        for (let i = 0; i < N; i++) s += Ps[i][j] * Ps[i][j];
        return { j, norm: Math.sqrt(s) };
      });
      colNorms.sort((a, b) => b.norm - a.norm);
      topCols = colNorms.slice(0, n).map((c) => c.j).sort((a, b) => a - b);
    }
  } else {
    const colNorms = Array.from({ length: N }, (_, j) => {
      let s = 0;
      for (let i = 0; i < N; i++) s += Ps[i][j] * Ps[i][j];
      return { j, norm: Math.sqrt(s) };
    });
    colNorms.sort((a, b) => b.norm - a.norm);
    topCols = colNorms.slice(0, n).map((c) => c.j).sort((a, b) => a - b);
  }

  // Build V from the selected columns of Ps
  const Vraw = Array.from({ length: N }, (_, i) => topCols.map((j) => Ps[i][j]));
  const V = gramSchmidtQR(Vraw, N, n);

  const X = V.slice(0, n);
  const Y = V.slice(n);

  // Sanity check: count columns of V whose Rayleigh quotient v'Hv < 0
  // (stable invariant subspace columns should give negative Rayleigh quotients).
  const HV = denseMul(H_nested, V);
  const stableCount = Array.from({ length: n }, (_, j) => {
    let rq = 0;
    for (let i = 0; i < N; i++) rq += V[i][j] * HV[i][j];
    return rq;
  }).filter((rq) => rq < -1e-9).length;

  return { X, Y, stableCount, method: 'matrix-sign' };
}
