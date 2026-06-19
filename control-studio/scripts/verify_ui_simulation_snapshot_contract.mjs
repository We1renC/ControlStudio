/**
 * verify_ui_simulation_snapshot_contract.mjs
 *
 * Guards the UI simulation-state contract:
 * - Active time-domain charts must publish the same response used by summary,
 *   warnings, and HIL CSV export.
 * - Companion charts must not overwrite the active simulation snapshot.
 * - HIL export must receive an explicit input trace, not a stale unit-step fallback.
 * - Discrete plant updates must clear incompatible continuous loop state and
 *   refresh the analysis snapshot even when the active plot is not time-domain.
 * - Runtime mode labels must describe the effective model, not only the closed-loop toggle.
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

function assertRegex(src, regex, label) {
  assert(regex.test(src), label, `missing ${regex}`);
}

function sectionBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return '';
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? src.slice(start) : src.slice(start, end);
}

const appJs = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const inputTraceSection = sectionBetween(appJs, 'function buildSimulationInputTrace', 'function simulationStepInfo');
const snapshotSection = sectionBetween(appJs, 'function buildSimulationSnapshot', 'function publishSimulationSnapshot');
const publisherSection = sectionBetween(appJs, 'function publishSimulationSnapshot', 'function stabilityGainMarginDB');
const stabilitySection = sectionBetween(appJs, 'function updateStabilityPanel', 'function scheduleApiAnalysis');
const timeResponseSection = sectionBetween(appJs, 'function renderTimeResponse', 'function renderBodePlot');
const discreteStepSection = sectionBetween(appJs, 'function renderDiscreteStepChart', 'function updateDomainUI');
const discreteLoopClearSection = sectionBetween(appJs, 'function clearContinuousLoopStateForDiscretePlant', 'function saveSessionToStorage');
const effectiveLoopModeSection = sectionBetween(appJs, 'function hasEffectiveClosedLoop', 'function saveSessionToStorage');
const updateSystemSection = sectionBetween(appJs, 'function updateSystem', 'function setFieldError');
const codegenSection = sectionBetween(appJs, 'function buildCodegenPayload', 'function renderAllLatexFractions');
const apiPayloadSection = sectionBetween(appJs, 'function buildAnalysisRequestPayload', 'function scheduleApiAnalysis');
const comparisonSnapshotSection = sectionBetween(appJs, 'function saveComparisonSnapshot', 'function clearSnapshots');
const analysisExportSection = sectionBetween(appJs, 'function buildCurrentAnalysisExport', 'function exportCurrentResult');
const aiAdvisorSection = sectionBetween(appJs, 'async function requestAIAdvice', 'function renderMarkdown');
const statusSection = sectionBetween(appJs, 'function updateGlobalStatusBar', 'function _identityMatrixText');
const hilSection = sectionBetween(appJs, 'function exportHILCSV', 'function initHILExport');

console.log('\n▶ UI simulation snapshot contract');

assertRegex(
  appJs,
  /_lastSimResult:\s*null/,
  'app state initializes _lastSimResult',
);

assert(
  inputTraceSection.includes('const commandInput =') &&
    inputTraceSection.includes('const disturbanceInput =') &&
    inputTraceSection.includes("responseType === 'impulse'") &&
    inputTraceSection.includes('commandInput[0] = Number.isFinite(dt) && dt > 0 ? amplitude / dt : amplitude;') &&
    inputTraceSection.includes('const u = commandInput.map((value, idx) => value + disturbanceInput[idx])') &&
    inputTraceSection.includes('return { commandInput, disturbanceInput, u };'),
  'snapshot builder records command, disturbance, impulse, and net input traces',
);

assert(
  [
    'responseType',
    'mode:',
    'domain:',
    'targetId',
    't:',
    'y,',
    'u:',
    'commandInput:',
    'disturbanceInput:',
    'settleTime:',
    'settlingTime:',
    'steadyStateError:',
    'validMetrics:',
  ].every((needle) => snapshotSection.includes(needle)),
  'snapshot includes response, input, metric, and provenance fields',
);

assert(
  effectiveLoopModeSection.includes('return Boolean(state.showClosedLoop && state.closedLoop);') &&
    effectiveLoopModeSection.includes("return hasEffectiveClosedLoop() ? 'closed_loop' : 'open_loop';") &&
    effectiveLoopModeSection.includes('return hasEffectiveClosedLoop() ? state.closedLoop : state.plant;'),
  'effective loop helpers require an actual closed-loop model before reporting closed_loop',
);

assert(
  publisherSection.includes("if (targetId !== 'chart-active' && options.allowNonChartSnapshot !== true) return;") &&
    publisherSection.includes('state._lastSimResult = buildSimulationSnapshot(response, info, sys, targetId, options);') &&
    publisherSection.includes("document.dispatchEvent(new CustomEvent('simulation:done', { detail: state._lastSimResult }));"),
  'publisher updates _lastSimResult and gates non-chart snapshot sources explicitly',
);

assert(
  stabilitySection.includes('state._lastStability = buildLastStabilitySnapshot(stability, margins);') &&
    stabilitySection.includes("publishSimulationSnapshot(resp, 'analysis-state', sys,") &&
    stabilitySection.includes('allowNonChartSnapshot: true') &&
    stabilitySection.includes("source: 'stability-panel'") &&
    stabilitySection.includes("responseType: isDiscrete ? 'step' : state.responseType") &&
    stabilitySection.includes("domain: isDiscrete ? 'z' : state.domain") &&
    stabilitySection.includes('mode: effectiveLoopMode()') &&
    stabilitySection.includes('stepInfo: info'),
  'stability/metrics refresh publishes current simulation snapshot for non-time active plots',
);

assert(
  timeResponseSection.includes('const resp = currentResponseData(sys);') &&
    timeResponseSection.includes("name: effectiveLoopMode() === 'closed_loop' ? 'Closed-loop response' : 'Plant response'") &&
    timeResponseSection.includes('hasEffectiveClosedLoop()') &&
    timeResponseSection.includes('Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });') &&
    timeResponseSection.includes('publishSimulationSnapshot(resp, targetId, sys);'),
  'continuous active time-response publishes plotted response snapshot with effective loop labels',
);

assert(
  discreteStepSection.includes('const data = discreteStepResponse(sys,') &&
    discreteStepSection.includes('Plotly.react(targetId, [trace], layout, { responsive: true, displayModeBar: false });') &&
    discreteStepSection.includes('publishSimulationSnapshot(data, targetId, sys,') &&
    discreteStepSection.includes("responseType: 'step'") &&
    discreteStepSection.includes("domain: 'z'") &&
    discreteStepSection.includes("mode: 'open_loop'") &&
    discreteStepSection.includes('stepInfo: stepInfo(data.t, data.y, null, amplitude)') &&
    discreteStepSection.includes("if (targetId === 'chart-active')") &&
    discreteStepSection.includes("updateActivePlotHeader("),
  'discrete step chart publishes active simulation snapshot and only active chart updates header',
);

assert(
  discreteLoopClearSection.includes('state.controller = null;') &&
    discreteLoopClearSection.includes('state.openLoop = null;') &&
    discreteLoopClearSection.includes('state.closedLoop = null;') &&
    discreteLoopClearSection.includes('state.twoDof = null;') &&
    discreteLoopClearSection.includes('state._lastStability = null;') &&
    discreteLoopClearSection.includes('state._lastSimResult = null;') &&
    updateSystemSection.includes('state.plant = new DiscreteTransferFunction(num, den, Ts);') &&
    updateSystemSection.includes('clearContinuousLoopStateForDiscretePlant();') &&
    updateSystemSection.includes('refreshAllCharts();') &&
    updateSystemSection.includes('updateStabilityPanel();'),
  'discrete plant updates clear continuous loop state and refresh analysis snapshot',
);

assert(
  snapshotSection.includes('mode: options.mode ?? effectiveLoopMode()') &&
    codegenSection.includes("closedLoop: effectiveLoopMode() === 'closed_loop'") &&
    apiPayloadSection.includes('mode: effectiveLoopMode()') &&
    comparisonSnapshotSection.includes('const sys = effectiveLoopSystem();') &&
    comparisonSnapshotSection.includes('mode: effectiveLoopMode()') &&
    analysisExportSection.includes('const sys = effectiveLoopSystem();') &&
    analysisExportSection.includes('mode: effectiveLoopMode()') &&
    aiAdvisorSection.includes('const sys = effectiveLoopSystem();') &&
    aiAdvisorSection.includes('mode: effectiveLoopMode()') &&
    aiAdvisorSection.includes("closedLoop: effectiveLoopMode() === 'closed_loop'") &&
    statusSection.includes("effectiveLoopMode() === 'closed_loop' ? 'Closed loop' : 'Open loop'"),
  'runtime exports, API payloads, advisor requests, snapshots, and status bar use effective loop mode',
);

assert(
  hilSection.includes('const simResult = state._lastSimResult;') &&
    hilSection.includes('const us  = simResult.u') &&
    hilSection.includes('time_s,input_u,output_y'),
  'HIL CSV export consumes _lastSimResult input/output traces',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ UI simulation snapshot contract — all checks passed');
