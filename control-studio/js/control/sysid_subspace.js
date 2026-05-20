/**
 * sysid_subspace.js — Subspace State-Space System Identification (MOESP-like algorithm).
 * 
 * References:
 * - Verhaegen, M., "Identification of the deterministic part of MIMO state space models..."
 * - Van Overschee & De Moor, "Subspace Identification for Linear Systems..."
 */

import { computeSVD } from '../math/svd.js';
import { matMul, matTranspose, matInverse } from '../math/matrix.js';
import { realSchur } from '../math/realschur.js'; // Can be used for Gram-Schmidt or QR

/**
 * Perform a QR decomposition on A (m x n).
 * Returns { Q, R } where A = Q * R, Q is m x n orthogonal, R is n x n upper triangular.
 * Assumes m >= n.
 */
function qrDecomposition(A) {
  const m = A.length;
  const n = A[0].length;
  
  const Q = Array.from({ length: m }, () => new Array(n).fill(0));
  const R = Array.from({ length: n }, () => new Array(n).fill(0));
  
  for (let j = 0; j < n; j++) {
    // v = A[:, j]
    const v = new Array(m).fill(0);
    for (let i = 0; i < m; i++) v[i] = A[i][j];
    
    for (let i = 0; i < j; i++) {
      let dot = 0;
      for (let k = 0; k < m; k++) dot += Q[k][i] * v[k];
      R[i][j] = dot;
      for (let k = 0; k < m; k++) v[k] -= dot * Q[k][i];
    }
    
    let norm = 0;
    for (let k = 0; k < m; k++) norm += v[k] * v[k];
    norm = Math.sqrt(norm);
    
    R[j][j] = norm;
    if (norm > 1e-14) {
      for (let k = 0; k < m; k++) Q[k][j] = v[k] / norm;
    } else {
      for (let k = 0; k < m; k++) Q[k][j] = 0;
    }
  }
  return { Q, R };
}

/**
 * Subspace Identification (MOESP algorithm) for State-Space models.
 * 
 * @param {number[][]} u - Input matrix (N samples x m inputs). If 1D, treated as N x 1.
 * @param {number[][]} y - Output matrix (N samples x p outputs). If 1D, treated as N x 1.
 * @param {number} order - The desired state dimension (n).
 * @param {number} horizon - The block horizon size (i). Needs to be > order.
 * @param {number} Ts - Sample time.
 * @returns {{ A, B, C, D }} Discrete-time state-space matrices.
 */
