import { Complex } from '../math/complex.js';
import { hamiltonianStableSubspace } from '../math/realschur.js';
import {
  matAdd,
  matCreate,
  matEigenvaluesSymmetric,
  matExp,
  matIdentity,
  matInverse,
  matIsPositiveDefinite,
  matKronecker,
  matMul,
  matRank,
  matScale,
  matSolve,
  matSub,
  matSymmetrize,
  matTranspose,
  matTrace,
  SingularMatrixError,
} from '../math/matrix.js';
import { controllabilityMatrix, observabilityMatrix, stateSpaceToTransferFunction, tfToControllableCanonical } from './state-space.js';
import { parseRootsString } from './zpk.js';
import { polyroots } from '../math/polynomial.js';
import { rand, randn as _randn } from '../math/rng.js';

function randn() {
  // Delegate to seedable generator; falls back to Math.random when no seed is set.
  return _randn();
}

function toComplex(root) {
  return root instanceof Complex ? root : new Complex(root.re ?? root, root.im ?? 0);
}

function desiredPolynomialFromRoots(roots) {
  let coeffs = [new Complex(1, 0)];
  for (const root of roots.map(toComplex)) {
    const next = Array.from({ length: coeffs.length + 1 }, () => new Complex(0, 0));
    for (let i = 0; i < coeffs.length; i++) {
      next[i] = next[i].add(coeffs[i]);
      next[i + 1] = next[i + 1].add(coeffs[i].mul(root.neg()));
    }
    coeffs = next;
  }
  const real = coeffs.map((value) => {
    if (Math.abs(value.im) > 1e-8) {
      throw new Error('Desired poles must produce a real characteristic polynomial');
    }
    return value.re;
  });
  return real.map((value) => (Math.abs(value) < 1e-12 ? 0 : value));
}

function matrixPolynomial(A, coeffsHighFirst) {
  const n = A.length;
  let out = matCreate(n, n, 0);
  for (const coeff of coeffsHighFirst) {
    out = matAdd(matMul(out, A), matScale(matIdentity(n), coeff));
  }
  return out;
}

function vecColumnMajor(M) {
  const out = [];
  for (let col = 0; col < M[0].length; col++) {
    for (let row = 0; row < M.length; row++) out.push(M[row][col]);
  }
  return out;
}

function matrixFromColumnMajor(values, rows, cols) {
  const out = matCreate(rows, cols, 0);
  let idx = 0;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) out[row][col] = values[idx++];
  }
  return out;
}

function maxAbsMatrix(A) {
  let max = 0;
  for (const row of A) {
    for (const value of row) max = Math.max(max, Math.abs(value));
  }
  return max;
}

function scalarFromMatrix(M) {
  if (!Array.isArray(M) || M.length !== 1 || M[0].length !== 1) {
    throw new Error('Expected 1x1 matrix');
  }
  return M[0][0];
}

function c(value, im = 0) {
  return value instanceof Complex ? value : new Complex(value, im);
}

function complexMatrixFromReal(A) {
  return A.map((row) => row.map((value) => c(value)));
}

function complexIdentity(n) {
  const out = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0)));
  for (let i = 0; i < n; i++) out[i][i] = c(1);
  return out;
}

function complexMatMul(A, B) {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => c(0)));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = c(0);
      for (let k = 0; k < inner; k++) sum = sum.add(A[i][k].mul(B[k][j]));
      out[i][j] = sum;
    }
  }
  return out;
}

