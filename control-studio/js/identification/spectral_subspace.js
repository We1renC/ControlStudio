/**
 * spectral_subspace.js — MUSIC and ESPRIT high-resolution spectral estimation.
 *
 * Loop 9 (Zero-Flaw) addition. Subspace methods for estimating sinusoidal
 * frequency components from a length-N signal corrupted by noise, with
 * resolution beyond the FFT Rayleigh limit. Standard tools in modal
 * analysis, structural health monitoring, direction-of-arrival estimation.
 *
 * MUSIC (Schmidt 1986):
 *   1. Build autocorrelation matrix R = (1/L) Σ x[n] x[n]^H for a Hankel
 *      window of size M (M ≫ 2p where p is the expected number of components).
 *   2. Eigendecompose R; the smallest M − 2p eigenvalues span the noise
 *      subspace.
 *   3. The MUSIC pseudospectrum
 *        P(f) = 1 / Σ_{k ∈ noise} |e^H(f) v_k|²
 *      peaks at the true frequencies of the sinusoids in x.
 *
 * ESPRIT (Roy-Kailath 1989): exploits a rotational-invariance property of
 * two overlapping subspaces; we expose the LS-ESPRIT variant.
 *
 * Reference:
 *   - Schmidt, "Multiple emitter location and signal parameter estimation",
 *     IEEE TAP 34(3), 1986.
 *   - Roy, Kailath, "ESPRIT — Estimation of Signal Parameters via
 *     Rotational Invariance Techniques", IEEE ASSP 37(7), 1989.
 *   - Stoica, Moses, "Spectral Analysis of Signals", Prentice Hall, 2005.
 */

import {
  matMul, matTranspose, matCreate, matIdentity,
} from '../math/matrix.js';
import { polyroots } from '../math/polynomial.js';

