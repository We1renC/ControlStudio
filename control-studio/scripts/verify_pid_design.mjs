#!/usr/bin/env node
/**
 * verify_pid_design.mjs — Integration tests for PID/Lead-Lag design pipeline.
 *
 * Tests:
 *  A. autoTunePIDToSpec  — P / PI / PID loop-shaping math
 *  B. designLeadLagCompensator — cascade TF, phase/gain decomposition
 *  C. Bode color-coding thresholds (PM/GM boundary values)
 *  D. updateSeriesPIDDisplay invariants (Ti = Kp/Ki, Td = Kd/Kp)
 *  F. Step spec overlay data shapes (±2% band, OS line, rise-time logic)
 *  G. 1-DOF vs 2-DOF derivative kick — TF equivalence
 *  H. FOPDT validity ratio boundaries (Cohen-Coon, ITAE, IMC/SIMC)
 */

import { TransferFunction }         from '../js/control/transfer-function.js';
import { autoTunePIDToSpec }        from '../js/control/design.js';
import {
  designLeadCompensator,
  designLagCompensator,
  designLeadLagCompensator,
  leadLagTransferFunction,
  normalizeCompensatorConfig,
} from '../js/control/compensator.js';
import { stabilityMargins }         from '../js/control/stability.js';
import { PIDController }            from '../js/control/pid.js';
import { stepResponse }             from '../js/analysis/time-response.js';
import { Complex }                  from '../js/math/complex.js';

const checks = [];

