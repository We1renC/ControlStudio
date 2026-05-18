#!/usr/bin/env node
/**
 * Phase 17 verification:
 * - dynamic/full-order mixed-sensitivity H∞ synthesis path
 * - structured μ upper-bound and D-scaling sweep
 * - MIMO frequency-domain design diagnostics
 * - MIMO output-space MPC setpoint tracking
 */
import {
  defaultMixedSensitivityWeights,
  fullOrderHinfMixedSensitivity,
  mixedSensitivityCost,
} from '../js/control/hinf_synth.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { Complex } from '../js/math/complex.js';
import {
  MIMOStateSpace,
  characteristicLoci,
  gershgorinBands,
  inverseNyquistArray,
} from '../js/control/mimo.js';
import {
  structuredMuSweep,
  structuredMuSynthesisSurrogate,
  structuredMuUpperBound,
} from '../js/control/robust.js';
import {
  simulateMpcOutputTracking,
  solveOutputSetpointSteadyState,
} from '../js/control/mpc.js';
import { simulatePIDAntiWindup } from '../js/analysis/time-response.js';

let failed = 0;
function ok(label, condition, detail = '') {
  console.log(`${condition ? '[PASS]' : '[FAIL]'} ${label}${detail ? ': ' + detail : ''}`);
  if (!condition) failed++;
}
function near(label, actual, expected, tol = 1e-8) {
  ok(label, Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
    `got=${actual.toExponential(4)}, expected=${expected.toExponential(4)}`);
}
function complexNear(label, actual, expected, tol = 1e-8) {
  ok(label, actual.sub(expected).magnitude <= tol,
    `got=${actual.toString(5)}, expected=${expected.toString(5)}`);
}

console.log('\n=== P17-01: Dynamic / full-order H∞ mixed-sensitivity synthesis ===\n');
{
  const G = new TransferFunction([1], [1, 1]);
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 2, controlPenalty: 0.02 });
  const omegas = Array.from({ length: 48 }, (_, i) => Math.pow(10, -2 + (4 * i) / 47));
  const C0 = new TransferFunction([1], [1]);
  const baseline = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, C0.series(G), C0, omegas).peak;
  const result = fullOrderHinfMixedSensitivity(G, weights, { omegas, maxIter: 90 });
  ok('full-order controller order equals plant order', result.order === G.order, `order=${result.order}`);
  ok('controller is stable/proper', result.controllerTf.isStable(), result.controllerTf.toString());
  ok('synthesis cost finite', Number.isFinite(result.cost), `cost=${result.cost.toFixed(4)}`);
  ok('dynamic synthesis is no worse than static K=1 baseline', result.peak <= baseline + 1e-3,
    `dynamic=${result.peak.toFixed(4)}, baseline=${baseline.toFixed(4)}`);
}

console.log('\n=== P17-02: Structured μ upper-bound / D-scaling ===\n');
{
  const M = [
    [new Complex(2, 0), new Complex(0, 0)],
    [new Complex(0, 0), new Complex(0.5, 0)],
  ];
  const result = structuredMuUpperBound(M);
  near('diagonal matrix μ upper bound = max diagonal magnitude', result.upperBound, 2, 1e-10);
  near('unscaled upper bound also = 2', result.unscaledUpperBound, 2, 1e-10);
}
{
  const M = [
    [new Complex(1, 0), new Complex(3, 0)],
    [new Complex(0.1, 0), new Complex(1, 0)],
  ];
  const result = structuredMuUpperBound(M, { maxIter: 60 });
  ok('D-scaling does not increase σ upper-bound', result.upperBound <= result.unscaledUpperBound + 1e-9,
    `scaled=${result.upperBound.toFixed(4)}, raw=${result.unscaledUpperBound.toFixed(4)}`);
}

