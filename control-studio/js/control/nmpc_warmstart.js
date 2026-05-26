/**
 * nmpc_warmstart.js - Tier G5: NMPC shift-and-extend warm-start helpers.
 */

export function shiftAndExtend(controlSequence) {
  if (!Array.isArray(controlSequence) || controlSequence.length === 0) throw new Error('controlSequence must be non-empty');
  return [...controlSequence.slice(1).map((u) => u.slice()), controlSequence[controlSequence.length - 1].slice()];
}

export function simulateWarmStart({ plant, x0, controlSequence, dt = 1 } = {}) {
  const controls = shiftAndExtend(controlSequence);
  const states = [x0.slice()];
  let x = x0.slice();
  for (const u of controls) {
    x = plant(x, u, dt);
    states.push(x.slice());
  }
  return { controls, states };
}

export function compareWarmCold({ coldIterations, warmIterations }) {
  const coldAvg = coldIterations.reduce((sum, value) => sum + value, 0) / coldIterations.length;
  const warmAvg = warmIterations.reduce((sum, value) => sum + value, 0) / warmIterations.length;
  return { coldAvg, warmAvg, reduction: (coldAvg - warmAvg) / coldAvg };
}

export default { shiftAndExtend, simulateWarmStart, compareWarmCold };
