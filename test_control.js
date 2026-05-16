import { TransferFunction } from './control-studio/js/control/transfer-function.js';
import { DiscreteTransferFunction } from './control-studio/js/control/discrete-transfer-function.js';
import { discreteStepResponse, discreteImpulseResponse } from './control-studio/js/analysis/discrete-response.js';
import { impulseResponse, rampResponse, simulateTimeResponse, stepResponse } from './control-studio/js/analysis/time-response.js';
import { bodeData, nyquistData, autoFreqRange, nicholsData, nyquistEncirclements } from './control-studio/js/analysis/frequency-response.js';
import { rootLocusAsymptotes, rootLocusBreakPoints, rootLocusJwCrossings, sortRootLocusBranches } from './control-studio/js/analysis/root-locus.js';
import { stateSpaceToTransferFunction, controllabilityMatrix, observabilityMatrix } from './control-studio/js/control/state-space.js';
import { stepInfo, stabilityMargins, routhTable, analyzeStability } from './control-studio/js/control/stability.js';
import { PIDController } from './control-studio/js/control/pid.js';
import { designLagCompensator, designLeadCompensator, leadLagTransferFunction } from './control-studio/js/control/compensator.js';
import { parsePolyString } from './control-studio/js/utils/format.js';
import { zpkToTransferFunction, parseRootsString, parseComplexRoot } from './control-studio/js/control/zpk.js';
import { polydiv, polymul } from './control-studio/js/math/polynomial.js';
import { c2dTustin, c2dZOH } from './control-studio/js/control/c2d.js';
import { specsToTargetPoles, designLeadForPM, deadbeatGain } from './control-studio/js/control/design.js';
import { discreteBodeData } from './control-studio/js/analysis/discrete-frequency-response.js';
import { matExp, matIdentity, matMul, matSub, matScale } from './control-studio/js/math/matrix.js';
import { tfToControllableCanonical } from './control-studio/js/control/state-space.js';
import { matRank } from './control-studio/js/math/matrix.js';
import { analyzeLyapunov, closedLoopTransferFromStateFeedback, placeObserver, placeStateFeedback, simulateObserver, solveLqe, solveLqr } from './control-studio/js/control/state-feedback.js';