function validateSubspaceInputs(x, fs, numSources, M, label) {
  if (!Array.isArray(x) || x.length < 4 || x.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label}: x must contain at least four finite samples`);
  }
  if (!Number.isFinite(fs) || fs <= 0) {
    throw new Error(`${label}: fs must be finite and positive`);
  }
  if (!(numSources >= 1 && Number.isInteger(numSources))) {
    throw new Error(`${label}: numSources must be positive integer`);
  }
  if (!Number.isInteger(M) || M < 2 * numSources + 1) {
    throw new Error(`${label}: window M must be an integer >= 2*numSources+1`);
  }
  if (M > x.length - 1) {
    throw new Error(`${label}: window M must be <= x.length - 1`);
  }
}

function buildAutocorrelationMatrix(x, M) {
  const N = x.length;
  const L = N - M + 1;
  const R = matCreate(M, M, 0);
  // R[i][j] = (1/L) Σ_{ℓ=0}^{L-1} x[ℓ+i] x[ℓ+j]
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      let s = 0;
      for (let l = 0; l < L; l++) s += x[l + i] * x[l + j];
      R[i][j] = s / L;
    }
  }
  return R;
}

/**
 * MUSIC pseudospectrum on a frequency grid.
 *
 * @param {number[]} x        - real-valued signal samples (uniformly sampled)
 * @param {number} fs         - sample rate (Hz)
 * @param {number} numSources - assumed number of sinusoidal components
 * @param {object} options    - { M (window), grid (Hz array) }
 * @returns { freq, pseudo, peaks } — peaks: top-numSources peak frequencies (Hz)
 */
export function musicSpectrum(x, fs, numSources, options = {}) {
  const M = options.M ?? Math.max(2 * numSources + 4, Math.floor(x.length / 4));
  validateSubspaceInputs(x, fs, numSources, M, 'MUSIC');
  const R = buildAutocorrelationMatrix(x, M);
  // Symmetric (real Hermitian) eigen-decomposition
  const { eigenvalues, eigenvectors } = symmetricEigen(R);
  // Sort eigenvalues ascending; smallest M - 2p are noise subspace (for real signals
  // each complex sinusoid contributes 2 spectral lines).
  const order = eigenvalues
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v)
    .map((e) => e.i);
  const noiseDim = M - 2 * numSources;
  if (noiseDim <= 0) throw new Error('MUSIC: noise subspace empty; reduce numSources or increase M');
  const noiseIdx = order.slice(0, noiseDim);
  const noiseV = noiseIdx.map((i) => eigenvectors[i]);

  const freqMax = options.freqMax ?? fs / 2;
  const grid = options.grid ?? defaultFreqGrid(0.01, freqMax, 1024);
  const pseudo = new Array(grid.length).fill(0);
  for (let g = 0; g < grid.length; g++) {
    const f = grid[g];
    let denom = 0;
    for (const v of noiseV) {
      let re = 0, im = 0;
      for (let i = 0; i < M; i++) {
        const phi = 2 * Math.PI * f * i / fs;
        re += Math.cos(phi) * v[i];
        im += Math.sin(phi) * v[i];
      }
      denom += re * re + im * im;
    }
    pseudo[g] = 1 / Math.max(denom, 1e-18);
  }
  // Find top numSources peaks (local maxima).
  const peakIdx = findPeaks(pseudo, numSources);
  const peaks = peakIdx.map((i) => grid[i]);
  return { freq: grid, pseudo, peaks };
}

/**
 * ESPRIT frequency estimator using the rotational-invariance subspace
 * matrix Phi. The real-signal model uses a 2p-dimensional subspace whose
 * eigenvalues occur as exp(+-j*omega_k). Frequencies must lie strictly inside
 * (0, fs/2); DC and Nyquist components require a different rank model.
 *
 * @param {number[]} x - finite, uniformly sampled real signal
 * @param {number} fs - finite positive sample rate in Hz
 * @param {number} numSources - number of real sinusoidal components
 * @param {object} options - { M, imagTolerance }; M must be >= 2p+1
 * @returns {number[]} sorted positive frequencies in Hz
 */
export function espritFrequencies(x, fs, numSources, options = {}) {
  const M = options.M ?? Math.max(2 * numSources + 4, Math.floor(x.length / 4));
  validateSubspaceInputs(x, fs, numSources, M, 'ESPRIT');
  const R = buildAutocorrelationMatrix(x, M);
  const { eigenvalues, eigenvectors } = symmetricEigen(R);
  const order = eigenvalues
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .map((e) => e.i);
  // Signal-subspace eigenvectors (top 2 numSources)
  const signalDim = 2 * numSources;
  const U = order.slice(0, signalDim).map((i) => eigenvectors[i]);     // signalDim × M
  // U as M × signalDim
  const Umat = matCreate(M, signalDim, 0);
  for (let i = 0; i < signalDim; i++) for (let j = 0; j < M; j++) Umat[j][i] = U[i][j];
  // U_1 = U[0..M-2], U_2 = U[1..M-1]
  const U1 = matCreate(M - 1, signalDim, 0);
  const U2 = matCreate(M - 1, signalDim, 0);
  for (let i = 0; i < M - 1; i++) {
    for (let j = 0; j < signalDim; j++) {
      U1[i][j] = Umat[i][j];
      U2[i][j] = Umat[i + 1][j];
    }
  }
  // LS-ESPRIT: Φ = (U_1^T U_1)^{-1} U_1^T U_2
  const U1T_U1 = matMul(matTranspose(U1), U1);
  const U1T_U2 = matMul(matTranspose(U1), U2);
  const Phi = solveSmallSystem(U1T_U1, U1T_U2);
  // Phi is generally non-symmetric. Its eigenvalues form conjugate pairs
  // exp(+-j*omega_k); symmetrizing Phi destroys the rotation phase and gives
  // incorrect multi-tone estimates. Recover the general complex eigenvalues
  // from the characteristic polynomial and use the positive-angle member of
  // each conjugate pair.
  const phiEigs = polyroots(characteristicPolynomial(Phi));
  const imagTol = options.imagTolerance ?? 1e-8;
  const positiveAngleFreqs = phiEigs
    .filter((root) => Number.isFinite(root.re) && Number.isFinite(root.im) && root.im > imagTol)
    .map((root) => {
      const angle = Math.atan2(root.im, root.re);
      return fs * angle / (2 * Math.PI);
    })
    .filter((frequency) => frequency > 0 && frequency < fs / 2)
    .sort((a, b) => a - b);

  if (positiveAngleFreqs.length !== numSources) {
    throw new Error(
      `ESPRIT: expected ${numSources} conjugate eigenvalue pairs, recovered ${positiveAngleFreqs.length}; ` +
      'the signal subspace may be rank deficient or contain DC/Nyquist components'
    );
  }
  return positiveAngleFreqs;
}

// ── helpers ────────────────────────────────────────────────────────────────

function defaultFreqGrid(fMin, fMax, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = fMin + (fMax - fMin) * (i / (n - 1));
  return out;
}

function findPeaks(arr, count) {
  const peaks = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) {
      peaks.push({ idx: i, val: arr[i] });
    }
  }
  peaks.sort((a, b) => b.val - a.val);
  return peaks.slice(0, count).map((p) => p.idx).sort((a, b) => a - b);
}

function characteristicPolynomial(A) {
  const n = A.length;
  if (n === 0 || A.some((row) => !Array.isArray(row) || row.length !== n)) {
    throw new Error('ESPRIT: Phi must be a non-empty square matrix');
  }
  const coefficients = [1];
  let B = matIdentity(n);
  for (let k = 1; k <= n; k++) {
    const AB = matMul(A, B);
    let trace = 0;
    for (let i = 0; i < n; i++) trace += AB[i][i];
    const ck = -trace / k;
    coefficients.push(ck);
    B = AB;
    for (let i = 0; i < n; i++) B[i][i] += ck;
  }
  return coefficients;
}

function solveSmallSystem(A, B) {
  // Solve A X = B for small A using Gauss elimination row by row of B.
  const n = A.length;
  const m = B[0].length;
  const out = matCreate(n, m, 0);
  const Aug = A.map((row, i) => [...row, ...B[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(Aug[k][i]) > Math.abs(Aug[pivot][i])) pivot = k;
    if (Math.abs(Aug[pivot][i]) < 1e-12) throw new Error('ESPRIT: singular system');
    [Aug[i], Aug[pivot]] = [Aug[pivot], Aug[i]];
    for (let k = i + 1; k < n; k++) {
      const f = Aug[k][i] / Aug[i][i];
      for (let j = i; j < n + m; j++) Aug[k][j] -= f * Aug[i][j];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = 0; j < m; j++) {
      let s = Aug[i][n + j];
      for (let k = i + 1; k < n; k++) s -= Aug[i][k] * out[k][j];
      out[i][j] = s / Aug[i][i];
    }
  }
  return out;
}

function symmetricEigen(A) {
  // Jacobi iteration for symmetric real eigenproblem.
  const n = A.length;
  let V = matIdentity(n);
  let M = A.map((row) => row.slice());
  for (let sweep = 0; sweep < 200; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += Math.abs(M[p][q]);
    if (off < 1e-12) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = M[p][q];
        if (Math.abs(apq) < 1e-14) continue;
        const theta = (M[q][q] - M[p][p]) / (2 * apq);
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        for (let i = 0; i < n; i++) {
          const mip = M[i][p], miq = M[i][q];
          M[i][p] = c * mip - s * miq;
          M[i][q] = s * mip + c * miq;
        }
        for (let j = 0; j < n; j++) {
          const mpj = M[p][j], mqj = M[q][j];
          M[p][j] = c * mpj - s * mqj;
          M[q][j] = s * mpj + c * mqj;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  const eigenvalues = new Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = M[i][i];
  const eigenvectors = new Array(n);
  for (let i = 0; i < n; i++) {
    eigenvectors[i] = new Array(n);
    for (let j = 0; j < n; j++) eigenvectors[i][j] = V[j][i];
  }
  return { eigenvalues, eigenvectors };
}
