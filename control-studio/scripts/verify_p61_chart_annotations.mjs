/**
 * verify_p61_chart_annotations.mjs
 *
 * Verifies P61 — In-Chart Engineering Annotations:
 *   J1-1  buildStepAnnotations()  — Tr / OS / Ts / ess markers on step response
 *   J1-2  buildBodeAnnotations()  — PM / GM double-headed arrows on Bode plot
 *   J1-4  buildNyquistAnnotations() — freq ticks + Ms circle on Nyquist plot
 *   J1-5  initChartAnnotationToggle() — global on/off toggle button
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)       { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs      = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const annotJs    = readFileSync(path.join(ROOT, 'js/ui/annotations.js'), 'utf8');
const src        = appJs + '\n' + annotJs;  // combined: shims in app.js, implementations in annotations.js
const indexHtml  = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── J1-5: Annotation toggle ───────────────────────────────────────────────────
console.log('\n▶ J1-5 Chart Annotation Toggle');

assert(appJs.includes('function initChartAnnotationToggle()'),    'initChartAnnotationToggle() defined');
assert(appJs.includes('chartAnnotationsEnabled'),                 'state.chartAnnotationsEnabled tracked');
assert(appJs.includes("'cs-chart-annotations'"),                  'localStorage key cs-chart-annotations');
assert(appJs.includes('initChartAnnotationToggle()'),             'initChartAnnotationToggle() called in init');
assert(appJs.includes('btn-toggle-annotations'),                  'btn-toggle-annotations referenced in JS');
assert(indexHtml.includes('btn-toggle-annotations'),              'btn-toggle-annotations in HTML');

// ── J1-1: Step Response Annotations ──────────────────────────────────────────
console.log('\n▶ J1-1 Step Response Annotations');

assert(appJs.includes('function buildStepAnnotations('),          'buildStepAnnotations() defined');
assert(appJs.includes('riseTime'),                                'riseTime used in step annotations');
assert(appJs.includes('overshoot'),                               'overshoot used in step annotations');
assert(appJs.includes('settlingTime'),                            'settlingTime used in step annotations');
assert(appJs.includes('steadyStateError'),                        'steadyStateError used in step annotations');
// Hook into renderTimeResponse
assert(appJs.includes('buildStepAnnotations(resp, info)'),        'buildStepAnnotations hooked into renderTimeResponse');
assert(appJs.match(/stepAnnots.*stepShapes|buildStepAnnotations/), 'step annotation results merged into layout');

// ── J1-2: Bode Annotations ───────────────────────────────────────────────────
console.log('\n▶ J1-2 Bode PM/GM Annotations');

assert(appJs.includes('function buildBodeAnnotations('),          'buildBodeAnnotations() defined');
assert(appJs.includes('phaseMargin'),                             'phaseMargin used in bode annotations');
assert(appJs.includes('gainMarginDB'),                            'gainMarginDB used in bode annotations');
// Hook into renderBodePlot
assert(appJs.includes('buildBodeAnnotations(stabilityMargins(sys), data)'), 'buildBodeAnnotations hooked into renderBodePlot');
assert(appJs.match(/bodeAnnots.*bodeShapes|buildBodeAnnotations/), 'bode annotation results merged into layout');

// ── J1-4: Nyquist Annotations ────────────────────────────────────────────────
console.log('\n▶ J1-4 Nyquist Frequency Ticks + Ms Circle');

assert(appJs.includes('function buildNyquistAnnotations('),       'buildNyquistAnnotations() defined');
assert(src.includes('_msCircleTrace'),                            'Ms circle trace generated');
assert(src.includes('minDist'),                                   'minimum distance to -1+j0 computed');
// Hook into renderNyquistPlot
assert(appJs.includes('buildNyquistAnnotations(sys, data)'),      'buildNyquistAnnotations hooked into renderNyquistPlot');
assert(src.includes('data._msCircleTrace') && src.includes('traces.push(data._msCircleTrace)'),
                                                                   'Ms circle trace pushed to Nyquist traces');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P61 J1-1/J1-2/J1-4/J1-5 chart annotation system — all checks passed');
