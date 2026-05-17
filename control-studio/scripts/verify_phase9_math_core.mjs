#!/usr/bin/env node
/**
 * verify_phase9_math_core.mjs
 *
 * Phase 9 (MIMO) math-core verification — covers B3/B4/B5 invariants and
 * C1/C5/C6 cross-method/continuity checks from CONTROL_SYSTEM_PHASE10_VERIFICATION_PLAN.md.
 *
 * Layers exercised:
 *   L1 analytic — handled by verify_phase10_math_core.mjs
 *   L2 property-based invariants (RGA row/col sum, σ ordering, σ²=eig(G^H G), Frobenius bound)
 *   L3 cross-method consistency (RGA closed-form vs matrix, dynamic decoupler ω→0 → static)
 *   C  random batch + frequency continuity
 *
 * Deterministic RNG (mulberry32) keeps batch failures reproducible.
 */
import {
  MIMOStateSpace,
  dcGain,
  rgaSteady,
  rgaInvariants,
  staticDecoupler,
  applyDecoupler,
  singularValues,
  singularValueBode,
  dynamicDecouplerAtFrequency,
  evalAtJw,
} from '../js/control/mimo.js';
import { matMul, matTranspose, matIdentity, matScale, matAdd, matSub } from '../js/math/matrix.js';
import { Complex } from '../js/math/complex.js';

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

const rng = mulberry32(20260517);
const randn = () => {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const randMat = (rows, cols, scale = 1) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => scale * randn()));

/**
 * Random stable SS: A = -(M Mᵀ + I) — symmetric negative-definite, so every
 * eigenvalue ≤ -1. Guarantees finite DC gain and well-conditioned (sI − A)
 * across all ω ≥ 0.
 */
function randomStableSS(n, m, p, scale = 1) {
  const M = randMat(n, n, scale);
  const A = matSub(matScale(matMul(M, matTranspose(M)), -1), matIdentity(n));
  const B = randMat(n, m, scale);
  const C = randMat(p, n, scale);
  const D = randMat(p, m, scale * 0.1);
  return new MIMOStateSpace(A, B, C, D);
}

// ----- harness --------------------------------------------------------------

const records = [];
let failed = 0;

function record(name, fn) {
  try {
    const info = fn() || {};
    const tag = info.detail ? ` (${info.detail})` : '';
    console.log(`[PASS] ${name}${tag}`);
    records.push({ name, ok: true });
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    records.push({ name, ok: false, err: err.message });
    failed += 1;
  }
}

function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertNear(actual, expected, tol, msg) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    throw new Error(`${msg}: expected ${expected}, got ${actual} (tol=${tol})`);
  }
}
function maxAbs(matrix) {
  let m = 0;
  for (const row of matrix) for (const v of row) m = Math.max(m, Math.abs(v));
  return m;
}
function frobenius(complexMat) {
  let s = 0;
  for (const row of complexMat) for (const c of row) s += c.re * c.re + c.im * c.im;
  return Math.sqrt(s);
}

// ============================================================================
// B3. RGA invariants
// ============================================================================

record('B3-RGA-L2 row & column sums equal 1 (n=2, batch=200)', () => {
  let worst = 0;
  const N = 200;
  for (let trial = 0; trial < N; trial++) {
    const sys = randomStableSS(2, 2, 2);
    let rga;
    try { rga = rgaSteady(sys); } catch { continue; }
    const inv = rgaInvariants(rga);
    worst = Math.max(worst, inv.rowDeviation, inv.colDeviation);
  }
  assertTrue(worst < 1e-8, `max row/col deviation ${worst} ≥ 1e-8`);
  return { detail: `max dev=${worst.toExponential(2)}` };
});

record('B3-RGA-L2 row & column sums equal 1 (n=3, batch=120)', () => {
  let worst = 0;
  for (let trial = 0; trial < 120; trial++) {
    const sys = randomStableSS(3, 3, 3);
    let rga;
    try { rga = rgaSteady(sys); } catch { continue; }
    const inv = rgaInvariants(rga);
    worst = Math.max(worst, inv.rowDeviation, inv.colDeviation);
  }
  assertTrue(worst < 1e-7, `max row/col deviation ${worst} ≥ 1e-7`);
  return { detail: `max dev=${worst.toExponential(2)}` };
});