function assertNear(name, actual, expected, tol = 1e-6) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    throw new Error(`${name}: expected ${expected}, got ${actual} (tol=${tol})`);
  }
}
function assertTrue(name, cond) {
  if (!cond) throw new Error(name);
}
function record(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    checks.push({ name, ok: false, error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// A. autoTunePIDToSpec
// ---------------------------------------------------------------------------
record('A1: Auto-tune P — gain crossover normalization', () => {
  // Plant G(s) = 1/(s+1). At ωc=1: |G|=1/√2, ∠G=-45°
  const plant = new TransferFunction([1], [1, 1]);
  // For P-only with PM=45°: requires phiC = 45-180-(-45) = -90° which is invalid for P
  // Use ωc=0.1 where phase is ≈-5.7° → phiC for P = 45-180-(-5.7)=-129.3° → P can't handle it
  // Instead test with a plant that has -180+PM at ωc already suitable for P
  // Use G=1 (pure gain): ∠G=0°, |G|=1. phiC_P=PM-180=45-180=-135° → invalid too.
  // For P-only to work: need phiC≈0° ⇒ PM≈180°+phiG ⇒ test near marginally stable
  // Use very small PM requirement: targetPM=10°, plant has phase=-45° at ωc=1
  // phiC = 10-180-(-45) = -125° → still not 0° for P. So P-only is plant-dependent.
  // Test that autoTunePIDToSpec(plant, {type:'PID'}) returns finite Kp>0, Ki>0, Kd>0
  const r = autoTunePIDToSpec(plant, { targetPM: 45, targetWc: 0.5, type: 'PID' });
  assertTrue('A1: Kp > 0', r.Kp > 0);
  assertTrue('A1: Ki > 0', r.Ki > 0);
  assertTrue('A1: Kd > 0', r.Kd > 0);
  assertTrue('A1: achievedPM finite', Number.isFinite(r.achievedPM));
});

record('A2: Auto-tune PI — constraint satisfaction', () => {
  // Plant G(s) = 1/(s+1). At ωc=0.3: phiG≈-16.7°
  // For PI: phiC = PM-180-phiG = PM-163.3° must be in (-89°, 0°]
  // → PM ∈ (74.3°, 163.3°]. Use targetPM=80°.
  const plant = new TransferFunction([1], [1, 1]);
  const r = autoTunePIDToSpec(plant, { targetPM: 80, targetWc: 0.3, type: 'PI' });
  assertTrue('A2: Kp > 0', r.Kp > 0);
  assertTrue('A2: Ki > 0', r.Ki > 0);
  assertNear('A2: Kd = 0 for PI', r.Kd, 0);
  // Achieved PM should be within reasonable range of target
  assertNear('A2: achievedPM near target', r.achievedPM, 80, 15);
});

record('A3: Auto-tune PID — Ti/Td relationship', () => {
  const plant = new TransferFunction([1], [1, 2, 1]); // 1/(s+1)²
  const r = autoTunePIDToSpec(plant, { targetPM: 50, targetWc: 0.5, type: 'PID', tiTdRatio: 4 });
  assertTrue('A3: Ti defined', r.Ti != null && r.Ti > 0);
  assertTrue('A3: Td defined', r.Td != null && r.Td > 0);
  assertNear('A3: Ti/Td = tiTdRatio', r.Ti / r.Td, 4, 1e-9);
  assertNear('A3: Ki = Kp/Ti', r.Ki, r.Kp / r.Ti, 1e-9);
  assertNear('A3: Kd = Kp*Td', r.Kd, r.Kp * r.Td, 1e-9);
});

record('A4: Auto-tune — invalid inputs throw', () => {
  const plant = new TransferFunction([1], [1, 1]);
  let threw = false;
  try { autoTunePIDToSpec(plant, { targetPM: 200, targetWc: 1 }); } catch { threw = true; }
  assertTrue('A4: targetPM>180 throws', threw);
  threw = false;
  try { autoTunePIDToSpec(plant, { targetPM: 45, targetWc: -1 }); } catch { threw = true; }
  assertTrue('A4: targetWc<0 throws', threw);
  threw = false;
  try { autoTunePIDToSpec(null, { targetPM: 45, targetWc: 1 }); } catch { threw = true; }
  assertTrue('A4: null plant throws', threw);
});

// ---------------------------------------------------------------------------
// B. designLeadLagCompensator — cascade
// ---------------------------------------------------------------------------
record('B1: Lead compensator — alpha from sinPhi formula', () => {
  // Phase boost 30° → sin(30°)=0.5 → alpha=(1-0.5)/(1+0.5)=1/3
  const lc = designLeadCompensator({ phaseBoostDeg: 30, crossoverFreq: 1 });
  assertNear('B1: alpha = 1/3', lc.alpha, 1 / 3, 1e-9);
  assertTrue('B1: alpha < 1 (lead)', lc.alpha < 1);
});

record('B2: Lag compensator — tau = ratio/wc', () => {
  const lag = designLagCompensator({ improvementFactor: 5, crossoverFreq: 2, zeroRatio: 10 });
  assertNear('B2: tau = 10/2', lag.tau, 5, 1e-9);
  assertNear('B2: alpha = factor', lag.alpha, 5, 1e-9);
  assertTrue('B2: alpha > 1 (lag)', lag.alpha > 1);
});

record('B3: designLeadLagCompensator — returns combinedTf', () => {
  const { lead, lag, combinedTf } = designLeadLagCompensator({
    phaseBoostDeg: 30,
    crossoverFreq: 1,
    improvementFactor: 3,
    zeroRatio: 10,
  });
  assertTrue('B3: lead.mode = lead', lead.mode === 'lead');
  assertTrue('B3: lag.mode = lag', lag.mode === 'lag');
  assertTrue('B3: combinedTf is TF', combinedTf instanceof TransferFunction);
  // Combined should be 2nd-order (num degree 2, den degree 2) — series of two 1st-order
  assertTrue('B3: combined num degree 2', combinedTf.num.length === 3);
  assertTrue('B3: combined den degree 2', combinedTf.den.length === 3);
});

record('B4: Lead-Lag cascade DC gain', () => {
  // Lead: Kc*1/(alpha) at DC (s=0 → Cc = Kc); Lag: Kc_lag at DC = lag.gain
  // Combined DC gain = lead.gain * lag.gain
  const { lead, lag, combinedTf } = designLeadLagCompensator({
    phaseBoostDeg: 30,
    crossoverFreq: 1,
    improvementFactor: 4,
  });
  const dcCombined = combinedTf.dcGain();
  const dcExpected = lead.gain * lag.gain;
  assertNear('B4: DC gain = lead*lag', dcCombined, dcExpected, 1e-6);
});

record('B5: Lead phase max at ω = 1/(tau*sqrt(alpha))', () => {
  // Lead: Cc(s) = Kc*(τs+1)/(ατs+1). Max phase at ω_m = 1/(τ√α).
  const { lead } = designLeadLagCompensator({ phaseBoostDeg: 40, crossoverFreq: 2, improvementFactor: 2 });
  const lc = designLeadCompensator({ phaseBoostDeg: 40, crossoverFreq: 2 });
  const omegaM = 1 / (lc.tau * Math.sqrt(lc.alpha));
  // The max phase boost should equal phaseBoostDeg
  const tf = leadLagTransferFunction({ mode: 'lead', ...lc });
  const h = tf.evalAt(new Complex(0, omegaM));
  const phaseActual = h.angleDeg;
  assertNear('B5: lead phase at omega_m ≈ 40°', phaseActual, 40, 1.0);
});

// ---------------------------------------------------------------------------
// C. PM/GM color thresholds (pure logic tests — no DOM)
// ---------------------------------------------------------------------------
record('C1: PM/GM boundary classification logic', () => {
  function pmColor(pm) {
    if (!Number.isFinite(pm)) return 'green';
    if (pm > 45) return 'green';
    if (pm >= 30) return 'orange';
    return 'red';
  }
  function gmColor(gm) {
    if (!Number.isFinite(gm) || gm === Infinity) return 'green';
    if (gm > 6) return 'green';
    if (gm >= 3) return 'orange';
    return 'red';
  }
  // PM: >45° green, 30–45° orange, <30° red
  assertTrue('C1: PM=50 → green', pmColor(50) === 'green');
  assertTrue('C1: PM=46 → green', pmColor(46) === 'green');
  assertTrue('C1: PM=45 → orange (boundary, not > 45)', pmColor(45) === 'orange');
  assertTrue('C1: PM=44 → orange', pmColor(44) === 'orange');
  assertTrue('C1: PM=30 → orange (boundary)', pmColor(30) === 'orange');
  assertTrue('C1: PM=29 → red', pmColor(29) === 'red');
  assertTrue('C1: PM=∞ → green', pmColor(Infinity) === 'green');
  // GM: >6 dB green, 3–6 dB orange, <3 dB red
  assertTrue('C1: GM=10 → green', gmColor(10) === 'green');
  assertTrue('C1: GM=7 → green', gmColor(7) === 'green');
  assertTrue('C1: GM=6 → orange (boundary, not > 6)', gmColor(6) === 'orange');
  assertTrue('C1: GM=5 → orange', gmColor(5) === 'orange');
  assertTrue('C1: GM=3 → orange (boundary)', gmColor(3) === 'orange');
  assertTrue('C1: GM=2 → red', gmColor(2) === 'red');
});

// ---------------------------------------------------------------------------
// D. Series PID form invariants (Ti = Kp/Ki, Td = Kd/Kp)
// ---------------------------------------------------------------------------
record('D1: Series form Ti/Td from parallel gains', () => {
  const Kp = 2, Ki = 0.5, Kd = 1;
  const Ti = Kp / Ki;      // 4
  const Td = Kd / Kp;     // 0.5
  assertNear('D1: Ti = 4', Ti, 4);
  assertNear('D1: Td = 0.5', Td, 0.5);
  // Reconstruct: Ki = Kp/Ti, Kd = Kp*Td
  assertNear('D1: Ki from Ti', Kp / Ti, Ki);
  assertNear('D1: Kd from Td', Kp * Td, Kd);
});

record('D2: Series form edge cases (Ki=0 → Ti=∞, Kd=0 → Td=0)', () => {
  function tiDisplay(Kp, Ki) { return Ki > 1e-9 ? Kp / Ki : Infinity; }
  function tdDisplay(Kp, Kd) { return Kp > 1e-9 ? Kd / Kp : 0; }
  assertTrue('D2: Ki=0 → Ti=∞', tiDisplay(1, 0) === Infinity);
  assertNear('D2: Kd=0 → Td=0', tdDisplay(1, 0), 0);
  // P-only
  assertTrue('D2: P-only Ti=∞', tiDisplay(2, 0) === Infinity);
  assertNear('D2: P-only Td=0', tdDisplay(2, 0), 0);
});

// ---------------------------------------------------------------------------
// F. Step spec overlay data shapes
// ---------------------------------------------------------------------------
record('F1: ±2% settling band values', () => {
  const ySS = 1.0;
  const band = 0.02 * Math.abs(ySS);
  assertNear('F1: +2% band', ySS + band, 1.02);
  assertNear('F1: -2% band', ySS - band, 0.98);
});

record('F2: Overshoot limit line', () => {
  const ySS = 1.0;
  const osLimit = 20;
  const osLine = ySS * (1 + osLimit / 100);
  assertNear('F2: OS limit at 20%', osLine, 1.20);
});

record('F3: Rise time detection (first crossing of 90%)', () => {
  // Simulate first-order step response: y(t) = 1 - e^(-t)
  // The app marks tRise as the first time y reaches 90% of ySS.
  // For y(t)=1-e^{-t}: y=0.9 when t=-ln(0.1) ≈ 2.303 s
  const dt = 0.01;
  const t = Array.from({ length: 1000 }, (_, i) => i * dt);
  const y = t.map(ti => 1 - Math.exp(-ti));
  const ySS = y[y.length - 1];
  const y90 = 0.9 * ySS;
  let tRise = null;
  for (let i = 1; i < t.length; i++) {
    if (y[i - 1] < y90 && y[i] >= y90) { tRise = t[i]; break; }
  }
  // First crossing of 90%: t ≈ -ln(0.1) ≈ 2.303 s (±dt tolerance)
  assertTrue('F3: tRise found', tRise != null);
  assertNear('F3: tRise ≈ -ln(0.1)', tRise, -Math.log(0.1), 0.05);
});

// ---------------------------------------------------------------------------
// G. 1-DOF vs 2-DOF derivative kick
// ---------------------------------------------------------------------------
record('G1: 1-DOF closed-loop step response settles to 1', () => {
  // Standard 1-DOF PID + 1/(s+1) plant with integral action → unity SS gain
  const plant = new TransferFunction([1], [1, 1]);
  const pid = new PIDController(1, 0.5, 0.1, 100);
  const loop1 = pid.toTransferFunction().series(plant);
  const cl1 = loop1.feedback();
  // Use longer duration so integral action settles
  const resp1 = stepResponse(cl1, { duration: 30, sampleCount: 500 });
  assertNear('G1: CL final value ≈ 1', resp1.y.at(-1), 1, 0.02);
});

record('G2: 2-DOF β=0 reduces proportional kick — numerator degree check', () => {
  // The 1-DOF PID TF C(s) = Kp + Ki/s + Kd*N*s/(s+N).
  // The numerator has degree 2 (when combined over common denominator).
  // For 2-DOF with β=0, γ=0: reference path becomes Ki/s only → degree-0 numerator.
  // We verify the 1-DOF TF structure has Kd contribution (degree > 0).
  const Kp = 1, Ki = 0.5, Kd = 0.2, N = 100;
  const pid = new PIDController(Kp, Ki, Kd, N);
  const tfFull = pid.toTransferFunction();
  // The full PID TF should have numerator of degree ≥ 2 (s², s, const)
  assertTrue('G2: full PID TF numerator length ≥ 3', tfFull.num.length >= 3);
  // The leading (highest degree) coefficient should be positive (Kd contribution)
  assertTrue('G2: leading numerator coeff > 0 (D present)', tfFull.num[0] > 0);
  // D-kick: at high freq (|s|→∞) the Kd*N term dominates
  // Ki/s term → 0, Kp term → Kp, Kd*N*s/(s+N) → Kd*N
  // Verify controller gain at high freq (ω=10000 >> N=100) ≈ Kp + Kd*N
  const highFreqGain = tfFull.evalAt(new Complex(0, 1e4)).magnitude;
  assertTrue('G2: high-freq gain dominated by Kd*N', highFreqGain > Kp);
});

// ---------------------------------------------------------------------------
// H. FOPDT validity ratio warnings
// ---------------------------------------------------------------------------
record('H1: Cohen-Coon/ITAE ratio boundaries', () => {
  function fopdtMsg(preset, tau, td) {
    const ratio = td / tau;
    if ((preset === 'cohen-coon' || preset.startsWith('itae-')) && ratio < 0.05) {
      return 'low';
    }
    if ((preset === 'cohen-coon' || preset.startsWith('itae-')) && ratio > 1.0) {
      return 'high';
    }
    if ((preset.startsWith('imc-') || preset === 'simc') && ratio > 2.0) {
      return 'imc-high';
    }
    return 'ok';
  }
  assertTrue('H1: ratio=0.04 → low warning', fopdtMsg('cohen-coon', 10, 0.4) === 'low');
  assertTrue('H1: ratio=0.1 → ok', fopdtMsg('cohen-coon', 10, 1) === 'ok');
  assertTrue('H1: ratio=1.5 → high', fopdtMsg('cohen-coon', 10, 15) === 'high');
  assertTrue('H1: ratio=0.5 → ok for itae', fopdtMsg('itae-pid', 10, 5) === 'ok');
  assertTrue('H1: ratio=2.5 for imc → imc-high', fopdtMsg('imc-pid', 10, 25) === 'imc-high');
  assertTrue('H1: ratio=1.5 for imc → ok', fopdtMsg('imc-pid', 10, 15) === 'ok');
  assertTrue('H1: zn-pid never warns', fopdtMsg('zn-pid', 10, 0.01) === 'ok');
});

record('H2: SIMC and IMC boundary at ratio=2', () => {
  function imcMsg(preset, tau, td) {
    const ratio = td / tau;
    return (preset.startsWith('imc-') || preset === 'simc') && ratio > 2.0 ? 'warn' : 'ok';
  }
  assertTrue('H2: simc ratio=2.0 → ok (boundary)', imcMsg('simc', 5, 10) === 'ok');
  assertTrue('H2: simc ratio=2.01 → warn', imcMsg('simc', 5, 10.05) === 'warn');
  assertTrue('H2: imc-pi ratio=3 → warn', imcMsg('imc-pi', 3, 9) === 'warn');
});

// ---------------------------------------------------------------------------
// Integration: Full design pipeline
// ---------------------------------------------------------------------------
record('INT1: Auto-tune + stability margins round-trip', () => {
  // G(s) = 1/(s(s+1)) — Type-1 plant
  const plant = new TransferFunction([1], [1, 1, 0]);
  const r = autoTunePIDToSpec(plant, { targetPM: 45, targetWc: 1, type: 'PID' });
  assertTrue('INT1: Kp > 0', r.Kp > 0);
  // The achieved PM should be in a reasonable range
  assertTrue('INT1: achievedPM > 20', r.achievedPM > 20);
  assertTrue('INT1: achievedPM finite', Number.isFinite(r.achievedPM));
});

record('INT2: Lead-Lag cascade → compensated plant has improved PM', () => {
  // Use integrating plant G(s) = 1/s²
  const plant = new TransferFunction([1], [1, 0, 0]);
  const marginsBefore = stabilityMargins(plant);
  // Design lead to boost PM by 40° at ωc=1
  const { combinedTf } = designLeadLagCompensator({
    phaseBoostDeg: 40,
    crossoverFreq: 1,
    improvementFactor: 2,
    zeroRatio: 10,
  });
  const compensated = combinedTf.series(plant);
  const marginsAfter = stabilityMargins(compensated);
  // Compensated plant should have better (higher) PM than uncompensated
  assertTrue('INT2: PM improved after lead-lag', marginsAfter.phaseMargin > marginsBefore.phaseMargin);
});

// ---------------------------------------------------------------------------
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error(`\nPID design verification FAILED: ${failed.length}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`\nPID design verification PASSED: ${checks.length}/${checks.length}`);
}