try {
  const assertNear = (name, actual, expected, tolerance = 1e-6) => {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
      throw new Error(`${name}: expected ${expected}, got ${actual}`);
    }
  };
  const assertPolyNear = (name, actual, expected, tolerance = 1e-6) => {
    if (actual.length !== expected.length) {
      throw new Error(`${name}: expected length ${expected.length}, got ${actual.length}`);
    }
    actual.forEach((value, idx) => assertNear(`${name}[${idx}]`, value, expected[idx], tolerance));
  };

  // Test 1/(s+1)
  const num1 = parsePolyString('1');
  const den1 = parsePolyString('1, 1');
  const sys1 = new TransferFunction(num1, den1);
  const resp1 = stepResponse(sys1);
  const info1 = stepInfo(resp1.t, resp1.y);
  console.log('1/(s+1) Rise Time:', info1.riseTime);
  console.log('1/(s+1) Settling Time:', info1.settlingTime);
  console.log('1/(s+1) Poles:', sys1.poles().map(p => ({re: p.re, im: p.im})));

  // Test 1/(s-1)
  const num2 = parsePolyString('1');
  const den2 = parsePolyString('1, -1');
  const sys2 = new TransferFunction(num2, den2);
  const resp2 = stepResponse(sys2);
  console.log('1/(s-1) Poles:', sys2.poles().map(p => ({re: p.re, im: p.im})));

  // Check STABILITY logic
  const checkStability = (targetSys) => {
    if (!targetSys) return 'unknown';
    const poles = targetSys.poles();
    if (poles.some(p => p.re > 1e-7)) return 'unstable';
    if (poles.some(p => Math.abs(p.re) < 1e-7)) return 'marginal';
    return 'stable';
  };

  console.log('1/(s+1) Status:', checkStability(sys1));
  console.log('1/(s-1) Status:', checkStability(sys2));

  const ssTf = stateSpaceToTransferFunction(
    [[0, 1], [-2, -3]],
    [[0], [1]],
    [[1, 0]],
    [[0]]
  );
  console.log('State Space TF:', ssTf.toString());

  const imp = impulseResponse(sys1);
  const ramp = rampResponse(sys1);
  const configuredStep = stepResponse(sys1, { duration: 10, sampleCount: 11, amplitude: 2 });
  const legacyStep = stepResponse(sys1, 10);
  const coarseStep = stepResponse(sys1, { duration: 10, sampleCount: 20 });
  const sineResponse = simulateTimeResponse(sys1, 'sine', { duration: 2, sampleCount: 20, amplitude: 1.5, frequency: 0.5 });
  const disturbanceResponse = stepResponse(sys1, { duration: 5, sampleCount: 20, disturbanceType: 'step', disturbanceAmplitude: 0.5, disturbanceStart: 2 });
  const nyq = nyquistData(sys1);
  console.log('Impulse samples:', imp.y.slice(0, 3));
  console.log('Ramp final sample:', ramp.y[ramp.y.length - 1]);
  console.log('Configured step samples:', configuredStep.t.length, configuredStep.y[configuredStep.y.length - 1]);
  console.log('Legacy step samples:', legacyStep.t.length);
  console.log('Coarse step final sample:', coarseStep.y[coarseStep.y.length - 1]);
  console.log('Sine response samples:', sineResponse.t.length);
  console.log('Disturbance response final sample:', disturbanceResponse.y[disturbanceResponse.y.length - 1]);
  console.log('Nyquist first point:', { re: nyq.re[0], im: nyq.im[0] });

  if (configuredStep.t.length !== 11) {
    throw new Error(`Expected 11 samples, got ${configuredStep.t.length}`);
  }
  if (configuredStep.y[configuredStep.y.length - 1] < 1.8 || configuredStep.y[configuredStep.y.length - 1] > 2.1) {
    throw new Error('Configured step amplitude did not scale as expected');
  }
  if (legacyStep.t.length !== 1000) {
    throw new Error(`Legacy duration call should keep 1000 samples, got ${legacyStep.t.length}`);
  }
  if (!Number.isFinite(coarseStep.y[coarseStep.y.length - 1]) || Math.abs(coarseStep.y[coarseStep.y.length - 1] - 1) > 0.1) {
    throw new Error('Low sampleCount step response became numerically unstable');
  }
  if (sineResponse.t.length !== 20) {
    throw new Error(`Expected 20 sine samples, got ${sineResponse.t.length}`);
  }
  if (disturbanceResponse.y[disturbanceResponse.y.length - 1] <= 1.0) {
    throw new Error('Disturbance input did not affect final response as expected');
  }

  // === NEW TESTS ===

  // ZPK conversion
  const zpkRoots = parseRootsString('-1, -2+3j');
  if (zpkRoots.length !== 2) throw new Error(`Expected 2 roots, got ${zpkRoots.length}`);
  if (Math.abs(zpkRoots[0].re + 1) > 0.001) throw new Error('ZPK root 0 wrong');
  if (Math.abs(zpkRoots[1].im - 3) > 0.001) throw new Error('ZPK root 1 wrong');

  const zpkTf = zpkToTransferFunction(
    [{ re: 0, im: 0 }],
    [{ re: -1, im: 0 }, { re: -2, im: 0 }],
    5
  );
  console.log('ZPK TF:', zpkTf.toString());
  if (zpkTf.num.length !== 2) throw new Error('ZPK num wrong length');
  if (zpkTf.den.length !== 3) throw new Error('ZPK den wrong length');

  const cplxRoot = parseComplexRoot('-3+4j');
  if (!cplxRoot || Math.abs(cplxRoot.re + 3) > 0.001 || Math.abs(cplxRoot.im - 4) > 0.001) {
    throw new Error('parseComplexRoot failed');
  }
  console.log('ZPK tests passed');

  // Polydiv
  const divResult = polydiv([1, 3, 2], [1, 1]);
  if (Math.abs(divResult.quotient[0] - 1) > 0.001 || Math.abs(divResult.quotient[1] - 2) > 0.001) {
    throw new Error('polydiv quotient wrong');
  }
  if (Math.abs(divResult.remainder[0]) > 0.001) {
    throw new Error('polydiv remainder should be 0');
  }
  console.log('Polydiv test passed');

  // Routh-Hurwitz table
  const routh1 = routhTable([1, 3, 3, 1]);
  if (!routh1.stable) throw new Error('Routh should be stable for s^3+3s^2+3s+1');
  if (routh1.signChanges !== 0) throw new Error('Routh signChanges should be 0');
  const routh2 = routhTable([1, -1, 1]);
  if (routh2.stable) throw new Error('Routh should be unstable for s^2-s+1');
  console.log('Routh-Hurwitz test passed');

  // Stability analysis summary
  const stableAnalysis = analyzeStability(sys1, { domain: 's', margins: stabilityMargins(sys1) });
  if (stableAnalysis.status !== 'stable') throw new Error(`Expected stable analysis, got ${stableAnalysis.status}`);
  if (stableAnalysis.risk !== 'low') throw new Error(`Expected low risk for 1/(s+1), got ${stableAnalysis.risk}`);
  assertNear('Stable dominant pole', stableAnalysis.dominantPole.re, -1, 1e-9);
  const unstableAnalysis = analyzeStability(sys2, { domain: 's', margins: stabilityMargins(sys2) });
  if (unstableAnalysis.status !== 'unstable') throw new Error(`Expected unstable analysis, got ${unstableAnalysis.status}`);
  if (unstableAnalysis.risk !== 'critical') throw new Error(`Expected critical risk, got ${unstableAnalysis.risk}`);
  console.log('Stability analysis summary tests passed');

  // autoFreqRange
  const range = autoFreqRange(sys1);
  if (!range.wMin || !range.wMax || range.wMin >= range.wMax) throw new Error('autoFreqRange invalid');
  console.log('autoFreqRange:', range);

  // Nichols data
  const nichols = nicholsData(sys1);
  if (!nichols.phaseDeg || nichols.phaseDeg.length === 0) throw new Error('Nichols data empty');
  console.log('Nichols data points:', nichols.phaseDeg.length);

  // Nyquist encirclements
  const enc = nyquistEncirclements(sys1);
  console.log('Nyquist encirclements for 1/(s+1):', enc);
  if (enc !== 0) throw new Error('1/(s+1) should have 0 encirclements');

  // Root locus asymptotes
  const asym = rootLocusAsymptotes(sys1);
  console.log('Root locus asymptotes:', asym);

  // State Space Analysis
  const A = [[0, 1], [-2, -3]];
  const B = [[0], [1]];
  const C = [[1, 0]];
  const C_mat = controllabilityMatrix(A, B);
  const O_mat = observabilityMatrix(A, C);
  const rankC = matRank(C_mat);
  const rankO = matRank(O_mat);
  console.log('SS Controllability Rank:', rankC);
  console.log('SS Observability Rank:', rankO);
  if (rankC !== 2 || rankO !== 2) throw new Error('Expected SS to be fully controllable and observable');

  // Complex engineering case:
  // G(s) = (s+1)/((s-2)(s+1)(s+4)) starts unstable, contains pole-zero cancellation,
  // and Kp=10 yields an intentionally low phase margin (~15 deg).
  const complexPlant = new TransferFunction([1, 1], [1, 3, -6, -8]);
  const complexPlantPoles = complexPlant.poles();
  const complexPlantZeros = complexPlant.zeros();
  if (complexPlant.isStable()) throw new Error('Complex plant should be initially unstable');
  if (!complexPlantPoles.some(p => Math.abs(p.re - 2) < 1e-6 && Math.abs(p.im) < 1e-6)) {
    throw new Error('Complex plant should include an unstable RHP pole at +2');
  }
  if (!complexPlantZeros.some(z => Math.abs(z.re + 1) < 1e-6 && Math.abs(z.im) < 1e-6)) {
    throw new Error('Complex plant should include a zero at -1');
  }
  if (!complexPlantPoles.some(p => Math.abs(p.re + 1) < 1e-6 && Math.abs(p.im) < 1e-6)) {
    throw new Error('Complex plant should include a cancellable pole at -1');
  }

  const complexController = new PIDController(10, 0, 0, 100);
  const complexOpenLoop = complexController.toTransferFunction().series(complexPlant);
  const complexClosedLoop = complexOpenLoop.feedback();

  // Hand derivation:
  // C(s)=10, L(s)=10(s+1)/(s^3+3s^2-6s-8)
  // T(s)=L/(1+L)=10(s+1)/(s^3+3s^2+4s+2).
  // PIDController's P-only implementation carries an equivalent (s+100)/(s+100)
  // derivative-filter cancellation, so compare against the unreduced expected form.
  const expectedReducedNum = [10, 10];
  const expectedReducedDen = [1, 3, 4, 2];
  const filterCancellation = [1, 100];
  const expectedUnreducedNum = polymul(expectedReducedNum, filterCancellation);
  const expectedUnreducedDen = polymul(expectedReducedDen, filterCancellation);
  assertPolyNear('Complex closed-loop numerator equals hand derivation', complexClosedLoop.num, expectedUnreducedNum);
  assertPolyNear('Complex closed-loop denominator equals hand derivation', complexClosedLoop.den, expectedUnreducedDen);

  const reduceNumByFilter = polydiv(complexClosedLoop.num, filterCancellation);
  const reduceDenByFilter = polydiv(complexClosedLoop.den, filterCancellation);
  assertPolyNear('Reduced complex numerator', reduceNumByFilter.quotient, expectedReducedNum);
  assertPolyNear('Reduced complex denominator', reduceDenByFilter.quotient, expectedReducedDen);
  assertPolyNear('Complex numerator filter remainder', reduceNumByFilter.remainder, [0]);
  assertPolyNear('Complex denominator filter remainder', reduceDenByFilter.remainder, [0]);

  const complexMargins = stabilityMargins(complexOpenLoop);
  const complexResponse = stepResponse(complexClosedLoop, { duration: 12, sampleCount: 1200, amplitude: 1 });
  const complexInfo = stepInfo(complexResponse.t, complexResponse.y);
  if (!complexClosedLoop.isStable()) throw new Error('Complex closed-loop should be stable after Kp=10');
  assertNear('Complex phase margin', complexMargins.phaseMargin, 15.000630277515455, 1e-6);
  assertNear('Complex closed-loop final value', complexResponse.y[complexResponse.y.length - 1], 5, 1e-4);
  if (!Number.isFinite(complexInfo.settlingTime)) throw new Error('Complex settling time should be finite');
  console.log('Complex unstable/pole-zero/low-PM equivalence test passed');

  // PID tuning presets:
  // Ziegler-Nichols PID: Kp=0.6Ku, Ki=1.2Ku/Tu, Kd=0.075KuTu.
  const znPid = PIDController.zieglerNichols(6, 2, 'PID');
  assertNear('ZN PID Kp', znPid.Kp, 3.6);
  assertNear('ZN PID Ki', znPid.Ki, 3.6);
  assertNear('ZN PID Kd', znPid.Kd, 0.9);
  const znPi = PIDController.zieglerNichols(6, 2, 'PI');
  assertNear('ZN PI Kp', znPi.Kp, 2.7);
  assertNear('ZN PI Ki', znPi.Ki, 1.62);
  assertNear('ZN PI Kd', znPi.Kd, 0);
  const cohenCoon = PIDController.cohenCoon(1, 5, 1);
  assertNear('Cohen-Coon Kp', cohenCoon.Kp, 7.002074688796681, 1e-12);
  assertNear('Cohen-Coon Ki', cohenCoon.Ki, 3.0742442205097804, 1e-12);
  assertNear('Cohen-Coon Kd', cohenCoon.Kd, 3.09160815615128, 1e-12);
  console.log('PID preset tests passed');

  // Lead compensator math equivalence:
  // Cc(s) = 2(0.5s+1)/(0.1s+1) = (s+2)/(0.1s+1), zero=-2, pole=-10.
  const leadComp = leadLagTransferFunction({ mode: 'lead', gain: 2, tau: 0.5, alpha: 0.2 });
  assertPolyNear('Lead compensator numerator', leadComp.num, [10, 20]);
  assertPolyNear('Lead compensator denominator', leadComp.den, [1, 10]);
  if (!leadComp.zeros().some(z => Math.abs(z.re + 2) < 1e-6)) throw new Error('Lead zero should be at -2');
  if (!leadComp.poles().some(p => Math.abs(p.re + 10) < 1e-6)) throw new Error('Lead pole should be at -10');

  // Lag compensator math equivalence:
  // Cc(s) = (s+1)/(5s+1), zero=-1, pole=-0.2.
  const lagComp = leadLagTransferFunction({ mode: 'lag', gain: 1, tau: 1, alpha: 5 });
  assertPolyNear('Lag compensator numerator', lagComp.num, [0.2, 0.2]);
  assertPolyNear('Lag compensator denominator', lagComp.den, [1, 0.2]);
  if (!lagComp.zeros().some(z => Math.abs(z.re + 1) < 1e-6)) throw new Error('Lag zero should be at -1');
  if (!lagComp.poles().some(p => Math.abs(p.re + 0.2) < 1e-6)) throw new Error('Lag pole should be at -0.2');

  // Lead helper:
  // alpha=(1-sin(phi))/(1+sin(phi)), tau=1/(wc*sqrt(alpha)).
  const designedLead = designLeadCompensator({ phaseBoostDeg: 35, crossoverFreq: 3 });
  const expectedAlpha = (1 - Math.sin(35 * Math.PI / 180)) / (1 + Math.sin(35 * Math.PI / 180));
  const expectedTau = 1 / (3 * Math.sqrt(expectedAlpha));
  assertNear('Lead helper alpha', designedLead.alpha, expectedAlpha, 1e-12);
  assertNear('Lead helper tau', designedLead.tau, expectedTau, 1e-12);
  assertNear('Lead helper gain', designedLead.gain, Math.sqrt(expectedAlpha), 1e-12);

  // Lag helper:
  // alpha=improvementFactor, tau=zeroRatio/wc, gain=improvementFactor.
  // This places the lag zero below crossover and raises DC gain by alpha.
  const designedLag = designLagCompensator({ improvementFactor: 5, crossoverFreq: 2, zeroRatio: 10 });
  assertNear('Lag helper alpha', designedLag.alpha, 5, 1e-12);
  assertNear('Lag helper tau', designedLag.tau, 5, 1e-12);
  assertNear('Lag helper gain', designedLag.gain, 5, 1e-12);
  const designedLagTf = leadLagTransferFunction(designedLag);
  assertNear('Lag helper DC gain', designedLagTf.dcGain(), 5, 1e-12);
  const unityComp = leadLagTransferFunction({ mode: 'none' });
  if (designedLagTf.dcGain() <= unityComp.dcGain()) {
    throw new Error('Lag helper should increase low-frequency gain');
  }
  console.log('Lead/Lag compensator tests passed');

  // ── Discrete Case 1: first-order baseline + impulse response ──────────────
  // G(z)=0.5/(1-0.5z^-1), step: y[k]=1-0.5^(k+1), impulse: y[k]=0.5^(k+1)
  const discrete = new DiscreteTransferFunction([0.5], [1, -0.5], 0.1);
  if (!discrete.isStable()) throw new Error('Discrete pole at 0.5 should be stable');
  const discreteAnalysis = analyzeStability(discrete, { domain: 'z' });
  if (discreteAnalysis.status !== 'stable') throw new Error(`Expected stable discrete analysis, got ${discreteAnalysis.status}`);
  assertNear('Discrete dominant radius', discreteAnalysis.dominantPole.magnitude, 0.5, 1e-9);
  assertNear('Discrete stability margin', discreteAnalysis.stabilityMargin, 0.5, 1e-9);
  assertNear('D1 DC gain', discrete.dcGain(), 1);
  assertNear('D1 pole re', discrete.poles()[0].re, 0.5, 1e-9);
  const d1Step = discreteStepResponse(discrete, { sampleCount: 6, amplitude: 1 });
  [0.5, 0.75, 0.875, 0.9375, 0.96875, 0.984375].forEach((e, k) =>
    assertNear(`D1 step y[${k}]`, d1Step.y[k], e, 1e-12));
  assertNear('D1 sample time', d1Step.t[1], 0.1, 1e-12);
  const d1Imp = discreteImpulseResponse(discrete, { sampleCount: 6, amplitude: 1 });
  [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625].forEach((e, k) =>
    assertNear(`D1 impulse y[${k}]`, d1Imp.y[k], e, 1e-12));

  // ── Discrete Case 2: second-order, two real stable poles ──────────────────
  // G(z)=1/(1-0.75z^-1+0.125z^-2), poles at 0.5 and 0.25
  // Analytical step: y[k] = 8/3 - 2*(0.5)^k + (1/3)*(0.25)^k
  const disc2 = new DiscreteTransferFunction([1], [1, -0.75, 0.125], 0.1);
  if (!disc2.isStable()) throw new Error('D2 poles inside unit circle should be stable');
  assertNear('D2 DC gain', disc2.dcGain(), 8 / 3, 1e-9);
  const d2Poles = disc2.poles().map((p) => p.re).sort((a, b) => b - a);
  assertNear('D2 pole[0]', d2Poles[0], 0.5, 1e-9);
  assertNear('D2 pole[1]', d2Poles[1], 0.25, 1e-9);
  const d2Step = discreteStepResponse(disc2, { sampleCount: 5, amplitude: 1 });
  [0, 1, 2, 3, 4].forEach((k) => {
    const expected = 8 / 3 - 2 * Math.pow(0.5, k) + (1 / 3) * Math.pow(0.25, k);
    assertNear(`D2 step y[${k}]`, d2Step.y[k], expected, 1e-9);
  });

  // ── Discrete Case 3: second-order, complex conjugate poles (underdamped) ──
  // G(z)=0.25/(1-0.6z^-1+0.25z^-2), poles at 0.3±0.4j (|poles|=0.5)
  // Step response computed via difference equation: y[k]=0.25u[k]+0.6y[k-1]-0.25y[k-2]
  const disc3 = new DiscreteTransferFunction([0.25], [1, -0.6, 0.25], 0.05);
  if (!disc3.isStable()) throw new Error('D3 complex poles inside unit circle should be stable');
  assertNear('D3 DC gain', disc3.dcGain(), 0.25 / 0.65, 1e-9);
  const d3Poles = disc3.poles();
  assertNear('D3 pole re', d3Poles[0].re, 0.3, 1e-9);
  assertNear('D3 pole |im|', Math.abs(d3Poles[0].im), 0.4, 1e-9);
  assertNear('D3 pole magnitude', Math.hypot(d3Poles[0].re, d3Poles[0].im), 0.5, 1e-9);
  const d3Step = discreteStepResponse(disc3, { sampleCount: 5, amplitude: 1 });
  [0.25, 0.40, 0.4275, 0.4065, 0.387025].forEach((e, k) =>
    assertNear(`D3 step y[${k}]`, d3Step.y[k], e, 1e-9));

  // ── Discrete Case 4: unstable system ──────────────────────────────────────
  // G(z)=1/(1-1.2z^-1), pole at 1.2 (outside unit circle)
  // Step response: y[k]=sum_{i=0}^{k} 1.2^i — diverges
  const discUnstable = new DiscreteTransferFunction([1], [1, -1.2], 0.1);
  if (discUnstable.isStable()) throw new Error('D4 pole at 1.2 should be unstable');
  const discUnstableAnalysis = analyzeStability(discUnstable, { domain: 'z' });
  if (discUnstableAnalysis.status !== 'unstable') throw new Error('D4 analysis should be unstable');
  if (discUnstableAnalysis.risk !== 'critical') throw new Error('D4 analysis should be critical risk');
  assertNear('D4 pole re', discUnstable.poles()[0].re, 1.2, 1e-9);
  const d4Step = discreteStepResponse(discUnstable, { sampleCount: 6, amplitude: 1 });
  assertNear('D4 step y[0]', d4Step.y[0], 1.0, 1e-12);
  assertNear('D4 step y[5]', d4Step.y[5], 9.92992, 1e-9);
  if (d4Step.y[5] <= d4Step.y[0]) throw new Error('D4 unstable step response should diverge');

  // ── Discrete Case 5: system with explicit zero ────────────────────────────
  // G(z)=(0.5-0.3z^-1)/(1-0.5z^-1), zero at 0.6, pole at 0.5, DC gain=0.4
  const disc5 = new DiscreteTransferFunction([0.5, -0.3], [1, -0.5], 0.1);
  if (!disc5.isStable()) throw new Error('D5 pole at 0.5 should be stable');
  assertNear('D5 DC gain', disc5.dcGain(), 0.4, 1e-9);
  assertNear('D5 zero re', disc5.zeros()[0].re, 0.6, 1e-9);
  assertNear('D5 pole re', disc5.poles()[0].re, 0.5, 1e-9);
  const d5Step = discreteStepResponse(disc5, { sampleCount: 5, amplitude: 1 });
  [0.5, 0.45, 0.425, 0.4125, 0.40625].forEach((e, k) =>
    assertNear(`D5 step y[${k}]`, d5Step.y[k], e, 1e-9));

  console.log('Discrete transfer function tests passed (5 cases)');

  // ── C2D Case 1: Tustin on G(s)=1/(s+1), Ts=0.1 ────────────────────────────
  // G_d(z) = (1/21)(1+z^-1) / (1 - 19/21 z^-1); DC gain must equal G(0)=1
  const sys1c = new TransferFunction([1], [1, 1]);
  const tustin1 = c2dTustin(sys1c, 0.1);
  assertNear('Tustin1 DC gain', tustin1.dcGain(), 1, 1e-9);
  if (!tustin1.isStable()) throw new Error('Tustin1 discretized G(s)=1/(s+1) should be stable');
  assertNear('Tustin1 num[0]', tustin1.num[0], 1 / 21, 1e-9);
  assertNear('Tustin1 num[1]', tustin1.num[1], 1 / 21, 1e-9);
  assertNear('Tustin1 den[1]', tustin1.den[1], -19 / 21, 1e-9);
  assertNear('Tustin1 Ts', tustin1.sampleTime, 0.1, 1e-12);

  // ── C2D Case 2: Tustin on G(s)=1/(s^2+3s+2), Ts=0.05 ────────────────────
  // G(0)=0.5; Tustin must preserve DC gain
  const sys2c = new TransferFunction([1], [1, 3, 2]);
  const tustin2 = c2dTustin(sys2c, 0.05);
  assertNear('Tustin2 DC gain', tustin2.dcGain(), 0.5, 1e-9);
  if (!tustin2.isStable()) throw new Error('Tustin2 discretized 2nd-order should be stable');
  if (tustin2.poles().length !== 2) throw new Error('Tustin2 should have 2 poles');

  // ── C2D Case 3: ZOH on G(s)=1/(s+1), Ts=0.1 ─────────────────────────────
  // Standard ZOH: G_ZOH(z) = (1-zp)·z^-1 / (1 - zp·z^-1)
  // num=[0, (1-zp)], den=[1, -zp]; y[k] = y_c(k·Ts) = 1 - e^(-k·Ts)
  const zoh1 = c2dZOH(sys1c, 0.1);
  const expectedZp = Math.exp(-0.1);
  assertNear('ZOH1 DC gain', zoh1.dcGain(), 1, 1e-9);
  assertNear('ZOH1 pole', zoh1.poles()[0].re, expectedZp, 1e-9);
  assertNear('ZOH1 num[0]', zoh1.num[0], 0, 1e-12);
  assertNear('ZOH1 num[1]', zoh1.num[1], (1 - expectedZp), 1e-9);
  if (!zoh1.isStable()) throw new Error('ZOH1 should be stable');

  // ── C2D Case 3b: ZOH step response matches continuous y_c(k·Ts) ──────────
  // G(s)=1/(s+1): y_c(t) = 1 - e^(-t); ZOH must sample this exactly
  const zoh1Step = discreteStepResponse(zoh1, { sampleCount: 6, amplitude: 1 });
  for (let k = 0; k < 6; k++) {
    const yContinuous = 1 - Math.exp(-k * 0.1);
    assertNear(`ZOH step y[${k}] vs continuous`, zoh1Step.y[k], yContinuous, 1e-9);
  }

  // ── C2D Case 4: Tustin and ZOH agree on DC gain ──────────────────────────
  const sys3c = new TransferFunction([2], [1, 2]);
  const tustin3 = c2dTustin(sys3c, 0.05);
  const zoh3 = c2dZOH(sys3c, 0.05);
  assertNear('C2D DC gain match (Tustin)', tustin3.dcGain(), sys3c.dcGain(), 1e-9);
  assertNear('C2D DC gain match (ZOH)', zoh3.dcGain(), sys3c.dcGain(), 1e-9);

  console.log('C2D (Tustin/ZOH) tests passed');

  // ── Phase 3 Root Locus: G(s)=1/(s(s+1)(s+2)) classic case ────────────────
  // d/ds(s^3+3s^2+2s) = 3s^2+6s+2 = 0  →  s = -1 ± √3/3
  // breakaway at s≈-0.4226 (K≈0.3849); other root invalid (K<0)
  // Routh: K=6 → jω crossing at ω = ±√2
  const rlPlant = new TransferFunction([1], [1, 3, 2, 0]);
  const breakA = rootLocusBreakPoints(rlPlant);
  if (breakA.length !== 1) throw new Error(`Expected 1 breakaway, got ${breakA.length}`);
  assertNear('RL break s', breakA[0].s, -1 + Math.sqrt(3) / 3, 1e-6);
  assertNear('RL break K', breakA[0].K, 0.3849001794597505, 1e-6);
  if (breakA[0].kind !== 'breakaway') throw new Error('Expected breakaway kind');

  const crossA = rootLocusJwCrossings(rlPlant, 20, 600);
  if (crossA.length < 1) throw new Error('Expected at least 1 jω crossing');
  const primary = crossA.find((c) => Math.abs(c.K - 6) < 0.2);
  if (!primary) throw new Error(`Expected jω crossing near K=6, got ${JSON.stringify(crossA)}`);
  assertNear('RL jω crossing K', primary.K, 6, 0.05);
  assertNear('RL jω crossing ω', primary.omega, Math.sqrt(2), 0.02);

  // ── Phase 3 Root Locus: G(s)=1/(s(s+2)) — breakaway at midpoint ──────────
  const rlPlant2 = new TransferFunction([1], [1, 2, 0]);
  const breakB = rootLocusBreakPoints(rlPlant2);
  if (breakB.length !== 1) throw new Error(`Expected 1 breakaway in case B, got ${breakB.length}`);
  assertNear('RL2 break s', breakB[0].s, -1, 1e-9);
  assertNear('RL2 break K', breakB[0].K, 1, 1e-9);
  const crossB = rootLocusJwCrossings(rlPlant2, 100, 300);
  if (crossB.length !== 0) throw new Error('Case B should have no jω crossings (always stable)');

  // ── Phase 3: branch sorting keeps complex conjugates continuous ──────────
  // Build two synthetic steps where polyroots could return them swapped.
  const stepA = [{ re: 0, im: 1 }, { re: 0, im: -1 }];
  const stepB = [{ re: -0.1, im: -1.1 }, { re: -0.1, im: 1.1 }]; // swapped order
  const sortedBranches = sortRootLocusBranches([stepA, stepB]);
  if (sortedBranches[1][0].im < 0) throw new Error('Branch 0 should stay on positive imaginary side after sort');
  if (sortedBranches[1][1].im > 0) throw new Error('Branch 1 should stay on negative imaginary side after sort');

  console.log('Root Locus (break points / jω crossings / branch sort) tests passed');

  // ── Phase 4 design specs: %OS=16.3, Ts=2 → ζ=0.5, σ=2, ωn=4 ──────────────
  const spec1 = specsToTargetPoles({ overshoot: 16.3, settlingTime: 2 });
  assertNear('Spec1 zeta', spec1.zeta, 0.5, 5e-4);
  assertNear('Spec1 sigma', spec1.sigma, 2, 1e-9);
  assertNear('Spec1 omegaN', spec1.omegaN, 4, 5e-3);
  assertNear('Spec1 omegaD', spec1.omegaD, 2 * Math.sqrt(3), 5e-3);
  assertNear('Spec1 pole re', spec1.poles[0].re, -2, 1e-9);
  if (spec1.poles[0].im <= 0 || spec1.poles[1].im >= 0) {
    throw new Error('Spec1 poles must be conjugate pair');
  }

  // ── Phase 4 design specs: %OS=4.32, Ts=1 → ζ≈0.707 (ITAE-ish) ────────────
  const spec2 = specsToTargetPoles({ overshoot: 4.32, settlingTime: 1 });
  assertNear('Spec2 zeta', spec2.zeta, Math.SQRT1_2, 1e-3);
  assertNear('Spec2 sigma', spec2.sigma, 4, 1e-9);

  // ── Phase 4 Lead design: G(s)=1/(s(s+1)), targetPM=60° ───────────────────
  // Current PM ≈ 52° at ωc≈0.79; lead should raise PM toward 60°.
  const ldPlant = new TransferFunction([1], [1, 1, 0]);
  const ldBefore = stabilityMargins(ldPlant);
  if (ldBefore.phaseMargin > 60) throw new Error('Lead test plant should start below PM=60');
  const lead = designLeadForPM(ldPlant, { targetPM: 60, safetyMargin: 5 });
  if (!lead || lead.skipped) throw new Error('Lead design unexpectedly skipped');
  if (!(lead.alpha > 0 && lead.alpha < 1)) throw new Error('Lead alpha must be in (0,1)');
  if (lead.achievedPM < lead.currentPM) {
    throw new Error(`Lead failed to improve PM: ${lead.currentPM} → ${lead.achievedPM}`);
  }
  // With +5° safety, achieved PM should be close to (or above) target
  if (lead.achievedPM < 55) {
    throw new Error(`Lead PM achievement too weak: ${lead.achievedPM} (target ${lead.targetPM})`);
  }
  // Skip-path: when plant already satisfies PM, design returns skipped
  const easyPlant = new TransferFunction([1], [1, 1]); // 1/(s+1), PM = ∞
  const easy = designLeadForPM(easyPlant, { targetPM: 60 });
  if (!easy.skipped) throw new Error('Easy plant should skip lead design');

  console.log('Phase 4 (design specs / lead from PM) tests passed');

  // ── Phase 5 matExp: e^0 = I, e^(diag(a,b)) = diag(e^a, e^b) ───────────────
  const expI = matExp([[0, 0], [0, 0]]);
  assertNear('matExp(0)[0][0]', expI[0][0], 1, 1e-12);
  assertNear('matExp(0)[1][1]', expI[1][1], 1, 1e-12);
  const expDiag = matExp([[1, 0], [0, -2]]);
  assertNear('matExp(diag)[0][0]', expDiag[0][0], Math.exp(1), 1e-9);
  assertNear('matExp(diag)[1][1]', expDiag[1][1], Math.exp(-2), 1e-9);
  // Non-diagonal via similarity: A = P D P⁻¹ → e^A = P e^D P⁻¹
  // Easy check: A = [[0,1],[-1,0]] → e^A = [[cos1, sin1],[-sin1, cos1]]
  const expRot = matExp([[0, 1], [-1, 0]]);
  assertNear('matExp rot [0][0]', expRot[0][0], Math.cos(1), 1e-9);
  assertNear('matExp rot [0][1]', expRot[0][1], Math.sin(1), 1e-9);
  assertNear('matExp rot [1][0]', expRot[1][0], -Math.sin(1), 1e-9);

  // ── Phase 5 controllable canonical: G(s) = (s+1)/(s²+3s+2) ────────────────
  const ccf = tfToControllableCanonical([1, 1], [1, 3, 2]);
  if (ccf.A.length !== 2) throw new Error('CCF A should be 2x2');
  assertPolyNear('CCF A row 0', ccf.A[0], [0, 1]);
  assertPolyNear('CCF A row 1', ccf.A[1], [-2, -3]);
  assertPolyNear('CCF B', ccf.B.map(r => r[0]), [0, 1]);
  assertPolyNear('CCF C', ccf.C[0], [1, 1]);

  // ── Phase 5 high-order ZOH: G(s)=1/(s²+3s+2) at Ts=0.1 ────────────────────
  // 2nd-order ZOH must preserve DC gain and stability
  const gc2 = new TransferFunction([1], [1, 3, 2]);
  const dc2 = c2dZOH(gc2, 0.1);
  assertNear('ZOH 2nd DC gain', dc2.dcGain(), gc2.dcGain(), 1e-6);
  if (!dc2.isStable()) throw new Error('ZOH of stable 2nd-order should be stable');
  // y[0] must be 0 (one-sample delay from ZOH)
  const dc2Step = discreteStepResponse(dc2, { sampleCount: 120 });
  assertNear('ZOH 2nd y[0]', dc2Step.y[0], 0, 1e-12);
  // Steady-state matches DC gain (after >10 time constants)
  assertNear('ZOH 2nd y[∞]', dc2Step.y[dc2Step.y.length - 1], gc2.dcGain(), 5e-3);

  // ── Phase 5 high-order ZOH: G(s)=1/(s³+6s²+11s+6) at Ts=0.05 ─────────────
  const gc3 = new TransferFunction([1], [1, 6, 11, 6]);
  const dc3 = c2dZOH(gc3, 0.05);
  if (dc3.den.length !== 4) throw new Error(`3rd-order ZOH should yield 3rd-order DTF, got ${dc3.den.length - 1}`);
  if (!dc3.isStable()) throw new Error('ZOH of stable 3rd-order should be stable');
  assertNear('ZOH 3rd DC gain', dc3.dcGain(), gc3.dcGain(), 1e-6);

  // ── Phase 5 discrete Bode: G(z) = 1 has 0 dB / 0° everywhere ──────────────
  const unityZ = new DiscreteTransferFunction([1], [1], 0.1);
  const bodeU = discreteBodeData(unityZ, { samples: 50 });
  for (let i = 0; i < bodeU.magDB.length; i++) {
    assertNear(`unity Bode magDB[${i}]`, bodeU.magDB[i], 0, 1e-9);
    assertNear(`unity Bode phase[${i}]`, bodeU.phaseDeg[i], 0, 1e-9);
  }
  assertNear('Nyquist freq', bodeU.omegaNyquist, Math.PI / 0.1, 1e-12);

  // Discrete Bode of G(z) = z⁻¹ (pure unit delay): |G|=1, phase=-ωTs (rad)→deg
  const delayZ = new DiscreteTransferFunction([0, 1], [1], 0.1);
  const bodeD = discreteBodeData(delayZ, { samples: 100 });
  for (let i = 0; i < bodeD.mag.length; i++) {
    assertNear(`delay |G|[${i}]`, bodeD.mag[i], 1, 1e-9);
  }
  // Phase at ω = π/(2Ts): θ = -π/2 rad = -90°
  const halfIdx = Math.floor(bodeD.w.length * 0.5);
  // Check that phase is roughly linear: ph ≈ -ωTs * 180/π
  const expectedPh = -bodeD.w[halfIdx] * 0.1 * 180 / Math.PI;
  assertNear('delay phase mid', bodeD.phaseDeg[halfIdx], expectedPh, 1e-3);

  console.log('Phase 5 (matExp / CCF / high-order ZOH / discrete Bode) tests passed');

  // ── Phase 5 Deadbeat: G(s)=1/(s²+3s+2), Ts=0.1 → all CL eigenvalues at 0 ─
  const dbPlant = new TransferFunction([1], [1, 3, 2]);
  const db = deadbeatGain(dbPlant, 0.1);
  if (db.K.length !== 2) throw new Error('Deadbeat K should be 1×n');
  // Closed-loop A_cl = A − B·K; all eigenvalues must be at 0 (i.e. A_cl² = 0)
  const Bk = db.B.map((row, i) => db.A[i].map((_, j) => row[0] * db.K[j]));
  const Acl = matSub(db.A, Bk);
  const Acl2 = matMul(Acl, Acl);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      assertNear(`Deadbeat A_cl²[${i}][${j}]`, Acl2[i][j], 0, 1e-9);
    }
  }
  console.log('Phase 5 Deadbeat test passed');

  // ── Phase 7 Lyapunov: A=[0 1; -2 -3], Q=I has analytic P > 0 ─────────────
  // Solve A^T P + P A = -I with P symmetric:
  // P = [[1.25, 0.25], [0.25, 0.25]]
  const lyA = [[0, 1], [-2, -3]];
  const lyQ = [[1, 0], [0, 1]];
  const ly = analyzeLyapunov(lyA, lyQ);
  if (!ly.provenStable) throw new Error('Lyapunov proof should succeed for stable A');
  assertNear('Lyapunov P11', ly.P[0][0], 1.25, 1e-9);
  assertNear('Lyapunov P12', ly.P[0][1], 0.25, 1e-9);
  assertNear('Lyapunov P22', ly.P[1][1], 0.25, 1e-9);
  if (ly.minEigenvalue <= 0) throw new Error('Lyapunov P should be positive definite');
  if (ly.residualNorm > 1e-8) throw new Error(`Lyapunov residual too large: ${ly.residualNorm}`);

  // Unstable A should fail positive-definite proof under Q=I
  const lyUnstable = analyzeLyapunov([[0, 1], [2, 1]], lyQ);
  if (lyUnstable.provenStable) throw new Error('Lyapunov proof should fail for unstable A');

  // ── Phase 7 Pole Placement: desired poles -4, -5 → K = [18, 6] ───────────
  const sfModel = {
    A: [[0, 1], [-2, -3]],
    B: [[0], [1]],
    C: [[1, 0]],
    D: [[0]],
  };
  const placed = placeStateFeedback(sfModel.A, sfModel.B, '-4, -5');
  assertNear('Pole placement K1', placed.K[0][0], 18, 1e-9);
  assertNear('Pole placement K2', placed.K[0][1], 6, 1e-9);
  const placedTf = closedLoopTransferFromStateFeedback(sfModel, placed.K);
  assertPolyNear('Placed CL denominator', placedTf.den, [1, 9, 20]);
  const placedPoles = placedTf.poles().map((p) => p.re).sort((a, b) => a - b);
  assertNear('Placed pole 0', placedPoles[0], -5, 1e-6);
  assertNear('Placed pole 1', placedPoles[1], -4, 1e-6);

  // ── Phase 7 LQR: same plant, Q=I, R=1 has analytic K = [sqrt(5)-2, sqrt(5)-2]
  // From CARE:
  // A^T P + P A - P B B^T P + I = 0
  // K = R^-1 B^T P = [sqrt(5)-2, sqrt(5)-2]
  const lqr = solveLqr(sfModel.A, sfModel.B, lyQ, [[1]]);
  assertNear('LQR K1', lqr.K[0][0], Math.sqrt(5) - 2, 1e-6);
  assertNear('LQR K2', lqr.K[0][1], Math.sqrt(5) - 2, 1e-6);
  if (lqr.riccatiResidualNorm > 1e-6) {
    throw new Error(`LQR Riccati residual too large: ${lqr.riccatiResidualNorm}`);
  }
  const lqrTf = closedLoopTransferFromStateFeedback(sfModel, lqr.K);
  if (!lqrTf.isStable()) throw new Error('LQR closed-loop should be stable');

  console.log('Phase 7 (Lyapunov / Pole Placement / LQR) tests passed');

  // ── Phase 8 (Observer / Kalman) ───────────────────────────────────────────
  const obsModel = {
    A: [[0, 1], [-2, -3]],
    B: [[0], [1]],
    C: [[1, 0]],
    D: [[0]],
  };

  // Test 1: Luenberger observer for simple 2nd-order system
  // A = [[0,1],[-2,-3]], C = [[1,0]], desired observer poles: -4, -5
  // By duality: K_dual places poles of A^T - C^T*K = eig at -4,-5
  // => L = K_dual^T, eig(A - L*C) = [-4, -5]
  const obs = placeObserver(obsModel.A, obsModel.C, '-4, -5');
  if (obs.observabilityRank !== 2) throw new Error(`Observer rank should be 2, got ${obs.observabilityRank}`);
  // Verify eig(Aobs) ≈ [-4, -5]: trace = -9, det = 20
  const Aobs1 = obs.Aobs;
  const traceAobs1 = Aobs1[0][0] + Aobs1[1][1];
  const detAobs1 = Aobs1[0][0] * Aobs1[1][1] - Aobs1[0][1] * Aobs1[1][0];
  assertNear('Observer Aobs trace (= -4 + -5)', traceAobs1, -9, 1e-6);
  assertNear('Observer Aobs det (= (-4)*(-5))', detAobs1, 20, 1e-6);

  // Test 2: LQE (Kalman) dual of LQR
  // Same system, Qn = I, Rn = 1
  // Verify: L_kf produces stable Aobs (all eigenvalues have negative real part)
  const kf = solveLqe(obsModel.A, obsModel.C, [[1, 0], [0, 1]], [[1]]);
  const traceAobsKf = kf.Aobs[0][0] + kf.Aobs[1][1];
  const detAobsKf = kf.Aobs[0][0] * kf.Aobs[1][1] - kf.Aobs[0][1] * kf.Aobs[1][0];
  // Stable: trace < 0 and det > 0 (for 2x2 real system)
  if (traceAobsKf >= 0) throw new Error(`Kalman Aobs trace should be negative (stable), got ${traceAobsKf}`);
  if (detAobsKf <= 0) throw new Error(`Kalman Aobs det should be positive (stable), got ${detAobsKf}`);
  if (kf.riccatiResidualNorm > 1e-6) throw new Error(`LQE Riccati residual too large: ${kf.riccatiResidualNorm}`);

  // Test 3: simulateObserver convergence
  // Plant starts at x0=[1,0], observer starts at x̂=0 (wrong IC).
  // After 10s with stable Luenberger observer (poles -4,-5),
  // eNorm at t=10s should be < 0.01 * eNorm at t=0.5s.
  const simResult = simulateObserver(obsModel, obs.L, {
    duration: 10,
    dt: 0.01,
    u: () => 1,
    x0: [1, 0],   // non-zero plant IC
    xhat0: [0, 0], // observer starts at wrong IC
  });
  const idx05 = Math.round(0.5 / 0.01); // index for t≈0.5s
  const eNormEarly = simResult.eNorm[idx05] || simResult.eNorm[1];
  const eNormFinal = simResult.eNorm[simResult.eNorm.length - 1];
  if (eNormFinal > 0.01 * eNormEarly) {
    throw new Error(`Observer did not converge: eNorm(10s)=${eNormFinal} should be < 0.01 * eNorm(0.5s)=${eNormEarly}`);
  }
  if (simResult.t.length < 10) throw new Error('simulateObserver returned too few time points');

  console.log('Phase 8 (Observer / Kalman) tests passed');

  // ── Audit follow-ups: analytical verification cases ──────────────────────

  // (A) Bode of 1/(s+1) at ω=1: |G|=1/√2 (-3.0103 dB), phase=-45°
  const a1 = new TransferFunction([1], [1, 1]);
  // Hit ω=1 exactly: ask for 2 points at the same frequency.
  const a1Bode = bodeData(a1, 1, 1, 2);
  assertNear('1/(s+1) magDB at ω=1', a1Bode.magDB[0], -3.0103, 1e-3);
  assertNear('1/(s+1) phase at ω=1', a1Bode.phaseDeg[0], -45, 1e-3);

  // (B) Tustin always preserves DC gain across orders
  for (const sysC of [new TransferFunction([2], [1, 2]), new TransferFunction([1, 3], [1, 3, 2]), new TransferFunction([1], [1, 6, 11, 6])]) {
    const td = c2dTustin(sysC, 0.05);
    assertNear(`Tustin DC gain preserved (order ${sysC.den.length - 1})`, td.dcGain(), sysC.dcGain(), 1e-9);
  }

  // (C) Nyquist encirclements: K/(s+1)^3 with K=10 is closed-loop unstable
  // (s+1)^3 + 10 = 0 → 1 real and 2 RHP roots, Z=2, P=0 → N=2 CW encirclements
  const cubic = new TransferFunction([10], [1, 3, 3, 1]);
  const Nenc = nyquistEncirclements(cubic);
  if (Nenc !== 2) throw new Error(`Expected N=2 for 10/(s+1)^3, got ${Nenc}`);
  // And the K=1 case (closed-loop stable) gives N=0
  const cubic0 = new TransferFunction([1], [1, 3, 3, 1]);
  const Nenc0 = nyquistEncirclements(cubic0);
  if (Nenc0 !== 0) throw new Error(`Expected N=0 for 1/(s+1)^3, got ${Nenc0}`);

  // (D) Cohen-Coon outside valid range must throw rather than return negative Td
  let threwOnHighR = false;
  try { PIDController.cohenCoon(1, 1, 2); } catch { threwOnHighR = true; }
  if (!threwOnHighR) throw new Error('Cohen-Coon should refuse r > 1.2');

  // (E) stepInfo SSE with explicit reference (no longer hard-coded to 1)
  // Steady-state output 2 vs reference 2 → SSE = 0; vs reference 1 (legacy) → SSE = 1.
  const fakeT = Array.from({ length: 100 }, (_, i) => i * 0.1);
  const fakeY = fakeT.map((t) => (t < 0.1 ? 0 : 2));
  const infoExplicit = stepInfo(fakeT, fakeY, 2, 2);
  assertNear('stepInfo SSE with ref=2', infoExplicit.steadyStateError, 0, 1e-12);
  const infoLegacy = stepInfo(fakeT, fakeY, 2);
  assertNear('stepInfo SSE legacy default ref=1', infoLegacy.steadyStateError, 1, 1e-12);

  // (F) Discrete TF: causal pure-delay G(z) = z⁻¹/(1 + 0·z⁻¹) has 1 pole at z=0
  const delayOnly = new DiscreteTransferFunction([0, 1], [1, 0], 0.1);
  const dPoles = delayOnly.poles();
  if (dPoles.length !== 1 || Math.abs(dPoles[0].re) > 1e-9 || Math.abs(dPoles[0].im) > 1e-9) {
    throw new Error(`Expected single pole at z=0 for causal pure delay, got ${JSON.stringify(dPoles)}`);
  }

  console.log('Audit follow-up tests passed');

  console.log('Tests Passed!');
} catch (e) {
  console.error('Error:', e);
  process.exitCode = 1;
}
