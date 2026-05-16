/**
 * design.js — Closed-loop design helpers.
 *
 * Converts performance specifications (%OS, Ts, PM) into target pole
 * positions and lead compensator parameters.
 */
import { stabilityMargins } from './stability.js';
import { designLeadCompensator, leadLagTransferFunction } from './compensator.js';
import { matCreate, matMul, matIdentity, matInverse } from '../math/matrix.js';
import { controllabilityMatrix } from './state-space.js';
import { c2dZOH } from './c2d.js';
import { DiscreteTransferFunction } from './discrete-transfer-function.js';

/**
 * Map (%OS, Ts) specifications to a 2nd-order dominant pole pair.
 *
 *   ζ  = -ln(OS/100) / √(π² + ln²(OS/100))
 *   σ  = k / Ts        (k=4 for 2%, k=3 for 5%)
 *   ωn = σ / ζ
 *   ωd = ωn · √(1 - ζ²)
 *   target poles s = -σ ± j ωd
 *
 * @param {{ overshoot: number, settlingTime: number, criterion?: 0.02|0.05 }} spec
 * @returns {{ zeta:number, omegaN:number, omegaD:number, sigma:number, poles:{re:number,im:number}[] }}
 */
export function specsToTargetPoles({ overshoot, settlingTime, criterion = 0.02 } = {}) {
  if (!(overshoot > 0 && overshoot < 100)) {
    throw new Error('overshoot must be between 0 and 100 (exclusive)');
  }
  if (!Number.isFinite(settlingTime) || settlingTime <= 0) {
    throw new Error('settlingTime must be positive');
  }
  const ln = -Math.log(overshoot / 100);
  const zeta = ln / Math.sqrt(Math.PI * Math.PI + ln * ln);
  const k = criterion === 0.05 ? 3 : 4;
  const sigma = k / settlingTime;
  const omegaN = sigma / zeta;
  const omegaD = omegaN * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  return {
    zeta,
    omegaN,
    omegaD,
    sigma,
    poles: [
      { re: -sigma, im: omegaD },
      { re: -sigma, im: -omegaD },
    ],
  };
}

/**
 * Design a Lead compensator that lifts plant phase margin to `targetPM`.
 * Strategy: keep crossover frequency, add phase boost at that frequency.
 *
 * @param {TransferFunction} plant
 * @param {{ targetPM:number, safetyMargin?:number }} options
 * @returns {null | { alpha, tau, gain, phaseBoostDeg, crossoverFreq,
 *                   currentPM, targetPM, achievedPM, leadTf, params }}
 */
export function designLeadForPM(plant, { targetPM, safetyMargin = 5 } = {}) {
  if (!plant) throw new Error('plant is required');
  if (!Number.isFinite(targetPM)) throw new Error('targetPM must be a finite number');
  const margins = stabilityMargins(plant);
  const currentPM = margins.phaseMargin;
  const wc = margins.gainCrossover;
  if (!Number.isFinite(wc) || wc <= 0) {
    return { skipped: true, reason: 'no gain crossover (PM = ∞)', currentPM: Infinity, targetPM };
  }
  if (currentPM >= targetPM) {
    return { skipped: true, reason: 'currentPM already meets target', currentPM, targetPM };
  }
  const phaseBoostDeg = (targetPM - currentPM) + safetyMargin;
  if (phaseBoostDeg >= 75) {
    throw new Error('single lead cannot reliably provide > 70° boost; consider cascaded leads');
  }
  const design = designLeadCompensator({ phaseBoostDeg, crossoverFreq: wc });
  const params = { mode: 'lead', gain: design.gain, tau: design.tau, alpha: design.alpha };
  const leadTf = leadLagTransferFunction(params);
  // Estimate achieved PM by checking margins of the compensated plant
  const openLoop = leadTf.series(plant);
  const newMargins = stabilityMargins(openLoop);
  return {
    alpha: design.alpha,
    tau: design.tau,
    gain: design.gain,
    phaseBoostDeg,
    crossoverFreq: wc,
    currentPM,
    targetPM,
    achievedPM: newMargins.phaseMargin,
    newCrossover: newMargins.gainCrossover,
    leadTf,
    params,
  };
}

/**
 * Deadbeat state-feedback gain via Ackermann's formula.
 *
 *   K = [0 0 … 0 1] · Wc⁻¹ · α(A)
 *
 * where Wc = [B AB A²B … A^{n-1}B] and α(z) = zⁿ (all desired poles at 0).
 * Therefore α(A) = Aⁿ. The resulting closed-loop A − BK has all eigenvalues
 * at z = 0, settling in at most n samples.
 *
 * @param {TransferFunction|DiscreteTransferFunction} plant
 * @param {number} Ts sample time (ignored if plant is already discrete)
 * @returns {{ K:number[], Ts:number, dtf:DiscreteTransferFunction, A:number[][], B:number[][] }}
 */
export function deadbeatGain(plant, Ts) {
  if (!plant) throw new Error('plant required');
  let dtf = plant instanceof DiscreteTransferFunction ? plant : c2dZOH(plant, Ts);
  // Build controllable canonical (A, B) directly from DTF denominator.
  const denN = dtf.den.map((c) => c / dtf.den[0]);
  const n = denN.length - 1;
  if (n === 0) throw new Error('deadbeat 需要至少一階系統');
  const A = matCreate(n, n, 0);
  for (let i = 0; i < n - 1; i++) A[i][i + 1] = 1;
  for (let j = 0; j < n; j++) A[n - 1][j] = -denN[n - j];
  const B = matCreate(n, 1, 0);
  B[n - 1][0] = 1;
  // Controllability matrix
  const Wc = controllabilityMatrix(A, B);
  // α(A) = Aⁿ
  let An = matIdentity(n);
  for (let i = 0; i < n; i++) An = matMul(An, A);
  // K = e_n^T · Wc⁻¹ · Aⁿ  (size 1 × n)
  const en = matCreate(1, n, 0); en[0][n - 1] = 1;
  const K = matMul(matMul(en, matInverse(Wc)), An);
  return { K: K[0], Ts: dtf.sampleTime, dtf, A, B };
}