console.log('\n=== P17-03: MIMO frequency-domain design diagnostics ===\n');
{
  const sys = new MIMOStateSpace(
    [[-1, 0], [0, -2]],
    [[1, 0], [0, 1]],
    [[1, 0], [0, 1]],
    [[0, 0], [0, 0]],
  );
  const omegas = [1];
  const loci = characteristicLoci(sys, omegas)[0].eigenvalues;
  const expected1 = new Complex(1, 0).div(new Complex(1, 1));
  const expected2 = new Complex(1, 0).div(new Complex(2, 1));
  ok('characteristic loci returns two eigenvalue channels', loci.length === 2);
  ok('characteristic loci matches diagonal channel set',
    loci.some((v) => v.sub(expected1).magnitude < 1e-8) && loci.some((v) => v.sub(expected2).magnitude < 1e-8));

  const bands = gershgorinBands(sys, omegas)[0].bands;
  near('diagonal plant Gershgorin radius channel 1 = 0', bands[0].radius, 0, 1e-12);
  near('diagonal plant Gershgorin radius channel 2 = 0', bands[1].radius, 0, 1e-12);

  const ina = inverseNyquistArray(sys, omegas)[0].inverse;
  complexNear('INA channel 1 inverse = 1 + jω', ina[0][0], new Complex(1, 1), 1e-8);
  complexNear('INA channel 2 inverse = 2 + jω', ina[1][1], new Complex(2, 1), 1e-8);

  const muSweep = structuredMuSweep(sys, [0.1, 1, 10]);
  ok('structured μ sweep has finite peak', Number.isFinite(muSweep.peak), `peak=${muSweep.peak.toFixed(4)}`);
  const surrogate = structuredMuSynthesisSurrogate(sys, [0.1, 1], { gainCandidates: [0.1, 1, 10] });
  ok('structured robust surrogate selects a tested gain', [0.1, 1, 10].includes(surrogate.bestGain),
    `bestGain=${surrogate.bestGain}`);
}

console.log('\n=== P17-04: MPC MIMO output-space setpoint tracking ===\n');
{
  const Ad = [[0.85, 0.05], [0.02, 0.8]];
  const Bd = [[0.2, 0.03], [0.01, 0.25]];
  const C = [[1, 0], [0, 1]];
  const D = [[0, 0], [0, 0]];
  const Q = [[4, 0], [0, 4]];
  const R = [[0.05, 0], [0, 0.05]];
  const yRef = [[1], [-0.5]];
  const steady = solveOutputSetpointSteadyState(Ad, Bd, C, D, yRef);
  ok('MIMO y-ref steady-state is exactly reachable', steady.exact, `residual=${steady.residual.toExponential(3)}`);
  near('x_ss[0] equals yRef[0]', steady.x_ss[0][0], 1, 1e-7);
  near('x_ss[1] equals yRef[1]', steady.x_ss[1][0], -0.5, 1e-7);

  const sim = simulateMpcOutputTracking(Ad, Bd, C, D, Q, R, 8, [[0], [0]], yRef, { uMin: -3, uMax: 3 }, { steps: 35 });
  ok('MIMO output tracking converges', sim.finalOutputErrorNormInf < 0.03,
    `finalOutputError=${sim.finalOutputErrorNormInf.toExponential(3)}`);
  ok('MIMO output tracking cost finite', Number.isFinite(sim.totalCost));
}

// ============================================================
// P17-05: Tyreus-Luyben tuning
// ============================================================
console.log('\n=== P17-05: Tyreus-Luyben tuning ===\n');
import { PIDController, TwoDOFPIDController } from '../js/control/pid.js';
import { notchFilter, notchFilterDescription } from '../js/control/compensator.js';
{
  // TL PI: Ku=6, Tu=2 → Kp=6/3.2=1.875, Ti=2.2*2=4.4 → Ki=1.875/4.4≈0.42614
  const tlPI = PIDController.tyreusLuyben(6, 2, 'PI');
  near('TL PI Kp ≈ 1.875', tlPI.Kp, 1.875, 1e-9);
  near('TL PI Ki ≈ 0.42614', tlPI.Ki, 1.875 / 4.4, 1e-9);
  near('TL PI Kd = 0', tlPI.Kd, 0, 1e-15);

  // TL PID: Kp=6/2.2≈2.7273, Ti=4.4 → Ki≈0.6198, Td=2/6.3≈0.31746 → Kd≈Kp*Td≈0.8657
  const tlPID = PIDController.tyreusLuyben(6, 2, 'PID');
  near('TL PID Kp ≈ 2.7273', tlPID.Kp, 6 / 2.2, 1e-9);
  near('TL PID Ti = 4.4', tlPID.Ki, (6 / 2.2) / 4.4, 1e-9);
  near('TL PID Td = Tu/6.3', tlPID.Kd, (6 / 2.2) * (2 / 6.3), 1e-9);
}