function complexMatInverse(A, tolerance = 1e-10) {
  const n = A.length;
  const aug = A.map((row, i) => [...row.map((value) => c(value.re, value.im)), ...complexIdentity(n)[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (aug[row][col].magnitude > aug[pivot][col].magnitude) pivot = row;
    }
    if (aug[pivot][col].magnitude < tolerance) {
      throw new SingularMatrixError('Hamiltonian stable-subspace X matrix is singular');
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const pivotValue = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] = aug[col][j].div(pivotValue);
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] = aug[row][j].sub(factor.mul(aug[col][j]));
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

function complexNullVector(A, tolerance = 1e-8) {
  const rows = A.length;
  const cols = A[0].length;
  const M = A.map((row) => row.map((value) => c(value.re, value.im)));
  const pivots = [];
  let r = 0;

  for (let col = 0; col < cols && r < rows; col++) {
    let pivot = r;
    for (let row = r + 1; row < rows; row++) {
      if (M[row][col].magnitude > M[pivot][col].magnitude) pivot = row;
    }
    if (M[pivot][col].magnitude < tolerance) continue;

    [M[r], M[pivot]] = [M[pivot], M[r]];
    const pivotValue = M[r][col];
    for (let j = col; j < cols; j++) M[r][j] = M[r][j].div(pivotValue);
    for (let row = 0; row < rows; row++) {
      if (row === r) continue;
      const factor = M[row][col];
      for (let j = col; j < cols; j++) {
        M[row][j] = M[row][j].sub(factor.mul(M[r][j]));
      }
    }
    pivots.push(col);
    r++;
  }

  const pivotSet = new Set(pivots);
  const freeCols = [];
  for (let col = 0; col < cols; col++) {
    if (!pivotSet.has(col)) freeCols.push(col);
  }
  if (!freeCols.length) {
    throw new SingularMatrixError('Hamiltonian eigenvector null space is empty');
  }

  const vector = Array.from({ length: cols }, () => c(0));
  const freeCol = freeCols[freeCols.length - 1];
  vector[freeCol] = c(1);
  for (let row = pivots.length - 1; row >= 0; row--) {
    const pivotCol = pivots[row];
    let sum = c(0);
    for (const col of freeCols) sum = sum.add(M[row][col].mul(vector[col]));
    vector[pivotCol] = sum.neg();
  }
  return vector;
}

function hamiltonianMatrix(A, B, Q, R) {
  const n = A.length;
  const Rinv = matInverse(R);
  const BRinvBt = matMul(matMul(B, Rinv), matTranspose(B));
  const At = matTranspose(A);
  const H = matCreate(2 * n, 2 * n, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      H[i][j] = A[i][j];
      H[i][j + n] = -BRinvBt[i][j];
      H[i + n][j] = -Q[i][j];
      H[i + n][j + n] = -At[i][j];
    }
  }
  return H;
}

function careResidual(A, B, Q, R, P) {
  const Rinv = matInverse(R);
  const BRinvBt = matMul(matMul(B, Rinv), matTranspose(B));
  const PBRinvBtP = matMul(matMul(P, BRinvBt), P);
  return matAdd(
    matAdd(matMul(matTranspose(A), P), matMul(P, A)),
    matSub(Q, PBRinvBtP),
  );
}

function maxImagMatrix(A) {
  let max = 0;
  for (const row of A) {
    for (const value of row) max = Math.max(max, Math.abs(value.im));
  }
  return max;
}

function complexColumnsFromVectors(vectors, startRow, rowCount) {
  return Array.from({ length: rowCount }, (_, row) =>
    vectors.map((vector) => vector[startRow + row])
  );
}

/**
 * CARE via real Schur decomposition of the Hamiltonian matrix.
 * Returns { P, K, Acl } or throws. Used as primary path for n ≥ 5.
 */
function solveCareRealSchur(A, B, Qmat, Rmat, n, m, options) {
  const H = hamiltonianMatrix(A, B, Qmat, Rmat);
  const { X, Y, stableCount } = hamiltonianStableSubspace(H, n);

  if (stableCount < n) {
    throw new Error(
      `Real Schur CARE: 找到 ${stableCount} 個 stable eigenvalues，需要 ${n}。` +
      ` 通常代表 (A,B) 不 stabilizable 或 Hamiltonian 含 jω-axis eigenvalues。`,
    );
  }

  let Xinv;
  try {
    Xinv = matInverse(X);
  } catch (e) {
    if (e instanceof SingularMatrixError) {
      throw new Error(
        `Real Schur CARE: stable invariant subspace X 為 singular — (A,B) 可能不 stabilizable。`,
      );
    }
    throw e;
  }

  const P = matSymmetrize(matMul(Y, Xinv));
  return P;
}

/**
 * Continuous CARE by Hamiltonian stable invariant subspace.
 *
 * For n ≥ 5 the primary path is a real Schur decomposition (Francis QR) which is
 * numerically more reliable than the eigenvector path for high-order systems.
 * For n ≤ 4 the dependency-free eigenvector path is tried first (faster, same
 * accuracy at low order), with real Schur as fallback.
 */
export function solveCareHamiltonianSchur(A, B, Q = null, R = null, options = {}) {
  const n = A.length;
  const m = B[0].length;
  const Qmat = Q ? matSymmetrize(Q.map((row) => [...row])) : matIdentity(n);
  const Rmat = R ? matSymmetrize(R.map((row) => [...row])) : matIdentity(m);
  const tolerance = options.tolerance || 1e-7;

  if (Qmat.length !== n || Qmat[0].length !== n) throw new Error(`Q must be ${n}×${n}`);
  if (Rmat.length !== m || Rmat[0].length !== m) throw new Error(`R must be ${m}×${m}`);
  if (!matIsPositiveDefinite(Rmat)) throw new Error('R must be positive definite');

  // For n ≥ 5, the Durand-Kerner polynomial root-finder degrades on degree-2n
  // characteristic polynomials. Use the real Schur path (Francis QR) as primary.
  // For n ≤ 4, try the lightweight eigenvector path first; fall back to real Schur.
  const useRealSchurFirst = n >= 5 || options.method === 'schur';

  let P = null;
  let usedMethod = 'hamiltonian-schur';
  let eigenvalues = [];
  let stable = [];
  let imaginaryNorm = 0;

  if (!useRealSchurFirst) {
    // --- Eigenvector path (n ≤ 4) ---
    try {
      const H = hamiltonianMatrix(A, B, Qmat, Rmat);
      eigenvalues = polyroots(characteristicPolynomialCoefficients(H));
      stable = eigenvalues
        .filter((root) => root.re < -tolerance)
        .sort((a, b) => a.re - b.re || a.im - b.im)
        .slice(0, n);

      if (stable.length !== n) {
        throw new Error(
          `Hamiltonian CARE solver: 期望 ${n} 個 stable eigenvalues，實際 ${stable.length}。` +
          ` 通常代表 (A,B) 不 stabilizable，或 Hamiltonian 含 jω-axis eigenvalues（boundary case）。` +
          ` 建議：(1) 檢查 (A,B) 是否含 uncontrollable + 不穩定 mode；(2) 對 marginally stable plant 改用較大 Q penalty。`,
        );
      }

      const Hc = complexMatrixFromReal(H);
      const vectors = stable.map((lambda) => {
        const shifted = Hc.map((row, i) => row.map((value, j) => (
          i === j ? value.sub(lambda) : value
        )));
        return complexNullVector(shifted, options.nullTolerance || 1e-7);
      });

      const X = complexColumnsFromVectors(vectors, 0, n);
      const Y = complexColumnsFromVectors(vectors, n, n);
      let Xinv;
      try {
        Xinv = complexMatInverse(X, options.inverseTolerance || 1e-8);
      } catch (e) {
        if (e instanceof SingularMatrixError) {
          throw new Error('eigenvector-X-singular');
        }
        throw e;
      }
      const Pc = complexMatMul(Y, Xinv);
      imaginaryNorm = maxImagMatrix(Pc);
      if (imaginaryNorm > (options.imaginaryTolerance || 1e-6)) {
        throw new Error(`non-real-P:${imaginaryNorm}`);
      }
      P = matSymmetrize(Pc.map((row) => row.map((value) => (
        Math.abs(value.re) < 1e-12 ? 0 : value.re
      ))));
      usedMethod = 'eigenvector';
    } catch (e) {
      // Fall through to real Schur
      if (/不 stabilizable|not stabilizable/i.test(e.message)) throw e;
      P = null;
    }
  }

  if (P === null) {
    // --- Real Schur path ---
    try {
      P = solveCareRealSchur(A, B, Qmat, Rmat, n, m, options);
      usedMethod = 'real-schur';
    } catch (e) {
      if (useRealSchurFirst) {
        throw new Error(
          `Hamiltonian CARE solver: 期望 ${n} 個 stable eigenvalues（real Schur path）。` +
          ` 通常代表 (A,B) 不 stabilizable，或 Hamiltonian 含 jω-axis eigenvalues。` +
          ` 建議：(1) 檢查 (A,B) PBH 條件；(2) 對 marginally stable plant 改用較大 Q penalty。`,
        );
      }
      throw new Error(
        `Hamiltonian CARE solver: stable invariant subspace X 為 singular — ` +
        `通常代表 (A,B) 不 stabilizable，或 stable eigenvectors 線性相依（boundary case）。` +
        ` 建議：(1) 檢查 (A,B) PBH 條件；(2) 對 marginally stable plant 改用較大 Q penalty；` +
        `(3) 若 plant 含 jω-axis uncontrollable mode，當前 eigenvector path 無法處理，需 real Schur fallback。`,
      );
    }
  }

  const K = matMul(matInverse(Rmat), matMul(matTranspose(B), P));
  const Acl = matSub(A, matMul(B, K));
  const residual = careResidual(A, B, Qmat, Rmat, P);
  const riccatiResidualNorm = maxAbsMatrix(residual);
  const closedLoopLyapunov = analyzeLyapunov(Acl, matIdentity(n));

  if (!closedLoopLyapunov.provenStable || riccatiResidualNorm > (options.residualTolerance || 1e-5)) {
    throw new Error(`Hamiltonian CARE solver failed validation: residual=${riccatiResidualNorm}, method=${usedMethod}`);
  }

  return {
    K,
    P,
    Q: Qmat,
    R: Rmat,
    Acl,
    residual,
    riccatiResidualNorm,
    residualNorm: riccatiResidualNorm,
    closedLoopStable: closedLoopLyapunov.provenStable,
    closedLoopLyapunov,
    eigenvalues,
    stableEigenvalues: stable,
    imaginaryNorm,
    method: usedMethod,
    initialGainStrategy: 'hamiltonian-schur',
  };
}

// ---------------------------------------------------------------------------
// CS-P11-01: DARE solver via symplectic matrix + Cayley transform + matrix sign
// ---------------------------------------------------------------------------

/**
 * Build the 2n×2n symplectic matrix for the DARE:
 *   P = Ad' P Ad − Ad' P Bd (R + Bd' P Bd)⁻¹ Bd' P Ad + Q
 *
 * M_d = K⁻¹ L  where the symplectic pencil (L, K) is:
 *   L = [[Ad, 0], [−Q, I]],  K = [[I, Bd R⁻¹ Bd'], [0, Ad']]
 *
 * Requires Ad to be invertible.
 */
function symplecticMatrix(Ad, Bd, Qmat, Rmat, n) {
  const Rinv = matInverse(Rmat);
  const BRBt = matMul(matMul(Bd, Rinv), matTranspose(Bd));
  const AdT = matTranspose(Ad);
  let AdTinv;
  try {
    AdTinv = matInverse(AdT);
  } catch (_) {
    throw new Error('DARE: Ad は可逆でなければなりません（singular Ad）');
  }
  const M11 = matAdd(Ad, matMul(BRBt, matMul(AdTinv, Qmat)));
  const M12 = matScale(matMul(BRBt, AdTinv), -1);
  const M21 = matScale(matMul(AdTinv, Qmat), -1);
  const M22 = AdTinv;
  const N = 2 * n;
  return Array.from({ length: N }, (_, i) => {
    const row = new Array(N).fill(0);
    if (i < n) {
      for (let j = 0; j < n; j++) { row[j] = M11[i][j]; row[n + j] = M12[i][j]; }
    } else {
      for (let j = 0; j < n; j++) { row[j] = M21[i - n][j]; row[n + j] = M22[i - n][j]; }
    }
    return row;
  });
}

/**
 * Solve the Discrete Algebraic Riccati Equation (DARE) via:
 *   1. Build the symplectic matrix M_d (2n×2n)
 *   2. Cayley transform: C = (M_d − I)(M_d + I)⁻¹ maps |λ|<1 → Re<0
 *   3. Matrix sign function (Newton iteration) on C to isolate stable subspace
 *   4. Extract P = Y X⁻¹ from the stable invariant subspace [X; Y]
 *
 * Returns { P, K, closedLoopStable, dareResidualNorm, method }.
 */
export function solveDAREHamiltonianSign(Ad, Bd, Q = null, R = null, options = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  const Qmat = Q ? matSymmetrize(Q.map((r) => [...r])) : matIdentity(n);
  const Rmat = R ? matSymmetrize(R.map((r) => [...r])) : matIdentity(m);
  if (!matIsPositiveDefinite(Rmat)) throw new Error('DARE: R は正定値でなければなりません');

  const Md = symplecticMatrix(Ad, Bd, Qmat, Rmat, n);
  const N = 2 * n;
  const I2n = matIdentity(N);
  const MmI = matSub(Md, I2n);
  const MpI = matAdd(Md, I2n);
  let MpIinv;
  try {
    MpIinv = matInverse(MpI);
  } catch (_) {
    throw new Error('DARE: (M + I) が singular — 単位円上の特徴値が存在する可能性があります（not stabilizable）');
  }
  const C = matMul(MmI, MpIinv);

  const { X, Y, stableCount } = hamiltonianStableSubspace(C, n, options);
  if (stableCount < n) {
    throw new Error(
      `DARE: stable モード ${stableCount} 個（必要: ${n}）。(Ad,Bd) が stabilizable でないか、symplectic が単位円上の特徴値を持ちます。`,
    );
  }

  let Xinv;
  try {
    Xinv = matInverse(X);
  } catch (_) {
    throw new Error('DARE: stable invariant subspace X が singular — (Ad,Bd) が stabilizable でない可能性があります');
  }
  const P = matSymmetrize(matMul(Y, Xinv));

  const BdT = matTranspose(Bd);
  const S = matAdd(Rmat, matMul(matMul(BdT, P), Bd));
  const K = matMul(matMul(matInverse(S), BdT), matMul(P, Ad));

  // DARE residual: ‖Ad' P Ad − P − Ad' P Bd K + Q‖∞
  const AdTP = matMul(matTranspose(Ad), P);
  const residualMat = matSub(
    matAdd(matMul(AdTP, Ad), Qmat),
    matAdd(P, matMul(matMul(AdTP, Bd), K)),
  );
  const dareResidualNorm = maxAbsMatrix(residualMat);

  // Closed-loop stability: eigenvalues of (Ad − Bd K) should have |λ| < 1
  const Acl = matSub(Ad, matMul(Bd, K));
  let closedLoopStable = false;
  try {
    const clEigs = matrixPoles(Acl);
    closedLoopStable = clEigs.every((e) => Math.sqrt(e.re ** 2 + e.im ** 2) < 1 - 1e-8);
  } catch (_) {
    // Fallback: Lyapunov criterion P > Acl' P Acl
    try {
      closedLoopStable = matIsPositiveDefinite(matSub(P, matMul(matMul(matTranspose(Acl), P), Acl)));
    } catch (__) { /* leave false */ }
  }

  return { P, K, closedLoopStable, dareResidualNorm, method: 'dare-hamiltonian-sign', Acl };
}

function characteristicPolynomialCoefficients(M) {
  const n = M.length;
  let aux = matCreate(n, n, 0);
  const charCoeffs = [1];
  for (let k = 1; k <= n; k++) {
    aux = matAdd(matMul(M, aux), matScale(matIdentity(n), charCoeffs[k - 1]));
    const ck = -matTrace(matMul(M, aux)) / k;
    charCoeffs.push(ck);
  }
  return charCoeffs;
}

function matrixPoles(M) {
  return polyroots(characteristicPolynomialCoefficients(M));
}

function rightPseudoInverse(B) {
  const Bt = matTranspose(B);
  const BBt = matMul(B, Bt);
  return matMul(Bt, matInverse(BBt));
}

function multiInputControllabilityRank(A, B) {
  return matRank(controllabilityMatrix(A, B));
}

function stabilizingShiftGain(A, B, alpha) {
  const n = A.length;
  const rightInv = rightPseudoInverse(B);
  return matMul(rightInv, matAdd(A, matScale(matIdentity(n), alpha)));
}

function isMatrixStable(A) {
  try {
    const poles = matrixPoles(A);
    return poles.every((p) => p.re < -1e-9);
  } catch (_) {
    return false;
  }
}

/**
 * Bass's method: choose K = α·B' such that A − α·B·B' is stable.
 * Works for the general (n,m) case as long as the pair (A,B) is stabilizable
 * and B·B' has enough rank in the unstable subspace. Returns null if no
 * α in the candidate set works.
 */
function bassStabilizingGain(A, B, alphaCandidates) {
  const Bt = matTranspose(B);
  const BBt = matMul(B, Bt);
  for (const alpha of alphaCandidates) {
    const K = matScale(Bt, alpha);
    const Acl = matSub(A, matMul(B, K));
    if (isMatrixStable(Acl)) {
      // Verify via Lyapunov as well (stricter check)
      try {
        if (analyzeLyapunov(Acl, matIdentity(A.length)).provenStable) {
          return { K, alpha };
        }
      } catch (_) {
        // try next alpha
      }
    }
  }
  return null;
}

function findStabilizingInitialGainMIMO(A, B, options = {}) {
  const n = A.length;
  const m = B[0].length;
  const candidates = options.alphaCandidates || [0.5, 1, 2, 4, 8, 16];
  const bRank = matRank(B);

  try {
    if (analyzeLyapunov(A, matIdentity(n)).provenStable) {
      return { K: matCreate(m, n, 0), strategy: 'zero-gain-stable-A' };
    }
  } catch (_) {
    // Lyapunov of raw A is singular (e.g. A has jω-axis poles) → not stable,
    // fall through to other strategies.
  }

  if (m >= n && bRank === n) {
    for (const alpha of candidates) {
      try {
        const K = stabilizingShiftGain(A, B, alpha);
        const Acl = matSub(A, matMul(B, K));
        let stable = false;
        try { stable = analyzeLyapunov(Acl, matIdentity(n)).provenStable; } catch (_) { stable = false; }
        if (stable) {
          return { K, strategy: `right-pseudoinverse-shift(alpha=${alpha})` };
        }
      } catch (_) {
        // keep searching
      }
    }
  }

  // Bass's method fallback — covers the underactuated/marginally-stable case
  // (e.g. spacecraft attitude with double integrators) where the pseudoinverse
  // path doesn't apply.
  const bassCandidates = options.bassAlphaCandidates
    || [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  const bass = bassStabilizingGain(A, B, bassCandidates);
  if (bass) {
    return { K: bass.K, strategy: `bass-method(alpha=${bass.alpha})` };
  }

  return null;
}

export function resolveDesignStateSpace({ systemType, plant, matrices }) {
  if (systemType === 'ss') {
    if (!matrices?.A || !matrices?.B || !matrices?.C || !matrices?.D) {
      throw new Error('State-space matrices are required');
    }
    return matrices;
  }
  if (!plant) throw new Error('Plant is required');
  const canonical = tfToControllableCanonical(plant.num, plant.den);
  return canonical;
}

export function parseDesiredPoles(input, expectedCount = null) {
  const roots = Array.isArray(input)
    ? input.map((value) => (typeof value === 'number' ? { re: value, im: 0 } : value))
    : parseRootsString(String(input || ''));
  if (!roots.length) throw new Error('請輸入目標極點，例如 -2, -3 或 -2+2j, -2-2j');
  if (expectedCount !== null && roots.length !== expectedCount) {
    throw new Error(`目標極點數量需等於系統階數 n=${expectedCount}`);
  }
  return roots;
}

export function closedLoopA(A, B, K) {
  return matSub(A, matMul(B, K));
}

export function placeStateFeedback(A, B, desiredPolesInput) {
  const n = A.length;
  const desiredPoles = parseDesiredPoles(desiredPolesInput, n);
  const Wc = controllabilityMatrix(A, B);
  const rank = matRank(Wc);
  if (rank !== n) {
    throw new Error(`System not fully controllable: rank(Wc)=${rank}, n=${n}`);
  }

  const alpha = desiredPolynomialFromRoots(desiredPoles);
  const alphaA = matrixPolynomial(A, alpha);
  const selector = matCreate(1, n, 0);
  selector[0][n - 1] = 1;
  const K = matMul(matMul(selector, matInverse(Wc)), alphaA);
  const Acl = closedLoopA(A, B, K);

  return {
    K,
    desiredPoles,
    desiredPolynomial: alpha,
    controllabilityRank: rank,
    Acl,
  };
}

export function solveContinuousLyapunov(A, Q = null) {
  const n = A.length;
  const Qmat = Q ? Q.map((row) => [...row]) : matIdentity(n);
  const At = matTranspose(A);
  const lhs = matAdd(matKronecker(matIdentity(n), At), matKronecker(At, matIdentity(n)));
  const rhs = vecColumnMajor(matScale(Qmat, -1));
  const solution = matSolve(lhs, rhs);
  return {
    P: matSymmetrize(matrixFromColumnMajor(solution, n, n)),
    Q: Qmat,
  };
}

export function analyzeLyapunov(A, Q = null) {
  let P, Qmat;
  try {
    const sol = solveContinuousLyapunov(A, Q);
    P = sol.P;
    Qmat = sol.Q;
  } catch (e) {
    if (e.name === 'SingularMatrixError' || /singular/i.test(e.message)) {
      throw new Error('Lyapunov 方程無正定解：A 含有對稱共軛 (λ_i + λ_j = 0) 的特徵值（典型情形：plant 不穩定或 marginally stable，A 有 jω-axis 極點）。請先用 State Feedback / LQR 穩定化後再驗證 Lyapunov 穩定性。');
    }
    throw e;
  }
  const residual = matAdd(matAdd(matMul(matTranspose(A), P), matMul(P, A)), Qmat);
  const eigenvalues = matEigenvaluesSymmetric(P);
  const qEigenvalues = matEigenvaluesSymmetric(matSymmetrize(Qmat));
  const minEigenvalue = eigenvalues[0] ?? NaN;
  const minQEigenvalue = qEigenvalues[0] ?? NaN;
  const positiveDefinite = matIsPositiveDefinite(P);
  const qPositiveDefinite = qEigenvalues.every((value) => value > 1e-10);
  const residualNorm = maxAbsMatrix(residual);

  return {
    P,
    Q: Qmat,
    residual,
    residualNorm,
    traceP: matTrace(P),
    eigenvalues,
    minEigenvalue,
    minQEigenvalue,
    positiveDefinite,
    qPositiveDefinite,
    provenStable: positiveDefinite && qPositiveDefinite && residualNorm < 1e-7,
    summary: positiveDefinite && qPositiveDefinite
      ? 'Found P > 0 satisfying A^T P + P A = -Q. Continuous-time asymptotic stability is proven.'
      : 'Lyapunov proof failed: P is not positive definite or Q is invalid.',
  };
}

function defaultPoleSet(order) {
  return Array.from({ length: order }, (_, i) => ({ re: -(i + 1), im: 0 }));
}

function toGainRow(gain) {
  if (Array.isArray(gain[0])) return gain;
  return [gain];
}

export function solveLqr(A, B, Q = null, R = [[1]], options = {}) {
  const n = A.length;
  const Qmat = Q ? Q.map((row) => [...row]) : matIdentity(n);
  const Rmat = Array.isArray(R[0]) ? R : [[R]];
  const rScalar = scalarFromMatrix(Rmat);
  if (!(rScalar > 0)) throw new Error('R must be positive definite');
  const controllabilityRank = matRank(controllabilityMatrix(A, B));
  if (controllabilityRank !== n) {
    throw new Error(`System not fully controllable: rank(Wc)=${controllabilityRank}, n=${n}`);
  }

  if (options.method !== 'kleinman') {
    try {
      const schur = solveCareHamiltonianSchur(A, B, Qmat, Rmat, options.schur || {});
      return {
        ...schur,
        controllabilityRank,
        iterations: 0,
        initialGainStrategy: 'hamiltonian-schur',
      };
    } catch (e) {
      if (options.method === 'schur') throw e;
      // Fall back to the legacy Newton-Kleinman path. This keeps existing
      // low-order cases working even if the dependency-free Hamiltonian
      // eigenvector path is numerically weak for a particular polynomial.
    }
  }

  let initialGainStrategy = 'user-supplied';
  let K = options.initialK
    ? toGainRow(options.initialK)
    : placeStateFeedback(A, B, options.initialPoles || defaultPoleSet(n)).K;
  if (!options.initialK) {
    initialGainStrategy = `pole-placement(${(options.initialPoles || defaultPoleSet(n)).map((pole) => typeof pole === 'string' ? pole : `${pole.re ?? pole}${pole.im ? (pole.im > 0 ? '+' : '') + pole.im + 'j' : ''}`).join(', ')})`;
  }

  const initialAcl = closedLoopA(A, B, K);
  const initialStable = analyzeLyapunov(initialAcl, matIdentity(n)).provenStable;
  if (!initialStable) {
    throw new Error('solveLqr requires a stabilizing initial gain');
  }

  const maxIterations = options.maxIterations || 50;
  const tolerance = options.tolerance || 1e-8;
  let P = null;
  let residualNorm = Infinity;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const Acl = closedLoopA(A, B, K);
    const penalty = matAdd(Qmat, matScale(matMul(matTranspose(K), K), rScalar));
    const lyap = solveContinuousLyapunov(Acl, penalty);
    P = lyap.P;
    const nextK = matScale(matMul(matTranspose(B), P), 1 / rScalar);
    residualNorm = maxAbsMatrix(matSub(nextK, K));
    K = nextK;
    if (residualNorm < tolerance) break;
  }

  const Acl = closedLoopA(A, B, K);
  const riccatiResidual = matAdd(
    matAdd(matMul(matTranspose(A), P), matMul(P, A)),
    matSub(Qmat, matScale(matMul(matMul(P, B), matMul(matInverse(Rmat), matMul(matTranspose(B), P))), 1)),
  );
  const closedLoopLyapunov = analyzeLyapunov(Acl, matIdentity(n));

  return {
    K,
    P: matSymmetrize(P),
    Q: Qmat,
    R: Rmat,
    Acl,
    residualNorm,
    riccatiResidualNorm: maxAbsMatrix(riccatiResidual),
    controllabilityRank,
    initialGainStrategy,
    closedLoopStable: closedLoopLyapunov.provenStable,
    closedLoopLyapunov,
  };
}

/**
 * Solve continuous Lyapunov  A_eff' P + P A_eff = -Qmat  via Kronecker.
 * Used internally by solveLqrMIMO. (`solveContinuousLyapunov` builds the
 * equation around A^T, which is inconvenient when the caller already has
 * the desired left-multiplier — so this helper takes the operator directly.)
 */
function lyapunovDirect(M, Qmat) {
  const n = M.length;
  const lhs = matAdd(matKronecker(matIdentity(n), M), matKronecker(M, matIdentity(n)));
  const rhs = vecColumnMajor(matScale(Qmat, -1));
  const solution = matSolve(lhs, rhs);
  return matSymmetrize(matrixFromColumnMajor(solution, n, n));
}

/**
 * MIMO LQR via Newton–Kleinman iteration. Accepts R as m×m matrix.
 * Returns K (m×n), P (n×n), and convergence diagnostics.
 */
export function solveLqrMIMO(A, B, Q = null, R = null, options = {}) {
  const n = A.length;
  const m = B[0].length;
  const Qmat = Q ? Q.map((row) => [...row]) : matIdentity(n);
  const Rmat = R ? R.map((row) => [...row]) : matIdentity(m);
  if (Rmat.length !== m || Rmat[0].length !== m) {
    throw new Error(`R must be ${m}×${m}, got ${Rmat.length}×${Rmat[0]?.length}`);
  }
  const Rinv = matInverse(Rmat);
  const Bt = matTranspose(B);
  const controllabilityRank = multiInputControllabilityRank(A, B);

  if (options.method !== 'kleinman') {
    try {
      const schur = solveCareHamiltonianSchur(A, B, Qmat, Rmat, options.schur || {});
      return {
        ...schur,
        iterations: 0,
        controllabilityRank,
        initialGainStrategy: 'hamiltonian-schur',
      };
    } catch (e) {
      if (options.method === 'schur') {
        throw new Error(`MIMO LQR Hamiltonian/Schur CARE 求解失敗：${e.message}`);
      }
      // Continue to Newton-Kleinman fallback for legacy and edge cases.
    }
  }

  let K;
  let initialGainStrategy = 'user-supplied';
  if (options.initialK) {
    K = options.initialK.map((row) => [...row]);
  } else {
    const initial = findStabilizingInitialGainMIMO(A, B, options);
    if (!initial) {
      // Friendly wrapping: covers the marginally-stable / unstable plant case
      // where Newton-Kleinman from K=0 fails to find any stabilizing K₀.
      throw new Error('MIMO LQR 求解失敗：plant 為 marginally stable / unstable，Newton-Kleinman 從 K=0 / 偽逆移位 / Bass 法 (K = αB\') 皆無法產生 stabilizing initial gain。建議：(1) 改用 Hamiltonian/Schur path（移除 `method: \'kleinman\'`，預設即會優先嘗試 Schur）；(2) 先用 SISO Pole Placement / State Feedback 取得 stabilizing K₀ 後再用 LQR 精修；(3) 或設更大的 Q 增強 penalty。');
    }
    K = initial.K;
    initialGainStrategy = initial.strategy;
  }

  const initialAcl = matSub(A, matMul(B, K));
  const initialStable = analyzeLyapunov(initialAcl, matIdentity(n)).provenStable;
  if (!initialStable) {
    throw new Error('solveLqrMIMO could not verify a stabilizing initial gain');
  }

  const maxIterations = options.maxIterations || 200;
  const tolerance = options.tolerance || 1e-9;
  let P = matIdentity(n);
  let residualNorm = Infinity;
  let iter = 0;

  try {
    for (iter = 0; iter < maxIterations; iter++) {
      const Acl = matSub(A, matMul(B, K));
      const Aclt = matTranspose(Acl);
      // penalty = Q + K' R K
      const penalty = matAdd(Qmat, matMul(matTranspose(K), matMul(Rmat, K)));
      // Solve Acl' P + P Acl = -penalty
      P = lyapunovDirect(Aclt, penalty);
      // K_new = R^{-1} B' P
      const nextK = matMul(Rinv, matMul(Bt, P));
      residualNorm = maxAbsMatrix(matSub(nextK, K));
      K = nextK;
      if (residualNorm < tolerance) { iter++; break; }
    }
  } catch (e) {
    if (e.name === 'SingularMatrixError' || /singular/i.test(e.message)) {
      throw new Error('MIMO LQR Newton-Kleinman 迭代中遇到奇異 Lyapunov 系統：A_cl 含 jω-axis 極點或 plant 不可穩定化。請先用 Pole Placement 取得 stabilizing K₀ 再啟動 LQR refinement。');
    }
    throw e;
  }

  // CARE residual: A'P + PA + Q - P B R^{-1} B' P
  const BRinvBt = matMul(matMul(B, Rinv), Bt);
  const PBRinvBtP = matMul(matMul(P, BRinvBt), P);
  const riccatiResidual = matAdd(
    matAdd(matMul(matTranspose(A), P), matMul(P, A)),
    matSub(Qmat, PBRinvBtP),
  );
  const Acl = matSub(A, matMul(B, K));
  const closedLoopLyapunov = analyzeLyapunov(Acl, matIdentity(n));

  return {
    K,
    P: matSymmetrize(P),
    Q: Qmat,
    R: Rmat,
    Acl,
    iterations: iter,
    residualNorm,
    riccatiResidualNorm: maxAbsMatrix(riccatiResidual),
    controllabilityRank,
    initialGainStrategy,
    closedLoopStable: closedLoopLyapunov.provenStable,
    closedLoopLyapunov,
  };
}

export function placeObserver(A, C, desiredPoles) {
  const n = A.length;
  const Wo = observabilityMatrix(A, C);
  const observabilityRank = matRank(Wo);
  if (observabilityRank !== n) {
    throw new Error(`System not fully observable: rank(Wo)=${observabilityRank}, n=${n}`);
  }
  const At = matTranspose(A);
  const Ct = matTranspose(C);
  const result = placeStateFeedback(At, Ct, desiredPoles);
  const L = matTranspose(result.K);
  const Aobs = matSub(A, matMul(L, C));
  return { L, desiredPoles: result.desiredPoles, observabilityRank, Aobs };
}

export function solveLqe(A, C, Qn, Rn, options = {}) {
  const n = A.length;
  const observabilityRank = matRank(observabilityMatrix(A, C));
  if (observabilityRank !== n) {
    throw new Error(`System not fully observable: rank(Wo)=${observabilityRank}, n=${n}`);
  }
  const At = matTranspose(A);
  const Ct = matTranspose(C);
  const RnMat = Array.isArray(Rn[0]) ? Rn : [[Rn]];
  let result;
  try {
    result = solveLqr(At, Ct, Qn, RnMat, options);
  } catch (e) {
    if (e.name === 'SingularMatrixError' || /singular/i.test(e.message) || /stabilizing/i.test(e.message)) {
      throw new Error('LQE / Kalman 求解失敗：對偶 LQR (A^T, C^T) 從 K=0 對 marginally stable / unstable plant 無法收斂。建議 (1) 先用 Pole Placement Observer 取得 stabilizing L₀；(2) 或對 plant 做 modal decomposition 分離 stable / unstable 部分。');
    }
    throw e;
  }
  const L_kf = matTranspose(result.K);
  const Aobs = matSub(A, matMul(L_kf, C));
  const observerLyapunov = analyzeLyapunov(Aobs, matIdentity(n));
  return {
    L: L_kf,
    Pe: matSymmetrize(result.P),
    Qn: result.Q,
    Rn: result.R,
    Aobs,
    residualNorm: result.residualNorm,
    riccatiResidualNorm: result.riccatiResidualNorm,
    observabilityRank,
    initialGainStrategy: result.initialGainStrategy,
    observerStable: observerLyapunov.provenStable,
    observerLyapunov,
  };
}

export function simulateObserver(model, L, options = {}) {
  const { duration = 10, dt = 0.01, u = 'step', x0 = null, xhat0 = null, noiseQ = null, noiseR = null } = options;
  const { A, B, C, D } = model;
  const n = A.length;
  const p = C.length;
  const m = B[0].length;

  const x = x0 ? x0.map((v) => [v]) : matCreate(n, 1, 0);
  const xhat = xhat0 ? xhat0.map((v) => [v]) : matCreate(n, 1, 0);

  const steps = Math.round(duration / dt);
  const t = [];
  const y = [];
  const yNoisy = [];
  const yhat = [];
  const eNorm = [];
  const innovation = [];
  const xArr = [];
  const xhatArr = [];

  const uFn = typeof u === 'function' ? u : () => 1;

  // Build matrices for simulation
  // Aobs = A - L*C
  const Aobs = matSub(A, matMul(L, C));

  for (let i = 0; i <= steps; i++) {
    const ti = i * dt;
    const uVal = uFn(ti);
    const uVec = matCreate(m, 1, 0);
    uVec[0][0] = uVal;

    // Plant output: y = C*x + D*u (ground truth)
    const Cx = matMul(C, x);
    const Du = matMul(D, uVec);
    const yi = Cx[0][0] + Du[0][0];

    // Measurement noise
    const vk = noiseR ? randn() * Math.sqrt(noiseR) : 0;
    const yi_noisy = yi + vk;

    // Observer output: yhat = C*xhat + D*u
    const Cxhat = matMul(C, xhat);
    const yhati = Cxhat[0][0] + Du[0][0];

    // Innovation: computed BEFORE observer update
    innovation.push(yi_noisy - yhati);

    // Error norm ||x - xhat||_2
    let errSq = 0;
    for (let j = 0; j < n; j++) {
      const diff = x[j][0] - xhat[j][0];
      errSq += diff * diff;
    }

    t.push(ti);
    y.push(yi);
    yNoisy.push(yi_noisy);
    yhat.push(yhati);
    eNorm.push(Math.sqrt(errSq));
    xArr.push(x.map((row) => row[0]));
    xhatArr.push(xhat.map((row) => row[0]));

    if (i === steps) break;

    // Euler update: plant dx = A*x + B*u
    const Ax = matMul(A, x);
    const Bu = matMul(B, uVec);
    const dxPlant = matAdd(Ax, Bu);

    // y (noisy) as column vector for observer correction
    const yVec = matCreate(p, 1, 0);
    yVec[0][0] = yi_noisy;

    // Observer: dxhat = Aobs*xhat + B*u + L*y_noisy
    const Aobsxhat = matMul(Aobs, xhat);
    const Ly = matMul(L, yVec);
    const dxObs = matAdd(matAdd(Aobsxhat, Bu), Ly);

    for (let j = 0; j < n; j++) {
      const wk = noiseQ ? randn() * Math.sqrt(noiseQ * dt) : 0;
      x[j][0] += dt * dxPlant[j][0] + wk;
      xhat[j][0] += dt * dxObs[j][0];
    }
  }

  return { t, y, yNoisy, yhat, eNorm, innovation, x: xArr, xhat: xhatArr };
}

export function closedLoopTransferFromStateFeedback(model, K) {
  return stateSpaceToTransferFunction(closedLoopA(model.A, model.B, K), model.B, model.C, model.D);
}

export function brysonsRule(maxStates, maxOutput) {
  // maxStates: array of n values (max acceptable deviation per state)
  // maxOutput: scalar (max acceptable measurement error)
  const n = maxStates.length;
  const Q = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 / (maxStates[i] ** 2) : 0))
  );
  const R = [[1 / (maxOutput ** 2)]];
  return { Q, R };
}

