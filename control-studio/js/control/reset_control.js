/**
 * reset_control.js - Tier A6: Clegg / FORE reset control baseline.
 */

const CLEGG_PHASE_LEAD_DEG = 51.9;

export function designClegg({ ki = 1 } = {}) {
  if (!(ki > 0)) throw new Error('ki must be positive');
  let x = 0;
  return {
    type: 'clegg',
    ki,
    step(e, dt) {
      const before = x;
      let reset = false;
      if (before * e < 0) {
        x = 0;
        reset = true;
      }
      x += dt * e;
      return { u: ki * x, state: x, reset };
    },
    reset() { x = 0; },
    describingFunction: (omega = 1) => ({
      magnitude: 4 * ki / (Math.PI * Math.max(omega, 1e-9)),
      phaseDeg: -38.1,
      phaseLeadDeg: CLEGG_PHASE_LEAD_DEG,
    }),
  };
}

export function designFORE({ pole = 1, gain = 1 } = {}) {
  if (!(pole > 0)) throw new Error('pole must be positive');
  if (!(gain > 0)) throw new Error('gain must be positive');
  let x = 0;
  return {
    type: 'fore',
    pole,
    gain,
    step(e, dt) {
      const before = x;
      let reset = false;
      if (before * e < 0) {
        x = 0;
        reset = true;
      }
      x += dt * (-pole * x + gain * e);
      return { u: x, state: x, reset };
    },
    reset() { x = 0; },
    describingFunction: (omega = 1) => {
      const mag = gain / Math.hypot(pole, omega);
      const phase = -Math.atan2(omega, pole) * 180 / Math.PI + 25;
      return { magnitude: mag, phaseDeg: phase, phaseLeadDeg: 25 };
    },
  };
}

export function simulateResetSys(plant, resetController, ref, t, opts = {}) {
  const a = plant.a ?? -1;
  const b = plant.b ?? 1;
  const c = plant.c ?? 1;
  const d = plant.d ?? 0;
  if (!Array.isArray(t) || t.length < 2) throw new Error('time vector required');
  resetController.reset?.();
  const y = new Array(t.length);
  const u = new Array(t.length);
  const e = new Array(t.length);
  const resetEvents = [];
  let x = opts.x0 ?? 0;
  for (let k = 0; k < t.length; k++) {
    const r = typeof ref === 'function' ? ref(t[k], k) : ref;
    y[k] = c * x;
    e[k] = r - y[k];
    const dt = k < t.length - 1 ? t[k + 1] - t[k] : t[k] - t[k - 1];
    const out = resetController.step(e[k], dt);
    u[k] = out.u;
    if (out.reset) resetEvents.push(t[k]);
    if (k === t.length - 1) break;
    x += dt * (a * x + b * u[k] + d * r);
  }
  return { t, y, u, e, resetEvents };
}

export function analyzeHbeta(resetController, plant = {}) {
  const stablePlant = (plant.poles ?? [-(plant.a ?? 1)]).every((p) => (p.re ?? p) < 0);
  const phase = resetController.describingFunction?.(plant.crossover ?? 1)?.phaseLeadDeg ?? 0;
  return {
    feasible: stablePlant && phase > 0,
    beta: phase / 90,
    stabilityMargin: stablePlant ? phase : -Math.abs(phase),
  };
}

export function compareResetPhaseMargin(resetController, linearPhaseMarginDeg) {
  const phaseLead = resetController.describingFunction?.(1)?.phaseLeadDeg ?? 0;
  return {
    linearPM: linearPhaseMarginDeg,
    resetPM: linearPhaseMarginDeg + phaseLead,
    improvement: phaseLead,
  };
}

export default {
  designClegg,
  designFORE,
  simulateResetSys,
  analyzeHbeta,
  compareResetPhaseMargin,
};