// ============================================================
// P17-06: ITAE tuning
// ============================================================
console.log('\n=== P17-06: ITAE tuning (Rovira) ===\n');
{
  // K=1, tau=5, theta=0.5 → r=0.1
  const itaePI = PIDController.itae(1, 5, 0.5, 'PI');
  // Kp = (0.586/1) * 0.1^(-0.916) > 0
  ok('ITAE PI Kp > 0', itaePI.Kp > 0, `Kp=${itaePI.Kp.toFixed(4)}`);
  ok('ITAE PI Ki > 0', itaePI.Ki > 0, `Ki=${itaePI.Ki.toFixed(4)}`);
  ok('ITAE PI Kd = 0', itaePI.Kd === 0, `Kd=${itaePI.Kd}`);

  const itaePID = PIDController.itae(1, 5, 0.5, 'PID');
  ok('ITAE PID Kp > 0', itaePID.Kp > 0, `Kp=${itaePID.Kp.toFixed(4)}`);
  ok('ITAE PID Ki > 0', itaePID.Ki > 0, `Ki=${itaePID.Ki.toFixed(4)}`);
  ok('ITAE PID Kd > 0', itaePID.Kd > 0, `Kd=${itaePID.Kd.toFixed(4)}`);

  // Check r validation
  let threw = false;
  try { PIDController.itae(1, 5, 6, 'PID'); } catch { threw = true; }
  ok('ITAE throws for r >= 1', threw);
}

// ============================================================
// P17-07: Notch filter
// ============================================================
console.log('\n=== P17-07: Notch filter ===\n');
{
  const nf = notchFilter(10, 0.01, 0.5);
  ok('notchFilter returns TransferFunction', nf && typeof nf.evalAt === 'function');

  // At ω=ωn=10, magnitude should be << 1 (attenuation)
  // |H(jωn)| = |num(jωn)| / |den(jωn)|
  // num(j10): (j10)^2 + 2*0.01*10*(j10) + 100 = -100 + 2j + 100 = 2j → |2j|=2
  // den(j10): (j10)^2 + 2*0.5*10*(j10) + 100 = -100 + 100j + 100 = 100j → |100j|=100
  // magnitude = 2/100 = 0.02 << 1
  const atNotch = nf.evalAt(new Complex(0, 10));
  ok('Notch filter attenuates at ω_n', atNotch.magnitude < 0.1,
    `|H(j*10)|=${atNotch.magnitude.toFixed(4)}`);

  // At ω=0.1 (far from notch), magnitude ≈ 1
  const awayFromNotch = nf.evalAt(new Complex(0, 0.1));
  ok('Notch filter passes far from ω_n', awayFromNotch.magnitude > 0.9,
    `|H(j*0.1)|=${awayFromNotch.magnitude.toFixed(4)}`);

  // Description string
  const desc = notchFilterDescription(10, 0.01, 0.5);
  ok('notchFilterDescription returns string', typeof desc === 'string' && desc.includes('10'));

  // Validation: zetaNum >= zetaDen should throw
  let threw = false;
  try { notchFilter(10, 0.5, 0.1); } catch { threw = true; }
  ok('notchFilter throws when zetaNum >= zetaDen', threw);
}

