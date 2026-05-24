/**
 * verify_p63_measure_tools.mjs
 *
 * Verifies P63 — Chart Measurement Tools:
 *   L1-1  Delta measurement cursor (Δ button + M key + state machine)
 *   L1-2  Linked crosshair (cross-chart hover sync)
 *   L1-3  Chart annotation pins (dblclick + localStorage)
 *
 * Implementation lives in js/ui/measurement.js (P34-01 module split).
 * App wiring (DOMContentLoaded, refreshAllCharts) remains in app.js.
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

const appJs        = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const measurementJs = readFileSync(path.join(ROOT, 'js/ui/measurement.js'), 'utf8');
const src          = appJs + '\n' + measurementJs;  // combined
const indexHtml    = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── L1-1: Delta Cursor ────────────────────────────────────────────────────────
console.log('\n▶ L1-1 Delta Measurement Cursor');

assert(src.includes('const _deltaCursor'),                    '_deltaCursor state object defined');
assert(src.includes('function initDeltaCursor()'),            'initDeltaCursor() defined');
assert(src.includes('function computeDeltaMeasurement('),     'computeDeltaMeasurement() defined');
assert(src.includes('function _clearDeltaMeasurement()'),     '_clearDeltaMeasurement() defined');
assert(src.includes('function _renderDeltaPanel('),           '_renderDeltaPanel() defined');
assert(src.includes("'point_a'"),                             "state machine: 'point_a' mode");
assert(src.includes("'point_b'"),                             "state machine: 'point_b' mode");
assert(src.includes("'showing'"),                             "state machine: 'showing' mode");
assert(src.includes('plotly_click'),                          'plotly_click event bound');
assert(src.includes("e.key === 'm' || e.key === 'M'"),        'M key shortcut bound');
assert(src.includes("e.key === 'Backspace'"),                 'Backspace to reset B point');
assert(src.includes("'bode-magnitude'") || src.includes("plotType === 'bode'"),
                                                              'bode slope calculation branch');
assert(src.includes('Math.log10'),                            'log10 used for Bode decade calculation');
assert(src.includes('dB/dec'),                                'slope label mentions dB/dec');
assert(appJs.includes('initMeasurementTools()'),              'initMeasurementTools() called in DOMContentLoaded');

// HTML
assert(indexHtml.includes('id="btn-delta-cursor"'),           '#btn-delta-cursor button in HTML');
assert(indexHtml.includes('id="delta-panel"'),                '#delta-panel in HTML');
assert(indexHtml.includes('id="delta-panel-close"'),          'delta-panel-close button in HTML');
assert(indexHtml.includes('id="delta-clear-btn"'),            'delta-clear-btn in HTML');
assert(indexHtml.includes('id="delta-copy-btn"'),             'delta-copy-btn in HTML');
assert(indexHtml.includes('id="delta-panel-rows"'),           'delta-panel-rows in HTML');

// CSS
assert(indexHtml.includes('.delta-mode-active'),              '.delta-mode-active CSS defined');
assert(indexHtml.includes('#delta-panel'),                    '#delta-panel CSS defined');

// ── L1-2: Linked Crosshair ────────────────────────────────────────────────────
console.log('\n▶ L1-2 Linked Crosshair');

assert(src.includes('function initLinkedCrosshair()'),        'initLinkedCrosshair() defined');
assert(src.includes('_linkedCrosshairEnabled'),               '_linkedCrosshairEnabled flag');
assert(src.includes('plotly_hover'),                          'plotly_hover event bound');
assert(src.includes('plotly_unhover'),                        'plotly_unhover event bound');
assert(src.includes('_clearLinkedCrosshair'),                 '_clearLinkedCrosshair() defined');
assert(src.includes('_crosshair'),                            '_crosshair marker flag on shapes');
assert(src.includes('function initMeasurementTools()'),       'initMeasurementTools() aggregates all inits');

// HTML
assert(indexHtml.includes('id="btn-linked-crosshair"'),       '#btn-linked-crosshair button in HTML');

// ── L1-3: Annotation Pins ─────────────────────────────────────────────────────
console.log('\n▶ L1-3 Chart Annotation Pins');

assert(src.includes('function initAnnotationPins()'),         'initAnnotationPins() defined');
assert(src.includes('function _applyChartPins(') || src.includes('export function _applyChartPins('),
                                                              '_applyChartPins() defined');
assert(src.includes('_CHART_PINS_KEY'),                       '_CHART_PINS_KEY localStorage key');
assert(src.includes('_PIN_MAX'),                              '_PIN_MAX limit defined');
assert(src.includes('plotly_doubleclick'),                    'plotly_doubleclick event bound');
assert(src.includes('chart-pin-input'),                       'chart-pin-input textarea class');
assert(src.includes('_getPinsForPlot'),                       '_getPinsForPlot() load helper');
assert(src.includes('_savePinsForPlot'),                      '_savePinsForPlot() save helper');
assert(src.includes("'◆'") || src.includes("'📌'") || src.includes('_pin'),
                                                              'pin marker icon or flag used in pin annotation');
assert(appJs.includes('_applyChartPins') || appJs.includes('_applyChartPinsM'),
                                                              'pins restored in refreshAllCharts');

// HTML
assert(indexHtml.includes('id="chart-pin-layer"'),            '#chart-pin-layer container in HTML');
// CSS
assert(indexHtml.includes('.chart-pin-input'),                '.chart-pin-input CSS defined');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P63 L1-1/L1-2/L1-3 chart measurement tools — all checks passed');