/**
 * Discretize a continuous state-space model using Zero-Order Hold (ZOH).
 * Uses the matrix exponential augmented method: Ad = e^(A*Ts), Bd via integral.
 * @param {number[][]} A - continuous A matrix (n×n)
 * @param {number[][]} B - continuous B matrix (n×m)
 * @param {number} Ts - sample time (s)
 * @returns {{ Ad, Bd }}
 */
export function discretizeZOH(A, B, Ts) {
  const n = A.length;
  const m = B[0].length;
  // Augmented matrix: [[A*Ts, B*Ts], [0, 0]] of size (n+m)×(n+m)
  const aug = Array.from({ length: n + m }, (_, i) =>
    Array.from({ length: n + m }, (_, j) => {
      if (i < n && j < n) return A[i][j] * Ts;
      if (i < n && j >= n) return B[i][j - n] * Ts;
      return 0;
    })
  );
  const expAug = matExp(aug);
  const Ad = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => expAug[i][j]));
  const Bd = Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => expAug[i][n + j]));
  return { Ad, Bd };
}

/**
 * Compute innovation sequence statistics to verify Kalman filter tuning.
 * A well-tuned KF produces white-noise innovations (zero-mean, uncorrelated).
 * @param {number[]} innovation - innovation sequence e[k] = y[k] - ŷ⁻[k]
 * @returns {{ mean, std, variance, acf1, acf2, confBand, isWhite, diagnosis }}
 */
