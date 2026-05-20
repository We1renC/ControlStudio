/**
 * explicit_mpc.js — Phase 24-04 scalar explicit MPC baseline.
 *
 * This is intentionally scoped to one-state / one-input systems. It samples the
 * constrained online MPC law on a state grid, compresses the samples into
 * piecewise-linear regions, and evaluates the resulting lookup law without
 * solving a QP at runtime.
 */

import { firstMpcActionConstrained, validateMpcModel } from './mpc.js';

function asScalarMatrix(value, name) {
  if (!Array.isArray(value) || value.length !== 1 || !Array.isArray(value[0]) || value[0].length !== 1) {
    throw new Error(`${name} must be a 1×1 matrix`);
  }
  return value[0][0];
}

function fitLine(samples) {
  const n = samples.length;
  const sx = samples.reduce((sum, point) => sum + point.x, 0);
  const su = samples.reduce((sum, point) => sum + point.u, 0);
  const sxx = samples.reduce((sum, point) => sum + point.x * point.x, 0);
  const sxu = samples.reduce((sum, point) => sum + point.x * point.u, 0);
  const denom = n * sxx - sx * sx;
  const slope = Math.abs(denom) < 1e-14 ? 0 : (n * sxu - sx * su) / denom;
  const intercept = (su - slope * sx) / n;
  const maxError = Math.max(...samples.map((point) => Math.abs((slope * point.x + intercept) - point.u)));
  return { slope, intercept, maxError };
}

function sameActivePattern(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function mergeRegions(samples, tolerance) {
  const regions = [];
  let current = [samples[0]];
  for (let i = 1; i < samples.length; i++) {
    const candidate = [...current, samples[i]];
    const fit = fitLine(candidate);
    if (sameActivePattern(current[current.length - 1].activeAt, samples[i].activeAt) && fit.maxError <= tolerance) {
      current = candidate;
    } else {
      regions.push({ xMin: current[0].x, xMax: current[current.length - 1].x, ...fitLine(current), activeAt: current[0].activeAt });
      current = [samples[i]];
    }
  }
  regions.push({ xMin: current[0].x, xMax: current[current.length - 1].x, ...fitLine(current), activeAt: current[0].activeAt });
  return regions;
}

export function buildExplicitMPC(Ad, Bd, Q, R, horizon, constraints = {}, options = {}) {
  validateMpcModel(Ad, Bd, Q, R, horizon);
  asScalarMatrix(Ad, 'Ad');
  asScalarMatrix(Bd, 'Bd');
  asScalarMatrix(Q, 'Q');
  asScalarMatrix(R, 'R');

  const xMin = options.xMin ?? -10;
  const xMax = options.xMax ?? 10;
  const gridSize = options.gridSize ?? 121;
  const mergeTolerance = options.mergeTolerance ?? 1e-5;
  if (!Number.isInteger(gridSize) || gridSize < 3) throw new Error('Explicit MPC gridSize must be an integer >= 3');
  if (!(xMin < xMax)) throw new Error('Explicit MPC requires xMin < xMax');

  const samples = [];
  for (let i = 0; i < gridSize; i++) {
    const x = xMin + (xMax - xMin) * i / (gridSize - 1);
    const action = firstMpcActionConstrained(Ad, Bd, Q, R, horizon, [[x]], constraints, options.Qf ?? null, options);
    samples.push({
      x,
      u: action.u[0][0],
      activeAt: action.activeAt,
      converged: action.converged,
    });
  }

  const regions = mergeRegions(samples, mergeTolerance);
  return {
    type: 'explicit-mpc-scalar-pwl',
    Ad,
    Bd,
    Q,
    R,
    horizon,
    constraints,
    xDomain: [xMin, xMax],
    gridSize,
    regions,
    samples,
    maxFitError: Math.max(...regions.map((region) => region.maxError)),
    allOnlineConverged: samples.every((sample) => sample.converged),
  };
}
export function evaluateExplicitMPC(policy, x) {
  const xScalar = Array.isArray(x) ? (Array.isArray(x[0]) ? x[0][0] : x[0]) : x;
  const clippedX = Math.min(policy.xDomain[1], Math.max(policy.xDomain[0], xScalar));
  let region = policy.regions.find((candidate) => clippedX >= candidate.xMin - 1e-12 && clippedX <= candidate.xMax + 1e-12);
  if (!region) {
    region = clippedX < policy.xDomain[0] ? policy.regions[0] : policy.regions[policy.regions.length - 1];
  }
  const u = region.slope * clippedX + region.intercept;
  return {
    u: [[u]],
    x: clippedX,
    region,
    clipped: clippedX !== xScalar,
  };
}

export function simulateExplicitMPC(policy, x0, steps, options = {}) {
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('Explicit MPC steps must be a positive integer');
  const a = asScalarMatrix(policy.Ad, 'policy.Ad');
  const b = asScalarMatrix(policy.Bd, 'policy.Bd');
  const x = [[Array.isArray(x0) ? (Array.isArray(x0[0]) ? x0[0][0] : x0[0]) : x0]];
  const u = [];
  const regionLog = [];
  for (let k = 0; k < steps; k++) {
    const action = evaluateExplicitMPC(policy, x[k][0]);
    const uk = action.u[0][0];
    const disturbance = options.disturbanceFn ? options.disturbanceFn(k, x[k][0], uk) : 0;
    x.push([a * x[k][0] + b * uk + disturbance]);
    u.push([uk]);
    regionLog.push(action.region);
  }
  return {
    x,
    u,
    regionLog,
    finalStateAbs: Math.abs(x[x.length - 1][0]),
    steps,
  };
}
