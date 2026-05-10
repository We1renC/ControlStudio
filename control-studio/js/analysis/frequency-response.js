/**
 * frequency-response.js — Bode plot, Nyquist plot data generation
 */
import { Complex } from '../math/complex.js';

/**
 * Compute Bode plot data.
 * @returns {{ w: number[], magDB: number[], phaseDeg: number[] }}
 */
export function bodeData(sys, wMin = 1e-2, wMax = 1e3, nPoints = 500) {
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
