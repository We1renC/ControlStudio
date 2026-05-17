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