export function innovationStats(innovation) {
  const N = innovation.length;
  if (N < 10) return { mean: NaN, std: NaN, variance: NaN, acf1: NaN, acf2: NaN, confBand: NaN, isWhite: false, diagnosis: 'Too few samples' };

  const mean = innovation.reduce((s, v) => s + v, 0) / N;
  const variance = innovation.reduce((s, v) => s + (v - mean) ** 2, 0) / (N - 1);
  const std = Math.sqrt(variance);

  // Lag-1 and Lag-2 autocorrelation
  let c0 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < N; i++) c0 += (innovation[i] - mean) ** 2;
  for (let i = 1; i < N; i++) c1 += (innovation[i] - mean) * (innovation[i - 1] - mean);
  for (let i = 2; i < N; i++) c2 += (innovation[i] - mean) * (innovation[i - 2] - mean);
  const acf1 = c0 > 0 ? c1 / c0 : 0;
  const acf2 = c0 > 0 ? c2 / c0 : 0;

  // 95% confidence band for ACF: ±1.96/sqrt(N)
  const confBand = 1.96 / Math.sqrt(N);
  const meanSmall = Math.abs(mean) < 2 * std / Math.sqrt(N);
  const acf1Small = Math.abs(acf1) < confBand;
  const acf2Small = Math.abs(acf2) < confBand;

  let diagnosis;
  if (meanSmall && acf1Small && acf2Small) {
    diagnosis = 'Innovation is white noise — KF well-tuned';
  } else if (!meanSmall) {
    diagnosis = 'Non-zero mean — check model bias or Qn/Rn';
  } else if (!acf1Small) {
    diagnosis = acf1 > 0 ? 'Positive lag-1 ACF — Rn too large (over-smoothing)' : 'Negative lag-1 ACF — Rn too small (over-reactive)';
  } else {
    diagnosis = 'Lag-2 correlation present — model mismatch likely';
  }

  return { mean, std, variance, acf1, acf2, confBand, isWhite: meanSmall && acf1Small && acf2Small, diagnosis };
}

