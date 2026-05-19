/**
 * design.js — Closed-loop design helpers.
 *
 * Converts performance specifications (%OS, Ts, PM) into target pole
 * positions and lead compensator parameters.
 */
import { stabilityMargins } from './stability.js';
import { designLeadCompensator, leadLagTransferFunction } from './compensator.js';
import { matCreate, matMul, matIdentity, matInverse } from '../math/matrix.js?v=p5';
import { controllabilityMatrix } from './state-space.js?v=p5';
import { c2dZOH } from './c2d.js?v=p5';
import { DiscreteTransferFunction } from './discrete-transfer-function.js';
import { Complex } from '../math/complex.js';
import { PIDController } from './pid.js';

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
 * Auto-tune PID to meet a frequency-domain specification:
 *   target phase margin PM_target at target crossover frequency ωc.
 *
 * Algorithm (loop-shaping):
 *   1. Evaluate G(jωc) → magnitude |G|, phase φ_G
 *   2. Required controller phase: φ_C = PM_target − 180° − φ_G
 *   3. Solve for (Kp, Ki, Kd) from the two constraints:
 *        |C(jωc)| · |G(jωc)| = 1   (gain crossover at ωc)
 *        ∠C(jωc) = φ_C             (phase matches target PM)
 *      with one free parameter fixed by tiTdRatio = Ti/Td (default 4).
 *
 * For P:   Kp = 1/|G|   (note: only works if plant phase = PM − 180°)
 * For PI:  Kp = cos(φ_C)/|G|,  Ki = −Kp·ωc·tan(φ_C)
 * For PID: solve quadratic for x = ωc·Td with Ti = tiTdRatio·Td:
 *   tiTdRatio·x² − tiTdRatio·tan(φ_C)·x − 1 = 0
 *   x = [tan(φ_C) + √(tan²(φ_C) + 4/tiTdRatio)] / 2
 *   Kp = |cos(φ_C)|/|G|,  Ki = Kp/Ti,  Kd = Kp·Td
 *
 * @param {TransferFunction} plant
 * @param {{ targetPM, targetWc, type?, tiTdRatio? }} options
 * @returns {{ Kp, Ki, Kd, Ti?, Td?, controller, achievedPM, achievedWc, achievedGM }}
 */
export function autoTunePIDToSpec(plant, { targetPM, targetWc, type = 'PID', tiTdRatio = 4 } = {}) {
  if (!plant) throw new Error('plant required');
  if (!Number.isFinite(targetPM) || targetPM <= 0 || targetPM >= 180) {
    throw new Error('targetPM must be between 0° and 180°');
  }
  if (!Number.isFinite(targetWc) || targetWc <= 0) {
    throw new Error('targetWc must be a positive number (rad/s)');
  }

  // Step 1: evaluate plant at target crossover frequency
  const Gjw = plant.evalAt(new Complex(0, targetWc));
  const magG = Gjw.magnitude;
  const phiG = Gjw.angleDeg; // degrees
  if (magG < 1e-15) throw new Error('Plant magnitude at ωc is near zero; choose a different ωc');

  // Step 2: required controller phase
  const phiC_deg = targetPM - 180 - phiG;
  const phiC_rad = phiC_deg * Math.PI / 180;
  const t = type.toUpperCase();

  let Kp, Ki = 0, Kd = 0, Ti, Td;

  if (t === 'P') {
    // C = Kp (real), no phase contribution
    Kp = 1 / magG;
  } else if (t === 'PI') {
    // C(jωc) = Kp − j·Ki/ωc;  phase ∈ (−90°, 0°]
    if (phiC_deg < -89 || phiC_deg > 1) {
      throw new Error(
        `PI cannot provide φ_C=${phiC_deg.toFixed(1)}° at this ωc. ` +
        'Try a lower target PM or use PID.',
      );
    }
    Kp = Math.cos(phiC_rad) / magG;
    Ki = -Kp * targetWc * Math.tan(phiC_rad); // positive when phiC < 0
    if (Ki < 0) throw new Error('Computed Ki < 0; plant phase may already exceed target PM');
  } else {
    // PID — fix Ti = tiTdRatio·Td, solve quadratic for x = ωc·Td
    const tanPhi = Math.tan(phiC_rad);
    const disc = tanPhi * tanPhi + 4 / tiTdRatio;
    if (disc < 0) throw new Error('No real solution for PID parameters at this PM/ωc combination');
    const x = (tanPhi + Math.sqrt(disc)) / 2;
    if (x <= 0) throw new Error('PID auto-tune: no positive Td solution; try increasing target PM');
    Td = x / targetWc;
    Ti = tiTdRatio * Td;
    Kp = Math.abs(Math.cos(phiC_rad)) / magG;
    Ki = Kp / Ti;
    Kd = Kp * Td;
    if (Kp <= 1e-15 || Ki <= 1e-15) throw new Error('Computed PID gains are degenerate; check target PM');
  }

  const controller = new PIDController(Kp, Ki, Kd);
  // Verification: compute achieved margins
  const loopTF = controller.toTransferFunction().series(plant);
  const margins = stabilityMargins(loopTF);
  return {
    Kp, Ki, Kd, Ti, Td,
    controller,
    phiC_deg,
    achievedPM: margins.phaseMargin,
    achievedWc: margins.gainCrossover,
    achievedGM: margins.gainMarginDB,
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

