#!/usr/bin/env node
/**
 * verify_ui_formula_contract.mjs
 *
 * Guards display/math contracts for UI equations:
 * - Continuous transfer functions use s-polynomial notation.
 * - Discrete transfer functions use z^-1 delay-polynomial notation.
 * - DTF system and loop labels render as G(z), L(z), and T(z).
 * - DTF sample time is preserved in codegen, project persistence, and exports.
 * - Smoke diagnostics must not require a closed-loop model when the effective
 *   runtime mode is open_loop.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

const appJs = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const formatPolySection = sectionBetween(appJs, 'function formatPolyText', 'function renderStateSpaceEquationBlock');
const setupCopySection = sectionBetween(appJs, 'function updateSystemSetupCopy', 'function updateSystem');
const discreteStepSection = sectionBetween(appJs, 'function renderDiscreteStepChart', 'function updateDomainUI');
const sampleTimeSection = sectionBetween(appJs, 'function currentDiscreteSampleTime', 'function saveSessionToStorage');
const codegenPayloadSection = sectionBetween(appJs, 'function buildCodegenPayload', 'function renderAllLatexFractions');
const projectPayloadSection = sectionBetween(appJs, 'function buildProjectPayload', 'function applyProjectPayload');
const projectApplySection = sectionBetween(appJs, 'function applyProjectPayload', 'function buildCurrentAnalysisExport');
const analysisExportSection = sectionBetween(appJs, 'function buildCurrentAnalysisExport', 'function exportCurrentResult');
const markdownReportSection = sectionBetween(appJs, 'function renderMarkdownReport', 'function downloadFile');
const projectManagerSerializeSection = sectionBetween(appJs, 'function _serializeProject', 'function _loadProjectList');
const projectManagerLoadSection = sectionBetween(appJs, 'function loadProject', 'function deleteProject');
const smokeSection = sectionBetween(appJs, 'function runControlStudioSmoke', 'function writeSmokeDiagnostics');

console.log('\n▶ UI formula contract');

assert(
  formatPolySection.includes("function formatPolyText(coeffs, variable = 's')") &&
    formatPolySection.includes('function formatDelayPolyText(coeffs)') &&
    formatPolySection.includes("'z^-1'") &&
    formatPolySection.includes('function delayPolyToLatexText(coeffs)') &&
    formatPolySection.includes("'z^{-1}'") &&
    formatPolySection.includes("const isDelayForm = tf instanceof DiscreteTransferFunction || variable === 'z^-1';"),
  'equation formatter supports continuous and z^-1 delay-polynomial display',
);

assert(
  setupCopySection.includes("const isDiscretePlant = state.domain === 'z' || plantTf instanceof DiscreteTransferFunction;") &&
    setupCopySection.includes("const plantVariable = isDiscretePlant ? 'z^-1' : 's';") &&
    setupCopySection.includes('`G(${symbolVariable}) =`') &&
    setupCopySection.includes('Discrete plant transfer function in z^-1 form') &&
    setupCopySection.includes('isDiscretePlant ? formatDelayPolyText(plantTf.num) : formatPolyText(plantTf.num, symbolVariable)') &&
    setupCopySection.includes('renderTransferFunctionEquation(`L(${symbolVariable}) =`, state.openLoop') &&
    setupCopySection.includes('renderTransferFunctionEquation(`T(${symbolVariable}) =`, state.closedLoop'),
  'system setup copy renders DTF plant and loop equations as G(z), L(z), and T(z)',
);

assert(
  setupCopySection.includes("renderTransferFunctionEquation('C(s) =', controllerTf") &&
    setupCopySection.includes("renderTransferFunctionEquation('Cc(s) =', compTfForDisplay"),
  'continuous PID and lead/lag helpers are not mislabeled as discrete controllers',
);

assert(
  discreteStepSection.includes("layout.showlegend = targetId === 'chart-active';") &&
    discreteStepSection.includes('if (layout.showlegend) layout.legend = compactLegend();') &&
    discreteStepSection.includes("name: 'Discrete Step'"),
  'active discrete step plot exposes a visible legend entry',
);

assert(
  sampleTimeSection.includes('function currentDiscreteSampleTime(tf = state.plant)') &&
    sampleTimeSection.includes('const sampleTime = Number(tf?.sampleTime ?? state.sampleTime);') &&
    sampleTimeSection.includes('return Number.isFinite(sampleTime) && sampleTime > 0 ? sampleTime : null;'),
  'DTF sample-time helper reads DiscreteTransferFunction.sampleTime with a validated state fallback',
);

assert(
  !appJs.includes('tf?.Ts ?? 0.1') &&
    codegenPayloadSection.includes("const Ts = state.domain === 'z' ? currentDiscreteSampleTime(tf) : null;") &&
    codegenPayloadSection.includes('plant: tf ? { num, den, sampleTime: Ts } : null') &&
    codegenPayloadSection.includes('Ts,'),
  'codegen payload preserves the active DTF sample time instead of defaulting to 0.1s',
);

assert(
  projectPayloadSection.includes('version: 2') &&
    projectPayloadSection.includes('domain: state.domain') &&
    projectPayloadSection.includes('sampleTime: dtfSampleTime') &&
    projectPayloadSection.includes('discreteTransferFunction:') &&
    projectPayloadSection.includes("document.getElementById('dtf-ts')?.value") &&
    projectApplySection.includes("data.systemType === 'dtf' || data.domain === 'z'") &&
    projectApplySection.includes("document.getElementById('dtf-num').value") &&
    projectApplySection.includes("document.getElementById('dtf-den').value") &&
    projectApplySection.includes("document.getElementById('dtf-ts').value = dtf.sampleTime ?? data.sampleTime ?? data.Ts ?? state.sampleTime;"),
  'project persistence round-trips DTF numerator, denominator, sample time, and system type',
);

assert(
  projectManagerSerializeSection.includes('...buildProjectPayload()') &&
    projectManagerSerializeSection.includes('projectManagerVersion: 2') &&
    !projectManagerSerializeSection.includes('plant:') &&
    projectManagerLoadSection.includes('if (d.transferFunction || d.discreteTransferFunction || d.stateSpace)') &&
    projectManagerLoadSection.includes('applyProjectPayload(d);') &&
    projectManagerLoadSection.includes('Array.isArray(d.plant?.num) && Array.isArray(d.plant?.den)') &&
    projectManagerLoadSection.includes("systemType: legacyDiscrete ? 'dtf' : 'tf'") &&
    projectManagerLoadSection.includes('sampleTime: legacyDiscrete ? d.plant.sampleTime : state.sampleTime'),
  'local multi-project manager reuses canonical project payload instead of serializing TF class instances',
);

assert(
  analysisExportSection.includes("const plantSampleTime = state.domain === 'z' ? currentDiscreteSampleTime(state.plant) : null;") &&
    analysisExportSection.includes('const effectiveSampleTime = isDiscrete ? currentDiscreteSampleTime(sys) : null;') &&
    analysisExportSection.includes('sampleTime: effectiveSampleTime') &&
    analysisExportSection.includes('sampleTime: plantSampleTime') &&
    markdownReportSection.includes('`- Sample time: ${payload.sampleTime}s`'),
  'analysis JSON and markdown exports retain DTF sample-time metadata',
);

assert(
  smokeSection.includes("diagnostics.effectiveLoopMode === 'closed_loop' && !diagnostics.closedLoopFormula") &&
    smokeSection.includes('/G\\((s|z)\\)/.test(diagnostics.equationText.system)') &&
    smokeSection.includes('/T\\((s|z)\\)/.test(diagnostics.equationText.loop)'),
  'smoke diagnostics distinguish effective open-loop state and accept s/z equation labels',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ UI formula contract — all checks passed');