/**
 * Steady-state discrete Kalman filter via Riccati difference equation iteration.
 * Solves: P[k+1] = Ad P Ad' + Qd - K S K'  where K = Ad P Cd' S^{-1}, S = Cd P Cd' + Rd
 * @param {number[][]} Ad - discrete A matrix (n×n)
 * @param {number[][]} Cd - discrete C matrix (p×n)
 * @param {number[][]} Qd - process noise covariance (n×n, positive semidefinite)
 * @param {number[][]} Rd - measurement noise covariance (p×p, positive definite)
 * @returns {{ L, Pe, iterations, converged, Aobs, observerPolesD }}
 */
export function solveDiscreteKalman(Ad, Cd, Qd, Rd) {
  const n = Ad.length;
  const p = Cd.length;
  const Adt = matTranspose(Ad);
  const Cdt = matTranspose(Cd);
  const RdSym = matSymmetrize(Rd);
  if (RdSym.length !== p || RdSym[0].length !== p) {
    throw new Error(`Rd must be ${p}×${p}`);
  }
  if (!matIsPositiveDefinite(RdSym)) {
    throw new Error('Rd must be positive definite');
  }
  const observabilityRank = matRank(observabilityMatrix(Ad, Cd));

  let P = matIdentity(n);
  let L = null;
  const maxIter = 1000;
  const tol = 1e-10;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Innovation covariance: S = Cd P Cd' + Rd
    const S = matAdd(matMul(matMul(Cd, P), Cdt), Rd);
    let Sinv;
    try {
      Sinv = matInverse(S);
    } catch (e) {
      if (e.name === 'SingularMatrixError' || /singular/i.test(e.message)) {
        throw new Error('Discrete Kalman 迭代失敗：innovation covariance S = Cd·P·Cd\' + Rd 為奇異。常見原因為 Rd 過小或 plant 不可觀測。請增大 Rd 或檢查 observability matrix。');
      }
      throw e;
    }
    // Kalman gain: K = Ad P Cd' S^{-1}
    const K = matMul(matMul(Ad, matMul(P, Cdt)), Sinv);
    // Riccati update: P_new = Ad P Ad' + Qd - K S K'
    const Pnew = matSymmetrize(matAdd(matSub(matMul(matMul(Ad, P), Adt), matMul(matMul(K, S), matTranspose(K))), Qd));
    const diff = Math.max(...Pnew.flatMap((row, i) => row.map((v, j) => Math.abs(v - P[i][j]))));
    P = Pnew;
    L = K;
    if (diff < tol) { iter++; break; }
  }

  const converged = iter < maxIter;
  const Aobs = matSub(Ad, matMul(L, Cd));
  const observerPolesD = matrixPoles(Aobs);
  const maxPoleMagnitude = Math.max(...observerPolesD.map((pole) => Math.hypot(pole.re, pole.im)));
  const observerStable = observerPolesD.every((pole) => Math.hypot(pole.re, pole.im) < 1 - 1e-9);
  const finiteCovariance = P.flat().every((value) => Number.isFinite(value));

  if (!finiteCovariance) {
    throw new Error('Discrete Kalman iteration diverged: covariance became non-finite');
  }
  if (!converged) {
    throw new Error('Discrete Kalman iteration did not converge; system may be undetectable or Qd/Rd are ill-conditioned');
  }
  if (!observerStable) {
    throw new Error('Discrete Kalman filter is not stabilizing; system may be undetectable or noise model invalid');
  }

  return { L, Pe: P, iterations: iter, converged, Aobs, observerPolesD, observabilityRank, observerStable, maxPoleMagnitude };
}

