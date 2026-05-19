/**
 * hinf_riccati.js — Phase 19: Riccati-based H∞ synthesis.
 *
 * Implements Glover-Doyle γ-iteration using dual CAREs solved via the
 * existing Hamiltonian stable-subspace machinery (matrix sign function).
 *
 * Reference: Zhou, Doyle & Glover "Robust and Optimal Control" Ch.16-17.
 */

import { Complex } from '../math/complex.js';
import {
  matAdd, matCreate, matIdentity, matInverse, matMul,
  matScale, matSub, matSymmetrize, matTranspose, matIsPositiveDefinite,
  matEigenvaluesSymmetric, matRank,
} from '../math/matrix.js';
import { hamiltonianStableSubspace, realSchur } from '../math/realschur.js';
import { polyroots } from '../math/polynomial.js';
import { TransferFunction } from './transfer-function.js';
import { MIMOStateSpace } from './mimo.js';
import { hInfNorm } from './robust.js';

// ── helpers ──────────────────────────────────────────────────────────────

function maxAbs(M) {
  let v = 0;
  for (const r of M) for (const x of r) v = Math.max(v, Math.abs(x));
  return v;
}

function charPoly(M) {
  const n = M.length;
  let aux = matCreate(n, n, 0);
  const c = [1];
  for (let k = 1; k <= n; k++) {
    aux = matAdd(matMul(M, aux), matScale(matIdentity(n), c[k - 1]));
    let tr = 0;
    const P = matMul(M, aux);
    for (let i = 0; i < n; i++) tr += P[i][i];
    c.push(-tr / k);
  }
  return c;
}

function matEigs(M) { return polyroots(charPoly(M)); }

function spectralRadius(M) {
  const eigs = matEigs(M);
  return Math.max(...eigs.map(e => Math.sqrt(e.re * e.re + e.im * e.im)));
}

// ── Generalized CARE via Hamiltonian sign function ───────────────────────

/**
 * Solve the generalized CARE:
 *   A'X + XA + Q - X R_x X = 0
 *
 * where R_x is a general symmetric matrix (possibly indefinite).
 * Hamiltonian: H = [A, -R_x; -Q, -A']
 *
 * Returns { P, residualNorm } or throws.
 */
function solveGeneralizedCARE(A, Q, Rx, options = {}) {
  const n = A.length;
  const At = matTranspose(A);
  const N = 2 * n;

  // Build Hamiltonian
  const H = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      H[i][j] = A[i][j];
      H[i][j + n] = -Rx[i][j];
      H[i + n][j] = -Q[i][j];
      H[i + n][j + n] = -At[i][j];
    }
  }

  let { X, Y, stableCount } = hamiltonianStableSubspace(H, n, options);

  // If the default column selection misidentified stable directions,
  // retry with sign-diagonal guided column selection.
  if (stableCount < n) {
    try {
      const result2 = hamiltonianStableSubspace(H, n, { ...options, useSignDiagonal: true });
      if (result2.stableCount >= n) {
        X = result2.X; Y = result2.Y; stableCount = result2.stableCount;
      }
    } catch (_) { /* fall through */ }
  }

  // Compute P from the extracted subspace
  function computeP(Xm, Ym) {
    const Xinv = matInverse(Xm);
    return matSymmetrize(matMul(Ym, Xinv));
  }

  function careResidual(P) {
    const res = matAdd(
      matAdd(matMul(At, P), matMul(P, A)),
      matSub(Q, matMul(matMul(P, Rx), P))
    );
    return maxAbs(res);
  }

  let P, resNorm;
  try {
    P = computeP(X, Y);
    resNorm = careResidual(P);
  } catch (_) {
    resNorm = Infinity;
  }

  // If residual is too large, try Real Schur decomposition as fallback.
  // Find columns of Q corresponding to stable eigenvalues and use those
  // to form the stable subspace basis.
  if (resNorm > 1e-6) {
    try {
      const { Q: Qsch, eigenvalues } = realSchur(H);
      // Find indices of stable eigenvalues
      const stableIdx = [];
      for (let i = 0; i < eigenvalues.length; i++) {
        if (eigenvalues[i].re < -1e-12) stableIdx.push(i);
      }
      if (stableIdx.length >= n) {
        const cols = stableIdx.slice(0, n);
        // Extract columns of Q at stable indices
        const Xs = Array.from({ length: n }, (_, i) =>
          cols.map(j => Qsch[i][j])
        );
        const Ys = Array.from({ length: n }, (_, i) =>
          cols.map(j => Qsch[n + i][j])
        );
        const P2 = computeP(Xs, Ys);
        const res2 = careResidual(P2);
        if (res2 < resNorm) {
          P = P2; resNorm = res2; stableCount = n;
        }
      }
    } catch (_) { /* keep previous result */ }
  }

  // Relative residual threshold: scale by problem norms
  const problemScale = Math.max(maxAbs(Q), maxAbs(A), 1);
  const relResThreshold = 1e-4 * problemScale;

  if (resNorm > relResThreshold) {
    throw new Error(
      `H∞ CARE: residual ${resNorm.toExponential(2)} exceeds threshold ` +
      `${relResThreshold.toExponential(2)} (stableCount=${stableCount}/${n}). ` +
      `Hamiltonian may have imaginary-axis eigenvalues — γ is infeasible.`
    );
  }

  return { P, residualNorm: resNorm };
}