export function identifySubspace(u_in, y_in, order, horizon, Ts = 1) {
  // Normalize inputs to 2D arrays (N x m) and (N x p)
  const u = Array.isArray(u_in[0]) ? u_in : u_in.map(val => [val]);
  const y = Array.isArray(y_in[0]) ? y_in : y_in.map(val => [val]);
  
  const N = u.length;
  if (y.length !== N) throw new Error('Input and output must have the same number of samples.');
  
  const m = u[0].length;
  const p = y[0].length;
  const i = horizon;
  
  if (2 * i >= N) throw new Error('Horizon too large for the amount of data (2*i must be < N).');
  
  const cols = N - 2 * i + 1;
  
  // 1. Construct Block Hankel Matrices
  const U_f = []; // Future inputs (i * m rows)
  const U_p = []; // Past inputs (i * m rows)
  const Y_f = []; // Future outputs (i * p rows)
  const Y_p = []; // Past outputs (i * p rows)
  
  for (let row = 0; row < i; row++) {
    for (let ch = 0; ch < m; ch++) {
      const up_row = new Array(cols).fill(0);
      const uf_row = new Array(cols).fill(0);
      for (let c = 0; c < cols; c++) {
        up_row[c] = u[c + row][ch];
        uf_row[c] = u[c + row + i][ch];
      }
      U_p.push(up_row);
      U_f.push(uf_row);
    }
    for (let ch = 0; ch < p; ch++) {
      const yp_row = new Array(cols).fill(0);
      const yf_row = new Array(cols).fill(0);
      for (let c = 0; c < cols; c++) {
        yp_row[c] = y[c + row][ch];
        yf_row[c] = y[c + row + i][ch];
      }
      Y_p.push(yp_row);
      Y_f.push(yf_row);
    }
  }
  
  // H = [U_f; U_p; Y_p; Y_f]
  const H = [...U_f, ...U_p, ...Y_p, ...Y_f];
  const H_rows = H.length; // i*m + i*m + i*p + i*p = 2*i*(m+p)
  
  // 2. LQ Decomposition of H
  // Since we have QR, we do QR on H^T: H^T = Q R  => H = R^T Q^T
  // Let L = R^T (lower triangular)
  const H_t = matTranspose(H);
  const { R } = qrDecomposition(H_t); // R is cols x H_rows (but upper triangular n x n)
  const L = matTranspose(R); // L is H_rows x H_rows lower triangular
  
  // 3. Extract L32 block
  // L partitions corresponding to [U_f; W_p; Y_f] where W_p = [U_p; Y_p]
  // Row indices:
  // U_f: 0 to i*m - 1
  // W_p: i*m to i*m + i*(m+p) - 1
  // Y_f: i*m + i*(m+p) to end
  const uf_end = i * m;
  const wp_end = uf_end + i * (m + p);
  const L32 = [];
  for (let r = wp_end; r < H_rows; r++) {
    const row = new Array(i * (m + p)).fill(0);
    for (let c = uf_end; c < wp_end; c++) {
      row[c - uf_end] = L[r][c];
    }
    L32.push(row);
  }
  
  // 4. SVD of L32 to find Extended Observability Matrix Gamma_i
  // L32 has more columns than rows, so we transpose it for computeSVD
  const svd = computeSVD(matTranspose(L32));
  // Since L32^T = U * S * V^T, then L32 = V * S * U^T.
  // The left singular vectors of L32 are in svd.V!
  const n = order;
  const Gamma_i = Array.from({ length: i * p }, (_, row) => {
    const r = new Array(n).fill(0);
    for (let c = 0; c < n; c++) {
      r[c] = svd.V[row][c] * Math.sqrt(svd.S[c]);
    }
    return r;
  });
  
  // 5. Extract C and A from Gamma_i
  // C is the first p rows of Gamma_i
  const C = Gamma_i.slice(0, p);
  
  // Gamma_{i-1} A = Gamma_{i, shifted}
  const Gamma_top = Gamma_i.slice(0, (i - 1) * p);
  const Gamma_bottom = Gamma_i.slice(p, i * p);
  
  // A = (Gamma_top^T * Gamma_top)^(-1) * Gamma_top^T * Gamma_bottom
  const Gt_G = matMul(matTranspose(Gamma_top), Gamma_top);
  const Gt_G_inv = matInverse(Gt_G);
  const Gt_Gb = matMul(matTranspose(Gamma_top), Gamma_bottom);
  const A = matMul(Gt_G_inv, Gt_Gb);
  
  // 6. Linear Regression to find B and D
  // Using the property that for a given A and C, the output is linear in B and D (and x0).
  // y(k) = C * A^k * x0 + sum_{j=0}^{k-1} C * A^(k-1-j) * B * u(j) + D * u(k)
  // This is a standard linear least squares problem.
  // We formulate: y_vec = Phi * Theta
  // Theta = [vec(B)^T, vec(D)^T, x0^T]^T
  const numParams = n * m + p * m + n;
  const Phi_lsq = Array.from({ length: N * p }, () => new Array(numParams).fill(0));
  const Y_vec = new Array(N * p).fill(0);
  
  for (let k = 0; k < N; k++) {
    for (let out = 0; out < p; out++) {
      Y_vec[k * p + out] = y[k][out];
    }
  }
  
  // Precompute powers of A: A_pow[k] = A^k
  const A_pow = [Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => r === c ? 1 : 0))];
  for (let k = 1; k <= N; k++) {
    A_pow.push(matMul(A_pow[k - 1], A));
  }
  
  // Fill Phi_lsq
  for (let k = 0; k < N; k++) {
    for (let out = 0; out < p; out++) {
      const rowIdx = k * p + out;
      
      // x0 terms (last n columns)
      for (let st = 0; st < n; st++) {
        let val = 0;
        for (let j = 0; j < n; j++) val += C[out][j] * A_pow[k][j][st];
        Phi_lsq[rowIdx][n * m + p * m + st] = val;
      }
      
      // D terms (p * m columns)
      for (let inp = 0; inp < m; inp++) {
        Phi_lsq[rowIdx][n * m + out * m + inp] = u[k][inp];
      }
      
      // B terms (n * m columns)
      // sum_{j=0}^{k-1} C * A^(k-1-j) * B * u(j)
      // The element for B_{st, inp} is sum_{j=0}^{k-1} [C * A^(k-1-j)]_{out, st} * u(j)_inp
      for (let st = 0; st < n; st++) {
        for (let inp = 0; inp < m; inp++) {
          let val = 0;
          for (let j = 0; j <= k - 1; j++) {
            let CA_term = 0;
            for (let x = 0; x < n; x++) {
              CA_term += C[out][x] * A_pow[k - 1 - j][x][st];
            }
            val += CA_term * u[j][inp];
          }
          Phi_lsq[rowIdx][st * m + inp] = val;
        }
      }
    }
  }
  
  // Solve Theta = (Phi^T * Phi)^-1 * Phi^T * Y_vec
  const PtP = matMul(matTranspose(Phi_lsq), Phi_lsq);
  const PtP_inv = matInverse(PtP);
  const PtY = matMul(matTranspose(Phi_lsq), Y_vec.map(v => [v])).map(r => r[0]);
  const Theta = matMul(PtP_inv, PtY.map(v => [v])).map(r => r[0]);
  
  // Extract B, D
  const B = Array.from({ length: n }, () => new Array(m).fill(0));
  const D = Array.from({ length: p }, () => new Array(m).fill(0));
  
  for (let st = 0; st < n; st++) {
    for (let inp = 0; inp < m; inp++) {
      B[st][inp] = Theta[st * m + inp];
    }
  }
  for (let out = 0; out < p; out++) {
    for (let inp = 0; inp < m; inp++) {
      D[out][inp] = Theta[n * m + out * m + inp];
    }
  }
  
  return { A, B, C, D, Ts };
}