/**
 * Simulate LQG closed-loop: continuous plant + Luenberger/Kalman observer + LQR feedback.
 * u[k] = -K_lqr * x̂[k]  (feedback on estimated state, not true state)
 * Compare against full state feedback (FSF): u[k] = -K_lqr * x[k]
 * @param {object} model - { A, B, C, D }
 * @param {number[][]} K_lqr - LQR gain (1×n)
 * @param {number[][]} L_kf  - Kalman observer gain (n×1)
 * @param {{ duration?, dt?, noiseQ?, noiseR? }} options
 * @returns {{ t, y_lqg, y_fsf, u_lqg, u_fsf, eNorm, yhat }}
 */
export function simulateLqg(model, K_lqr, L_kf, options = {}) {
  const { duration = 10, dt = 0.01, noiseQ = null, noiseR = null } = options;
  const { A, B, C, D } = model;
  const n = A.length;
  const m = B[0].length;
  const p = C.length;

  // Initial conditions: plant starts at x0=[1,0,...], observers start at 0
  const x_lqg = Array.from({ length: n }, (_, i) => [i === 0 ? 1 : 0]);
  const xhat  = Array.from({ length: n }, () => [0]);
  const x_fsf = Array.from({ length: n }, (_, i) => [i === 0 ? 1 : 0]);

  // Observer closed-loop: A - L*C
  const Aobs = matSub(A, matMul(L_kf, C));
  const steps = Math.round(duration / dt);

  const t = [], y_lqg = [], y_fsf = [], u_lqg_arr = [], u_fsf_arr = [], eNorm = [], yhat_arr = [];

  for (let i = 0; i <= steps; i++) {
    // LQG: u = -K * xhat
    const u_lqg_val = -matMul(K_lqr, xhat)[0][0];
    // FSF: u = -K * x (ideal full state feedback)
    const u_fsf_val = -matMul(K_lqr, x_fsf)[0][0];

    // Plant and observer outputs
    const y_lqg_val = matMul(C, x_lqg)[0][0] + D[0][0] * u_lqg_val;
    const y_fsf_val = matMul(C, x_fsf)[0][0] + D[0][0] * u_fsf_val;
    const yhat_val  = matMul(C, xhat)[0][0];

    // Measurement noise
    const vk = noiseR ? randn() * Math.sqrt(noiseR) : 0;
    const y_meas = y_lqg_val + vk;

    // Estimation error norm
    let errSq = 0;
    for (let j = 0; j < n; j++) { const d = x_lqg[j][0] - xhat[j][0]; errSq += d * d; }

    t.push(i * dt);
    y_lqg.push(y_lqg_val);
    y_fsf.push(y_fsf_val);
    u_lqg_arr.push(u_lqg_val);
    u_fsf_arr.push(u_fsf_val);
    eNorm.push(Math.sqrt(errSq));
    yhat_arr.push(yhat_val);

    if (i === steps) break;

    // Build column vectors for Euler step
    const uVec_lqg = matCreate(m, 1, 0); uVec_lqg[0][0] = u_lqg_val;
    const uVec_fsf = matCreate(m, 1, 0); uVec_fsf[0][0] = u_fsf_val;
    const yVec = matCreate(p, 1, 0); yVec[0][0] = y_meas;

    // Euler: LQG plant dx = A*x + B*u
    const dx_lqg = matAdd(matMul(A, x_lqg), matMul(B, uVec_lqg));
    // Euler: FSF plant dx = A*x + B*u
    const dx_fsf = matAdd(matMul(A, x_fsf), matMul(B, uVec_fsf));
    // Euler: observer dxhat = Aobs*xhat + B*u + L*y
    const dx_obs = matAdd(matAdd(matMul(Aobs, xhat), matMul(B, uVec_lqg)), matMul(L_kf, yVec));

    for (let j = 0; j < n; j++) {
      const wk_lqg = noiseQ ? randn() * Math.sqrt(noiseQ * dt) : 0;
      const wk_fsf = noiseQ ? randn() * Math.sqrt(noiseQ * dt) : 0;
      x_lqg[j][0] += dt * dx_lqg[j][0] + wk_lqg;
      x_fsf[j][0] += dt * dx_fsf[j][0] + wk_fsf;
      xhat[j][0]  += dt * dx_obs[j][0];
    }
  }

  return { t, y_lqg, y_fsf, u_lqg: u_lqg_arr, u_fsf: u_fsf_arr, eNorm, yhat: yhat_arr };
}