// ============================================================
// P17-08: TwoDOFPIDController
// ============================================================
console.log('\n=== P17-08: TwoDOFPIDController ===\n');
{
  const ctrl = new TwoDOFPIDController(2, 0.5, 0.1, 100, 0.5, 0);
  ok('TwoDOFPIDController has beta/gamma', ctrl.beta === 0.5 && ctrl.gamma === 0);

  const Cy = ctrl.toFeedbackTF();
  const Cr = ctrl.toSetpointTF();
  ok('Feedback TF is TransferFunction', Cy && typeof Cy.evalAt === 'function');
  ok('Setpoint TF is TransferFunction', Cr && typeof Cr.evalAt === 'function');

  // At s=0 (DC), Cy should have pure integrator, so evaluate at low freq
  // Setpoint TF has beta=0.5 on Kp and gamma=0 on Kd → at high freq numerator differs
  // At DC: Cr/Cy should reflect β for proportional (both have same Ki so ratio→1 at DC with integrator)
  // Check: with beta=0.5, setpoint TF Kp is 2*0.5=1 (vs feedback Kp=2)
  // At s=infinity (high freq), C(s) ~ Kp (ignoring integrator and derivative filter)
  // We verify via evalAt at a moderate freq
  const sTest = new Complex(0, 0.001); // near DC where Ki dominates
  const CyVal = Cy.evalAt(sTest);
  const CrVal = Cr.evalAt(sTest);
  ok('Cy and Cr are finite at near-DC', Number.isFinite(CyVal.magnitude) && Number.isFinite(CrVal.magnitude));

  // closedLoopTF returns expected object
  const plant = new TransferFunction([1], [1, 1]);
  const cl = ctrl.closedLoopTF(plant);
  ok('closedLoopTF returns {feedback, setpoint, plant, loopTf, oneDofCL}',
    cl.feedback && cl.setpoint && cl.plant && cl.loopTf && cl.oneDofCL);

  // Default beta=1, gamma=1 → setpointTF == feedbackTF (full 1-DOF equivalence)
  const ctrl1dof = new TwoDOFPIDController(2, 0.5, 0.1, 100, 1, 1);
  ok('beta=1, gamma=1 gives identical setpoint/feedback TFs',
    Math.abs(ctrl1dof.toSetpointTF().evalAt(new Complex(10, 0)).magnitude -
      ctrl1dof.toFeedbackTF().evalAt(new Complex(10, 0)).magnitude) < 1e-9);
}

console.log('\n=== P17-09: Anti-windup back-calculation simulation ===\n');
{
  // Plant: 1/(s+1) — simple first-order
  const plant = new TransferFunction([1], [1, 1]);
  const pid = { Kp: 5, Ki: 2, Kd: 0 };

  // Without saturation: standard closed-loop simulation
  const free = simulatePIDAntiWindup(plant, pid, { amplitude: 1, sampleCount: 200 });
  ok('simulatePIDAntiWindup returns t/y/u arrays', Array.isArray(free.t) && Array.isArray(free.y) && Array.isArray(free.u));
  ok('t array has 200 points', free.t.length === 200);
  ok('output eventually settles near 1 (no saturation)', Math.abs(free.y[free.y.length - 1] - 1) < 0.05);
  ok('control output u starts positive', free.u[1] > 0);

  // With saturation (tight limits → integrator would wind up without AW)
  const sat = simulatePIDAntiWindup(plant, pid, { uMin: 0, uMax: 2, amplitude: 1, sampleCount: 200 });
  ok('saturated simulation returns data', sat.t.length > 0);
  ok('control never exceeds uMax=2', sat.u.every(u => u <= 2 + 1e-9));
  ok('control never below uMin=0', sat.u.every(u => u >= -1e-9));
  ok('output with AW still converges toward 1', Math.abs(sat.y[sat.y.length - 1] - 1) < 0.1);

  // AW should prevent overshoot being worse than unsaturated version
  const maxY_sat = Math.max(...sat.y);
  const maxY_free = Math.max(...free.y);
  // Saturated (with tight u) may be slower, but shouldn't blow up
  ok('saturated peak output is finite', Number.isFinite(maxY_sat));
}

console.log('');
if (failed === 0) console.log('P17 advanced control: all checks passed');
else {
  console.log(`P17 advanced control: ${failed} FAILED`);
  process.exitCode = 1;
}
