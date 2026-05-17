/**
 * robust.js — Phase 10 robust-control baseline.
 *
 * This is not H∞ synthesis. It provides analysis primitives that are needed
 * before synthesis is worth adding: S, T, KS and peak sensitivity metrics.
 */

import { Complex } from '../math/complex.js';

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
