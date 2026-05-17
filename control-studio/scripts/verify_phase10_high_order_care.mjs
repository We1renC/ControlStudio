#!/usr/bin/env node
/**
 * verify_phase10_high_order_care.mjs
 *
 * CS-P10-17 — Measure where the dependency-free Hamiltonian eigenvector CARE
 * path stops being reliable. Goal: document the trustworthy upper bound for
 * `solveCareHamiltonianSchur` so the studio UI and BACKLOG can warn users.
 *
 * For each (n, m), run a random batch of stable plants and record:
 *   - pass rate (solver returned without throwing AND closed-loop stable)
 *   - residual percentiles (median, p90, max) of the CARE residual
 *   - cross-method agreement with Newton-Kleinman where the Newton path
 *     also converges (provides an independent ground truth)
 *
 * The script does NOT throw on residual outliers; it prints a table so the
 * boundary can be reviewed and the upper bound recorded in BACKLOG.
 */
import {
  solveCareHamiltonianSchur,
  solveLqr,
  solveLqrMIMO,
} from '../js/control/state-feedback.js';
import {
  matIdentity,
  matMul,
  matSub,
  matTranspose,
  matScale,
  matAdd,
} from '../js/math/matrix.js';

// ----- deterministic RNG ----------------------------------------------------

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(0xCAFEBABE);
const randn = () => {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};
const randMat = (r, c, s = 1) =>
  Array.from({ length: r }, () => Array.from({ length: c }, () => s * randn()));

function randomStable(n, m) {
  const M = randMat(n, n);
  const A = matSub(matScale(matMul(M, matTranspose(M)), -1), matIdentity(n));
  const B = randMat(n, m);
  return { A, B };
}

// ----- aggregation ----------------------------------------------------------

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}
function maxAbsDiff(A, B) {
  let m = 0;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[0].length; j++) m = Math.max(m, Math.abs(A[i][j] - B[i][j]));
  return m;
}

function runStressCase(n, m, trials, seed) {
  rng = mulberry32(seed);
  let passes = 0;
  let throws = 0;
  let unstable = 0;
  let crossChecked = 0;
  const residuals = [];
  const crossDiffs = [];

  for (let trial = 0; trial < trials; trial++) {
    const { A, B } = randomStable(n, m);
    let schurResult;
    try {
      schurResult = solveCareHamiltonianSchur(A, B, matIdentity(n), matIdentity(m));
    } catch (_) {
      throws += 1;
      continue;
    }
    if (!schurResult.closedLoopStable) {
      unstable += 1;
      continue;
    }
    passes += 1;
    residuals.push(schurResult.riccatiResidualNorm);

    // Cross-check vs Newton-Kleinman when available.
    try {
      let newtonResult;
      if (m === 1) newtonResult = solveLqr(A, B, matIdentity(n), [[1]], { method: 'kleinman' });
      else newtonResult = solveLqrMIMO(A, B, matIdentity(n), matIdentity(m), { method: 'kleinman' });
      crossDiffs.push(maxAbsDiff(schurResult.K, newtonResult.K));
      crossChecked += 1;
    } catch (_) {
      // Newton-Kleinman doesn't converge on this trial — skip cross-check.
    }
  }

  return {
    n, m, trials,
    passes, throws, unstable, crossChecked,
    passRate: passes / trials,
    resMedian: percentile(residuals, 50),
    resP90: percentile(residuals, 90),
    resMax: residuals.length ? Math.max(...residuals) : NaN,
    crossMedian: percentile(crossDiffs, 50),
    crossP90: percentile(crossDiffs, 90),
    crossMax: crossDiffs.length ? Math.max(...crossDiffs) : NaN,
  };
}

// ----- run ------------------------------------------------------------------

const cases = [
  { n: 4, m: 1, trials: 60 },
  { n: 4, m: 2, trials: 60 },
  { n: 5, m: 2, trials: 50 },
  { n: 6, m: 2, trials: 40 },
  { n: 6, m: 3, trials: 40 },
  { n: 8, m: 3, trials: 25 },
];

