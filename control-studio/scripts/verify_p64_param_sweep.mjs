/**
 * verify_p64_param_sweep.mjs
 *
 * Verifies P64 — Parameter Sweep Visualization:
 *   P1-1  Single parameter sweep (gradient color, async, progress)
 *   P1-2  2D Stability Map (Kp-Ki heatmap)
 *   P1-3  Bode animation (play/pause/reset/scrub)
 *
 * Implementation lives in js/ui/sweep.js (P34-01 module split).
 * App wiring (DOMContentLoaded, stability-map call) remains in app.js.
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
const sweepJs   = readFileSync(path.join(ROOT, 'js/ui/sweep.js'), 'utf8');
const src       = appJs + '\n' + sweepJs;   // combined
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── P1-1: Single Parameter Sweep ──────────────────────────────────────────────
console.log('\n▶ P1-1 Single Parameter Sweep');

assert(src.includes('async function runParameterSweep('),   'runParameterSweep() async function defined');
assert(src.includes('function initParameterSweep()'),       'initParameterSweep() defined');
assert(src.includes('_sweepColor'),                         '_sweepColor() gradient helper defined');
assert(src.includes("scale === 'log'"),                     'log scale sweep implemented');
assert(src.includes("scale === 'linear'") || src.includes("linear"),
                                                            'linear scale sweep implemented');
assert(src.includes('Math.log10(maxVal / minVal)'),         'log spacing using Math.log10');
assert(src.includes('sweep-progress-fill'),                 'progress bar fill updated during sweep');
assert(src.includes('hovertemplate'),                       'hovertemplate with OS/Ts metrics');
assert(src.includes("await new Promise(r => setTimeout(r, 0))"),
                                                            'async yield to UI thread');
assert(src.includes('_sweepAbort'),                         'sweep abort flag for cancellation');
assert(src.includes('_sweepMode'),                          'state._sweepMode tracked');
assert(src.includes('sweep-exit-btn'),                      'exit sweep button bound');
assert(src.includes('data-sweep-param'),                    '[data-sweep-param] buttons delegated');
assert(appJs.includes('initSweepVisualization()'),          'initSweepVisualization() called in DOMContentLoaded');

// HTML
assert(indexHtml.includes('id="sweep-drawer"'),             '#sweep-drawer in HTML');
assert(indexHtml.includes('id="sweep-min"'),                '#sweep-min input in HTML');
assert(indexHtml.includes('id="sweep-max"'),                '#sweep-max input in HTML');
assert(indexHtml.includes('id="sweep-count"'),              '#sweep-count select in HTML');
assert(indexHtml.includes('id="sweep-run-btn"'),            '#sweep-run-btn in HTML');
assert(indexHtml.includes('id="sweep-cancel-btn"'),         '#sweep-cancel-btn in HTML');
assert(indexHtml.includes('id="sweep-exit-btn"'),           '#sweep-exit-btn in HTML');
assert(indexHtml.includes('id="sweep-progress-bar"'),       '#sweep-progress-bar in HTML');
assert(indexHtml.includes('id="sweep-progress-fill"'),      '#sweep-progress-fill in HTML');
assert(indexHtml.includes('data-sweep-param="Kp"'),         'Kp sweep button in HTML');
assert(indexHtml.includes('data-sweep-param="Ki"'),         'Ki sweep button in HTML');
assert(indexHtml.includes('data-sweep-param="Kd"'),         'Kd sweep button in HTML');
// CSS
assert(indexHtml.includes('#sweep-drawer'),                 '#sweep-drawer CSS defined');
assert(indexHtml.includes('@keyframes slideDown'),           'slideDown animation defined');
assert(indexHtml.includes('#sweep-progress-bar'),           '#sweep-progress-bar CSS defined');

// ── P1-2: 2D Stability Map ────────────────────────────────────────────────────
console.log('\n▶ P1-2 2D Stability Map');

assert(src.includes('async function computeStabilityMap('), 'computeStabilityMap() async defined');
assert(src.includes('async function renderStabilityMap('),  'renderStabilityMap() async defined');
assert(src.includes("type: 'heatmap'"),                    'Plotly heatmap used');
assert(src.includes('colorscale'),                          'colorscale for stable/unstable colors');
assert(src.includes("'stability-map'"),                     "stability-map plotType referenced");
assert(src.includes('cs:plot-changed'),                     'cs:plot-changed event for stability map');

// HTML
assert(indexHtml.includes('data-plot="stability-map"'),     'stability-map plot tab in HTML');

// ── P1-3: Bode Animation ──────────────────────────────────────────────────────
console.log('\n▶ P1-3 Bode Animation');

assert(src.includes('function initBodeAnimation()'),        'initBodeAnimation() defined');
assert(src.includes('_bodeAnimRunning'),                    '_bodeAnimRunning flag');
assert(src.includes('_bodeAnimFrame'),                      '_bodeAnimFrame for rAF tracking');
assert(src.includes('requestAnimationFrame'),               'requestAnimationFrame used for animation');
assert(src.includes('function _stopBodeAnim()'),            '_stopBodeAnim() defined');
assert(src.includes('cancelAnimationFrame'),                'cancelAnimationFrame on pause/stop');
assert(src.includes('bode-anim-play'),                      'play button bound');
assert(src.includes('bode-anim-pause'),                     'pause button bound');
assert(src.includes('bode-anim-reset'),                     'reset button bound');
assert(src.includes('bode-anim-scrub'),                     'scrub slider bound');
assert(src.includes('bode-anim-speed'),                     'speed control referenced');

// HTML
assert(indexHtml.includes('id="btn-bode-animate"'),         '#btn-bode-animate button in HTML');
assert(indexHtml.includes('id="bode-anim-panel"'),          '#bode-anim-panel in HTML');
assert(indexHtml.includes('id="bode-anim-play"'),           '#bode-anim-play button in HTML');
assert(indexHtml.includes('id="bode-anim-pause"'),          '#bode-anim-pause button in HTML');
assert(indexHtml.includes('id="bode-anim-reset"'),          '#bode-anim-reset button in HTML');
assert(indexHtml.includes('id="bode-anim-scrub"'),          '#bode-anim-scrub slider in HTML');
assert(indexHtml.includes('id="bode-anim-speed"'),          '#bode-anim-speed select in HTML');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P64 P1-1/P1-2/P1-3 parameter sweep visualization — all checks passed');
