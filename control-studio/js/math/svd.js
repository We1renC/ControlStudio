/**
 * svd.js — Singular Value Decomposition (SVD) using One-Sided Jacobi Orthogonalization.
 * 
 * Computes A = U * S * V^T for a real m x n matrix (m >= n).
 * This algorithm is extremely numerically stable and simple, making it 
 * highly suitable for JS without external BLAS/LAPACK dependencies.
 */

/**
 * Compute the SVD of a matrix A (m x n) where m >= n.
 * 
 * @param {number[][]} A_in - Input matrix as an array of row arrays.
 * @param {number} [tol=1e-12] - Convergence tolerance.
 * @param {number} [maxIter=50] - Maximum number of sweeps.
 * @returns {{ U: number[][], S: number[], V: number[][] }}
 */
export function computeSVD(A_in, tol = 1e-12, maxIter = 50) {
  const m = A_in.length;
  const n = A_in[0].length;
  if (m < n) {
    throw new Error('computeSVD requires m >= n. Transpose input if necessary.');
  }

  // Copy A to U (column-major for faster access during rotations)
  // U_cols[j][i] = A[i][j]
  const U_cols = Array.from({ length: n }, () => new Float64Array(m));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      U_cols[j][i] = A_in[i][j];
    }
  }

  // Initialize V to identity (column-major V)
  const V_cols = Array.from({ length: n }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    V_cols[j][j] = 1.0;
  }

  let converged = false;
  let iter = 0;

  while (!converged && iter < maxIter) {
    converged = true;
    
    // One sweep over all column pairs
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Compute dot products of column i and j of U
        let a = 0.0, b = 0.0, c = 0.0;
        const Ui = U_cols[i];
        const Uj = U_cols[j];
        
        for (let k = 0; k < m; k++) {
          a += Ui[k] * Ui[k];
          b += Uj[k] * Uj[k];
          c += Ui[k] * Uj[k];
        }

        // Check for orthogonality
        if (Math.abs(c) > tol * Math.sqrt(a * b)) {
          converged = false;
          
          // Compute Jacobi rotation parameters
          const zeta = (b - a) / (2.0 * c);
          const t = Math.sign(zeta) / (Math.abs(zeta) + Math.sqrt(1.0 + zeta * zeta)) || (1.0 / (Math.abs(zeta) + Math.sqrt(1.0 + zeta * zeta))); // fallback if zeta=0
          const cs = 1.0 / Math.sqrt(1.0 + t * t);
          const sn = cs * t;

          // Apply rotation to U
          for (let k = 0; k < m; k++) {
            const u_ki = Ui[k];
            const u_kj = Uj[k];
            Ui[k] = cs * u_ki - sn * u_kj;
            Uj[k] = sn * u_ki + cs * u_kj;
          }

          // Apply rotation to V
          const Vi = V_cols[i];
          const Vj = V_cols[j];
          for (let k = 0; k < n; k++) {
            const v_ki = Vi[k];
            const v_kj = Vj[k];
            Vi[k] = cs * v_ki - sn * v_kj;
            Vj[k] = sn * v_ki + cs * v_kj;
          }
        }
      }
    }
    iter++;
  }

  // Warn if the Jacobi iteration did not converge — the returned SVD may be
  // inaccurate for ill-conditioned or rank-deficient inputs.
  if (!converged) {
    console.warn(
      `computeSVD: Jacobi iteration did not converge after ${maxIter} sweeps ` +
      `(matrix ${m}×${n}, tol=${tol}). Results may be inaccurate.`
    );
  }

  // Calculate singular values and normalize U
  const S = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let normSq = 0;
    const Uj = U_cols[j];
    for (let k = 0; k < m; k++) normSq += Uj[k] * Uj[k];
    
    S[j] = Math.sqrt(normSq);
    if (S[j] > 1e-15) { // Prevent division by zero for rank-deficient matrices
      for (let k = 0; k < m; k++) Uj[k] /= S[j];
    } else {
      S[j] = 0.0;
      for (let k = 0; k < m; k++) Uj[k] = 0.0;
    }
  }

  // Sort singular values in descending order
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((idx1, idx2) => S[idx2] - S[idx1]);

  const S_sorted = new Array(n);
  const U_sorted = Array.from({ length: m }, () => new Array(n));
  const V_sorted = Array.from({ length: n }, () => new Array(n));

  for (let j = 0; j < n; j++) {
    const oldJ = indices[j];
    S_sorted[j] = S[oldJ];
    for (let i = 0; i < m; i++) U_sorted[i][j] = U_cols[oldJ][i];
    for (let i = 0; i < n; i++) V_sorted[i][j] = V_cols[oldJ][i];
  }

  return { U: U_sorted, S: S_sorted, V: V_sorted };
}
