import { Complex } from '../math/complex.js';
import {
  matAdd,
  matCreate,
  matEigenvaluesSymmetric,
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
} from '../math/matrix.js';
import { controllabilityMatrix, stateSpaceToTransferFunction, tfToControllableCanonical } from './state-space.js';
import { parseRootsString } from './zpk.js';

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
  const { P, Q: Qmat } = solveContinuousLyapunov(A, Q);
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

  let K = options.initialK
    ? toGainRow(options.initialK)
    : placeStateFeedback(A, B, options.initialPoles || defaultPoleSet(n)).K;

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

  return {
    K,
    P: matSymmetrize(P),
    Q: Qmat,
    R: Rmat,
    Acl,
    residualNorm,
    riccatiResidualNorm: maxAbsMatrix(riccatiResidual),
  };
}

export function closedLoopTransferFromStateFeedback(model, K) {
  return stateSpaceToTransferFunction(closedLoopA(model.A, model.B, K), model.B, model.C, model.D);
}