export function observerPoles(A, C, L) {
  // Compute eigenvalues of A - L*C (observer closed-loop matrix)
  const Aobs = matSub(A, matMul(L, C));
  return matrixPoles(Aobs);
}

// ---------------------------------------------------------------------------
// Phase 7 Extension: Integral-action state augmentation
// ---------------------------------------------------------------------------

/**
 * Augment a state-space model with an integral action on tracking error (y - r).
 * Enables zero steady-state error under constant references/disturbances with
 * state feedback u = -[Kx, Ki] * [x; xi].
 *
 * @param {number[][]} A - n×n state matrix
 * @param {number[][]} B - n×m input matrix
 * @param {number[][]} C - p×n output matrix
 * @returns {{ Aaug: number[][], Baug: number[][], Caug: number[][], n: number, ni: number }}
 *   Aaug = [A, 0; -C, 0] (n+p × n+p)
 *   Baug = [B; 0] (n+p × m)
 *   Caug = [C, 0] (p × n+p)
 *   n = original state count, ni = integral state count (= p = output count)
 */
export function augmentWithIntegralAction(A, B, C) {
  const n = A.length;
  const m = B[0].length;
  const p = C.length;

  // Aaug: [A | 0_{n×p}; -C | 0_{p×p}]
  const Aaug = Array.from({ length: n + p }, (_, i) =>
    Array.from({ length: n + p }, (_, j) => {
      if (i < n && j < n) return A[i][j];
      if (i < n && j >= n) return 0;
      if (i >= n && j < n) return -C[i - n][j];
      return 0;
    })
  );

  // Baug: [B; 0_{p×m}]
  const Baug = Array.from({ length: n + p }, (_, i) =>
    Array.from({ length: m }, (_, j) => (i < n ? B[i][j] : 0))
  );

  // Caug: [C | 0_{p×p}]
  const Caug = Array.from({ length: p }, (_, i) =>
    Array.from({ length: n + p }, (_, j) => (j < n ? C[i][j] : 0))
  );

  return { Aaug, Baug, Caug, n, ni: p };
}

/**
 * Design integral-action LQR: augment with integrator, then call solveLqr on augmented system.
 * Returns K split into [Kx, Ki]: u = -Kx·x - Ki·xi
 *
 * @param {number[][]} A - original n×n state matrix
 * @param {number[][]} B - original n×m input matrix
 * @param {number[][]} C - original p×n output matrix
 * @param {number[][]} Qaug - (n+p)×(n+p) augmented state cost (or null for identity)
 * @param {number[][]} R - m×m control cost
 * @returns {{ Kx, Ki, K, P, Aaug, Baug, Caug, augCLStable, poles }}
 */
