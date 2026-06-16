// phase-portrait.js — 2D phase portraits and describing functions for nonlinear analysis.

function rk4Step(f, x, h) {
  const k1 = f(x);
  const k2 = f(x.map((v, i) => v + h / 2 * k1[i]));
  const k3 = f(x.map((v, i) => v + h / 2 * k2[i]));
  const k4 = f(x.map((v, i) => v + h * k3[i]));
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/**
 * Build a phase portrait for the autonomous 2D system  ẋ = f(x).
 *
 * @param {(x:number[]) => number[]} f - velocity field, returns [dx1/dt, dx2/dt]
 * @param {Object} opts
 * @param {number} opts.x1Min, x1Max, x2Min, x2Max - viewport bounds
 * @param {number} opts.gridSize - number of trajectory seeds per axis (default 8)
 * @param {number} opts.tMax - integration horizon (default 10)
 * @param {number} opts.dt - integration step (default 0.05)
 * @returns {{ trajectories: number[][][], vectorField: { x1, x2, dx1, dx2 } }}
 *   trajectories: array of [t, x1, x2] sequences
 */
export function phasePortrait(f, opts = {}) {
  const { x1Min = -3, x1Max = 3, x2Min = -3, x2Max = 3, gridSize = 8, tMax = 10, dt = 0.05 } = opts;
  if (!Number.isInteger(gridSize) || gridSize < 1) {
    throw new Error('phasePortrait gridSize must be an integer >= 1');
  }
  if (![x1Min, x1Max, x2Min, x2Max].every(Number.isFinite) || x1Max < x1Min || x2Max < x2Min) {
    throw new Error('phasePortrait bounds must be finite with max >= min');
  }
  if (!(tMax > 0) || !(dt > 0)) {
    throw new Error('phasePortrait tMax and dt must be positive');
  }
  const trajectories = [];

  // Trajectories from a grid of initial conditions
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const x0 = [
        _gridValue(x1Min, x1Max, i, gridSize),
        _gridValue(x2Min, x2Max, j, gridSize),
      ];
      const traj = integrateTrajectory(f, x0, tMax, dt, { x1Min, x1Max, x2Min, x2Max });
      if (traj.x1.length > 2) trajectories.push(traj);
    }
  }

  // Vector field (arrows on a coarser grid)
  const fieldN = 12;
  const x1Arr = [], x2Arr = [], dx1Arr = [], dx2Arr = [];
  for (let i = 0; i < fieldN; i++) {
    for (let j = 0; j < fieldN; j++) {
      const x = [
        x1Min + (i / (fieldN - 1)) * (x1Max - x1Min),
        x2Min + (j / (fieldN - 1)) * (x2Max - x2Min),
      ];
      const dx = f(x);
      x1Arr.push(x[0]); x2Arr.push(x[1]);
      dx1Arr.push(dx[0]); dx2Arr.push(dx[1]);
    }
  }
  return { trajectories, vectorField: { x1: x1Arr, x2: x2Arr, dx1: dx1Arr, dx2: dx2Arr } };
}

function _gridValue(min, max, idx, count) {
  return count === 1 ? (min + max) / 2 : min + (idx / (count - 1)) * (max - min);
}

function integrateTrajectory(f, x0, tMax, dt, bounds) {
  const x1 = [x0[0]], x2 = [x0[1]];
  let x = x0.slice();
  for (let t = dt; t <= tMax; t += dt) {
    const xNext = rk4Step(f, x, dt);
    if (!xNext.every(Number.isFinite)) break;
    if (Math.hypot(xNext[0], xNext[1]) > 1e4) break;
    if (xNext[0] < bounds.x1Min - 1 || xNext[0] > bounds.x1Max + 1
     || xNext[1] < bounds.x2Min - 1 || xNext[1] > bounds.x2Max + 1) break;
    x = xNext;
    x1.push(x[0]); x2.push(x[1]);
  }
  return { t: x1.map((_, i) => i * dt), x1, x2 };
}

/**
 * Build a 2D state-space velocity field from a linear system:  ẋ = A x + B u(t),  u≡0.
 */
export function linearVelocityField(A) {
  if (!A || A.length !== 2 || A[0].length !== 2) throw new Error('linearVelocityField needs a 2×2 A matrix');
  return (x) => [
    A[0][0] * x[0] + A[0][1] * x[1],
    A[1][0] * x[0] + A[1][1] * x[1],
  ];
}

/**
 * Describing function N(A) of common nonlinearities, returning the equivalent
 * complex gain as a function of input amplitude A.
 * Useful for predicting limit cycles via 1 + N(A)·G(jω) = 0.
 *
 * type: 'saturation' | 'relay' | 'deadzone'
 */
export function describingFunction(type, params = {}) {
  if (type === 'saturation') {
    const D = params.limit ?? 1;
    return (A) => {
      if (A <= D) return 1;
      const r = D / A;
      // N(A) = (2/π)(asin(r) + r·sqrt(1−r²))
      return (2 / Math.PI) * (Math.asin(r) + r * Math.sqrt(1 - r * r));
    };
  }
  if (type === 'relay') {
    const M = params.amplitude ?? 1;
    // N(A) = 4M / (π A)
    return (A) => (4 * M) / (Math.PI * A);
  }
  if (type === 'deadzone') {
    const delta = params.threshold ?? 0.5;
    return (A) => {
      if (A <= delta) return 0;
      const r = delta / A;
      return 1 - (2 / Math.PI) * (Math.asin(r) + r * Math.sqrt(1 - r * r));
    };
  }
  throw new Error(`Unknown describing function type: ${type}`);
}
