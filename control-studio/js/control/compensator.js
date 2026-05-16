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