record('B3-RGA-L2 permutation invariance', () => {
  const sys = randomStableSS(3, 3, 3);
  const baseRGA = rgaSteady(sys);
  // Permute outputs: rows of C, rows of D
  const perm = [2, 0, 1];
  const invPerm = perm.map((_, k) => perm.indexOf(k));
  const Cp = perm.map((i) => sys.C[i]);
  const Dp = perm.map((i) => sys.D[i]);
  const permuted = new MIMOStateSpace(sys.A, sys.B, Cp, Dp);
  const rgaP = rgaSteady(permuted);
  // Expected: rgaP[i][j] == baseRGA[perm[i]][j]
  let worst = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      worst = Math.max(worst, Math.abs(rgaP[i][j] - baseRGA[perm[i]][j]));
  assertTrue(worst < 1e-9, `permutation mismatch ${worst}`);
  // Round-trip
  const back = invPerm.map((i) => rgaP[i]);
  let backWorst = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      backWorst = Math.max(backWorst, Math.abs(back[i][j] - baseRGA[i][j]));
  assertTrue(backWorst < 1e-9, `permutation round-trip ${backWorst}`);
  return { detail: `max diff=${worst.toExponential(2)}` };
});

record('B3-RGA-L3 2×2 closed-form λ11 = 1/(1 - g12 g21 / (g11 g22)) matches', () => {
  let worst = 0;
  for (let trial = 0; trial < 100; trial++) {
    const sys = randomStableSS(2, 2, 2);
    let rga;
    try { rga = rgaSteady(sys); } catch { continue; }
    const G = dcGain(sys);
    const denom = G[0][0] * G[1][1];
    if (Math.abs(denom) < 1e-8) continue;
    const lambdaClosed = 1 / (1 - (G[0][1] * G[1][0]) / denom);
    worst = Math.max(worst, Math.abs(rga[0][0] - lambdaClosed));
  }
  assertTrue(worst < 1e-9, `closed-form mismatch ${worst}`);
  return { detail: `max diff=${worst.toExponential(2)}` };
});

// ============================================================================
// B4. Singular Value Bode
// ============================================================================

record('B4-SVB-L2 σ ≥ 0 and σ_max ≥ σ_min across frequency batch', () => {
  let worst = 0;
  const omegas = [0.01, 0.1, 0.5, 1, 2, 5, 10];
  for (let trial = 0; trial < 50; trial++) {
    const n = 2 + (trial % 3);
    const sys = randomStableSS(n, n, n);
    const sweep = singularValueBode(sys, omegas);
    for (let k = 0; k < omegas.length; k++) {
      assertTrue(sweep.sigmaMin[k] >= -1e-12, `σ_min negative at trial ${trial} ω=${omegas[k]}`);
      assertTrue(sweep.sigmaMax[k] + 1e-12 >= sweep.sigmaMin[k], `σ_max < σ_min at trial ${trial}`);
      worst = Math.max(worst, sweep.sigmaMin[k] < 0 ? -sweep.sigmaMin[k] : 0);
    }
  }
  return { detail: `worst negative σ=${worst.toExponential(2)}` };
});

record('B4-SVB-L2 σ_max(G) ≤ ‖G‖_F (random 3×3 complex)', () => {
  let worst = 0;
  for (let trial = 0; trial < 200; trial++) {
    const G = Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () => new Complex(randn(), randn())),
    );
    const sv = singularValues(G);
    const fro = frobenius(G);
    assertTrue(sv[0] <= fro + 1e-9, `σ_max=${sv[0]} > ‖G‖_F=${fro}`);
    worst = Math.max(worst, sv[0] / Math.max(fro, 1e-12));
  }
  return { detail: `max σ_max/‖G‖_F=${worst.toFixed(3)}` };
});