export function designIntegralLQR(A, B, C, Qaug, R) {
  const { Aaug, Baug, Caug, n, ni } = augmentWithIntegralAction(A, B, C);
  if (!Qaug) Qaug = matIdentity(n + ni);
  // Use MIMO solver when m > 1, SISO solver otherwise
  const m = B[0].length;
  const result = m > 1 ? solveLqrMIMO(Aaug, Baug, Qaug, R) : solveLqr(Aaug, Baug, Qaug, R);
  const K = result.K; // m×(n+ni)

  // Split: Kx = K[:, 0:n], Ki = K[:, n:]
  const Kx = K.map(row => row.slice(0, n));
  const Ki = K.map(row => row.slice(n));

  // Check closed-loop stability of augmented system
  const Acl = matSub(Aaug, matMul(Baug, K));
  const augPoles = matrixPoles(Acl);
  const augCLStable = augPoles.every(p => p.re < 0);

  return { Kx, Ki, K, P: result.P, Aaug, Baug, Caug, augCLStable, poles: augPoles };
}

// ---------------------------------------------------------------------------
// Phase 7 Extension: Regional pole placement / D-stability
// ---------------------------------------------------------------------------

/**
 * Check whether a set of eigenvalues satisfies a pole region constraint.
 * @param {Array<{re:number, im:number}>} poles
 * @param {{ type: 'disc'|'sector'|'strip', ...params }} region
 *   disc:   { alpha, radius }     → |s + alpha| < radius
 *   sector: { zetaMin }           → ζ = -Re(s)/|s| ≥ zetaMin
 *   strip:  { sigmaMin, sigmaMax } → sigmaMin < Re(s) < sigmaMax (both negative)
 * @returns {{ satisfied: boolean, violations: number[], margins: number[] }}
 */
export function checkPoleRegion(poles, region) {
  const margins = [];
  const violations = [];

  for (let i = 0; i < poles.length; i++) {
    const { re, im } = poles[i];
    let margin;

    if (region.type === 'disc') {
      // |s + alpha| < radius  →  margin = radius - |s + alpha|
      const dist = Math.sqrt((re + region.alpha) ** 2 + im ** 2);
      margin = region.radius - dist;
    } else if (region.type === 'sector') {
      // ζ = -Re(s)/|s| ≥ zetaMin  →  margin = ζ - zetaMin
      const mag = Math.sqrt(re ** 2 + im ** 2);
      const zeta = mag > 1e-12 ? -re / mag : (re < 0 ? 1 : 0);
      margin = zeta - region.zetaMin;
    } else if (region.type === 'strip') {
      // sigmaMin < Re(s) < sigmaMax
      // margin = min distance to either boundary (positive = inside)
      const marginMin = re - region.sigmaMin; // > 0 if Re(s) > sigmaMin
      const marginMax = region.sigmaMax - re; // > 0 if Re(s) < sigmaMax
      margin = Math.min(marginMin, marginMax);
    } else {
      throw new Error(`Unknown region type: ${region.type}`);
    }

    margins.push(margin);
    if (margin < 0) violations.push(i);
  }

  return { satisfied: violations.length === 0, violations, margins };
}

/**
 * H∞ filter — worst-case optimal state estimation.
 * Solves the modified CARE: A·P + P·A^T - P·S·P + Qw = 0
 * where S = C^T·Rv⁻¹·C - γ⁻²·I.
 *
 * Uses the LQR duality: this CARE is equivalent to the LQR CARE
 * for the dual system (A^T, L_chol, Qw, I) where L_chol·L_chol^T = S.
 *
 * Requires γ > γ* (feasibility). If γ is too small, S will not be
 * positive definite and an error is thrown.
 *
 * @param {number[][]} A - n×n continuous state matrix
 * @param {number[][]} C - p×n output matrix
 * @param {number[][]} Qw - n×n process noise intensity (must be ≥ 0)
 * @param {number[][]} Rv - p×p measurement noise covariance (must be > 0)
 * @param {number} gamma - H∞ performance level (γ > γ* > 0)
 * @returns {{ P, K, Aobs, filterPoles, stable, gamma, effectiveGain }}
 */
export function solveHinfFilter(A, C, Qw, Rv, gamma) {
  const n = A.length;
  const p = C.length;
  if (!Number.isFinite(gamma) || gamma <= 0) throw new Error('H∞ filter: γ must be a positive finite number');

  // Compute S = C^T * Rv^{-1} * C - γ^{-2} * I
  let Rvinv;
  try { Rvinv = matInverse(Rv); } catch(_) { throw new Error('H∞ filter: Rv must be invertible'); }
  const Ct = matTranspose(C);
  const CtRvinvC = matMul(Ct, matMul(Rvinv, C)); // n×n
  const gammaInvSq = 1 / (gamma * gamma);
  const S = CtRvinvC.map((row, i) => row.map((v, j) => v - (i === j ? gammaInvSq : 0)));

  // Check positive definiteness of S (necessary for feasibility)
  if (!matIsPositiveDefinite(S)) {
    throw new Error(`H∞ filter: γ=${gamma.toFixed(3)} too small — S = C^T·Rv⁻¹·C - γ⁻²·I is not positive definite. Increase γ.`);
  }

  // Cholesky factorization: S = L·L^T (lower triangular)
  // So B̃·R̃⁻¹·B̃^T = S with B̃ = L, R̃ = I
  const L = _choleskyLower(S);

  // Dual LQR: solve CARE for (A^T, L, Qw, I_n) → P is the H∞ filter covariance
  // CARE: A·P + P·A^T - P·L·L^T·P + Qw = 0
  // Use MIMO solver for n > 1; SISO solver for scalar systems.
  const I_n = matIdentity(n);
  const At = matTranspose(A);
  const lqrResult = n > 1 ? solveLqrMIMO(At, L, matSymmetrize(Qw), I_n) : solveLqr(At, L, matSymmetrize(Qw), I_n);
  const P = lqrResult.P; // H∞ filter error covariance

  // Filter gain: K = P·C^T·Rv⁻¹
  const K = matMul(matMul(P, Ct), Rvinv);

  // Observer matrix: A_obs = A - K·C
  const Aobs = matSub(A, matMul(K, C));
  const filterPoles = matrixPoles(Aobs);
  const stable = filterPoles.every((pole) => pole.re < 0);

  // Effective H∞ gain bound: γ (user-provided; actual bound ≤ γ)
  return { P, K, Aobs, filterPoles, stable, gamma };
}

/** Internal: Cholesky lower-triangular factor of a positive definite matrix. */
function _choleskyLower(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-14) throw new Error('Cholesky: matrix is not positive definite');
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Find LQR weights that keep closed-loop poles inside a region via iterative Q scaling.
 * Starts from given Q, R and scales Q until all CL poles satisfy the region, up to maxIter.
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {number[][]} Q
 * @param {number[][]} R
 * @param {{ type: string, [key: string]: any }} region
 * @param {{ maxIter?: number, qScale?: number }} options
 * @returns {{ K, P, poles, satisfied, iterations }}
 */
export function lqrWithPoleRegion(A, B, Q, R, region, options = {}) {
  const maxIter = options.maxIter ?? 20;
  const qScale = options.qScale ?? 2;
  let currentQ = Q.map(row => [...row]);
  let bestResult = null;

  for (let iter = 0; iter < maxIter; iter++) {
    let lqrResult;
    try {
      lqrResult = solveLqr(A, B, currentQ, R);
    } catch (_) {
      // Scale up and retry
      currentQ = currentQ.map(row => row.map(v => v * qScale));
      continue;
    }

    const K = lqrResult.K;
    const Acl = matSub(A, matMul(B, K));
    const poles = matrixPoles(Acl);
    const check = checkPoleRegion(poles, region);

    bestResult = { K, P: lqrResult.P, poles, satisfied: check.satisfied, iterations: iter + 1 };

    if (check.satisfied) return bestResult;

    // Scale Q and retry
    currentQ = currentQ.map(row => row.map(v => v * qScale));
  }

  return bestResult || { K: null, P: null, poles: [], satisfied: false, iterations: maxIter };
}
