/**
 * robust.js — Phase 10 robust-control baseline.
 *
 * This is not H∞ synthesis. It provides analysis primitives that are needed
 * before synthesis is worth adding: S, T, KS and peak sensitivity metrics.
 */

import { Complex } from '../math/complex.js';
import { evalAtJw, singularValues } from './mimo.js';

function onePlus(value) {
  return new Complex(1, 0).add(value);
}

function magnitudePeak(values) {
  let peak = -Infinity;
  let peakOmega = NaN;
  for (const point of values) {
    if (Number.isFinite(point.magnitude) && point.magnitude > peak) {
      peak = point.magnitude;
      peakOmega = point.omega;
    }
  }
  return { peak, peakOmega, peakDB: 20 * Math.log10(Math.max(peak, 1e-30)) };
}

export function sensitivityAt(loopTf, omega, controllerTf = null) {
  if (!(omega >= 0)) throw new Error('omega must be >= 0');
  const s = new Complex(0, omega);
  const L = loopTf.evalAt(s);
  const denom = onePlus(L);
  if (denom.magnitude < 1e-12) {
    throw new Error(`1 + L(j${omega}) is near zero; closed-loop sensitivity is singular`);
  }
  const S = new Complex(1, 0).div(denom);
  const T = L.div(denom);
  const K = controllerTf ? controllerTf.evalAt(s) : null;
  const KS = K ? K.div(denom) : null;
  return { omega, L, S, T, KS };
}

export function sensitivityBode(loopTf, omegas, controllerTf = null) {
  if (!Array.isArray(omegas) || !omegas.length) {
    throw new Error('omegas must be a non-empty array');
  }
  const points = omegas.map((omega) => sensitivityAt(loopTf, omega, controllerTf));
  return {
    omegas: [...omegas],
    S: points.map((point) => point.S),
    T: points.map((point) => point.T),
    KS: points.map((point) => point.KS),
  };
}

export function robustPeaks(loopTf, omegas, controllerTf = null) {
  if (!Array.isArray(omegas) || !omegas.length) {
    throw new Error('omegas must be a non-empty array');
  }
  const points = omegas.map((omega) => sensitivityAt(loopTf, omega, controllerTf));
  const sValues = points.map((point) => ({ omega: point.omega, magnitude: point.S.magnitude }));
  const tValues = points.map((point) => ({ omega: point.omega, magnitude: point.T.magnitude }));
  const ksValues = points
    .filter((point) => point.KS)
    .map((point) => ({ omega: point.omega, magnitude: point.KS.magnitude }));
  const Ms = magnitudePeak(sValues);
  const Mt = magnitudePeak(tValues);
  const MKs = ksValues.length ? magnitudePeak(ksValues) : null;
  let risk = 'low';
  if (Ms.peak > 2.5 || Mt.peak > 2.5) risk = 'high';
  else if (Ms.peak > 1.8 || Mt.peak > 1.8) risk = 'medium';
  return { Ms, Mt, MKs, risk };
}

/**
 * Gain/phase uncertainty sweep — multiplicative input uncertainty model
 *
 *   L_perturbed(jω) = L(jω) · k · e^{-jθ},   k ∈ gainFactors,   θ ∈ phaseShifts (rad)
 *
 * For each ω, compute |S|, |T| (and |KS| if a controller is provided) across
 * the full Cartesian grid of {k} × {θ} and report:
 *   - nominal magnitudes (k=1, θ=0)
 *   - worst-case magnitudes (max across perturbations)
 *   - the grid point achieving the worst case per ω
 *
 * Caller supplies the sample lists explicitly so the test surface and UI
 * inputs stay deterministic (no implicit ±X% expansion magic).
 *
 * @param {TransferFunction} loopTf
 * @param {number[]} omegas
 * @param {{ gainFactors?: number[], phaseShiftsDeg?: number[], controllerTf?: TransferFunction }} options
 * @returns {{
 *   omegas: number[],
 *   nominal: { S: number[], T: number[], KS: number[]|null },
 *   worst: { S: number[], T: number[], KS: number[]|null },
 *   worstAt: { S: {gain:number, phaseDeg:number}[], T: ..., KS: ... },
 *   peaks: { S, T, KS },
 *   grid: { gainFactors: number[], phaseShiftsDeg: number[] }
 * }}
 */
/**
 * Additive uncertainty: L_perturbed(jω) = L(jω) + ΔL(jω), where |ΔL(jω)| ≤ W_a(ω) at frequency ω.
 * Returns worst-case |S|, |T|, |KS| over a disk perturbation of radius W_a sampled at `samples` angles.
 *
 * Use when the plant is poorly modeled in absolute terms (e.g. additive uncertainty Δ = G_real − G_model).
 *
 * @param {TransferFunction} loopTf
 * @param {number[]} omegas
 * @param {Object} options
 * @param {number} options.radius - additive disk radius (single number) OR
 * @param {Function} options.radiusFn - ω → radius for frequency-dependent weight
 * @param {number} options.samples - number of angles on the disk (default 8)
 * @param {TransferFunction} options.controllerTf
 */