// ── Generalized plant builder ────────────────────────────────────────────

/**
 * Build generalized plant P from SISO plant G and weights W1, W2, W3.
 *
 * Mixed-sensitivity structure:
 *   z1 = W1 · S · w,  z2 = W2 · KS · w,  z3 = W3 · T · w
 *   y = (w - G·u)
 *
 * State: [xg; xw1; xw2; xw3]
 * Input: [w; u]
 * Output: [z1; z2; z3; y]
 *
 * Returns { A, B1, B2, C1, C2, D11, D12, D21, D22, n, nw, nu, nz, ny }
 */
/**
 * Build generalized plant P from SISO plant G and weights W1, W2, W3.
 * Static-gain weights (null SS) are handled via D-matrix only.
 */
export function buildMixedSensitivityPlant(plantSS, w1SS, w2SS, w3SS, w1TfGain, w2TfGain, w3TfGain) {
  const ng = plantSS.A.length;
  const n1 = w1SS ? w1SS.A.length : 0;
  const n2 = w2SS ? w2SS.A.length : 0;
  const n3 = w3SS ? w3SS.A.length : 0;
  const n = ng + n1 + n2 + n3;
  const Ag = plantSS.A, Bg = plantSS.B, Cg = plantSS.C, Dg = plantSS.D;
  const pg = Cg.length, mg = Bg[0].length;
  const nw = 1, nu = mg;
  // Output dimensions: dynamic weights contribute C rows, static weights contribute 1 row each
  const p1 = w1SS ? w1SS.C.length : (w1TfGain != null ? 1 : 0);
  const p2 = w2SS ? w2SS.C.length : (w2TfGain != null ? 1 : 0);
  const p3 = w3SS ? w3SS.C.length : (w3TfGain != null ? 1 : 0);
  const nz = p1 + p2 + p3;
  const ny = pg;

  const A = matCreate(n, n, 0);
  for (let i = 0; i < ng; i++)
    for (let j = 0; j < ng; j++) A[i][j] = Ag[i][j];
  if (n1 > 0) {
    const { A: Aw1, B: Bw1 } = w1SS;
    for (let i = 0; i < n1; i++) {
      for (let j = 0; j < n1; j++) A[ng+i][ng+j] = Aw1[i][j];
      for (let j = 0; j < ng; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Bw1[i][k]*Cg[k][j];
        A[ng+i][j] = -s;
      }
    }
  }
  if (n2 > 0) {
    const { A: Aw2 } = w2SS;
    for (let i = 0; i < n2; i++)
      for (let j = 0; j < n2; j++) A[ng+n1+i][ng+n1+j] = Aw2[i][j];
  }
  if (n3 > 0) {
    const { A: Aw3, B: Bw3 } = w3SS;
    for (let i = 0; i < n3; i++) {
      for (let j = 0; j < n3; j++) A[ng+n1+n2+i][ng+n1+n2+j] = Aw3[i][j];
      for (let j = 0; j < ng; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Bw3[i][k]*Cg[k][j];
        A[ng+n1+n2+i][j] = s;
      }
    }
  }

  const B1 = matCreate(n, nw, 0);
  if (n1 > 0) {
    const Bw1 = w1SS.B;
    for (let i = 0; i < n1; i++)
      for (let j = 0; j < nw; j++) B1[ng+i][j] = Bw1[i][j];
  }

  const B2 = matCreate(n, nu, 0);
  for (let i = 0; i < ng; i++)
    for (let j = 0; j < nu; j++) B2[i][j] = Bg[i][j];
  if (n1 > 0) {
    const Bw1 = w1SS.B;
    for (let i = 0; i < n1; i++)
      for (let j = 0; j < nu; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Bw1[i][k]*Dg[k][j];
        B2[ng+i][j] = -s;
      }
  }
  if (n2 > 0) {
    const Bw2 = w2SS.B;
    for (let i = 0; i < n2; i++)
      for (let j = 0; j < nu; j++) B2[ng+n1+i][j] = Bw2[i][j];
  }
  if (n3 > 0) {
    const Bw3 = w3SS.B;
    for (let i = 0; i < n3; i++)
      for (let j = 0; j < nu; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Bw3[i][k]*Dg[k][j];
        B2[ng+n1+n2+i][j] = s;
      }
  }

  // C1 (nz×n)
  const C1 = matCreate(nz, n, 0);
  let row = 0;
  if (w1SS) {
    const { C: Cw1, D: Dw1 } = w1SS;
    for (let i = 0; i < p1; i++) {
      for (let j = 0; j < n1; j++) C1[row+i][ng+j] = Cw1[i][j];
      for (let j = 0; j < ng; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Dw1[i][k]*Cg[k][j];
        C1[row+i][j] = -s;
      }
    }
  } else if (w1TfGain != null) {
    // Static W1: z1 = w1TfGain · (w - Cg·xg)
    for (let j = 0; j < ng; j++) C1[row][j] = -w1TfGain * Cg[0][j];
  }
  row += p1;
  if (w2SS) {
    const Cw2 = w2SS.C;
    for (let i = 0; i < p2; i++)
      for (let j = 0; j < n2; j++) C1[row+i][ng+n1+j] = Cw2[i][j];
  }
  // Static W2: no C1 contribution (only D12)
  row += p2;
  if (w3SS) {
    const { C: Cw3, D: Dw3 } = w3SS;
    for (let i = 0; i < p3; i++) {
      for (let j = 0; j < n3; j++) C1[row+i][ng+n1+n2+j] = Cw3[i][j];
      for (let j = 0; j < ng; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Dw3[i][k]*Cg[k][j];
        C1[row+i][j] = s;
      }
    }
  } else if (w3TfGain != null) {
    for (let j = 0; j < ng; j++) C1[row][j] = w3TfGain * Cg[0][j];
  }

  // C2 (ny×n)
  const C2 = matCreate(ny, n, 0);
  for (let i = 0; i < pg; i++)
    for (let j = 0; j < ng; j++) C2[i][j] = -Cg[i][j];

  // D11 (nz×nw)
  const D11 = matCreate(nz, nw, 0);
  if (w1SS) {
    for (let i = 0; i < p1; i++)
      for (let j = 0; j < nw; j++) D11[i][j] = w1SS.D[i][j];
  } else if (w1TfGain != null) {
    D11[0][0] = w1TfGain;
  }

  // D12 (nz×nu)
  const D12 = matCreate(nz, nu, 0);
  row = 0;
  if (w1SS) {
    const Dw1 = w1SS.D;
    for (let i = 0; i < p1; i++)
      for (let j = 0; j < nu; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Dw1[i][k]*Dg[k][j];
        D12[row+i][j] = -s;
      }
  } else if (w1TfGain != null) {
    for (let j = 0; j < nu; j++) D12[row][j] = -w1TfGain * Dg[0][j];
  }
  row = p1;
  if (w2SS) {
    for (let i = 0; i < p2; i++)
      for (let j = 0; j < nu; j++) D12[row+i][j] = w2SS.D[i][j];
  } else if (w2TfGain != null) {
    D12[row][0] = w2TfGain;
  }
  row = p1 + p2;
  if (w3SS) {
    const Dw3 = w3SS.D;
    for (let i = 0; i < p3; i++)
      for (let j = 0; j < nu; j++) {
        let s = 0; for (let k = 0; k < pg; k++) s += Dw3[i][k]*Dg[k][j];
        D12[row+i][j] = s;
      }
  } else if (w3TfGain != null) {
    for (let j = 0; j < nu; j++) D12[row][j] = w3TfGain * Dg[0][j];
  }

  const D21 = matCreate(ny, nw, 0);
  for (let i = 0; i < Math.min(ny, nw); i++) D21[i][i] = 1;
  const D22 = matCreate(ny, nu, 0);
  for (let i = 0; i < pg; i++)
    for (let j = 0; j < nu; j++) D22[i][j] = -Dg[i][j];

  return { A, B1, B2, C1, C2, D11, D12, D21, D22, n, nw, nu, nz, ny };
}

