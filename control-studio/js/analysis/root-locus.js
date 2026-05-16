/**
 * root-locus.js — Root locus computation
 * Traces how poles of 1 + K·G(s) = 0 move as K varies.
 */
import { polyroots, polyadd, polyscale, polymul, polysub, polyderiv, polyvalReal } from '../math/polynomial.js?v=p4';

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

/**
 * Sort each step's root array so that branch index is continuous across K.
 * Greedy nearest-neighbor matching between consecutive steps.
 * @param {Complex[][]} stepsRoots
 * @returns {Complex[][]}
 */
export function sortRootLocusBranches(stepsRoots) {
  if (!stepsRoots || stepsRoots.length === 0) return stepsRoots;
  const sorted = [stepsRoots[0].slice()];
  for (let step = 1; step < stepsRoots.length; step++) {
    const prev = sorted[step - 1];
    const curr = stepsRoots[step];
    if (!curr || curr.length !== prev.length) { sorted.push(curr); continue; }
    const n = prev.length;
    const used = new Array(n).fill(false);
    const assigned = new Array(n);
    for (let i = 0; i < n; i++) {
      let bestJ = -1, bestDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (used[j]) continue;
        const dr = curr[j].re - prev[i].re;
        const di = curr[j].im - prev[i].im;
        const d = dr * dr + di * di;
        if (d < bestDist) { bestDist = d; bestJ = j; }
      }
      used[bestJ] = true;
      assigned[i] = curr[bestJ];
    }
    sorted.push(assigned);
  }
  return sorted;
}

/**
 * Find breakaway / break-in points on the real axis.
 * Solves num'(s)·den(s) − num(s)·den'(s) = 0 and keeps real candidates with K > 0.
 * @returns {{ s: number, K: number, kind: 'breakaway'|'breakin' }[]}
 */
export function rootLocusBreakPoints(sys) {
  const num = sys.num;
  const den = sys.den;
  const numD = polyderiv(num);
  const denD = polyderiv(den);
  const P = polysub(polymul(numD, den), polymul(num, denD));
  const candidates = polyroots(P);
  const points = [];
  for (const c of candidates) {
    if (Math.abs(c.im) > 1e-6) continue;
    const s = c.re;
    const nv = polyvalReal(num, s);
    const dv = polyvalReal(den, s);
    if (Math.abs(nv) < 1e-12) continue;
    const K = -dv / nv;
    if (!Number.isFinite(K) || K <= 1e-9) continue;
    const kind = denominatorPolesNearby(sys, s) ? 'breakaway' : 'breakin';
    points.push({ s, K, kind });
  }
  return points;
}

function denominatorPolesNearby(sys, s) {
  const poles = sys.poles();
  let nearestPoleDist = Infinity;
  for (const p of poles) {
    if (Math.abs(p.im) > 1e-6) continue;
    nearestPoleDist = Math.min(nearestPoleDist, Math.abs(p.re - s));
  }
  const zeros = sys.zeros();
  let nearestZeroDist = Infinity;
  for (const z of zeros) {
    if (Math.abs(z.im) > 1e-6) continue;
    nearestZeroDist = Math.min(nearestZeroDist, Math.abs(z.re - s));
  }
  return nearestPoleDist <= nearestZeroDist;
}

/**
 * Find K values where the locus crosses the imaginary axis (jω crossings).
 * Sweeps K logarithmically, detects sign change in Re(root) on any branch,
 * then refines each crossing by bisection on the parametric characteristic poly.
 * @returns {{ K: number, omega: number }[]}
 */
export function rootLocusJwCrossings(sys, kMax = 1e4, samples = 400) {
  // Logarithmic spacing: fine resolution near K=0 where low-gain crossings hide
  const kMin = 1e-3;
  const kSweep = [];
  for (let i = 0; i < samples; i++) {
    kSweep.push(kMin * Math.pow(kMax / kMin, i / (samples - 1)));
  }
  const branches = sortRootLocusBranches(kSweep.map((k) => polyroots(polyadd(sys.den, polyscale(sys.num, k)))));
  const crossings = [];
  const n = branches[0]?.length || 0;
  for (let b = 0; b < n; b++) {
    for (let i = 1; i < branches.length; i++) {
      const prev = branches[i - 1][b];
      const curr = branches[i][b];
      if (!prev || !curr) continue;
      const crossed = (prev.re < 0 && curr.re >= 0) || (prev.re >= 0 && curr.re < 0);
      if (crossed && Math.abs(prev.im) > 1e-6) {
        const refined = refineJwCrossing(sys, kSweep[i - 1], kSweep[i], prev.im);
        if (refined) crossings.push(refined);
      }
    }
  }
  return dedupeCrossings(crossings);
}

function refineJwCrossing(sys, kLo, kHi, targetIm) {
  const pickComplex = (k) => {
    const roots = polyroots(polyadd(sys.den, polyscale(sys.num, k)));
    let best = null;
    for (const r of roots) {
      if (Math.abs(r.im) < 1e-6) continue;
      if (!best || Math.abs(r.im - targetIm) < Math.abs(best.im - targetIm)) best = r;
    }
    return best;
  };
  const lo0 = pickComplex(kLo);
  if (!lo0) return null;
  let sideLo = Math.sign(lo0.re) || 1;
  for (let iter = 0; iter < 80; iter++) {
    const kMid = 0.5 * (kLo + kHi);
    const mid = pickComplex(kMid);
    if (!mid) return null;
    if (Math.sign(mid.re || 1) === sideLo) kLo = kMid;
    else kHi = kMid;
    if (kHi - kLo < 1e-10) break;
  }
  const kStar = 0.5 * (kLo + kHi);
  const final = pickComplex(kStar);
  if (!final) return null;
  return { K: kStar, omega: Math.abs(final.im) };
}

function dedupeCrossings(list) {
  const out = [];
  for (const c of list) {
    const dup = out.find((o) => Math.abs(o.K - c.K) / Math.max(1, c.K) < 0.02 && Math.abs(o.omega - c.omega) < 1e-3);
    if (!dup) out.push(c);
  }
  return out.sort((a, b) => a.K - b.K);
}
