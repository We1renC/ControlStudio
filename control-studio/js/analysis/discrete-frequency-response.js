/**
 * discrete-frequency-response.js — DTFT frequency response for DTF.
 *
 * Evaluates G(z) at z = e^{j ω Ts} for ω in [omegaMin, π/Ts].
 * Returns magnitude (linear + dB) and phase (deg, unwrapped).
 */
import { Complex } from '../math/complex.js';

function evalDtfAt(sys, theta) {
  // theta = -ω·Ts so that z⁻¹ = e^{jθ}
  let nRe = 0, nIm = 0, dRe = 0, dIm = 0;
  for (let k = 0; k < sys.num.length; k++) {
    const c = sys.num[k];
    nRe += c * Math.cos(k * theta);
    nIm += c * Math.sin(k * theta);
  }
  for (let k = 0; k < sys.den.length; k++) {
    const c = sys.den[k];
    dRe += c * Math.cos(k * theta);
    dIm += c * Math.sin(k * theta);
  }
  // (N) / (D) using the shared robust complex division path.
  const value = new Complex(nRe, nIm).div(new Complex(dRe, dIm));
  return { re: value.re, im: value.im };
}

/**
 * Compute Bode data for a discrete transfer function.
 * @param {DiscreteTransferFunction} sys
 * @param {{ omegaMin?: number, samples?: number }} options
 * @returns {{ w:number[], mag:number[], magDB:number[], phaseDeg:number[], omegaNyquist:number }}
 */
export function discreteBodeData(sys, options = {}) {
  const Ts = sys.sampleTime;
  if (!Number.isFinite(Ts) || Ts <= 0) throw new Error('discreteBodeData: invalid sampleTime');
  const omegaNyquist = Math.PI / Ts;
  const requestedSamples = options.samples ?? 500;
  if (!Number.isFinite(requestedSamples)) {
    throw new Error('discreteBodeData: samples must be finite');
  }
  const samples = Math.max(50, Math.floor(requestedSamples));
  const omegaMin = options.omegaMin ?? omegaNyquist * 1e-4;
  if (!Number.isFinite(omegaMin) || omegaMin <= 0 || omegaMin >= omegaNyquist) {
    throw new Error('discreteBodeData: omegaMin must satisfy 0 < omegaMin < Nyquist frequency');
  }
  const w = [], mag = [], magDB = [], phaseDeg = [];
  let prevPh = null;
  for (let i = 0; i < samples; i++) {
    const om = omegaMin * Math.pow(omegaNyquist / omegaMin, i / (samples - 1));
    const theta = -om * Ts;
    const g = evalDtfAt(sys, theta);
    const m = Math.hypot(g.re, g.im);
    let ph = Math.atan2(g.im, g.re) * 180 / Math.PI;
    if (prevPh !== null) {
      while (ph - prevPh > 180) ph -= 360;
      while (ph - prevPh < -180) ph += 360;
    }
    prevPh = ph;
    w.push(om);
    mag.push(m);
    magDB.push(20 * Math.log10(Math.max(m, 1e-30)));
    phaseDeg.push(ph);
  }
  return { w, mag, magDB, phaseDeg, omegaNyquist };
}