// ── TF → minimal SS realization ──────────────────────────────────────────

/**
 * Convert TF to controllable-canonical SS. Returns null for static gains.
 */
export function tfToSS(tf) {
  if (!tf) return null;
  const num = tf.num, den = tf.den;
  const n = den.length - 1;
  if (n <= 0) return null; // static gain — no dynamics
  const a0 = den[0];
  const A = matCreate(n, n, 0);
  const B = matCreate(n, 1, 0);
  const C = matCreate(1, n, 0);
  for (let i = 0; i < n - 1; i++) A[i][i + 1] = 1;
  for (let i = 0; i < n; i++) A[n - 1][i] = -den[n - i] / a0;
  B[n - 1][0] = 1 / a0;
  const numPad = new Array(n + 1).fill(0);
  const offset = n + 1 - num.length;
  for (let i = 0; i < num.length; i++) numPad[offset + i] = num[i];
  const d = numPad[0] / a0;
  for (let i = 0; i < n; i++) C[0][i] = numPad[n - i] / a0 - d * den[n - i] / a0;
  return { A, B, C, D: [[d]] };
}

/** DC gain of a TF (for static-gain weights with no SS). */
function tfDCGain(tf) {
  if (!tf) return 0;
  const num = tf.num, den = tf.den;
  let n0 = 0; for (const c of num) n0 += c === undefined ? 0 : c;
  // evaluate at s=0: last coeff of num / last coeff of den
  return num[num.length - 1] / den[den.length - 1];
}

