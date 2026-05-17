import { Complex } from '../math/complex.js';
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
} from '../math/matrix.js';
import { controllabilityMatrix, observabilityMatrix, stateSpaceToTransferFunction, tfToControllableCanonical } from './state-space.js';
import { parseRootsString } from './zpk.js';
import { polyroots } from '../math/polynomial.js';

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
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

export function solveLqe(A, C, Qn, Rn) {
  const At = matTranspose(A);
  const Ct = matTranspose(C);
  const RnMat = Array.isArray(Rn[0]) ? Rn : [[Rn]];
  const result = solveLqr(At, Ct, Qn, RnMat);
  const L_kf = matTranspose(result.K);
  const Aobs = matSub(A, matMul(L_kf, C));
  return {
    L: L_kf,
    Pe: matSymmetrize(result.P),
    Qn: result.Q,
    Rn: result.R,
    Aobs,
    residualNorm: result.residualNorm,
    riccatiResidualNorm: result.riccatiResidualNorm,
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
    diagnosis = 'Innovation is white noise ✓ — KF well-tuned';
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
  const Adt = matTranspose(Ad);
  const Cdt = matTranspose(Cd);

  let P = matIdentity(n);
  let L = null;
  const maxIter = 1000;
  const tol = 1e-10;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Innovation covariance: S = Cd P Cd' + Rd
    const S = matAdd(matMul(matMul(Cd, P), Cdt), Rd);
    const Sinv = matInverse(S);
    // Kalman gain: K = Ad P Cd' S^{-1}
    const K = matMul(matMul(Ad, matMul(P, Cdt)), Sinv);
    // Riccati update: P_new = Ad P Ad' + Qd - K S K'
    const Pnew = matAdd(matSub(matMul(matMul(Ad, P), Adt), matMul(matMul(K, S), matTranspose(K))), Qd);
    const diff = Math.max(...Pnew.flatMap((row, i) => row.map((v, j) => Math.abs(v - P[i][j]))));
    P = Pnew;
    L = K;
    if (diff < tol) { iter++; break; }
  }

  const converged = iter < maxIter;
  const Aobs = matSub(Ad, matMul(L, Cd));

  // Eigenvalues of discrete observer matrix via Faddeev-LeVerrier + polyroots
  let M = matCreate(n, n, 0);
  const charCoeffs = [1];
  for (let k = 1; k <= n; k++) {
    M = matAdd(matMul(Aobs, M), matScale(matIdentity(n), charCoeffs[k - 1]));
    const ck = -matTrace(matMul(Aobs, M)) / k;
    charCoeffs.push(ck);
  }
  const observerPolesD = polyroots(charCoeffs);

  return { L, Pe: P, iterations: iter, converged, Aobs, observerPolesD };
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
  const n = Aobs.length;
  // Build characteristic polynomial via Faddeev-LeVerrier algorithm
  // char poly coefficients [1, c_{n-1}, ..., c_0] (high degree first)
  let M = matCreate(n, n, 0);
  const charCoeffs = [1];
  for (let k = 1; k <= n; k++) {
    // M = Aobs * M_prev + c_{k-1} * I  (where M_prev is M before this step)
    // Using Faddeev-LeVerrier: M_k = Aobs * M_{k-1} + c_{k-1}*I
    M = matAdd(matMul(Aobs, M), matScale(matIdentity(n), charCoeffs[k - 1]));
    // c_k = -trace(Aobs * M_k) / k
    const ck = -matTrace(matMul(Aobs, M)) / k;
    charCoeffs.push(ck);
  }
  return polyroots(charCoeffs);
}