export function additiveUncertaintyEnvelope(loopTf, omegas, options = {}) {
  if (!Array.isArray(omegas) || !omegas.length) throw new Error('omegas must be a non-empty array');
  const radius = options.radius ?? 0.1;
  const radiusFn = options.radiusFn || (() => radius);
  const samples = Math.max(2, options.samples ?? 8);
  const controllerTf = options.controllerTf ?? null;

  const nominalS = new Array(omegas.length);
  const nominalT = new Array(omegas.length);
  const worstS = new Array(omegas.length).fill(-Infinity);
  const worstT = new Array(omegas.length).fill(-Infinity);
  const worstKS = controllerTf ? new Array(omegas.length).fill(-Infinity) : null;

  for (let k = 0; k < omegas.length; k++) {
    const omega = omegas[k];
    const s = new Complex(0, omega);
    const Lnominal = loopTf.evalAt(s);
    const Knominal = controllerTf ? controllerTf.evalAt(s) : null;
    const w = Math.max(0, radiusFn(omega));

    const Snom = new Complex(1, 0).div(onePlus(Lnominal));
    const Tnom = Lnominal.div(onePlus(Lnominal));
    nominalS[k] = Snom;
    nominalT[k] = Tnom;

    for (let j = 0; j < samples; j++) {
      const ang = (2 * Math.PI * j) / samples;
      const delta = new Complex(w * Math.cos(ang), w * Math.sin(ang));
      const Lp = new Complex(Lnominal.re + delta.re, Lnominal.im + delta.im);
      const denom = onePlus(Lp);
      if (denom.magnitude < 1e-12) {
        worstS[k] = Infinity; worstT[k] = Infinity;
        if (worstKS) worstKS[k] = Infinity;
        continue;
      }
      const Sp = new Complex(1, 0).div(denom);
      const Tp = Lp.div(denom);
      worstS[k] = Math.max(worstS[k], Sp.magnitude);
      worstT[k] = Math.max(worstT[k], Tp.magnitude);
      if (worstKS) {
        const KSp = Knominal.mul(Sp);
        worstKS[k] = Math.max(worstKS[k], KSp.magnitude);
      }
    }
  }
  return {
    nominalS: nominalS.map((c) => ({ magnitude: c.magnitude })),
    nominalT: nominalT.map((c) => ({ magnitude: c.magnitude })),
    worstS, worstT, worstKS,
    peaks: { S: Math.max(...worstS), T: Math.max(...worstT), KS: worstKS ? Math.max(...worstKS) : null },
    radius,
    samples,
  };
}

/**
 * Disk Margin α: largest disk (gain k ∈ [1/(1+α), 1+α], phase φ ∈ [−θ_α, θ_α])
 * inside which closed-loop stability is preserved. Approximation via SISO sensitivity:
 *   α ≈ 1 / max( ‖S‖∞ , ‖T‖∞ )
 *
 * Returns { alpha, phaseDeg, gainDB } where:
 *   phaseDeg = 2·asin(α/2) (degrees) — equivalent phase margin
 *   gainDB   = 20·log10((1+α/2)/(1−α/2)) — equivalent symmetric gain margin
 *
 * Reference: Seiler, Packard et al. (2020) "An Introduction to Disk Margins"
 */
export function diskMargin(loopTf, omegas, controllerTf = null) {
  const peaks = robustPeaks(loopTf, omegas, controllerTf);
  const Ms = peaks.Ms.peak;
  const Mt = peaks.Mt.peak;
  const maxPeak = Math.max(Ms, Mt);
  if (!Number.isFinite(maxPeak) || maxPeak <= 0) return { alpha: NaN, phaseDeg: NaN, gainDB: NaN };
  const alpha = 1 / maxPeak;
  // Convert disk-margin α to equivalent classical margins
  const phaseDeg = alpha < 2 ? (2 * Math.asin(alpha / 2) * 180) / Math.PI : NaN;
  const gainDB = alpha < 2 ? 20 * Math.log10((1 + alpha / 2) / (1 - alpha / 2)) : NaN;
  return { alpha, phaseDeg, gainDB, Ms, Mt };
}

