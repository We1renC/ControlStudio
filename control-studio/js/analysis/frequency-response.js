/**
 * frequency-response.js — Bode plot, Nyquist plot data generation
 */
import { Complex } from '../math/complex.js';

function assertFrequencyGrid(wMin, wMax, nPoints, label) {
  if (!Number.isFinite(wMin) || !Number.isFinite(wMax) || wMin <= 0 || wMax <= wMin) {
    throw new Error(`${label}: frequency range must satisfy 0 < wMin < wMax`);
  }
  if (!Number.isInteger(nPoints) || nPoints < 2) {
    throw new Error(`${label}: nPoints must be an integer >= 2`);
  }
}

function assertContinuousFrequencySystem(sys, label) {
  if (sys && Number.isFinite(sys.sampleTime)) {
    throw new Error(`${label}: continuous frequency analysis requires an s-domain transfer function; use discrete frequency response for z-domain systems`);
  }
}

/**
 * Compute Bode plot data.
 * @returns {{ w: number[], magDB: number[], phaseDeg: number[] }}
 */
export function bodeData(sys, wMin = 1e-2, wMax = 1e3, nPoints = 500) {
  assertContinuousFrequencySystem(sys, 'bodeData');
  assertFrequencyGrid(wMin, wMax, nPoints, 'bodeData');
  const logMin = Math.log10(wMin), logMax = Math.log10(wMax);
  const w = [], magDB = [], phaseDeg = [];
  let prevPhase = null;

  for (let i = 0; i < nPoints; i++) {
    const wi = Math.pow(10, logMin + (logMax - logMin) * i / (nPoints - 1));
    const s = new Complex(0, wi);
    const g = sys.evalAt(s);
    const mag = 20 * Math.log10(Math.max(g.magnitude, 1e-30));
    let phase = g.angleDeg;

    // Unwrap phase
    if (prevPhase !== null) {
      while (phase - prevPhase > 180) phase -= 360;
      while (phase - prevPhase < -180) phase += 360;
    }
    prevPhase = phase;

    w.push(wi);
    magDB.push(mag);
    phaseDeg.push(phase);
  }

  return { w, magDB, phaseDeg };
}

/**
 * Compute Nyquist plot data.
 * Returns real and imaginary parts for positive and negative frequencies.
 */
export function nyquistData(sys, wMin = 1e-3, wMax = 1e3, nPoints = 1000) {
  assertContinuousFrequencySystem(sys, 'nyquistData');
  assertFrequencyGrid(wMin, wMax, nPoints, 'nyquistData');
  const logMin = Math.log10(wMin), logMax = Math.log10(wMax);
  const re = [], im = [], w = [];

  // Positive frequencies
  for (let i = 0; i < nPoints; i++) {
    const wi = Math.pow(10, logMin + (logMax - logMin) * i / (nPoints - 1));
    const s = new Complex(0, wi);
    const g = sys.evalAt(s);
    w.push(wi);
    re.push(g.re);
    im.push(g.im);
  }

  // Mirror for negative frequencies (conjugate)
  const reNeg = [...re].reverse();
  const imNeg = im.map(v => -v).reverse();

  return { w, re, im, reNeg, imNeg };
}

/**
 * Auto-detect frequency range based on poles and zeros.
 */
export function autoFreqRange(sys) {
  assertContinuousFrequencySystem(sys, 'autoFreqRange');
  const poles = sys.poles();
  const zeros = sys.zeros();
  const all = [...poles, ...zeros].filter(p => p.magnitude > 1e-10);

  if (all.length === 0) return { wMin: 1e-2, wMax: 1e3 };

  const freqs = all.map(p => p.magnitude);
  const minFreq = Math.min(...freqs);
  const maxFreq = Math.max(...freqs);

  return {
    wMin: Math.pow(10, Math.floor(Math.log10(minFreq)) - 1),
    wMax: Math.pow(10, Math.ceil(Math.log10(maxFreq)) + 1)
  };
}

/**
 * Compute Nichols chart data (open-loop phase vs. magnitude).
 * @returns {{ phaseDeg: number[], magDB: number[], w: number[] }}
 */
export function nicholsData(sys, wMin = 1e-2, wMax = 1e3, nPoints = 500) {
  assertContinuousFrequencySystem(sys, 'nicholsData');
  const data = bodeData(sys, wMin, wMax, nPoints);
  return { phaseDeg: data.phaseDeg, magDB: data.magDB, w: data.w };
}

/**
 * Count Nyquist encirclements of the -1+j0 point.
 * Positive = clockwise encirclement (indicates instability for stable open-loop).
 * Uses winding number algorithm.
 * @returns {number} Number of clockwise encirclements
 */
export function nyquistEncirclements(sys, wMin = 1e-3, wMax = 1e3, nPoints = 2000) {
  assertContinuousFrequencySystem(sys, 'nyquistEncirclements');
  const data = nyquistData(sys, wMin, wMax, nPoints);
  // Build the full Nyquist contour: ω = -∞ → -wMin (negative branch, in increasing ω
  // order = reverse of stored "negative" data which is already in -wMax → -wMin order or
  // equivalent), then jump across the small detour at ω = 0 if there are poles at origin
  // (we approximate that detour as a large arc at infinity for proper TFs), then ω = wMin → +∞.
  // For a strictly proper sys, |G(jω)| → 0 as ω→±∞, so the +∞ semicircle collapses to the
  // origin shift and contributes no encirclement of (-1, 0). The combined positive +
  // mirror-conjugate negative branch then gives the full Cauchy winding number.
  const reFull = [...data.reNeg, ...data.re];
  const imFull = [...data.imNeg, ...data.im];
  let windingAngle = 0;
  for (let i = 1; i < reFull.length; i++) {
    const x0 = reFull[i - 1] + 1; // shift so -1+j0 is at origin
    const y0 = imFull[i - 1];
    const x1 = reFull[i] + 1;
    const y1 = imFull[i];
    const cross = x0 * y1 - x1 * y0;
    const dot = x0 * x1 + y0 * y1;
    windingAngle += Math.atan2(cross, dot);
  }
  // Positive winding (CCW around -1) = -N in the Z = N + P convention (N counts CW).
  // We return CW encirclements: -windingAngle / (2π).
  return Math.round(-windingAngle / (2 * Math.PI));
}
