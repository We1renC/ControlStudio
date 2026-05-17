#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stepResponse } from '../js/analysis/time-response.js';
import { rootLocusBreakPoints, rootLocusJwCrossings } from '../js/analysis/root-locus.js';
import { leadLagTransferFunction } from '../js/control/compensator.js';
import { PIDController } from '../js/control/pid.js';
import { stepInfo, stabilityMargins } from '../js/control/stability.js';
import { TransferFunction } from '../js/control/transfer-function.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '../..');
const outputDir = join(rootDir, 'outputs/controlstudio');
mkdirSync(outputDir, { recursive: true });

const plant = new TransferFunction([50, 400], [1, 4.08, 327.456, 388.8, 0]);

const cases = [
  {
    id: 'conservative-baseline',
    controller: { Kp: 0.5, Ki: 0, Kd: 0, N: 100 },
    compensator: {},
  },
  {
    id: 'pid-lead-selected',
    controller: { Kp: 1.2, Ki: 0, Kd: 0.04, N: 100 },
    compensator: { mode: 'lead', gain: 1, tau: 0.2, alpha: 0.1 },
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  scenario: 'precision-servo-stage-position-control',
  plant: {
    description: '50(s + 8) / [s(s + 1.2)(s^2 + 2*0.08*18*s + 18^2)]',
    formula: plant.toString(),
    numerator: plant.num,
    denominator: plant.den,
    poles: plant.poles(),
    zeros: plant.zeros(),
  },
  rootLocus: {
    breakPoints: rootLocusBreakPoints(plant),
    jwCrossings: rootLocusJwCrossings(plant),
  },
  candidates: cases.map((candidate) => evaluateCandidate(candidate)),
};

const outputPath = join(outputDir, 'precision-servo-stage-case.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Servo stage scenario report: ${outputPath}`);
console.log(JSON.stringify({
  scenario: report.scenario,
  plant: report.plant.formula,
  candidates: report.candidates.map((candidate) => ({
    id: candidate.id,
    stable: candidate.stable,
    phaseMargin: round(candidate.metrics.phaseMargin),
    gainMarginDB: round(candidate.metrics.gainMarginDB),
    gainCrossover: round(candidate.metrics.gainCrossover),
    riseTime: round(candidate.metrics.riseTime),
    settlingTime: round(candidate.metrics.settlingTime),
    overshoot: round(candidate.metrics.overshoot),
    steadyStateError: round(candidate.metrics.steadyStateError),
  })),
}, null, 2));

function evaluateCandidate(candidate) {
  const pid = new PIDController(
    candidate.controller.Kp,
    candidate.controller.Ki,
    candidate.controller.Kd,
    candidate.controller.N,
  );
  const compensator = leadLagTransferFunction(candidate.compensator);
  const controller = pid.toTransferFunction().series(compensator);
  const openLoop = controller.series(plant);
  const closedLoop = openLoop.feedback();
  const response = stepResponse(closedLoop, { duration: 12, sampleCount: 1200 });
  const info = stepInfo(response.t, response.y);
  const margins = stabilityMargins(openLoop);
  const dominantPole = closedLoop.poles().sort((a, b) => b.re - a.re)[0];
  const naturalFrequency = Math.hypot(dominantPole.re, dominantPole.im);

  return {
    id: candidate.id,
    controllerConfig: candidate.controller,
    compensatorConfig: candidate.compensator,
    controller: controller.toString(),
    openLoop: openLoop.toString(),
    closedLoop: closedLoop.toString(),
    stable: closedLoop.isStable(),
    metrics: {
      phaseMargin: margins.phaseMargin,
      gainMarginDB: margins.gainMarginDB,
      gainCrossover: margins.gainCrossover,
      phaseCrossover: margins.phaseCrossover,
      riseTime: info.riseTime,
      settlingTime: info.settlingTime,
      overshoot: info.overshoot,
      steadyStateError: info.steadyStateError,
      finalValue: info.finalValue,
      dominantPole,
      dampingRatio: naturalFrequency > 0 ? -dominantPole.re / naturalFrequency : null,
    },
  };
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
}
