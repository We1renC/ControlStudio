import { TransferFunction } from './control-studio/js/control/transfer-function.js';
import { DiscreteTransferFunction } from './control-studio/js/control/discrete-transfer-function.js';
import { discreteStepResponse, discreteImpulseResponse } from './control-studio/js/analysis/discrete-response.js';
import { impulseResponse, rampResponse, simulateTimeResponse, stepResponse } from './control-studio/js/analysis/time-response.js';
import { nyquistData, autoFreqRange, nicholsData, nyquistEncirclements } from './control-studio/js/analysis/frequency-response.js';
import { rootLocusAsymptotes } from './control-studio/js/analysis/root-locus.js';
import { stateSpaceToTransferFunction, controllabilityMatrix, observabilityMatrix } from './control-studio/js/control/state-space.js';
import { stepInfo, stabilityMargins, routhTable } from './control-studio/js/control/stability.js';
import { PIDController } from './control-studio/js/control/pid.js';
import { designLagCompensator, designLeadCompensator, leadLagTransferFunction } from './control-studio/js/control/compensator.js';
import { parsePolyString } from './control-studio/js/utils/format.js';
import { zpkToTransferFunction, parseRootsString, parseComplexRoot } from './control-studio/js/control/zpk.js';
import { polydiv, polymul } from './control-studio/js/math/polynomial.js';
import { c2dTustin, c2dZOH } from './control-studio/js/control/c2d.js';
import { matRank } from './control-studio/js/math/matrix.js';

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

  console.log('Tests Passed!');
} catch (e) {
  console.error('Error:', e);
  process.exitCode = 1;
}