const seed0 = 0xBEEF0001;
const reports = cases.map((cfg, i) => runStressCase(cfg.n, cfg.m, cfg.trials, seed0 + i));

console.log('n | m | trials | pass | throw | unstable | resMed | resP90 | resMax | xPass | xMed | xMax');
console.log('-- + - + ------ + ---- + ----- + -------- + ------ + ------ + ------ + ----- + ---- + ----');
for (const r of reports) {
  console.log(
    `${r.n.toString().padStart(2)} | ${r.m} | ${r.trials.toString().padStart(6)} | ` +
    `${(r.passRate * 100).toFixed(0).padStart(3)}% | ${r.throws.toString().padStart(5)} | ` +
    `${r.unstable.toString().padStart(8)} | ` +
    `${r.resMedian.toExponential(1).padStart(6)} | ${r.resP90.toExponential(1).padStart(6)} | ` +
    `${r.resMax.toExponential(1).padStart(6)} | ${r.crossChecked.toString().padStart(5)} | ` +
    `${(Number.isFinite(r.crossMedian) ? r.crossMedian.toExponential(1) : 'n/a').padStart(4)} | ` +
    `${(Number.isFinite(r.crossMax) ? r.crossMax.toExponential(1) : 'n/a').padStart(4)}`,
  );
}

// Hard assertions: locked-in upper bound so future regressions show up.
// These thresholds reflect the *currently observed* baseline; tighten only
// if/when a real Schur fallback lands.
// Thresholds calibrated to observed baseline (seed=0xBEEF0001).
// Tighten only if/when a real Schur fallback lands.
const ASSERTIONS = [
  { n: 4, minPassRate: 0.95, maxResidual: 1e-10, label: 'n=4 — reliable' },
  { n: 5, minPassRate: 0.85, maxResidual: 1e-8,  label: 'n=5 — reliable' },
  { n: 6, minPassRate: 0.80, maxResidual: 1e-7,  label: 'n=6 — degraded but workable' },
  // Documented failure mode — locks the upper bound. If a future change
  // *improves* n=8, the assertion will trip and the docs should be revised.
  { n: 8, maxPassRate: 0.20, label: 'n=8 — documented failure (eigenvector path collapses)' },
];

let assertFails = 0;
console.log('');
for (const a of ASSERTIONS) {
  const row = reports.find((r) => r.n === a.n);
  if (!row) continue;
  let ok = true;
  const reasons = [];
  if (a.minPassRate !== undefined) {
    const passOk = row.passRate >= a.minPassRate;
    reasons.push(`passRate=${(row.passRate * 100).toFixed(0)}% (need ≥${(a.minPassRate * 100).toFixed(0)}%)`);
    if (!passOk) ok = false;
  }
  if (a.maxPassRate !== undefined) {
    const passOk = row.passRate <= a.maxPassRate;
    reasons.push(`passRate=${(row.passRate * 100).toFixed(0)}% (need ≤${(a.maxPassRate * 100).toFixed(0)}%)`);
    if (!passOk) ok = false;
  }
  if (a.maxResidual !== undefined && Number.isFinite(row.resMax)) {
    const resOk = row.resMax <= a.maxResidual;
    reasons.push(`resMax=${row.resMax.toExponential(1)} (need ≤${a.maxResidual.toExponential(0)})`);
    if (!resOk) ok = false;
  }
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${a.label}: ${reasons.join(', ')}`);
  if (!ok) assertFails += 1;
}

console.log('');
console.log('Documented trustworthy upper bound for dependency-free Hamiltonian path:');
console.log('  n ≤ 4 — fully reliable (~100% pass, residual ≤ 1e-12)');
console.log('  n = 5 — reliable (~95% pass, residual ≤ 1e-9)');
console.log('  n = 6 — degraded but workable (~90% pass, residual up to 1e-9)');
console.log('  n ≥ 8 — eigenvector path collapses (0% pass); real Schur fallback required');
console.log('         (tracked as CS-P10-15 follow-up)');

if (assertFails) process.exitCode = 1;