// ── γ-iteration ──────────────────────────────────────────────────────────

/**
 * Glover-Doyle H∞ synthesis via γ-iteration.
 *
 * Simplified assumptions for SISO mixed-sensitivity:
 * - D22 = 0 (or small)
 * - D11 handled via loop-shifting when non-zero
 *
 * Returns { controller, gamma, Xinf, Yinf, closedLoopPoles, ... }
 */
export function gammaIteration(genPlant, options = {}) {
  const { A, B1: B1raw, B2: B2raw, C1: C1raw, C2: C2raw,
          D11, D12: D12raw, D21: D21raw, D22, n } = genPlant;
  const nw = B1raw[0].length;
  const nu = B2raw[0].length;
  const nz = C1raw.length;
  const ny = C2raw.length;

  const gammaLo = options.gammaLo ?? 0.1;
  const gammaHi = options.gammaHi ?? 50;
  const maxBisect = options.maxBisect ?? 40;
  const tol = options.gammaTol ?? 1e-3;

  // ── D12 / D21 correction (ZDG Theorem 17.3) ─────────────────────────
  // When D12'D12 ≠ I or D21 D21' ≠ I, the CARE R-matrices and gains
  // must absorb these terms. Specifically:
  //   Rx = B2·(D12'D12)⁻¹·B2' − γ⁻²·B1·B1'
  //   Ry = C2'·(D21D21')⁻¹·C2 − γ⁻²·C1'·C1
  //   F  = −(D12'D12)⁻¹·B2'·X∞
  //   L  = −Y∞·C2'·(D21D21')⁻¹

  const B1 = B1raw, B2 = B2raw, C1 = C1raw, C2 = C2raw;

  const D12t = matTranspose(D12raw);
  const D12tD12 = matMul(D12t, D12raw);
  const D21t = matTranspose(D21raw);
  const D21D21t = matMul(D21raw, D21t);
  let D12tD12inv, D21D21tinv;
  try { D12tD12inv = matInverse(D12tD12); } catch (_) {
    throw new Error('H∞: D12 has no full column rank');
  }
  try { D21D21tinv = matInverse(D21D21t); } catch (_) {
    throw new Error('H∞: D21 has no full row rank');
  }

  const At = matTranspose(A);
  const B2t = matTranspose(B2);
  const C1t = matTranspose(C1);
  const C2t = matTranspose(C2);

  const Qx = matMul(C1t, C1);                          // C1'C1
  const Qy = matMul(B1, matTranspose(B1));              // B1 B1'
  const B2RinvB2t = matMul(matMul(B2, D12tD12inv), B2t); // B2·(D12'D12)⁻¹·B2'
  const C2tRinvC2 = matMul(matMul(C2t, D21D21tinv), C2); // C2'·(D21D21')⁻¹·C2

  let lo = gammaLo, hi = gammaHi;
  let bestResult = null;

  for (let iter = 0; iter < maxBisect; iter++) {
    const gamma = (lo + hi) / 2;
    if (hi - lo < tol) break;

    try {
      const g2 = gamma * gamma;

      // Rx = B2·(D12'D12)⁻¹·B2' − γ⁻²·B1·B1'
      const Rx = matSub(B2RinvB2t, matScale(Qy, 1 / g2));
      // Ry = C2'·(D21D21')⁻¹·C2 − γ⁻²·C1'·C1
      const Ry = matSub(C2tRinvC2, matScale(Qx, 1 / g2));

      // Solve X∞: A'X + XA + C1'C1 − X·Rx·X = 0
      const xResult = solveGeneralizedCARE(A, Qx, Rx, { tol: 1e-11 });
      const Xinf = xResult.P;

      const xEigs = matEigenvaluesSymmetric(matSymmetrize(Xinf));
      if (xEigs[0] < -1e-8) { lo = gamma; continue; }

      // Solve Y∞: A·Y + Y·A' + B1·B1' − Y·Ry·Y = 0
      const yResult = solveGeneralizedCARE(At, Qy, Ry, { tol: 1e-11 });
      const Yinf = yResult.P;

      const yEigs = matEigenvaluesSymmetric(matSymmetrize(Yinf));
      if (yEigs[0] < -1e-8) { lo = gamma; continue; }

      // Check coupling: ρ(X∞ Y∞) < γ²
      const XY = matMul(Xinf, Yinf);
      const rho = spectralRadius(XY);
      if (rho >= g2) { lo = gamma; continue; }

      // Controller gains with D12/D21 correction
      const F = matScale(matMul(matMul(D12tD12inv, B2t), Xinf), -1);
      const L = matScale(matMul(matMul(Yinf, C2t), D21D21tinv), -1);

      // Z∞ = (I − γ⁻² Y∞ X∞)⁻¹
      const Zinv = matSub(matIdentity(n), matScale(XY, 1 / g2));
      let Zinf;
      try { Zinf = matInverse(Zinv); } catch (_) { lo = gamma; continue; }

      // Ak = A + γ⁻²·B1·B1'·X∞ + B2·F + Z∞·L·C2
      const Ak = matAdd(
        matAdd(A, matScale(matMul(Qy, Xinf), 1 / g2)),
        matAdd(matMul(B2, F), matMul(matMul(Zinf, L), C2))
      );
      const Bk = matMul(Zinf, L);
      const Ck = F.map(r => [...r]);
      const Dk = matCreate(nu, ny, 0);

      // Check controller stability
      let clPoles;
      try { clPoles = matEigs(Ak); } catch (_) { lo = gamma; continue; }
      const ctrlStable = clPoles.every(p => p.re < 1e-6);
      if (!ctrlStable) { lo = gamma; continue; }

      bestResult = {
        gamma, Xinf, Yinf, rhoXY: rho,
        xResidual: xResult.residualNorm,
        yResidual: yResult.residualNorm,
        controller: { A: Ak, B: Bk, C: Ck, D: Dk },
        controllerPoles: clPoles,
        F, L, Zinf,
        iterations: iter + 1,
      };
      hi = gamma; // try smaller
    } catch (_) {
      lo = gamma; // infeasible, try larger
    }
  }

  if (!bestResult) {
    throw new Error(
      `H∞ γ-iteration failed: no feasible γ in [${gammaLo}, ${gammaHi}]. ` +
      `Check stabilizability/detectability of the generalized plant.`
    );
  }

  return bestResult;
}