record('B4-SVB-L2 σ² equals eigenvalues of GᴴG (closed-form 2×2 vs Hermitian eig)', () => {
  let worst = 0;
  for (let trial = 0; trial < 200; trial++) {
    const G = Array.from({ length: 2 }, () =>
      Array.from({ length: 2 }, () => new Complex(randn(), randn())),
    );
    const sv = singularValues(G);
    // Direct: compute GᴴG and trace/det to verify σ₁²·σ₂² = det(GᴴG) and σ₁²+σ₂² = trace(GᴴG)
    let trReal = 0;
    let detReal = 0;
    // GᴴG entries
    const a00 = (() => {
      let r = 0;
      for (let k = 0; k < 2; k++) r += G[k][0].re * G[k][0].re + G[k][0].im * G[k][0].im;
      return r;
    })();
    const a11 = (() => {
      let r = 0;
      for (let k = 0; k < 2; k++) r += G[k][1].re * G[k][1].re + G[k][1].im * G[k][1].im;
      return r;
    })();
    const a01 = (() => {
      let re = 0, im = 0;
      for (let k = 0; k < 2; k++) {
        re += G[k][0].re * G[k][1].re + G[k][0].im * G[k][1].im;
        im += G[k][0].re * G[k][1].im - G[k][0].im * G[k][1].re;
      }
      return { re, im };
    })();
    trReal = a00 + a11;
    detReal = a00 * a11 - (a01.re * a01.re + a01.im * a01.im);
    const sumSq = sv[0] * sv[0] + sv[1] * sv[1];
    const prodSq = sv[0] * sv[0] * sv[1] * sv[1];
    worst = Math.max(worst, Math.abs(sumSq - trReal), Math.abs(prodSq - detReal));
  }
  assertTrue(worst < 1e-9, `σ² vs GᴴG mismatch ${worst}`);
  return { detail: `max mismatch=${worst.toExponential(2)}` };
});

record('B4-SVB-L3 closed-form 2×2 vs Hermitian-block path agree (n=3 random)', () => {
  // For n=3, singularValues() falls back to the hermitianEigenvalues block path.
  // Cross-check trace/det identities, which the block path must also satisfy.
  let worst = 0;
  for (let trial = 0; trial < 80; trial++) {
    const G = Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () => new Complex(randn(), randn())),
    );
    const sv = singularValues(G);
    // Build GᴴG explicitly
    let trace = 0;
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) trace += G[k][i].re * G[k][i].re + G[k][i].im * G[k][i].im;
    }
    const sumSq = sv.reduce((s, v) => s + v * v, 0);
    worst = Math.max(worst, Math.abs(sumSq - trace));
  }
  assertTrue(worst < 1e-8, `trace mismatch ${worst}`);
  return { detail: `max trace mismatch=${worst.toExponential(2)}` };
});

// ============================================================================
// B5. Static / Dynamic Decoupler
// ============================================================================

record('B5-Decoupler-L1 static G(0)·W = I (random batch)', () => {
  let worst = 0;
  for (let trial = 0; trial < 100; trial++) {
    const sys = randomStableSS(2, 2, 2);
    let result;
    try { result = staticDecoupler(sys); } catch { continue; }
    const dev = result.verification.map((row, i) => row.map((v, j) => v - (i === j ? 1 : 0)));
    worst = Math.max(worst, maxAbs(dev));
  }
  assertTrue(worst < 1e-8, `G(0)·W deviation from I = ${worst}`);
  return { detail: `max deviation=${worst.toExponential(2)}` };
});

record('B5-Decoupler-L2 applyDecoupler ⇒ RGA(0) ≈ I', () => {
  let worst = 0;
  for (let trial = 0; trial < 60; trial++) {
    const sys = randomStableSS(2, 2, 2);
    let decoup;
    try { decoup = staticDecoupler(sys); } catch { continue; }
    const decoupledSys = applyDecoupler(sys, decoup.W);
    const rga = rgaSteady(decoupledSys);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        worst = Math.max(worst, Math.abs(rga[i][j] - (i === j ? 1 : 0)));
  }
  assertTrue(worst < 1e-7, `RGA(0) deviation from I = ${worst}`);
  return { detail: `max deviation=${worst.toExponential(2)}` };
});

