import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TransferFunction } from '../js/control/transfer-function.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
import { PIDController } from '../js/control/pid.js';
import { leadLagTransferFunction } from '../js/control/compensator.js';
import { stateSpaceToTransferFunction, controllabilityMatrix, observabilityMatrix } from '../js/control/state-space.js';
import { bodeData } from '../js/analysis/frequency-response.js';
import { stepResponse } from '../js/analysis/time-response.js';
import { stabilityMargins, stepInfo } from '../js/control/stability.js';
import { polydiv } from '../js/math/polynomial.js';
import { matRank } from '../js/math/matrix.js';
import { CONTROL_VERIFICATION_CASES } from '../js/verification/verification-cases.js';

const results = [];

function assertNear(name, actual, expected, tolerance = 1e-6) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertPolyNear(name, actual, expected, tolerance = 1e-6) {
  if (!actual || actual.length !== expected.length) {
    throw new Error(`${name}: expected length ${expected.length}, got ${actual?.length}`);
  }
  actual.forEach((value, idx) => assertNear(`${name}[${idx}]`, value, expected[idx], tolerance));
}

function assertRootSet(name, actual, expected, tolerance = 1e-5) {
  const unmatched = [...actual];
  expected.forEach((target) => {
    const idx = unmatched.findIndex((root) => (
      Math.abs(root.re - target.re) <= tolerance && Math.abs(root.im - target.im) <= tolerance
    ));
    if (idx < 0) {
      throw new Error(`${name}: missing root ${JSON.stringify(target)} in ${JSON.stringify(actual)}`);
    }
    unmatched.splice(idx, 1);
  });
}

function buildPlant(system) {
  if (system.type === 'state_space') {
    return stateSpaceToTransferFunction(system.A, system.B, system.C, system.D);
  }
  return new TransferFunction(system.num, system.den);
}

function buildController(controller) {
  if (!controller) return null;
  const pid = new PIDController(controller.Kp ?? 1, controller.Ki ?? 0, controller.Kd ?? 0, controller.N ?? 100);
  const compensator = leadLagTransferFunction(controller.compensator ?? {});
  return pid.toTransferFunction().series(compensator);
}