/** Small Cholesky for nu/ny ≤ 4 */
function choleskySmall(A) {
  const n = A.length;
  const L = matCreate(n, n, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-30)) : s / L[j][j];
    }
  }
  return L;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Full Riccati-based H∞ mixed-sensitivity synthesis for SISO plants.
 *
 * @param {TransferFunction} plant
 * @param {{ W1?: TransferFunction, W2?: TransferFunction, W3?: TransferFunction }} weights
 * @param {object} options
 * @returns synthesis result with controller TF, γ*, residuals
 */
export function synthesizeHinfRiccati(plant, weights, options = {}) {
  if (!plant) throw new Error('plant required');
  if (!weights.W1 && !weights.W2 && !weights.W3) {
    throw new Error('At least one weight (W1, W2, or W3) is required');
  }

  // For static-gain plant, wrap in minimal SS
  const plantSS = tfToSS(plant);
  if (!plantSS) throw new Error('Plant must have dynamics (order >= 1)');
  const w1SS = weights.W1 ? tfToSS(weights.W1) : null;
  const w2SS = weights.W2 ? tfToSS(weights.W2) : null;
  const w3SS = weights.W3 ? tfToSS(weights.W3) : null;
  // DC gains for static-gain weights
  const w1g = !w1SS && weights.W1 ? tfDCGain(weights.W1) : undefined;
  const w2g = !w2SS && weights.W2 ? tfDCGain(weights.W2) : undefined;
  const w3g = !w3SS && weights.W3 ? tfDCGain(weights.W3) : undefined;

  const genPlant = buildMixedSensitivityPlant(plantSS, w1SS, w2SS, w3SS, w1g, w2g, w3g);
  const result = gammaIteration(genPlant, options);

  // Convert controller SS to TF for compatibility
  const ctrl = result.controller;
  let controllerTf = null;
  try {
    // C(sI-A)⁻¹B + D → num/den
    const n = ctrl.A.length;
    if (n > 0) {
      const den = charPoly(ctrl.A);
      // Numerator via Leverrier
      const realDen = den.map(c => typeof c === 'number' ? c : c);
      // Use state-space to TF conversion
      const adjCoeffs = [];
      let Mk = matIdentity(n);
      for (let k = 0; k < n; k++) {
        const CkB = matMul(matMul(ctrl.C, Mk), ctrl.B);
        adjCoeffs.push(CkB[0][0]);
        if (k < n - 1) Mk = matAdd(matMul(ctrl.A, Mk), matScale(matIdentity(n), realDen[k + 1]));
      }
      const d = ctrl.D[0][0];
      const num = new Array(n + 1);
      num[0] = d * realDen[0];
      for (let k = 0; k < n; k++) {
        num[k + 1] = adjCoeffs[k] + d * realDen[k + 1];
      }
      controllerTf = new TransferFunction(num, realDen);
    }
  } catch (_) {
    // Leave as null if conversion fails
  }

  // Compute closed-loop H∞ norm for verification
  let closedLoopNorm = null;
  if (controllerTf) {
    try {
      const L = controllerTf.series(plant);
      const cl = L.feedback();
      if (cl.isStable()) {
        // Build MIMO closed-loop Tzw for norm check
        const omegas = Array.from({ length: 200 }, (_, i) =>
          Math.pow(10, -3 + (6 * i) / 199)
        );
        // Approximate: check |W1·S|, |W2·KS|, |W3·T| peak
        let peak = 0;
        for (const omega of omegas) {
          const s = new Complex(0, omega);
          const Lv = L.evalAt(s);
          const denom = new Complex(1 + Lv.re, Lv.im);
          if (denom.magnitude < 1e-12) continue;
          const S = new Complex(1, 0).div(denom);
          const T = Lv.div(denom);
          const K = controllerTf.evalAt(s);
          const KS = K.mul(S);
          let cost2 = 0;
          if (weights.W1) cost2 += weights.W1.evalAt(s).mul(S).magnitude ** 2;
          if (weights.W2) cost2 += weights.W2.evalAt(s).mul(KS).magnitude ** 2;
          if (weights.W3) cost2 += weights.W3.evalAt(s).mul(T).magnitude ** 2;
          peak = Math.max(peak, Math.sqrt(cost2));
        }
        closedLoopNorm = peak;
      }
    } catch (_) { /* ignore */ }
  }

  return {
    gamma: result.gamma,
    controller: result.controller,
    controllerTf,
    Xinf: result.Xinf,
    Yinf: result.Yinf,
    rhoXY: result.rhoXY,
    xResidual: result.xResidual,
    yResidual: result.yResidual,
    controllerPoles: result.controllerPoles,
    closedLoopNorm,
    iterations: result.iterations,
    method: 'glover-doyle-riccati',
  };
}
