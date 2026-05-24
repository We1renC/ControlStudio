/**
 * verify_p64_param_sweep.mjs
 *
 * Verifies P64 — Parameter Sweep Visualization:
 *   P1-1  Single parameter sweep (gradient color, async, progress)
 *   P1-2  2D Stability Map (Kp-Ki heatmap)
 *   P1-3  Bode animation (play/pause/reset/scrub)
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

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── P1-1: Single Parameter Sweep ──────────────────────────────────────────────
console.log('\n▶ P1-1 Single Parameter Sweep');

assert(appJs.includes('async function runParameterSweep('),   'runParameterSweep() async function defined');
assert(appJs.includes('function initParameterSweep()'),       'initParameterSweep() defined');
assert(appJs.includes('_sweepColor'),                         '_sweepColor() gradient helper defined');
assert(appJs.includes("scale === 'log'"),                     'log scale sweep implemented');
assert(appJs.includes("scale === 'linear'") || appJs.includes("linear"),
                                                              'linear scale sweep implemented');
assert(appJs.includes('Math.log10(maxVal / minVal)'),         'log spacing using Math.log10');
assert(appJs.includes('sweep-progress-fill'),                 'progress bar fill updated during sweep');
assert(appJs.includes('hovertemplate'),                       'hovertemplate with OS/Ts metrics');
assert(appJs.includes("await new Promise(r => setTimeout(r, 0))"),
                                                              'async yield to UI thread');
assert(appJs.includes('_sweepAbort'),                         'sweep abort flag for cancellation');
assert(appJs.includes('_sweepMode'),                          'state._sweepMode tracked');
assert(appJs.includes('sweep-exit-btn'),                      'exit sweep button bound');
assert(appJs.includes('data-sweep-param'),                    '[data-sweep-param] buttons delegated');
assert(appJs.includes('initSweepVisualization()'),            'initSweepVisualization() called in DOMContentLoaded');

// HTML
assert(indexHtml.includes('id="sweep-drawer"'),               '#sweep-drawer in HTML');
assert(indexHtml.includes('id="sweep-min"'),                  '#sweep-min input in HTML');
assert(indexHtml.includes('id="sweep-max"'),                  '#sweep-max input in HTML');
assert(indexHtml.includes('id="sweep-count"'),                '#sweep-count select in HTML');
assert(indexHtml.includes('id="sweep-run-btn"'),              '#sweep-run-btn in HTML');
assert(indexHtml.includes('id="sweep-cancel-btn"'),           '#sweep-cancel-btn in HTML');
assert(indexHtml.includes('id="sweep-exit-btn"'),             '#sweep-exit-btn in HTML');
assert(indexHtml.includes('id="sweep-progress-bar"'),         '#sweep-progress-bar in HTML');
assert(indexHtml.includes('id="sweep-progress-fill"'),        '#sweep-progress-fill in HTML');
assert(indexHtml.includes('data-sweep-param="Kp"'),           'Kp sweep button in HTML');
assert(indexHtml.includes('data-sweep-param="Ki"'),           'Ki sweep button in HTML');
assert(indexHtml.includes('data-sweep-param="Kd"'),           'Kd sweep button in HTML');
// CSS
assert(indexHtml.includes('#sweep-drawer'),                   '#sweep-drawer CSS defined');
assert(indexHtml.includes('@keyframes slideDown'),             'slideDown animation defined');
assert(indexHtml.includes('#sweep-progress-bar'),             '#sweep-progress-bar CSS defined');

// ── P1-2: 2D Stability Map ────────────────────────────────────────────────────
console.log('\n▶ P1-2 2D Stability Map');

assert(appJs.includes('async function computeStabilityMap('), 'computeStabilityMap() async defined');
assert(appJs.includes('async function renderStabilityMap('),  'renderStabilityMap() async defined');
assert(appJs.includes("type: 'heatmap'"),                    'Plotly heatmap used');
assert(appJs.includes('colorscale'),                          'colorscale for stable/unstable colors');
assert(appJs.includes("'stability-map'"),                     "stability-map plotType referenced");
assert(appJs.includes('cs:plot-changed'),                     'cs:plot-changed event for stability map');

// HTML
assert(indexHtml.includes('data-plot="stability-map"'),       'stability-map plot tab in HTML');

// ── P1-3: Bode Animation ──────────────────────────────────────────────────────
console.log('\n▶ P1-3 Bode Animation');

assert(appJs.includes('function initBodeAnimation()'),        'initBodeAnimation() defined');
assert(appJs.includes('_bodeAnimRunning'),                    '_bodeAnimRunning flag');
assert(appJs.includes('_bodeAnimFrame'),                      '_bodeAnimFrame for rAF tracking');
assert(appJs.includes('requestAnimationFrame'),               'requestAnimationFrame used for animation');
assert(appJs.includes('function _stopBodeAnim()'),            '_stopBodeAnim() defined');
assert(appJs.includes('cancelAnimationFrame'),                'cancelAnimationFrame on pause/stop');
assert(appJs.includes('bode-anim-play'),                      'play button bound');
assert(appJs.includes('bode-anim-pause'),                     'pause button bound');
assert(appJs.includes('bode-anim-reset'),                     'reset button bound');
assert(appJs.includes('bode-anim-scrub'),                     'scrub slider bound');
assert(appJs.includes('bode-anim-speed'),                     'speed control referenced');

// HTML
assert(indexHtml.includes('id="btn-bode-animate"'),           '#btn-bode-animate button in HTML');
assert(indexHtml.includes('id="bode-anim-panel"'),            '#bode-anim-panel in HTML');
assert(indexHtml.includes('id="bode-anim-play"'),             '#bode-anim-play button in HTML');
assert(indexHtml.includes('id="bode-anim-pause"'),            '#bode-anim-pause button in HTML');
assert(indexHtml.includes('id="bode-anim-reset"'),            '#bode-anim-reset button in HTML');
assert(indexHtml.includes('id="bode-anim-scrub"'),            '#bode-anim-scrub slider in HTML');
assert(indexHtml.includes('id="bode-anim-speed"'),            '#bode-anim-speed select in HTML');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P64 P1-1/P1-2/P1-3 parameter sweep visualization — all checks passed');