export function uncertaintyEnvelope(loopTf, omegas, options = {}) {
  if (!Array.isArray(omegas) || !omegas.length) {
    throw new Error('omegas must be a non-empty array');
  }
  const gainFactors = options.gainFactors ?? [1];
  const phaseShiftsDeg = options.phaseShiftsDeg ?? [0];
  const controllerTf = options.controllerTf ?? null;
  if (!gainFactors.length) throw new Error('gainFactors must be non-empty');
  if (!phaseShiftsDeg.length) throw new Error('phaseShiftsDeg must be non-empty');
  if (gainFactors.some((k) => !(k > 0))) throw new Error('gainFactors must be positive');

  const nominalS = new Array(omegas.length);
  const nominalT = new Array(omegas.length);
  const nominalKS = controllerTf ? new Array(omegas.length) : null;
  const worstS = new Array(omegas.length).fill(-Infinity);
  const worstT = new Array(omegas.length).fill(-Infinity);
  const worstKS = controllerTf ? new Array(omegas.length).fill(-Infinity) : null;
  const worstAtS = new Array(omegas.length);
  const worstAtT = new Array(omegas.length);
  const worstAtKS = controllerTf ? new Array(omegas.length) : null;

  for (let k = 0; k < omegas.length; k++) {
    const omega = omegas[k];
    const s = new Complex(0, omega);
    const Lnominal = loopTf.evalAt(s);
    const Knominal = controllerTf ? controllerTf.evalAt(s) : null;

    for (const gain of gainFactors) {
      for (const phaseDeg of phaseShiftsDeg) {
        const theta = (phaseDeg * Math.PI) / 180;
        // e^{-jθ} = cos θ − j sin θ
        const rot = new Complex(Math.cos(theta), -Math.sin(theta));
        const Lscaled = new Complex(Lnominal.re * gain, Lnominal.im * gain);
        const Lp = Lscaled.mul(rot);
        const denom = onePlus(Lp);
        if (denom.magnitude < 1e-12) {
          // Perturbation lands exactly on −1; treat as +Infinity.
          worstS[k] = Infinity;
          worstT[k] = Infinity;
          if (worstKS) worstKS[k] = Infinity;
          worstAtS[k] = { gain, phaseDeg };
          worstAtT[k] = { gain, phaseDeg };
          if (worstAtKS) worstAtKS[k] = { gain, phaseDeg };
          continue;
        }
        const Sp = new Complex(1, 0).div(denom);
        const Tp = Lp.div(denom);
        const KSp = Knominal ? Knominal.div(denom) : null;
        if (gain === 1 && phaseDeg === 0) {
          nominalS[k] = Sp.magnitude;
          nominalT[k] = Tp.magnitude;
          if (nominalKS) nominalKS[k] = KSp.magnitude;
        }
        if (Sp.magnitude > worstS[k]) {
          worstS[k] = Sp.magnitude;
          worstAtS[k] = { gain, phaseDeg };
        }
        if (Tp.magnitude > worstT[k]) {
          worstT[k] = Tp.magnitude;
          worstAtT[k] = { gain, phaseDeg };
        }
        if (KSp && KSp.magnitude > worstKS[k]) {
          worstKS[k] = KSp.magnitude;
          worstAtKS[k] = { gain, phaseDeg };
        }
      }
    }
    // If (1,0) was not in the grid, fall back to a fresh nominal evaluation.
    if (nominalS[k] === undefined) {
      const denom = onePlus(Lnominal);
      const Snom = new Complex(1, 0).div(denom);
      const Tnom = Lnominal.div(denom);
      nominalS[k] = Snom.magnitude;
      nominalT[k] = Tnom.magnitude;
      if (nominalKS) nominalKS[k] = Knominal.div(denom).magnitude;
    }
  }

  function peakOf(values) {
    let peak = -Infinity;
    let peakOmega = NaN;
    for (let k = 0; k < values.length; k++) {
      if (values[k] > peak) {
        peak = values[k];
        peakOmega = omegas[k];
      }
    }
    return { peak, peakOmega, peakDB: 20 * Math.log10(Math.max(peak, 1e-30)) };
  }

  return {
    omegas: [...omegas],
    nominal: { S: nominalS, T: nominalT, KS: nominalKS },
    worst: { S: worstS, T: worstT, KS: worstKS },
    worstAt: { S: worstAtS, T: worstAtT, KS: worstAtKS },
    peaks: {
      S: peakOf(worstS),
      T: peakOf(worstT),
      KS: worstKS ? peakOf(worstKS) : null,
    },
    grid: {
      gainFactors: [...gainFactors],
      phaseShiftsDeg: [...phaseShiftsDeg],
    },
  };
}

// ---------------------------------------------------------------------------
// H∞ norm estimation (Phase 11)
// ---------------------------------------------------------------------------

/**
 * Return the largest singular value of a p×m complex matrix G.
 * G is represented as an array of p rows, each row an array of m Complex values.
 * Delegates to mimo.js singularValues which already handles the G^H G eigen-decomp.
 */
