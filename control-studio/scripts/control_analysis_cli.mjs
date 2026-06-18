import { TransferFunction } from '../js/control/transfer-function.js';
import { stateSpaceToTransferFunction } from '../js/control/state-space.js';
import { PIDController } from '../js/control/pid.js';
import { leadLagTransferFunction } from '../js/control/compensator.js';
import { impulseResponse, rampResponse, stepResponse, simulateTimeResponse } from '../js/analysis/time-response.js';
import { bodeData, nyquistData } from '../js/analysis/frequency-response.js';
import { rootLocusData } from '../js/analysis/root-locus.js';
import { stabilityMargins, stepInfo } from '../js/control/stability.js';

function buildPlant(system) {
  if (system?.type === 'state_space') {
    return stateSpaceToTransferFunction(system.A, system.B, system.C, system.D);
  }
  return new TransferFunction(system?.num ?? [1], system?.den ?? [1, 3, 2]);
}

function buildController(controller) {
  if (!controller || controller.type !== 'pid') return null;
  const pid = new PIDController(controller.Kp ?? 1, controller.Ki ?? 0.5, controller.Kd ?? 0.1, controller.N ?? 100);
  const compensator = leadLagTransferFunction(controller.compensator ?? {});
  const tf = pid.toTransferFunction().series(compensator);
  return { toTransferFunction: () => tf };
}

function selectResponse(system, waveform, config) {
  if (waveform === 'impulse') return impulseResponse(system, config);
  if (waveform === 'ramp') return rampResponse(system, config);
  if (waveform === 'sine' || waveform === 'square' || waveform === 'pulse') {
    return simulateTimeResponse(system, waveform, config);
  }
  return stepResponse(system, config);
}

function responseMetrics(response, waveform) {
  if (waveform !== 'step') {
    return {
      riseTime: null,
      settlingTime: null,
      overshoot: null,
      steadyStateError: null,
      valid: false,
      reason: `step metrics require step input; got ${waveform}`,
    };
  }
  return stepInfo(response.t, response.y);
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ error: 'Missing JSON payload' }));
    process.exit(1);
  }

  const request = JSON.parse(raw);
  const plant = buildPlant(request.system);
  const controller = buildController(request.controller);
  const openLoop = controller ? controller.toTransferFunction().series(plant) : plant;
  const closedLoop = controller ? openLoop.feedback() : plant;
  const mode = request.simulation?.mode === 'open_loop' ? 'open_loop' : 'closed_loop';
  const waveform = request.simulation?.inputWaveform ?? 'step';
  const targetSystem = mode === 'closed_loop' ? closedLoop : openLoop;
  const response = selectResponse(targetSystem, waveform, request.simulation);
  const metrics = responseMetrics(response, waveform);
  const margins = stabilityMargins(openLoop);

  const output = {
    system: {
      plant: { numerator: plant.num, denominator: plant.den, formula: plant.toString() },
      openLoop: { numerator: openLoop.num, denominator: openLoop.den, formula: openLoop.toString() },
      closedLoop: { numerator: closedLoop.num, denominator: closedLoop.den, formula: closedLoop.toString() },
    },
    response,
    metrics: {
      ...metrics,
      gainMarginDB: margins.gainMarginDB,
      phaseMargin: margins.phaseMargin,
    },
    bode: bodeData(openLoop),
    nyquist: nyquistData(openLoop),
    rootLocus: rootLocusData(plant),
  };

  process.stdout.write(JSON.stringify(output));
}

main();
