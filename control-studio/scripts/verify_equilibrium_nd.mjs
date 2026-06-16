#!/usr/bin/env node
/**
 * verify_equilibrium_nd.mjs — n-dimensional equilibrium classification.
 *
 * Locks the regression where n>2 Jacobian classification previously used
 * trace(A)/n as a placeholder for every eigenvalue.
 */
import { classifyEquilibrium, findEquilibrium, scanEquilibria } from '../js/analysis/equilibrium.js';
import { phasePortrait } from '../js/analysis/phase-portrait.js';

let passed = 0;
let failed = 0;

function record(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed += 1;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertThrows(name, fn, pattern) {
  let err = null;
  try {
    fn();
  } catch (caught) {
    err = caught;
  }
  if (!err) throw new Error(`${name}: expected throw`);
  if (pattern && !pattern.test(err.message)) {
    throw new Error(`${name}: message mismatch: ${err.message}`);
  }
}

function assertRootSet(name, actual, expected, tol = 1e-6) {
  const remaining = actual.map((root) => ({ re: root.re, im: root.im }));
  for (const target of expected) {
    const idx = remaining.findIndex((root) => (
      Math.abs(root.re - target.re) <= tol && Math.abs(root.im - target.im) <= tol
    ));
    if (idx < 0) throw new Error(`${name}: missing ${JSON.stringify(target)} in ${JSON.stringify(actual)}`);
    remaining.splice(idx, 1);
  }
}

function linearField(A) {
  return (x) => A.map((row) => row.reduce((sum, value, idx) => sum + value * x[idx], 0));
}

record('3D saddle classification detects mixed real eigenvalues', () => {
  const A = [
    [-1, 0, 0],
    [0, -2, 0],
    [0, 0, 3],
  ];
  const cls = classifyEquilibrium(linearField(A), [0, 0, 0]);
  assert(cls.type === 'saddle', `expected saddle, got ${cls.type}`);
  assert(cls.stable === false, 'saddle must not be stable');
  assertRootSet('3D saddle roots', cls.eigenvalues, [
    { re: -1, im: 0 },
    { re: -2, im: 0 },
    { re: 3, im: 0 },
  ]);
});

record('4D stable node classification keeps separated real modes', () => {
  const A = [
    [-0.5, 0, 0, 0],
    [0, -1, 0, 0],
    [0, 0, -2, 0],
    [0, 0, 0, -4],
  ];
  const cls = classifyEquilibrium(linearField(A), [0, 0, 0, 0]);
  assert(cls.type === 'stable-node', `expected stable-node, got ${cls.type}`);
  assert(cls.stable === true, 'all negative real modes should be stable');
  assert(cls.stiffness > 7.9 && cls.stiffness < 8.1, `expected stiffness≈8, got ${cls.stiffness}`);
});

record('3D unstable spiral classification preserves complex pair', () => {
  const A = [
    [0.2, -2, 0],
    [2, 0.2, 0],
    [0, 0, 0.5],
  ];
  const cls = classifyEquilibrium(linearField(A), [0, 0, 0]);
  assert(cls.type === 'unstable-spiral', `expected unstable-spiral, got ${cls.type}`);
  assert(cls.stable === false, 'positive real parts should be unstable');
  assert(cls.eigenvalues.some((root) => Math.abs(root.im) > 1.9), 'expected complex conjugate pair');
});

record('findEquilibrium works with 3D affine nonlinear field', () => {
  const f = (x) => [
    -2 * (x[0] - 1),
    -3 * (x[1] + 2),
    -4 * (x[2] - 0.5),
  ];
  const eq = findEquilibrium(f, [10, -10, 5]);
  assert(eq.converged, `Newton solver did not converge, residual=${eq.residual}`);
  assert(Math.abs(eq.x[0] - 1) < 1e-8, `x0=${eq.x[0]}`);
  assert(Math.abs(eq.x[1] + 2) < 1e-8, `x1=${eq.x[1]}`);
  assert(Math.abs(eq.x[2] - 0.5) < 1e-8, `x2=${eq.x[2]}`);
});

record('scanEquilibria gridSize=1 uses finite center seed', () => {
  const f = (x) => [
    -2 * (x[0] - 2),
    -3 * (x[1] + 1),
  ];
  const equilibria = scanEquilibria(f, [[0, 4], [-2, 0]], { gridSize: 1, tol: 1e-7 });
  assert(equilibria.length === 1, `expected one equilibrium, got ${equilibria.length}`);
  assert(Math.abs(equilibria[0].x[0] - 2) < 1e-8, `x0=${equilibria[0].x[0]}`);
  assert(Math.abs(equilibria[0].x[1] + 1) < 1e-8, `x1=${equilibria[0].x[1]}`);
});

record('phasePortrait gridSize=1 uses finite center trajectory', () => {
  const portrait = phasePortrait((x) => [-x[0], -2 * x[1]], {
    x1Min: -1,
    x1Max: 1,
    x2Min: -2,
    x2Max: 2,
    gridSize: 1,
    tMax: 0.2,
    dt: 0.1,
  });
  assert(portrait.trajectories.length === 1, `expected one trajectory, got ${portrait.trajectories.length}`);
  const traj = portrait.trajectories[0];
  assert(traj.x1.every(Number.isFinite), `non-finite x1 trajectory: ${traj.x1}`);
  assert(traj.x2.every(Number.isFinite), `non-finite x2 trajectory: ${traj.x2}`);
  assert(Math.abs(traj.x1[0]) < 1e-12 && Math.abs(traj.x2[0]) < 1e-12, 'single seed should be bounds center');
});

record('nonlinear grid APIs reject invalid gridSize', () => {
  assertThrows('scanEquilibria gridSize=0', () => scanEquilibria((x) => x, [[-1, 1]], { gridSize: 0 }), /gridSize/);
  assertThrows('phasePortrait gridSize=0', () => phasePortrait((x) => x, { gridSize: 0 }), /gridSize/);
});

console.log(`Equilibrium n-D verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
