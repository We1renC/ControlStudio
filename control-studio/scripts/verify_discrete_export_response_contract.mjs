#!/usr/bin/env node
/**
 * verify_discrete_export_response_contract.mjs
 *
 * Guards z-domain analysis export semantics:
 * - discrete exports must not label step data as arbitrary requested waveforms.
 * - step / impulse are routed through their discrete difference-equation engines.
 * - unsupported discrete export waveforms are explicitly normalized to step.
 * - step metrics are invalidated for discrete impulse exports.
 * - non-finite stability margins are exported with explicit status fields.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DiscreteTransferFunction } from '../js/control/discrete-transfer-function.js';
import { discreteImpulseResponse, discreteStepResponse } from '../js/analysis/discrete-response.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const errors = [];

function ok(label) {
  console.log(`  ✓ ${label}`);
  pass++;
}

function bad(label, msg = 'condition failed') {
  console.error(`  ✗ ${label}: ${msg}`);
  fail++;
  errors.push(label);
}

function assert(cond, label, msg = '') {
  cond ? ok(label) : bad(label, msg);
}

function sectionBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return '';
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? src.slice(start) : src.slice(start, end);
}

console.log('\n▶ Discrete export response contract');

const appJs = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const importSection = sectionBetween(appJs, 'import {', '// ── P34-01');
const discreteResponseTypeSection = sectionBetween(appJs, 'function discreteAnalysisResponseType', 'function stepMetricReference');
const analysisExportSection = sectionBetween(appJs, 'function buildCurrentAnalysisExport', 'function exportCurrentResult');
const exportNumberSection = sectionBetween(appJs, 'function exportFiniteNumber', 'function buildCurrentAnalysisExport');

assert(
  importSection.includes('discreteImpulseResponse') &&
    importSection.includes('discreteStepResponse'),
  'app imports both discrete step and impulse response engines',
);

assert(
  discreteResponseTypeSection.includes("return responseType === 'impulse' ? 'impulse' : 'step';") &&
    discreteResponseTypeSection.includes('function currentDiscreteResponseData') &&
    discreteResponseTypeSection.includes('const effectiveType = discreteAnalysisResponseType(responseType);') &&
    discreteResponseTypeSection.includes('discreteImpulseResponse(sys, options)') &&
    discreteResponseTypeSection.includes('discreteStepResponse(sys, options)'),
  'discrete export response helper routes impulse and normalizes unsupported waveforms to step',
);

assert(
  analysisExportSection.includes('const discreteAnalysis = isDiscrete ? currentDiscreteResponseData(sys) : null;') &&
    analysisExportSection.includes('const responseType = isDiscrete ? discreteAnalysis.responseType : state.responseType;') &&
    analysisExportSection.includes('const response = isDiscrete ? discreteAnalysis.response : currentResponseData(sys);') &&
    analysisExportSection.includes('responseType,') &&
    analysisExportSection.includes('requestedResponseType: state.responseType') &&
    !analysisExportSection.includes('responseType: state.responseType,'),
  'analysis export records effective discrete response type and requested response type separately',
);

assert(
  analysisExportSection.includes("isDiscrete && responseType !== 'step'") &&
    analysisExportSection.includes('step metrics require step input; got ${responseType}'),
  'discrete non-step exports do not report valid step metrics',
);

assert(
  exportNumberSection.includes("if (value === Infinity) return 'positive_infinity';") &&
    exportNumberSection.includes("if (value === -Infinity) return 'negative_infinity';") &&
    exportNumberSection.includes("if (Number.isNaN(value)) return 'undefined';") &&
    analysisExportSection.includes('gainMarginDB: exportFiniteNumber(margins.gainMarginDB)') &&
    analysisExportSection.includes('gainMarginDBStatus: exportNumberStatus(margins.gainMarginDB)') &&
    analysisExportSection.includes('phaseMargin: exportFiniteNumber(margins.phaseMargin)') &&
    analysisExportSection.includes('phaseMarginStatus: exportNumberStatus(margins.phaseMargin)'),
  'analysis export preserves non-finite margin semantics with explicit status fields',
);

assert(
  analysisExportSection.includes('stepMetricsValid: info.valid !== false') &&
    analysisExportSection.includes('stepMetricsReason: info.reason || null'),
  'analysis export records whether response metrics are valid for the selected waveform',
);

const g = new DiscreteTransferFunction([0.5], [1, -0.5], 0.2);
const step = discreteStepResponse(g, { sampleCount: 5, amplitude: 2 });
const impulse = discreteImpulseResponse(g, { sampleCount: 5, amplitude: 2 });
assert(
  step.t[1] === 0.2 &&
    step.y[0] === 1 &&
    step.y[1] === 1.5 &&
    impulse.y[0] === 1 &&
    impulse.y[1] === 0.5 &&
    impulse.y[2] === 0.25,
  'discrete step and impulse fixtures differ as expected for 0.5/(1-0.5z^-1)',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ Discrete export response contract — all checks passed');