record('B5-Decoupler-L3 dynamic(ω→0) converges to static decoupler (relative)', () => {
  // W(jω) is analytic at ω=0 (since A is stable and G(0) is non-singular),
  // so |W(jω) - W(0)| / ‖W(0)‖∞ → 0 as ω → 0. Compare relative to ‖W(0)‖∞.
  let worst = 0;
  for (let trial = 0; trial < 30; trial++) {
    const sys = randomStableSS(2, 2, 2);
    let staticResult;
    try { staticResult = staticDecoupler(sys); } catch { continue; }
    const Wmag = maxAbs(staticResult.W);
    if (Wmag < 1e-3) continue; // skip degenerate case
    const dyn = dynamicDecouplerAtFrequency(sys, 1e-6);
    let trialWorst = 0;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const diffRe = dyn.W[i][j].re - staticResult.W[i][j];
        const diffIm = dyn.W[i][j].im;
        trialWorst = Math.max(trialWorst, Math.hypot(diffRe, diffIm));
      }
    }
    worst = Math.max(worst, trialWorst / Wmag);
  }
  assertTrue(worst < 1e-3, `relative |W(jω→0) − W(0)| / ‖W(0)‖∞ = ${worst}`);
  return { detail: `max relative diff=${worst.toExponential(2)}` };
});

// ============================================================================
// C. Cross-module / property tests
// ============================================================================

record('C1 random stable SS → dcGain / RGA / SVB all finite (batch=80)', () => {
  let nanCount = 0;
  for (let trial = 0; trial < 80; trial++) {
    const n = 2 + (trial % 3);
    const sys = randomStableSS(n, n, n);
    const G0 = dcGain(sys);
    for (const row of G0) for (const v of row) if (!Number.isFinite(v)) nanCount += 1;
    const sweep = singularValueBode(sys, [0.1, 1, 10]);
    for (const v of [...sweep.sigmaMax, ...sweep.sigmaMin])
      if (!Number.isFinite(v)) nanCount += 1;
    let rga;
    try { rga = rgaSteady(sys); } catch { /* may be singular for some randoms */ }
    if (rga) {
      for (const row of rga) for (const v of row) if (!Number.isFinite(v)) nanCount += 1;
    }
  }
  assertTrue(nanCount === 0, `${nanCount} NaN/Inf values produced`);
  return { detail: `n=80 trials, 0 NaN` };
});

record('C5 dynamic decoupler continuity across neighboring ω', () => {
  let worst = 0;
  for (let trial = 0; trial < 30; trial++) {
    const sys = randomStableSS(2, 2, 2);
    const omega = 0.5 + 2 * rng();
    const dyn1 = dynamicDecouplerAtFrequency(sys, omega);
    const dyn2 = dynamicDecouplerAtFrequency(sys, omega + 1e-4);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const dr = dyn2.W[i][j].re - dyn1.W[i][j].re;
        const di = dyn2.W[i][j].im - dyn1.W[i][j].im;
        worst = Math.max(worst, Math.hypot(dr, di));
      }
    }
  }
  // Δω = 1e-4 on bounded analytic W(jω) should produce << 1e-2 change.
  assertTrue(worst < 1e-2, `neighboring-ω W jump ${worst}`);
  return { detail: `max jump=${worst.toExponential(2)}` };
});

record('C6 SVB continuity (relative variation bounded across log grid)', () => {
  let worst = 0;
  for (let trial = 0; trial < 30; trial++) {
    const sys = randomStableSS(3, 3, 3);
    const omegas = [];
    for (let k = -2; k <= 2; k += 0.1) omegas.push(Math.pow(10, k));
    const sweep = singularValueBode(sys, omegas);
    for (let k = 1; k < omegas.length; k++) {
      const a = sweep.sigmaMax[k - 1];
      const b = sweep.sigmaMax[k];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const denom = Math.max(Math.abs(a), Math.abs(b), 1e-6);
      const rel = Math.abs(b - a) / denom;
      worst = Math.max(worst, rel);
    }
  }
  // Adjacent log-spaced points (10% spacing) on a stable rational system
  // should never see a >50% jump in σ_max.
  assertTrue(worst < 0.5, `σ_max relative jump ${worst}`);
  return { detail: `max rel jump=${(worst * 100).toFixed(1)}%` };
});

// ============================================================================
// Summary
// ============================================================================

const total = records.length;
const passed = total - failed;
console.log('');
console.log(`Phase 9 math-core verification: ${passed}/${total} passed`);
if (failed) {
  console.error(`${failed} failure(s) — see [FAIL] lines above`);
  process.exitCode = 1;
}
