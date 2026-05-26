/**
 * reference_governor.js - Tier A7: scalar MOAS reference governor baseline.
 *
 * Baseline plant:
 *   x[k+1] = a*x[k] + b*v[k]
 * with scalar state/output constraints.
 */

function assertScalar(name, value) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function predictScalar(a, b, x0, v, horizon) {
  const xs = [x0];
  let x = x0;
  for (let k = 0; k < horizon; k++) {
    x = a * x + b * v;
    xs.push(x);
  }
  return xs;
}

function admissible(a, b, x, v, constraints, horizon) {
  if (v < (constraints.uMin ?? -Infinity) - 1e-12) return false;
  if (v > (constraints.uMax ?? Infinity) + 1e-12) return false;
  return predictScalar(a, b, x, v, horizon).every((value) =>
    value >= (constraints.xMin ?? -Infinity) - 1e-12 &&
    value <= (constraints.xMax ?? Infinity) + 1e-12);
}

export function computeMOAS(plant, _K = null, constraints = {}, horizon = 20) {
  const a = plant.a ?? 0;
  const b = plant.b ?? 1;
  assertScalar('plant.a', a);
  assertScalar('plant.b', b);
  if (!Number.isInteger(horizon) || horizon < 1) throw new Error('horizon must be a positive integer');
  const Hx = [];
  const hx = [];
  for (let k = 0; k <= horizon; k++) {
    const ak = Math.pow(a, k);
    if (Number.isFinite(constraints.xMax)) {
      Hx.push([ak]);
      hx.push(constraints.xMax);
    }
    if (Number.isFinite(constraints.xMin)) {
      Hx.push([-ak]);
      hx.push(-constraints.xMin);
    }
  }
  return { Hx, hx, isConvex: true, horizon, constraints: { ...constraints } };
}

export function designReferenceGov({ plant, controller = null, constraints, horizon = 20, v0 = 0 } = {}) {
  if (!plant || !constraints) throw new Error('plant and constraints are required');
  const a = plant.a ?? 0;
  const b = plant.b ?? 1;
  assertScalar('plant.a', a);
  assertScalar('plant.b', b);
  const moas = computeMOAS(plant, controller, constraints, horizon);
  return { plant: { a, b }, controller, constraints: { ...constraints }, horizon, moas, vPrev: v0 };
}

export function stepRG(gov, xCurrent, rTarget) {
  const { a, b } = gov.plant;
  assertScalar('xCurrent', xCurrent);
  assertScalar('rTarget', rTarget);
  const vPrev = gov.vPrev ?? 0;
  const targetDelta = rTarget - vPrev;
  if (Math.abs(targetDelta) < 1e-12) {
    return { v_modified: vPrev, kappa: 1, admissible: admissible(a, b, xCurrent, vPrev, gov.constraints, gov.horizon) };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    const v = vPrev + mid * targetDelta;
    if (admissible(a, b, xCurrent, v, gov.constraints, gov.horizon)) lo = mid;
    else hi = mid;
  }
  const kappa = lo;
  const v = vPrev + kappa * targetDelta;
  gov.vPrev = v;
  return { v_modified: v, kappa, admissible: true };
}

export function simulateReferenceGov(gov, rSeq, x0 = 0) {
  const x = [x0];
  const v = [];
  const kappa = [];
  for (let k = 0; k < rSeq.length; k++) {
    const out = stepRG(gov, x[k], rSeq[k]);
    v.push(out.v_modified);
    kappa.push(out.kappa);
    x.push(gov.plant.a * x[k] + gov.plant.b * out.v_modified);
  }
  return { x, v, kappa };
}

export default {
  computeMOAS,
  designReferenceGov,
  stepRG,
  simulateReferenceGov,
};
