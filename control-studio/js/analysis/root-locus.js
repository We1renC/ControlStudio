/**
 * root-locus.js — Root locus computation
 * Traces how poles of 1 + K·G(s) = 0 move as K varies.
 */
import { polyroots, polyadd, polyscale, polymul } from '../math/polynomial.js';

/**
 * Compute root locus data.
 * For characteristic equation: den(s) + K·num(s) = 0
 * @param {TransferFunction} sys - Open loop transfer function G(s)
 * @param {number} kMin - Minimum gain
 * @param {number} kMax - Maximum gain
 * @param {number} nPoints - Number of gain values
 * @returns {{ gains: number[], roots: Complex[][] }}
 */
export function rootLocusData(sys, kMin = 0, kMax = 100, nPoints = 500) {
  const gains = [];
  const roots = [];

  // Use logarithmic-ish spacing near 0, then linear
  for (let i = 0; i < nPoints; i++) {
    let k;
    if (kMin >= 0) {
      // Mix log and linear for better resolution near origin
      const frac = i / (nPoints - 1);
      if (frac < 0.3) {
        // Fine resolution near kMin
        k = kMin + (kMax - kMin) * 0.1 * (frac / 0.3);
      } else {
        k = kMin + (kMax - kMin) * (0.1 + 0.9 * ((frac - 0.3) / 0.7));
      }
    } else {
      k = kMin + (kMax - kMin) * i / (nPoints - 1);
    }

    // Characteristic polynomial: den + K * num
    const charPoly = polyadd(sys.den, polyscale(sys.num, k));
    const r = polyroots(charPoly);

    gains.push(k);
    roots.push(r);
  }

  return { gains, roots };
}

/**
 * Compute asymptotes for root locus.
 * @returns {{ centroid: number, angles: number[] }}
 */
export function rootLocusAsymptotes(sys) {
  const poles = sys.poles();
  const zeros = sys.zeros();
  const n = poles.length;
  const m = zeros.length;
  const diff = n - m;

  if (diff <= 0) return { centroid: 0, angles: [] };

  // Centroid = (sum of poles - sum of zeros) / (n - m)
  const sumPoles = poles.reduce((s, p) => s + p.re, 0);
  const sumZeros = zeros.reduce((s, z) => s + z.re, 0);
  const centroid = (sumPoles - sumZeros) / diff;

  // Angles = (2k+1)·180° / (n-m) for k = 0, 1, ..., n-m-1
  const angles = [];
  for (let k = 0; k < diff; k++) {
    angles.push((2 * k + 1) * 180 / diff);
  }

  return { centroid, angles };
}