function maxSingularValue(G) {
  const svs = singularValues(G);
  return svs[0]; // singularValues returns largest first
}

/**
 * Build a log-spaced frequency grid and evaluate σ_max(G(jω)) at each point.
 * Returns an array of { omega, sigMax }.
 */
function gridSweep(mimoSys, omegaLo, omegaHi, gridPoints) {
  const logLo = Math.log10(omegaLo);
  const logHi = Math.log10(omegaHi);
  const result = [];
  for (let i = 0; i < gridPoints; i++) {
    const logOmega = logLo + (i / (gridPoints - 1)) * (logHi - logLo);
    const omega = Math.pow(10, logOmega);
    const G = evalAtJw(mimoSys, omega);
    const sigMax = maxSingularValue(G);
    result.push({ omega, sigMax });
  }
  return result;
}

/**
 * Estimate the H∞ norm using a coarse grid search only (no refinement).
 * Faster but less accurate than hInfNorm.
 *
 * @param {MIMOStateSpace} mimoSys
 * @param {{ omegaLo?, omegaHi?, gridPoints? }} options
 * @returns {{ norm: number, peakOmega: number, gridValues: {omega, sigMax}[] }}
 */
export function hInfNormUpperBound(mimoSys, options = {}) {
  const omegaLo = options.omegaLo ?? 1e-3;
  const omegaHi = options.omegaHi ?? 1e4;
  const gridPoints = options.gridPoints ?? 300;

  const gridValues = gridSweep(mimoSys, omegaLo, omegaHi, gridPoints);

  let norm = -Infinity;
  let peakOmega = NaN;
  for (const { omega, sigMax } of gridValues) {
    if (sigMax > norm) {
      norm = sigMax;
      peakOmega = omega;
    }
  }

  return { norm, peakOmega, gridValues };
}

/**
 * Estimate the H∞ norm: max_ω σ_max(G(jω)).
 *
 * Two-pass strategy:
 *   1. Coarse log-spaced grid (gridPoints points from omegaLo to omegaHi).
 *   2. Golden-section search over [10^(log10(ω_peak)−2), 10^(log10(ω_peak)+2)]
 *      for goldenIter iterations to refine the peak to ~0.1% relative accuracy.
 *
 * @param {MIMOStateSpace} mimoSys
 * @param {{ omegaLo?, omegaHi?, gridPoints?, goldenIter? }} options
 * @returns {{ norm: number, peakOmega: number, gridValues: {omega, sigMax}[] }}
 */
export function hInfNorm(mimoSys, options = {}) {
  const omegaLo = options.omegaLo ?? 1e-3;
  const omegaHi = options.omegaHi ?? 1e4;
  const gridPoints = options.gridPoints ?? 300;
  const goldenIter = options.goldenIter ?? 50;

  // Pass 1: coarse grid
  const gridValues = gridSweep(mimoSys, omegaLo, omegaHi, gridPoints);

  let coarseNorm = -Infinity;
  let coarseOmega = NaN;
  for (const { omega, sigMax } of gridValues) {
    if (sigMax > coarseNorm) {
      coarseNorm = sigMax;
      coarseOmega = omega;
    }
  }

  // Pass 2: golden-section search in log-omega space
  // Search window: ±2 decades around coarse peak, clamped to [omegaLo, omegaHi]
  const logPeak = Math.log10(coarseOmega);
  let logA = Math.max(Math.log10(omegaLo), logPeak - 2);
  let logB = Math.min(Math.log10(omegaHi), logPeak + 2);

  const phi = (1 + Math.sqrt(5)) / 2; // golden ratio
  const resphi = 2 - phi;             // 1 - 1/phi

  let logC = logA + resphi * (logB - logA);
  let logD = logB - resphi * (logB - logA);

  const sigAt = (logOmega) => {
    const omega = Math.pow(10, logOmega);
    const G = evalAtJw(mimoSys, omega);
    return maxSingularValue(G);
  };

  let fC = sigAt(logC);
  let fD = sigAt(logD);

  for (let iter = 0; iter < goldenIter; iter++) {
    // We are maximising, so keep the side with the higher function value.
    if (fC > fD) {
      logB = logD;
      logD = logC;
      fD = fC;
      logC = logA + resphi * (logB - logA);
      fC = sigAt(logC);
    } else {
      logA = logC;
      logC = logD;
      fC = fD;
      logD = logB - resphi * (logB - logA);
      fD = sigAt(logD);
    }
  }

  const logBest = (logA + logB) / 2;
  const peakOmega = Math.pow(10, logBest);
  const norm = sigAt(logBest);

  return { norm, peakOmega, gridValues };
}
