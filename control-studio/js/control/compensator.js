/**
 * compensator.js — Lead/Lag compensator transfer functions.
 *
 * Cc(s) = Kc * (tau*s + 1) / (alpha*tau*s + 1)
 * Lead: 0 < alpha < 1. Lag: alpha > 1.
 */
import { TransferFunction } from './transfer-function.js';

export function normalizeCompensatorConfig(config = {}) {
  const mode = ['lead', 'lag'].includes(config.mode) ? config.mode : 'none';
  const gain = Number(config.gain ?? 1);
  const tau = Number(config.tau ?? 1);
  const alpha = Number(config.alpha ?? (mode === 'lead' ? 0.2 : 5));
  return {
    mode,
    gain: Number.isFinite(gain) && gain > 0 ? gain : 1,
    tau: Number.isFinite(tau) && tau > 0 ? tau : 1,
    alpha: Number.isFinite(alpha) && alpha > 0 ? alpha : (mode === 'lead' ? 0.2 : 5),
  };
}

export function leadLagTransferFunction(config = {}) {
  const normalized = normalizeCompensatorConfig(config);
  if (normalized.mode === 'none') return new TransferFunction([1], [1]);
  const { gain, tau, alpha } = normalized;
  return new TransferFunction([gain * tau, gain], [alpha * tau, 1]);
}

export function compensatorDescription(config = {}) {
  const normalized = normalizeCompensatorConfig(config);
  if (normalized.mode === 'none') return 'No lead/lag compensator';
  return `${normalized.mode.toUpperCase()} Kc=${normalized.gain}, tau=${normalized.tau}, alpha=${normalized.alpha}`;
}

export function designLeadCompensator({ phaseBoostDeg, crossoverFreq, gainStrategy = 'unity-at-crossover' } = {}) {
  const phi = Number(phaseBoostDeg);
  const wc = Number(crossoverFreq);
  if (!Number.isFinite(phi) || phi <= 0 || phi >= 90) {
    throw new Error('Lead phase boost must be between 0 and 90 degrees');
  }
  if (!Number.isFinite(wc) || wc <= 0) {
    throw new Error('Lead crossover frequency must be greater than 0');
  }
  const sinPhi = Math.sin((phi * Math.PI) / 180);
  const alpha = (1 - sinPhi) / (1 + sinPhi);
  const tau = 1 / (wc * Math.sqrt(alpha));
  const gain = gainStrategy === 'unity-at-crossover' ? Math.sqrt(alpha) : 1;
  return normalizeCompensatorConfig({ mode: 'lead', gain, tau, alpha });
}

/**
 * Notch filter transfer function.
 * N(s) = (s² + 2·ζ_num·ω_n·s + ω_n²) / (s² + 2·ζ_den·ω_n·s + ω_n²)
 * zetaNum < zetaDen gives attenuation at ω_n.
 */
export function notchFilter(omegaN, zetaNum, zetaDen) {
  if (!(omegaN > 0)) throw new Error('Notch filter: omegaN must be > 0');
  if (!(zetaNum >= 0)) throw new Error('Notch filter: zetaNum must be >= 0');
  if (!(zetaDen > 0)) throw new Error('Notch filter: zetaDen must be > 0');
  if (!(zetaNum < zetaDen)) throw new Error('Notch filter: zetaNum must be < zetaDen for attenuation');
  const wn2 = omegaN * omegaN;
  const num = [1, 2 * zetaNum * omegaN, wn2];
  const den = [1, 2 * zetaDen * omegaN, wn2];
  return new TransferFunction(num, den);
}

export function notchFilterDescription(omegaN, zetaNum, zetaDen) {
  return `Notch ω_n=${omegaN}, ζ_z=${zetaNum}, ζ_p=${zetaDen}`;
}

/**
 * Design a Lead-Lag cascade compensator in one step.
 * C(s) = Kc_lead·(τ₁s+1)/(ατ₁s+1) · (τ₂s+1)/(βτ₂s+1)   α<1, β>1
 *
 * Lead part: provides phaseBoostDeg phase lift at crossoverFreq.
 * Lag  part: provides improvementFactor steady-state gain boost (α_lag = improvementFactor).
 *
 * @param {{ phaseBoostDeg, crossoverFreq, improvementFactor, zeroRatio? }} opts
 * @returns {{ lead, lag, combinedTf: TransferFunction }}
 */
export function designLeadLagCompensator({ phaseBoostDeg, crossoverFreq, improvementFactor, zeroRatio = 10 } = {}) {
  const lead = designLeadCompensator({ phaseBoostDeg, crossoverFreq });
  const lag  = designLagCompensator({ improvementFactor, crossoverFreq, zeroRatio });
  // Combined TF = lead_tf · lag_tf
  const leadTf = leadLagTransferFunction(lead);
  const lagTf  = leadLagTransferFunction(lag);
  return { lead, lag, combinedTf: leadTf.series(lagTf) };
}

export function designLagCompensator({ improvementFactor, crossoverFreq, zeroRatio = 10 } = {}) {
  const factor = Number(improvementFactor);
  const wc = Number(crossoverFreq);
  const ratio = Number(zeroRatio);
  if (!Number.isFinite(factor) || factor <= 1) {
    throw new Error('Lag improvement factor must be greater than 1');
  }
  if (!Number.isFinite(wc) || wc <= 0) {
    throw new Error('Lag crossover frequency must be greater than 0');
  }
  if (!Number.isFinite(ratio) || ratio <= 1) {
    throw new Error('Lag zero ratio must be greater than 1');
  }
  return normalizeCompensatorConfig({
    mode: 'lag',
    gain: factor,
    tau: ratio / wc,
    alpha: factor,
  });
}