function runCli(payload) {
  const raw = execFileSync(process.execPath, ['control-studio/scripts/control_analysis_cli.mjs', JSON.stringify(payload)], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

function verifyCase(testCase) {
  const checks = [];
  const record = (name, fn) => {
    fn();
    checks.push(name);
  };

  const { payload, expected } = testCase;
  const plant = buildPlant(payload.system);
  const controller = buildController(payload.controller);
  const openLoop = controller ? controller.series(plant) : plant;
  const closedLoop = controller ? openLoop.feedback() : plant;
  const targetSystem = payload.simulation?.mode === 'open_loop' ? plant : closedLoop;
  const response = stepResponse(targetSystem, payload.simulation);
  const info = stepInfo(response.t, response.y);
  const margins = stabilityMargins(openLoop);

  record('plant numerator', () => assertPolyNear('plant numerator', plant.num, expected.plant.num));
  record('plant denominator', () => assertPolyNear('plant denominator', plant.den, expected.plant.den));
  record('plant poles', () => assertRootSet('plant poles', plant.poles(), expected.plant.poles));
  if (expected.plant.zeros) {
    record('plant zeros', () => assertRootSet('plant zeros', plant.zeros(), expected.plant.zeros));
  }
  record('plant stability', () => {
    if (plant.isStable() !== expected.plant.stable) {
      throw new Error(`plant stable expected ${expected.plant.stable}, got ${plant.isStable()}`);
    }
  });
  if (typeof expected.plant.dcGain === 'number') {
    record('plant dc gain', () => assertNear('plant dc gain', plant.dcGain(), expected.plant.dcGain, 1e-6));
  }
  if (expected.closedLoop) {
    if (expected.closedLoop.unreducedNum) {
      record('closed-loop numerator', () => assertPolyNear('closed-loop numerator', closedLoop.num, expected.closedLoop.unreducedNum));
    }
    if (expected.closedLoop.unreducedDen) {
      record('closed-loop denominator', () => assertPolyNear('closed-loop denominator', closedLoop.den, expected.closedLoop.unreducedDen));
    }
    if (expected.closedLoop.filterCancellation) {
      const reducedNum = polydiv(closedLoop.num, expected.closedLoop.filterCancellation);
      const reducedDen = polydiv(closedLoop.den, expected.closedLoop.filterCancellation);
      record('reduced closed-loop numerator', () => assertPolyNear('reduced closed-loop numerator', reducedNum.quotient, expected.closedLoop.reducedNum));
      record('reduced closed-loop denominator', () => assertPolyNear('reduced closed-loop denominator', reducedDen.quotient, expected.closedLoop.reducedDen));
      record('closed-loop cancellation remainders', () => {
        assertPolyNear('closed-loop numerator remainder', reducedNum.remainder, [0]);
        assertPolyNear('closed-loop denominator remainder', reducedDen.remainder, [0]);
      });
    }
    if (expected.closedLoop.poles) {
      record('closed-loop poles', () => assertRootSet('closed-loop poles', closedLoop.poles(), expected.closedLoop.poles));
    }
    record('closed-loop stability', () => {
      if (closedLoop.isStable() !== expected.closedLoop.stable) {
        throw new Error(`closed-loop stable expected ${expected.closedLoop.stable}, got ${closedLoop.isStable()}`);
      }
    });
  }
  if (expected.stateSpace) {
    const { A, B, C } = payload.system;
    record('state-space controllability rank', () => assertNear('controllability rank', matRank(controllabilityMatrix(A, B)), expected.stateSpace.controllabilityRank, 0));
    record('state-space observability rank', () => assertNear('observability rank', matRank(observabilityMatrix(A, C)), expected.stateSpace.observabilityRank, 0));
  }
  if (expected.response) {
    record('response final value', () => assertNear('response final value', response.y[response.y.length - 1], expected.response.finalValue, expected.response.tolerance));
    if (typeof expected.response.inverseResponseBelow === 'number') {
      record('inverse response trend', () => {
        const earlyMin = Math.min(...response.y.slice(1, Math.min(30, response.y.length)));
        if (earlyMin >= expected.response.inverseResponseBelow) {
          throw new Error(`inverse response expected below ${expected.response.inverseResponseBelow}, got ${earlyMin}`);
        }
      });
    }
  }
  if (expected.stepInfo) {
    record('step overshoot', () => assertNear('overshoot', info.overshoot, expected.stepInfo.overshoot, expected.stepInfo.overshootTolerance));
    record('step settling time', () => assertNear('settling time', info.settlingTime, expected.stepInfo.settlingTime, expected.stepInfo.settlingTolerance));
  }
  if (expected.bode) {
    const bode = bodeData(openLoop, 1e-2, 1e2, 300);
    record('bode low-frequency magnitude', () => assertNear('low-frequency magnitude', bode.magDB[0], expected.bode.lowFrequencyMagDB, expected.bode.tolerance));
  }
  if (expected.margins) {
    record('phase margin', () => assertNear('phase margin', margins.phaseMargin, expected.margins.phaseMargin, expected.margins.tolerance));
  }

  const cli = runCli(payload);
  record('CLI plant formula', () => {
    if (cli.system.plant.formula !== expected.cli.plantFormula) {
      throw new Error(`CLI plant formula expected ${expected.cli.plantFormula}, got ${cli.system.plant.formula}`);
    }
  });
  record('CLI closed-loop formula', () => {
    if (cli.system.closedLoop.formula !== expected.cli.closedLoopFormula) {
      throw new Error(`CLI closed-loop formula expected ${expected.cli.closedLoopFormula}, got ${cli.system.closedLoop.formula}`);
    }
  });

  return {
    id: testCase.id,
    title: testCase.title,
    checks: checks.length,
    observed: {
      plant: plant.toString(),
      closedLoop: closedLoop.toString(),
      finalValue: response.y[response.y.length - 1],
      overshoot: info.overshoot,
      phaseMargin: margins.phaseMargin,
    },
  };
}

try {
  for (const testCase of CONTROL_VERIFICATION_CASES) {
    const result = verifyCase(testCase);
    results.push(result);
    console.log(`[PASS] ${result.id}: ${result.checks} checks`);
  }
  console.log(`Verification fixtures passed: ${results.length}/${CONTROL_VERIFICATION_CASES.length}`);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ success: true, results }, null, 2));
  }
} catch (err) {
  console.error(`[FAIL] ${err.message}`);
  if (process.argv.includes('--json')) {
    console.error(JSON.stringify({ success: false, error: err.message, results }, null, 2));
  }
  process.exitCode = 1;
}

