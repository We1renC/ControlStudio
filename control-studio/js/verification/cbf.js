/**
 * cbf.js - Tier F2: Control Barrier Function safety filters.
 */

function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function norm2(a) { return dot(a, a); }
function sub(a, b) { return a.map((value, i) => value - b[i]); }
function add(a, b) { return a.map((value, i) => value + b[i]); }
function scale(a, s) { return a.map((value) => value * s); }

export function projectHalfspace(uDes, a, lowerBound) {
  const au = dot(a, uDes);
  if (au >= lowerBound) return { u: uDes.slice(), active: false };
  const denom = Math.max(1e-12, norm2(a));
  return { u: add(uDes, scale(a, (lowerBound - au) / denom)), active: true };
}

export function doubleIntegratorCircleCBF({ center = [0, 0], radius = 1, alpha0 = 2, alpha1 = 2 } = {}) {
  return {
    filter(state, uDes) {
      const p = state.slice(0, 2);
      const v = state.slice(2, 4);
      const rel = sub(p, center);
      const h = norm2(rel) - radius * radius;
      const hdot = 2 * dot(rel, v);
      const a = scale(rel, 2);
      const drift = 2 * dot(v, v);
      const lowerBound = -drift - alpha1 * hdot - alpha0 * h;
      const projected = projectHalfspace(uDes, a, lowerBound);
      return { ...projected, h, hdot, lowerBound };
    },
  };
}

export function sosCbfFeasibility({ polynomialDegree = 2, constraints = [] } = {}) {
  return {
    feasible: polynomialDegree % 2 === 0 && constraints.every((c) => c !== false),
    certificate: 'quadratic-sos-baseline',
  };
}

export default { projectHalfspace, doubleIntegratorCircleCBF, sosCbfFeasibility };
