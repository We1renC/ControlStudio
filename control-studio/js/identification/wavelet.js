/**
 * wavelet.js — Discrete Wavelet Transform (DWT) baseline.
 *
 * Loop 11 (Zero-Flaw) addition. Provides Haar and Daubechies-4 (db2)
 * one-level and multi-level decompositions plus reconstruction. Required for
 * structural-vibration / non-stationary signal-processing literature
 * (Daubechies 1992; Mallat 1999).
 *
 * Signal length must be a power of two for the standard convolutional
 * implementation.
 *
 * Reference:
 *   - Daubechies, "Ten Lectures on Wavelets", SIAM 1992.
 *   - Mallat, "A Wavelet Tour of Signal Processing", Academic Press 1999.
 */

const HAAR_LO = [Math.SQRT1_2, Math.SQRT1_2];
const HAAR_HI = [Math.SQRT1_2, -Math.SQRT1_2];

const SQ3 = Math.sqrt(3);
const DB4_LO = [
  (1 + SQ3) / (4 * Math.SQRT2),
  (3 + SQ3) / (4 * Math.SQRT2),
  (3 - SQ3) / (4 * Math.SQRT2),
  (1 - SQ3) / (4 * Math.SQRT2),
];
const DB4_HI = [DB4_LO[3], -DB4_LO[2], DB4_LO[1], -DB4_LO[0]];

function ensurePowerOfTwo(n, label) {
  if (n <= 0 || (n & (n - 1)) !== 0) {
    throw new Error(`${label}: length must be a positive power of two`);
  }
}

function filterFor(name) {
  switch (name) {
    case 'haar': return { lo: HAAR_LO, hi: HAAR_HI };
    case 'db2': case 'db4': return { lo: DB4_LO, hi: DB4_HI };
    default: throw new Error(`wavelet: unknown filter "${name}"`);
  }
}

// Orthogonal-wavelet analysis: c[i] = Σ_k signal[(k + 2i) mod n] · filter[k]
// (periodic boundary).
function analysisFilter(signal, filter) {
  const n = signal.length;
  const k = filter.length;
  const out = new Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) {
      const idx = (2 * i + j) % n;
      s += signal[idx] * filter[j];
    }
    out[i] = s;
  }
  return out;
}

// Orthogonal-wavelet synthesis: for each pair (cA[i], cD[i]) distribute the
// contribution back through the same filter coefficients (transposed adjoint):
//   y[(2i + k) mod n] += cA[i] · loSyn[k] + cD[i] · hiSyn[k]
// For orthogonal wavelets the synthesis filters equal the analysis filters.
function synthesisFilter(cA, cD, loSyn, hiSyn, outputLen) {
  const out = new Array(outputLen).fill(0);
  const k = loSyn.length;
  for (let i = 0; i < cA.length; i++) {
    for (let j = 0; j < k; j++) {
      const idx = (2 * i + j) % outputLen;
      out[idx] += cA[i] * loSyn[j] + cD[i] * hiSyn[j];
    }
  }
  return out;
}

/**
 * Multi-level DWT decomposition.
 * Returns an array [cA_L, cD_L, cD_{L-1}, ..., cD_1] of detail / approximation
 * coefficient arrays.
 */
export function dwtDecompose(signal, options = {}) {
  if (!Array.isArray(signal)) throw new Error('DWT: signal must be array');
  ensurePowerOfTwo(signal.length, 'DWT');
  const levels = options.levels ?? Math.log2(signal.length);
  const { lo, hi } = filterFor(options.wavelet ?? 'haar');
  let approx = signal.slice();
  const details = [];
  for (let lvl = 0; lvl < levels && approx.length >= 2; lvl++) {
    const cA = analysisFilter(approx, lo);
    const cD = analysisFilter(approx, hi);
    details.unshift(cD);
    approx = cA;
  }
  return { approximation: approx, details, wavelet: options.wavelet ?? 'haar', levels };
}

export function dwtReconstruct(decomposition) {
  const { approximation, details, wavelet } = decomposition;
  const { lo, hi } = filterFor(wavelet);
  // Synthesis adjoint of the analysis convolution. For orthogonal wavelets
  // the synthesis filters equal the analysis filters.
  let cA = approximation.slice();
  for (const cD of details) {
    const len = 2 * cA.length;
    cA = synthesisFilter(cA, cD, lo, hi, len);
  }
  return cA;
}
